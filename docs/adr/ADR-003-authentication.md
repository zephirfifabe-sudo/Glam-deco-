# ADR-003: Authentication with Auth.js (NextAuth v5) + Argon2id + custom TOTP MFA

## Status

Accepted

## Context

The brief forbids a hand-rolled password system and demands: signup,
login, logout, email verification, forgot/reset password, session
management, MFA for sensitive accounts, brute-force protection.

## Decision

- **Auth.js (NextAuth v5)** with the **Credentials provider** (email +
  password). **Correction (Phase 2 implementation):** Auth.js does not
  support the `"database"` session strategy together with the
  Credentials provider — Credentials never persists through the adapter,
  so only `session.strategy = "jwt"` is valid here. The database-sessions
  plan below was wrong and is replaced by:
  - **JWT session strategy**, but with a **server-side revocation
    ledger**: at sign-in, the `jwt` callback mints a random `jti` and
    writes a `Session` row (`jti`, `userId`, `expiresAt`, `revokedAt`,
    `userAgent`, `ip`); the `jti` is embedded in the JWT.
  - On **every** authenticated request, the `session` callback (which
    Auth.js invokes server-side whenever `auth()`/`getServerSession()`
    is called — i.e. on every protected Server Component/Action/Route
    Handler) looks up that `jti` in the `Session` table. If the row is
    missing, `revokedAt` is set, or it's expired, the callback returns a
    session with no `user` — the app's `PermissionService`/route guards
    treat a userless session as unauthenticated, so a revoked session
    stops working on its very next request, not just after JWT expiry.
  - This gives the same operational property the original plan wanted
    (kill a session/account instantly for incident response, brief
    §110/§111) while staying inside what Auth.js + Credentials actually
    supports. The cost is one DB read per authenticated request; this is
    the same cost "real" database sessions would have had, so nothing is
    lost in practice — it's a correction of a factual error, not a
    weaker design.
  - The Prisma adapter is still used for `next-auth`'s own bookkeeping
    tables (`Account`, `VerificationToken` shape) where convenient, but
    the revocation-critical `Session` model above is our own, not the
    adapter's default one, precisely because we need the `jti`/`revokedAt`
    fields the adapter's schema doesn't have.
- **Argon2id** (via `@node-rs/argon2` or `argon2`) for password hashing
  — memory-hard, current OWASP recommendation, better than bcrypt for
  new systems.
- **Email verification** and **password reset** implemented as
  short-lived, single-use, hashed tokens stored server-side (never the
  raw token — store `sha256(token)`), sent via the transactional email
  service, consumed once, rate-limited per email/IP.
- **MFA (TOTP)**, built on top of Auth.js rather than provided by it
  (Auth.js has no first-party MFA): a `MfaSecret` table
  (encrypted-at-rest secret), enforced at the credentials-provider
  `authorize()` step for any user whose role is in
  `{SUPPORT, INSPECTOR, WAREHOUSE, FINANCE, MANAGER, ADMIN, SUPER_ADMIN}`
  or who has opted in as a customer. Recovery codes, hashed, single-use.
- **Brute force**: rate limiting (see SECURITY.md) keyed on
  `email+IP` for login, `email` alone for password reset requests
  (so an attacker can't lock out a legitimate user just by knowing
  their email — no account lockout that an attacker can trigger
  unilaterally, per brief §46; instead exponential login _delay_ +
  CAPTCHA-style friction after repeated failures, monitored, never a
  permanent lock triggerable by a stranger).
- Staff/admin routes additionally require **re-authentication**
  (fresh password or MFA challenge, short "step-up" token) before
  sensitive actions: payout approval, refund issuance, role changes,
  kill-switch toggles.

## Consequences

- No plaintext or reversibly-encrypted passwords ever stored.
- Session revocation is a DB write (`Session.revokedAt` set, checked on
  the very next request via the `session` callback) — not a best-effort
  JWT blacklist and not "wait for the token to expire".
- MFA secrets encrypted at rest with a server-side key (KMS/env secret,
  never in git).
- One DB read per authenticated request (session validity check) —
  identical cost to true database sessions, cacheable in Redis with a
  short TTL later if it becomes a bottleneck (invalidate the cache entry
  on revoke, so a kill-switch/logout-all is still immediate).

## Alternatives considered

- **Third-party hosted auth (Clerk/Auth0/WorkOS)**: valid production
  option, especially to offload MFA/brute-force/compliance work: revisit
  if the team wants to buy rather than build once real traffic exists.
  Rejected for the initial build because the brief emphasizes owning the
  security model end-to-end and avoiding new paid external dependencies
  before the business model is validated; this ADR can be superseded.
- **Lucia**: no longer actively maintained as a hosted framework
  (moved to a "roll your own with our guide" model) — more code for us
  to own with less community support than Auth.js.
- **Pure stateless JWT sessions (no server-side check)**: rejected —
  cannot be revoked before natural expiry, which fails the incident-
  response requirement (brief §110/§111) outright. The JWT-plus-ledger
  design above is the middle ground: JWT is required by the Credentials
  provider, the ledger check restores real revocability.
