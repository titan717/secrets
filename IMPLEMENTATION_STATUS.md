# Implementation status

Updated: 2026-11-28 · Phase: **3 next** (Phases 0–2 complete)

Legend: ✅ done · 🟡 in progress · ⬜ pending · ⏸ blocked on a decision

## Phase 2 — Auth hardening ✅

| Item | Evidence |
| --- | --- |
| httpOnly session cookie (`secrets_session`, `__Host-` in prod) + CSRF double-submit | `auth/service.ts`, `setSessionCookies`, `csrfOk`; tested |
| Token removed from localStorage; memory-only + cookie restore | `stores/session.ts`, `GET /v1/auth/session` |
| Email required at signup; verification tokens (hashed, 24 h) | migration `008_auth_hardening`, `/v1/auth/verify-email` |
| Password reset: single-use 30 min token, revokes all sessions | `/v1/auth/forgot-password`, `/v1/auth/reset-password`; tested |
| Change password revokes other devices | `/v1/auth/change-password`; tested |
| Account deletion (password-confirmed) + JSON export | `DELETE /v1/me`, `POST /v1/me/export`; tested |
| bcrypt cost 12, generic signup errors (no email enumeration) | `hashPassword`, `signup_failed` |
| Security headers: CSP, HSTS, nosniff, frame-deny, permissions-policy | `app.ts` onSend hook |
| CSRF enforced for cookie-authenticated mutations | 403 `csrf_failed`; tested |
| Audit log for auth, sessions, deletion, export | `audit_logs` table |
| UI: email step, forgot/reset/verify pages, verification banner | `routes/auth/*`, `VerifyBanner` |
| 14 backend integration tests (6 new) | `pnpm test` |

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
| ~~Session in localStorage~~ | fixed in Phase 2: httpOnly cookie + CSRF |
| Calls service membership fail-open | fixed in Phase 5 (D10) |
| ~2 000 LOC with only 8 backend tests | test suite grows every phase; authorization is the first target |
| Android dev environment (no Docker/Postgres) | PGlite + in-process bus; CI uses real Postgres |
| AI provider keys in browser | BYOK is the prompt's requirement; disclose and never log |
