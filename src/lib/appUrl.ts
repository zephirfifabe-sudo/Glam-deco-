/** Builds an absolute URL against APP_URL - used for email links and Stripe redirect URLs. */
export function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}
