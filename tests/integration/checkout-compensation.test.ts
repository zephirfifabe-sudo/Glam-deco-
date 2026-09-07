import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { createCheckoutSession } from "@/server/services/checkout/checkoutService";

// This sandbox has no outbound access to api.stripe.com (verified: the
// egress proxy rejects the CONNECT), so stripe.checkout.sessions.create
// always fails here with a network error. That is actually a useful
// real-world test of the checkout service's compensation path
// (ROADMAP.md Phase 5 known gap): if Stripe can't be reached after
// inventory has already been reserved and the Order/Payment created,
// the reservation MUST be released and the order cancelled rather than
// leaving a unit stuck RESERVED forever over a mere network blip.

const runId = `checkout-${Date.now()}`;

let userId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let locationId: string;
let itemId: string;

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${runId}-cat`, name: "Checkout test category" },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      slug: `${runId}-product`,
      title: "Checkout test product",
      description: "Used only by the checkout compensation test.",
      basePriceMinor: 2000,
      condition: "NEW",
      status: "ACTIVE",
      categoryId,
    },
  });
  productId = product.id;

  const variant = await prisma.productVariant.create({
    data: { productId, sku: `${runId}-sku`, name: "Default" },
  });
  variantId = variant.id;

  const location = await prisma.inventoryLocation.create({
    data: { code: `${runId}-loc`, name: "Checkout test location" },
  });
  locationId = location.id;

  const item = await prisma.inventoryItem.create({
    data: {
      serial: `${runId}-0001`,
      productVariantId: variantId,
      condition: "NEW",
      status: "AVAILABLE",
      locationId,
    },
  });
  itemId = item.id;

  const user = await prisma.user.create({
    data: {
      email: `${runId}@example.com`,
      passwordHash: "not-a-real-hash",
      name: "Checkout Test User",
    },
  });
  userId = user.id;

  await prisma.cart.create({
    data: {
      userId,
      items: { create: { productVariantId: variantId, quantity: 1 } },
    },
  });
});

afterAll(async () => {
  await prisma.inventoryMovement.deleteMany({ where: { itemId } });
  await prisma.paymentEvent.deleteMany({
    where: { payment: { order: { userId } } },
  });
  await prisma.payment.deleteMany({ where: { order: { userId } } });
  await prisma.orderItem.deleteMany({ where: { order: { userId } } });
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  await prisma.cart.deleteMany({ where: { userId } });
  await prisma.inventoryItem.delete({ where: { id: itemId } });
  await prisma.productVariant.delete({ where: { id: variantId } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.inventoryLocation.delete({ where: { id: locationId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("checkout compensation when Stripe is unreachable (brief §90/§126)", () => {
  it("reserves inventory, then releases it and cancels the order when Stripe fails", async () => {
    await expect(createCheckoutSession(userId)).rejects.toBeDefined();

    // The reservation must not be left dangling - this is the whole
    // point of the compensating transaction in checkoutService.
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.status).toBe("AVAILABLE");

    const order = await prisma.order.findFirstOrThrow({ where: { userId } });
    expect(order.status).toBe("CANCELLED");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(payment.status).toBe("FAILED");

    const releaseMovements = await prisma.inventoryMovement.findMany({
      where: { itemId, type: "RELEASED" },
    });
    expect(releaseMovements).toHaveLength(1);
  });
});
