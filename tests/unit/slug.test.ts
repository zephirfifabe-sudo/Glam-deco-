import { describe, expect, it } from "vitest";
import { slugify } from "@/server/domain/catalog/slug";

describe("slugify (pure domain logic, brief §61 SEO-friendly URLs)", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Arche Florale Blanche 2m")).toBe(
      "arche-florale-blanche-2m",
    );
  });

  it("strips French accents", () => {
    expect(slugify("Décoration Baby Shower")).toBe("decoration-baby-shower");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("Guirlande de ballons !!  pastel")).toBe(
      "guirlande-de-ballons-pastel",
    );
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Mariage-- ")).toBe("mariage");
  });
});
