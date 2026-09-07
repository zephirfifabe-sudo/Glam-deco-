// Renders integer minor-unit amounts (DATABASE.md §1) as a localized
// price - never do currency math with the formatted string, this is
// display-only.
export function Price({
  amountMinor,
  currency = "EUR",
  className,
}: {
  amountMinor: number;
  currency?: string;
  className?: string;
}) {
  const formatted = new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);

  return <span className={className}>{formatted}</span>;
}
