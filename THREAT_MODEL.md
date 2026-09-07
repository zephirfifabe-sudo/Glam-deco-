# THREAT MODEL

Format per asset: Threat / Attack Vector / Likelihood / Impact /
Mitigation / Detection / Recovery.

## 1. Account takeover
- **Vector**: credential stuffing, phishing, weak passwords, session
  fixation.
- **Likelihood**: High (public signup, e-commerce = attractive target).
- **Impact**: High — order history, saved addresses, buyback payouts
  redirectable.
- **Mitigation**: Argon2id hashing, rate-limited login (per email+IP),
  MFA mandatory for staff roles / optional-encouraged for customers,
  database sessions (revocable), email notification on new-device
  login, password reset requires current email access + token
  single-use + short expiry.
- **Detection**: spike in failed logins per IP/email (FraudSignal),
  login from new country/device flagged.
- **Recovery**: force session revocation for the user, force password
  reset, review recent orders/buybacks/payout destination changes for
  that account.

## 2. IDOR / broken access control
- **Vector**: `GET /api/orders/<id>`, `/buybacks/<id>`, `/payouts/<id>`,
  `/addresses/<id>`, uploaded file URLs — enumerating or guessing IDs of
  another user's resources.
- **Likelihood**: High if not systematically checked (most common web
  vuln class in practice).
- **Impact**: High — PII, order/financial data leak.
- **Mitigation**: every resource fetch/mutation goes through
  `PermissionService.can(actor, permission, resource)` which checks
  **ownership or explicit permission**, centrally, not ad hoc per route.
  Non-sequential IDs reduce blind guessing but are explicitly **not**
  relied upon as the control (brief §14/§17). Signed URLs for private
  files, short-lived.
- **Detection**: authorization-denial rate per user/IP monitored; a
  user hitting many distinct resource IDs they don't own is a
  FraudSignal.
- **Recovery**: patch the missing check, audit `AuditLog` for the
  window of exposure, notify affected users if data was actually
  accessed (breach assessment).

## 3. Admin/back-office compromise
- **Vector**: phished staff credentials, insider threat, weak admin
  session hygiene.
- **Likelihood**: Medium (smaller user base, but high value target).
- **Impact**: Critical — payouts, refunds, role changes, catalog
  tampering, kill switches.
- **Mitigation**: mandatory MFA for all staff roles, RBAC with least
  privilege (SECURITY.md matrix), step-up re-authentication for
  sensitive actions, maker-checker for high-value payouts/refunds,
  admin audit log for every mutation, admin network/session timeout
  shorter than customer sessions.
- **Detection**: audit log review, alert on role escalation, alert on
  off-hours high-value payout approval.
- **Recovery**: kill switch to suspend payouts/checkout, revoke all
  sessions for the compromised account(s), forced credential rotation,
  audit trail review to assess damage.

## 4. Payment fraud
- **Vector**: stolen cards, chargeback fraud, price manipulation from
  the client, coupon abuse, duplicate payment/payout.
- **Likelihood**: Medium-High at scale.
- **Impact**: High — direct financial loss.
- **Mitigation**: price/tax/total always recomputed server-side
  (never trust cart payload, brief §27/§28), Stripe handles card risk
  scoring (Radar), webhook-driven state (not client redirect), payment
  idempotency via `(provider, eventId)` unique constraint, coupon rules
  server-validated with usage limits enforced transactionally.
- **Detection**: `FraudDetectionService` risk scoring, spike in
  disputes/chargebacks per user tracked toward TrustScore.
- **Recovery**: Stripe dispute workflow, refund/cancel order, ban
  account if confirmed fraud, review related orders from same
  card/device fingerprint if available via Stripe Radar data.

## 5. Webhook forgery / replay
- **Vector**: POST to `/api/webhooks/stripe` without a valid signature;
  replaying a captured legitimate payload.
- **Likelihood**: Medium (endpoint is public by necessity).
- **Impact**: High if unmitigated — fake "payment succeeded" could
  release goods for free.
- **Mitigation**: signature verification against `STRIPE_WEBHOOK_SECRET`
  before any processing (fail closed on verification failure);
  `PaymentEvent(provider, eventId)` uniqueness makes replay a no-op even
  with a valid captured signature+payload (Stripe signatures include a
  timestamp checked for staleness too).
- **Detection**: log + alert on signature verification failures;
  alert on repeated identical `eventId` beyond expected Stripe retries.
- **Recovery**: rotate webhook secret if forgery is suspected to stem
  from a leaked secret, re-sync order state from the Stripe dashboard/API
  for any affected orders.

## 6. Inventory manipulation
- **Vector**: race condition on last unit (§26), direct manipulation of
  `status` without a ledger entry, admin bulk action abuse.
- **Likelihood**: Medium.
- **Impact**: Medium-High — overselling (customer trust/refund cost),
  or stock "disappearing" without audit trail.
- **Mitigation**: row-level locking transaction for allocation
  (DATABASE.md §5), append-only `InventoryMovement` ledger for every
  status change, admin bulk actions permissioned + audited + confirmed.
- **Detection**: automated reconciliation job comparing
  `InventoryItem.status` distribution against the ledger's derived
  state; alert on mismatch.
- **Recovery**: ledger replay to recompute correct state, manual
  adjustment with an `ADJUSTMENT` movement (never a silent edit).

## 7. Buyback fraud
- **Vector**: false condition declaration, sending a different/damaged
  item than described, repeated buyback of the "same" item across
  multiple accounts, counterfeit items, doctored photos.
- **Likelihood**: Medium-High (financial incentive is direct and
  obvious).
- **Impact**: Medium per incident, high in aggregate if unchecked
  (margin erosion).
- **Mitigation**: inspection is authoritative over customer declaration
  (declared vs. observed always both recorded, discrepancy flagged),
  personalized items excluded by default, `FraudDetectionService`
  signals (declaration-accuracy history, buyback discrepancy rate,
  repeated buyback of same variant, duplicate-account detection),
  manual review queue for `MEDIUM_RISK`/`HIGH_RISK`, no automatic
  full-trust payouts above a configurable threshold.
- **Detection**: `Inspection.discrepancyFlag`, TrustScore trend per
  user, category-level buyback-rate anomalies in admin dashboard.
- **Recovery**: reject/adjust the specific `BuybackItem`, hold the
  payout, flag account for manual review, ban on confirmed pattern.

## 8. Malicious upload
- **Vector**: uploading an executable/script disguised as an image,
  oversized files, EXIF-embedded exploits, path traversal via filename.
- **Likelihood**: Medium.
- **Impact**: Medium-High (server compromise if executed, storage
  abuse, XSS if served with wrong content-type).
- **Mitigation**: server-generated object keys (never client filename),
  size limits, MIME allowlist validated via magic bytes (not just
  header), re-encoding, EXIF stripping, private-by-default storage with
  signed URLs, served objects always with explicit safe `Content-Type`
  and `Content-Disposition`, no execution context anywhere near the
  storage path (ADR-006).
- **Detection**: upload validation failure rate per user/IP monitored.
- **Recovery**: delete offending object, ban uploader on repeated
  abuse, review CSP/storage bucket policy.

## 9. Data leak (PII / financial)
- **Vector**: overexposed admin views, verbose error messages/stack
  traces, logs containing secrets, misconfigured storage ACLs, missing
  authorization on export/invoice endpoints.
- **Likelihood**: Medium.
- **Impact**: High — GDPR exposure, reputational damage.
- **Mitigation**: least-privilege field-level access (an inspector does
  not see financial/full PII, brief §87), structured logging that
  never includes passwords/tokens/full card data, generic client-facing
  error messages, private storage with signed URLs, data minimization
  in exports.
- **Detection**: log scanning for accidental secret/PII leakage in CI,
  periodic access review.
- **Recovery**: incident response per GDPR (breach notification
  obligations — legal review required, see §78/§121 "legal validation
  pending").

## 10. Supply chain attack
- **Vector**: compromised npm dependency, malicious GitHub Action,
  compromised base Docker image, typosquatted package.
- **Likelihood**: Medium (industry-wide rising trend).
- **Impact**: High — could compromise the whole platform via CI.
- **Mitigation**: lockfile committed, `npm audit`/Dependabot or Renovate
  enabled, pinned/minimal base images, multi-stage Docker builds,
  no unreviewed dependency additions for trivial functionality,
  CI secrets scoped minimally, no `--no-verify`/secrets in workflow
  logs.
- **Detection**: automated dependency vulnerability scanning in CI.
- **Recovery**: pin/rollback the compromised dependency, rotate any
  secret the CI environment had access to, rebuild and redeploy.

## 11. Fraud scenario checklist (brief §39, mapped to mitigations above)
Multi-account abuse → device/email/IP signals feed FraudSignal + TrustScore.
Coupon abuse → server-side usage limits, per-user constraints.
Refund abuse → return workflow requires reason + review threshold.
Chargeback → Stripe dispute integration + TrustScore signal.
False buyback declaration → inspection discrepancy tracking.
Repeated buyback of same item → variant+user frequency signal.
Photo tampering → manual inspection is authoritative, not customer photos alone.
Counterfeit → inspector training/checklist (process control, not purely technical).
Client-side price tampering → server recomputes all pricing, always.
Webhook replay → signature + idempotency (see §5 above).
Brute force → rate limiting + backoff (SECURITY.md).
IDOR → centralized PermissionService (see §2 above).
Privilege escalation → RBAC centrally enforced, role changes audited + maker-checker for sensitive roles.
Race condition → row locking transaction (DATABASE.md §5) + required test.
