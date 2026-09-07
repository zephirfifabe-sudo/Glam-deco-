import { prisma, type Condition } from "@/lib/db/client";
import {
  InvalidStateTransitionError,
  UnauthorizedError,
  ValidationFailedError,
} from "@/lib/errors";
import type { Actor } from "@/lib/permissions/permissionService";
import { requirePermission } from "@/lib/permissions/permissionService";
import { effectiveUnitPriceMinor } from "@/server/domain/pricing/effectivePrice";
import {
  assertBuybackTransition,
  deriveRequestStatusFromItems,
} from "@/server/domain/buyback/stateMachine";
import { estimatePreEstimateRange } from "@/server/domain/buyback/valuation";
import * as buybackRepo from "@/server/repositories/buyback/buybackRepository";
import * as payoutRepo from "@/server/repositories/buyback/payoutRepository";
import * as orderRepo from "@/server/repositories/orders/orderRepository";
import * as addressRepo from "@/server/repositories/identity/addressRepository";
import * as inventoryService from "@/server/services/inventory/inventoryService";
import {
  inventoryLevelFromAvailableCount,
  toRuleInput,
} from "@/server/services/buyback/ruleHelpers";

export interface SubmitBuybackItemInput {
  productVariantId: string;
  declaredCondition: Condition;
  declaredNotes?: string;
  customerPhotos?: string[];
  originalOrderItemId?: string;
}

/**
 * Adds one item to the customer's currently-open buyback request,
 * creating that request (and immediately advancing it DRAFT ->
 * SUBMITTED -> PRE_ESTIMATE, per BUYBACK.md §1) the first time this is
 * called. Eligibility (BUYBACK.md §3) is checked per item: no active
 * BuybackRule for the category, or a personalized product that hasn't
 * been given an explicit exception, both fail closed rather than
 * silently accepting an unpriced item.
 */
export async function addItemToBuybackRequest(
  userId: string,
  input: SubmitBuybackItemInput,
): Promise<buybackRepo.BuybackRequestWithDetails> {
  const variant = await buybackRepo.findVariantForEligibility(
    input.productVariantId,
  );
  if (!variant) {
    throw new ValidationFailedError("Article introuvable.");
  }
  const product = variant.product;

  if (
    product.personalizationRequired &&
    !product.personalizationBuybackEligible
  ) {
    throw new ValidationFailedError(
      `« ${product.title} » n'est pas éligible au rachat (article personnalisé).`,
    );
  }

  const rule = await buybackRepo.findActiveRuleForCategory(product.categoryId);
  if (!rule) {
    throw new ValidationFailedError(
      `« ${product.title} » n'est pas éligible au rachat pour le moment.`,
    );
  }

  const openRequest = await buybackRepo.findOpenRequestForUser(userId);
  const currentCategoryCount = openRequest
    ? openRequest.items.filter(
        (item) => item.productVariant.product.categoryId === product.categoryId,
      ).length
    : 0;
  if (currentCategoryCount + 1 > rule.maxQuantityPerRequest) {
    throw new ValidationFailedError(
      `Vous ne pouvez pas soumettre plus de ${rule.maxQuantityPerRequest} article(s) de cette catégorie en une seule demande.`,
    );
  }

  const originalPriceMinor = input.originalOrderItemId
    ? ((await buybackRepo.findOwnedOrderItemUnitPrice(
        input.originalOrderItemId,
        userId,
      )) ?? effectiveUnitPriceMinor(variant, product))
    : effectiveUnitPriceMinor(variant, product);

  const availableCount = await inventoryService.getAvailableCount(
    input.productVariantId,
  );
  const inventoryLevel = inventoryLevelFromAvailableCount(availableCount);

  const { preEstimateMinMinor, preEstimateMaxMinor } = estimatePreEstimateRange(
    {
      originalPriceMinor,
      declaredCondition: input.declaredCondition,
      inventoryLevel,
      rule: toRuleInput(rule),
    },
  );

  const newItem: buybackRepo.NewBuybackItemInput = {
    productVariantId: input.productVariantId,
    declaredCondition: input.declaredCondition,
    declaredNotes: input.declaredNotes ?? null,
    customerPhotos: input.customerPhotos ?? [],
    originalOrderItemId: input.originalOrderItemId ?? null,
    preEstimateMinMinor,
    preEstimateMaxMinor,
  };

  return prisma.$transaction(async (tx) => {
    if (!openRequest) {
      const created = await buybackRepo.createRequestWithItemsInTx(
        tx,
        userId,
        null,
        [newItem],
      );
      assertBuybackTransition("DRAFT", "SUBMITTED");
      await buybackRepo.updateRequestStatusInTx(tx, created.id, "SUBMITTED", {
        submittedAt: new Date(),
      });
      assertBuybackTransition("SUBMITTED", "PRE_ESTIMATE");
      await buybackRepo.updateRequestStatusInTx(tx, created.id, "PRE_ESTIMATE");
      return buybackRepo.findRequestByIdInTx(tx, created.id);
    }

    await buybackRepo.addItemToRequestInTx(tx, openRequest.id, newItem);
    return buybackRepo.findRequestByIdInTx(tx, openRequest.id);
  });
}

/**
 * The customer is done adding items and is shipping the parcel back -
 * PRE_ESTIMATE -> AWAITING_SHIPMENT (BUYBACK.md §1). Ownership is
 * checked directly (not requireOwnerOrPermission) because this action
 * has no staff-override path: only the requester ever confirms their
 * own shipment.
 */
export async function confirmShipment(
  userId: string,
  requestId: string,
  addressId: string,
): Promise<void> {
  const request = await buybackRepo.findRequestById(requestId);
  if (!request) {
    throw new ValidationFailedError("Demande de rachat introuvable.");
  }
  if (request.userId !== userId) {
    throw new UnauthorizedError();
  }
  if (request.items.length === 0) {
    throw new ValidationFailedError(
      "Ajoutez au moins un article avant de confirmer l'expédition.",
    );
  }
  assertBuybackTransition(request.status, "AWAITING_SHIPMENT");

  await prisma.$transaction((tx) =>
    buybackRepo.updateRequestStatusInTx(tx, requestId, "AWAITING_SHIPMENT", {
      address: { connect: { id: addressId } },
    }),
  );
}

/**
 * Warehouse staff mark a shipment physically received (brief scope:
 * gated on inventory.write, the same permission WAREHOUSE already
 * holds for other stock-intake actions - there is no separate
 * "buyback.receive" permission). AWAITING_SHIPMENT -> RECEIVED ->
 * INSPECTION happen together: nothing customer-facing gates between
 * the two, so one warehouse action puts the request straight into the
 * inspection queue.
 *
 * Creates one InventoryItem per BuybackItem right now, in status
 * INSPECTION / condition PENDING_INSPECTION (DATABASE.md §2's
 * PENDING_INSPECTION exists for exactly this) - not at the end of
 * reconditioning - so the goods have a real, trackable ledger row from
 * the moment they physically arrive (DATABASE.md §11), and so the
 * BUYBACK_RECEIVED/INSPECTION_ACCEPTED/INSPECTION_REJECTED movement
 * types (DATABASE.md §"Inventory") have a concrete row to attach to.
 */
export async function receiveShipment(
  actor: Actor,
  requestId: string,
): Promise<void> {
  await requirePermission(actor, "inventory.write");

  const request = await buybackRepo.findRequestById(requestId);
  if (!request) {
    throw new ValidationFailedError("Demande de rachat introuvable.");
  }
  assertBuybackTransition(request.status, "RECEIVED");

  await prisma.$transaction(async (tx) => {
    await buybackRepo.updateRequestStatusInTx(tx, requestId, "RECEIVED");

    const location = await buybackRepo.findOrCreateBuybackLocationInTx(tx);
    for (const item of request.items) {
      const inventoryItem = await buybackRepo.createInventoryItemForBuybackInTx(
        tx,
        {
          productVariantId: item.productVariantId,
          serial: `BB-${item.id}`,
          locationId: location.id,
          originBuybackItemId: item.id,
        },
      );
      await buybackRepo.recordBuybackReceivedMovementInTx(tx, {
        itemId: inventoryItem.id,
        actorId: actor.id,
        buybackItemId: item.id,
      });
    }

    assertBuybackTransition("RECEIVED", "INSPECTION");
    await buybackRepo.updateRequestStatusInTx(tx, requestId, "INSPECTION");
  });
}

export async function getMyBuybackRequests(
  userId: string,
): Promise<buybackRepo.BuybackRequestWithDetails[]> {
  return buybackRepo.findRequestsForUser(userId);
}

export async function getBuybackRequestForOwner(
  userId: string,
  requestId: string,
): Promise<buybackRepo.BuybackRequestWithDetails> {
  const request = await buybackRepo.findRequestById(requestId);
  if (!request) {
    throw new ValidationFailedError("Demande de rachat introuvable.");
  }
  if (request.userId !== userId) {
    throw new UnauthorizedError();
  }
  return request;
}

export async function getReceivingQueue(
  actor: Actor,
): Promise<buybackRepo.BuybackRequestWithDetails[]> {
  await requirePermission(actor, "inventory.write");
  return buybackRepo.listRequestsAwaitingReceipt();
}

export async function getInspectionQueue(
  actor: Actor,
): Promise<buybackRepo.BuybackRequestWithDetails[]> {
  await requirePermission(actor, "buyback.inspect");
  return buybackRepo.listRequestsAwaitingInspection();
}

export interface BuybackItemDecision {
  itemId: string;
  accept: boolean;
  rejectionReason?: string;
}

/**
 * The customer's final word on the definitive, post-inspection value
 * (BUYBACK.md §4/§7): accept or decline each item independently.
 * CUSTOMER_CONFIRMATION -> ACCEPTED/PARTIALLY_ACCEPTED/REJECTED is
 * derived from these decisions (never hand-set - BUYBACK.md §2), and
 * on any accepted outcome the Payout is created in the *same*
 * transaction as that status update (BUYBACK.md §7) so a request can
 * never end up ACCEPTED with no corresponding payout, or vice versa.
 */
export async function confirmCustomerAcceptance(
  userId: string,
  requestId: string,
  decisions: BuybackItemDecision[],
): Promise<buybackRepo.BuybackRequestWithDetails> {
  const request = await buybackRepo.findRequestById(requestId);
  if (!request) {
    throw new ValidationFailedError("Demande de rachat introuvable.");
  }
  if (request.userId !== userId) {
    throw new UnauthorizedError();
  }
  if (request.status !== "CUSTOMER_CONFIRMATION") {
    throw new InvalidStateTransitionError(
      "Cette demande n'est pas en attente de confirmation du client.",
    );
  }

  const itemIds = new Set(request.items.map((item) => item.id));
  if (
    decisions.length !== request.items.length ||
    !decisions.every((decision) => itemIds.has(decision.itemId))
  ) {
    throw new ValidationFailedError(
      "Une décision (accepter/refuser) est requise pour chaque article de la demande.",
    );
  }
  for (const decision of decisions) {
    if (!decision.accept && !decision.rejectionReason) {
      throw new ValidationFailedError(
        "Merci d'indiquer un motif de refus pour chaque article refusé.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const decision of decisions) {
      await buybackRepo.updateItemInTx(tx, decision.itemId, {
        status: decision.accept ? "ACCEPTED" : "REJECTED",
        rejectionReason: decision.accept ? null : decision.rejectionReason,
      });

      if (!decision.accept) {
        const inventoryItem =
          await buybackRepo.findInventoryItemByBuybackItemInTx(
            tx,
            decision.itemId,
          );
        if (inventoryItem) {
          await buybackRepo.disposeInventoryItemInTx(tx, {
            inventoryItemId: inventoryItem.id,
            actorId: userId,
            buybackItemId: decision.itemId,
          });
        }
      }
    }

    const outcome = deriveRequestStatusFromItems(
      decisions.map((decision) => (decision.accept ? "ACCEPTED" : "REJECTED")),
    );

    assertBuybackTransition("CUSTOMER_CONFIRMATION", outcome);
    await buybackRepo.updateRequestStatusInTx(tx, requestId, outcome);

    if (outcome === "REJECTED") {
      return buybackRepo.findRequestByIdInTx(tx, requestId);
    }

    assertBuybackTransition(outcome, "PAYOUT_PENDING");
    await buybackRepo.updateRequestStatusInTx(tx, requestId, "PAYOUT_PENDING");

    const acceptedTotalMinor = decisions
      .filter((decision) => decision.accept)
      .reduce((sum, decision) => {
        const item = request.items.find((i) => i.id === decision.itemId);
        return sum + (item?.finalValueMinor ?? 0);
      }, 0);

    if (!request.valuationApprovedById) {
      // Cannot happen: CUSTOMER_CONFIRMATION is only reachable via
      // approveValuation, which always records the approver - a
      // defensive guard so Payout.preparedById (non-nullable) never
      // silently gets a bad value.
      throw new Error(
        "BuybackRequest reached CUSTOMER_CONFIRMATION without a recorded valuation approver.",
      );
    }

    await payoutRepo.createPayoutInTx(tx, {
      buybackRequestId: requestId,
      userId: request.userId,
      amountMinor: acceptedTotalMinor,
      preparedById: request.valuationApprovedById,
    });

    return buybackRepo.findRequestByIdInTx(tx, requestId);
  });
}

export interface EligiblePurchase {
  orderItemId: string;
  productVariantId: string;
  productTitle: string;
  variantName: string;
  purchasedAt: Date;
}

/**
 * The candidate list for the "sell back what you bought" form
 * (BUYBACK.md §1's "buy → use → sell back"): the customer's own past
 * purchases, narrowed to categories with an active BuybackRule and
 * products that aren't personalized-and-ineligible - the same two
 * gates addItemToBuybackRequest enforces, checked here too so the form
 * never even offers something it would reject.
 */
export async function getEligiblePurchasesForBuyback(
  userId: string,
): Promise<EligiblePurchase[]> {
  const orders = await orderRepo.findPurchasedOrderItemsForUser(userId);
  const results: EligiblePurchase[] = [];

  for (const order of orders) {
    for (const item of order.items) {
      const product = item.productVariant.product;
      if (
        product.personalizationRequired &&
        !product.personalizationBuybackEligible
      ) {
        continue;
      }
      const rule = await buybackRepo.findActiveRuleForCategory(
        product.categoryId,
      );
      if (!rule) {
        continue;
      }
      results.push({
        orderItemId: item.id,
        productVariantId: item.productVariantId,
        productTitle: product.title,
        variantName: item.productVariant.name,
        purchasedAt: item.createdAt,
      });
    }
  }

  return results;
}

export interface ShipmentAddressInput {
  fullName: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  country: string;
  phone?: string;
}

/**
 * No address-book feature exists yet elsewhere in the app - rather
 * than block the buyback flow on building one, this creates the
 * pickup/return Address inline from the confirmation form and then
 * runs the normal confirmShipment transition.
 */
export async function confirmShipmentWithNewAddress(
  userId: string,
  requestId: string,
  address: ShipmentAddressInput,
): Promise<void> {
  const created = await addressRepo.createAddress({
    userId,
    type: "SHIPPING",
    fullName: address.fullName,
    line1: address.line1,
    line2: address.line2 ?? null,
    postalCode: address.postalCode,
    city: address.city,
    country: address.country,
    phone: address.phone ?? null,
  });
  await confirmShipment(userId, requestId, created.id);
}
