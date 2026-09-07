import { prisma } from "@/lib/db/client";
import type { Prisma, ProductCondition, ProductStatus } from "@prisma/client";

// Only server/repositories/** may import @prisma/client (ARCHITECTURE.md
// §2) - this file is the sole place catalog code talks to Prisma models.

export interface ProductListFilters {
  categorySlug?: string;
  eventTypeSlug?: string;
  condition?: ProductCondition;
  query?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

const PUBLIC_INCLUDE = {
  category: true,
  eventTypes: true,
  images: { orderBy: { position: "asc" } },
  variants: true,
} satisfies Prisma.ProductInclude;

// Re-exported so UI code can reference the shape without importing
// "@prisma/client" directly (same pattern as lib/db/client.ts's Role
// re-export - see eslint.config.mjs).
export type PublicProduct = Prisma.ProductGetPayload<{
  include: typeof PUBLIC_INCLUDE;
}>;

function buildWhere(
  filters: ProductListFilters,
  { publicOnly }: { publicOnly: boolean },
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (publicOnly) {
    where.status = "ACTIVE";
  }
  if (filters.categorySlug) {
    where.category = { slug: filters.categorySlug };
  }
  if (filters.eventTypeSlug) {
    where.eventTypes = { some: { slug: filters.eventTypeSlug } };
  }
  if (filters.condition) {
    where.condition = filters.condition;
  }
  if (filters.query) {
    // Simple ILIKE search for the Foundation/Catalog phase - DATABASE.md
    // §"Search" already flags the extension path to real Postgres
    // full-text (tsvector+GIN) or Meilisearch/OpenSearch once the
    // catalog is large enough for this to matter (brief §60, §93 "don't
    // add indexes you can't justify yet").
    where.OR = [
      { title: { contains: filters.query, mode: "insensitive" } },
      { description: { contains: filters.query, mode: "insensitive" } },
    ];
  }
  if (
    filters.minPriceMinor !== undefined ||
    filters.maxPriceMinor !== undefined
  ) {
    where.basePriceMinor = {
      ...(filters.minPriceMinor !== undefined && {
        gte: filters.minPriceMinor,
      }),
      ...(filters.maxPriceMinor !== undefined && {
        lte: filters.maxPriceMinor,
      }),
    };
  }
  return where;
}

export async function listPublicProducts(
  filters: ProductListFilters,
  pagination: Pagination,
) {
  const where = buildWhere(filters, { publicOnly: true });
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: PUBLIC_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total };
}

export async function findPublicProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: PUBLIC_INCLUDE,
  });
}

// --- Admin (no status filter - admins must see drafts/archived too) ---

export async function listProductsForAdmin(pagination: Pagination) {
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      include: { category: true, variants: true, images: true },
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
    prisma.product.count(),
  ]);
  return { items, total };
}

export async function findProductByIdForAdmin(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      eventTypes: true,
      tags: true,
      variants: true,
      images: true,
    },
  });
}

export async function slugExists(slug: string, excludeId?: string) {
  const existing = await prisma.product.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existing !== null && existing.id !== excludeId;
}

export interface CreateProductInput {
  slug: string;
  title: string;
  description: string;
  basePriceMinor: number;
  condition: ProductCondition;
  status: ProductStatus;
  categoryId: string;
  personalizationRequired: boolean;
  personalizationBuybackEligible: boolean;
  eventTypeIds: string[];
  variants: { sku: string; name: string; priceMinor?: number }[];
  images: { url: string; alt: string }[];
}

export async function createProduct(input: CreateProductInput) {
  return prisma.product.create({
    data: {
      slug: input.slug,
      title: input.title,
      description: input.description,
      basePriceMinor: input.basePriceMinor,
      condition: input.condition,
      status: input.status,
      categoryId: input.categoryId,
      personalizationRequired: input.personalizationRequired,
      personalizationBuybackEligible: input.personalizationBuybackEligible,
      eventTypes: { connect: input.eventTypeIds.map((id) => ({ id })) },
      variants: { create: input.variants },
      images: {
        create: input.images.map((image, position) => ({ ...image, position })),
      },
    },
  });
}

export type UpdateProductInput = Omit<CreateProductInput, "eventTypeIds"> & {
  eventTypeIds: string[];
};

export async function updateProduct(id: string, input: UpdateProductInput) {
  return prisma.$transaction(async (tx) => {
    // Variants/images are fully replaced rather than diffed - the admin
    // form always submits the complete desired set, and the dataset per
    // product is small (a handful of rows), so this is simpler and less
    // error-prone than computing a diff for Phase 3's scope.
    await tx.productVariant.deleteMany({ where: { productId: id } });
    await tx.productImage.deleteMany({ where: { productId: id } });

    return tx.product.update({
      where: { id },
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        basePriceMinor: input.basePriceMinor,
        condition: input.condition,
        status: input.status,
        categoryId: input.categoryId,
        personalizationRequired: input.personalizationRequired,
        personalizationBuybackEligible: input.personalizationBuybackEligible,
        eventTypes: {
          set: input.eventTypeIds.map((eventTypeId) => ({ id: eventTypeId })),
        },
        variants: { create: input.variants },
        images: {
          create: input.images.map((image, position) => ({
            ...image,
            position,
          })),
        },
      },
    });
  });
}

export async function listActiveProductSlugs() {
  return prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true, updatedAt: true },
  });
}

export async function archiveProduct(id: string) {
  return prisma.product.update({ where: { id }, data: { status: "ARCHIVED" } });
}
