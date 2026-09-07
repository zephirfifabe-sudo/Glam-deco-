import { prisma, type Condition } from "@/lib/db/client";
import {
  InvalidStateTransitionError,
  ValidationFailedError,
} from "@/lib/errors";
import type { Actor } from "@/lib/permissions/permissionService";
import { requirePermission } from "@/lib/permissions/permissionService";
import { assertBuybackTransition } from "@/server/domain/buyback/stateMachine";
import * as buybackRepo from "@/server/repositories/buyback/buybackRepository";

export interface ReconditionedItemInput {
  buybackItemId: string;
  finalCondition: Condition;
  // This unit's own photos (DATABASE.md §4/§6) - never the original
  // Product's marketing photos.
  photos: string[];
  resalePriceMinor: number;
}

/**
 * BUYBACK.md §8's RECONDITIONING -> QUALITY_CHECK -> PHOTOS -> PRICING
 * -> AVAILABLE_FOR_RESALE pipeline, implemented as one staff action for
 * this MVP slice (ROADMAP.md Phase 6 scope: "reconditioning pipeline
 * stub through to AVAILABLE_FOR_RESALE creating a real purchasable
 * InventoryItem" - a multi-screen wizard tracking each sub-step
 * individually is a later-phase UI improvement, not a data-model gap:
 * BuybackStatus itself only has RECONDITIONING/AVAILABLE_FOR_RESALE,
 * no intermediate enum values, so QUALITY_CHECK/PHOTOS/PRICING are
 * operational steps a staff member completes before submitting this
 * form, not separate persisted states).
 *
 * Requires exactly the request's ACCEPTED items, each with at least
 * one photo and a positive resale price - "never made purchasable
 * straight out of PAID/inspection" (BUYBACK.md §8) is enforced by
 * requiring this explicit input, not inferring a price from the
 * original listing.
 */
export async function completeReconditioning(
  actor: Actor,
  requestId: string,
  items: ReconditionedItemInput[],
): Promise<void> {
  await requirePermission(actor, "inventory.write");

  const request = await buybackRepo.findRequestById(requestId);
  if (!request) {
    throw new ValidationFailedError("Demande de rachat introuvable.");
  }
  if (request.status !== "PAID") {
    throw new InvalidStateTransitionError(
      "Cette demande doit être payée avant d'être reconditionnée.",
    );
  }

  const acceptedItems = request.items.filter(
    (item) => item.status === "ACCEPTED",
  );
  const providedIds = new Set(items.map((item) => item.buybackItemId));
  if (
    acceptedItems.length === 0 ||
    acceptedItems.length !== items.length ||
    !acceptedItems.every((item) => providedIds.has(item.id))
  ) {
    throw new ValidationFailedError(
      "Le reconditionnement doit couvrir exactement les articles acceptés de cette demande.",
    );
  }
  for (const input of items) {
    if (input.photos.length === 0) {
      throw new ValidationFailedError(
        "Chaque article reconditionné doit avoir au moins une photo.",
      );
    }
    if (input.resalePriceMinor <= 0) {
      throw new ValidationFailedError(
        "Le prix de revente doit être strictement positif.",
      );
    }
  }

  assertBuybackTransition("PAID", "RECONDITIONING");

  await prisma.$transaction(async (tx) => {
    await buybackRepo.updateRequestStatusInTx(tx, requestId, "RECONDITIONING");

    for (const input of items) {
      const buybackItem = acceptedItems.find(
        (item) => item.id === input.buybackItemId,
      );
      if (!buybackItem) {
        continue; // unreachable given the coverage check above
      }

      const inventoryItem =
        await buybackRepo.findInventoryItemByBuybackItemInTx(
          tx,
          input.buybackItemId,
        );
      if (!inventoryItem) {
        // Cannot happen in the normal flow - receiveShipment always
        // creates one InventoryItem per BuybackItem.
        throw new Error(
          `No InventoryItem found for buyback item ${input.buybackItemId}.`,
        );
      }

      const variant = await buybackRepo.createResaleVariantInTx(tx, {
        productId: buybackItem.productVariant.productId,
        buybackItemId: input.buybackItemId,
        name: `Occasion – ${input.finalCondition}`,
        priceMinor: input.resalePriceMinor,
      });

      await buybackRepo.finalizeResaleInventoryItemInTx(tx, {
        inventoryItemId: inventoryItem.id,
        productVariantId: variant.id,
        condition: input.finalCondition,
        actorId: actor.id,
        buybackItemId: input.buybackItemId,
      });

      await buybackRepo.createResalePhotosInTx(
        tx,
        inventoryItem.id,
        input.photos,
      );
    }

    assertBuybackTransition("RECONDITIONING", "AVAILABLE_FOR_RESALE");
    await buybackRepo.updateRequestStatusInTx(
      tx,
      requestId,
      "AVAILABLE_FOR_RESALE",
    );
  });
}

export async function getReconditioningQueue(actor: Actor) {
  await requirePermission(actor, "inventory.write");
  return buybackRepo.listRequestsAwaitingReconditioning();
}
