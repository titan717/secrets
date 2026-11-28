import { openBody, sealBody, type MessageView } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest, forbidden, notFound, uuid, isUuid, assertId } from "../../lib/http.js";
import { MSG_COLS, messageViews, messageViewById } from "../../lib/views.js";
import { publish, conversationAudience } from "../realtime/bus.js";
import { access, memberIds } from "../conversations/service.js";
import { notifyMessage, createReceipts, markReadReceipts, markDelivered, markConversationNotificationsRead, assertNotBlocked, receiptsForMessage } from "../moderation/service.js";
import { sendLimit } from "../../lib/rate.js";

const MAX_CIPHERTEXT = 64 * 1024;
const MAX_TEXT = 8000;

export interface SendInput {
  ciphertext: unknown;
  nonce: unknown;
  client_msg_id: unknown;
  device_id?: unknown;
}

function validateEnvelope(i: SendInput) {
  if (typeof i.ciphertext !== "string" || !i.ciphertext) throw badRequest("ciphertext is required");
  if (i.ciphertext.length > MAX_CIPHERTEXT) throw badRequest("Message is too large", "too_large");
  if (i.nonce !== null && i.nonce !== undefined && typeof i.nonce !== "string") throw badRequest("nonce must be a string or null");
  if (typeof i.client_msg_id !== "string" || !i.client_msg_id || i.client_msg_id.length > 128)
    throw badRequest("client_msg_id is required (<= 128 chars)");
  const body = openBody({ ciphertext: i.ciphertext, nonce: (i.nonce as string) ?? null });
  if (body.kind === "system") throw badRequest("System messages can't be sent by clients");
  if (body.text !== undefined && typeof body.text !== "string") throw badRequest("text must be a string");
  if ((body.text?.length ?? 0) > MAX_TEXT) throw badRequest(`Messages are limited to ${MAX_TEXT} characters`, "too_large");
  const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
  if (!body.text?.trim() && !hasAttachments) throw badRequest("Message is empty");
  if (hasAttachments && body.attachments!.length > 10) throw badRequest("At most 10 attachments per message");
  return body;
}

/** Can this user post in this conversation? (#announcements is admin-only). */
function assertCanPost(a: Awaited<ReturnType<typeof access>>) {
  if (a.conv.kind === "channel" && a.channel?.name === "announcements" && a.role !== "owner" && a.role !== "admin")
    throw forbidden("Only dock admins can post in #announcements");
}

/**
 * The one messaging pipeline (REST + WS). Idempotent on (sender_id, client_msg_id).
 * Returns the stored message and whether it was newly created.
 */
export async function sendMessage(
  senderId: string,
  deviceId: string,
  conversationId: unknown,
  input: SendInput,
  opts: { system?: boolean } = {},
): Promise<{ message: MessageView; created: boolean }> {
  if (!opts.system) sendLimit(senderId);
  const a = await access(conversationId, senderId, "write");
  if (!opts.system) assertCanPost(a);
  if (a.conv.kind === "dm") {
    const others = (await memberIds(a.conv.id)).filter((u) => u !== senderId);
    if (others[0]) await assertNotBlocked(senderId, others[0]);
  }
  const body = opts.system ? openBody({ ciphertext: String(input.ciphertext), nonce: null }) : validateEnvelope(input);
  const clientMsgId = input.client_msg_id as string;

  const existing = await db.one(`SELECT ${MSG_COLS} FROM messages m WHERE m.sender_id = $1 AND m.client_msg_id = $2`, [senderId, clientMsgId]);
  if (existing) {
    if (existing.conversation_id !== a.conv.id) throw badRequest("client_msg_id already used in another conversation", "duplicate_client_msg_id");
    return { message: (await messageViews([existing]))[0], created: false };
  }

  let replyTo: string | null = null;
  if (body.reply_to) {
    if (!isUuid(body.reply_to)) throw badRequest("reply_to must be a message id");
    const r = await db.one(`SELECT conversation_id FROM messages WHERE id = $1`, [body.reply_to]);
    if (!r || r.conversation_id !== a.conv.id) throw badRequest("reply_to message not found in this conversation");
    replyTo = body.reply_to;
  }

  const id = uuid();
  const rows = await db.query(
    `INSERT INTO messages (id, conversation_id, sender_id, device_id, ciphertext, nonce, client_msg_id, reply_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (sender_id, client_msg_id) DO NOTHING
     RETURNING id, seq, conversation_id, sender_id, device_id, ciphertext, nonce, client_msg_id, created_at, edited_at, deleted_at`,
    [id, a.conv.id, senderId, deviceId, input.ciphertext, (input.nonce as string) ?? null, clientMsgId, replyTo],
  );
  if (!rows.length) {
    // Lost a race with a concurrent retry of the same client_msg_id.
    const again = await db.one(`SELECT ${MSG_COLS} FROM messages m WHERE m.sender_id = $1 AND m.client_msg_id = $2`, [senderId, clientMsgId]);
    return { message: (await messageViews([again]))[0], created: false };
  }
  const row = rows[0];
  await db.query(`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, [a.conv.id, row.created_at]);
  await db.query(
    `INSERT INTO read_state (conversation_id, user_id, last_read_message_id, last_read_seq) VALUES ($1, $2, $3, $4)
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id,
       last_read_seq = EXCLUDED.last_read_seq, updated_at = now() WHERE read_state.last_read_seq < EXCLUDED.last_read_seq`,
    [a.conv.id, senderId, row.id, row.seq],
  );
  const message = (await messageViews([row]))[0];
  const audience = await conversationAudience(a.conv.id);
  if (a.conv.kind !== "channel") await createReceipts(message.id, audience.filter((u) => u !== senderId)).catch(() => {});
  // Sender's other devices get msg.new too; the sending device gets msg.ack.
  publish(audience.filter((u) => u !== senderId), { t: "msg.new", message });
  publish([senderId], { t: "msg.new", message }, deviceId);
  await notifyMessage({
    conversationId: a.conv.id,
    kind: a.conv.kind,
    dockId: a.conv.dock_id ?? null,
    messageId: message.id,
    senderId,
    text: body.text ?? "",
    hasAttachments: !!body.attachments?.length,
  }).catch(() => {});
  return { message, created: true };
}

/** Post a server-authored system message (e.g. "X joined"). */
export async function systemMessage(botId: string, conversationId: string, text: string) {
  const { ciphertext } = sealBody({ text, kind: "system" });
  return sendMessage(botId, "server", conversationId, { ciphertext, nonce: null, client_msg_id: `sys-${uuid()}` }, { system: true });
}

export async function listMessages(viewerId: string, conversationId: unknown, before?: unknown, limitRaw?: unknown): Promise<MessageView[]> {
  const a = await access(conversationId, viewerId, "read");
  const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 100);
  await markDelivered(viewerId, a.conv.id).catch(() => {});
  let rows: any[];
  if (before !== undefined && before !== null && before !== "") {
    if (!isUuid(before)) throw badRequest("before must be a message id");
    const cursor = await db.one(`SELECT seq FROM messages WHERE id = $1 AND conversation_id = $2`, [before, a.conv.id]);
    if (!cursor) throw badRequest("before cursor not found in this conversation");
    rows = await db.query(`SELECT ${MSG_COLS} FROM messages m WHERE m.conversation_id = $1 AND m.seq < $2
      AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $4 AND h.message_id = m.id)
      ORDER BY m.seq DESC LIMIT $3`, [
      a.conv.id,
      cursor.seq,
      limit,
      viewerId,
    ]);
  } else {
    rows = await db.query(`SELECT ${MSG_COLS} FROM messages m WHERE m.conversation_id = $1
      AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $3 AND h.message_id = m.id)
      ORDER BY m.seq DESC LIMIT $2`, [a.conv.id, limit, viewerId]);
  }
  return messageViews(rows);
}

/** Fetch a message the viewer can see (throws 404 otherwise). */
export async function visibleMessage(viewerId: string, messageId: unknown, mode: "read" | "write" = "read") {
  const id = assertId(messageId, "Message");
  const row = await db.one(`SELECT ${MSG_COLS} FROM messages m WHERE m.id = $1`, [id]);
  if (!row) throw notFound("Message not found");
  const a = await access(row.conversation_id, viewerId, mode).catch(() => {
    throw notFound("Message not found");
  });
  return { row, access: a };
}

async function broadcastUpdate(messageId: string) {
  const message = await messageViewById(messageId);
  if (!message) throw notFound("Message not found");
  publish(await conversationAudience(message.conversation_id), { t: "msg.update", message });
  return message;
}

export async function react(userId: string, messageId: unknown, emojiRaw: unknown, on: boolean): Promise<MessageView> {
  const emoji = typeof emojiRaw === "string" ? emojiRaw.trim() : "";
  if (!emoji || [...emoji].length > 16 || emoji.length > 64) throw badRequest("emoji is required");
  const { row } = await visibleMessage(userId, messageId, on ? "write" : "read");
  if (row.deleted_at) throw badRequest("Can't react to a deleted message");
  if (on) {
    const count = await db.one(`SELECT COUNT(DISTINCT emoji)::int AS n FROM reactions WHERE message_id = $1`, [row.id]);
    const mine = await db.one(`SELECT 1 FROM reactions WHERE message_id = $1 AND emoji = $2`, [row.id, emoji]);
    if (!mine && Number(count?.n ?? 0) >= 20) throw badRequest("Too many different reactions on this message");
    await db.query(`INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [row.id, userId, emoji]);
  } else {
    await db.query(`DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`, [row.id, userId, emoji]);
  }
  await db.query(`UPDATE messages SET updated_at = now() WHERE id = $1`, [row.id]);
  return broadcastUpdate(row.id);
}

export async function editMessage(userId: string, messageId: unknown, input: { ciphertext: unknown; nonce: unknown }): Promise<MessageView> {
  const { row } = await visibleMessage(userId, messageId, "write");
  if (row.sender_id !== userId) throw forbidden("You can only edit your own messages");
  if (row.deleted_at) throw badRequest("Can't edit a deleted message");
  const body = validateEnvelope({ ...input, client_msg_id: row.client_msg_id });
  const prev = openBody(row);
  // reply_to is fixed at send time.
  if ((body.reply_to ?? null) !== (prev.reply_to ?? null)) throw badRequest("reply_to can't be changed");
  await db.query(`UPDATE messages SET ciphertext = $2, nonce = $3, edited_at = now(), updated_at = now() WHERE id = $1`, [
    row.id,
    input.ciphertext,
    (input.nonce as string) ?? null,
  ]);
  return broadcastUpdate(row.id);
}

export async function deleteMessage(userId: string, messageId: unknown): Promise<MessageView> {
  const { row, access: a } = await visibleMessage(userId, messageId, "read");
  const moderator =
    (a.conv.kind === "channel" && (a.role === "owner" || a.role === "admin")) || (a.conv.kind === "group" && a.role === "owner");
  if (row.sender_id !== userId && !moderator) throw forbidden("You can only delete your own messages");
  if (!row.deleted_at) {
    const { ciphertext, nonce } = sealBody({});
    await db.query(`UPDATE messages SET ciphertext = $2, nonce = $3, deleted_at = now(), updated_at = now() WHERE id = $1`, [row.id, ciphertext, nonce]);
    await db.query(`DELETE FROM reactions WHERE message_id = $1`, [row.id]);
    await db.query(`DELETE FROM pins WHERE message_id = $1`, [row.id]);
  }
  return broadcastUpdate(row.id);
}

/** "Delete for me": hide a message from this user's views without touching it for others. */
export async function hideMessage(userId: string, messageId: unknown): Promise<{ ok: true }> {
  const { row } = await visibleMessage(userId, messageId, "read");
  await db.query(`INSERT INTO message_hides (user_id, message_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, row.id]);
  return { ok: true as const };
}

/** Per-recipient delivery/read state for a message the viewer can see. */
export async function messageReceipts(viewerId: string, messageId: unknown) {
  const { row, access: a } = await visibleMessage(viewerId, messageId, "read");
  if (a.conv.kind === "channel") return { recipients: [] as any[], delivered_count: 0, read_count: 0 };
  const recipients = await receiptsForMessage(row.id);
  return {
    recipients,
    delivered_count: recipients.filter((r) => r.delivered_at).length,
    read_count: recipients.filter((r) => r.read_at).length,
  };
}

export async function markRead(conversationId: string, userId: string, messageId: string, kind: string) {
  const m = await db.one(`SELECT seq FROM messages WHERE id = $1 AND conversation_id = $2`, [messageId, conversationId]);
  if (!m) throw notFound("Message not found in this conversation");
  const rows = await db.query(
    `INSERT INTO read_state (conversation_id, user_id, last_read_message_id, last_read_seq) VALUES ($1, $2, $3, $4)
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id,
       last_read_seq = EXCLUDED.last_read_seq, updated_at = now() WHERE read_state.last_read_seq < EXCLUDED.last_read_seq
     RETURNING conversation_id`,
    [conversationId, userId, messageId, m.seq],
  );
  if (!rows.length) return; // already read further
  // Read receipts go to dm/group members; for channels only to the reader's own devices.
  const audience = kind === "channel" ? [userId] : await memberIds(conversationId);
  publish(audience, { t: "read", conversation_id: conversationId, user_id: userId, message_id: messageId });
  await markReadReceipts(userId, conversationId, Number(m.seq)).catch(() => {});
  await markConversationNotificationsRead(userId, conversationId).catch(() => {});
}

/** Messages created or changed after `since` in every conversation the user can see (offline sync). */
export async function messagesSince(userId: string, since: string | null, limit = 1000): Promise<MessageView[]> {
  if (!since) return [];
  const t = new Date(since);
  if (isNaN(t.getTime())) return [];
  const rows = await db.query(
    `SELECT ${MSG_COLS} FROM messages m
     WHERE m.updated_at > $2 AND m.conversation_id IN (
       SELECT conversation_id FROM conversation_members WHERE user_id = $1
       UNION
       SELECT c.id FROM conversations c JOIN dock_members dm ON dm.dock_id = c.dock_id AND dm.user_id = $1 WHERE c.kind = 'channel'
     )
     AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $1 AND h.message_id = m.id)
     ORDER BY m.seq ASC LIMIT $3`,
    [userId, t.toISOString(), limit],
  );
  return messageViews(rows);
}

// ---- pins -------------------------------------------------------------------
export async function setPin(userId: string, messageId: unknown, on: boolean): Promise<MessageView> {
  const { row, access: a } = await visibleMessage(userId, messageId, "write");
  if (a.conv.kind === "channel" && a.role !== "owner" && a.role !== "admin") throw forbidden("Only dock admins can pin in channels");
  if (on) {
    if (row.deleted_at) throw badRequest("Can't pin a deleted message");
    const n = await db.one(`SELECT COUNT(*)::int AS n FROM pins WHERE conversation_id = $1`, [row.conversation_id]);
    if (Number(n?.n ?? 0) >= 50) throw badRequest("At most 50 pinned messages per conversation");
    await db.query(`INSERT INTO pins (conversation_id, message_id, pinned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
      row.conversation_id,
      row.id,
      userId,
    ]);
  } else {
    await db.query(`DELETE FROM pins WHERE conversation_id = $1 AND message_id = $2`, [row.conversation_id, row.id]);
  }
  await db.query(`UPDATE messages SET updated_at = now() WHERE id = $1`, [row.id]);
  return broadcastUpdate(row.id);
}

export async function listPins(userId: string, conversationId: unknown): Promise<MessageView[]> {
  const a = await access(conversationId, userId, "read");
  const rows = await db.query(
    `SELECT ${MSG_COLS} FROM pins p JOIN messages m ON m.id = p.message_id
     WHERE p.conversation_id = $1 AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $2 AND h.message_id = m.id)
     ORDER BY p.created_at DESC`,
    [a.conv.id, userId],
  );
  return messageViews(rows);
}

/**
 * Text search inside one conversation, newest first.
 * PROTOTYPE: ciphertext is plaintext JSON, so we pre-filter in SQL and confirm via openBody.
 * With E2EE this moves client-side.
 */
export async function searchMessages(viewerId: string, conversationId: unknown, qRaw: unknown, limitRaw?: unknown, before?: unknown) {
  const a = await access(conversationId, viewerId, "read");
  const q = typeof qRaw === "string" ? qRaw.trim() : "";
  if (!q) throw badRequest("q is required");
  if (q.length > 200) throw badRequest("q is too long");
  const limit = Math.min(Math.max(Number(limitRaw) || 30, 1), 100);
  let maxSeq = Number.MAX_SAFE_INTEGER;
  if (before) {
    if (!isUuid(before)) throw badRequest("before must be a message id");
    const c = await db.one(`SELECT seq FROM messages WHERE id = $1 AND conversation_id = $2`, [before, a.conv.id]);
    if (!c) throw badRequest("before cursor not found in this conversation");
    maxSeq = Number(c.seq);
  }
  const like = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const needle = q.toLowerCase();
  const out: any[] = [];
  let cursor = maxSeq;
  // Page through SQL candidates until we have `limit` confirmed hits (bounded).
  for (let round = 0; round < 5 && out.length < limit; round++) {
    const rows = await db.query(
      `SELECT ${MSG_COLS} FROM messages m WHERE m.conversation_id = $1 AND m.deleted_at IS NULL AND m.seq < $2
       AND lower(m.ciphertext) LIKE $3
       AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $5 AND h.message_id = m.id)
       ORDER BY m.seq DESC LIMIT $4`,
      [a.conv.id, cursor, like, limit * 2, viewerId],
    );
    if (!rows.length) break;
    for (const r of rows) {
      const text = openBody(r).text ?? "";
      if (text.toLowerCase().includes(needle)) out.push(r);
      if (out.length >= limit) break;
    }
    cursor = Number(rows[rows.length - 1].seq);
    if (rows.length < limit * 2) break;
  }
  return messageViews(out);
}
