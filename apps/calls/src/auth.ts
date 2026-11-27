/** HS256 verification of Secrets API session JWTs using node:crypto (no extra deps). */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionClaims } from "./contract.js";

export class AuthError extends Error {}

export function verifyJwt(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): SessionClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("Malformed token.");
  const [h, p, s] = parts;
  let header: any, payload: any;
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    throw new AuthError("Malformed token.");
  }
  if (header?.alg !== "HS256") throw new AuthError("Unsupported token algorithm (expected HS256).");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url"));
  const got = Buffer.from(s);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) throw new AuthError("Invalid token signature.");
  if (typeof payload.exp === "number" && payload.exp + 30 < nowSec) throw new AuthError("Session expired — sign in again.");
  if (typeof payload.nbf === "number" && payload.nbf - 30 > nowSec) throw new AuthError("Token not yet valid.");
  if (typeof payload.sub !== "string" || !payload.sub) throw new AuthError("Token has no subject (sub).");
  return payload as SessionClaims;
}

export function bearer(h: string | string[] | undefined): string | undefined {
  const v = Array.isArray(h) ? h[0] : h;
  const m = v?.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || undefined;
}
