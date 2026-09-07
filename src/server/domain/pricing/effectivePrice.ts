// Pure - a ProductVariant's price overrides its Product's base price
// when set (DATABASE.md "Catalog": "priceMinor overrides
// Product.basePriceMinor when set"). This is the single place that
// rule is applied, so the cart display and the checkout charge can
// never compute two different numbers for the same variant.
export function effectiveUnitPriceMinor(
  variant: {
    priceMinor: number | null;
  },
  product: { basePriceMinor: number },
): number {
  return variant.priceMinor ?? product.basePriceMinor;
}
