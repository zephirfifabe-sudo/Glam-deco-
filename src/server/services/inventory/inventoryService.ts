import { prisma, type TransactionClient } from "@/lib/db/client";
import {
  InsufficientInventoryError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import { canTransition } from "@/server/domain/inventory/stateMachine";
import * as inventoryRepo from "@/server/repositories/inventory/inventoryRepository";

type Tx = TransactionClient;

export interface ReservationReference {
  actorId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

/**
 * The composable core: locks one AVAILABLE unit of `productVariantId`
 * and marks it RESERVED, inside whatever transaction the caller is
 * already running. Phase 5's checkout will call this from within its
 * own order-creation transaction so "reserve inventory" and "create
 * order" commit or roll back together - that's why this takes a `tx`
 * rather than opening its own (DATABASE.md §5/§12).
 *
 * Throws InsufficientInventoryError if no unit is available - the
 * caller's transaction is expected to roll back on that.
 */
export async function reserveOneUnitInTx(
  tx: Tx,
  productVariantId: string,
  reference: ReservationReference = {},
) {
  const locked = await inventoryRepo.lockOneAvailableItem(tx, productVariantId);
  if (!locked) {
    throw new InsufficientInventoryError();
  }

  await inventoryRepo.setItemStatus(tx, locked.id, "RESERVED");
  await inventoryRepo.recordMovement(tx, {
    itemId: locked.id,
    type: "RESERVED",
    fromStatus: "AVAILABLE",
    toStatus: "RESERVED",
    ...reference,
  });

  return locked.id;
}

/** Standalone version for callers with no existing transaction (e.g. an admin manual reservation). */
export async function reserveOneUnit(
  productVariantId: string,
  reference: ReservationReference = {},
) {
  return prisma.$transaction((tx) =>
    reserveOneUnitInTx(tx, productVariantId, reference),
  );
}

export async function releaseUnitInTx(
  tx: Tx,
  itemId: string,
  reference: ReservationReference = {},
) {
  const locked = await inventoryRepo.lockItemById(tx, itemId);
  if (!locked || !canTransition(locked.status, "AVAILABLE")) {
    throw new InvalidStateTransitionError(
      `L'article ${itemId} ne peut pas être remis en stock depuis son état actuel.`,
    );
  }

  await inventoryRepo.setItemStatus(tx, itemId, "AVAILABLE");
  await inventoryRepo.recordMovement(tx, {
    itemId,
    type: "RELEASED",
    fromStatus: locked.status,
    toStatus: "AVAILABLE",
    ...reference,
  });
}

export async function releaseUnit(
  itemId: string,
  reference: ReservationReference = {},
) {
  return prisma.$transaction((tx) => releaseUnitInTx(tx, itemId, reference));
}

export async function getAvailableCount(productVariantId: string) {
  return inventoryRepo.countAvailable(productVariantId);
}
