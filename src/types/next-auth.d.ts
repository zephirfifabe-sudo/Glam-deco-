import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/db/client";

// Module augmentation for the JWT-plus-revocation-ledger design in
// ADR-003: `sid` carries the Session.jti that every request re-checks,
// and session.user carries our own id/roles (not next-auth's OAuth
// profile fields, which this app's Credentials-only setup never uses).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: Role[];
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    roles?: Role[];
  }
}

// "next-auth/jwt" re-exports this interface via `export *`, which does
// not create a mergeable declaration site - augmenting it here has no
// effect and silently leaves `token.sid` typed as `unknown`. The
// interface is actually declared in "@auth/core/jwt", so that's the
// module that must be augmented for declaration merging to apply.
declare module "@auth/core/jwt" {
  interface JWT {
    sid?: string;
  }
}
