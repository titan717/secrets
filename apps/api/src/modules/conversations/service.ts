import { db, type Queryable } from "../../db/index.js";
import { forbidden, notFound, assertId } from "../../lib/http.js";
import { conversationView } from "../../lib/views.js";
import { publish } from "../realtime/bus.js";

export interface ConvAccess {
  conv: any; // conversations row
  role: string | null; // conversation role (dm/group) or dock role (channel)
  member: boolean;
  channel?: any; // channels row when kind === channel
}

/**
 * Resolve a conversation and the viewer's access to it.
 * dm/group: must be a member. channel: dock membership (read allowed on public docks).
 */
export async function access(convId: unknown, userId: string, mode: "read" | "write" = "read", q: Queryable = db): Promise<ConvAccess> {
  const id = assertId(convId, "Conversation");
  const conv = await q.query(`SELECT * FROM conversations WHERE id = $1`, [id]).then((r) => r[0]);
  if (!conv) throw notFound("Conversation not found");
  if (conv.kind === "channel") {
    const row = await q
      .query(
        `SELECT d.visibility, dm.role, ch.name, ch.topic, ch.position, ch.dock_id FROM channels ch JOIN docks d ON d.id = ch.dock_id
         LEFT JOIN dock_members dm ON dm.dock_id = d.id AND dm.user_id = $2 WHERE ch.id = $1`,
        [id, userId],
      )
      .then((r) => r[0]);
    if (!row) throw notFound("Conversation not found");
    const member = !!row.role;
    if (!member && (mode === "write" || row.visibility !== "public")) {
      if (row.visibility !== "public") throw notFound("Conversation not found");
      throw forbidden("Join this dock to post here");
    }
    return { conv, role: row.role ?? null, member, channel: row };
  }
  const m = await q.query(`SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [id, userId]).then((r) => r[0]);
  if (!m) throw notFound("Conversation not found");
  return { conv, role: m.role, member: true };
}

export async function memberIds(convId: string, q: Queryable = db): Promise<string[]> {
  const rows = await q.query<{ user_id: string }>(`SELECT user_id FROM conversation_members WHERE conversation_id = $1`, [convId]);
  return rows.map((r) => r.user_id);
}

/** Push a personalised conversation.upsert to each user. */
export async function pushConversation(convId: string, userIds: string[]) {
  await Promise.all(
    userIds.map(async (uid) => {
      const view = await conversationView(convId, uid);
      if (view) publish([uid], { t: "conversation.upsert", conversation: view });
    }),
  );
}
