import { prisma } from "@/lib/db/client";

/** Used on logout (events.signOut) and after a password reset. */
export async function revokeSession(jti: string): Promise<void> {
  await prisma.session.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Kills every active session for a user - used after password reset
 * (an attacker who had a live session should not survive the reset),
 * and available to admin/incident-response tooling later (brief §110).
 */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
