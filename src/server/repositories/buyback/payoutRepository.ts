import { prisma } from "@/lib/db/client";
import type { PayoutStatus, Prisma } from "@prisma/client";

// Only server/repositories/** may import @prisma/client (ARCHITECTURE.md §2).

type Tx = Prisma.TransactionClient;

const PAYOUT_DETAIL_INCLUDE = {
  buybackRequest: true,
  events: true,
} satisfies Prisma.PayoutInclude;

export type PayoutWithDetails = Prisma.PayoutGetPayload<{
  include: typeof PAYOUT_DETAIL_INCLUDE;
}>;

export interface NewPayoutInput {
  buybackRequestId: string;
  userId: string;
  amountMinor: number;
  preparedById: string;
}

/**
 * Unique on buybackRequestId (BUYBACK.md §7) - the constraint, not
 * this function, is what actually prevents a double payout if
 * confirmCustomerAcceptance is ever retried; this is called at most
 * once per request in the normal flow.
 */
export async function createPayoutInTx(tx: Tx, input: NewPayoutInput) {
  return tx.payout.create({ data: input });
}

export async function findPayoutById(
  id: string,
): Promise<PayoutWithDetails | null> {
  return prisma.payout.findUnique({
    where: { id },
    include: PAYOUT_DETAIL_INCLUDE,
  });
}

export async function listPendingPayouts(): Promise<PayoutWithDetails[]> {
  return prisma.payout.findMany({
    where: { status: "PENDING" },
    include: PAYOUT_DETAIL_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

export async function updatePayoutStatusInTx(
  tx: Tx,
  id: string,
  status: PayoutStatus,
  extra: Prisma.PayoutUpdateInput = {},
) {
  return tx.payout.update({ where: { id }, data: { status, ...extra } });
}

export async function recordPayoutEventInTx(
  tx: Tx,
  input: { payoutId: string; type: string; payload?: Prisma.InputJsonValue },
) {
  return tx.payoutEvent.create({ data: input });
}
