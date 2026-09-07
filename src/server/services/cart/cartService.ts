import * as cartRepo from "@/server/repositories/cart/cartRepository";
import { effectiveUnitPriceMinor } from "@/server/domain/pricing/effectivePrice";
import { calculateOrderTotal } from "@/server/domain/pricing/calculateOrderTotal";
import { ValidationFailedError } from "@/lib/errors";

const MAX_QUANTITY_PER_LINE = 10;

export interface CartLine {
  productVariantId: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  variantName: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  lineTotalMinor: number;
}

export interface CartView {
  cartId: string;
  lines: CartLine[];
  totals: ReturnType<typeof calculateOrderTotal>;
}

/**
 * Always reads current Product/ProductVariant prices - the cart never
 * stores a price itself (brief §27, DATABASE.md "Cart & Pricing").
 * Re-run this on every render/checkout rather than trusting anything
 * cached client-side.
 */
export async function getCartView(userId: string): Promise<CartView> {
  const cart = await cartRepo.findOrCreateCartForUser(userId);

  const lines: CartLine[] = cart.items.map((item) => {
    const unitPriceMinor = effectiveUnitPriceMinor(
      item.productVariant,
      item.productVariant.product,
    );
    return {
      productVariantId: item.productVariantId,
      productId: item.productVariant.productId,
      productTitle: item.productVariant.product.title,
      productSlug: item.productVariant.product.slug,
      variantName: item.productVariant.name,
      quantity: item.quantity,
      unitPriceMinor,
      currency: item.productVariant.product.currency,
      lineTotalMinor: unitPriceMinor * item.quantity,
    };
  });

  const totals = calculateOrderTotal(
    lines.map((l) => ({
      unitPriceMinor: l.unitPriceMinor,
      quantity: l.quantity,
    })),
  );

  return { cartId: cart.id, lines, totals };
}

export async function addItem(
  userId: string,
  productVariantId: string,
  quantity: number,
) {
  if (quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
    throw new ValidationFailedError(
      `La quantité doit être comprise entre 1 et ${MAX_QUANTITY_PER_LINE}.`,
    );
  }
  const cart = await cartRepo.findOrCreateCartForUser(userId);
  await cartRepo.upsertCartItem(cart.id, productVariantId, quantity);
}

export async function removeItem(userId: string, productVariantId: string) {
  const cart = await cartRepo.findOrCreateCartForUser(userId);
  await cartRepo.removeCartItem(cart.id, productVariantId);
}

export async function clearCartForUser(userId: string) {
  const cart = await cartRepo.findOrCreateCartForUser(userId);
  await cartRepo.clearCart(cart.id);
}
