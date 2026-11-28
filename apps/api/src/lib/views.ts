import type { Attachment, User, MessageView, Reaction, Conversation, Dock, Channel, DockRole } from "@secrets/shared";
import type { Queryable } from "../db/index.js";
import { db } from "../db/index.js";
import { iso } from "./http.js";

export const USER_COLS =
  "u.id, u.username, u.display_name, u.about, u.avatar_url, u.accent, u.created_at, u.status, u.profile_visibility, u.email, u.email_verified_at, u.deleted_at";

export function userView(r: any): User {
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name,
    about: r.about ?? "",
    avatar_url: r.avatar_url ?? null,
    accent: r.accent ?? null,
    status: r.status ?? null,
    profile_visibility: r.profile_visibility ?? "public",
    created_at: iso(r.created_at),
  };
}

/** Owner-only view: adds private fields (email, verification state). */
export function selfView(r: any): User {
  return { ...userView(r), email: r.email ?? null, email_verified: !!r.email_verified_at };
}

export const MSG_COLS =
  "m.id, m.seq, m.conversation_id, m.sender_id, m.device_id, m.ciphertext, m.nonce, m.client_msg_id, m.created_at, m.edited_at, m.deleted_at";

function rawMessageView(r: any, reactions: Reaction[], pinned: boolean, counts?: { delivered: number; read: number }): MessageView {
  const v: MessageView = {
    id: r.id,
    conversation_id: r.conversation_id,
    sender_id: r.sender_id,
    device_id: r.device_id,
    ciphertext: r.ciphertext,
    nonce: r.nonce ?? null,
    created_at: iso(r.created_at),
    client_msg_id: r.client_msg_id,
    reactions,
    edited_at: r.edited_at ? iso(r.edited_at) : null,
    deleted: !!r.deleted_at,
    pinned,
    delivered_count: counts?.delivered ?? 0,
    read_count: counts?.read ?? 0,
  };
  return v;
}

/** Attach reactions to raw message rows (single round-trip). Preserves order. */
export async function messageViews(rows: any[], q: Queryable = db): Promise<MessageView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const rx = await q.query<{ message_id: string; emoji: string; user_id: string }>(
    `SELECT message_id, emoji, user_id FROM reactions WHERE message_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
    [ids],
  );
  const pins = new Set(
    (await q.query<{ message_id: string }>(`SELECT message_id FROM pins WHERE message_id = ANY($1::uuid[])`, [ids])).map((r) => r.message_id),
  );
  const receiptRows = await q.query<{ message_id: string; delivered: number; read: number }>(
    `SELECT message_id,
       COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::int AS delivered,
       COUNT(*) FILTER (WHERE read_at IS NOT NULL)::int AS read
     FROM message_receipts WHERE message_id = ANY($1::uuid[]) GROUP BY message_id`,
    [ids],
  );
  const receiptsBy = new Map(receiptRows.map((r) => [r.message_id, { delivered: Number(r.delivered), read: Number(r.read) }]));
  const byMsg = new Map<string, Map<string, string[]>>();
  for (const r of rx) {
    let m = byMsg.get(r.message_id);
    if (!m) byMsg.set(r.message_id, (m = new Map()));
    const list = m.get(r.emoji) ?? [];
    list.push(r.user_id);
    m.set(r.emoji, list);
  }
  return rows.map((r) =>
    rawMessageView(
      r,
      [...(byMsg.get(r.id) ?? new Map<string, string[]>()).entries()].map(([emoji, user_ids]) => ({ emoji, user_ids })),
      pins.has(r.id),
      receiptsBy.get(r.id),
    ),
  );
}

export async function messageViewById(id: string, q: Queryable = db): Promise<MessageView | null> {
  const rows = await q.query(`SELECT ${MSG_COLS} FROM messages m WHERE m.id = $1`, [id]);
  if (!rows.length) return null;
  return (await messageViews(rows, q))[0];
}

/** Conversation views for a given viewer (members, last message, unread count). */
export async function conversationViews(convRows: any[], viewerId: string, q: Queryable = db): Promise<Conversation[]> {
  if (!convRows.length) return [];
  const ids = convRows.map((c) => c.id);
  const [members, lasts, unread, prefs] = await Promise.all([
    q.query(
      `SELECT cm.conversation_id, ${USER_COLS} FROM conversation_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ANY($1::uuid[]) ORDER BY cm.joined_at ASC`,
      [ids],
    ),
    q.query(
      `SELECT ${MSG_COLS} FROM conversations c
       JOIN LATERAL (
         SELECT * FROM messages mm
         WHERE mm.conversation_id = c.id
           AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $2 AND h.message_id = mm.id)
         ORDER BY mm.seq DESC LIMIT 1
       ) m ON true
       WHERE c.id = ANY($1::uuid[])`,
      [ids, viewerId],
    ),
    q.query(
      `SELECT m.conversation_id, COUNT(*)::int AS n FROM messages m
       LEFT JOIN read_state rs ON rs.conversation_id = m.conversation_id AND rs.user_id = $2
       WHERE m.conversation_id = ANY($1::uuid[]) AND m.sender_id <> $2 AND m.deleted_at IS NULL
         AND m.seq > COALESCE(rs.last_read_seq, 0)
         AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $2 AND h.message_id = m.id)
       GROUP BY m.conversation_id`,
      [ids, viewerId],
    ),
    q.query(
      `SELECT cm.conversation_id, cm.notification_level, cm.muted_until
       FROM conversation_members cm WHERE cm.conversation_id = ANY($1::uuid[]) AND cm.user_id = $2
       UNION ALL
       SELECT c.id AS conversation_id, dm.notification_level, dm.muted_until
       FROM conversations c JOIN dock_members dm ON dm.dock_id = c.dock_id AND dm.user_id = $2
       WHERE c.id = ANY($1::uuid[]) AND c.kind = 'channel'`,
      [ids, viewerId],
    ),
  ]);
  const lastViews = await messageViews(lasts, q);
  const lastBy = new Map(lastViews.map((m) => [m.conversation_id, m]));
  const unreadBy = new Map(unread.map((r: any) => [r.conversation_id, Number(r.n)]));
  const prefBy = new Map(prefs.map((r: any) => [r.conversation_id, r]));
  const membersBy = new Map<string, User[]>();
  for (const m of members) {
    const list = membersBy.get(m.conversation_id) ?? [];
    list.push(userView(m));
    membersBy.set(m.conversation_id, list);
  }
  return convRows.map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.kind === "dm" ? null : (c.title ?? null),
    avatar_url: c.avatar_url ?? null,
    dock_id: c.dock_id ?? null,
    members: membersBy.get(c.id) ?? [],
    last_message: lastBy.get(c.id) ?? null,
    unread_count: unreadBy.get(c.id) ?? 0,
    notification_level: prefBy.get(c.id)?.notification_level ?? "all",
    muted_until: prefBy.get(c.id)?.muted_until ? iso(prefBy.get(c.id).muted_until) : null,
    created_at: iso(c.created_at),
  }));
}

export async function conversationView(convId: string, viewerId: string, q: Queryable = db): Promise<Conversation | null> {
  const rows = await q.query(`SELECT c.*, ch.name AS channel_name FROM conversations c LEFT JOIN channels ch ON ch.id = c.id WHERE c.id = $1`, [convId]);
  if (!rows.length) return null;
  if (rows[0].kind === "channel" && !rows[0].title) rows[0].title = rows[0].channel_name;
  return (await conversationViews(rows, viewerId, q))[0];
}

export function channelView(r: any): Channel {
  return { id: r.id, dock_id: r.dock_id, name: r.name, topic: r.topic ?? "", position: Number(r.position ?? 0) };
}

export async function dockViews(dockRows: any[], viewerId: string | null, q: Queryable = db): Promise<Dock[]> {
  if (!dockRows.length) return [];
  const ids = dockRows.map((d) => d.id);
  const [counts, roles, channels] = await Promise.all([
    q.query(`SELECT dock_id, COUNT(*)::int AS n FROM dock_members WHERE dock_id = ANY($1::uuid[]) GROUP BY dock_id`, [ids]),
    viewerId
      ? q.query(`SELECT dock_id, role FROM dock_members WHERE dock_id = ANY($1::uuid[]) AND user_id = $2`, [ids, viewerId])
      : Promise.resolve([]),
    q.query(`SELECT * FROM channels WHERE dock_id = ANY($1::uuid[]) ORDER BY position ASC, name ASC`, [ids]),
  ]);
  const countBy = new Map(counts.map((r: any) => [r.dock_id, Number(r.n)]));
  const roleBy = new Map(roles.map((r: any) => [r.dock_id, r.role as DockRole]));
  const chBy = new Map<string, Channel[]>();
  for (const c of channels) {
    const list = chBy.get(c.dock_id) ?? [];
    list.push(channelView(c));
    chBy.set(c.dock_id, list);
  }
  return dockRows.map((d) => {
    const role = roleBy.get(d.id) ?? null;
    // Private docks: hide channel list from non-members.
    const showChannels = d.visibility === "public" || role !== null;
    return {
      id: d.id,
      name: d.name,
      handle: d.handle,
      description: d.description ?? "",
      icon_url: d.icon_url ?? null,
      visibility: d.visibility,
      owner_id: d.owner_id,
      member_count: countBy.get(d.id) ?? 0,
      my_role: role,
      channels: showChannels ? (chBy.get(d.id) ?? []) : [],
      created_at: iso(d.created_at),
    };
  });
}

export async function dockView(dockId: string, viewerId: string | null, q: Queryable = db): Promise<Dock | null> {
  const rows = await q.query(`SELECT * FROM docks WHERE id = $1`, [dockId]);
  if (!rows.length) return null;
  return (await dockViews(rows, viewerId, q))[0];
}

export function attachmentView(r: any): Attachment {
  const a: Attachment = { id: r.id, url: `/v1/attachments/${r.id}`, mime: r.mime, size: Number(r.size) };
  if (r.width) a.width = Number(r.width);
  if (r.height) a.height = Number(r.height);
  if (r.name) a.name = r.name;
  if (r.thumbnail_key) a.thumbnail_url = `/v1/attachments/${r.id}?variant=thumb`;
  return a;
}
