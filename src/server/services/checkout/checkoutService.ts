import { prisma } from "@/lib/db/client";
import { stripe } from "@/lib/stripe/client";
import { appUrl } from "@/lib/appUrl";
import { ValidationFailedError } from "@/lib/errors";
import { calculateOrderTotal } from "@/server/domain/pricing/calculateOrderTotal";
import * as inventoryService from "@/server/services/inventory/inventoryService";
import * as cartService from "@/server/services/cart/cartService";

const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60; // 30 minutes, not Stripe's
// 24h default - limits how long a reserved-but-unpaid unit stays
// locked out of the pool if the buyer just abandons the tab (ROADMAP.md
// Phase 5 known gap: no background job releases these; the
// checkout.session.expired webhook, handled in the webhook route, is
// what actually frees the units once the session dies).

/**
 * The whole checkout entry point: locks inventory and creates the
 * Order/Payment atomically first (DATABASE.md §5/§12), then talks to
 * Stripe. If Stripe fails, the reservation is deliberately rolled back
 * (compensating transaction) rather than left as orphaned RESERVED
 * stock - a network blip talking to Stripe must not silently take a
 * unit out of the sellable pool forever.
 */
export async function createCheckoutSession(
  userId: string,
): Promise<{ orderId: string; checkoutUrl: string }> {
  const cart = await cartService.getCartView(userId);
  if (cart.lines.length === 0) {
    throw new ValidationFailedError("Votre panier est vide.");
  }

  const totals = calculateOrderTotal(
    cart.lines.map((line) => ({
      unitPriceMinor: line.unitPriceMinor,
      quantity: line.quantity,
    })),
  );

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId,
        status: "PENDING_PAYMENT",
        subtotalMinor: totals.subtotalMinor,
        taxMinor: totals.taxMinor,
        shippingMinor: totals.shippingMinor,
        totalMinor: totals.totalMinor,
        payments: {
          create: { status: "PENDING", amountMinor: totals.totalMinor },
        },
      },
    });

    for (const line of cart.lines) {
      for (let i = 0; i < line.quantity; i += 1) {
        const inventoryItemId = await inventoryService.reserveOneUnitInTx(
          tx,
          line.productVariantId,
          { referenceType: "Order", referenceId: created.id },
        );
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            productVariantId: line.productVariantId,
            inventoryItemId,
            unitPriceMinor: line.unitPriceMinor,
            quantity: 1,
          },
        });
      }
    }

    return tx.order.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        items: { include: { productVariant: { include: { product: true } } } },
        payments: true,
      },
    });
  });

  const payment = order.payments[0];
  if (!payment) {
    // Cannot happen given the create() above always creates one, but
    // TypeScript can't see that across the transaction boundary.
    throw new Error("Order was created without a payment record.");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: order.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: item.productVariant.product.currency.toLowerCase(),
          unit_amount: item.unitPriceMinor,
          product_data: { name: item.productVariant.product.title },
        },
      })),
      success_url: appUrl(`/commandes/${order.id}?paiement=succes`),
      cancel_url: appUrl(`/commandes/${order.id}?paiement=annule`),
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
      metadata: { orderId: order.id },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerCheckoutSessionId: session.id },
    });

    await cartService.clearCartForUser(userId);

    return { orderId: order.id, checkoutUrl: session.url };
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await inventoryService.releaseUnitInTx(tx, item.inventoryItemId, {
          referenceType: "Order",
          referenceId: order.id,
          notes:
            "Stripe checkout session creation failed - compensating release",
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
    });
    throw error;
  }
}
