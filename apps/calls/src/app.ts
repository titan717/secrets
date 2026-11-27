import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { AuthError, bearer, verifyJwt } from "./auth.js";
import type { CreateRoomBody, RoomInfo, TokenBody, TokenResponse, VoiceRoom } from "./contract.js";
import { describeLiveKitError, ensureRoom, joinToken, liveKitConfig, missingLiveKitVars, participantCount, type LiveKitConfig } from "./livekit.js";

const VERSION = "0.1.0";
const ROOM_RE = /^[A-Za-z0-9_-]{1,160}$/;
const CONV_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

interface Caller { userId: string; username?: string; deviceId?: string; anonymous: boolean; token?: string }

function corsOrigin(): boolean | string | string[] {
  const raw = (process.env.CORS_ORIGIN ?? "*").trim();
  if (raw === "*" || raw === "") return true;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

const fail = (reply: FastifyReply, status: number, error: string, message: string) => reply.status(status).send({ error, message });

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info", redact: { paths: ['req.headers["authorization"]', 'req.headers["cookie"]'], censor: "[redacted]" } },
    trustProxy: true,
  });
  await app.register(cors, { origin: corsOrigin(), methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["content-type", "authorization"], maxAge: 86400 });

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret) app.log.warn("JWT_SECRET is not set: allowing ANONYMOUS access (development only). Set JWT_SECRET to the Secrets API secret in production.");
  if (!liveKitConfig()) app.log.warn(`LiveKit not configured (missing ${missingLiveKitVars().join(", ")}); room/token endpoints will return 503.`);

  app.setErrorHandler((err: any, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.status(status).send({ error: status >= 500 ? "internal_error" : "bad_request", message: err.message });
  });

  /** Returns caller or sends 401. */
  function authenticate(req: FastifyRequest, reply: FastifyReply): Caller | null {
    const token = bearer(req.headers.authorization);
    if (!jwtSecret) {
      if (token) {
        // best-effort decode for nicer identities in dev; not trusted
        try {
          const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
          if (typeof p?.sub === "string") return { userId: p.sub, username: p.username, deviceId: p.did, anonymous: true, token };
        } catch {
          /* ignore */
        }
      }
      return { userId: "", anonymous: true, token };
    }
    if (!token) {
      fail(reply, 401, "unauthorized", "Missing Authorization: Bearer <Secrets session token>.");
      return null;
    }
    try {
      const c = verifyJwt(token, jwtSecret);
      return { userId: c.sub, username: c.username, deviceId: c.did, anonymous: false, token };
    } catch (e) {
      fail(reply, 401, "unauthorized", e instanceof AuthError ? e.message : "Invalid token.");
      return null;
    }
  }

  function requireLiveKit(reply: FastifyReply): LiveKitConfig | null {
    const cfg = liveKitConfig();
    if (!cfg) fail(reply, 503, "livekit_not_configured", `Voice/video is not configured on this server: set ${missingLiveKitVars().join(", ")}.`);
    return cfg;
  }

  /** Optional membership check through the Secrets API (when SECRETS_API_URL is set). Returns false if a response was sent. */
  async function checkMembership(caller: Caller, conversationId: string, reply: FastifyReply): Promise<boolean> {
    const base = process.env.SECRETS_API_URL?.trim();
    if (!base || !caller.token || caller.anonymous) return true;
    try {
      const res = await fetch(`${base.replace(/\/+$/, "")}/v1/conversations/${encodeURIComponent(conversationId)}`, {
        headers: { Authorization: `Bearer ${caller.token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;
      if (res.status === 401) fail(reply, 401, "unauthorized", "Secrets API rejected the session token.");
      else if (res.status === 403 || res.status === 404) fail(reply, 403, "forbidden", "You are not a member of this conversation.");
      else fail(reply, 502, "upstream_error", `Secrets API membership check failed (${res.status}).`);
      return false;
    } catch (e) {
      fail(reply, 502, "upstream_error", `Could not reach the Secrets API for the membership check: ${(e as Error).message}`);
      return false;
    }
  }

  const identityFor = (caller: Caller, requested?: string) =>
    caller.userId && !caller.anonymous ? caller.userId : (requested?.trim() || caller.userId || `anon-${randomUUID().slice(0, 8)}`);

  app.get("/health", async () => {
    const cfg = liveKitConfig();
    return {
      ok: true,
      service: "voice.secretsapi",
      version: VERSION,
      livekit_configured: !!cfg,
      ...(cfg ? { livekit_url: cfg.url } : { missing: missingLiveKitVars() }),
      auth: jwtSecret ? "jwt" : "anonymous-dev",
      membership_check: !!process.env.SECRETS_API_URL?.trim(),
    };
  });

  app.get("/", async () => ({ service: "voice.secretsapi", endpoints: ["POST /v1/rooms", "POST /v1/token", "GET /v1/rooms/:room", "GET /health"] }));

  app.post<{ Body: CreateRoomBody }>("/v1/rooms", async (req, reply) => {
    const caller = authenticate(req, reply);
    if (!caller) return reply;
    const { conversation_id, kind } = req.body ?? ({} as CreateRoomBody);
    if (typeof conversation_id !== "string" || !CONV_ID_RE.test(conversation_id)) return fail(reply, 400, "bad_request", "conversation_id is required (letters, digits, _ or -).");
    if (kind !== "voice" && kind !== "video") return fail(reply, 400, "bad_request", 'kind must be "voice" or "video".');
    const cfg = requireLiveKit(reply);
    if (!cfg) return reply;
    if (!(await checkMembership(caller, conversation_id, reply))) return reply;

    const room = `conv_${conversation_id}`;
    try {
      await ensureRoom(cfg, room, { conversation_id, kind });
      const identity = identityFor(caller);
      const token = await joinToken(cfg, { room, identity, name: caller.username, kind, metadata: { user_id: caller.userId || identity, username: caller.username ?? null } });
      const out: VoiceRoom = { room, url: cfg.url, token, kind };
      return out;
    } catch (e) {
      const { status, message } = describeLiveKitError(e);
      req.log.error({ err: (e as Error).message }, "createRoom failed");
      return fail(reply, status, "livekit_error", message);
    }
  });

  app.post<{ Body: TokenBody & { kind?: "voice" | "video" } }>("/v1/token", async (req, reply) => {
    const caller = authenticate(req, reply);
    if (!caller) return reply;
    const { room, identity, name, kind } = req.body ?? ({} as TokenBody);
    if (typeof room !== "string" || !ROOM_RE.test(room)) return fail(reply, 400, "bad_request", "room is required (letters, digits, _ or -).");
    const cfg = requireLiveKit(reply);
    if (!cfg) return reply;
    if (room.startsWith("conv_") && !(await checkMembership(caller, room.slice(5), reply))) return reply;
    try {
      const id = identityFor(caller, identity);
      const display = caller.anonymous ? (name ?? caller.username) : (caller.username ?? name);
      const token = await joinToken(cfg, { room, identity: id, name: display, kind: kind === "voice" ? "voice" : "video", metadata: { user_id: caller.userId || id, username: caller.username ?? null } });
      const out: TokenResponse = { token, url: cfg.url, room };
      return out;
    } catch (e) {
      const { status, message } = describeLiveKitError(e);
      return fail(reply, status, "livekit_error", message);
    }
  });

  app.get<{ Params: { room: string } }>("/v1/rooms/:room", async (req, reply) => {
    const caller = authenticate(req, reply);
    if (!caller) return reply;
    const { room } = req.params;
    if (!ROOM_RE.test(room)) return fail(reply, 400, "bad_request", "Invalid room name.");
    const cfg = requireLiveKit(reply);
    if (!cfg) return reply;
    if (room.startsWith("conv_") && !(await checkMembership(caller, room.slice(5), reply))) return reply;
    try {
      const out: RoomInfo = { room, participants: await participantCount(cfg, room) };
      return out;
    } catch (e) {
      const { status, message } = describeLiveKitError(e);
      return fail(reply, status, "livekit_error", message);
    }
  });

  return app;
}
