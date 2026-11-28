import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config.js";
import { db } from "../../db/index.js";
import { forbidden, unauthorized } from "../../lib/http.js";

export interface AuthUser {
  id: string;
  username: string;
  device_id: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthUser;
  }
}

export interface SessionClaims {
  sub: string;
  username: string;
  did: string;
}

export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeUsername = (u: string) => u.trim().toLowerCase().replace(/^@/, "");
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Cost 12: ~250 ms on a phone, still well under the login rate limit. */
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function signSession(c: SessionClaims): string {
  return jwt.sign({ sub: c.sub, username: c.username, did: c.did }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtTtl,
  });
}

/** Short-lived token for trusted internal calls (AI service, calls service). */
export function signServiceToken(c: SessionClaims, ttlSeconds = 600): string {
  return jwt.sign({ sub: c.sub, username: c.username, did: c.did, scope: "service" }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: ttlSeconds,
  });
}

/** Verify a session token: signature, expiry, and that the device session isn't revoked or expired. */
export async function verifyToken(token: string | undefined | null): Promise<AuthUser> {
  if (!token) throw unauthorized();
  let claims: SessionClaims;
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as unknown as SessionClaims;
  } catch {
    throw unauthorized("Invalid or expired session");
  }
  if (!claims?.sub || !claims.did) throw unauthorized("Invalid session");
  const s = await db.one<{ user_id: string; revoked_at: Date | null; expires_at: Date | null; username: string }>(
    `SELECT s.user_id, s.revoked_at, s.expires_at, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.device_id = $1`,
    [claims.did],
  );
  if (!s || s.revoked_at || s.user_id !== claims.sub) throw unauthorized("Session has been signed out");
  if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) throw unauthorized("Session has expired");
  touch(claims.did);
  return { id: s.user_id, username: s.username, device_id: claims.did };
}

// Throttled last_seen updates (at most once per minute per device).
const touched = new Map<string, number>();
function touch(did: string) {
  const now = Date.now();
  if ((touched.get(did) ?? 0) > now - 60_000) return;
  touched.set(did, now);
  db.query(`UPDATE sessions SET last_seen_at = now() WHERE device_id = $1`, [did]).catch(() => {});
}

/** Authorization header wins (CLI/native); otherwise the httpOnly session cookie (browser). */
export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h && /^bearer /i.test(h)) return h.slice(7).trim();
  const x = req.headers["x-secrets-token"];
  if (typeof x === "string" && x) return x;
  const cookie = (req as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies?.[config.sessionCookie];
  return typeof cookie === "string" && cookie ? cookie : null;
}

export async function requireAuth(req: FastifyRequest) {
  req.auth = await verifyToken(bearer(req));
}

/** Session cookie + a readable CSRF cookie (double-submit pattern). */
export function setSessionCookies(reply: FastifyReply, token: string): string {
  const csrf = randomBytes(24).toString("base64url");
  reply.setCookie(config.sessionCookie, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: config.jwtTtl,
  });
  reply.setCookie(config.csrfCookie, csrf, {
    httpOnly: false,
    secure: config.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: config.jwtTtl,
  });
  return csrf;
}

export function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(config.sessionCookie, { path: "/" });
  reply.clearCookie(config.csrfCookie, { path: "/" });
}

/** Mutations authenticated by cookie must echo the CSRF cookie in a header. */
export function csrfOk(req: FastifyRequest): boolean {
  const cookie = (req as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies?.[config.csrfCookie];
  const header = req.headers[config.csrfHeader];
  if (typeof cookie !== "string" || typeof header !== "string" || cookie.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}

export const newSecretToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const hashIp = (ip: string | undefined) =>
  ip ? createHmac("sha256", config.ipPepper).update(ip).digest("hex").slice(0, 32) : null;

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string | null;
  req?: FastifyRequest;
  metadata?: Record<string, unknown>;
}

/** Best-effort append-only audit trail. Never stores message content, tokens or raw IPs. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, ip_hash, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        entry.actorId ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        hashIp(entry.req?.ip),
        entry.req?.headers["user-agent"]?.slice(0, 200) ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
  } catch {
    /* auditing must never break a request */
  }
}

/** Production requires a verified email before starting new conversations or Docks. */
export async function assertEmailVerified(userId: string): Promise<void> {
  if (!config.features.emailVerification) return;
  const u = await db.one<{ email_verified_at: Date | null }>(`SELECT email_verified_at FROM users WHERE id = $1`, [userId]);
  if (!u?.email_verified_at) throw forbidden("Verify your email address to do that");
}
