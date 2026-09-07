import crypto from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { canTransitionPayment } from "@/server/domain/payments/stateMachine";
import { canTransitionOrder } from "@/server/domain/orders/stateMachine";
import * as paymentRepo from "@/server/repositories/payments/paymentRepository";
import * as orderRepo from "@/server/repositories/orders/orderRepository";
import * as inventoryService from "@/server/services/inventory/inventoryService";

function hashPayload(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Applies one verified Stripe event. The caller (the route handler) is
 * responsible for signature verification before this ever runs - this
 * function trusts that `event` is authentic. Idempotency is enforced
 * here via the (provider, eventId) unique constraint (ADR-004): a
 * retried or replayed delivery of an event already recorded is a
 * silent no-op, not a re-applied side effect.
 */
export async function applyStripeEvent(
  event: Stripe.Event,
  rawBody: string,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event, rawBody);
      return;
    case "checkout.session.expired":
      await handleCheckoutExpired(event, rawBody);
      return;
    default:
      // Stripe sends many event types we don't act on - acknowledging
      // silently (the route still returns 200) avoids Stripe retrying
      // forever for something we were never going to handle.
      logger.info({ event: "stripe_webhook.ignored", type: event.type });
      return;
  }
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
  rawBody: string,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const payment = await paymentRepo.findPaymentByCheckoutSessionId(session.id);

  if (!payment) {
    logger.warn({
      event: "stripe_webhook.unknown_session",
      stripeSessionId: session.id,
      stripeEventId: event.id,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const isNew = await paymentRepo.recordPaymentEventIfNew(tx, {
      paymentId: payment.id,
      provider: "STRIPE",
      eventId: event.id,
      type: event.type,
      payloadHash: hashPayload(rawBody),
    });
    if (!isNew) {
      logger.info({
        event: "stripe_webhook.duplicate_ignored",
        stripeEventId: event.id,
      });
      return;
    }

    if (!canTransitionPayment(payment.status, "SUCCEEDED")) {
      // Already SUCCEEDED (shouldn't happen given the idempotency check
      // above, but the state machine is the authority, not just the
      // event ledger) or in a terminal state that can't move forward -
      // fail closed rather than silently double-apply.
      logger.warn({
        event: "stripe_webhook.illegal_payment_transition",
        paymentId: payment.id,
        from: payment.status,
        to: "SUCCEEDED",
      });
      return;
    }

    await paymentRepo.updatePaymentStatus(tx, payment.id, "SUCCEEDED");

    if (canTransitionOrder(payment.order.status, "PAID")) {
      await orderRepo.updateOrderStatus(tx, payment.orderId, "PAID");
    }

    for (const item of payment.order.items) {
      await tx.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { status: "SOLD" },
      });
      await tx.inventoryMovement.create({
        data: {
          itemId: item.inventoryItemId,
          type: "SOLD",
          fromStatus: "RESERVED",
          toStatus: "SOLD",
          referenceType: "Order",
          referenceId: payment.orderId,
        },
      });
    }

    logger.info({
      event: "order.paid",
      resourceType: "Order",
      resourceId: payment.orderId,
      result: "success",
    });
  });
}

async function handleCheckoutExpired(
  event: Stripe.Event,
  rawBody: string,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const payment = await paymentRepo.findPaymentByCheckoutSessionId(session.id);

  if (!payment) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const isNew = await paymentRepo.recordPaymentEventIfNew(tx, {
      paymentId: payment.id,
      provider: "STRIPE",
      eventId: event.id,
      type: event.type,
      payloadHash: hashPayload(rawBody),
    });
    if (!isNew) {
      return;
    }

    // A session can only expire while its payment is still PENDING - if
    // the buyer somehow already paid (a very tight race between
    // completion and expiry), never cancel a paid order.
    if (!canTransitionPayment(payment.status, "FAILED")) {
      return;
    }

    await paymentRepo.updatePaymentStatus(tx, payment.id, "FAILED");
    if (canTransitionOrder(payment.order.status, "CANCELLED")) {
      await orderRepo.updateOrderStatus(tx, payment.orderId, "CANCELLED");
    }

    for (const item of payment.order.items) {
      await inventoryService.releaseUnitInTx(tx, item.inventoryItemId, {
        referenceType: "Order",
        referenceId: payment.orderId,
        notes: "Checkout session expired unpaid",
      });
    }

    logger.info({
      event: "order.cancelled_expired",
      resourceType: "Order",
      resourceId: payment.orderId,
      result: "success",
    });
  });
}
