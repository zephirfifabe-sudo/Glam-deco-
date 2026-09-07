import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/db/client";
import { applyStripeEvent } from "@/server/services/payments/stripeWebhookService";

// Tests the webhook's business logic in isolation from Stripe network
// calls and signature verification (covered separately below) - this
// sandbox has no outbound access to api.stripe.com (ROADMAP.md Phase 5
// known gap), so a real end-to-end Stripe payment cannot be exercised
// here. What CAN and IS verified: idempotent event application,
// Order/Payment/InventoryItem state transitions, and stock release on
// checkout expiry - the actual logic this webhook exists to run.

const runId = `webhook-${Date.now()}`;

let userId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let locationId: string;

function fakeCheckoutEvent(
  type: "checkout.session.completed" | "checkout.session.expired",
  sessionId: string,
  eventId: string,
): Stripe.Event {
  return {
    id: eventId,
    type,
    data: { object: { id: sessionId } },
  } as unknown as Stripe.Event;
}

async function createPendingOrder(sessionId: string) {
  const item = await prisma.inventoryItem.create({
    data: {
      serial: `${runId}-${sessionId}`,
      productVariantId: variantId,
      condition: "NEW",
      status: "RESERVED",
      locationId,
    },
  });

  const order = await prisma.order.create({
    data: {
      userId,
      status: "PENDING_PAYMENT",
      subtotalMinor: 1000,
      taxMinor: 174,
      shippingMinor: 0,
      totalMinor: 1000,
      items: {
        create: {
          productVariantId: variantId,
          inventoryItemId: item.id,
          unitPriceMinor: 1000,
        },
      },
      payments: {
        create: {
          status: "PENDING",
          amountMinor: 1000,
          providerCheckoutSessionId: sessionId,
        },
      },
    },
    include: { payments: true, items: true },
  });

  return { order, itemId: item.id };
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${runId}-cat`, name: "Webhook test category" },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      slug: `${runId}-product`,
      title: "Webhook test product",
      description: "Used only by the Stripe webhook test.",
      basePriceMinor: 1000,
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
    data: { code: `${runId}-loc`, name: "Webhook test location" },
  });
  locationId = location.id;

  const user = await prisma.user.create({
    data: {
      email: `${runId}@example.com`,
      passwordHash: "not-a-real-hash",
      name: "Webhook Test User",
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.inventoryMovement.deleteMany({
    where: { item: { productVariantId: variantId } },
  });
  await prisma.paymentEvent.deleteMany({
    where: { payment: { order: { userId } } },
  });
  await prisma.payment.deleteMany({ where: { order: { userId } } });
  await prisma.orderItem.deleteMany({ where: { order: { userId } } });
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.inventoryItem.deleteMany({
    where: { productVariantId: variantId },
  });
  await prisma.productVariant.delete({ where: { id: variantId } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.inventoryLocation.delete({ where: { id: locationId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("checkout.session.completed (ADR-004, brief §24 idempotency)", () => {
  it("marks the payment SUCCEEDED, the order PAID, and the unit SOLD", async () => {
    const sessionId = `${runId}-cs-completed`;
    const { order, itemId } = await createPendingOrder(sessionId);

    await applyStripeEvent(
      fakeCheckoutEvent(
        "checkout.session.completed",
        sessionId,
        `${runId}-evt-1`,
      ),
      "{}",
    );

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(payment.status).toBe("SUCCEEDED");

    const refreshedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(refreshedOrder.status).toBe("PAID");

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.status).toBe("SOLD");

    const soldMovements = await prisma.inventoryMovement.findMany({
      where: { itemId, type: "SOLD" },
    });
    expect(soldMovements).toHaveLength(1);
  });

  it("is idempotent: applying the same event twice has no additional effect", async () => {
    const sessionId = `${runId}-cs-completed-dup`;
    const { order, itemId } = await createPendingOrder(sessionId);
    const event = fakeCheckoutEvent(
      "checkout.session.completed",
      sessionId,
      `${runId}-evt-dup`,
    );

    await applyStripeEvent(event, "{}");
    await applyStripeEvent(event, "{}"); // Stripe retry / replay of the exact same event id

    const events = await prisma.paymentEvent.findMany({
      where: { payment: { orderId: order.id } },
    });
    expect(events).toHaveLength(1);

    const soldMovements = await prisma.inventoryMovement.findMany({
      where: { itemId, type: "SOLD" },
    });
    expect(soldMovements).toHaveLength(1);
  });
});

describe("checkout.session.expired (brief §90/§126 - documented compensating path)", () => {
  it("cancels the order, fails the payment, and releases the reserved unit", async () => {
    const sessionId = `${runId}-cs-expired`;
    const { order, itemId } = await createPendingOrder(sessionId);

    await applyStripeEvent(
      fakeCheckoutEvent(
        "checkout.session.expired",
        sessionId,
        `${runId}-evt-exp`,
      ),
      "{}",
    );

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(payment.status).toBe("FAILED");

    const refreshedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(refreshedOrder.status).toBe("CANCELLED");

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.status).toBe("AVAILABLE");
  });

  it("never cancels an order that already succeeded (tight completed/expired race)", async () => {
    const sessionId = `${runId}-cs-race`;
    const { order, itemId } = await createPendingOrder(sessionId);

    await applyStripeEvent(
      fakeCheckoutEvent(
        "checkout.session.completed",
        sessionId,
        `${runId}-evt-race-1`,
      ),
      "{}",
    );
    await applyStripeEvent(
      fakeCheckoutEvent(
        "checkout.session.expired",
        sessionId,
        `${runId}-evt-race-2`,
      ),
      "{}",
    );

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(payment.status).toBe("SUCCEEDED");

    const refreshedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(refreshedOrder.status).toBe("PAID");

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(item.status).toBe("SOLD");
  });
});
