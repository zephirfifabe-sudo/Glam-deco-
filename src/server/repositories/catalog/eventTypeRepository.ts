import { prisma } from "@/lib/db/client";

export async function listEventTypes() {
  return prisma.eventType.findMany({ orderBy: { name: "asc" } });
}

export async function findEventTypeBySlug(slug: string) {
  return prisma.eventType.findUnique({ where: { slug } });
}

export async function createEventType(data: { slug: string; name: string }) {
  return prisma.eventType.create({ data });
}
