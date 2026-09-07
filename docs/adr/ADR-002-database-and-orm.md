# ADR-002: PostgreSQL + Prisma

## Status

Accepted

## Context

The brief mandates PostgreSQL as the source of truth and asks for a
choice between Prisma and Drizzle, justified.

Requirements that matter for this choice:

- Strong migration history (schema changes are frequent early on, and
  must be reviewable and reversible).
- Real DB transactions with row locking for race-condition-sensitive
  paths (inventory allocation, payout creation, webhook processing).
- A schema that ~10+ engineers-worth of domains (identity, catalog,
  inventory, orders, buyback, inspection, payouts, fraud, audit) can
  read without ambiguity.
- Strict TypeScript types generated from the schema, not hand-maintained.

## Decision

Use **PostgreSQL 16** with **Prisma ORM** (`prisma` + `@prisma/client`).

Rationale over Drizzle:

- **Migration workflow**: `prisma migrate dev` / `migrate deploy`
  produces a reviewable, ordered SQL migration history out of the box,
  which matches the brief's "toutes les modifications de schéma passent
  par migrations" requirement with the least custom tooling. Drizzle Kit
  has improved a lot but Prisma's migration story is still more mature
  for a team that will onboard non-database-specialist contributors.
- **Schema readability as documentation**: the `schema.prisma` file is a
  single, declarative source of truth for ~30 entities, enums, and
  relations — easier to review in a PR than TypeScript table builders
  spread across files, which matters given how large this domain model
  is (section 13 of the brief).
- **Transactions**: `prisma.$transaction([...])` (sequential or
  interactive) covers checkout/buyback/inspection transactional needs.
  For the one case that needs explicit row locking (inventory allocation
  under concurrent purchase, see DATABASE.md §Concurrency), Prisma
  supports raw parameterized SQL (`$queryRaw`/`$executeRaw` with tagged
  templates, still parameterized — no string concatenation) inside an
  interactive transaction to issue `SELECT ... FOR UPDATE`. This gives
  us Drizzle-like SQL control exactly where we need it, without giving
  up Prisma's ergonomics everywhere else.
- **Ecosystem**: mature Next.js integration guides, Prisma Studio for
  local/admin data inspection during development, wide familiarity
  lowers onboarding cost for future engineers.

Trade-off accepted: Prisma's query engine has a small performance and
cold-start overhead compared to Drizzle's thin SQL layer, and Prisma is
less convenient for extremely dynamic/ad-hoc queries. Given this
product's read patterns (catalog browsing, admin tables) are solvable
with indexes + pagination rather than exotic dynamic SQL, this is an
acceptable trade-off.

## Consequences

- All schema changes go through `prisma/schema.prisma` +
  `prisma migrate`. No manual DDL against production.
- Repositories (`server/repositories/*`) are the only files that import
  `@prisma/client`.
- Money fields are `Int` (minor units) never `Float` (see DATABASE.md).
- Any query needing pessimistic locking is isolated, documented, and
  tested (see the race-condition test in `TESTING` strategy).

## Alternatives considered

- **Drizzle ORM**: strong candidate, rejected only on the migration
  maturity / schema-as-documentation trade-off above, not on
  correctness — revisit if the team later needs SQL-level control more
  often than Prisma's raw-query escape hatch comfortably provides.
- **Raw `pg` / query builder (Kysely) only**: rejected — too much
  hand-rolled type generation and migration tooling to build ourselves
  for no clear benefit at this stage.
