export type ID = string;

export interface User {
  id: ID;
  username: string;
  display_name: string;
  about: string;
  avatar_url: string | null;
  accent: string | null;
  /** Presence note (<= 80 chars). */
  status?: string | null;
  profile_visibility?: "public" | "contacts" | "private";
  /** Owner-only. */
  email?: string | null;
  email_verified?: boolean;
  created_at: string;
}

export interface Session {
  token: string;
  user: User;
  device_id: string;
  /** Double-submit CSRF token; also set as a readable cookie. */
  csrf_token?: string;
}

export type ConversationKind = "dm" | "group" | "channel";

export interface Conversation {
  id: ID;
  kind: ConversationKind;
  title: string | null; // null for dm (derive from other member)
  avatar_url: string | null;
  dock_id: ID | null; // set when kind === "channel"
  members: User[]; // for dm/group; channels may return [] (use dock members)
  last_message: MessageView | null;
  unread_count: number;
  created_at: string;
}

export interface Reaction {
  emoji: string;
  user_ids: ID[];
}

/** Envelope + server metadata as delivered to clients. */
export interface MessageView {
  id: ID;
  conversation_id: ID;
  sender_id: ID;
  device_id: string;
  ciphertext: string;
  nonce: string | null;
  created_at: string;
  client_msg_id: string;
  reactions: Reaction[];
  edited_at?: string | null;
  deleted?: boolean;
  pinned?: boolean;
}

export type DockVisibility = "public" | "private";
export type DockRole = "owner" | "admin" | "member";

export interface Dock {
  id: ID;
  name: string;
  handle: string; // unique, url-safe
  description: string;
  icon_url: string | null;
  visibility: DockVisibility;
  owner_id: ID;
  member_count: number;
  my_role: DockRole | null;
  channels: Channel[];
  created_at: string;
}

export interface Channel {
  id: ID; // same id as its Conversation
  dock_id: ID;
  name: string;
  topic: string;
  position: number;
}

export interface DockMember {
  user: User;
  role: DockRole;
  joined_at: string;
}

export type NotificationKind = "message" | "mention" | "reaction" | "invite" | "call" | "system";

/** In-app notification row (mock API and api.secrets share this shape). */
export interface NotificationItem {
  id: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  actor: User | null;
  conversation_id: ID | null;
  dock_id: ID | null;
  read_at: string | null;
  created_at: string;
}

export interface ApiError {
  error: string;
  message: string;
}
