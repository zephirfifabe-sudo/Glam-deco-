// Pure, framework/DB-agnostic (ARCHITECTURE.md §2) - the one place
// order money math happens, so it can be unit tested in isolation
// (brief §67 names calculateOrderTotal() explicitly) and never
// duplicated between the cart display and the actual checkout charge.
//
// TAX NOTE (brief §54): DATABASE.md's Order fields don't mandate a
// HT/TTC convention. This implementation treats product prices as
// VAT-inclusive (TTC) - standard B2C display practice in Belgium/EU -
// and *extracts* the VAT already included in the subtotal for
// bookkeeping (taxMinor), rather than adding VAT on top (which would
// double-charge the customer). VAT_RATE_BPS below is a placeholder for
// the single-rate Belgian standard rate and is NOT a substitute for
// professional tax configuration before real transactions run (brief
// §54: "La configuration fiscale devra être validée professionnellement
// avant production").
const VAT_RATE_BPS = 2100; // 21% - Belgium standard rate, placeholder

export interface PricedLine {
  unitPriceMinor: number;
  quantity: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
}

/**
 * `shippingMinor` defaults to 0 - the Shipping module doesn't exist
 * yet (a later phase), so no delivery fee is charged. This is a
 * deliberate scope limit, not a "free shipping" business decision.
 */
export function calculateOrderTotal(
  lines: PricedLine[],
  shippingMinor = 0,
): OrderTotals {
  const subtotalMinor = lines.reduce(
    (sum, line) => sum + line.unitPriceMinor * line.quantity,
    0,
  );

  // VAT extracted from a TTC subtotal: tax = gross - gross / (1 + rate).
  const taxMinor = Math.round(
    subtotalMinor - (subtotalMinor * 10000) / (10000 + VAT_RATE_BPS),
  );

  const totalMinor = subtotalMinor + shippingMinor;

  return { subtotalMinor, taxMinor, shippingMinor, totalMinor };
}
