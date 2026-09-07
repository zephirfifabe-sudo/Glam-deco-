# ROADMAP

Phased delivery. Each phase ends with lint + typecheck + tests green
before the next starts (brief §123/§127 Definition of Done applies per
feature, not just per phase).

## Phase 0 — Audit (this pass)

`PROJECT_AUDIT.md`. Done.

## Phase 1 — Architecture (this pass)

`ARCHITECTURE.md`, `DATABASE.md`, `THREAT_MODEL.md`, `BUYBACK.md`,
`SECURITY.md`, `ROADMAP.md`, ADRs 001–006. **Gate: human validation
before any code is written** — this is an explicit rule in the brief
(§129), not a formality skipped by "auto mode."

## Phase 2 — Foundation ✅ done

Next.js + TypeScript strict + Tailwind scaffold; Docker Compose
(app, postgres, redis, minio, mailhog); Prisma schema for
Identity/Catalog/base entities + first migration; Auth.js wired
(signup/login/logout/verify/reset, no MFA yet); structured logging;
Zod validation conventions; `PermissionService` skeleton; health
endpoint; CI pipeline skeleton (lint/typecheck/unit/build).

Verified live against a real PostgreSQL instance and a real browser
(Playwright): signup → email verification → login → logout → password
reset request → password reset → login with the new password → old
password correctly rejected, with the session-revocation ledger
(ADR-003) confirmed in the database after both logout and reset. The
`docker-compose.yml`/`Dockerfile` were written and `docker compose
config` validated, but full `docker compose up` could not be exercised
in this session's sandbox (no reachable Docker daemon) - see README.md
"Known gaps." Rate limiting and MFA are explicitly deferred to Phase 8,
as scoped below, not silently skipped.

## Phase 3 — Catalog ✅ done

Category/EventType/Product/ProductVariant/ProductImage CRUD (admin) +
public browse/search/filter; product detail pages with SEO metadata
(`generateMetadata`, `sitemap.ts`, `robots.ts`); NEW vs USED listing
distinction implemented end-to-end. Search is simple `ILIKE`
(Prisma `contains`), not real Postgres full-text (tsvector+GIN) yet -
deliberately deferred until the catalog is large enough to justify it
(brief §60/§93); the filter/query surface is designed so swapping the
implementation later doesn't touch calling code. `Tag` exists in the
schema but has no admin UI yet (not exercised by any listed
requirement beyond existing) - add it if/when tagging becomes a real
merchandising need.

Verified live (Playwright, admin@glamdeco.test / customer@glamdeco.test
against the real Postgres instance): a CUSTOMER hitting `/admin` gets
the explicit refusal page, not a silent bounce; an ADMIN can create a
product, see it appear on `/catalogue` once `status = ACTIVE`, and see
it disappear once switched back to `DRAFT` (`revalidatePath` wired on
every mutation); category creation works end-to-end. One real bug was
caught and fixed by this testing: the auto-generated default SKU was
derived from the raw title, which collided across products sharing a
title - it's now derived from the already-unique slug instead.

Product photos still have no real upload pipeline (ADR-006/upload
security lands with buyback/inspection in a later phase) - the admin
form takes a plain image URL for now, and the seeded catalog ships
with zero images, rendering the storefront's "no photo yet" fallback
rather than pretend a photo pipeline exists.

## Phase 4 — Inventory ✅ done

InventoryItem/InventoryLocation/InventoryMovement (append-only ledger);
reservation (`reserveOneUnit`/`reserveOneUnitInTx`) and release
(`releaseUnit`/`releaseUnitInTx`) logic; the row-locking allocation
transaction and its concurrency test (DATABASE.md §5) — built and
tested before checkout depends on it. `reserveOneUnitInTx`/
`releaseUnitInTx` deliberately take a caller-supplied transaction so
Phase 5's checkout can reserve inventory and create the order in one
atomic transaction rather than two.

Uses `SELECT ... FOR UPDATE SKIP LOCKED` rather than a plain
`FOR UPDATE`: with several units in stock, concurrent buyers each lock
a _different_ row instead of queuing; with exactly one unit left (the
documented race), the loser sees zero available-and-lockable rows and
fails immediately with `InsufficientInventoryError` rather than
blocking. The `ProductImage` "belongs to exactly one of
Product/InventoryItem" invariant (DATABASE.md §4/§6) is enforced with
a hand-added Postgres `CHECK` constraint, not just application code
(brief §12) - verified directly against Postgres, not just asserted.

The required concurrency test (brief §26/§68 Test 5) was verified to
actually catch a regression, not just pass by construction: temporarily
removing `FOR UPDATE SKIP LOCKED` was confirmed to make both tests fail
(two buyers claiming the same last unit; 3 of 3 buyers succeeding
against a 2-unit pool) before the real locking code was restored.

## Phase 5 — Cart + Checkout + Stripe ✅ done

Cart (server-recomputed pricing only - every price shown is read live
from Product/ProductVariant, never trusted from the client or cached in
CartItem), checkout flow, Stripe Checkout Session creation, webhook
handler with signature verification + idempotent `PaymentEvent`, Order
and Payment state machines, order confirmation page (`/commandes/[id]`,
IDOR-guarded via `requireOwnerOrPermission`).

Checkout is one atomic transaction (`checkoutService.createCheckoutSession`):
reserve N inventory units via `reserveOneUnitInTx` (Phase 4), create the
Order/OrderItems/Payment, all-or-nothing. Only _after_ that commits does
it call Stripe. If Stripe can't be reached, a compensating transaction
releases every reserved unit and cancels the Order/Payment - verified
for real in this sandbox, which has no outbound access to
api.stripe.com: the compensation path isn't mocked, it's exercised by
an actual failed network call every time the test runs.

The Stripe Checkout Session's `expires_at` is set to 30 minutes (not
Stripe's 24h default) specifically to bound how long an abandoned
checkout can hold a unit RESERVED; `checkout.session.expired` in the
webhook is what actually releases it - see "Known gaps" below for what
this does and doesn't cover.

**What could and couldn't be verified in this sandbox** (no outbound
network access to api.stripe.com - confirmed via a direct connection
test, egress policy rejects it): could not exercise a real Stripe test
payment end-to-end. Instead:

- `tests/integration/checkout-compensation.test.ts` - the reservation +
  Order/Payment creation transaction, and the real compensating
  rollback when the (real, actually-failing) Stripe API call fails.
- `tests/integration/stripe-webhook.test.ts` - `checkout.session.completed`
  and `checkout.session.expired` applied via `applyStripeEvent` directly
  (bypassing the network-dependent parts of Stripe entirely): payment
  succeeded, order paid, unit sold; idempotent replay of the same event
  id has no additional effect; a tight completed/expired race never
  cancels an already-paid order.
- `tests/integration/stripe-signature.test.ts` - signature verification
  itself (`stripe.webhooks.constructEvent`/`generateTestHeaderString`
  are local HMAC operations, no network needed): a correctly-signed
  payload is accepted, a wrong-secret signature is rejected, a
  tampered payload under a validly-shaped signature is rejected, a
  missing signature header is rejected.
- A full Playwright run (add to cart → cart page → attempt checkout)
  confirmed the user-facing failure mode is a clean, generic error
  message ("Une erreur est survenue...") - never a raw stack trace or
  the underlying network error - and confirmed the reserved unit was
  back to AVAILABLE afterward.

A real Stripe test-mode account and a reachable network are needed to
verify the parts this sandbox structurally cannot: session creation
actually succeeding, redirect to Stripe's hosted page, a real test
card completing a payment, and Stripe's own retry behavior on a slow
webhook response.

**Known gaps, deliberate and tracked:**

- No background job releases a RESERVED unit if Stripe never sends
  `checkout.session.expired` (e.g. the webhook endpoint itself was
  down at the wrong moment) - the outbox/worker pattern in
  ARCHITECTURE.md §1 isn't built yet. Until it is, a stuck reservation
  needs a manual admin fix. This is the same class of gap as rate
  limiting/MFA (Phase 8): known, bounded (30-minute session expiry
  caps the exposure), not silently absorbed.
- No shipping address flow - `Order.shippingAddressId`/`billingAddressId`
  are nullable and unused for now. Out of this phase's scope (payment,
  not fulfillment); the Shipping module is a later phase.
- `calculateOrderTotal`'s VAT rate (21%, Belgium standard) is a
  placeholder, explicitly not a substitute for professional tax
  configuration before real transactions (brief §54) - see the comment
  in `server/domain/pricing/calculateOrderTotal.ts`.
- Guest checkout doesn't exist - `Cart.userId` is required, matching
  DATABASE.md's note that guest/session carts are a later extension.

## Phase 6 — Buyback (MVP slice) ✅ done

Full state machine (`server/domain/buyback/stateMachine.ts`, DRAFT →
SUBMITTED → PRE_ESTIMATE → AWAITING_SHIPMENT → RECEIVED → INSPECTION →
VALUATION → CUSTOMER_CONFIRMATION → ACCEPTED/PARTIALLY_ACCEPTED/
REJECTED/CANCELLED → PAYOUT_PENDING → PAID → RECONDITIONING →
AVAILABLE_FOR_RESALE, BUYBACK.md §1) and a pure
`BuybackValuationService` (`server/domain/buyback/valuation.ts`,
BUYBACK.md §4) reused unchanged for both the customer-facing
pre-estimate range and the inspector-facing definitive final value.
BuybackRequest/BuybackItem submission with eligibility gates
(category `BuybackRule.active`, personalization opt-out) that fail
closed; shipment confirmation and warehouse receiving (creates one
InventoryItem per item in `INSPECTION`/`PENDING_INSPECTION` from the
moment goods physically arrive, not at the end of the pipeline - see
the comment in `buybackService.receiveShipment`); per-item Inspection
recording with `discrepancyFlag` when observed condition differs from
declared, and a required `buyback.approve` gate before the customer
ever sees a definitive number; customer accept/reject per item
(`deriveRequestStatusFromItems`, BUYBACK.md §2) with the Payout created
in the same transaction as the accepting status update (BUYBACK.md
§7); payout release with **maker-checker enforced for every payout**
(the valuation approver may never also release the money - see
`payoutService.releasePayout`, a deliberately stricter simplification
than BUYBACK.md §7's "high-value payouts" wording, since no
per-category threshold field exists yet to carve out an exception);
reconditioning that creates a dedicated single-unit ProductVariant per
reconditioned item (so real per-unit resale pricing flows through the
existing cart/checkout pricing path unchanged - DATABASE.md §4's
per-unit-priced used listing wasn't wired into Phases 3-5's
cart/checkout, and retrofitting that was out of scope here) and only
then flips the InventoryItem `AVAILABLE`, with its own `ProductImage`
rows (never the original Product's marketing photos).

Verified two ways: `tests/integration/buyback-lifecycle.test.ts` runs
the entire state machine against real Postgres in one test file
(submit → accumulate a second item → confirm shipment → receive →
inspect both items, one with a discrepancy → approve valuation →
customer partially accepts → maker-checker-enforced payout release →
reconditioning → a real, purchasable InventoryItem with its own
resale-priced ProductVariant), plus the two eligibility gates. Also
verified live end-to-end through the actual browser UI across all six
actor roles (customer, warehouse, inspector, manager, finance) via
`/rachat` and the five `/personnel/rachat/*` staff queues - this
caught one real bug before it shipped: an empty optional
`overrideValueMinor` form field was coercing to `0` (a defined value)
instead of `undefined`, wrongly tripping the "override requires a
justification" check on every inspection. Fixed with a Zod
`preprocess` step; see the comment in `features/buyback/staffSchemas.ts`.

Staff pages live under `/personnel/rachat/*`, not `/admin` - the
buyback operational roles (INSPECTOR/WAREHOUSE/MANAGER/FINANCE) hold
no `admin.access` permission in SECURITY.md §2's default matrix, so a
separate layout gates on being signed in only, and each page checks
its own specific permission via the service layer.

**Known gaps, deliberate and tracked:**

- The reconditioning pipeline's QUALITY_CHECK/PHOTOS/PRICING sub-steps
  (BUYBACK.md §8) are one staff form submission, not three tracked
  states - `BuybackStatus` itself only has `RECONDITIONING`/
  `AVAILABLE_FOR_RESALE`, no intermediate enum values, so this is a UI
  simplification, not a data-model gap. A multi-screen wizard tracking
  each sub-step individually is a Phase 7 back-office improvement.
- A rejected buyback item's InventoryItem is marked `DISPOSED`
  (`INSPECTION_REJECTED` movement) rather than actually shipped back to
  the customer - there is no "return to customer" InventoryStatus or
  flow yet. Documented simplification, same class as the Phase 5
  known gaps.
- `TrustScoreSnapshot`/`FraudSignal` (DATABASE.md §"Trust & Fraud",
  BUYBACK.md §6) are not built - discrepancy flags are recorded on
  `Inspection` but nothing yet aggregates them into a score. Explicitly
  out of this MVP slice; BUYBACK.md §6's guardrails (human review
  before any consequential action, no protected-characteristic inputs,
  legal sign-off before restricting a real customer) apply once it is.
- No admin UI to edit `BuybackRule` coefficients yet
  (`buyback.rules.write` permission is seeded and granted to MANAGER,
  but nothing reads/writes it from a page) - rules are edited directly
  in the database for now; the UI is a Phase 7 back-office item.
- Guest/unauthenticated buyback doesn't exist, matching Cart's Phase 5
  scope - `BuybackRequest.userId` is required.

## Phase 7 — Admin back-office

Dashboard (orders/stock/buyback/payment KPIs), full catalog/inventory
CRUD, a proper admin UI for the buyback/inspection/payout workflows
Phase 6 already built at `/personnel/rachat/*` (maker-checker on
payouts is already enforced server-side - this phase gives it a
back-office home plus `BuybackRule` coefficient editing), user/role
management, fraud queue, audit log viewer — all with server-side
pagination/filtering (brief §80).

## Phase 8 — Security hardening pass

Dedicated review across: auth, authorization/IDOR, CSRF, XSS, SQLi,
uploads, rate limiting, secrets, Stripe/webhooks, logging — against
`THREAT_MODEL.md` and `SECURITY.md` as the checklist, with the security
test suite from SECURITY.md §13 written and passing.

## Phase 9 — Testing

Full lint/typecheck/unit/integration/E2E/security suite green; the
race-condition, webhook-idempotency, and IDOR tests are explicitly
verified, not just present.

## Phase 10 — Production readiness

`PRODUCTION_CHECKLIST.md` (security, payments, database, infra, legal
sign-off gates) verified before go-live.

## MVP cut line

In scope for MVP: catalog (new + used), cart/checkout/Stripe, orders,
core buyback workflow end-to-end (submit → inspect → accept/reject →
payout → resale), basic admin for catalog/inventory/buyback/users,
core RBAC + audit + rate limiting + upload security.

Explicitly **out of MVP**, built as feature-flagged additions once the
core loop is validated (brief §100 feature flags):
`FEATURE_EVENT_PLANNER` (event-based product recommendations),
`FEATURE_RENTAL`, full B2B/marketplace, subscriptions,
real-time market-price feeds for buyback valuation (MVP uses a
depreciation curve + admin-tunable coefficients instead),
fully-automated fraud auto-decisioning (MVP is signal + human review).

## Open questions requiring business/legal input before Phase 10

- Tax configuration (Belgian VAT rules, EU expansion tax handling) —
  must be validated by a tax professional before go-live (brief §54).
- Data retention periods and GDPR lawful-basis documentation — legal
  review required (brief §78/§109).
- Legal pages (CGV, privacy policy, cookie policy, returns/warranty
  terms) — must be drafted/reviewed by counsel, not generated here.
- Payout method for buyback (Stripe Payouts/Connect vs. manual bank
  transfer batch) — has cost/compliance implications, a business
  decision (brief §125 flags this class of decision as needing
  confirmation).
- MFA enforcement policy for customers (optional vs. mandatory above a
  certain order/buyback value) — product decision.
