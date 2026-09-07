# ADR-003: Authentication with Auth.js (NextAuth v5) + Argon2id + custom TOTP MFA

## Status
Accepted

## Context
The brief forbids a hand-rolled password system and demands: signup,
login, logout, email verification, forgot/reset password, session
management, MFA for sensitive accounts, brute-force protection.

## Decision
- **Auth.js (NextAuth v5)** with the **Credentials provider** (email +
  password) plus the **Prisma adapter**, using **database sessions**
  (not stateless JWT sessions) so that:
  - sessions can be listed and revoked server-side (brief §15/§110:
    "révoquer sessions"),
  - a compromised admin account can have all sessions killed instantly.
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
  unilaterally, per brief §46; instead exponential login *delay* +
  CAPTCHA-style friction after repeated failures, monitored, never a
  permanent lock triggerable by a stranger).
- Staff/admin routes additionally require **re-authentication**
  (fresh password or MFA challenge, short "step-up" token) before
  sensitive actions: payout approval, refund issuance, role changes,
  kill-switch toggles.

## Consequences
- No plaintext or reversibly-encrypted passwords ever stored.
- Session revocation is a DB write (`Session` row delete), not a
  best-effort JWT blacklist.
- MFA secrets encrypted at rest with a server-side key (KMS/env secret,
  never in git).
- Slightly more code than "just use NextAuth JWT sessions", accepted
  because session revocability is a hard requirement for admin/incident
  response (brief §110/§111).

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
- **Stateless JWT sessions**: rejected — cannot be revoked without an
  extra denylist mechanism, which just reintroduces server-side session
  state anyway.
