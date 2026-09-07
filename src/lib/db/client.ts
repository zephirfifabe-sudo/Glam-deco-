import { PrismaClient } from "@prisma/client";

// Re-exported so the rest of the codebase can reference generated enum
// types without importing "@prisma/client" directly (that import is
// restricted to this file and server/repositories/** - see
// eslint.config.mjs and ARCHITECTURE.md §2).
export type { Role } from "@prisma/client";

// Next.js dev mode reloads modules on every change; without this
// global-singleton guard each reload would open a fresh Prisma
// connection pool against Postgres until it runs out of connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
