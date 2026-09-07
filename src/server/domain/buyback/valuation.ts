import type { Condition } from "@/lib/db/client";

// Pure, framework-agnostic (ADR-005): no React/Next.js/Prisma import
// here, so it is unit-testable in isolation and reused unchanged by
// both the pre-estimate flow (customer-facing, self-declared
// condition) and the post-inspection flow (inspector-facing, observed
// condition) - see BUYBACK.md §4.

// Used only to compute the low end of the pre-estimate range
// (BUYBACK.md §4: the range must reflect that inspection could reveal
// a worse-than-declared condition) - never used to auto-downgrade a
// real inspection result, which always uses the inspector's own
// observedCondition, not a guess.
const CONDITION_DEGRADATION_ORDER: Condition[] = [
  "NEW",
  "LIKE_NEW",
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "DAMAGED",
  "INCOMPLETE",
  "UNUSABLE",
];

function oneStepWorse(condition: Condition): Condition {
  const index = CONDITION_DEGRADATION_ORDER.indexOf(condition);
  if (index === -1 || index === CONDITION_DEGRADATION_ORDER.length - 1) {
    return condition;
  }
  return CONDITION_DEGRADATION_ORDER[index + 1] ?? condition;
}

export type InventoryLevel = "LOW" | "NORMAL" | "OVERSUPPLIED";

// BUYBACK.md §4: "a category already oversupplied gets a lower offer."
const INVENTORY_LEVEL_FACTOR: Record<InventoryLevel, number> = {
  LOW: 1.05,
  NORMAL: 1,
  OVERSUPPLIED: 0.85,
};

// conditionMultipliers doubles as the admin-tunable "depreciation
// curve" BUYBACK.md §4 describes for when no live currentMarketPrice
// exists yet - reusing BuybackRule's per-condition map instead of a
// second hardcoded curve keeps pricing in exactly one admin-editable
// place (brief §32/§33), not two that could drift apart.
export interface BuybackRuleInput {
  conditionMultipliers: Partial<Record<Condition, number>>;
  seasonMultiplier: number;
  demandMultiplier: number;
  shippingCostMinor: number;
  inspectionCostMinor: number;
  cleaningCostMinor: number;
  refurbishmentCostMinor: number;
  storageCostMinor: number;
  riskMarginRate: number;
  desiredMarginRate: number;
  minPayoutMinor: number;
  maxPayoutMinor: number | null;
}

const DEFAULT_CONDITION_MULTIPLIER = 0.5;

export interface ValuationBreakdown {
  adjustedResalePriceMinor: number;
  totalCostsMinor: number;
  riskMarginMinor: number;
  desiredMarginMinor: number;
  valueMinor: number;
}

/**
 * BUYBACK.md §4:
 *   maximumBuybackPrice = estimatedResalePrice - shippingCost -
 *     inspectionCost - cleaningCost - refurbishmentCost - storageCost -
 *     riskMargin - desiredMargin
 * clamped to [minPayoutMinor, maxPayoutMinor].
 */
export function computeBuybackValue(
  originalPriceMinor: number,
  currentMarketPriceMinor: number | null | undefined,
  condition: Condition,
  inventoryLevel: InventoryLevel,
  rule: BuybackRuleInput,
): ValuationBreakdown {
  const conditionFraction =
    rule.conditionMultipliers[condition] ?? DEFAULT_CONDITION_MULTIPLIER;
  const baseResaleMinor =
    currentMarketPriceMinor ??
    Math.round(originalPriceMinor * conditionFraction);

  const adjustedResalePriceMinor = Math.round(
    baseResaleMinor *
      rule.demandMultiplier *
      rule.seasonMultiplier *
      INVENTORY_LEVEL_FACTOR[inventoryLevel],
  );

  const totalCostsMinor =
    rule.shippingCostMinor +
    rule.inspectionCostMinor +
    rule.cleaningCostMinor +
    rule.refurbishmentCostMinor +
    rule.storageCostMinor;

  const riskMarginMinor = Math.round(
    adjustedResalePriceMinor * rule.riskMarginRate,
  );
  const desiredMarginMinor = Math.round(
    adjustedResalePriceMinor * rule.desiredMarginRate,
  );

  const raw =
    adjustedResalePriceMinor -
    totalCostsMinor -
    riskMarginMinor -
    desiredMarginMinor;

  const floored = Math.max(raw, 0, rule.minPayoutMinor);
  const valueMinor =
    rule.maxPayoutMinor !== null
      ? Math.min(floored, rule.maxPayoutMinor)
      : floored;

  return {
    adjustedResalePriceMinor,
    totalCostsMinor,
    riskMarginMinor,
    desiredMarginMinor,
    valueMinor,
  };
}

export interface PreEstimateInput {
  originalPriceMinor: number;
  currentMarketPriceMinor?: number | null;
  declaredCondition: Condition;
  inventoryLevel?: InventoryLevel;
  rule: BuybackRuleInput;
}

export interface PreEstimateResult {
  preEstimateMinMinor: number;
  preEstimateMaxMinor: number;
}

/**
 * Shown to the customer before anything ships (BUYBACK.md §4) - a
 * range, not a point figure, because the declared condition is
 * self-reported and inspection may find it worse. Always labeled
 * indicative by the caller ("Estimation indicative"); never used as
 * the final payout value.
 */
export function estimatePreEstimateRange(
  input: PreEstimateInput,
): PreEstimateResult {
  const inventoryLevel = input.inventoryLevel ?? "NORMAL";
  const max = computeBuybackValue(
    input.originalPriceMinor,
    input.currentMarketPriceMinor,
    input.declaredCondition,
    inventoryLevel,
    input.rule,
  ).valueMinor;

  const min = computeBuybackValue(
    input.originalPriceMinor,
    input.currentMarketPriceMinor,
    oneStepWorse(input.declaredCondition),
    inventoryLevel,
    input.rule,
  ).valueMinor;

  return {
    preEstimateMinMinor: Math.min(min, max),
    preEstimateMaxMinor: max,
  };
}

export interface FinalValueInput {
  originalPriceMinor: number;
  currentMarketPriceMinor?: number | null;
  observedCondition: Condition;
  inventoryLevel?: InventoryLevel;
  rule: BuybackRuleInput;
}

/**
 * Authoritative post-inspection value (BUYBACK.md §4/§5) - same
 * formula as the pre-estimate but driven by the inspector's observed
 * condition, never the customer's declared one. Labeled definitive by
 * the caller ("Valeur définitive après inspection").
 */
export function calculateFinalValue(input: FinalValueInput): number {
  const inventoryLevel = input.inventoryLevel ?? "NORMAL";
  return computeBuybackValue(
    input.originalPriceMinor,
    input.currentMarketPriceMinor,
    input.observedCondition,
    inventoryLevel,
    input.rule,
  ).valueMinor;
}
