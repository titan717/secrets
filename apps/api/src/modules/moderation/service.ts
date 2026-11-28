import { db } from "../../db/index.js";
import { badRequest, forbidden, notFound, uuid, isUuid } from "../../lib/http.js";
import { USER_COLS, userView } from "../../lib/views.js";
import { publish, conversationAudience, memberIds } from "../realtime/bus.js";
import { access } from "../conversations/service.js";
import type { MessageReceipt, Notification, NotificationLevel } from "@secrets/shared";

const LEVELS: NotificationLevel[] = ["all", "mentions", "none"];
const MAX_NOTIFICATIONS_PER_MESSAGE = 500;

export function parseLevel(v: unknown): NotificationLevel {
  if (typeof v !== "string" || !LEVELS.includes(v as NotificationLevel)) throw badRequest("level must be all, mentions or none");
  return v as NotificationLevel;
}

/** Blocks are symmetric for messaging: either direction prevents contact. */
export async function assertNotBlocked(a: string, b: string): Promise<void> {
  const row = await db.one(
    `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [a, b],
  );
  if (row) throw forbidden("You can't message this person");
}

export async function blockUser(actorId: string, usernameRaw: string): Promise<{ ok: true }> {
  const username = String(usernameRaw ?? "").trim().toLowerCase().replace(/^@/, "");
  const target = await db.one<{ id: string }>(`SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL`, [username]);
  if (!target) throw notFound("User not found");
  if (target.id === actorId) throw badRequest("You can't block yourself");
  await db.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [actorId, target.id]);
  return { ok: true as const };
}

export async function unblockUser(actorId: string, usernameRaw: string): Promise<{ ok: true }> {
  const username = String(usernameRaw ?? "").trim().toLowerCase().replace(/^@/, "");
  const target = await db.one<{ id: string }>(`SELECT id FROM users WHERE username = $1`, [username]);
  if (!target) throw notFound("User not found");
  await db.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [actorId, target.id]);
  return { ok: true as const };
}

export async function listBlocks(userId: string) {
  const rows = await db.query(
    `SELECT ${USER_COLS} FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows.map(userView);
}

export async function setNotificationLevel(
  userId: string,
  conversationId: unknown,
  level: NotificationLevel,
  mutedUntilRaw: unknown,
): Promise<{ level: NotificationLevel; muted_until: string | null }> {
  const a = await access(conversationId, userId, "read");
  if (!a.member) throw forbidden("Join this dock to change notification settings");
  let mutedUntil: string | null = null;
  if (mutedUntilRaw !== undefined && mutedUntilRaw !== null) {
    if (typeof mutedUntilRaw !== "string") throw badRequest("muted_until must be an ISO timestamp or null");
    const d = new Date(mutedUntilRaw);
    if (isNaN(d.getTime())) throw badRequest("muted_until must be an ISO timestamp or null");
    mutedUntil = d.toISOString();
  }
  if (a.conv.kind === "channel") {
    await db.query(`UPDATE dock_members SET notification_level = $3, muted_until = $4 WHERE dock_id = $1 AND user_id = $2`, [
      a.conv.dock_id,
      userId,
      level,
      mutedUntil,
    ]);
  } else {
    await db.query(`UPDATE conversation_members SET notification_level = $3, muted_until = $4 WHERE conversation_id = $1 AND user_id = $2`, [
      a.conv.id,
      userId,
      level,
      mutedUntil,
    ]);
  }
  return { level, muted_until: mutedUntil };
}

export async function getNotificationLevel(userId: string, conversationId: unknown) {
  const a = await access(conversationId, userId, "read");
  const row =
    a.conv.kind === "channel"
      ? await db.one<{ notification_level: NotificationLevel; muted_until: Date | null }>(
          `SELECT notification_level, muted_until FROM dock_members WHERE dock_id = $1 AND user_id = $2`,
          [a.conv.dock_id, userId],
        )
      : await db.one<{ notification_level: NotificationLevel; muted_until: Date | null }>(
          `SELECT notification_level, muted_until FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
          [a.conv.id, userId],
        );
  return {
    level: row?.notification_level ?? "all",
    muted_until: row?.muted_until ? new Date(row.muted_until).toISOString() : null,
  };
}

export interface NotifyInput {
  conversationId: string;
  kind: string;
  dockId: string | null;
  messageId: string;
  senderId: string;
  text: string;
  hasAttachments: boolean;
}

/**
 * In-app notification fan-out. Respects blocks, per-conversation levels and mutes.
 * One unread row per conversation is kept (new activity updates it) so the centre
 * stays readable instead of accumulating every message.
 */
export async function notifyMessage(input: NotifyInput): Promise<void> {
  const audience = await conversationAudience(input.conversationId);
  const recipients = audience.filter((id) => id !== input.senderId);
  if (!recipients.length) return;

  const blocks = await db.query<{ blocker_id: string; blocked_id: string }>(
    `SELECT blocker_id, blocked_id FROM blocks
     WHERE (blocked_id = $1 AND blocker_id = ANY($2::uuid[])) OR (blocker_id = $1 AND blocked_id = ANY($2::uuid[]))`,
    [input.senderId, recipients],
  );
  const blocked = new Set<string>();
  for (const b of blocks) blocked.add(b.blocker_id === input.senderId ? b.blocked_id : b.blocker_id);

  const prefs =
    input.kind === "channel" && input.dockId
      ? await db.query<{ user_id: string; notification_level: NotificationLevel; muted_until: Date | null }>(
          `SELECT user_id, notification_level, muted_until FROM dock_members WHERE dock_id = $1 AND user_id = ANY($2::uuid[])`,
          [input.dockId, recipients],
        )
      : await db.query<{ user_id: string; notification_level: NotificationLevel; muted_until: Date | null }>(
          `SELECT user_id, notification_level, muted_until FROM conversation_members WHERE conversation_id = $1 AND user_id = ANY($2::uuid[])`,
          [input.conversationId, recipients],
        );
  const prefBy = new Map(prefs.map((p) => [p.user_id, p]));

  const names = await db.query<{ id: string; username: string }>(`SELECT id, username FROM users WHERE id = ANY($1::uuid[])`, [recipients]);
  const nameBy = new Map(names.map((n) => [n.id, n.username]));

  const text = input.text ?? "";
  const lower = text.toLowerCase();
  const now = Date.now();
  const targets: { id: string; mention: boolean }[] = [];
  for (const uid of recipients) {
    if (blocked.has(uid)) continue;
    const p = prefBy.get(uid);
    if (!p) continue;
    if (p.notification_level === "none") continue;
    if (p.muted_until && new Date(p.muted_until).getTime() > now) continue;
    const mention = !!nameBy.get(uid) && lower.includes(`@${nameBy.get(uid)!.toLowerCase()}`);
    if (p.notification_level === "mentions" && !mention) continue;
    targets.push({ id: uid, mention });
    if (targets.length >= MAX_NOTIFICATIONS_PER_MESSAGE) break;
  }
  if (!targets.length) return;

  const actorRow = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [input.senderId]);
  const actor = actorRow ? userView(actorRow) : null;
  const preview = text.trim().slice(0, 140) || (input.hasAttachments ? "Sent an attachment" : "New message");

  for (const t of targets) {
    const kind = t.mention ? "mention" : "message";
    const existing = await db.one<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = $1 AND conversation_id = $2 AND read_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [t.id, input.conversationId],
    );
    const id = existing?.id ?? uuid();
    if (existing) {
      await db.query(`UPDATE notifications SET kind = $2, message_id = $3, actor_id = $4, preview = $5, created_at = now() WHERE id = $1`, [
        id,
        kind,
        input.messageId,
        input.senderId,
        preview,
      ]);
    } else {
      await db.query(
        `INSERT INTO notifications (id, user_id, kind, conversation_id, message_id, actor_id, preview) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, t.id, kind, input.conversationId, input.messageId, input.senderId, preview],
      );
    }
    const notification: Notification = {
      id,
      kind: kind as Notification["kind"],
      conversation_id: input.conversationId,
      message_id: input.messageId,
      actor,
      preview,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    publish([t.id], { t: "notification", notification });
  }
}

export async function listNotifications(userId: string, before?: unknown, limitRaw?: unknown): Promise<Notification[]> {
  const limit = Math.min(Math.max(Number(limitRaw) || 30, 1), 100);
  let beforeAt: string | null = null;
  if (typeof before === "string" && before) {
    if (!isUuid(before)) throw badRequest("before must be a notification id");
    const cursor = await db.one<{ created_at: Date }>(`SELECT created_at FROM notifications WHERE id = $1 AND user_id = $2`, [before, userId]);
    if (!cursor) throw badRequest("before cursor not found");
    beforeAt = new Date(cursor.created_at).toISOString();
  }
  const rows = await db.query(
    `SELECT n.*, c.title, ch.name AS channel_name, ${USER_COLS}
     FROM notifications n
     LEFT JOIN conversations c ON c.id = n.conversation_id
     LEFT JOIN channels ch ON ch.id = c.id
     LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = $1 ${beforeAt ? "AND n.created_at < $3" : ""}
     ORDER BY n.created_at DESC LIMIT $2`,
    beforeAt ? [userId, limit, beforeAt] : [userId, limit],
  );
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    conversation_id: r.conversation_id ?? null,
    message_id: r.message_id ?? null,
    actor: r.actor_id ? userView(r) : null,
    preview: r.preview ?? "",
    read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
    created_at: new Date(r.created_at).toISOString(),
    conversation_title: r.title ?? r.channel_name ?? null,
  }));
}

export async function markNotificationsRead(userId: string, ids?: unknown): Promise<{ ok: true; updated: number }> {
  if (Array.isArray(ids) && ids.length) {
    const valid = ids.filter((x) => typeof x === "string" && isUuid(x));
    if (!valid.length) return { ok: true as const, updated: 0 };
    const rows = await db.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL RETURNING id`,
      [userId, valid],
    );
    return { ok: true as const, updated: rows.length };
  }
  const rows = await db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL RETURNING id`, [userId]);
  return { ok: true as const, updated: rows.length };
}

export async function markConversationNotificationsRead(userId: string, conversationId: string): Promise<void> {
  await db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND conversation_id = $2 AND read_at IS NULL`, [
    userId,
    conversationId,
  ]);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const row = await db.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  return Number(row?.n ?? 0);
}

export async function deleteNotification(userId: string, id: unknown): Promise<{ ok: true }> {
  if (!isUuid(id)) throw notFound("Notification not found");
  const rows = await db.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  if (!rows.length) throw notFound("Notification not found");
  return { ok: true as const };
}

// ── per-recipient receipts ──────────────────────────────────────────────────

export async function createReceipts(messageId: string, recipientIds: string[]): Promise<void> {
  if (!recipientIds.length) return;
  for (const uid of recipientIds)
    await db.query(`INSERT INTO message_receipts (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [messageId, uid]);
}

export async function markDelivered(userId: string, conversationId: string, messageId?: string | null): Promise<void> {
  const last = messageId
    ? await db.one<{ id: string; seq: string }>(`SELECT id, seq FROM messages WHERE id = $1 AND conversation_id = $2`, [messageId, conversationId])
    : await db.one<{ id: string; seq: string }>(`SELECT id, seq FROM messages WHERE conversation_id = $1 ORDER BY seq DESC LIMIT 1`, [conversationId]);
  if (!last) return;
  const rows = await db.query<{ message_id: string }>(
    `UPDATE message_receipts SET delivered_at = now()
     WHERE user_id = $1 AND delivered_at IS NULL
       AND message_id IN (SELECT id FROM messages WHERE conversation_id = $2 AND seq <= $3)
     RETURNING message_id`,
    [userId, conversationId, last.seq],
  );
  if (!rows.length) return;
  const now = new Date().toISOString();
  publish(await memberIds(conversationId), {
    t: "receipt",
    conversation_id: conversationId,
    user_id: userId,
    message_id: last.id,
    delivered_at: now,
    read_at: null,
  });
}

export async function markReadReceipts(userId: string, conversationId: string, uptoSeq: number): Promise<void> {
  const last = await db.one<{ id: string }>(`SELECT id FROM messages WHERE conversation_id = $1 AND seq <= $2 ORDER BY seq DESC LIMIT 1`, [
    conversationId,
    uptoSeq,
  ]);
  if (!last) return;
  const rows = await db.query<{ message_id: string }>(
    `UPDATE message_receipts SET delivered_at = COALESCE(delivered_at, now()), read_at = now()
     WHERE user_id = $1 AND read_at IS NULL
       AND message_id IN (SELECT id FROM messages WHERE conversation_id = $2 AND seq <= $3)
     RETURNING message_id`,
    [userId, conversationId, uptoSeq],
  );
  if (!rows.length) return;
  const now = new Date().toISOString();
  publish(await memberIds(conversationId), {
    t: "receipt",
    conversation_id: conversationId,
    user_id: userId,
    message_id: last.id,
    delivered_at: now,
    read_at: now,
  });
}

/** On reconnect, mark everything addressed to this user as delivered. */
export async function markAllDelivered(userId: string): Promise<void> {
  const rows = await db.query<{ conversation_id: string; message_id: string }>(
    `UPDATE message_receipts r SET delivered_at = now()
     FROM messages m
     WHERE r.message_id = m.id AND r.user_id = $1 AND r.delivered_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $1 AND h.message_id = m.id)
     RETURNING m.conversation_id, r.message_id`,
    [userId],
  );
  if (!rows.length) return;
  const byConv = new Map<string, string>();
  for (const r of rows) byConv.set(r.conversation_id, r.message_id);
  const now = new Date().toISOString();
  for (const [conversationId, messageId] of [...byConv].slice(0, 50)) {
    publish(await memberIds(conversationId), {
      t: "receipt",
      conversation_id: conversationId,
      user_id: userId,
      message_id: messageId,
      delivered_at: now,
      read_at: null,
    });
  }
}

export async function receiptsForMessage(messageId: string): Promise<MessageReceipt[]> {
  const rows = await db.query(
    `SELECT r.user_id, r.delivered_at, r.read_at, ${USER_COLS}
     FROM message_receipts r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.message_id = $1 ORDER BY r.delivered_at NULLS LAST, r.user_id`,
    [messageId],
  );
  return rows.map((r: any) => ({
    user_id: r.user_id,
    user: r.user_id ? userView(r) : null,
    delivered_at: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
    read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
  }));
}
