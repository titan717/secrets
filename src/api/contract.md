# Secrets frontend API contract

The frontend is built against this contract. In mock mode (`VITE_USE_MOCKS=true`)
every endpoint is served in-memory by `src/api/mock/` and the WebSocket is a
local event bus, so the UI runs with no backend.

Base URL: `VITE_API_URL` (default `http://localhost:3000`). JSON unless noted.
Auth: `Authorization: Bearer <token>`. Errors: `{ "error": string, "message": string }`.

## Auth

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| POST | `/v1/auth/signup` | `{ username, email, password, display_name? }` | `Session` |
| POST | `/v1/auth/login` | `{ username, password }` | `Session` |
| POST | `/v1/auth/logout` | `{}` | `{ ok: true }` |
| GET | `/v1/auth/session` | — | `{ user, device_id, token }` |
| GET | `/v1/auth/username-available` | `?username=` | `{ available: boolean }` |
| POST | `/v1/auth/verify-email` | `{ token }` | `{ ok, verified }` |
| POST | `/v1/auth/resend-verification` | `{}` | `{ ok, already?, dev_token? }` |
| POST | `/v1/auth/forgot-password` | `{ email }` | `{ ok, dev_token? }` |
| POST | `/v1/auth/reset-password` | `{ token, password }` | `{ ok, revoked_all }` |
| POST | `/v1/auth/change-password` | `{ current_password, new_password }` | `{ ok }` |

## Profile

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/v1/me` | — | `User` |
| PATCH | `/v1/me` | `{ display_name?, about?, avatar_url?, accent?, status?, profile_visibility? }` | `User` |
| DELETE | `/v1/me` | `{ password }` | `{ ok }` |
| POST | `/v1/me/export` | `{}` | JSON export |
| GET | `/v1/users/search` | `?q=` | `User[]` |
| GET | `/v1/users/:username` | — | `User` |

## Conversations and messages

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/v1/conversations` | `?include_channels=1` | `Conversation[]` |
| POST | `/v1/conversations/dm` | `{ user_id }` | `Conversation` |
| POST | `/v1/conversations/group` | `{ title, member_ids }` | `Conversation` |
| GET | `/v1/conversations/:id` | — | `Conversation` |
| PATCH | `/v1/conversations/:id` | `{ title?, avatar_url? }` | `Conversation` |
| POST | `/v1/conversations/:id/members` | `{ user_ids }` | `Conversation` |
| DELETE | `/v1/conversations/:id/members/:userId` | — | `{ ok }` |
| POST | `/v1/conversations/:id/read` | `{ message_id }` | `{ ok }` |
| GET | `/v1/conversations/:id/messages` | `?before=&limit=` | `MessageView[]` (newest first) |
| POST | `/v1/conversations/:id/messages` | `{ ciphertext, nonce, client_msg_id, device_id }` | `MessageView` |
| GET | `/v1/conversations/:id/search` | `?q=&limit=&before=` | `MessageView[]` |
| GET | `/v1/conversations/:id/pins` | — | `MessageView[]` |
| GET | `/v1/messages/:id` | — | `MessageView` |
| PATCH | `/v1/messages/:id` | `{ ciphertext, nonce }` | `MessageView` |
| DELETE | `/v1/messages/:id` | `?scope=me` | `MessageView` / `{ ok }` |
| POST | `/v1/messages/:id/reactions` | `{ emoji }` | `MessageView` |
| DELETE | `/v1/messages/:id/reactions/:emoji` | — | `MessageView` |
| POST | `/v1/messages/:id/pin` | — | `MessageView` |
| DELETE | `/v1/messages/:id/pin` | — | `MessageView` |

Messages travel as `Envelope` (`ciphertext` is plaintext JSON for now). Sends are
idempotent on `client_msg_id`.

## Uploads

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/v1/attachments` | `multipart/form-data` field `file` | `Attachment` |
| GET | `/v1/attachments/:id` | — | image/blob |

## Docks

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/v1/docks` | `?mine=1` | `Dock[]` |
| GET | `/v1/docks/discover` | `?q=` | `Dock[]` |
| POST | `/v1/docks` | `{ name, handle, description?, visibility }` | `Dock` |
| GET | `/v1/docks/:id` | — | `Dock` |
| PATCH | `/v1/docks/:id` | `{ name?, description?, icon_url?, visibility? }` | `Dock` |
| DELETE | `/v1/docks/:id` | — | `{ ok }` |
| POST | `/v1/docks/:id/join` | `{ invite_code? }` | `Dock` |
| POST | `/v1/docks/:id/leave` | `{}` | `{ ok }` |
| POST | `/v1/docks/:id/invite` | `{}` | `{ invite_code }` |
| GET | `/v1/docks/:id/members` | — | `DockMember[]` |
| PATCH | `/v1/docks/:id/members/:userId` | `{ role }` | `DockMember` |
| DELETE | `/v1/docks/:id/members/:userId` | — | `{ ok }` |
| POST | `/v1/docks/:id/channels` | `{ name, topic? }` | `Channel` |
| PATCH | `/v1/docks/:id/channels/:channelId` | `{ name?, topic?, position? }` | `Channel` |
| DELETE | `/v1/docks/:id/channels/:channelId` | — | `{ ok }` |

## Notifications

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/v1/notifications` | `?before=&limit=` | `Notification[]` |
| GET | `/v1/notifications/unread-count` | — | `{ count }` |
| POST | `/v1/notifications/read` | `{ ids? }` | `{ ok, updated }` |
| DELETE | `/v1/notifications/:id` | — | `{ ok }` |

## WebSocket frames (`VITE_WS_URL`)

Client → server: `message.new`, `typing`, `read`, `reaction.add`, `sync`, `pong`.

Server → client: `ready`, `message.new`, `message.ack`, `message.update`,
`typing`, `read`, `presence`, `conversation.upsert`, `notification`, `ping`, `error`.

The mock bus (`src/api/mock/socket.ts`) implements the same frames locally,
including idempotent acknowledgements and simulated replies.

## AI service (SSE)

`POST {VITE_AI_URL}/v1/chat` with `AiChatRequest`; events are `data: <AiStreamEvent>`.
Provider keys and GitHub tokens are sent as `x-provider-key` / `x-github-token`
and are never stored server-side. Mock mode streams a fake run with a search tool
and a write action that requires approval.

## Calls service

`POST {VITE_VOICE_URL}/v1/rooms` with `{ conversation_id, kind }` → `VoiceRoom`.
Mock mode returns a fake room and renders the in-call UI without LiveKit.
