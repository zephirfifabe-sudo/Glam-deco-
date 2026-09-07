import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe/client";
import { logger } from "@/lib/logging/logger";
import { applyStripeEvent } from "@/server/services/payments/stripeWebhookService";

// Public by necessity (Stripe calls this, not a logged-in browser) -
// every request MUST verify the Stripe-Signature header before any
// processing runs (ADR-004, SECURITY.md §11: never
// `if body.type === "payment_succeeded"` without signature
// verification). Signature check failing is the one case this route
// fails closed on: reject before touching the DB at all.
export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");
  const rawBody = await request.text();

  if (!signature) {
    logger.warn({ event: "stripe_webhook.missing_signature" });
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error({ event: "stripe_webhook.misconfigured" });
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    logger.warn({
      event: "stripe_webhook.signature_invalid",
      error: String(error),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await applyStripeEvent(event, rawBody);
  } catch (error) {
    // A 5xx tells Stripe to retry (its own backoff), which pairs with
    // the idempotency ledger to make retries safe - never swallow this
    // into a 200 just to stop the retries.
    logger.error({
      event: "stripe_webhook.processing_failed",
      stripeEventId: event.id,
      error: String(error),
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
