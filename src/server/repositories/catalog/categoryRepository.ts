import { prisma } from "@/lib/db/client";

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function findCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export async function createCategory(data: {
  slug: string;
  name: string;
  parentId?: string | null;
}) {
  return prisma.category.create({ data });
}
