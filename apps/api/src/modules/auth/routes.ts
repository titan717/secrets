import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Session } from "@secrets/shared";
import { db } from "../../db/index.js";
import { config } from "../../config.js";
import { badRequest, conflict, unauthorized, uuid, str, notFound, iso, forbidden } from "../../lib/http.js";
import { selfView, USER_COLS } from "../../lib/views.js";
import {
  USERNAME_RE,
  EMAIL_RE,
  normalizeUsername,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  signSession,
  signServiceToken,
  requireAuth,
  bearer,
  verifyToken,
  setSessionCookies,
  clearSessionCookies,
  newSecretToken,
  hashToken,
  audit,
} from "./service.js";
import { joinDefaultDocks } from "../docks/service.js";
import { dropDevice } from "../realtime/bus.js";
import { closeConn } from "../realtime/ws.js";
import { authLimit, resetLimit } from "../../lib/rate.js";
import { welcomeDm } from "../../db/seed.js";
import { sendMail, verificationMail, resetMail } from "../../lib/email.js";

const appOrigin = () => config.appOrigin || "http://localhost:5173";

function validateUsername(raw: unknown): string {
  const u = normalizeUsername(str(raw, "username")!);
  if (!USERNAME_RE.test(u))
    throw badRequest("Username must be 3-24 characters: lowercase letters, numbers, underscores or dots", "invalid_username");
  return u;
}

function validateEmail(raw: unknown): string {
  const e = normalizeEmail(str(raw, "email")!);
  if (!EMAIL_RE.test(e) || e.length > 254) throw badRequest("Enter a valid email address", "invalid_email");
  return e;
}

function validatePassword(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("password is required");
  if (raw.length < 10) throw badRequest("Password must be at least 10 characters", "weak_password");
  if (raw.length > 200) throw badRequest("Password is too long", "invalid_password");
  return raw;
}

async function createSession(userId: string, username: string, req: FastifyRequest): Promise<Session> {
  const device_id = uuid();
  await db.query(`INSERT INTO sessions (device_id, user_id, user_agent, expires_at, ip_hash) VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval, $5)`, [
    device_id,
    userId,
    req.headers["user-agent"]?.slice(0, 300) ?? null,
    String(config.jwtTtl),
    null,
  ]);
  const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [userId]);
  return { token: signSession({ sub: userId, username, did: device_id }), user: selfView(row), device_id };
}

async function issueAuthToken(userId: string, kind: "verify_email" | "reset_password", ttlMinutes: number): Promise<string> {
  const raw = newSecretToken();
  await db.query(
    `INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval)`,
    [uuid(), userId, kind, hashToken(raw), String(ttlMinutes)],
  );
  return raw;
}

async function consumeAuthToken(raw: unknown, kind: "verify_email" | "reset_password"): Promise<{ id: string; user_id: string }> {
  if (typeof raw !== "string" || raw.length < 20) throw badRequest("That link is invalid or has expired", "invalid_token");
  const row = await db.one<{ id: string; user_id: string; used_at: Date | null; expires_at: Date }>(
    `SELECT id, user_id, used_at, expires_at FROM auth_tokens WHERE token_hash = $1 AND kind = $2`,
    [hashToken(raw), kind],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now())
    throw badRequest("That link is invalid or has expired", "invalid_token");
  await db.query(`UPDATE auth_tokens SET used_at = now() WHERE id = $1`, [row.id]);
  return { id: row.id, user_id: row.user_id };
}

function sessionResponse(session: Session, csrf: string, extra: Record<string, unknown> = {}) {
  return { ...session, csrf_token: csrf, ...extra };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/signup", async (req, reply) => {
    authLimit(`signup:${req.ip}`);
    const b = (req.body ?? {}) as any;
    const username = validateUsername(b.username);
    const email = validateEmail(b.email);
    const password = validatePassword(b.password);
    const display_name = str(b.display_name, "display_name", { optional: true, max: 48 }) || username;
    const id = uuid();
    const hash = await hashPassword(password);
    const verified = config.features.emailVerification ? null : new Date();
    try {
      await db.query(
        `INSERT INTO users (id, username, email, password_hash, display_name, email_verified_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, username, email, hash, display_name, verified],
      );
    } catch (e: any) {
      if (e?.code === "23505" || /unique|duplicate/i.test(e?.message ?? ""))
        // Deliberately does not say which field is taken (email enumeration).
        throw conflict("We couldn't create an account with those details", "signup_failed");
      throw e;
    }

    await joinDefaultDocks(id).catch((e) => req.log.warn({ err: e }, "auto-join failed"));
    await welcomeDm(id, display_name).catch((e) => req.log.warn({ err: e }, "welcome dm failed"));
    await audit({ actorId: id, action: "auth.signup", targetType: "user", targetId: id, req });

    let devToken: string | undefined;
    if (config.features.emailVerification) {
      const raw = await issueAuthToken(id, "verify_email", 60 * 24);
      const sent = await sendMail({ to: email, ...verificationMail(`${appOrigin()}/verify?token=${raw}`) }).catch((e) => {
        req.log.error({ err: e }, "verification email failed");
        return { dev: false };
      });
      if (sent.dev && !config.isProd) devToken = raw;
    }

    reply.code(201);
    const session = await createSession(id, username, req);
    const csrf = setSessionCookies(reply, session.token);
    return sessionResponse(session, csrf, devToken ? { dev_verification_token: devToken } : {});
  });

  app.post("/v1/auth/login", async (req, reply) => {
    authLimit(`login:${req.ip}`);
    const b = (req.body ?? {}) as any;
    const identifier = typeof b.email === "string" ? normalizeEmail(b.email) : normalizeUsername(String(b.username ?? b.username_or_email ?? ""));
    if (!identifier || typeof b.password !== "string") throw badRequest("Enter your username or email and password");
    authLimit(`login-account:${identifier}`);

    const u = await db.one<{ id: string; username: string; password_hash: string; is_bot: boolean; deleted_at: Date | null }>(
      identifier.includes("@")
        ? `SELECT id, username, password_hash, is_bot, deleted_at FROM users WHERE email = $1`
        : `SELECT id, username, password_hash, is_bot, deleted_at FROM users WHERE username = $1`,
      [identifier],
    );
    const ok = !!u && !u.is_bot && !u.deleted_at && (await verifyPassword(b.password, u.password_hash));
    if (!ok) {
      await audit({ action: "auth.login_failed", metadata: { identifier }, req });
      throw unauthorized("Wrong username or password");
    }
    await audit({ actorId: u!.id, action: "auth.login", targetType: "user", targetId: u!.id, req });
    const session = await createSession(u!.id, u!.username, req);
    const csrf = setSessionCookies(reply, session.token);
    return sessionResponse(session, csrf);
  });

  app.get("/v1/auth/session", { preHandler: requireAuth }, async (req) => {
    const row = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [req.auth.id]);
    if (!row) throw unauthorized();
    // A fresh token for in-memory use by AI/calls; the cookie stays the durable credential.
    const token = signSession({ sub: req.auth.id, username: req.auth.username, did: req.auth.device_id });
    return { user: selfView(row), device_id: req.auth.device_id, token };
  });

  /** Short-lived token for AI / calls services; never stored client-side. */
  app.post("/v1/auth/service-token", { preHandler: requireAuth }, async (req) => {
    const token = signServiceToken({ sub: req.auth.id, username: req.auth.username, did: req.auth.device_id }, 600);
    return { token, expires_in: 600 };
  });

  app.post("/v1/auth/logout", { preHandler: requireAuth }, async (req, reply) => {
    await db.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout' WHERE device_id = $1`, [req.auth.device_id]);
    dropDevice(req.auth.device_id, closeConn);
    clearSessionCookies(reply);
    await audit({ actorId: req.auth.id, action: "auth.logout", req });
    return { ok: true as const };
  });

  app.get("/v1/auth/username-available", async (req) => {
    authLimit(`username:${req.ip}`);
    const raw = (req.query as any)?.username;
    if (typeof raw !== "string") throw badRequest("username is required");
    const u = normalizeUsername(raw);
    if (!USERNAME_RE.test(u)) return { available: false };
    const row = await db.one(`SELECT 1 FROM users WHERE username = $1`, [u]);
    return { available: !row };
  });

  // ── email verification ────────────────────────────────────────────────
  app.post("/v1/auth/verify-email", async (req) => {
    const b = (req.body ?? {}) as any;
    const { user_id } = await consumeAuthToken(b.token, "verify_email");
    await db.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [user_id]);
    await audit({ actorId: user_id, action: "auth.email_verified", req });
    return { ok: true as const, verified: true };
  });

  app.post("/v1/auth/resend-verification", { preHandler: requireAuth }, async (req) => {
    resetLimit(`verify:${req.auth.id}`);
    const u = await db.one<{ email: string | null; email_verified_at: Date | null }>(
      `SELECT email, email_verified_at FROM users WHERE id = $1`,
      [req.auth.id],
    );
    if (!u?.email) throw badRequest("No email on this account");
    if (u.email_verified_at) return { ok: true as const, already: true };
    const raw = await issueAuthToken(req.auth.id, "verify_email", 60 * 24);
    const sent = await sendMail({ to: u.email, ...verificationMail(`${appOrigin()}/verify?token=${raw}`) });
    return { ok: true as const, ...(sent.dev && !config.isProd ? { dev_token: raw } : {}) };
  });

  // ── password reset ────────────────────────────────────────────────────
  app.post("/v1/auth/forgot-password", async (req, reply) => {
    resetLimit(`forgot:${req.ip}`);
    const b = (req.body ?? {}) as any;
    const email = typeof b.email === "string" ? normalizeEmail(b.email) : "";
    // Always 202: never reveal whether the address exists.
    reply.code(202);
    if (!email || !EMAIL_RE.test(email)) return { ok: true as const };
    const u = await db.one<{ id: string; deleted_at: Date | null }>(`SELECT id, deleted_at FROM users WHERE email = $1`, [email]);
    if (!u || u.deleted_at) return { ok: true as const };
    const raw = await issueAuthToken(u.id, "reset_password", 30);
    const sent = await sendMail({ to: email, ...resetMail(`${appOrigin()}/reset?token=${raw}`) }).catch((e) => {
      req.log.error({ err: e }, "reset email failed");
      return { dev: false };
    });
    return { ok: true as const, ...(sent.dev && !config.isProd ? { dev_token: raw } : {}) };
  });

  app.post("/v1/auth/reset-password", async (req) => {
    resetLimit(`reset:${req.ip}`);
    const b = (req.body ?? {}) as any;
    const password = validatePassword(b.password);
    const { user_id } = await consumeAuthToken(b.token, "reset_password");
    const hash = await hashPassword(password);
    await db.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [user_id, hash]);
    // Every existing session is compromised until proven otherwise.
    await db.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'password_reset' WHERE user_id = $1 AND revoked_at IS NULL`, [user_id]);
    await audit({ actorId: user_id, action: "auth.password_reset", targetType: "user", targetId: user_id, req });
    return { ok: true as const, revoked_all: true };
  });

  app.post("/v1/auth/change-password", { preHandler: requireAuth }, async (req) => {
    const b = (req.body ?? {}) as any;
    const next = validatePassword(b.new_password);
    const u = await db.one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [req.auth.id]);
    if (!u || !(await verifyPassword(String(b.current_password ?? ""), u.password_hash)))
      throw badRequest("Your current password is incorrect", "invalid_password");
    const hash = await hashPassword(next);
    await db.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [req.auth.id, hash]);
    await db.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'password_change' WHERE user_id = $1 AND device_id <> $2 AND revoked_at IS NULL`, [
      req.auth.id,
      req.auth.device_id,
    ]);
    await audit({ actorId: req.auth.id, action: "auth.password_changed", req });
    return { ok: true as const };
  });

  // ── device sessions ───────────────────────────────────────────────────
  app.get("/v1/auth/sessions", { preHandler: requireAuth }, async (req) => {
    const rows = await db.query(
      `SELECT device_id, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC`,
      [req.auth.id],
    );
    return rows.map((r: any) => ({
      device_id: r.device_id,
      user_agent: r.user_agent,
      created_at: iso(r.created_at),
      last_seen_at: iso(r.last_seen_at),
      expires_at: r.expires_at ? iso(r.expires_at) : null,
      current: r.device_id === req.auth.device_id,
    }));
  });

  app.delete("/v1/auth/sessions/:deviceId", { preHandler: requireAuth }, async (req) => {
    const { deviceId } = req.params as { deviceId: string };
    const rows = await db.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'revoked_by_user' WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING device_id`,
      [deviceId, req.auth.id],
    );
    if (!rows.length) throw notFound("Session not found");
    dropDevice(deviceId, closeConn);
    await audit({ actorId: req.auth.id, action: "session.revoked", targetType: "session", targetId: deviceId, req });
    return { ok: true as const };
  });
}

/** Re-exported for routes that need to authenticate a raw token (WS handshake, tests). */
export { verifyToken, bearer };
