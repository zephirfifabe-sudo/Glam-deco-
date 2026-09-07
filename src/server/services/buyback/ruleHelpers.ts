import type { Condition } from "@/lib/db/client";
import type {
  BuybackRuleInput,
  InventoryLevel,
} from "@/server/domain/buyback/valuation";

// Shared between buybackService (pre-estimate) and inspectionService
// (final value) so both stages price from the exact same rule shape
// and inventory heuristic - see BUYBACK.md §4.

// Available-count bands used only to bias the pre-estimate/valuation
// (BUYBACK.md §4: "a category already oversupplied gets a lower
// offer") - not a hard eligibility gate, and deliberately coarse since
// there is no real demand-forecasting signal in this MVP.
export function inventoryLevelFromAvailableCount(
  count: number,
): InventoryLevel {
  if (count === 0) return "LOW";
  if (count > 5) return "OVERSUPPLIED";
  return "NORMAL";
}

export function toRuleInput(rule: {
  conditionMultipliers: unknown;
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
}): BuybackRuleInput {
  return {
    conditionMultipliers:
      (rule.conditionMultipliers as Partial<Record<Condition, number>>) ?? {},
    seasonMultiplier: rule.seasonMultiplier,
    demandMultiplier: rule.demandMultiplier,
    shippingCostMinor: rule.shippingCostMinor,
    inspectionCostMinor: rule.inspectionCostMinor,
    cleaningCostMinor: rule.cleaningCostMinor,
    refurbishmentCostMinor: rule.refurbishmentCostMinor,
    storageCostMinor: rule.storageCostMinor,
    riskMarginRate: rule.riskMarginRate,
    desiredMarginRate: rule.desiredMarginRate,
    minPayoutMinor: rule.minPayoutMinor,
    maxPayoutMinor: rule.maxPayoutMinor,
  };
}
