# ADR-004: Stripe as sole payment provider, PaymentIntents + webhooks

## Status
Accepted

## Context
Stripe is mandated. Belgium launch, EU expansion planned. Card data must
never touch our servers.

## Decision
- Use **Stripe PaymentIntents** (via Stripe Elements or Checkout Session
  — Checkout Session chosen for MVP to minimize PCI scope and custom UI
  work; can move to embedded Elements later for a more branded flow).
- Flow: Browser → Server Action creates an `Order` in `PENDING_PAYMENT`
  and a Stripe Checkout Session (amount computed **server-side only**,
  see PRICING) → Browser redirects to Stripe → Stripe redirects back →
  **the order is only marked paid by the webhook**, never by the
  redirect callback (the redirect is not trusted — a user can close the
  tab or forge the return URL).
- **Webhook endpoint** (`app/api/webhooks/stripe/route.ts`):
  - Verifies the `Stripe-Signature` header against
    `STRIPE_WEBHOOK_SECRET` using Stripe's SDK constructor
    (`stripe.webhooks.constructEvent`) — request is rejected (fail
    closed) if verification fails, before any body parsing logic runs.
  - Every processed event is persisted in a `PaymentEvent` table keyed
    by Stripe's `event.id` **before** side effects are applied, with a
    unique constraint on `(provider, eventId)` — a duplicate delivery
    (Stripe retries on non-2xx, or a malicious replay of a captured
    valid payload) is a no-op on the second attempt (idempotency, brief
    §24/§69).
  - Applies state transitions through the `PaymentStateMachine` /
    `OrderStateMachine` (see DATABASE.md) inside a single DB transaction
    with the event-id insert, so "event recorded" and "effect applied"
    are atomic.
  - Returns 2xx quickly; any slow follow-up (emails, analytics) is
    deferred to the notification outbox, not done inline in the webhook
    handler.
- Refunds are recorded the same way: refund is initiated via Stripe API
  from an authorized admin/finance action, and the resulting
  `charge.refunded` webhook is what actually flips the `Payment` state —
  the initiating action sets an intermediate `REFUND_PENDING`-like
  status, not a final one, so we never trust our own optimistic write
  over Stripe's authoritative event.
- Buyback **payouts** are explicitly a separate service/flow from
  Stripe checkout payments (see ADR-005 / BUYBACK.md) — likely Stripe
  Payouts/Connect or a bank transfer batch depending on business
  decision; not the same code path as taking payment for orders.

## Consequences
- No cardholder data ever stored — reduces PCI scope to SAQ A.
- Webhook idempotency table gives us replay-safety and an audit trail
  of every Stripe event received, independent of Stripe's own dashboard.
- Requires reliable webhook delivery in all environments (Stripe CLI
  `listen --forward-to` for local dev, documented in DEPLOYMENT.md).

## Alternatives considered
- **Trusting the client-side redirect to mark orders paid**: rejected
  outright — this is the single most common payment-integration
  vulnerability (a user can hit the success URL without ever paying).
- **Mollie/Adyen** (popular for BE/EU): Stripe was explicitly mandated
  by the brief; Mollie is worth a revisit for EU local payment methods
  (Bancontact) — note that **Stripe already supports Bancontact** as a
  payment method type under the same PaymentIntents/Checkout flow, so
  this need not be a separate integration.
