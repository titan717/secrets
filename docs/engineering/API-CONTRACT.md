# API contract v1

Status: proposed · Base URL `/v1` · JSON only · Auth via `__Host-secrets_session` cookie
(`Authorization: Bearer` accepted for CLI/native; **not** for browsers).

## 0. Conventions

**Success** `{ "data": … }` · **Error** `{ "error": "snake_code", "message": "Human text", "requestId": "…" }`

| Status | When |
| --- | --- |
| 400 | validation failed (`error: "bad_request"` or a specific code) |
| 401 | no/expired/revoked session |
| 403 | authenticated but not allowed (never reveals existence) |
| 404 | missing **or** not visible to caller |
| 409 | conflict (`username_taken`, `duplicate_client_msg_id`) |
| 413 | payload too large |
| 422 | semantically invalid (e.g. invite expired) |
| 429 | rate limited, `Retry-After` header |
| 503 | dependency down (LiveKit, AI provider, storage) |

**Pagination** — cursor based, never offset:
`GET …?limit=50&before=<seq|iso>` → `{ data: { items: [...], nextCursor: "…" | null } }`

**Idempotency** — `Idempotency-Key` header on `POST` uploads/invites; messages use `client_msg_id`.

**Rate limits** (Redis-backed in prod): signup/login 20/min/IP · password reset 5/h/IP+account ·
messages 30/10 s/user · uploads 20/h/user · search 60/min/user · AI 20/h/user · invites 10/h/dock.

## 1. Auth & account

| Method | Path | Body / notes |
| --- | --- | --- |
| POST | `/auth/signup` | `{ username, email, password, display_name? }` → 201 session + user. Sends verification email. |
| POST | `/auth/login` | `{ username_or_email, password }` → 200 session. Generic failure message. |
| POST | `/auth/logout` | revokes current device session |
| POST | `/auth/verify-email` | `{ token }` → sets `email_verified_at` |
| POST | `/auth/resend-verification` | `{}` (auth) — 5/h |
| POST | `/auth/forgot-password` | `{ email }` → always 202 (no enumeration) |
| POST | `/auth/reset-password` | `{ token, password }` → revokes **all** sessions |
| POST | `/auth/change-password` | `{ current_password, new_password }` → revokes other sessions |
| GET | `/auth/sessions` | list devices, marks `current` |
| DELETE | `/auth/sessions/:deviceId` | revoke one device (closes its socket) |
| GET | `/auth/username-available?username=` | `{ available }` (rate-limited, no PII) |

Session payload: `{ user, deviceId, csrfToken }`. The JWT itself is **never** in the body — cookie only.

## 2. Profiles & social

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/me` | full private profile |
| PATCH | `/me` | `display_name, about, status, accent, profile_visibility` |
| PUT | `/me/avatar` | multipart, validated + re-encoded, returns `avatarUrl` |
| DELETE | `/me` | `{ password, confirm: "DELETE" }` → soft delete, revoke sessions |
| POST | `/me/export` | queues export → `{ jobId }` |
| GET | `/me/export/:jobId` | `{ status, url? }` (signed, 15 min) |
| GET | `/users/search?q=` | `{ items: [public user] }`, respects visibility + blocks |
| GET | `/users/:username` | public profile view |
| GET | `/presence` | contacts' presence snapshot |
| POST | `/users/:id/block` / DELETE | block/unblock |
| POST | `/conversations/:id/mute` | `{ until? , level }` |

## 3. Conversations & messages

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/conversations` | `{ items: [conversation + lastMessage + unread] }` |
| POST | `/conversations/dm` | `{ user_id }` → existing or new DM (idempotent) |
| POST | `/conversations/group` | `{ title, member_ids[] }` |
| GET | `/conversations/:id` | membership required |
| PATCH | `/conversations/:id` | `{ title }` (group admin) |
| POST | `/conversations/:id/members` | `{ user_ids[] }` (admin) |
| DELETE | `/conversations/:id/members/:userId` | leave or remove (admin) |
| GET | `/conversations/:id/messages?limit&before` | history, newest first |
| POST | `/conversations/:id/messages` | `{ client_msg_id, body?, attachments?: [id], reply_to? }` → 201 |
| GET | `/conversations/:id/search?q=` | in-conversation FTS |
| GET | `/conversations/:id/pins` | pinned messages |
| PATCH | `/messages/:id` | `{ body }` — author, 15 min window |
| DELETE | `/messages/:id` | `?scope=all\|me` |
| POST | `/messages/:id/reactions` | `{ emoji }` |
| DELETE | `/messages/:id/reactions/:emoji` | |
| POST | `/messages/:id/pin` / DELETE | |
| POST | `/conversations/:id/read` | `{ message_id }` → updates `last_read_seq` |
| GET | `/search?q=` | **global**: conversations + users + messages (caller-scoped) |

**Message DTO** `{ id, conversationId, seq, senderId, body, replyTo?, attachments[], reactions[], editedAt?, deletedAt?, createdAt, clientMsgId }`

## 4. Attachments

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/attachments` | multipart `file` → validates size ≤ 8 MB, magic bytes, MIME allowlist; re-encodes images; returns `{ id, url, thumbUrl }` |
| POST | `/attachments/presign` | prod: `{ name, mime, size }` → `{ uploadUrl, attachmentId }` (direct-to-R2) |
| GET | `/attachments/:id` | authorized read; `Content-Disposition: attachment` for non-images |

Allowlist: `image/jpeg,png,webp,gif` (re-encoded), `application/pdf`, `text/plain`, `audio/*` (≤ 8 MB).
Rejected: SVG, HTML, executables, archives. Object keys are UUIDs; user filenames are metadata only.

## 5. Docks

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/docks` | my Docks |
| GET | `/docks/discover?q=` | public, live only |
| POST | `/docks` | `{ handle, name, visibility, description? }` |
| GET | `/docks/:id` | member or public |
| PATCH | `/docks/:id` | admin |
| DELETE | `/docks/:id` | owner |
| POST | `/docks/:id/join` | public Dock |
| POST | `/docks/join` | `{ code }` — invite code, hashed lookup, expiry/uses/revocation checked |
| POST | `/docks/:id/leave` | owner must transfer first |
| GET | `/docks/:id/members` | member list + roles |
| PATCH | `/docks/:id/members/:userId` | `{ role }` — no escalation |
| DELETE | `/docks/:id/members/:userId` | kick (admin) |
| POST | `/docks/:id/members/:userId/mute` | `{ until }` (moderator) |
| POST | `/docks/:id/channels` | `{ name, kind, topic? }` |
| PATCH | `/docks/:id/channels/:channelId` | rename/topic/reorder |
| DELETE | `/docks/:id/channels/:channelId` | |
| POST | `/docks/:id/invites` | `{ expiresIn?, maxUses? }` → `{ code }` (shown once) |
| GET | `/docks/:id/invites` | metadata only, never the code |
| DELETE | `/docks/:id/invites/:inviteId` | revoke |
| GET | `/docks/:id/audit?limit&before` | admin |
| POST | `/reports` | `{ target_type, target_id, reason, details? }` |

## 6. Notifications

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications?unread=1` | cursor |
| POST | `/notifications/read` | `{ ids[] }` or `{ all: true }` |
| GET | `/notifications/unread-count` | `{ total, byConversation }` |

## 7. Calls

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/calls/:conversationId/token` | `{ kind: "audio"|"video" }` → `{ url, token, room, expiresAt }`; membership checked, fail-closed |
| POST | `/calls/:conversationId/end` | creator/admin only |
| GET | `/calls/:conversationId` | active room + participants |

Token TTL ≤ 2 h. No anonymous tokens. `503` if LiveKit or the membership check is unavailable.

## 8. AI (`apps/ai`, same auth)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/ai/conversations` | |
| POST | `/ai/conversations` | `{ provider, model, effort, system_prompt? }` |
| PATCH | `/ai/conversations/:id` | title, model, effort, max_steps, system_prompt |
| DELETE | `/ai/conversations/:id` | hard delete |
| POST | `/ai/chat` | **SSE**. `{ conversationId, message, context: ContextRef[], providerKey }` — key in header, never body/logs |
| POST | `/ai/runs/:runId/stop` | cancels streaming |
| POST | `/ai/runs/:runId/approve` | `{ callId, decision: "approve"|"deny" }` |
| GET | `/ai/models?provider=` | curated model list |

`ContextRef` = `{ type: "conversation"|"messages"|"channel"|"files"|"instructions", id?, messageIds?, instruction? }`.
Server fetches each ref **with the caller's session** and records it in the approval/audit trail.
No context is attached implicitly.

**SSE events**: `start`, `delta`, `tool_call`, `tool_result`, `confirm_required`, `usage`, `error`, `done`.

## 9. WebSocket `/v1/ws`

Cookie-authenticated. Client → server frames:

```ts
{ t: "sync", since: number }                      // replay from seq
{ t: "msg.send", conversation_id, client_msg_id, body?, attachments?, reply_to? }
{ t: "typing", conversation_id }
{ t: "read", conversation_id, message_id }
{ t: "react", message_id, emoji, on: boolean }
{ t: "pong" }
```

Server → client:

```ts
{ t: "ready", user_id }
{ t: "sync.batch", messages: Message[] }
{ t: "msg.ack", client_msg_id, message }
{ t: "msg.new", message }
{ t: "msg.updated", message }
{ t: "msg.deleted", conversation_id, message_id, scope }
{ t: "typing", conversation_id, user_id }
{ t: "presence", user_id, online, last_seen }
{ t: "receipt", conversation_id, message_id, user_id, status: "delivered"|"read" }
{ t: "notification", notification }
{ t: "error", message, client_msg_id? }
{ t: "ping" }
```

Close codes: `4001` unauthorized/revoked · `4008` rate limited · `1001` server shutdown.
Reconnect: exponential backoff 0.5→30 s with jitter; on open send `sync` from the last persisted `seq`.

## 10. Platform

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/ready` | DB + migrations + storage |
| GET | `/config` | public config + feature flags |

## 11. Contract governance

- `packages/shared/src/api.ts` is the single source of truth; every route has a Zod schema there.
- A contract change requires: schema → route → test → web integration → this document, in one PR.
- `packages/shared/src/contract.test.ts` asserts request/response shapes at build time.
