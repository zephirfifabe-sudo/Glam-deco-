import { prisma } from "@/lib/db/client";
import type {
  Prisma,
  InventoryMovementType,
  InventoryStatus,
} from "@prisma/client";

// Only server/repositories/** may import @prisma/client (ARCHITECTURE.md §2).

type Tx = Prisma.TransactionClient;

/**
 * Locks and claims one AVAILABLE unit of a variant inside the caller's
 * transaction (DATABASE.md §5). `FOR UPDATE SKIP LOCKED` rather than a
 * plain `FOR UPDATE`: with several units in stock, concurrent callers
 * each lock a *different* row instead of queuing behind one another;
 * with exactly one unit left (the documented race condition), the
 * second caller sees zero locked-and-available rows and returns empty
 * immediately - it never blocks waiting for a unit that won't be free.
 * Parameterized via Prisma's tagged template - never string
 * concatenation (SECURITY.md §11).
 */
export async function lockOneAvailableItem(
  tx: Tx,
  productVariantId: string,
): Promise<{ id: string } | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "InventoryItem"
    WHERE "productVariantId" = ${productVariantId} AND status = 'AVAILABLE'
    ORDER BY "createdAt" ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
  return rows[0] ?? null;
}

/** Locks one specific item by id - used by release/transition paths that already know which unit they mean. */
export async function lockItemById(tx: Tx, itemId: string) {
  const rows = await tx.$queryRaw<
    { id: string; status: InventoryStatus }[]
  >`SELECT id, status FROM "InventoryItem" WHERE id = ${itemId} FOR UPDATE`;
  return rows[0] ?? null;
}

export async function setItemStatus(
  tx: Tx,
  itemId: string,
  status: InventoryStatus,
) {
  return tx.inventoryItem.update({ where: { id: itemId }, data: { status } });
}

export interface MovementInput {
  itemId: string;
  type: InventoryMovementType;
  fromStatus: InventoryStatus | null;
  toStatus: InventoryStatus;
  actorId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export async function recordMovement(tx: Tx, input: MovementInput) {
  return tx.inventoryMovement.create({ data: input });
}

export async function countAvailable(
  productVariantId: string,
): Promise<number> {
  return prisma.inventoryItem.count({
    where: { productVariantId, status: "AVAILABLE" },
  });
}

export async function findItemById(id: string) {
  return prisma.inventoryItem.findUnique({ where: { id } });
}

export async function listMovementsForItem(itemId: string) {
  return prisma.inventoryMovement.findMany({
    where: { itemId },
    orderBy: { createdAt: "asc" },
  });
}
