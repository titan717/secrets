/**
 * Fan-out of ServerFrames to user sockets. In-process by default; when REDIS_URL
 * is set, frames go through Redis pub/sub so every instance delivers to its own sockets.
 */
import type { ServerFrame } from "@secrets/shared";
import { config } from "../../config.js";
import { db } from "../../db/index.js";

export interface Conn {
  userId: string;
  deviceId: string;
  send(frame: ServerFrame): void;
}

const CHANNEL = "secrets:ws";
const local = new Map<string, Set<Conn>>();
let pub: any = null;
let redisOn = false;

export const redisStatus = () => (redisOn ? "on" : "off");

interface Envelope {
  u: string[];
  f: ServerFrame;
  x?: string; // excluded device id
}

function deliverLocal(e: Envelope) {
  const data = e.f;
  for (const uid of e.u) {
    const set = local.get(uid);
    if (!set) continue;
    for (const c of set) {
      if (e.x && c.deviceId === e.x) continue;
      try {
        c.send(data);
      } catch {
        /* socket gone */
      }
    }
  }
}

export async function initBus(log: { info: (m: string) => void; warn: (m: string) => void }) {
  if (!config.redisUrl) return;
  try {
    const { Redis } = await import("ioredis");
    const opts = { maxRetriesPerRequest: null as any, lazyConnect: true, tls: config.redisUrl.startsWith("rediss://") ? {} : undefined };
    pub = new Redis(config.redisUrl, opts);
    const sub = new Redis(config.redisUrl, opts);
    pub.on("error", (e: Error) => log.warn(`[redis] ${e.message}`));
    sub.on("error", (e: Error) => log.warn(`[redis] ${e.message}`));
    await Promise.all([pub.connect(), sub.connect()]);
    await sub.subscribe(CHANNEL);
    sub.on("message", (_ch: string, msg: string) => {
      try {
        deliverLocal(JSON.parse(msg));
      } catch {
        /* ignore malformed */
      }
    });
    redisOn = true;
    log.info("[redis] pub/sub fan-out enabled");
  } catch (e: any) {
    log.warn(`[redis] unavailable, falling back to in-process bus: ${e?.message ?? e}`);
    pub = null;
    redisOn = false;
  }
}

/** Send a frame to every socket of the given users (optionally skipping one device). */
export function publish(userIds: Iterable<string>, frame: ServerFrame, exceptDevice?: string) {
  const u = [...new Set(userIds)];
  if (!u.length) return;
  const e: Envelope = { u, f: frame, x: exceptDevice };
  if (redisOn && pub) {
    pub.publish(CHANNEL, JSON.stringify(e)).catch(() => deliverLocal(e));
  } else {
    deliverLocal(e);
  }
}

export function addConn(c: Conn): boolean {
  let set = local.get(c.userId);
  const first = !set || set.size === 0;
  if (!set) local.set(c.userId, (set = new Set()));
  set.add(c);
  return first;
}

export function removeConn(c: Conn): boolean {
  const set = local.get(c.userId);
  if (!set) return false;
  set.delete(c);
  if (set.size === 0) {
    local.delete(c.userId);
    return true;
  }
  return false;
}

/** Close all local sockets of a revoked session. */
export function dropDevice(deviceId: string, close: (c: Conn) => void) {
  for (const set of local.values()) for (const c of set) if (c.deviceId === deviceId) close(c);
}

// ---- presence -------------------------------------------------------------
const PRESENCE_KEY = "secrets:presence";
const PRESENCE_TTL_MS = 70_000;

export async function markOnline(userId: string) {
  if (redisOn && pub) await pub.zadd(PRESENCE_KEY, Date.now(), userId).catch(() => {});
}
export async function markOffline(userId: string) {
  if (redisOn && pub) await pub.zrem(PRESENCE_KEY, userId).catch(() => {});
}
export async function heartbeat() {
  if (!(redisOn && pub) || local.size === 0) return;
  const now = Date.now();
  const args: (string | number)[] = [];
  for (const uid of local.keys()) args.push(now, uid);
  await pub.zadd(PRESENCE_KEY, ...args).catch(() => {});
}
export async function onlineAmong(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  if (redisOn && pub) {
    try {
      const scores: (string | null)[] = await pub.zmscore(PRESENCE_KEY, ...userIds);
      const cutoff = Date.now() - PRESENCE_TTL_MS;
      return userIds.filter((_, i) => scores[i] !== null && Number(scores[i]) > cutoff);
    } catch {
      /* fall through */
    }
  }
  return userIds.filter((u) => local.has(u));
}

// ---- recipients -----------------------------------------------------------
/** Everyone who can see a conversation: dm/group members, or dock members for channels. */
export async function conversationAudience(conversationId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `SELECT cm.user_id FROM conversation_members cm WHERE cm.conversation_id = $1
     UNION
     SELECT dm.user_id FROM conversations c JOIN dock_members dm ON dm.dock_id = c.dock_id
     WHERE c.id = $1 AND c.kind = 'channel'`,
    [conversationId],
  );
  return rows.map((r) => r.user_id);
}

export async function dockAudience(dockId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(`SELECT user_id FROM dock_members WHERE dock_id = $1`, [dockId]);
  return rows.map((r) => r.user_id);
}

/** Users who share a dm/group with this user (presence audience). */
export async function contactsOf(userId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `SELECT DISTINCT cm2.user_id FROM conversation_members cm1
     JOIN conversations c ON c.id = cm1.conversation_id AND c.kind IN ('dm','group')
     JOIN conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
     WHERE cm1.user_id = $1 AND cm2.user_id <> $1`,
    [userId],
  );
  return rows.map((r) => r.user_id);
}

/** Who should hear about profile changes: dm/group contacts + co-members of docks (capped). */
export async function profileAudience(userId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `SELECT DISTINCT cm2.user_id FROM conversation_members cm1
     JOIN conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
     WHERE cm1.user_id = $1
     UNION
     SELECT DISTINCT d2.user_id FROM dock_members d1 JOIN dock_members d2 ON d2.dock_id = d1.dock_id
     WHERE d1.user_id = $1
     LIMIT 5000`,
    [userId],
  );
  return rows.map((r) => r.user_id);
}

export async function touchLastSeen(userId: string): Promise<string> {
  const r = await db.query<{ last_seen_at: Date }>(`UPDATE users SET last_seen_at = now() WHERE id = $1 RETURNING last_seen_at`, [userId]);
  return new Date(r[0]?.last_seen_at ?? Date.now()).toISOString();
}

export async function lastSeenOf(userIds: string[]): Promise<Map<string, string | null>> {
  if (!userIds.length) return new Map();
  const rows = await db.query<{ id: string; last_seen_at: Date | null }>(`SELECT id, last_seen_at FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  return new Map(rows.map((r) => [r.id, r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null]));
}
