/**
 * REST contract for the core API (mocked in src/api/mock). Base path /v1. Auth: `Authorization: Bearer <token>`.
 * All bodies JSON unless noted. Errors: { error, message } with 4xx/5xx.
 */
import type { Conversation, Dock, DockMember, DockRole, DockVisibility, MessageView, Session, User, Channel } from "./types";
import type { MessageEnvelope, Attachment } from "./envelope";

export interface Routes {
  "POST /v1/auth/signup": { body: { username: string; email?: string; password?: string; display_name?: string; birthday?: string }; res: Session };
  "POST /v1/auth/google": { body: { email: string }; res: Session };
  "POST /v1/auth/login": { body: { username: string; password: string }; res: Session };
  "POST /v1/auth/logout": { body: {}; res: { ok: true } };
  "GET /v1/auth/session": { res: { user: User; device_id: string; token: string } };
  "GET /v1/auth/username-available": { query: { username: string }; res: { available: boolean } };
  "POST /v1/auth/verify-email": { body: { token: string }; res: { ok: true; verified: boolean } };
  "POST /v1/auth/resend-verification": { body: {}; res: { ok: true; already?: boolean; dev_token?: string } };
  "POST /v1/auth/forgot-password": { body: { email: string }; res: { ok: true; dev_token?: string } };
  "POST /v1/auth/reset-password": { body: { token: string; password: string }; res: { ok: true; revoked_all: boolean } };
  "POST /v1/auth/change-password": { body: { current_password: string; new_password: string }; res: { ok: true } };
  "POST /v1/auth/service-token": { res: { token: string; expires_in: number } };

  "GET /v1/me": { res: User };
  "PATCH /v1/me": {
    body: Partial<Pick<User, "display_name" | "about" | "avatar_url" | "accent" | "status" | "profile_visibility">>;
    res: User;
  };
  "DELETE /v1/me": { body: { password: string }; res: { ok: true } };
  "POST /v1/me/export": { body: {}; res: unknown };
  "GET /v1/users/search": { query: { q: string }; res: User[] };
  "GET /v1/users/:username": { res: User };

  "GET /v1/conversations": { res: Conversation[] };
  "POST /v1/conversations/dm": { body: { user_id: string }; res: Conversation };
  "POST /v1/conversations/group": { body: { title: string; member_ids: string[] }; res: Conversation };
  "GET /v1/conversations/:id": { res: Conversation };
  "PATCH /v1/conversations/:id": { body: { title?: string; avatar_url?: string | null }; res: Conversation };
  "POST /v1/conversations/:id/members": { body: { user_ids: string[] }; res: Conversation };
  "DELETE /v1/conversations/:id/members/:userId": { res: { ok: true } };
  "POST /v1/conversations/:id/read": { body: { message_id: string }; res: { ok: true } };

  /** Paginated newest-first. `before` = message id cursor. */
  "GET /v1/conversations/:id/messages": { query: { before?: string; limit?: number }; res: MessageView[] };
  /** REST fallback for sending (WS preferred). Idempotent on client_msg_id. */
  "POST /v1/conversations/:id/messages": {
    body: Pick<MessageEnvelope, "ciphertext" | "nonce" | "client_msg_id" | "device_id">;
    res: MessageView;
  };
  "POST /v1/messages/:id/reactions": { body: { emoji: string }; res: MessageView };
  "DELETE /v1/messages/:id/reactions/:emoji": { res: MessageView };

  /** multipart/form-data field "file" (images, <= 8 MB). */
  "POST /v1/attachments": { body: FormData; res: Attachment };
  "GET /v1/attachments/:id": { res: Blob };

  "GET /v1/docks": { query: { mine?: "1" }; res: Dock[] };
  "GET /v1/docks/discover": { query: { q?: string }; res: Dock[] };
  "POST /v1/docks": { body: { name: string; handle: string; description?: string; visibility: DockVisibility }; res: Dock };
  "GET /v1/docks/:id": { res: Dock };
  "PATCH /v1/docks/:id": { body: Partial<Pick<Dock, "name" | "description" | "icon_url" | "visibility">>; res: Dock };
  "DELETE /v1/docks/:id": { res: { ok: true } };
  "POST /v1/docks/:id/join": { body: { invite_code?: string }; res: Dock };
  "POST /v1/docks/:id/leave": { body: {}; res: { ok: true } };
  "POST /v1/docks/:id/invite": { body: {}; res: { invite_code: string } };
  "GET /v1/docks/:id/members": { res: DockMember[] };
  "PATCH /v1/docks/:id/members/:userId": { body: { role: DockRole }; res: DockMember };
  "DELETE /v1/docks/:id/members/:userId": { res: { ok: true } };
  "POST /v1/docks/:id/channels": { body: { name: string; topic?: string }; res: Channel };
  "PATCH /v1/docks/:id/channels/:channelId": { body: { name?: string; topic?: string; position?: number }; res: Channel };
  "DELETE /v1/docks/:id/channels/:channelId": { res: { ok: true } };

  "GET /health": { res: { ok: true; db: string; redis: string } };
}
