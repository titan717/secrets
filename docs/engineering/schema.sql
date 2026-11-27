-- Secrets — PostgreSQL schema (MVP)
-- Target: PostgreSQL 15+. Also runs on PGlite (dev) — avoid extensions that PGlite lacks.
-- Conventions: uuid pk, timestamptz, soft delete via *_at, no PG enums (CHECK constraints for portability).

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────── identity ───────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                 uuid PRIMARY KEY,
  username           text NOT NULL,                 -- stored lowercase, 3..24
  email              text,                          -- stored lowercase; null for legacy accounts
  password_hash      text NOT NULL,                 -- bcrypt/argon2id encoded hash
  display_name       text NOT NULL,
  about              text,
  status             text,                          -- free-form presence note (<= 80)
  avatar_key         text,                          -- object-storage key, not a URL
  accent             text,
  profile_visibility text NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public','contacts','private')),
  email_verified_at  timestamptz,
  is_bot             boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS users_live_idx ON users (created_at) WHERE deleted_at IS NULL;

-- Reserved names are rejected in the service layer (single source of truth: packages/shared).
CREATE TABLE IF NOT EXISTS reserved_usernames (name text PRIMARY KEY);

CREATE TABLE IF NOT EXISTS sessions (
  device_id    uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent   text,
  ip_hash      text,                                -- HMAC(ip, server pepper); never raw IP
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  revoked_reason text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS sessions_live_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,                        -- sha256(token); token never stored
  email       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS evt_hash_key ON email_verification_tokens (token_hash);
CREATE INDEX IF NOT EXISTS evt_user_idx ON email_verification_tokens (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prt_hash_key ON password_reset_tokens (token_hash);

-- ────────────────────────────── conversations ──────────────────────────────

CREATE TABLE IF NOT EXISTS docks (
  id          uuid PRIMARY KEY,
  handle      text NOT NULL,
  name        text NOT NULL,
  description text,
  visibility  text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  icon_key    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS docks_handle_key ON docks (lower(handle));
CREATE INDEX IF NOT EXISTS docks_discover_idx ON docks (created_at DESC) WHERE visibility = 'public' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS dock_members (
  dock_id     uuid NOT NULL REFERENCES docks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','moderator','member','guest')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  muted_until timestamptz,                          -- moderation mute
  banned_at   timestamptz,
  PRIMARY KEY (dock_id, user_id)
);
CREATE INDEX IF NOT EXISTS dock_members_user_idx ON dock_members (user_id);

CREATE TABLE IF NOT EXISTS dock_channels (
  id         uuid PRIMARY KEY,
  dock_id    uuid NOT NULL REFERENCES docks(id) ON DELETE CASCADE,
  name       text NOT NULL,
  topic      text,
  kind       text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice')),
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS dock_channels_name_key ON dock_channels (dock_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('dm','group','channel')),
  dock_id     uuid REFERENCES docks(id) ON DELETE CASCADE,
  channel_id  uuid REFERENCES dock_channels(id) ON DELETE CASCADE,
  title       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  last_seq    bigint NOT NULL DEFAULT 0,            -- per-conversation message counter
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK ((kind = 'channel') = (channel_id IS NOT NULL)),
  CHECK (kind <> 'channel' OR dock_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS conversations_dock_idx ON conversations (dock_id) WHERE deleted_at IS NULL;
-- A DM is unique per user pair (pair_key = least(id)||greatest(id)), enforced by a helper table:
CREATE TABLE IF NOT EXISTS dm_pairs (
  pair_key        text PRIMARY KEY,                 -- '<uuid>:<uuid>' ordered
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  last_read_seq   bigint NOT NULL DEFAULT 0,
  notification_level text NOT NULL DEFAULT 'all' CHECK (notification_level IN ('all','mentions','none')),
  hidden_at       timestamptz,                      -- "delete for me"
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS cm_user_idx ON conversation_members (user_id, conversation_id);

-- ──────────────────────────────── messages ────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq             bigint NOT NULL,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  device_id       uuid,
  body            text,                             -- plaintext for MVP (search, previews, AI)
  ciphertext      text,                             -- reserved for future E2EE; exactly one of body/ciphertext
  nonce           text,
  reply_to_id     uuid REFERENCES messages(id) ON DELETE SET NULL,
  client_msg_id   text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (body IS NOT NULL OR ciphertext IS NOT NULL),
  CHECK (char_length(client_msg_id) BETWEEN 1 AND 128)
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_seq_key ON messages (conversation_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS messages_idem_key ON messages (sender_id, client_msg_id);
CREATE INDEX IF NOT EXISTS messages_page_idx ON messages (conversation_id, seq DESC);
CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING gin (to_tsvector('simple', coalesce(body,'')));

CREATE TABLE IF NOT EXISTS attachments (
  id         uuid PRIMARY KEY,
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage    text NOT NULL DEFAULT 's3' CHECK (storage IN ('s3','db')),
  object_key text NOT NULL,                         -- UUID path; never user filename
  thumb_key  text,
  name       text,
  mime       text NOT NULL,
  size       bigint NOT NULL CHECK (size > 0),
  width      int,
  height     int,
  sha256     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS attachments_key_key ON attachments (object_key);
CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_attachments (
  message_id    uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  position      int NOT NULL DEFAULT 0,
  PRIMARY KEY (message_id, attachment_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(emoji) <= 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS reactions_msg_idx ON reactions (message_id);

-- Per-recipient delivery/read receipts (DM + group). Channels use last_read_seq only.
CREATE TABLE IF NOT EXISTS message_receipts (
  message_id   uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at      timestamptz,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS receipts_user_unread_idx ON message_receipts (user_id) WHERE read_at IS NULL;

-- ────────────────────────────── safety & ops ──────────────────────────────

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE IF NOT EXISTS reports (
  id          uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('message','user','dock','channel')),
  target_id   uuid NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('spam','harassment','hate','sexual','violence','other')),
  details     text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','actioned','dismissed')),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_open_idx ON reports (created_at DESC) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('message','mention','reply','reaction','dock_invite','call','system')),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  dock_id         uuid REFERENCES docks(id) ON DELETE CASCADE,
  message_id      uuid REFERENCES messages(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS dock_invites (
  id         uuid PRIMARY KEY,
  dock_id    uuid NOT NULL REFERENCES docks(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,                         -- sha256(code)
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  max_uses   int CHECK (max_uses IS NULL OR max_uses > 0),
  uses       int NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dock_invites_hash_key ON dock_invites (code_hash);

CREATE TABLE IF NOT EXISTS dock_audit_log (
  id          bigserial PRIMARY KEY,
  dock_id     uuid NOT NULL REFERENCES docks(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,                        -- member.role_changed, channel.deleted, invite.revoked, …
  target_type text,
  target_id   uuid,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dock_audit_idx ON dock_audit_log (dock_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,                        -- auth.login, session.revoked, account.deleted, …
  target_type text,
  target_id   uuid,
  ip_hash     text,
  user_agent  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- never secrets or message content
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs (action, created_at DESC);

-- ──────────────────────────────── calls ────────────────────────────────

CREATE TABLE IF NOT EXISTS call_rooms (
  id              uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'livekit',
  provider_room   text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('audio','video')),
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  max_participants int NOT NULL DEFAULT 8 CHECK (max_participants BETWEEN 2 AND 50),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);
CREATE INDEX IF NOT EXISTS call_rooms_conv_idx ON call_rooms (conversation_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS call_rooms_live_key ON call_rooms (provider_room) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS call_participants (
  room_id    uuid NOT NULL REFERENCES call_rooms(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  left_at    timestamptz,
  PRIMARY KEY (room_id, user_id, joined_at)
);

-- ────────────────────────────────── AI ──────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_conversations (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL DEFAULT 'New chat',
  provider      text NOT NULL CHECK (provider IN ('gemini','openrouter')),
  model         text NOT NULL,
  effort        text NOT NULL DEFAULT 'medium' CHECK (effort IN ('low','medium','high','custom')),
  max_steps     int  NOT NULL DEFAULT 8 CHECK (max_steps BETWEEN 1 AND 50),
  system_prompt text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ai_conv_user_idx ON ai_conversations (user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ai_messages (
  id              uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  seq             bigint NOT NULL,
  role            text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content         text NOT NULL DEFAULT '',
  tool_calls      jsonb,
  tool_results    jsonb,
  tokens_in       int,
  tokens_out      int,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_msg_seq_key ON ai_messages (conversation_id, seq);

-- Non-secret metadata only. Provider keys stay in the browser (BYOK) and are never stored server-side.
CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('gemini','openrouter')),
  label        text,
  key_fingerprint text,                             -- sha256(key)[:16] to recognise a key without storing it
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, label)
);

CREATE TABLE IF NOT EXISTS ai_tool_permissions (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool       text NOT NULL,                         -- github.read_file, secrets.summarize_channel, …
  scope      jsonb NOT NULL DEFAULT '{}'::jsonb,    -- repo, dock/channel, conversation ids
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, tool)
);

CREATE TABLE IF NOT EXISTS ai_tool_approvals (
  id          uuid PRIMARY KEY,
  run_id      text NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool        text NOT NULL,
  args        jsonb NOT NULL,
  decision    text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','denied','expired')),
  result      jsonb,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_approvals_pending_idx ON ai_tool_approvals (user_id, created_at DESC) WHERE decision = 'pending';

-- ─────────────────────────── retention & deletion ───────────────────────────
-- users.deleted_at         → account disabled immediately; personal data purged after 30 days (job).
-- messages.deleted_at      → tombstone kept for reply integrity; body purged after 30 days.
-- attachments.deleted_at   → object removed from storage after 7 days.
-- audit_logs               → 180 days.
-- sessions                 → purged 30 days after expiry/revocation.
-- notifications            → 90 days.
-- ai_messages              → deleted with the AI conversation; user can delete any chat immediately.
