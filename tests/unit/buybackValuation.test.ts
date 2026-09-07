import { describe, expect, it } from "vitest";
import {
  calculateFinalValue,
  computeBuybackValue,
  estimatePreEstimateRange,
  type BuybackRuleInput,
} from "@/server/domain/buyback/valuation";

const baseRule: BuybackRuleInput = {
  conditionMultipliers: {
    NEW: 0.9,
    LIKE_NEW: 0.8,
    EXCELLENT: 0.7,
    GOOD: 0.6,
    FAIR: 0.45,
    DAMAGED: 0.25,
    INCOMPLETE: 0.15,
    UNUSABLE: 0.05,
  },
  seasonMultiplier: 1,
  demandMultiplier: 1,
  shippingCostMinor: 500,
  inspectionCostMinor: 200,
  cleaningCostMinor: 300,
  refurbishmentCostMinor: 0,
  storageCostMinor: 100,
  riskMarginRate: 0.05,
  desiredMarginRate: 0.15,
  minPayoutMinor: 0,
  maxPayoutMinor: null,
};

describe("computeBuybackValue (BUYBACK.md §4 formula)", () => {
  it("subtracts every cost input from the adjusted resale price", () => {
    const result = computeBuybackValue(10000, null, "GOOD", "NORMAL", baseRule);
    // base resale = 10000 * 0.6 = 6000; no demand/season/inventory adjustment
    expect(result.adjustedResalePriceMinor).toBe(6000);
    expect(result.totalCostsMinor).toBe(500 + 200 + 300 + 0 + 100);
    expect(result.riskMarginMinor).toBe(Math.round(6000 * 0.05));
    expect(result.desiredMarginMinor).toBe(Math.round(6000 * 0.15));
    expect(result.valueMinor).toBe(
      6000 -
        result.totalCostsMinor -
        result.riskMarginMinor -
        result.desiredMarginMinor,
    );
  });

  it("uses a live currentMarketPrice instead of the depreciation curve when given", () => {
    const withMarketSignal = computeBuybackValue(
      10000,
      8000,
      "GOOD",
      "NORMAL",
      baseRule,
    );
    const withoutMarketSignal = computeBuybackValue(
      10000,
      null,
      "GOOD",
      "NORMAL",
      baseRule,
    );
    expect(withMarketSignal.adjustedResalePriceMinor).toBe(8000);
    expect(withMarketSignal.valueMinor).toBeGreaterThan(
      withoutMarketSignal.valueMinor,
    );
  });

  it("gives a worse condition a lower value than a better one", () => {
    const good = computeBuybackValue(10000, null, "GOOD", "NORMAL", baseRule);
    const damaged = computeBuybackValue(
      10000,
      null,
      "DAMAGED",
      "NORMAL",
      baseRule,
    );
    expect(damaged.valueMinor).toBeLessThan(good.valueMinor);
  });

  it("never returns a negative value even if costs exceed resale price", () => {
    const result = computeBuybackValue(
      100,
      null,
      "UNUSABLE",
      "NORMAL",
      baseRule,
    );
    expect(result.valueMinor).toBe(0);
  });

  it("lowers the offer for an oversupplied category and raises it when stock is low", () => {
    const normal = computeBuybackValue(10000, null, "GOOD", "NORMAL", baseRule);
    const oversupplied = computeBuybackValue(
      10000,
      null,
      "GOOD",
      "OVERSUPPLIED",
      baseRule,
    );
    const low = computeBuybackValue(10000, null, "GOOD", "LOW", baseRule);
    expect(oversupplied.valueMinor).toBeLessThan(normal.valueMinor);
    expect(low.valueMinor).toBeGreaterThan(normal.valueMinor);
  });

  it("clamps to maxPayoutMinor when the computed value exceeds it", () => {
    const capped = computeBuybackValue(10000, null, "NEW", "NORMAL", {
      ...baseRule,
      maxPayoutMinor: 1000,
    });
    expect(capped.valueMinor).toBe(1000);
  });

  it("clamps to minPayoutMinor as a floor", () => {
    const floored = computeBuybackValue(100, null, "UNUSABLE", "NORMAL", {
      ...baseRule,
      minPayoutMinor: 500,
    });
    expect(floored.valueMinor).toBe(500);
  });
});

describe("estimatePreEstimateRange (BUYBACK.md §4, indicative range)", () => {
  it("returns a max at the declared condition and a lower min at one condition worse", () => {
    const range = estimatePreEstimateRange({
      originalPriceMinor: 10000,
      declaredCondition: "GOOD",
      rule: baseRule,
    });
    const atDeclared = computeBuybackValue(
      10000,
      null,
      "GOOD",
      "NORMAL",
      baseRule,
    ).valueMinor;
    const oneWorse = computeBuybackValue(
      10000,
      null,
      "FAIR",
      "NORMAL",
      baseRule,
    ).valueMinor;

    expect(range.preEstimateMaxMinor).toBe(atDeclared);
    expect(range.preEstimateMinMinor).toBe(oneWorse);
    expect(range.preEstimateMinMinor).toBeLessThanOrEqual(
      range.preEstimateMaxMinor,
    );
  });

  it("does not go below zero-degradation for the worst possible declared condition", () => {
    const range = estimatePreEstimateRange({
      originalPriceMinor: 10000,
      declaredCondition: "UNUSABLE",
      rule: baseRule,
    });
    expect(range.preEstimateMinMinor).toBe(range.preEstimateMaxMinor);
  });
});

describe("calculateFinalValue (BUYBACK.md §4/§5, post-inspection)", () => {
  it("is driven by the observed condition, not any declared one", () => {
    const value = calculateFinalValue({
      originalPriceMinor: 10000,
      observedCondition: "DAMAGED",
      rule: baseRule,
    });
    expect(value).toBe(
      computeBuybackValue(10000, null, "DAMAGED", "NORMAL", baseRule)
        .valueMinor,
    );
  });
});
