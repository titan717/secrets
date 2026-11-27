# Architecture

Status: proposed for approval · 2026-11-27

## 1. Shape

One monorepo, four deployables, three shared packages. Not microservices for their own sake:
`api` is the product core; `ai` and `calls` are split only where the dependency is external
(LLM providers, LiveKit SFU) and the failure domain must be isolated.

```
Browser (apps/web, React 18 + Vite)
  │  HTTPS  /v1/*            httpOnly session cookie (same origin)
  │  WSS    /v1/ws           cookie-authenticated socket
  │  SSE    /v1/chat         proxied to apps/ai
  │  WSS    LiveKit          short-lived room token from apps/calls
  ▼
┌──────────────────────────────────────────────────────────────┐
│ apps/api — Fastify 5                                          │
│  auth · users · conversations · messages · docks ·            │
│  attachments · notifications · search · moderation ·          │
│  realtime (WS + Redis pub/sub) · serves apps/web/dist         │
└───────┬───────────────────┬───────────────────┬──────────────┘
        │                   │                   │
   Postgres            Redis (optional)     Object storage
   (prod) / PGlite     presence, pub/sub,   (R2/S3) or DB
   (dev)               rate limits          bytea in dev
        │
        ├──► apps/ai    (stateless, SSE, provider adapters, tool approvals)
        └──► apps/calls (LiveKit token issuance, fail-closed membership)
```

**Why realtime lives inside `apps/api`.** A separate WebSocket service would duplicate session
verification, conversation authorization and message persistence across a network hop, with no
benefit at MVP scale. The module is isolated (`modules/realtime`) behind a bus interface, so it can be
extracted later without touching product code. ADR-0007.

## 2. Stack decisions

| Concern | Decision | Rationale |
| --- | --- | --- |
| Web | React 18 + Vite + TypeScript, react-router, zustand, TanStack Query | Existing, fast builds, no SSR requirement for an authenticated app. |
| Styling | Design tokens (`packages/tokens`) + CSS modules/utility layer, `packages/ui` | Tokens are contrast-tested; avoids a Tailwind migration of 71 components. |
| API | Fastify 5 | Existing; fast cold start on free tiers; first-class WS plugin. |
| DB access | Parameterized SQL repository modules (no ORM) | PGlite compatibility, zero codegen (no native toolchain on Android), full control of indexes and `ON CONFLICT`. Deviation from the "Drizzle/Prisma/Kysely" recommendation is deliberate. ADR-0008. |
| Validation | Zod schemas in `packages/shared`, parsed at the edge | One schema per request shared by client and server; strict, no `any` passthrough. |
| Realtime | WS + in-process bus, Redis pub/sub when `REDIS_URL` set | Single instance works with zero infra; horizontal scaling later. |
| Sessions | Opaque-free HS256 JWT **in an httpOnly cookie**, plus `sessions` row | Revocation is a DB check, so JWT staleness is bounded; cookie removes XSS token theft. ADR-0009. |
| Files | Storage adapter: `s3` (R2/S3, presigned) in prod, `db` (bytea) in dev | Prompt requires object storage; dev must stay zero-config. |
| Calls | LiveKit Cloud or self-hosted SFU; `apps/calls` only issues tokens | Keys never leave the server; room membership enforced server-side. |
| AI | `apps/ai` stateless; BYOK keys travel per request, never persisted | Prompt requires local key storage and no server-side key retention. |
| Email | Provider adapter (Resend) + `console` driver in dev | Verification/reset without a hard vendor dependency. |
| Jobs | In-process scheduler for MVP; BullMQ when Redis is present | No extra infra for a 4-pillar MVP. |

## 3. Request lifecycle

### 3.1 Authenticated REST

1. TLS terminates at the platform proxy; `trustProxy` is on, `X-Forwarded-For` used for rate limits.
2. Security headers (`helmet`): CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.
3. Session cookie (`__Host-secrets_session`) → `verifyToken` → signature, expiry, **DB revocation check**.
4. Zod parse of params/query/body → typed DTO.
5. Handler → repository → Postgres. Authorization is a repository-level check (`access()`), never a
   client claim.
6. Response envelope `{ data }` or `{ error, message, requestId }`.
7. Audit log row for sensitive mutations (auth, roles, invites, deletions, moderation).

### 3.2 Message send (the critical path)

```
client → POST /v1/conversations/:id/messages  (or WS msg.send)
  1. rate limit (user + conversation)
  2. membership + write permission (access)
  3. validate body/attachment refs
  4. INSERT ... ON CONFLICT (sender_id, client_msg_id) DO NOTHING
  5. bump conversation.last_seq in the same transaction
  6. publish {t:"msg.new"} to members via bus
  7. 201 { message }  /  WS msg.ack
```

- Persist **before** ack; the client may retry any un-acked message safely.
- Delivery is at-least-once with idempotent ids → effectively exactly-once for the user.
- `sync {since}` replays from `seq`, so reconnects never duplicate or lose messages.

### 3.3 WebSocket

- Handshake authenticated by the session cookie (same-origin); token-in-query is removed.
- Frames are discriminated unions in `packages/shared/src/ws.ts`; max 128 kB; unknown types rejected.
- Heartbeat 25 s; dead sockets terminated; presence fan-out to contacts only.
- Every frame re-checks authorization; a revoked session closes with code `4001`.

### 3.4 Calls

1. Client asks `POST /v1/calls/:conversationId/token` (through `apps/calls`, forwarding the session cookie).
2. `apps/calls` **must** verify membership against `apps/api` (service token, internal network) —
   fail closed: no API reachable ⇒ 503, never a token.
3. Token TTL ≤ 2 h, room name derived from conversation id, `canPublish` per role.
4. Room metadata records allowed participants; webhooks reconcile disconnects.

### 3.5 AI

1. Client sends `POST /v1/chat` with provider, model, effort, **explicit context selection**, and its
   BYOK key in an `x-provider-key` header.
2. `apps/ai` validates the payload, streams SSE, applies step limits.
3. Write tools emit `confirm_required`; the run pauses up to 5 min; the client must POST approval.
4. Context is fetched through `apps/api` with the user's own session (delegated), never by direct DB access.
5. Logs redact `x-provider-key`, `x-github-token`, prompt bodies and raw provider responses.

## 4. Data boundaries

| Store | Owns | Never holds |
| --- | --- | --- |
| Postgres | users, sessions, conversations, messages, docks, roles, invites, notifications, audit, AI conversation metadata | provider keys, plaintext passwords |
| Redis | presence, typing throttle, distributed rate limits, pub/sub, job locks | durable product data |
| Object storage | attachment bytes + thumbnails | filenames as paths (keys are UUIDs) |
| Browser | BYOK keys, drafts, outbox, UI prefs | session token (cookie only) |

## 5. Reliability

- `/health` (liveness) and `/ready` (DB + migrations applied + storage reachable) per service.
- Request id per call (`x-request-id`), propagated to logs and error responses.
- Graceful shutdown: stop accepting, drain sockets with close code `1001`, close DB pool.
- Retries with exponential backoff + jitter for provider/email/storage calls; circuit breaker on AI providers.
- Idempotency keys on message send, uploads, invites and AI tool approvals.
- Migrations are forward-only, idempotent, and run before traffic.

## 6. Scaling path

| Limit | First move |
| --- | --- |
| API CPU | Stateless replicas behind the proxy; WS sticky by cookie or Redis adapter |
| WS fan-out | Redis pub/sub (already supported) → dedicated gateway |
| Message reads | Indexes on `(conversation_id, seq)`, `(conversation_id, created_at)`; pagination everywhere |
| Unread counts | `conversation_members.last_read_seq` computed, not counted per request |
| Uploads | Presigned direct-to-R2, API never proxies bytes |
| AI | Queue + concurrency cap per user; provider failover |

## 7. Performance budgets (enforced in CI where possible)

| Metric | Budget |
| --- | --- |
| Initial JS (gzip, authenticated shell) | ≤ 180 kB |
| LCP on mid-range mobile / 4G | ≤ 2.5 s |
| Message send → sender ack (p95) | ≤ 150 ms |
| Message send → recipient delivery (p95) | ≤ 400 ms |
| API p95 (non-AI) | ≤ 200 ms |
| Search p95 | ≤ 300 ms |
| WS reconnect + sync | ≤ 2 s |
| Call join | ≤ 1.5 s |

## 8. Feature flags

`packages/shared/src/features.ts` + server env, evaluated server-side and exposed at `/v1/config`:

| Flag | Default | Purpose |
| --- | --- | --- |
| `calls` | on | Kill switch for LiveKit |
| `ai` | on | Kill switch for the assistant |
| `docks` | on | Kill switch for communities |
| `experimental` | **off** | Moments/Notes/Tasks/Vault prototypes, hidden from MVP |
| `emailVerification` | on (prod) / off (dev) | Gate signup verification |
| `attachments` | on | Uploads |

## 9. Environments

| Env | DB | Redis | Storage | Email | Notes |
| --- | --- | --- | --- | --- | --- |
| local | PGlite file | none (in-process) | `db` driver | console | Runs on this phone |
| preview | Postgres branch | optional | R2 bucket | console/Resend test | Per-PR |
| production | Postgres (managed, backups) | managed | R2 | Resend | Separate secrets, least privilege |
