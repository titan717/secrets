import type { FastifyInstance } from "fastify";
import type { Session } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest, conflict, unauthorized, uuid, str, notFound, iso } from "../../lib/http.js";
import { userView, USER_COLS } from "../../lib/views.js";
import { USERNAME_RE, normalizeUsername, hashPassword, verifyPassword, signSession, requireAuth } from "./service.js";
import { joinDefaultDocks } from "../docks/service.js";
import { dropDevice } from "../realtime/bus.js";
import { closeConn } from "../realtime/ws.js";
import { authLimit } from "../../lib/rate.js";
import { welcomeDm } from "../../db/seed.js";

function validateUsername(raw: unknown): string {
  const u = normalizeUsername(str(raw, "username")!);
  if (!USERNAME_RE.test(u))
    throw badRequest("Username must be 3-24 characters: lowercase letters, numbers, underscores or dots", "invalid_username");
  return u;
}

function validatePassword(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("password is required");
  if (raw.length < 8) throw badRequest("Password must be at least 8 characters", "weak_password");
  if (raw.length > 200) throw badRequest("Password is too long", "invalid_password");
  return raw;
}

async function createSession(userId: string, username: string, userAgent: string | undefined): Promise<Session> {
  const device_id = uuid();
  await db.query(`INSERT INTO sessions (device_id, user_id, user_agent) VALUES ($1, $2, $3)`, [device_id, userId, userAgent?.slice(0, 300) ?? null]);
  const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [userId]);
  return { token: signSession({ sub: userId, username, did: device_id }), user: userView(row), device_id };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/signup", async (req, reply) => {
    authLimit(`signup:${req.ip}`);
    const b = (req.body ?? {}) as any;
    const username = validateUsername(b.username);
    const password = validatePassword(b.password);
    const display_name = str(b.display_name, "display_name", { optional: true, max: 48 }) || username;
    const id = uuid();
    const hash = await hashPassword(password);
    try {
      await db.query(`INSERT INTO users (id, username, password_hash, display_name) VALUES ($1, $2, $3, $4)`, [id, username, hash, display_name]);
    } catch (e: any) {
      if (e?.code === "23505" || /unique|duplicate/i.test(e?.message ?? "")) throw conflict("That username is taken", "username_taken");
      throw e;
    }
    await joinDefaultDocks(id).catch((e) => req.log.warn({ err: e }, "auto-join failed"));
    await welcomeDm(id, display_name).catch((e) => req.log.warn({ err: e }, "welcome dm failed"));
    reply.code(201);
    return createSession(id, username, req.headers["user-agent"]);
  });

  app.post("/v1/auth/login", async (req) => {
    authLimit(`login:${req.ip}`);
    const b = (req.body ?? {}) as any;
    if (typeof b.username !== "string" || typeof b.password !== "string") throw badRequest("username and password are required");
    const username = normalizeUsername(b.username);
    const u = await db.one<{ id: string; password_hash: string; is_bot: boolean }>(
      `SELECT id, password_hash, is_bot FROM users WHERE username = $1`,
      [username],
    );
    if (!u || u.is_bot || !(await verifyPassword(b.password, u.password_hash))) throw unauthorized("Wrong username or password");
    return createSession(u.id, username, req.headers["user-agent"]);
  });

  app.post("/v1/auth/logout", { preHandler: requireAuth }, async (req) => {
    await db.query(`UPDATE sessions SET revoked_at = now() WHERE device_id = $1`, [req.auth.device_id]);
    dropDevice(req.auth.device_id, closeConn);
    return { ok: true as const };
  });

  app.get("/v1/auth/username-available", async (req) => {
    const raw = (req.query as any)?.username;
    if (typeof raw !== "string") throw badRequest("username is required");
    const u = normalizeUsername(raw);
    if (!USERNAME_RE.test(u)) return { available: false };
    const row = await db.one(`SELECT 1 FROM users WHERE username = $1`, [u]);
    return { available: !row };
  });

  // Extras: list / revoke device sessions.
  app.get("/v1/auth/sessions", { preHandler: requireAuth }, async (req) => {
    const rows = await db.query(
      `SELECT device_id, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC`,
      [req.auth.id],
    );
    return rows.map((r: any) => ({
      device_id: r.device_id,
      user_agent: r.user_agent,
      created_at: iso(r.created_at),
      last_seen_at: iso(r.last_seen_at),
      current: r.device_id === req.auth.device_id,
    }));
  });

  app.delete("/v1/auth/sessions/:deviceId", { preHandler: requireAuth }, async (req) => {
    const { deviceId } = req.params as { deviceId: string };
    const rows = await db.query(`UPDATE sessions SET revoked_at = now() WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING device_id`, [
      deviceId,
      req.auth.id,
    ]);
    if (!rows.length) throw notFound("Session not found");
    dropDevice(deviceId, closeConn);
    return { ok: true as const };
  });
}
