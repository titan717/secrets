/**
 * WebSocket protocol (mock mode).
 *
 * The real client talks to api.secrets at `${VITE_WS_URL}?token=…`. In mock mode
 * the same `Realtime` surface is backed by this in-memory bus: identical client
 * frames in, identical server frames out, so the rest of the app needs no
 * conditionals.
 */
import type { ClientFrame, ServerFrame } from "@shared";
import { USE_MOCKS } from "../config";
import { createMockSocket, type MockSocket } from "../api/mock/socket";

export type WsStatus = "idle" | "connecting" | "online" | "offline";

type Handler = (f: ServerFrame) => void;
type StatusHandler = (s: WsStatus) => void;

/**
 * Resilient WebSocket client: exponential backoff with jitter, ping/pong,
 * idle watchdog, immediate reconnect on network/visibility changes.
 * With VITE_USE_MOCKS=true it connects to the local mock bus instead.
 */
export class Realtime {
  private ws: WebSocket | MockSocket | null = null;
  private token: string | null = null;
  private attempt = 0;
  private retryTimer: number | undefined;
  private watchdog: number | undefined;
  private lastFrameAt = 0;
  private handlers = new Set<Handler>();
  private statusHandlers = new Set<StatusHandler>();
  private onOpenHooks = new Set<() => void>();
  /** Called when the server rejects our token (close code 4001). */
  onAuthFailed: () => void = () => {};
  status: WsStatus = "idle";

  constructor() {
    window.addEventListener("online", () => this.kick());
    window.addEventListener("offline", () => this.closeSocket());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.kick();
    });
  }

  on(h: Handler) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
  onStatus(h: StatusHandler) {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }
  onOpen(h: () => void) {
    this.onOpenHooks.add(h);
    return () => this.onOpenHooks.delete(h);
  }

  private setStatus(s: WsStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  start(token: string) {
    if (this.token === token && this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.stop();
    this.token = token;
    this.connect();
  }

  stop() {
    this.token = null;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdog);
    this.closeSocket();
    this.setStatus("idle");
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onopen = null;
    ws.close();
  }

  /** Reconnect now if we're waiting on backoff. */
  kick() {
    if (!this.token) return;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.retryTimer);
    this.attempt = 0;
    this.connect();
  }

  private connect() {
    if (!this.token) return;
    this.setStatus("connecting");

    if (USE_MOCKS) {
      // The mock bus is local, synchronous and never drops: no retry loop needed.
      const ws = createMockSocket();
      this.ws = ws;
      ws.onopen = () => {
        this.lastFrameAt = Date.now();
        this.setStatus("online");
        this.onOpenHooks.forEach((h) => h());
      };
      ws.onmessage = (ev) => this.receive(ev.data as string);
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.setStatus("idle");
      };
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${wsUrl(this.token)}`);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.lastFrameAt = Date.now();
      this.setStatus("online");
      clearInterval(this.watchdog);
      // Server pings every 25s; if we hear nothing for 65s, assume a dead socket.
      this.watchdog = window.setInterval(() => {
        if (Date.now() - this.lastFrameAt > 65_000) ws.close();
      }, 10_000);
      this.onOpenHooks.forEach((h) => h());
    };
    ws.onmessage = (ev) => {
      this.lastFrameAt = Date.now();
      this.receive(ev.data as string);
    };
    ws.onclose = (ev) => {
      clearInterval(this.watchdog);
      if (this.ws === ws) this.ws = null;
      if (ev.code === 4001) {
        this.token = null;
        this.setStatus("idle");
        this.onAuthFailed();
        return;
      }
      if (this.token) this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private receive(raw: string) {
    let f: ServerFrame;
    try {
      f = JSON.parse(raw) as ServerFrame;
    } catch {
      return;
    }
    if (f.t === "ping") {
      this.send({ t: "pong" });
      return;
    }
    this.handlers.forEach((h) => h(f));
  }

  private scheduleRetry() {
    this.setStatus("offline");
    const base = Math.min(15_000, 500 * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempt++;
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  send(frame: ClientFrame): boolean {
    if (!this.isOpen || !this.ws) return false;
    try {
      this.ws.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }
}

function wsUrl(token: string): string {
  const raw = (import.meta.env.VITE_WS_URL as string | undefined) || "";
  if (raw) {
    const withToken = new URL(raw);
    withToken.searchParams.set("token", token);
    return withToken.toString();
  }
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  return `${base.replace(/^http/, "ws")}/v1/ws?token=${encodeURIComponent(token)}`;
}

export const realtime = new Realtime();