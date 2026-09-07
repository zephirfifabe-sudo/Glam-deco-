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

## Phase 4 — Inventory

InventoryItem/InventoryLocation/InventoryMovement; reservation +
release logic; the row-locking allocation transaction and its
concurrency test (DATABASE.md §5) — built and tested before checkout
depends on it.

## Phase 5 — Cart + Checkout + Stripe

Cart (server-recomputed pricing only), checkout flow, Stripe Checkout
Session creation, webhook handler with signature verification +
idempotent `PaymentEvent`, Order state machine, order confirmation +
tracking pages. E2E: signup → purchase → Stripe test payment → webhook
→ order marked paid; plus the last-unit concurrent-purchase test.

## Phase 6 — Buyback (MVP slice)

BuybackRequest/BuybackItem submission with pre-estimate
(BuybackValuationService v1 + a first set of BuybackRule rows),
shipment-back tracking, Inspection UI for INSPECTOR role, valuation
finalization, customer confirmation, Payout creation (manual
release acceptable for MVP — full maker-checker UI can follow in
Phase 7), reconditioning pipeline stub through to
`AVAILABLE_FOR_RESALE` creating a real purchasable InventoryItem.
E2E: buyback submit → inspect → accept/reject per item → payout →
item resellable.

## Phase 7 — Admin back-office

Dashboard (orders/stock/buyback/payment KPIs), full catalog/inventory
CRUD, buyback/inspection/payout management with maker-checker,
user/role management, fraud queue, audit log viewer — all with
server-side pagination/filtering (brief §80).

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
