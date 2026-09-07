# SECURITY

Priority order for this project, restated from the brief and taken as
literal (§128): **Security > Data integrity > Financial integrity >
Business correctness > Reliability > Testability > Performance > UX >
Visual polish.**

## 1. Authentication

See ADR-003. Argon2id, Auth.js JWT sessions backed by a server-side
revocation ledger (checked on every request, so revocation is
immediate), mandatory MFA (TOTP)
for staff roles, email verification, single-use hashed
reset/verification tokens, session revocation on demand, step-up
re-auth for sensitive admin actions.

## 2. Authorization (RBAC)

Roles: `CUSTOMER, SUPPORT, INSPECTOR, WAREHOUSE, FINANCE, MANAGER,
ADMIN, SUPER_ADMIN`.

Representative permission set (extend as modules are built; the point
is centralization, not this exact list being final):

```
product.read        product.write
inventory.read       inventory.write
order.read            order.manage
buyback.read          buyback.inspect      buyback.approve
payout.create         payout.approve       refund.create
user.read             user.manage
fraud.read            fraud.review
audit.read
admin.access
```

Default role→permission matrix (starting point, refined during
implementation):

| Role        | Key permissions                                                              |
| ----------- | ---------------------------------------------------------------------------- |
| CUSTOMER    | own orders/buybacks/addresses only (ownership check, not a permission grant) |
| SUPPORT     | order.read, buyback.read, user.read (limited fields)                         |
| INSPECTOR   | buyback.read, buyback.inspect (own queue)                                    |
| WAREHOUSE   | inventory.read, inventory.write                                              |
| FINANCE     | payout.create, payout.approve (maker-checker split — see §9), refund.create  |
| MANAGER     | product.write, order.manage, buyback.approve, fraud.review                   |
| ADMIN       | admin.access + most of the above                                             |
| SUPER_ADMIN | all, including role management and kill switches                             |

All checks go through one `PermissionService.can(actor, permission,
resource?)` (`lib/permissions`), called at the top of every Server
Action, Route Handler, and any Server Component rendering non-public
data. No scattered `if (user.role === "ADMIN")` checks (brief §16).

## 3. IDOR / broken access control

Every fetch-by-ID of a non-public resource (`orders`, `buybacks`,
`payouts`, `returns`, `addresses`, `uploads`, `invoices`) checks
**ownership OR explicit permission**, server-side, on every call — never
inferred from the fact that the client only _shows_ a link to owned
resources. Non-sequential IDs reduce blind enumeration but are not
treated as an authorization control (brief §14/§17).

## 4. Fraud detection

`FraudDetectionService` produces `LOW_RISK / MEDIUM_RISK / HIGH_RISK /
MANUAL_REVIEW` signals (never a silent auto-block for anything but the
most clear-cut abuse, e.g. a hard rate limit). Sensitive/financial
decisions (large payout, account restriction) always have a human
review step. See THREAT_MODEL.md §7/§11 for scenario coverage.

## 5. Audit logging

Every sensitive mutation (auth events, role changes, order status
overrides, payout approval, refund issuance, kill-switch toggles,
product/price changes, admin data exports) writes an `AuditLog` row:
`actorId, action, resourceType, resourceId, timestamp, result,
metadata, ip, userAgent`. Never logs passwords, tokens, secrets, or full
payment card data.

## 6. Upload security

See ADR-006: server-generated object keys, size limits, MIME allowlist
validated via magic bytes, re-encoding + EXIF stripping, private
storage with signed URLs, no execution context near storage. Antivirus
scanning flagged as a follow-up (THREAT_MODEL.md §8).

## 7. HTTP security headers

Set via `next.config.js` headers or middleware, tuned to not break
Stripe.js/Checkout or Next.js itself:
`Content-Security-Policy` (allow `js.stripe.com`/`checkout.stripe.com`
frame/script sources explicitly, default-src 'self'),
`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (deny camera/mic/geolocation by default, enable
only where a feature genuinely needs it). Exact CSP directives are
finalized and documented once Stripe/analytics/email-tracking domains
are locked in during implementation.

## 8. Rate limiting (Redis-backed, configurable)

| Endpoint class            | Posture                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| login                     | strict, keyed on email+IP                                                                    |
| signup                    | strict, keyed on IP                                                                          |
| password reset request    | strict, keyed on email (not IP-only, to avoid a single email being the sole gate to lockout) |
| email verification resend | strict                                                                                       |
| checkout                  | medium                                                                                       |
| coupon validation         | medium                                                                                       |
| buyback submission        | medium                                                                                       |
| payout requests (staff)   | strict                                                                                       |
| admin endpoints           | strict                                                                                       |
| catalog browsing/search   | generous                                                                                     |

No mechanism allows a stranger who only knows a victim's email to
permanently lock that account (brief §46) — friction/backoff, not a
triggerable hard lock.

## 9. Admin & finance controls

- MFA mandatory for all staff roles.
- Step-up re-authentication for: payout approval, refund issuance,
  role/permission changes, kill-switch toggles, bulk actions.
- **Maker-checker** for payouts/refunds above a configurable threshold:
  the staff member who prepares/approves the valuation is never the
  same one who releases the funds transfer.
- Admin tables: server-side pagination, filtering, search, sorting —
  never dump full tables to the browser (brief §80).
- Bulk actions: permissioned, confirmed, idempotent, audited (brief
  §81).

## 10. Kill switches

Reversible, audited, permissioned toggles (SUPER_ADMIN only) to disable:
checkout, buyback submission, payouts, new registrations — for incident
response (brief §111). Stored as a config row read by the relevant
service at the start of the operation (fail closed: if the flag can't
be read, treat as disabled) rather than scattered environment checks.

## 11. CSRF / XSS / SQL injection

- **CSRF**: mutating Server Actions rely on Next.js's built-in Server
  Action origin checks; Route Handlers that mutate state and accept
  cookies verify `Origin`/`Referer` in addition.
- **XSS**: React's default escaping everywhere; no
  `dangerouslySetInnerHTML` without a documented reason and a sanitizer
  (e.g. DOMPurify) in the one or two places rich text is genuinely
  needed (e.g. admin-authored marketing copy); CSP as defense-in-depth.
- **SQL injection**: Prisma parameterized queries exclusively; the only
  raw SQL in the codebase is the tagged-template, parameterized
  `SELECT ... FOR UPDATE` for inventory locking (DATABASE.md §5) — never
  string concatenation of user input into SQL.

## 12. Secrets

`.env.example` documents required variables with placeholder values
only; `.env`/`.env.production` are gitignored and never committed.
Stripe secret key, webhook secret, DB credentials, auth secret, storage
credentials, email API key — all server-only env vars, never
`NEXT_PUBLIC_*`, never in a Client Component, never in the frontend
bundle. Only `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is public by design
(it's meant to be — Stripe's publishable keys are not secrets).

## 13. Testing the security posture

Automated tests required (not optional, brief §69) for: unauthenticated
access, unauthorized access/IDOR, privilege escalation, brute force /
rate limiting, webhook forgery, webhook replay, race condition
(double-allocation, double-payout), file upload abuse (wrong
MIME/oversized/malicious). See ROADMAP.md for sequencing.

## 14. GDPR posture (engineering-level, not a legal opinion)

Privacy-by-design data model: `Consent` table for explicit consents,
data minimization (inspectors don't see full financial/PII, brief §87),
architecture supports export/erasure/rectification requests (a
`UserDataExportService`/`UserErasureService` reading across owned
tables). Actual retention periods, lawful basis documentation, and
compliance sign-off require professional/legal review before launch —
explicitly not something this document certifies (brief §78/§121).
