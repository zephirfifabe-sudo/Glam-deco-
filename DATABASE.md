# DATABASE

PostgreSQL is the source of truth. Prisma manages schema + migrations
(ADR-002). This document describes the entity model conceptually; the
literal `prisma/schema.prisma` is written in Phase 2 from this spec.

## 1. Conventions

- **IDs**: every publicly-referenced row uses a non-sequential ID
  (`cuid2` or UUIDv7) as its primary/external key — never expose an
  auto-increment integer in a URL. This prevents trivial enumeration,
  **but is not an authorization control** — every read/write still goes
  through `PermissionService` (brief §14/§17).
- **Money**: stored as `Int` = minor units (cents), always paired with a
  `currency` (`Char(3)`, ISO 4217, `EUR` at launch). Never `Float`/`Decimal`
  drift risk. Arithmetic on money happens in `server/domain/pricing`
  using integer math only.
- **Timestamps**: `createdAt`, `updatedAt` on every table;
  state-transition tables also keep a dedicated event/ledger table
  rather than only overwriting a `status` column.
- **Soft delete**: used only where audit/legal retention requires it
  (`User` — anonymize instead of hard-delete after GDPR erasure grace
  period; `Product` — deactivate, never delete once it has orders).
  Everything else (`CartItem`, expired tokens) is hard-deleted.
- **Constraints**: foreign keys everywhere a relation exists; `CHECK`
  constraints for enums-as-strings where useful defense-in-depth beyond
  the Prisma/DB enum type; `UNIQUE` constraints for natural keys
  (`Product.slug`, `(User.email)`, `(provider, eventId)` on
  `PaymentEvent`).

## 2. Enums

```
Condition:        NEW | LIKE_NEW | EXCELLENT | GOOD | FAIR | DAMAGED |
                   INCOMPLETE | UNUSABLE | PENDING_INSPECTION

InventoryStatus:   AVAILABLE | RESERVED | SOLD | RETURNED | INSPECTION |
                   REPAIR | DAMAGED | LOST | DISPOSED

InventoryMovementType:
                   PURCHASE_RECEIVED | RESERVED | RELEASED | SOLD |
                   RETURNED | BUYBACK_RECEIVED | INSPECTION_ACCEPTED |
                   INSPECTION_REJECTED | ADJUSTMENT | DAMAGED | LOST

OrderStatus:       PENDING_PAYMENT | PAID | PROCESSING | READY_TO_SHIP |
                   SHIPPED | DELIVERED | COMPLETED | CANCELLED | REFUNDED

PaymentStatus:     PENDING | PROCESSING | SUCCEEDED | FAILED | REFUNDED |
                   PARTIALLY_REFUNDED | DISPUTED

BuybackStatus:     DRAFT | SUBMITTED | PRE_ESTIMATE | AWAITING_SHIPMENT |
                   RECEIVED | INSPECTION | VALUATION |
                   CUSTOMER_CONFIRMATION | ACCEPTED | PARTIALLY_ACCEPTED |
                   PAYOUT_PENDING | PAID | RECONDITIONING |
                   AVAILABLE_FOR_RESALE | REJECTED | CANCELLED

BuybackItemStatus: PENDING | ACCEPTED | REJECTED

PayoutStatus:      PENDING | PROCESSING | PAID | FAILED | CANCELLED

ProductCondition:  NEW | USED   (top-level catalog listing type)

Role:              CUSTOMER | SUPPORT | INSPECTOR | WAREHOUSE | FINANCE |
                   MANAGER | ADMIN | SUPER_ADMIN
```

State-transition tables use these enums via a native Postgres enum type
(via Prisma `enum`), not free-form strings (brief §9/§25 — "les statuts
ne doivent pas être de simples chaînes arbitraires").

## 3. Entity groups

### Identity & access

`User` (email, hashed password, emailVerifiedAt, name, status
[ACTIVE/SUSPENDED/BANNED]), `MfaSecret`, `Session` (our own revocation
ledger, not the Auth.js adapter's default shape — `jti` unique,
`userId`, `expiresAt`, `revokedAt` nullable, `userAgent`, `ip`; checked
on every request per ADR-003's JWT-plus-ledger design), `VerificationToken`
(email verify / password reset, stores a hash of the token, `purpose`,
`expiresAt`, `consumedAt`), `UserRole` (join: user↔role, supports
multiple roles per staff member), `Permission`, `RolePermission`,
`Address` (belongs to `User`, `type`: SHIPPING/BILLING), `Consent`
(GDPR consent records: purpose, grantedAt, revokedAt, source).

### Catalog

`Category` (tree via `parentId`), `EventType` (Mariage, Baby Shower,
Anniversaire, ...), `Tag`, `Product` (slug, title, description,
basePriceMinor, currency, `condition: ProductCondition`, categoryId,
status [DRAFT/ACTIVE/ARCHIVED], personalizationRequired,
personalizationBuybackEligible), `ProductVariant` (size/color/etc.,
own SKU and price override), `ProductImage` (belongs to Product **or**
to a specific InventoryItem — never both; see §6).

### Inventory

`InventoryLocation` (warehouse/zone), `InventoryItem` (productVariantId,
serial/label, `condition`, `status: InventoryStatus`, locationId,
acquisitionSource [PURCHASE_ORDER/BUYBACK], costBasisMinor,
originBuybackItemId nullable), `InventoryMovement` (itemId, `type:
InventoryMovementType`, quantity=1 by default since items are
serialized, fromStatus, toStatus, actorId, reference — polymorphic
reference to Order/BuybackRequest/Adjustment, createdAt). This table is
append-only: it is the ledger the brief requires instead of a bare
`stock` counter (§11).

### Cart & Pricing

`Cart` (userId nullable for guest carts via session), `CartItem`
(productVariantId, quantity — **no price stored client-side**; price is
always recomputed server-side at checkout from current
`ProductVariant`/`Promotion`/`Coupon` state). `Promotion`, `Coupon`
(code, rules, usage limits, expiry).

### Orders & Payments

`Order` (userId, status: OrderStatus, subtotalMinor, taxMinor,
shippingMinor, totalMinor, currency, shippingAddressId,
billingAddressId), `OrderItem` (orderId, productVariantId,
inventoryItemId — the specific unit allocated, unitPriceMinor snapshot,
quantity), `Payment` (orderId, provider=STRIPE, providerPaymentIntentId,
status: PaymentStatus, amountMinor), `PaymentEvent` (paymentId,
provider, `eventId` unique per provider — enforces webhook idempotency,
type, payloadHash, receivedAt, appliedAt).

### Shipping

`Shipment` (orderId, carrier, trackingNumber, status), `ShipmentItem`
(shipmentId, orderItemId), `ShipmentEvent` (shipmentId, status,
occurredAt, raw carrier payload), `ShippingRate`, `Package` (weight,
dimensions).

### Returns (customer return — distinct from Buyback)

`Return` (orderId, userId, reason, status), `ReturnItem` (returnId,
orderItemId, quantity, resolution [REFUND/REPLACEMENT]).

### Buyback

`BuybackRequest` (userId, status: BuybackStatus, submittedAt,
addressId — pickup/return address), `BuybackItem` (requestId,
productVariantId, declaredCondition, declaredNotes, customerPhotos[],
preEstimateMinMinor, preEstimateMaxMinor, status: BuybackItemStatus,
finalValueMinor nullable, rejectionReason nullable,
originalOrderItemId nullable — links back to the original purchase when
known), `BuybackRule` (admin-editable coefficients: categoryId,
conditionMultiplier, seasonMultiplier, demandMultiplier, minPayoutMinor,
maxPayoutMinor, maxQuantityPerRequest, active).

### Inspection

`Inspection` (buybackItemId 1:1, inspectorId, receivedQuantity,
expectedQuantity, declaredCondition [copied], observedCondition,
defects[], missingParts[], inspectionPhotos[], proposedValueMinor,
discrepancyFlag boolean, discrepancyNotes, completedAt).

### Payouts

`Payout` (buybackRequestId, userId, status: PayoutStatus, amountMinor,
method [BANK_TRANSFER/STRIPE], destinationRef), `PayoutEvent` (payoutId,
type, occurredAt, raw provider payload where applicable).

### Trust & Fraud

`TrustScoreSnapshot` (userId, score, computedAt, signals JSON — see
BUYBACK.md §Trust Score for what feeds it and its limits),
`FraudSignal` (userId or orderId or buybackId, type, severity,
detectedAt, status [OPEN/REVIEWED/DISMISSED/CONFIRMED], reviewerId).

### Reviews, Notifications, Admin, Audit

`Review` (productId, userId, rating, body, verifiedPurchase boolean),
`Notification` (userId, type, payload, status [PENDING/SENT/FAILED],
attempts — outbox pattern, see ARCHITECTURE.md §Background work),
`AuditLog` (actorId nullable for system actions, action, resourceType,
resourceId, result, metadata JSON, ip, userAgent, createdAt — **never**
contains passwords/tokens/secrets/full card data).

## 4. Product vs InventoryItem vs "used listing"

- `Product`/`ProductVariant` = commercial description (title, base
  price, marketing photos).
- `InventoryItem` = one physical unit. For `condition = NEW` units, no
  extra photos are required (uses the product's marketing photos). For
  units coming from buyback (`acquisitionSource = BUYBACK`), the
  `InventoryItem` **must** have its own `ProductImage` rows
  (`inventoryItemId` set, `productId` null) — enforced at the
  application layer (service-level invariant) plus a `CHECK` that a
  `ProductImage` row has exactly one of `productId`/`inventoryItemId`
  set, never both, never neither.
- The storefront's used-listing detail page reads: condition,
  conditionNotes, inspectionId (for provenance), photos, included
  accessories, defects, price — all sourced from `InventoryItem` +
  `Inspection`, not from `Product`.

## 5. Concurrency: last-unit race condition

Scenario (brief §26): one `InventoryItem` `AVAILABLE`, two customers
checkout simultaneously.

Guarantee: exactly one allocation succeeds.

Mechanism:

```sql
BEGIN;
SELECT id FROM "InventoryItem"
  WHERE id = $1 AND status = 'AVAILABLE'
  FOR UPDATE;
-- if 0 rows: abort transaction, raise InsufficientInventoryError
UPDATE "InventoryItem" SET status = 'RESERVED' WHERE id = $1;
INSERT INTO "InventoryMovement" (...) VALUES (...);
-- create/attach OrderItem
COMMIT;
```

Run via a Prisma interactive transaction (`prisma.$transaction(async
(tx) => { ... })`) with `$queryRaw`/`$executeRaw` (parameterized) for
the `SELECT ... FOR UPDATE`. A required integration test starts two
concurrent transactions against one `AVAILABLE` item and asserts exactly
one succeeds and one raises `InsufficientInventoryError` (see
ROADMAP.md / testing strategy — this is not optional).

The same pattern (lock → check state → transition → ledger row, all in
one transaction) is reused for: buyback item acceptance, payout
creation (prevent double payout on double-submit), and Stripe webhook
processing (prevent double-apply on duplicate delivery).

## 6. Indexing (initial set, extend as query patterns emerge)

`Product.slug` (unique), `Product.categoryId`, `Product.createdAt`,
`InventoryItem.status`, `InventoryItem.productVariantId`,
`Order.userId`, `Order.status`, `Order.createdAt`,
`BuybackRequest.userId`, `BuybackRequest.status`,
`PaymentEvent(provider, eventId)` (unique), `AuditLog.actorId`,
`AuditLog.createdAt`. No speculative indexes beyond these until real
query plans (`EXPLAIN ANALYZE`) justify more (brief §93).

## 7. Migrations & seed

All schema changes via `prisma migrate dev` (local) /
`prisma migrate deploy` (CI/CD) — never manual DDL. `prisma/seed.ts`
creates: category/event-type taxonomy, a realistic product catalog
(new + used examples with inspections), test users per role (documented
in README, no real secrets), sample orders, buyback requests across
several states, and inspections — so every screen has data to render
against in development.
