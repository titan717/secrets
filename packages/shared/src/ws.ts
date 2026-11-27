/**
 * WebSocket protocol. Connect: `${API_WS}/v1/ws?token=<session token>`.
 * Frames are JSON `{ t: <type>, ... }`. Server pings every 25s; client replies `{t:"pong"}`.
 *
 * Delivery: on connect the client sends `sync` with the newest message time it has;
 * the server replies with `sync.batch` of missed messages, then live `msg.new` frames.
 * Clients queue outgoing `msg.send` while offline (IndexedDB/localStorage) and flush on
 * reconnect; the server dedupes on (sender_id, client_msg_id) and always answers `msg.ack`.
 */
import type { MessageEnvelope } from "./envelope";
import type { FeatureServerFrame } from "./features";
import type { Conversation, MessageView, ID, Dock, User } from "./types";

export type ClientFrame =
  | { t: "pong" }
  | { t: "sync"; since: string | null }
  | { t: "msg.send"; conversation_id: ID; client_msg_id: string; device_id: string; ciphertext: string; nonce: string | null }
  | { t: "typing"; conversation_id: ID }
  | { t: "read"; conversation_id: ID; message_id: ID }
  | { t: "react"; message_id: ID; emoji: string; on: boolean };

export type ServerFrame =
  | { t: "ping" }
  | { t: "ready"; user_id: ID }
  | { t: "sync.batch"; messages: MessageView[] }
  | { t: "msg.ack"; client_msg_id: string; message: MessageView }
  | { t: "msg.new"; message: MessageView }
  | { t: "msg.update"; message: MessageView }
  | { t: "typing"; conversation_id: ID; user_id: ID }
  | { t: "read"; conversation_id: ID; user_id: ID; message_id: ID }
  | { t: "conversation.upsert"; conversation: Conversation }
  | { t: "conversation.remove"; conversation_id: ID }
  | { t: "dock.upsert"; dock: Dock }
  | { t: "presence"; user_id: ID; online: boolean; last_seen?: string | null }
  | { t: "user.update"; user: User }
  | { t: "error"; message: string; client_msg_id?: string }
  | FeatureServerFrame;

export type { MessageEnvelope };
