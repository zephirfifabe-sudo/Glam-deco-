# ADR-005: Buyback as a first-class domain, decoupled from Orders/Returns

## Status
Accepted

## Context
Buyback (customer sells a used item back to the platform) is the
product's differentiator. It must not be modeled as a variant of
"returns" (a return is "I didn't want this / it's defective, refund
me") — the two have different money direction, different state
machines, and different actors (return: customer + support; buyback:
customer + inspector + finance + warehouse).

## Decision
Model **Return** and **Buyback** as fully separate aggregates
(`Return`/`ReturnItem` vs `BuybackRequest`/`BuybackItem`), each with its
own state machine (see BUYBACK.md, DATABASE.md).

Per-item outcomes: a `BuybackRequest` has many `BuybackItem`s, each with
its **own** status (`ACCEPTED` / `REJECTED` / `PARTIALLY_ACCEPTED`
handled by having 2 accepted + 2 rejected items rather than a
request-level "partial" flag) and its own proposed/final value — the
brief is explicit that a request-level status alone is insufficient
(§30).

Valuation is computed by a **pure domain service**,
`BuybackValuationService`, taking a typed input (condition, original
price, market signals, category rules) and returning a typed
estimate/breakdown — it has zero dependency on React/Next.js/Prisma, so
it is unit-testable in isolation and reusable from the pre-estimate flow
(customer-facing, indicative) and the post-inspection flow
(inspector-facing, authoritative). Its coefficients (condition
multiplier, seasonality, category eligibility, min/max payout) are
stored as `BuybackRule` rows editable by admins, **not hardcoded**, so
business can tune pricing without a deploy (brief §33).

Personalized items default to `NOT_ELIGIBLE` for buyback at the
`Product`/`ProductVariant` level (`personalizationBuybackEligible:
boolean`, default `false`), overridable per-product by an admin — never
inferred at request time from free text, to keep the rule auditable and
centrally enforced.

Post-acceptance, items flow through a **reconditioning pipeline**
(`RECONDITIONING → QUALITY_CHECK → PHOTOS → PRICING → AVAILABLE_FOR_RESALE`)
before a new `InventoryItem` becomes purchasable again — never an
automatic "accepted buyback = instantly for sale" shortcut.

## Consequences
- Two independent state machines to implement and test, more upfront
  modeling work, but correct separation of concerns and audit trail.
- The valuation formula/coefficients live in one service + one rules
  table — a single place to test, tune, and audit for margin integrity
  (unit-economics tracking, brief §102).
- Every buyback acceptance creates a `Payout` record distinct from the
  original Stripe `Payment` used to buy the item (ADR-004) — money in
  and money out are never the same ledger row.

## Alternatives considered
- **Treat buyback as a "negative order"**: rejected — conflates two
  different state machines and actor sets, would force awkward status
  values ("refunded" meaning two different things).
- **Single request-level accept/reject status**: rejected per brief §30
  — real inspections produce mixed outcomes across items in one
  shipment.
