import { prisma, type Role } from "@/lib/db/client";
import { UnauthenticatedError, UnauthorizedError } from "@/lib/errors";

export interface Actor {
  id: string;
  roles: Role[];
}

/**
 * Centralized authorization (SECURITY.md §2). No feature module should
 * scatter its own `role === "ADMIN"` checks - every Server Action,
 * Route Handler, and Server Component that touches non-public data
 * calls into this module instead.
 *
 * The role -> permission mapping lives in the database (RolePermission
 * table), seeded with the defaults from SECURITY.md §2 in
 * prisma/seed.ts, so admins can adjust it without a deploy (brief §16).
 */
export async function can(
  actor: Actor | null,
  permissionKey: string,
): Promise<boolean> {
  if (!actor || actor.roles.length === 0) {
    return false;
  }

  const grant = await prisma.rolePermission.findFirst({
    where: {
      role: { in: actor.roles },
      permission: { key: permissionKey },
    },
    select: { id: true },
  });

  return grant !== null;
}

/** Throws instead of returning false - use at the top of a mutation. */
export async function requirePermission(
  actor: Actor | null,
  permissionKey: string,
): Promise<void> {
  if (!actor) {
    throw new UnauthenticatedError();
  }
  if (!(await can(actor, permissionKey))) {
    throw new UnauthorizedError();
  }
}

/**
 * The standard IDOR-safe check (THREAT_MODEL.md §2, brief §17): a
 * resource may be read/mutated by its owner, OR by an actor holding the
 * explicit permission. Non-sequential IDs are not a substitute for this
 * check (DATABASE.md §1) - every resource-by-ID access must call this
 * (or `can` directly for non-owned resources) rather than assume the
 * caller only ever links to their own data.
 */
export async function requireOwnerOrPermission(
  actor: Actor | null,
  ownerId: string,
  permissionKey: string,
): Promise<void> {
  if (!actor) {
    throw new UnauthenticatedError();
  }
  if (actor.id === ownerId) {
    return;
  }
  if (!(await can(actor, permissionKey))) {
    throw new UnauthorizedError();
  }
}
