// Pure, framework/DB-agnostic - ARCHITECTURE.md §2 forbids I/O here.
// Produces clean French-accent-stripped, URL-safe slugs matching the
// SEO-friendly patterns in brief §61 (/decoration-mariage, ...).
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (e.g. e-accent -> e)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
