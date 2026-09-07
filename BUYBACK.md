# BUYBACK

The core differentiator: buy → use → sell back → inspect → recondition
→ resell. See ADR-005 for the modeling decision (separate from
Returns) and DATABASE.md §3 for the entities.

## 1. State machine — BuybackRequest

```
DRAFT -> SUBMITTED -> PRE_ESTIMATE -> AWAITING_SHIPMENT -> RECEIVED
      -> INSPECTION -> VALUATION -> CUSTOMER_CONFIRMATION
      -> ACCEPTED | PARTIALLY_ACCEPTED | REJECTED | CANCELLED
ACCEPTED/PARTIALLY_ACCEPTED -> PAYOUT_PENDING -> PAID
PAID -> RECONDITIONING -> AVAILABLE_FOR_RESALE
```
Transitions are enforced by `server/domain/buyback/stateMachine.ts` — a
lookup table of `{from, to, guard}`; any transition not in the table
throws `InvalidStateTransitionError`. `CANCELLED` is reachable from any
pre-`RECEIVED` state (customer changed their mind before shipping
anything back).

## 2. Per-item outcome (BuybackItem)

Each `BuybackItem` carries its own `BuybackItemStatus`
(`PENDING/ACCEPTED/REJECTED`) and its own `finalValueMinor`. The parent
`BuybackRequest.status` is derived: all items accepted → `ACCEPTED`;
mixed → `PARTIALLY_ACCEPTED`; all rejected → `REJECTED`. This derivation
is computed by the service layer whenever an item transitions, never
hand-set independently (avoids the two getting out of sync).

## 3. Eligibility

- Category-level eligibility comes from `BuybackRule.active` per
  category.
- **Personalized items default to `NOT_ELIGIBLE`**
  (`Product.personalizationBuybackEligible = false` by default) —
  covers name, date, photo, text, logo, engraving, custom print. An
  admin can flip this per product to allow exceptions
  (`buyback.rules.write` permission), which is itself audited.
- Quantity caps (`BuybackRule.maxQuantityPerRequest`) and per-user
  frequency limits feed the fraud engine (see THREAT_MODEL.md §7,
  scenario "repeated buyback of same item").

## 4. Valuation

`BuybackValuationService` (pure, framework-agnostic, in
`server/domain/buyback/valuation.ts`) computes:

```
maximumBuybackPrice =
    estimatedResalePrice
  - shippingCost
  - inspectionCost
  - cleaningCost
  - refurbishmentCost
  - storageCost
  - riskMargin
  - desiredMargin
```

Inputs: `originalPrice`, `currentMarketPrice` (falls back to
`originalPrice * depreciationCurve` if no live market signal exists yet
— documented as a simplification pending real resale-price data),
`condition`, `demandMultiplier`, `seasonalityMultiplier`,
`inventoryLevel` (a category already oversupplied gets a lower offer),
plus the cost inputs above sourced from `BuybackRule` and
category-level cost estimates (admin-configurable, not hardcoded —
brief §32/§33).

**Two distinct numbers are always shown, never conflated:**
- **Pre-estimate** (`preEstimateMinMinor`/`preEstimateMaxMinor`): shown
  before the customer ships anything, explicitly labeled indicative
  ("Estimation indicative : 30–40 €"), computed from the customer's
  self-declared condition.
- **Final value** (`finalValueMinor`): computed after inspection from
  the *observed* condition, explicitly labeled definitive ("Valeur
  définitive après inspection : 34 €"), requires customer confirmation
  before payout (`CUSTOMER_CONFIRMATION` state) unless the customer has
  pre-authorized auto-accept within a tolerance band (future
  enhancement, not MVP).

## 5. Inspection

Dedicated staff-only UI (`role: INSPECTOR`, permission
`buyback.inspect`) shows, per item: customer's declared condition +
notes + photos, expected vs. received quantity, a form to record
observed condition, defects, missing parts, inspection photos, and a
proposed value (pre-filled from `BuybackValuationService` re-run with
observed condition, overridable with a required justification note).

**Discrepancy tracking**: if `declaredCondition != observedCondition`,
`Inspection.discrepancyFlag = true` and the delta is recorded. This
feeds TrustScore and fraud signals — it is never silently discarded
(brief §36).

## 6. Trust score

`TrustScoreSnapshot` per user, recomputed periodically from signals:
`declarationAccuracy` (inverse of discrepancy rate), `returnHistory`,
`chargebacks`, `disputes`, `buybackDiscrepancies`,
`duplicateAccountSignals`, `suspiciousActivityFlags`.

Guardrails (brief §37, taken seriously):
- The score is **one input to a manual/automated review threshold**,
  never an auto-ban or auto-reject trigger on its own.
- Signals used are behavioral (accuracy, disputes), never demographic —
  no protected-characteristic inputs, ever.
- Every score computation is explainable (the signal breakdown is
  stored alongside the score, not just the final number) so a human
  reviewer (and, on request, the user under GDPR rights) can see why.
- A human review step exists before any consequential action
  (payout hold, account restriction) — no fully-automated adverse
  action pipeline.
- Legal/regulatory review is required before this scoring is used to
  restrict a real customer in production — flagged as a business/legal
  gate, not something engineering can self-certify.

## 7. Payout

Separate from the Stripe payment used to *buy* items (ADR-004).
`PayoutService` manages `PENDING → PROCESSING → PAID/FAILED/CANCELLED`.
Created only after `CUSTOMER_CONFIRMATION` is accepted, in the same
transaction as the `BuybackItem`/`BuybackRequest` status update that
finalizes acceptance (prevents a double-payout on retried
requests — unique constraint on `(buybackRequestId)` active payout).
High-value payouts (threshold configurable) require maker-checker:
one staff member creates/approves the valuation, a different
authorized staff member releases the payout (brief §41/§82/§102).

## 8. Reconditioning → resale

```
BUYBACK item ACCEPTED -> RECONDITIONING -> QUALITY_CHECK -> PHOTOS
                       -> PRICING -> new InventoryItem AVAILABLE
```
A new `InventoryItem` (acquisitionSource = BUYBACK, condition set from
final inspection outcome after any repair, own photo set — never
inherits the original product's marketing photos, DATABASE.md §4) is
only created and marked `AVAILABLE` at the end of this pipeline. It is
never made purchasable straight out of `PAID`/inspection — quality
check and pricing are mandatory intermediate steps (brief §84).

## 9. Unit economics

Per buyback item, the following are tracked so profitability is
measurable, not assumed (brief §102/§103):

`originalSalePrice, buybackPrice, shippingCost, inspectionCost,
cleaningCost, refurbishmentCost, storageCost, resalePrice,
paymentFees, margin (= resalePrice - buybackPrice - all costs -
paymentFees)`.

Worked example from the brief, reproduced as the target shape of the
`BuybackEconomics` view the admin dashboard exposes per item and
aggregated per category/period:

```
Sale price:        50 €
Buyback price:      25 €
Shipping:            5 €
Inspection:          2 €
Cleaning:            3 €
Storage:             1 €
Fees:                2 €
Total cost:         38 €
Resale price:       45 €
Margin:              7 €
```

This is computed, not hardcoded — `originalSalePrice`,
`buybackPrice`, and `resalePrice` come from real order/buyback/order
rows; the cost components come from `BuybackRule`/category cost config
plus actual `Payment` fee data where available.

## 10. What is deferred past MVP

Auto-accept within a tolerance band without human confirmation,
dynamic real-market-price feeds for `currentMarketPrice` (MVP uses a
depreciation curve + admin-tunable rules), and a fully automated fraud
auto-reject pipeline. All explicitly human-in-the-loop for the MVP —
see ROADMAP.md.
