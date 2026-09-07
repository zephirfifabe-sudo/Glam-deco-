# ARCHITECTURE

See `docs/adr/` for the reasoning behind each decision below.

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript strict |
| UI | React, Tailwind CSS, small in-house design system (headless + Tailwind, e.g. Radix primitives under the hood for accessibility) |
| Backend | Next.js Server Components / Server Actions / Route Handlers — no separate API server |
| Database | PostgreSQL 16 |
| ORM | Prisma (ADR-002) |
| Validation | Zod, schemas colocated per feature, shared between client form and server action |
| Auth | Auth.js v5 + Prisma adapter + Argon2id + custom TOTP MFA (ADR-003) |
| Payments | Stripe (Checkout Sessions + webhooks) (ADR-004) |
| Storage | S3-compatible, MinIO locally (ADR-006) |
| Cache / rate limiting / locks | Redis |
| Background work | Postgres-backed outbox table + a small worker process (`pnpm worker`) in the same repo, run as a separate container — avoids introducing a full queue broker before it's needed |
| Email | Transactional email provider via a thin `lib/email` adapter (provider chosen at implementation time; templates rendered server-side with React Email or similar) |
| Tests | Vitest (unit/integration), Playwright (E2E) |
| Lint/format | ESLint, Prettier, Husky + lint-staged |
| Infra | Docker, Docker Compose (dev: app, postgres, redis, minio, mailhog) |

## 2. Layering

```
UI (Server/Client Components)
   -> features/<module>/actions.ts   (Server Actions - thin, calls services)
   -> app/api/**/route.ts            (Route Handlers - webhooks, signed uploads, health)
        -> server/services/<module>  (business logic, transactions, orchestration)
             -> server/domain/<module>   (pure logic: state machines, valuation, pricing math - no I/O)
             -> server/repositories/<module> (only place that imports Prisma for that module)
                  -> PostgreSQL
             -> lib/stripe, lib/storage, lib/email (external integrations)
```

Rules:
- `server/domain/**` has **zero** imports from `next`, `react`, `@prisma/client`, or any I/O library. It is pure functions and classes, unit-tested without a database.
- Only `server/repositories/**` imports `@prisma/client`.
- `features/**` (Server Actions, forms) never talks to Prisma or Stripe directly — always through a service.
- Route Handlers under `app/api/**` are used specifically for: Stripe webhooks, signed upload issuance, health checks, and any endpoint that must be called by a non-browser client. Everything else mutates through Server Actions.
- Client Components (`"use client"`) are the exception, not the default. They exist for interactivity (cart quantity steppers, image galleries, forms with client validation feedback) and never hold secrets, Stripe secret keys, or direct DB access.
- Zod schemas live next to the feature they validate and are imported by both the Server Action (authoritative check) and, where useful, the client form (fast feedback only — never trusted).

## 3. Folder structure

```
/
├── src/
│   ├── app/
│   │   ├── (store)/            # public storefront: home, catalog, product, cart, checkout
│   │   ├── (account)/          # authenticated customer area: orders, buybacks, addresses, profile
│   │   ├── admin/              # staff back-office, separate layout, stricter auth guard
│   │   └── api/
│   │       ├── webhooks/stripe/route.ts
│   │       ├── uploads/sign/route.ts
│   │       └── health/route.ts
│   ├── components/             # design system: Button, Input, Modal, Card, ProductCard, Price, ...
│   ├── features/
│   │   ├── auth/ catalog/ cart/ checkout/ orders/ inventory/
│   │   ├── buyback/ inspection/ payments/ payouts/ shipping/
│   │   ├── notifications/ fraud/ reviews/ admin/
│   │   └── <module>/{actions.ts, schemas.ts, components/}
│   ├── server/
│   │   ├── domain/<module>/        # state machines, valuation, pricing, permission logic
│   │   ├── services/<module>/      # orchestration + transactions
│   │   └── repositories/<module>/  # Prisma queries
│   ├── lib/
│   │   ├── db/ (Prisma client singleton)
│   │   ├── auth/ (Auth.js config)
│   │   ├── stripe/ security/ validation/ logging/ permissions/ storage/ email/ redis/
│   └── types/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── worker/                     # background job runner (outbox processor)
├── tests/                      # unit + integration
├── e2e/                        # Playwright specs
├── docs/
│   ├── adr/ architecture/ security/ database/ business/ operations/
├── public/
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## 4. Business domains (module list)

Identity, Catalog (Category/EventType/Tag/Product/ProductVariant/ProductImage),
Inventory (InventoryItem/InventoryLocation/InventoryMovement), Pricing,
Cart, Checkout, Orders, Payments, Shipping, Returns, Buyback, Inspection,
Payouts, Fraud, Notifications, Reviews, Admin, Audit — each maps 1:1 to a
`features/<module>` + `server/services/<module>` pair. See DATABASE.md
for the entities each module owns.

## 5. Product vs InventoryItem

Enforced everywhere: `Product`/`ProductVariant` is the sellable
*description* (marketing content, base price, category). `InventoryItem`
is one *physical unit* (condition, location, status, photos when used,
NEW vs USED). A `Product` can have 0..n `InventoryItem`s. Cart/Order
lines reference a `ProductVariant` **and**, at allocation time, a
specific reserved `InventoryItem`. New-condition items share the
product's marketing photos; used items always carry their own photo set
(never merged automatically — see DATABASE.md §Used listings).

## 6. Concurrency & correctness

- Inventory allocation (checkout) and buyback item state transitions run
  inside a single Prisma interactive transaction with an explicit
  `SELECT ... FOR UPDATE` (raw, parameterized) on the target
  `InventoryItem` row(s) before checking `status = AVAILABLE`, so two
  concurrent buyers for the last unit cannot both succeed. See
  DATABASE.md §Concurrency and the required race-condition test.
- Every financial/stock-affecting operation writes an immutable ledger
  row (`InventoryMovement`, `PaymentEvent`, `PayoutEvent`,
  `ShipmentEvent`) in the same transaction as the state change it
  records — state is always derivable/auditable from the ledger, never
  only from a mutable counter.
- Stripe webhook processing is idempotent via a unique `(provider,
  eventId)` constraint (ADR-004).

## 7. Cross-cutting concerns

- **Permissions**: centralized `PermissionService.can(actor, permission,
  resource?)`, called at the top of every Server Action / Route Handler
  / Server Component that touches non-public data. No scattered
  `role === "ADMIN"` checks (brief §16).
- **Errors**: typed domain errors (`InsufficientInventoryError`,
  `UnauthorizedError`, `InvalidStateTransitionError`,
  `BuybackNotEligibleError`, `PaymentAlreadyProcessedError`, ...) caught
  at the boundary and mapped to safe, generic messages for the client —
  stack traces never reach the browser.
- **Logging**: structured JSON logs (`lib/logging`), one event schema
  (`level, event, actorId, resourceType, resourceId, timestamp,
  metadata`), never raw `console.log(user)`.
- **Audit**: sensitive mutations additionally write an `AuditLog` row
  (see SECURITY.md).

## 8. Non-goals for now (explicitly deferred, not built)

Microservices, event planner recommendations engine, rental, B2B
marketplace, subscriptions — all listed in the brief as future
direction. The module boundaries above are drawn so these can be added
without restructuring, but none are built in the MVP (see ROADMAP.md).
