import type { FastifyInstance } from "fastify";
import { openBody, type MessageView, type SearchResults } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest } from "../../lib/http.js";
import { requireAuth } from "../auth/service.js";
import { conversationViews, dockViews, messageViews, USER_COLS, MSG_COLS, userView } from "../../lib/views.js";
import { searchLimit } from "../../lib/rate.js";

function likePattern(q: string): string {
  return `%${q.toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

export async function searchRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /**
   * One scoped search across messages, people, conversations and Docks.
   * Messages are confirmed after opening the envelope so a SQL candidate can
   * never leak a message the viewer can't read.
   */
  app.get("/v1/search", async (req): Promise<SearchResults> => {
    const uid = req.auth.id;
    searchLimit(uid);
    const qRaw = (req.query as any)?.q;
    const q = typeof qRaw === "string" ? qRaw.trim() : "";
    if (!q) throw badRequest("q is required");
    if (q.length > 100) throw badRequest("q is too long");
    const like = likePattern(q);
    const limit = Math.min(Math.max(Number((req.query as any)?.limit) || 10, 1), 25);

    const [messageRows, userRows, convRows, dockRows] = await Promise.all([
      db.query(
        `SELECT ${MSG_COLS}
         FROM messages m
         WHERE m.deleted_at IS NULL AND lower(m.ciphertext) LIKE $2
           AND m.conversation_id IN (
             SELECT conversation_id FROM conversation_members WHERE user_id = $1
             UNION
             SELECT c.id FROM conversations c JOIN dock_members dm ON dm.dock_id = c.dock_id AND dm.user_id = $1 WHERE c.kind = 'channel'
           )
           AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.user_id = $1 AND h.message_id = m.id)
         ORDER BY m.created_at DESC LIMIT 120`,
        [uid, like],
      ),
      db.query(
        `SELECT ${USER_COLS} FROM users u
         WHERE u.deleted_at IS NULL AND u.is_bot = false AND u.id <> $1
           AND (u.username LIKE $2 OR lower(u.display_name) LIKE $2)
           AND NOT EXISTS (
             SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocked_id = $1 AND b.blocker_id = u.id)
           )
         ORDER BY u.username ASC LIMIT $3`,
        [uid, like, limit],
      ),
      db.query(
        `SELECT c.* FROM conversations c
         WHERE c.kind IN ('dm','group')
           AND c.id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $1)
           AND (
             lower(COALESCE(c.title, '')) LIKE $2
             OR EXISTS (
               SELECT 1 FROM conversation_members cm JOIN users u ON u.id = cm.user_id
               WHERE cm.conversation_id = c.id AND cm.user_id <> $1 AND (u.username LIKE $2 OR lower(u.display_name) LIKE $2)
             )
           )
         UNION
         SELECT c.* FROM conversations c JOIN channels ch ON ch.id = c.id JOIN dock_members dm ON dm.dock_id = c.dock_id AND dm.user_id = $1
         WHERE c.kind = 'channel' AND (lower(ch.name) LIKE $2 OR lower(COALESCE(ch.topic, '')) LIKE $2)
         LIMIT $3`,
        [uid, like, limit],
      ),
      db.query(
        `SELECT * FROM docks d
         WHERE (d.visibility = 'public' OR d.id IN (SELECT dock_id FROM dock_members WHERE user_id = $1))
           AND (lower(d.name) LIKE $2 OR lower(d.handle) LIKE $2 OR lower(COALESCE(d.description, '')) LIKE $2)
         ORDER BY (SELECT COUNT(*) FROM dock_members dm WHERE dm.dock_id = d.id) DESC LIMIT $3`,
        [uid, like, limit],
      ),
    ]);

    const needle = q.toLowerCase();
    const confirmed: any[] = [];
    for (const row of messageRows as any[]) {
      const text = openBody(row).text ?? "";
      if (text.toLowerCase().includes(needle)) confirmed.push(row);
      if (confirmed.length >= limit) break;
    }
    const views = await messageViews(confirmed);
    const convIds = [...new Set(confirmed.map((r) => r.conversation_id))];
    const convInfoRows = convIds.length
      ? await db.query(`SELECT c.id, c.kind, c.title, ch.name AS channel_name FROM conversations c LEFT JOIN channels ch ON ch.id = c.id WHERE c.id = ANY($1::uuid[])`, [convIds])
      : [];
    const convInfo = new Map(convInfoRows.map((r: any) => [r.id, r]));
    const messages = views.map((message: MessageView) => {
      const info: any = convInfo.get(message.conversation_id);
      return {
        message,
        conversation: {
          id: message.conversation_id,
          kind: (info?.kind ?? "dm") as any,
          title: info?.title ?? info?.channel_name ?? null,
        },
      };
    });

    const [conversations, docks] = await Promise.all([
      convRows.length ? conversationViews(convRows as any[], uid) : Promise.resolve([]),
      dockRows.length ? dockViews(dockRows as any[], uid) : Promise.resolve([]),
    ]);

    return {
      query: q,
      messages,
      users: (userRows as any[]).map(userView),
      conversations,
      docks,
    };
  });
}
