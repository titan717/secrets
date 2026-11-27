import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/http.js";
import { userView, USER_COLS } from "../../lib/views.js";
import { requireAuth, normalizeUsername } from "../auth/service.js";
import { onlineAmong, lastSeenOf, publish, profileAudience } from "../realtime/bus.js";

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
    return userView(row);
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
    if (sets.length) {
      vals.push(req.auth.id);
      await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    }
    const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [req.auth.id]);
    const user = userView(row);
    if (sets.length) {
      const id = req.auth.id;
      profileAudience(id)
        .then((aud) => publish(aud, { t: "user.update", user }))
        .catch((err) => req.log.warn({ err }, "user.update fan-out failed"));
    }
    return user;
  });

  app.get("/v1/users/search", async (req) => {
    const q = String((req.query as any)?.q ?? "").trim().toLowerCase().replace(/^@/, "");
    if (!q) return [];
    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const rows = await db.query(
      `SELECT ${USER_COLS} FROM users u
       WHERE u.id <> $1 AND u.is_bot = false AND (u.username LIKE $2 OR lower(u.display_name) LIKE $2)
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
    const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.username = $1`, [username]);
    if (!row) throw notFound("User not found");
    return userView(row);
  });
}
