# Audit — existing Secrets work vs. the MVP master prompt

Date: 2026-11-27 · Auditor: architecture pass · Scope: `titan717/{secrets, api.secrets, ai.secrets, voice.secretsapi, docs.secrets}`

## 1. Method

All five repos were cloned, inspected, and the main artefact (`api.secrets`) was installed,
built and executed on this machine (Android/Termux, Node 26.13.1, pnpm 12.22.0).

Verified by execution, not by reading READMEs:

| Check | Result |
| --- | --- |
| `pnpm install` | Fails out of the box: `packageManager: pnpm@9.15.9` ships no `android-arm64` binary (`ERR_PNPM_PNPM_ENGINE_NO_NATIVE_BINARY`). Passes after repinning to pnpm 12 + `--allow-build=esbuild`. |
| `pnpm build` | **Passes.** Web bundle 383 kB main chunk (119 kB gzip), API 123 kB. |
| `node dist/index.js` | **Boots** on PGlite, `/health` → `{"ok":true,"db":"pglite","redis":"off"}`. |
| Signup | **Works.** `POST /v1/auth/signup` → 201 with session token + user. |
| Tests | **Zero.** No test file exists in any of the five repos. |

## 2. What exists (real inventory)

| Repo | Content | Maturity |
| --- | --- | --- |
| `api.secrets` | pnpm monorepo: `apps/api` (Fastify 5, ~1 900 LOC), `apps/web` (React 18 + Vite, 71 `.tsx`), `packages/shared` (329 LOC contracts) | Working prototype, builds and runs |
| `ai.secrets` | Fastify service, Gemini + OpenRouter adapters, SSE streaming, agent loop with step limits, GitHub + Secrets tools, confirm/resume for writes | Working prototype (not executed in this audit) |
| `voice.secretsapi` | Fastify service, LiveKit room creation + access tokens, HS256 JWT verify | Working prototype; membership check optional |
| `secrets` | `packages/tokens` (design tokens, contrast tests), `packages/ui` (19 components), threat model, crypto research | Partial design system |
| `docs.secrets` | PRD, architecture, design system, ADRs 0001–0005, assets | Documentation |

### 2.1 Already solid

- **Data layer**: one parameterized-SQL adapter runs on `pg` **or** embedded PGlite. Migrations are
  idempotent and run at boot. This is the single most valuable existing asset — it makes the product
  runnable on a phone with no database server.
- **Messaging core**: idempotent send on `(sender_id, client_msg_id)` with `ON CONFLICT DO NOTHING`,
  monotonic `seq`, replies, reactions, edits, soft delete, read state, pins, per-conversation search,
  cursor pagination.
- **Realtime**: `/v1/ws`, token auth, `sync {since}` catch-up, `msg.ack` / `msg.new`, typing,
  presence with `last_seen`, ping/pong heartbeat, offline outbox on the client, Redis pub/sub optional.
- **Authorization shape**: a single `access(conversationId, userId, "read"|"write")` helper used by both
  REST and WS paths — the right instinct (one enforcement point, not UI-driven).
- **Sessions**: server-side `sessions` table with `device_id`, revocation checked on **every** request
  and on WS connect; revocation closes live sockets. Session list + per-device revoke exist.
- **Docks**: public/private, handles, channels, roles, join-by-code invites, member management,
  discover endpoint.
- **AI**: provider-adapter abstraction, streaming, stop, step limits, tool registry with `writes` flag,
  confirm-required card, 5-minute approval timeout, key redaction in logs.
- **Design**: dark-first tokens with automated contrast tests, 19 UI components, original identity.

### 2.2 Structural problems

1. **Four repos for one product.** Shared contracts are duplicated by copy (`ai.secrets/src/contract.ts`,
   `voice.secretsapi/src/contract.ts`), auth semantics drift (voice verifies JWT itself), and there is no
   single `IMPLEMENTATION_STATUS.md`. The master prompt explicitly requires a monorepo with shared
   `types`/`validation`.
2. **No tests anywhere.** The prompt demands backend and frontend tests; the prior PRD even says
   "automated tests deferred at the owner's request". That deferral is now the top delivery risk:
   ~1 900 LOC of security-sensitive logic with no regression net.
3. **The prototype went past MVP scope.** `moments`, `notes`, `tasks`, `vault` modules and pages already
   exist (~900 LOC) while auth recovery, notifications, blocks/mutes, reports and audit logs — all
   required by the prompt — do not exist. Effort is inverted relative to the stated MVP.
4. **pnpm pin is non-portable** on this machine (see §1), and `packageManager` blocks every command.
5. **Zero observability**: no Sentry, no structured request IDs, no metrics; logs are Fastify defaults.

## 3. Requirement matrix (master prompt → reality)

Legend: ✅ meets · 🟡 partial · ❌ missing

### Authentication & profiles

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Email + password signup/login | 🟡 | Username + password only. No email field, no email column. |
| Unique usernames, impersonation guard | ✅ | `USERNAME_RE`, `normalizeUsername`, unique index, `username-available`. Reserved names not blocked. |
| Profiles, avatar, display name, status, bio | 🟡 | display name, about, accent; no status field, no avatar upload route found. |
| Password reset | ❌ | No token table, no route. |
| Email verification | ❌ | No route, no provider. |
| Session management / revocation | ✅ | `/v1/auth/sessions`, revoke closes sockets. |
| Account deletion + data export | ❌ | No route. |
| Argon2id/bcrypt | 🟡 | bcryptjs cost 10 — valid but weak cost; no pepper, no rehash-on-login. |
| Rate limiting | 🟡 | In-memory fixed window per instance (`lib/rate.ts`); not Redis, not distributed, only signup/login/messages. |
| CSRF / XSS / clickjacking / headers | ❌ | No helmet, no CSP, no CSRF token. Mitigated only by bearer tokens (no cookies yet). |
| Token storage | ❌ | `zustand/persist` writes the session JWT to **localStorage** (`secrets.session`), directly violating "no sensitive data in localStorage". |
| Session rotation on password change | ❌ | No password change endpoint. |
| Enumeration protection | 🟡 | Login returns generic error; signup reveals `username_taken` (acceptable, but reset/verify flows must not leak). |

### Messaging

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| 1:1 + group, WS delivery | ✅ | `conversations/dm`, `/group`, `/v1/ws`. |
| History pagination | ✅ | `messages` with `seq` cursor. |
| Idempotent client IDs | ✅ | Unique `(sender_id, client_msg_id)` + `ON CONFLICT`. |
| Offline queue + missed sync | ✅ | `lib/outbox.ts`, `sync {since}`. |
| sent/delivered/read | 🟡 | read state exists; no per-recipient delivered state. |
| Replies, reactions, attachments, typing, presence, unread | ✅ | modules present. |
| Message edit/delete | ✅ | `PATCH/DELETE /v1/messages/:id`, soft delete. |
| Conversation + global search | 🟡 | per-conversation search + user search; no global message search. |
| Block / mute | ❌ | No table, no route. |
| Notifications | ❌ | No table, no route, no push/email. |
| Attachments on object storage | ❌ | Stored as `bytea` in Postgres (`attachments.data`). Prompt requires object storage. |
| Thumbnails, MIME sniffing | 🟡 | `attachments/image.ts` exists; verify magic-byte validation and re-encode. |
| Delete for everyone vs for me | 🟡 | One soft-delete path; no per-user hide. |
| WS graceful degradation | 🟡 | Reconnect/backoff client-side; no polling fallback. |

### Docks

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Public/private, discovery, channels, roles | ✅ | `docks` module, roles owner/admin/member. |
| Invite links: expiry, usage limit, revocation, audit | ❌ | Join-by-code only; no expiry/limit/revocation/audit. |
| Permission enforcement server-side | 🟡 | Role checks present; needs a permission matrix + tests (no `moderator` role). |
| Moderation: report, remove, mute, audit log | ❌ | None. |
| Non-member isolation | 🟡 | Channel access via `access()`; needs explicit tests for private docks + calls. |

### Calls

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| LiveKit tokens, rooms, mute/camera/screenshare UI | ✅ | `voice.secretsapi` + `CallStage` (604 kB chunk). |
| Token only after membership check | ❌ | `checkMembership` returns `true` when `SECRETS_API_URL` is unset and has an `anonymous` path. Fail-open. |
| Short-lived tokens | 🟡 | Verify TTL; no server-side room membership registry. |
| Group limits, quality indicators, reconnect | 🟡 | UI exists; no documented limits/telemetry. |

### AI

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Gemini + OpenRouter, streaming, stop, history | ✅ | Adapters + SSE + stop. |
| BYOK keys on device | ✅ | localStorage `secrets.ai.settings`, sent as headers, redacted in logs. |
| Markdown, code copy, regenerate, edit prompt | 🟡 | Markdown renderer exists; verify regenerate/edit. |
| Provider/model/effort selection | ✅ | Effort → step limits + reasoning params. |
| Agent tools + confirmation cards | ✅ | `confirm_required`, timeout, deny path. |
| Auto-approve option | ⚠️ | Exists (`auto_approve`); prompt requires approval for **every** write in MVP. |
| Context consent (which conversation/Dock/files) | 🟡 | `read_conversation`, `summarize_dock_channel` tools exist; no explicit per-request consent UI. |
| Keys never logged | ✅ | Header redaction. |
| Task/note tools as placeholders only | ⚠️ | Real `notes`/`tasks` features exist in the prototype; decide before launch. |

### Platform

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Responsive web, dark/light | ✅ | Shell + bottom nav + theme tokens. |
| Global search | 🟡 | Users + per-conversation only. |
| Notifications/unread | 🟡 | Unread counts; no notification centre. |
| Loading/empty/error/offline states | 🟡 | Components exist; coverage unverified. |
| Virtualized lists | ❌ | No virtualizer dependency; long lists render fully. |
| Performance budgets | ❌ | Not defined or measured. |
| Accessibility | 🟡 | Semantic components + focus styles; no audit, no keyboard test. |
| Error tracking / monitoring | ❌ | None. |
| Feature flags | ❌ | None. |
| Offline detection banner | 🟡 | Reconnect logic; verify banner. |

## 4. Security findings (prioritized)

| # | Severity | Finding | Fix phase |
| --- | --- | --- | --- |
| S1 | **High** | Session JWT persisted in `localStorage`; any XSS yields full account takeover. | P2 (cookie sessions) |
| S2 | **High** | Calls service fails open on membership (`checkMembership` → `true` when API URL unset; `anonymous` caller path). | P5 |
| S3 | **High** | No automated tests on authorization boundaries (IDOR regressions undetectable). | P1 |
| S4 | Medium | Attachments served from DB with client-supplied MIME; no magic-byte sniff/re-encode confirmed. | P3 |
| S5 | Medium | In-memory rate limits: bypassable by multi-instance and reset on deploy. | P2 |
| S6 | Medium | No CSP / security headers / clickjacking protection. | P2 |
| S7 | Medium | `x-secrets-token` header accepted as an auth alternative — undocumented surface, must be scoped or removed. | P2 |
| S8 | Medium | WS token accepted via query string (proxy logs). Cookie auth removes this. | P2 |
| S9 | Low | bcrypt cost 10, no rehash-on-login. | P2 |
| S10 | Low | `cors: origin true` with credentials when `CORS_ORIGIN=*`. | P2 |

## 5. Reuse decision

Keep and refactor — do **not** rewrite:

- SQL adapter + PGlite fallback + migrations (port into `packages/db`).
- Messaging/realtime pipeline and shared contracts (port into `packages/shared`).
- AI service and calls service (port into `apps/ai`, `apps/calls`, harden).
- Design tokens + UI kit (port into `packages/tokens`, `packages/ui`).
- Out-of-scope modules (`moments`, `notes`, `tasks`, `vault`) move behind a feature flag
  (`FEATURES_EXPERIMENTAL=0` default) — kept as prototypes, hidden from the MVP surface.

## 6. Effort estimate to MVP (single engineer, AI-assisted)

| Phase | Scope | Estimate |
| --- | --- | --- |
| P1 | Monorepo consolidation, CI, test harness, flags, status file | 2–3 days |
| P2 | Auth hardening (cookies/CSRF, email verify, reset, delete/export, Argon2-grade hashing) | 4–6 days |
| P3 | Messaging hardening (object storage, blocks/mutes, notifications, global search, virtualization) | 5–7 days |
| P4 | Docks (invite lifecycle, audit log, moderation, permission tests) | 3–4 days |
| P5 | Calls (fail-closed membership, limits, reconnection, quality) | 2–3 days |
| P6 | AI (context consent, approval-only writes, provider failure UX) | 3–4 days |
| P7 | Security review, observability, load test, launch checklist | 3–4 days |

**Total: ~4–5 weeks** of focused work, with a usable increment at the end of every phase.
