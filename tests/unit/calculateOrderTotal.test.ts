import { describe, expect, it } from "vitest";
import { calculateOrderTotal } from "@/server/domain/pricing/calculateOrderTotal";

describe("calculateOrderTotal (brief §67, VAT-inclusive prices)", () => {
  it("sums line totals into a subtotal", () => {
    const totals = calculateOrderTotal([
      { unitPriceMinor: 15000, quantity: 1 },
      { unitPriceMinor: 4500, quantity: 2 },
    ]);
    expect(totals.subtotalMinor).toBe(15000 + 4500 * 2);
  });

  it("extracts VAT already included in the subtotal, not adding on top", () => {
    const totals = calculateOrderTotal([
      { unitPriceMinor: 15000, quantity: 1 },
    ]);
    // 15000 TTC at 21% -> tax = 15000 - 15000/1.21 (rounded)
    expect(totals.taxMinor).toBe(2603);
    // totalMinor must equal the TTC subtotal, not subtotal + tax again.
    expect(totals.totalMinor).toBe(15000);
  });

  it("defaults shipping to zero (no Shipping module yet)", () => {
    const totals = calculateOrderTotal([{ unitPriceMinor: 1000, quantity: 1 }]);
    expect(totals.shippingMinor).toBe(0);
    expect(totals.totalMinor).toBe(1000);
  });

  it("adds shipping to the total when provided", () => {
    const totals = calculateOrderTotal(
      [{ unitPriceMinor: 1000, quantity: 1 }],
      500,
    );
    expect(totals.totalMinor).toBe(1500);
  });

  it("returns zero totals for an empty cart", () => {
    const totals = calculateOrderTotal([]);
    expect(totals).toEqual({
      subtotalMinor: 0,
      taxMinor: 0,
      shippingMinor: 0,
      totalMinor: 0,
    });
  });
});
