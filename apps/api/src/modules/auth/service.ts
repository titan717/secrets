import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { FastifyRequest } from "fastify";
import { config } from "../../config.js";
import { db } from "../../db/index.js";
import { unauthorized } from "../../lib/http.js";

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
export const normalizeUsername = (u: string) => u.trim().toLowerCase().replace(/^@/, "");

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function signSession(c: SessionClaims): string {
  return jwt.sign({ sub: c.sub, username: c.username, did: c.did }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtTtl,
  });
}

/** Verify a session token: signature, expiry, and that the device session isn't revoked. */
export async function verifyToken(token: string | undefined | null): Promise<AuthUser> {
  if (!token) throw unauthorized();
  let claims: SessionClaims;
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as unknown as SessionClaims;
  } catch {
    throw unauthorized("Invalid or expired session");
  }
  if (!claims?.sub || !claims.did) throw unauthorized("Invalid session");
  const s = await db.one<{ user_id: string; revoked_at: Date | null; username: string }>(
    `SELECT s.user_id, s.revoked_at, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.device_id = $1`,
    [claims.did],
  );
  if (!s || s.revoked_at || s.user_id !== claims.sub) throw unauthorized("Session has been signed out");
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

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h && /^bearer /i.test(h)) return h.slice(7).trim();
  const x = req.headers["x-secrets-token"];
  if (typeof x === "string" && x) return x;
  return null;
}

export async function requireAuth(req: FastifyRequest) {
  req.auth = await verifyToken(bearer(req));
}
