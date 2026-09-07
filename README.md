# Glam Déco

Plateforme e-commerce de décoration événementielle avec rachat,
inspection et remise en vente des décorations d'occasion (Belgique,
architecture prête pour une expansion européenne).

This is a **modular monolith** built with Next.js. Before touching the
code, read:

- [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md) - starting state of the repo.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - stack, layering, folder structure.
- [`DATABASE.md`](./DATABASE.md) - entity model, enums, concurrency design.
- [`THREAT_MODEL.md`](./THREAT_MODEL.md), [`SECURITY.md`](./SECURITY.md) - security posture.
- [`BUYBACK.md`](./BUYBACK.md) - the buyback/inspection/payout domain.
- [`ROADMAP.md`](./ROADMAP.md) - phased delivery plan and current status.
- [`docs/adr/`](./docs/adr/) - the reasoning behind each stack decision.

## Stack

Next.js (App Router) + TypeScript strict + Tailwind CSS, PostgreSQL +
Prisma, Auth.js (Credentials + JWT-plus-revocation-ledger sessions, see
ADR-003), Stripe, S3-compatible storage (MinIO locally), Redis, Vitest +
Playwright. See `ARCHITECTURE.md` §1 for the full list and the ADRs for
why each was chosen.

## Local development

### Prerequisites

- Node.js >= 20.9
- Docker + Docker Compose (for Postgres/Redis/MinIO/Mailhog)

### Setup

```bash
git clone <repo-url>
cd glam-deco-
cp .env.example .env      # fill in real values where noted
docker compose up -d postgres redis minio minio-init mailhog
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The app runs at http://localhost:3000. Mailhog's web UI (captured dev
emails - verification links, password resets) is at
http://localhost:8025. MinIO's console is at http://localhost:9001
(login: `glamdeco` / `glamdeco-dev-secret`).

Alternatively, run the whole stack including the app in Docker:

```bash
docker compose up
```

### Test accounts

Seeded by `npm run db:seed` (`prisma/seed.ts`), password
`dev-local-password-only` for all of them - **local development only,
never a real credential**:

| Role      | Email                   |
| --------- | ----------------------- |
| CUSTOMER  | customer@glamdeco.test  |
| SUPPORT   | support@glamdeco.test   |
| INSPECTOR | inspector@glamdeco.test |
| WAREHOUSE | warehouse@glamdeco.test |
| FINANCE   | finance@glamdeco.test   |
| MANAGER   | manager@glamdeco.test   |
| ADMIN     | admin@glamdeco.test     |

## Scripts

| Command                           | Purpose                                  |
| --------------------------------- | ---------------------------------------- |
| `npm run dev`                     | Start the Next.js dev server             |
| `npm run build` / `start`         | Production build / start                 |
| `npm run lint` / `lint:fix`       | ESLint                                   |
| `npm run format` / `format:check` | Prettier                                 |
| `npm run typecheck`               | `tsc --noEmit`                           |
| `npm test`                        | Vitest (unit + integration)              |
| `npm run test:e2e`                | Playwright E2E                           |
| `npm run db:migrate`              | Create/apply a migration (dev)           |
| `npm run db:migrate:deploy`       | Apply pending migrations (CI/production) |
| `npm run db:seed`                 | Run `prisma/seed.ts`                     |
| `npm run db:reset`                | Drop, recreate, migrate, and seed        |
| `npm run db:studio`               | Prisma Studio                            |

## CI

`.github/workflows/ci.yml` runs lint, format check, migrations against a
real Postgres service container, typecheck, tests, and a production
build on every push/PR - a build is not green unless all of these pass
(brief §74/§127). The dependency audit step is informational, not a
hard gate, for the reason documented in that file.

## What's built so far

- **Identity**: signup, email verification, login, logout, password
  reset - JWT sessions with a server-side revocation ledger (ADR-003).
- **Catalog**: public browse/search/filter at `/catalogue`, product
  detail pages at `/produits/[slug]` with SEO metadata, sitemap and
  robots.txt, NEW vs USED listing distinction.
- **Admin back-office** at `/admin` (requires the `admin.access`
  permission - seeded on the `ADMIN`/`SUPER_ADMIN` roles): product
  CRUD with variants/images, category and event-type management,
  server-side pagination.
- **Inventory**: serialized `InventoryItem`s (never a bare stock
  counter), an append-only movement ledger, and race-condition-safe
  reservation/release (`server/services/inventory`) - see
  `tests/integration/inventory-concurrency.test.ts` for the required
  last-unit concurrency test.
- **Cart + Checkout + Stripe**: server-recomputed cart at `/panier`,
  atomic checkout (reserve inventory + create Order/Payment, then
  create the Stripe Checkout Session - with a compensating rollback if
  Stripe can't be reached), a signature-verified and idempotent webhook
  at `/api/webhooks/stripe`, and an IDOR-guarded order confirmation
  page at `/commandes/[id]`.

## Known gaps at this stage of the project (tracked, not hidden)

This repository is at the end of **Phase 5 - Cart + Checkout + Stripe**
(see `ROADMAP.md`). Deliberately not yet built:

- **A real Stripe payment has never actually run** - this sandbox has
  no outbound network access to `api.stripe.com` (verified directly).
  Everything that doesn't require reaching Stripe's API was tested for
  real (signature verification, webhook idempotency and state
  transitions, the reservation transaction, and the compensating
  rollback - which is exercised by a genuine failed network call, not
  a mock). Session creation actually succeeding and a real test card
  completing a payment need a real Stripe test-mode account. See
  `ROADMAP.md` Phase 5 for the exact test-by-test breakdown.
- **No background job releases stock if a webhook is missed** - only
  `checkout.session.expired` (received) frees a stuck RESERVED unit;
  the 30-minute session expiry bounds the exposure but doesn't
  eliminate it. The outbox/worker pattern this needs isn't built yet.
- **No shipping address flow** - out of this phase's scope (payment,
  not fulfillment).

- **Rate limiting** (SECURITY.md §8) - Redis is provisioned but no
  limiter is wired into the auth/admin actions yet. Scheduled for Phase 8.
- **MFA** (TOTP) - the `MfaSecret` table exists but the challenge flow
  isn't wired into login yet. Scheduled for Phase 8.
- **Product photo uploads** - the admin form takes a plain image URL;
  the real signed-upload pipeline (ADR-006: magic-byte validation, EXIF
  stripping, private/public buckets) lands alongside buyback/inspection
  photos in a later phase. The seeded catalog ships with no images on
  purpose, so the storefront's "no photo yet" fallback is what you'll
  see rather than a fake placeholder pipeline.
- **Search** is simple case-insensitive `contains`, not Postgres
  full-text (tsvector+GIN) or Meilisearch - fine at this catalog size,
  flagged in `ROADMAP.md`/`DATABASE.md` as the thing to swap in once it
  isn't.
- **Docker Compose was written to spec but could not be run inside this
  session's sandbox** (no accessible Docker daemon there). Everything
  was instead validated against a real local PostgreSQL instance and a
  real Chromium browser exercising the actual user/admin flows
  end-to-end - see the ADRs and `ROADMAP.md` for what that covered. Run
  `docker compose config` and `docker compose up` in a normal
  environment to confirm the compose file itself before relying on it.
- Buyback (the platform's differentiator) is Phase 6 onward - not
  started yet.
