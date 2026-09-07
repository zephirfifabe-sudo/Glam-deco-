import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Only server/repositories/** may import @prisma/client (ARCHITECTURE.md §2).

const CART_INCLUDE = {
  items: {
    include: {
      productVariant: { include: { product: true } },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithDetails = Prisma.CartGetPayload<{
  include: typeof CART_INCLUDE;
}>;

export async function findOrCreateCartForUser(
  userId: string,
): Promise<CartWithDetails> {
  const existing = await prisma.cart.findUnique({
    where: { userId },
    include: CART_INCLUDE,
  });
  if (existing) {
    return existing;
  }
  return prisma.cart.create({
    data: { userId },
    include: CART_INCLUDE,
  });
}

export async function upsertCartItem(
  cartId: string,
  productVariantId: string,
  quantity: number,
) {
  return prisma.cartItem.upsert({
    where: { cartId_productVariantId: { cartId, productVariantId } },
    update: { quantity },
    create: { cartId, productVariantId, quantity },
  });
}

export async function removeCartItem(cartId: string, productVariantId: string) {
  await prisma.cartItem.deleteMany({ where: { cartId, productVariantId } });
}

export async function clearCart(cartId: string) {
  await prisma.cartItem.deleteMany({ where: { cartId } });
}
