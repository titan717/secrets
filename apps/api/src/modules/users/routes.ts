import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import type { FastifyReply } from "fastify";
import { badRequest, notFound, unauthorized } from "../../lib/http.js";
import { userView, selfView, USER_COLS } from "../../lib/views.js";
import { requireAuth, normalizeUsername, verifyPassword, clearSessionCookies, audit } from "../auth/service.js";
import { onlineAmong, lastSeenOf, publish, profileAudience, dropDevice } from "../realtime/bus.js";
import { closeConn } from "../realtime/ws.js";

function optUrl(v: unknown, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 1000) throw badRequest(`${field} must be a URL string`);
  if (!/^(https?:\/\/|\/v1\/attachments\/)/.test(v)) throw badRequest(`${field} must be an http(s) URL or /v1/attachments/:id`);
  return v;
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/v1/me", async (req) => {
    const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [req.auth.id]);
    if (!row) throw notFound("User not found");
    return selfView(row);
  });

  app.patch("/v1/me", async (req) => {
    const b = (req.body ?? {}) as any;
    const sets: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (b.display_name !== undefined) {
      if (typeof b.display_name !== "string" || !b.display_name.trim() || b.display_name.trim().length > 48)
        throw badRequest("display_name must be 1-48 characters");
      set("display_name", b.display_name.trim());
    }
    if (b.about !== undefined) {
      if (typeof b.about !== "string" || b.about.length > 160) throw badRequest("about must be at most 160 characters");
      set("about", b.about);
    }
    const avatar = optUrl(b.avatar_url, "avatar_url");
    if (avatar !== undefined) set("avatar_url", avatar);
    if (b.accent !== undefined) {
      if (b.accent !== null && (typeof b.accent !== "string" || b.accent.length > 32)) throw badRequest("accent must be a short string or null");
      set("accent", b.accent || null);
    }
    if (b.status !== undefined) {
      if (b.status !== null && (typeof b.status !== "string" || b.status.length > 80)) throw badRequest("status must be at most 80 characters");
      set("status", b.status || null);
    }
    if (b.profile_visibility !== undefined) {
      if (!["public", "contacts", "private"].includes(b.profile_visibility)) throw badRequest("profile_visibility must be public, contacts or private");
      set("profile_visibility", b.profile_visibility);
    }
    if (sets.length) {
      vals.push(req.auth.id);
      await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    }
    const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [req.auth.id]);
    const user = selfView(row);
    if (sets.length) {
      const id = req.auth.id;
      profileAudience(id)
        .then((aud) => publish(aud, { t: "user.update", user }))
        .catch((err) => req.log.warn({ err }, "user.update fan-out failed"));
    }
    return user;
  });

  /** Immediate disable; personal data is purged by the retention job after 30 days. */
  app.delete("/v1/me", async (req, reply: FastifyReply) => {
    const b = (req.body ?? {}) as any;
    const u = await db.one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [req.auth.id]);
    if (!u || !(await verifyPassword(String(b.password ?? ""), u.password_hash)))
      throw unauthorized("Enter your password to delete your account");
    const devices = await db.query<{ device_id: string }>(`SELECT device_id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, [req.auth.id]);
    await db.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'account_deleted' WHERE user_id = $1`, [req.auth.id]);
    await db.query(`UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1`, [req.auth.id]);
    for (const d of devices) dropDevice(d.device_id, closeConn);
    clearSessionCookies(reply);
    await audit({ actorId: req.auth.id, action: "account.deleted", targetType: "user", targetId: req.auth.id, req });
    return { ok: true as const };
  });

  /** Synchronous export (MVP): profile, conversations, authored messages, Docks, AI chats. */
  app.post("/v1/me/export", async (req, reply: FastifyReply) => {
    const id = req.auth.id;
    const [profile, conversations, messages, docks] = await Promise.all([
      db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [id]),
      db.query(`SELECT c.id, c.kind, c.title, c.created_at FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id WHERE m.user_id = $1`, [id]),
      db.query(`SELECT id, conversation_id, ciphertext, nonce, created_at, edited_at FROM messages WHERE sender_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20000`, [id]),
      db.query(`SELECT d.id, d.handle, d.name, d.visibility, m.role FROM docks d JOIN dock_members m ON m.dock_id = d.id WHERE m.user_id = $1`, [id]),
    ]);
    await audit({ actorId: id, action: "account.exported", req });
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="secrets-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return {
      exported_at: new Date().toISOString(),
      profile: profile ? selfView(profile) : null,
      conversations,
      messages,
      docks,
    };
  });

  app.get("/v1/users/search", async (req) => {
    const q = String((req.query as any)?.q ?? "").trim().toLowerCase().replace(/^@/, "");
    if (!q) return [];
    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const rows = await db.query(
      `SELECT ${USER_COLS} FROM users u
       WHERE u.id <> $1 AND u.is_bot = false AND u.deleted_at IS NULL AND (u.username LIKE $2 OR lower(u.display_name) LIKE $2)
       ORDER BY (u.username = $3) DESC, (u.username LIKE $4) DESC, u.username ASC LIMIT 20`,
      [req.auth.id, like, q, `${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`],
    );
    return rows.map(userView);
  });

  // Extra: presence snapshot for a set of users. ?ids=a,b,c
  app.get("/v1/presence", async (req) => {
    const ids = String((req.query as any)?.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const online = new Set(await onlineAmong(valid));
    const seen = await lastSeenOf(valid);
    return valid.map((id) => ({ user_id: id, online: online.has(id), last_seen: seen.get(id) ?? null }));
  });

  app.get("/v1/users/:username", async (req) => {
    const username = normalizeUsername((req.params as any).username);
    const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.username = $1 AND u.deleted_at IS NULL`, [username]);
    if (!row) throw notFound("User not found");
    return userView(row);
  });
}
