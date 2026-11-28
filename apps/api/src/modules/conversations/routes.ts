import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import { badRequest, forbidden, notFound, uuid, isUuid, assertId } from "../../lib/http.js";
import { conversationView, conversationViews } from "../../lib/views.js";
import { requireAuth, assertEmailVerified } from "../auth/service.js";
import { publish, conversationAudience } from "../realtime/bus.js";
import { access, memberIds, pushConversation } from "./service.js";
import { markRead } from "../messages/service.js";

const MAX_GROUP = 256;

function ids(v: unknown, field: string): string[] {
  if (!Array.isArray(v)) throw badRequest(`${field} must be an array of user ids`);
  const out = [...new Set(v.filter((x) => typeof x === "string"))] as string[];
  if (out.some((x) => !isUuid(x))) throw badRequest(`${field} contains an invalid id`);
  return out;
}

async function existingUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await db.query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  return rows.map((r) => r.id);
}

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /**
   * dm + group conversations, most recent first.
   * Extra: `?include_channels=1` also returns channel conversations of the docks you belong to.
   */
  app.get("/v1/conversations", async (req) => {
    const includeChannels = ["1", "true"].includes(String((req.query as any)?.include_channels ?? ""));
    const rows = await db.query(
      `SELECT c.* FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       WHERE c.kind IN ('dm','group')
       ${
         includeChannels
           ? `UNION ALL SELECT c.* FROM conversations c JOIN dock_members dm ON dm.dock_id = c.dock_id AND dm.user_id = $1 WHERE c.kind = 'channel'`
           : ""
       }
       ORDER BY last_message_at DESC NULLS LAST, created_at DESC`,
      [req.auth.id],
    );
    return conversationViews(rows, req.auth.id);
  });

  app.post("/v1/conversations/dm", async (req, reply) => {
    await assertEmailVerified(req.auth.id);
    const other = (req.body as any)?.user_id;
    if (!isUuid(other)) throw badRequest("user_id is required");
    if (other === req.auth.id) throw badRequest("You can't start a DM with yourself");
    if (!(await existingUsers([other])).length) throw notFound("User not found");
    const key = [req.auth.id, other].sort().join(":");
    let conv = await db.one(`SELECT id FROM conversations WHERE dm_key = $1`, [key]);
    let created = false;
    if (!conv) {
      const id = uuid();
      conv = await db.tx(async (q) => {
        const ins = await q.query(
          `INSERT INTO conversations (id, kind, dm_key, created_by) VALUES ($1, 'dm', $2, $3) ON CONFLICT (dm_key) DO NOTHING RETURNING id`,
          [id, key, req.auth.id],
        );
        if (!ins.length) return (await q.query(`SELECT id FROM conversations WHERE dm_key = $1`, [key]))[0];
        await q.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`, [id, req.auth.id, other]);
        created = true;
        return ins[0];
      });
    }
    if (created) {
      reply.code(201);
      await pushConversation(conv.id, [other]);
    }
    return conversationView(conv.id, req.auth.id);
  });

  app.post("/v1/conversations/group", async (req, reply) => {
    await assertEmailVerified(req.auth.id);
    const b = (req.body ?? {}) as any;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title || title.length > 64) throw badRequest("title must be 1-64 characters");
    const requested = ids(b.member_ids ?? [], "member_ids").filter((x) => x !== req.auth.id);
    const members = await existingUsers(requested);
    if (members.length + 1 > MAX_GROUP) throw badRequest(`Groups can have at most ${MAX_GROUP} members`);
    const id = uuid();
    await db.tx(async (q) => {
      await q.query(`INSERT INTO conversations (id, kind, title, created_by) VALUES ($1, 'group', $2, $3)`, [id, title, req.auth.id]);
      await q.query(`INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, req.auth.id]);
      for (const m of members) await q.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`, [id, m]);
    });
    reply.code(201);
    await pushConversation(id, members);
    return conversationView(id, req.auth.id);
  });

  app.get("/v1/conversations/:id", async (req) => {
    const { conv } = await access((req.params as any).id, req.auth.id, "read");
    return conversationView(conv.id, req.auth.id);
  });

  app.patch("/v1/conversations/:id", async (req) => {
    const a = await access((req.params as any).id, req.auth.id, "write");
    if (a.conv.kind !== "group") throw badRequest("Only group conversations can be edited here");
    const b = (req.body ?? {}) as any;
    if (b.title !== undefined) {
      const title = typeof b.title === "string" ? b.title.trim() : "";
      if (!title || title.length > 64) throw badRequest("title must be 1-64 characters");
      await db.query(`UPDATE conversations SET title = $1 WHERE id = $2`, [title, a.conv.id]);
    }
    if (b.avatar_url !== undefined) {
      if (b.avatar_url !== null && (typeof b.avatar_url !== "string" || b.avatar_url.length > 1000)) throw badRequest("avatar_url must be a string or null");
      await db.query(`UPDATE conversations SET avatar_url = $1 WHERE id = $2`, [b.avatar_url || null, a.conv.id]);
    }
    await pushConversation(a.conv.id, (await memberIds(a.conv.id)).filter((u) => u !== req.auth.id));
    return conversationView(a.conv.id, req.auth.id);
  });

  app.post("/v1/conversations/:id/members", async (req) => {
    const a = await access((req.params as any).id, req.auth.id, "write");
    if (a.conv.kind !== "group") throw badRequest("Members can only be added to groups");
    const requested = await existingUsers(ids((req.body as any)?.user_ids, "user_ids"));
    const current = new Set(await memberIds(a.conv.id));
    const toAdd = requested.filter((u) => !current.has(u));
    if (current.size + toAdd.length > MAX_GROUP) throw badRequest(`Groups can have at most ${MAX_GROUP} members`);
    for (const u of toAdd)
      await db.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [a.conv.id, u]);
    if (toAdd.length) await pushConversation(a.conv.id, [...current, ...toAdd].filter((u) => u !== req.auth.id));
    return conversationView(a.conv.id, req.auth.id);
  });

  app.delete("/v1/conversations/:id/members/:userId", async (req) => {
    const p = req.params as any;
    const a = await access(p.id, req.auth.id, "write");
    if (a.conv.kind !== "group") throw badRequest("Members can only be removed from groups");
    const target = assertId(p.userId, "Member");
    const self = target === req.auth.id;
    if (!self && a.role !== "owner" && a.role !== "admin") throw forbidden("Only the group owner can remove members");
    const rows = await db.query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 RETURNING role`, [a.conv.id, target]);
    if (!rows.length) throw notFound("Member not found");
    const remaining = await memberIds(a.conv.id);
    // Hand ownership over if the owner left.
    if (rows[0].role === "owner" && remaining.length) {
      const next = await db.one(`SELECT user_id FROM conversation_members WHERE conversation_id = $1 ORDER BY joined_at ASC LIMIT 1`, [a.conv.id]);
      if (next) await db.query(`UPDATE conversation_members SET role = 'owner' WHERE conversation_id = $1 AND user_id = $2`, [a.conv.id, next.user_id]);
    }
    publish([target], { t: "conversation.remove", conversation_id: a.conv.id });
    await pushConversation(a.conv.id, remaining);
    return { ok: true as const };
  });

  app.post("/v1/conversations/:id/read", async (req) => {
    const a = await access((req.params as any).id, req.auth.id, "read");
    const mid = (req.body as any)?.message_id;
    if (!isUuid(mid)) throw badRequest("message_id is required");
    await markRead(a.conv.id, req.auth.id, mid, a.conv.kind);
    return { ok: true as const };
  });
}

export { conversationAudience };
