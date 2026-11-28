import type { Db } from "./index.js";

/** Plain SQL migrations. Append only; each runs once, in order, at boot. */
export const migrations: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  about text NOT NULL DEFAULT '',
  avatar_url text,
  accent text,
  is_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  device_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS docks (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  handle text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  icon_url text,
  visibility text NOT NULL DEFAULT 'public',
  owner_id uuid NOT NULL REFERENCES users(id),
  invite_code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dock_members (
  dock_id uuid NOT NULL REFERENCES docks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dock_id, user_id)
);
CREATE INDEX IF NOT EXISTS dock_members_user_idx ON dock_members(user_id);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  title text,
  avatar_url text,
  dock_id uuid REFERENCES docks(id) ON DELETE CASCADE,
  dm_key text UNIQUE,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);
CREATE INDEX IF NOT EXISTS conversations_dock_idx ON conversations(dock_id);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  dock_id uuid NOT NULL REFERENCES docks(id) ON DELETE CASCADE,
  name text NOT NULL,
  topic text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS channels_dock_name_idx ON channels(dock_id, name);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  seq bigserial UNIQUE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  device_id text NOT NULL,
  ciphertext text NOT NULL,
  nonce text,
  client_msg_id text NOT NULL,
  reply_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, client_msg_id)
);
CREATE INDEX IF NOT EXISTS messages_conv_seq_idx ON messages(conversation_id, seq DESC);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS messages_updated_idx ON messages(updated_at);

CREATE TABLE IF NOT EXISTS reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS read_state (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id uuid,
  last_read_seq bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL,
  size integer NOT NULL,
  width integer,
  height integer,
  name text,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
  {
    id: "002_pins",
    sql: `
CREATE TABLE IF NOT EXISTS pins (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);
`,
  },
  {
    id: "003_last_seen",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz`,
  },
  {
    id: "004_moments",
    sql: `
CREATE TABLE IF NOT EXISTS moments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  text text NOT NULL DEFAULT '',
  background text,
  attachment_id uuid REFERENCES attachments(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'all_friends',
  audience uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS moments_user_idx ON moments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moments_expires_idx ON moments(expires_at);

CREATE TABLE IF NOT EXISTS moment_views (
  moment_id uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moment_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS moment_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'all_friends',
  audience uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
  {
    id: "005_notes",
    sql: `
CREATE TABLE IF NOT EXISTS note_folders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_folders_user_idx ON note_folders(user_id);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES note_folders(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  starred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id, updated_at DESC);
`,
  },
  {
    id: "006_tasks",
    sql: `
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  due_date date,
  due_time text,
  priority text NOT NULL DEFAULT 'normal',
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks(user_id, done, due_date);
`,
  },
  {
    id: "007_vault",
    sql: `
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS private boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS vault_items (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  nonce text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_items_user_idx ON vault_items(user_id, created_at DESC);
`,
  },
  {
    id: "008_auth_hardening",
    sql: `
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'public';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE sessions SET expires_at = created_at + interval '90 days' WHERE expires_at IS NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_hash text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_reason text;
CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('verify_email','reset_password')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_hash_key ON auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id, kind, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  ip_hash text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs (action, created_at DESC);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
`,
  },
  {
    id: "009_messaging_hardening",
    sql: `
ALTER TABLE attachments ALTER COLUMN data DROP NOT NULL;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_key text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_kind text NOT NULL DEFAULT 'db';
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS thumbnail_key text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';
CREATE INDEX IF NOT EXISTS attachments_pending_idx ON attachments (created_at) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS object_blobs (
  key text PRIMARY KEY,
  data bytea NOT NULL,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS message_hides (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
CREATE TABLE IF NOT EXISTS message_receipts (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS receipts_user_pending_idx ON message_receipts (user_id) WHERE delivered_at IS NULL;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS notification_level text NOT NULL DEFAULT 'all';
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS muted_until timestamptz;
ALTER TABLE dock_members ADD COLUMN IF NOT EXISTS notification_level text NOT NULL DEFAULT 'all';
ALTER TABLE dock_members ADD COLUMN IF NOT EXISTS muted_until timestamptz;
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'message',
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  preview text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);
`,
  },
];

export async function migrate(db: Db, log: (m: string) => void): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  await db.tx(async (q) => {
    // Guard against concurrent boots on shared Postgres (released at COMMIT).
    if (db.kind === "postgres") await q.query("SELECT pg_advisory_xact_lock(717001)");
    const done = new Set((await q.query<{ id: string }>("SELECT id FROM schema_migrations")).map((r) => r.id));
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      for (const stmt of splitSql(m.sql)) await q.query(stmt);
      await q.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
      log(`migration applied: ${m.id}`);
    }
  });
}

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
