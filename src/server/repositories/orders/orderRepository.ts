import { prisma } from "@/lib/db/client";
import type { OrderStatus, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const ORDER_DETAIL_INCLUDE = {
  items: { include: { productVariant: { include: { product: true } } } },
  payments: { include: { events: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof ORDER_DETAIL_INCLUDE;
}>;

export async function findOrderById(
  id: string,
): Promise<OrderWithDetails | null> {
  return prisma.order.findUnique({
    where: { id },
    include: ORDER_DETAIL_INCLUDE,
  });
}

export async function updateOrderStatus(
  tx: Tx,
  id: string,
  status: OrderStatus,
) {
  return tx.order.update({ where: { id }, data: { status } });
}

/**
 * A customer's own past purchases, excluding orders that never
 * completed (PENDING_PAYMENT) or that reversed (CANCELLED/REFUNDED) -
 * the candidate pool for buyback.md's "sell back what you bought"
 * flow. Eligibility (category rule, personalization) is a buyback
 * service concern, not this repository's.
 */
export async function findPurchasedOrderItemsForUser(userId: string) {
  return prisma.order.findMany({
    where: {
      userId,
      status: { notIn: ["PENDING_PAYMENT", "CANCELLED", "REFUNDED"] },
    },
    include: {
      items: { include: { productVariant: { include: { product: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}
