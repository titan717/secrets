# ADR 0008 — SQL repositories instead of an ORM

Status: proposed · 2026-11-27

**Context.** The prompt recommends Drizzle, Prisma or Kysely. The prototype already runs on one
parameterized-SQL adapter that targets both `pg` and embedded PGlite. Prisma needs a native query
engine; Drizzle/Kysely need codegen or type wiring that is awkward on android-arm64 and add a build
step for a small team.

**Decision.** Keep typed repository modules over parameterized SQL. Each module exports narrow
functions (`sendMessage`, `listMessages`, `access`) — never raw SQL to routes. Migrations stay
forward-only and idempotent in `packages/db`.

**Consequences.** Full control of partial indexes, `ON CONFLICT`, `RETURNING` and PGlite compatibility.
We give up generated types; mitigated by DTO mappers in `packages/shared` and integration tests against
the real schema. Revisit if the schema passes ~40 tables or query duplication becomes a defect source.
