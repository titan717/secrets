# Implementation status

Updated: 2026-11-27 · Phase: **2 next** (Phase 1 complete)

Legend: ✅ done · 🟡 in progress · ⬜ pending · ⏸ blocked on a decision

## Phase 1 — Consolidation & safety net ✅

| Item | Evidence |
| --- | --- |
| Monorepo created: `apps/{web,api,ai,calls}`, `packages/{shared,ui,tokens}` | `ls apps packages` |
| Prototype ported with no behaviour change | `pnpm typecheck` green across 7 packages |
| pnpm pin fixed for arm64 (`pnpm@12.22.0`, `onlyBuiltDependencies: esbuild`) | `pnpm install` succeeds on this phone |
| Vitest harness + first integration tests | `pnpm test` → **247 tests** (api 8, ui 37, tokens 202) |
| Authorization tests: non-member read/write, private Dock isolation | `apps/api/test/api.test.ts` |
| Idempotency + validation tests | same file |
| Feature flags (server-evaluated, UX-only on client) | `packages/shared/src/flags.ts`, `GET /v1/config` |
| Out-of-scope modules hidden by default | `experimental` flag off; routes redirect, nav hidden |
| CI: typecheck → test → build → services → API smoke → gitleaks | `.github/workflows/ci.yml` |
| Docs merged with existing design-system repo history | merge commit |

Verification on this machine (Android/Termux, Node 26.13.1):

```
pnpm typecheck   ✅ 7/7 packages
pnpm test        ✅ 247 tests
pnpm build       ✅ web + api
pnpm build:services ✅ ai + calls
```

## Phase 0 — Audit & architecture ✅

| Item | Evidence |
| --- | --- |
| GitHub connected (`titan717`) | `gh auth status` |
| Five repos cloned and audited | `docs/engineering/AUDIT.md` |
| Prior prototype installed, built, booted, signup exercised | audit §1 |
| Architecture, data model, API contract, security plan, roadmap | `docs/` |

## Pending

| Phase | Scope | Est. |
| --- | --- | --- |
| 2 | Auth hardening (cookie sessions, verify, reset, delete/export) | 4–6 d |
| 3 | Messaging hardening (R2 uploads, blocks/mutes, notifications, global search) | 5–7 d |
| 4 | Docks (invites, moderation, audit, permission tests) | 3–4 d |
| 5 | Calls (fail-closed membership, group limits, reconnect) | 2–3 d |
| 6 | AI (context consent, approval-only writes, failure UX) | 3–4 d |
| 7 | Security review, observability, load test, deploy | 3–4 d |

## Decisions signed off

D1 monorepo · D2 cookie sessions · D3 realtime in `apps/api` · D4 SQL repositories ·
D5 storage adapter (R2 prod, DB dev) · D6 bcrypt cost 12 (argon2 if available) · D7 Resend + console ·
D8 experimental modules hidden · D9 approval for every AI write · D10 calls fail-closed.

**Also decided:** email required + verified at signup · repo public · push to `main`.

## Known risks

| Risk | Mitigation |
| --- | --- |
| Session still in localStorage | fixed in Phase 2 (D2) — highest-severity finding |
| Calls service membership fail-open | fixed in Phase 5 (D10) |
| ~2 000 LOC with only 8 backend tests | test suite grows every phase; authorization is the first target |
| Android dev environment (no Docker/Postgres) | PGlite + in-process bus; CI uses real Postgres |
| AI provider keys in browser | BYOK is the prompt's requirement; disclose and never log |
