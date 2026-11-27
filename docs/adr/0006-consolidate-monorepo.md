# ADR 0006 — Consolidate five repos into one monorepo

Status: proposed · 2026-11-27

**Context.** The prototype is split across `secrets` (design system), `api.secrets` (api + web),
`ai.secrets`, `voice.secretsapi`, `docs.secrets`. Contracts are copied by hand (`contract.ts` appears
twice), auth semantics drift (the calls service re-implements JWT verification), and there is no single
place to see what is done.

**Decision.** One pnpm monorepo `secrets` with `apps/{web,api,ai,calls}` and
`packages/{shared,ui,tokens,config}`. Port existing code without behaviour change in Phase 1, then
harden. The old repos are archived (read-only) after the port, with a pointer in each README.

**Consequences.** One lockfile, one CI, one contract, atomic cross-cutting PRs. Larger clone and a
single CI queue; mitigated by pnpm filtering (`pnpm --filter @secrets/api test`).
