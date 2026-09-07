import { slugify } from "@/server/domain/catalog/slug";
import * as productRepo from "@/server/repositories/catalog/productRepository";
import { ValidationFailedError } from "@/lib/errors";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/server/repositories/catalog/productRepository";

const DEFAULT_PAGE_SIZE = 24;

export function normalizePagination(page?: number, pageSize?: number) {
  return {
    page: page && page > 0 ? page : 1,
    pageSize:
      pageSize && pageSize > 0 && pageSize <= 60 ? pageSize : DEFAULT_PAGE_SIZE,
  };
}

export async function listPublicProducts(
  filters: productRepo.ProductListFilters,
  page?: number,
) {
  const pagination = normalizePagination(page);
  const { items, total } = await productRepo.listPublicProducts(
    filters,
    pagination,
  );
  return {
    items,
    total,
    page: pagination.page,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

export async function getPublicProductBySlug(slug: string) {
  return productRepo.findPublicProductBySlug(slug);
}

export async function listProductsForAdmin(page?: number) {
  const pagination = normalizePagination(page, 20);
  const { items, total } = await productRepo.listProductsForAdmin(pagination);
  return {
    items,
    total,
    page: pagination.page,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

export async function getProductForAdmin(id: string) {
  return productRepo.findProductByIdForAdmin(id);
}

/**
 * Derives a unique slug from the title, appending "-2", "-3", ... on
 * collision - keeps the admin form simple (title in, slug generated)
 * while still guaranteeing the DB's unique constraint never trips on a
 * predictable duplicate title (brief: don't surface a raw constraint
 * violation to an admin user).
 */
async function generateUniqueSlug(
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title);
  if (!base) {
    throw new ValidationFailedError(
      "Le titre doit contenir au moins une lettre ou un chiffre.",
    );
  }
  let candidate = base;
  let suffix = 2;
  while (await productRepo.slugExists(candidate, excludeId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export interface ProductFormInput {
  title: string;
  description: string;
  basePriceMinor: number;
  condition: "NEW" | "USED";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  categoryId: string;
  personalizationRequired: boolean;
  personalizationBuybackEligible: boolean;
  eventTypeIds: string[];
  variants: { sku: string; name: string; priceMinor?: number }[];
  images: { url: string; alt: string }[];
}

/**
 * A default variant's SKU is derived from the unique slug, never the
 * raw title - two products can share a title ("Guirlande de ballons"
 * in two colors, say) but never a slug, so this is the only input that
 * is actually safe against the SKU unique constraint (brief: don't let
 * a predictable admin action surface a raw DB constraint error).
 */
function withDefaultVariant(
  variants: ProductFormInput["variants"],
  slug: string,
  title: string,
): ProductFormInput["variants"] {
  if (variants.length > 0) {
    return variants;
  }
  return [{ sku: slug.toUpperCase(), name: title }];
}

export async function createProduct(input: ProductFormInput) {
  const slug = await generateUniqueSlug(input.title);
  const data: CreateProductInput = {
    ...input,
    slug,
    variants: withDefaultVariant(input.variants, slug, input.title),
  };
  return productRepo.createProduct(data);
}

export async function updateProduct(id: string, input: ProductFormInput) {
  const slug = await generateUniqueSlug(input.title, id);
  const data: UpdateProductInput = {
    ...input,
    slug,
    variants: withDefaultVariant(input.variants, slug, input.title),
  };
  return productRepo.updateProduct(id, data);
}

export async function archiveProduct(id: string) {
  return productRepo.archiveProduct(id);
}

export async function listActiveProductSlugs() {
  return productRepo.listActiveProductSlugs();
}
