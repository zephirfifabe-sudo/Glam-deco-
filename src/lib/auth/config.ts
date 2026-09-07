import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { revokeSession } from "@/lib/auth/session";
import { logEvent } from "@/lib/logging/logger";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    // Required by the Credentials provider - Auth.js does not persist
    // Credentials-authenticated users through the adapter, so
    // strategy: "database" is not an option here. Revocability is
    // restored via the Session ledger check in the `session` callback
    // below - see ADR-003's "Correction" section for the full reasoning.
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/connexion",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Same generic failure for "no such user" and "wrong password" -
        // never reveal which one it was (brute-force/enumeration
        // hardening, brief §46). MFA challenge (MfaSecret) is wired up
        // in Phase 8 - see ROADMAP.md; this phase ships password auth
        // only, as scoped.
        if (!user || user.status !== "ACTIVE") {
          logEvent("auth.login_failed", { result: "failure", email });
          return null;
        }

        const validPassword = await verifyPassword(user.passwordHash, password);
        if (!validPassword) {
          logEvent("auth.login_failed", {
            result: "failure",
            actorId: user.id,
          });
          return null;
        }

        logEvent("auth.login_succeeded", {
          result: "success",
          actorId: user.id,
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        // Fresh sign-in: mint a new revocation-ledger row and embed its
        // id in the token. This runs once per sign-in, not per request.
        const session = await prisma.session.create({
          data: {
            jti: crypto.randomUUID(),
            userId: user.id,
            expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          },
        });
        token.sid = session.jti;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      const sid = token.sid;
      if (!sid) {
        return { ...session, user: undefined as never };
      }

      const record = await prisma.session.findUnique({ where: { jti: sid } });
      const isValid =
        record && !record.revokedAt && record.expiresAt > new Date();

      if (!isValid) {
        // Revoked or expired ledger row: the session must stop working
        // on this very request, not after the JWT itself expires
        // (ADR-003). Downstream code treats a userless session as
        // unauthenticated (PermissionService, route guards).
        return { ...session, user: undefined as never };
      }

      const roleAssignments = await prisma.userRoleAssignment.findMany({
        where: { userId: record.userId },
        select: { role: true },
      });

      session.user.id = record.userId;
      session.user.roles = roleAssignments.map((r) => r.role);
      return session;
    },
  },
  events: {
    // Revoke the ledger row immediately on logout - otherwise the JWT
    // cookie, if it ever leaked before the client discarded it, would
    // stay valid until its natural expiry (ADR-003).
    async signOut(message) {
      if ("token" in message && message.token?.sid) {
        await revokeSession(message.token.sid);
      }
    },
  },
});
