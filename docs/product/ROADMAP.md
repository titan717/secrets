# Roadmap

Status: proposed · 4–5 weeks · every phase ends with a runnable, demoable increment.

## Phase 0 — Audit & architecture (complete)

Deliverables: this documentation set, executed audit with evidence, schema, API contract, security plan.

**Exit:** owner approval of §"Decisions needing sign-off" in `IMPLEMENTATION_STATUS.md`.

## Phase 1 — Consolidation & safety net (2–3 days)

- Create `secrets` monorepo: `apps/{web,api,ai,calls}`, `packages/{shared,ui,tokens,config}`.
- Port code from `api.secrets`, `ai.secrets`, `voice.secretsapi`, `secrets` **without behaviour change**.
- Fix pnpm pin (`pnpm@12`, `onlyBuiltDependencies: [esbuild]`).
- Add Vitest + PGlite test harness; first tests: auth, `access()`, message idempotency, WS sync.
- Add `IMPLEMENTATION_STATUS.md`, feature flags, `experimental` modules hidden.
- CI: install → typecheck → test → build; secret scan (`gitleaks`).

**Exit:** `pnpm test` green; app builds and runs from the new repo; old repos archived (read-only).

## Phase 2 — Auth hardening (4–6 days)

- httpOnly cookie sessions + CSRF token; remove token from localStorage; WS cookie auth.
- Email verification + password reset (provider adapter, console driver in dev).
- Change password, revoke-other-sessions, account deletion, data export job.
- Argon2id if installable, else bcrypt cost 12 with rehash-on-login.
- Redis rate limits (dev fallback), helmet/CSP, strict CORS, audit log.
- Auth UI: verify, forgot/reset, sessions, delete/export screens.

**Exit:** a fresh account can sign up → verify → reset → revoke → delete/export entirely; security tests green.

## Phase 3 — Messaging hardening (5–7 days)

- Attachment storage adapter → R2 presigned uploads; magic-byte validation, re-encode, thumbnails.
- Blocks/mutes, "delete for me", per-recipient delivered/read receipts.
- Notifications (in-app + unread centre) and notification levels.
- Global search (messages + users + conversations) with FTS and scoping.
- Virtualized message/member lists; reconnect banner; offline send verification.
- Tests: cross-tenant isolation, idempotent retries, sync replay, upload abuse.

**Exit:** two accounts exchange text, images and files with receipts, search, blocks and offline recovery.

## Phase 4 — Docks (3–4 days)

- Invite lifecycle: expiry, max uses, revocation, hashed codes, audit.
- Roles: owner/admin/moderator/member/guest with a tested permission matrix; no escalation.
- Moderation: report, remove message, mute member, kick, audit log viewer.
- Public discovery controls; private Dock isolation tests (REST, WS, calls).

**Exit:** a public Dock and a private Dock run side by side; a non-member is denied on every path.

## Phase 5 — Calls (2–3 days)

- Fail-closed membership verification in `apps/calls`; remove anonymous tokens.
- Group rooms with participant limits, role-based publish permissions.
- Reconnection, device change (mic/camera), quality indicator, clear end-of-call.
- Incoming-call notification + ring/accept/decline.

**Exit:** 1:1 and 4-person group calls work; joining a private room without membership is impossible.

## Phase 6 — AI (3–4 days)

- Explicit context selection UI + "context sent" disclosure before streaming.
- Approval required for **every** write (remove auto-approve from MVP surface).
- Provider failure UX (invalid key, quota, timeout, malformed response), stop/regenerate/edit.
- Dock summarization and GitHub tools behind per-user permissions.
- Task/note tools remain placeholders — the experimental features stay hidden.

**Exit:** BYOK Gemini and OpenRouter stream, tools request approval, no key or prompt appears in logs.

## Phase 7 — Launch readiness (3–4 days)

- OWASP ASVS L1 pass; `npm audit`/`osv-scanner` clean; CSP verified in report-only → enforced.
- Observability: Sentry (client + server), request ids, `/ready`, structured logs.
- Load test: 500 concurrent sockets, message p95 within budget.
- Performance budget check; Lighthouse mobile ≥ 90.
- Runbooks: deploy, rollback, key rotation, incident, restore.
- Deploy: Render blueprint (api+web+Postgres+Redis), Vercel for `ai`/`calls` functions, R2 bucket.

**Exit:** production URL, monitoring dashboards, rollback tested.

## Post-MVP (architecture-ready, not built)

Moments → Notes → Tasks → Vault, E2EE (envelope + device keys), passkeys, push notifications,
native apps. Each has a documented extension point already: `experimental` flag, envelope isolation,
provider adapters, storage adapter.

## Definition of done (every phase)

1. Runs locally on this phone (`pnpm dev`, PGlite, no external services).
2. `pnpm typecheck && pnpm test && pnpm build` green in CI.
3. No new `TODO` without an entry in `IMPLEMENTATION_STATUS.md`.
4. Security-relevant change has a test that fails without it.
5. Documentation and API contract updated in the same PR.
