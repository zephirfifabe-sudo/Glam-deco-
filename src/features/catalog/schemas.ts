import { z } from "zod";

// Variants/images are entered as one-per-line text in the admin form
// (`SKU;Nom;PrixEnEuros` / `URL;Texte alternatif`) rather than a
// dynamic React list - a pragmatic MVP choice for Phase 3 that avoids
// client-side list state management; revisit if admins find it clunky.
function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface VariantLine {
  sku: string;
  name: string;
  priceMinor?: number;
}

function parseVariantLine(line: string): VariantLine | { error: string } {
  const [sku, name, priceEuros] = line.split(";").map((part) => part?.trim());
  if (!sku || !name) {
    return {
      error: `Ligne de variante invalide : "${line}" (attendu SKU;Nom;Prix optionnel)`,
    };
  }
  if (!priceEuros) {
    return { sku, name };
  }
  const priceMinor = Math.round(Number(priceEuros) * 100);
  if (Number.isNaN(priceMinor)) {
    return { error: `Prix invalide pour "${sku}"` };
  }
  return { sku, name, priceMinor };
}

function parseImageLine(
  line: string,
): { url: string; alt: string } | { error: string } {
  const [url, alt] = line.split(";").map((part) => part?.trim());
  if (!url) {
    return {
      error: `Ligne d'image invalide : "${line}" (attendu URL;Texte alternatif)`,
    };
  }
  return { url, alt: alt || "" };
}

export const productFormSchema = z
  .object({
    title: z.string().trim().min(1, "Le titre est requis.").max(200),
    description: z
      .string()
      .trim()
      .min(1, "La description est requise.")
      .max(5000),
    priceEuros: z.coerce.number().positive("Le prix doit être positif."),
    condition: z.enum(["NEW", "USED"]),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    categoryId: z.string().min(1, "La catégorie est requise."),
    personalizationRequired: z.coerce.boolean().default(false),
    personalizationBuybackEligible: z.coerce.boolean().default(false),
    eventTypeIds: z.array(z.string()).default([]),
    variantsRaw: z.string().default(""),
    imagesRaw: z.string().default(""),
  })
  .transform((data, ctx) => {
    const variantLines = parseLines(data.variantsRaw);
    const imageLines = parseLines(data.imagesRaw);

    // An empty variantsRaw means "generate one default variant" - but
    // the actual SKU is derived from the unique product slug, computed
    // later in productService (a title-derived SKU here would collide
    // whenever two products share a title, since titles aren't unique
    // but slugs are guaranteed to be).
    const variants: VariantLine[] = [];

    for (const line of variantLines) {
      const parsed = parseVariantLine(line);
      if ("error" in parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: parsed.error,
          path: ["variantsRaw"],
        });
        continue;
      }
      variants.push(parsed);
    }

    const images: { url: string; alt: string }[] = [];
    for (const line of imageLines) {
      const parsed = parseImageLine(line);
      if ("error" in parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: parsed.error,
          path: ["imagesRaw"],
        });
        continue;
      }
      images.push(parsed);
    }

    return {
      title: data.title,
      description: data.description,
      basePriceMinor: Math.round(data.priceEuros * 100),
      condition: data.condition,
      status: data.status,
      categoryId: data.categoryId,
      personalizationRequired: data.personalizationRequired,
      personalizationBuybackEligible: data.personalizationBuybackEligible,
      eventTypeIds: data.eventTypeIds,
      variants,
      images,
    };
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(120),
});

export const eventTypeFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(120),
});
