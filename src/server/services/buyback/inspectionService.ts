import { prisma, type Condition } from "@/lib/db/client";
import {
  InvalidStateTransitionError,
  ValidationFailedError,
} from "@/lib/errors";
import type { Actor } from "@/lib/permissions/permissionService";
import { requirePermission } from "@/lib/permissions/permissionService";
import { effectiveUnitPriceMinor } from "@/server/domain/pricing/effectivePrice";
import { assertBuybackTransition } from "@/server/domain/buyback/stateMachine";
import { calculateFinalValue } from "@/server/domain/buyback/valuation";
import * as buybackRepo from "@/server/repositories/buyback/buybackRepository";
import * as inventoryService from "@/server/services/inventory/inventoryService";
import {
  inventoryLevelFromAvailableCount,
  toRuleInput,
} from "@/server/services/buyback/ruleHelpers";

export interface RecordInspectionInput {
  buybackItemId: string;
  receivedQuantity: number;
  expectedQuantity: number;
  observedCondition: Condition;
  defects?: string[];
  missingParts?: string[];
  inspectionPhotos?: string[];
  // BUYBACK.md §5: the auto-computed proposedValueMinor is overridable
  // but only with a required justification note.
  overrideValueMinor?: number;
  overrideJustification?: string;
}

/**
 * One item's inspection outcome (BUYBACK.md §5). Re-runs
 * BuybackValuationService with the *observed* condition (never the
 * customer's declared one); discrepancyFlag/discrepancyNotes are set
 * whenever they differ, feeding TrustScore/fraud signals rather than
 * being silently discarded (brief §36). Once every item on the request
 * has been inspected, the request auto-advances INSPECTION -> VALUATION
 * (still gated behind a human buyback.approve step before the customer
 * ever sees the number - see approveValuation).
 */
export async function recordInspection(
  actor: Actor,
  input: RecordInspectionInput,
): Promise<void> {
  await requirePermission(actor, "buyback.inspect");

  if (input.overrideValueMinor !== undefined && !input.overrideJustification) {
    throw new ValidationFailedError(
      "Une justification est requise pour modifier la valeur proposée par le calcul automatique.",
    );
  }

  const item = await buybackRepo.findItemById(input.buybackItemId);
  if (!item) {
    throw new ValidationFailedError("Article de rachat introuvable.");
  }
  if (item.request.status !== "INSPECTION") {
    throw new InvalidStateTransitionError(
      "Cette demande n'est pas en attente d'inspection.",
    );
  }
  if (item.inspection) {
    throw new ValidationFailedError("Cet article a déjà été inspecté.");
  }

  const product = item.productVariant.product;
  const rule = await buybackRepo.findActiveRuleForCategory(product.categoryId);
  if (!rule) {
    throw new ValidationFailedError(
      "Aucune règle de rachat active pour cette catégorie.",
    );
  }

  const originalPriceMinor = item.originalOrderItemId
    ? ((await buybackRepo.findOwnedOrderItemUnitPrice(
        item.originalOrderItemId,
        item.request.userId,
      )) ?? effectiveUnitPriceMinor(item.productVariant, product))
    : effectiveUnitPriceMinor(item.productVariant, product);

  const availableCount = await inventoryService.getAvailableCount(
    item.productVariantId,
  );
  const inventoryLevel = inventoryLevelFromAvailableCount(availableCount);

  const computedValueMinor = calculateFinalValue({
    originalPriceMinor,
    observedCondition: input.observedCondition,
    inventoryLevel,
    rule: toRuleInput(rule),
  });

  const proposedValueMinor = input.overrideValueMinor ?? computedValueMinor;
  const discrepancyFlag = input.observedCondition !== item.declaredCondition;
  const discrepancyNotes = discrepancyFlag
    ? `Déclaré : ${item.declaredCondition}, observé : ${input.observedCondition}.${
        input.overrideJustification ? ` ${input.overrideJustification}` : ""
      }`
    : (input.overrideJustification ?? null);

  await prisma.$transaction(async (tx) => {
    await buybackRepo.createInspectionInTx(tx, {
      buybackItemId: item.id,
      inspectorId: actor.id,
      receivedQuantity: input.receivedQuantity,
      expectedQuantity: input.expectedQuantity,
      declaredCondition: item.declaredCondition,
      observedCondition: input.observedCondition,
      defects: input.defects ?? [],
      missingParts: input.missingParts ?? [],
      inspectionPhotos: input.inspectionPhotos ?? [],
      proposedValueMinor,
      discrepancyFlag,
      discrepancyNotes,
    });

    await buybackRepo.updateItemInTx(tx, item.id, {
      finalValueMinor: proposedValueMinor,
    });

    const refreshedRequest = await buybackRepo.findRequestByIdInTx(
      tx,
      item.requestId,
    );
    const allInspected = refreshedRequest.items.every(
      (requestItem) => requestItem.inspection !== null,
    );
    if (allInspected) {
      assertBuybackTransition("INSPECTION", "VALUATION");
      await buybackRepo.updateRequestStatusInTx(
        tx,
        item.requestId,
        "VALUATION",
      );
    }
  });
}

/**
 * The buyback.approve gate (SECURITY.md §2/BUYBACK.md §7): a human
 * reviews the computed valuations before the customer ever sees a
 * definitive number. VALUATION -> CUSTOMER_CONFIRMATION. Records the
 * approver so it can become the Payout's preparedById once the
 * customer accepts (maker-checker's "maker" half).
 */
export async function approveValuation(
  actor: Actor,
  requestId: string,
): Promise<void> {
  await requirePermission(actor, "buyback.approve");

  const request = await buybackRepo.findRequestById(requestId);
  if (!request) {
    throw new ValidationFailedError("Demande de rachat introuvable.");
  }
  assertBuybackTransition(request.status, "CUSTOMER_CONFIRMATION");

  const allInspected = request.items.every((item) => item.inspection !== null);
  if (!allInspected) {
    throw new ValidationFailedError(
      "Tous les articles doivent être inspectés avant de valider l'estimation.",
    );
  }

  await prisma.$transaction((tx) =>
    buybackRepo.updateRequestStatusInTx(
      tx,
      requestId,
      "CUSTOMER_CONFIRMATION",
      {
        valuationApprovedBy: { connect: { id: actor.id } },
      },
    ),
  );
}

export async function getValuationApprovalQueue(
  actor: Actor,
): Promise<buybackRepo.BuybackRequestWithDetails[]> {
  await requirePermission(actor, "buyback.approve");
  return buybackRepo.listRequestsAwaitingValuationApproval();
}
