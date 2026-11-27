import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { ClientFrame, ServerFrame } from "@secrets/shared";
import { verifyToken, type AuthUser } from "../auth/service.js";
import { addConn, removeConn, publish, contactsOf, onlineAmong, markOnline, markOffline, heartbeat, conversationAudience, touchLastSeen, lastSeenOf, type Conn } from "./bus.js";
import { access } from "../conversations/service.js";
import { sendMessage, markRead, react, messagesSince } from "../messages/service.js";
import { HttpError } from "../../lib/http.js";

const sockets = new WeakMap<Conn, WebSocket>();
const PING_MS = 25_000;
const MAX_FRAME = 128 * 1024;

export function closeConn(c: Conn) {
  const ws = sockets.get(c);
  try {
    ws?.close(4001, "session revoked");
  } catch {
    /* ignore */
  }
}

/** presence frame + last_seen (ISO, additive field). */
const presenceFrame = (user_id: string, online: boolean, last_seen: string | null): ServerFrame =>
  ({ t: "presence", user_id, online, last_seen });

const typingSeen = new Map<string, number>();

export async function realtimeRoutes(app: FastifyInstance) {
  setInterval(() => void heartbeat(), PING_MS).unref();

  app.get("/v1/ws", { websocket: true }, (socket: WebSocket, req) => {
    const send = (f: ServerFrame) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(f));
    };
    let user: AuthUser | null = null;
    let conn: Conn | null = null;
    let alive = true;
    const pending: string[] = [];

    const handle = async (raw: string) => {
      if (!user) return;
      let f: ClientFrame;
      try {
        f = JSON.parse(raw);
      } catch {
        return send({ t: "error", message: "Invalid JSON frame" });
      }
      try {
        switch (f.t) {
          case "pong":
            alive = true;
            return;
          case "sync":
            return send({ t: "sync.batch", messages: await messagesSince(user.id, f.since) });
          case "msg.send": {
            try {
              const { message } = await sendMessage(user.id, user.device_id, f.conversation_id, f);
              return send({ t: "msg.ack", client_msg_id: f.client_msg_id, message });
            } catch (e: any) {
              return send({ t: "error", message: e instanceof HttpError ? e.message : "Couldn't send message", client_msg_id: f.client_msg_id });
            }
          }
          case "typing": {
            const key = `${user.id}:${f.conversation_id}`;
            const now = Date.now();
            if ((typingSeen.get(key) ?? 0) > now - 2000) return;
            typingSeen.set(key, now);
            if (typingSeen.size > 10_000) typingSeen.clear();
            const a = await access(f.conversation_id, user.id, "write");
            const audience = (await conversationAudience(a.conv.id)).filter((u) => u !== user!.id);
            return publish(audience, { t: "typing", conversation_id: a.conv.id, user_id: user.id });
          }
          case "read": {
            const a = await access(f.conversation_id, user.id, "read");
            return await markRead(a.conv.id, user.id, f.message_id, a.conv.kind);
          }
          case "react":
            await react(user.id, f.message_id, f.emoji, !!f.on);
            return;
          default:
            return send({ t: "error", message: `Unknown frame type` });
        }
      } catch (e: any) {
        if (!(e instanceof HttpError)) req.log.error({ err: e }, "ws frame failed");
        send({ t: "error", message: e instanceof HttpError ? e.message : "Something went wrong" });
      }
    };

    // Attach listeners synchronously (before any await) so early frames aren't lost.
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      const s = data.toString();
      if (s.length > MAX_FRAME) return send({ t: "error", message: "Frame too large" });
      if (!user) pending.push(s);
      else void handle(s);
    });

    const ping = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      send({ t: "ping" });
    }, PING_MS);

    socket.on("close", async () => {
      clearInterval(ping);
      if (!conn || !user) return;
      const last = removeConn(conn);
      if (last) {
        await markOffline(user.id);
        const last_seen = await touchLastSeen(user.id).catch(() => new Date().toISOString());
        publish(await contactsOf(user.id).catch(() => []), presenceFrame(user.id, false, last_seen));
      }
    });

    const token = (req.query as any)?.token ?? (req.headers["sec-websocket-protocol"] as string | undefined);
    verifyToken(typeof token === "string" ? token : null)
      .then(async (u) => {
        user = u;
        conn = { userId: u.id, deviceId: u.device_id, send };
        sockets.set(conn, socket);
        if (socket.readyState !== 1) return;
        const first = addConn(conn);
        send({ t: "ready", user_id: u.id });
        const contacts = await contactsOf(u.id);
        const now = await touchLastSeen(u.id).catch(() => new Date().toISOString());
        if (first) {
          await markOnline(u.id);
          publish(contacts, presenceFrame(u.id, true, now));
        }
        // Snapshot of every contact: online ones and last_seen for offline ones.
        const online = new Set(await onlineAmong(contacts));
        const seen = await lastSeenOf(contacts);
        for (const id of contacts) send(presenceFrame(id, online.has(id), seen.get(id) ?? null));
        for (const s of pending.splice(0)) await handle(s);
      })
      .catch((e) => {
        send({ t: "error", message: e instanceof HttpError ? e.message : "Unauthorized" });
        socket.close(4001, "unauthorized");
      });
  });
}
