# ADR-001: Modular monolith over microservices

## Status
Accepted

## Context
The platform has many business domains (catalog, inventory, cart,
checkout, buyback, inspection, payouts, fraud, notifications, admin) that
in a large org might eventually become separate services. The team size
and traffic at launch (single-market Belgium launch) do not justify the
operational cost of microservices: distributed transactions, service
discovery, cross-service auth, multiple deploy pipelines, network
failure modes.

## Decision
Build a **single Next.js application** (modular monolith). Enforce
module boundaries at the *code* level, not the network level:

- `server/domain/<module>` — pure business logic, framework-agnostic,
  no imports from `next/*` or React.
- `server/services/<module>` — orchestration, transactions, calls to
  repositories and external integrations (Stripe, storage, email).
- `server/repositories/<module>` — the only code allowed to import the
  Prisma client for that module's tables.
- `features/<module>` — Next.js-facing glue (Server Actions, route
  handlers, UI).

Cross-module calls go through a module's public service interface only
(e.g. `checkout` calls `InventoryService.reserve()`, never touches the
`inventory` Prisma models directly). This keeps a future extraction to
services possible (each `server/services/<module>` + its repository
becomes the seam) without paying the distributed-systems tax today.

## Consequences
- One deploy, one database, one transaction boundary → correctness is
  much easier to guarantee for money/inventory operations (see
  ADR-002/DATABASE.md on using real DB transactions for checkout and
  buyback state changes).
- Module boundaries are convention + lint-enforced (ESLint
  `import/no-restricted-paths` or similar), not physically enforced —
  requires code review discipline.
- If a specific module (e.g. fraud scoring, image processing) later
  needs independent scaling or a different language, it can be peeled
  off because its service/repository boundary is already explicit.

## Alternatives considered
- **Microservices from day one**: rejected — premature, would slow down
  a single-team MVP and multiply the attack surface without a
  corresponding traffic/organizational need.
- **Pure "fat page.tsx" approach**: rejected — explicitly forbidden by
  the brief and it is genuinely unsafe for financial logic (untestable,
  no clear authorization boundary).
