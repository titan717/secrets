/**
 * A WebSocket-shaped local event bus for mock mode. It accepts the same client
 * frames as api.secrets, answers with the same server frames, and adds a little
 * life (presence, typing, replies) so the UI feels real without a backend.
 */
import type { ClientFrame, ServerFrame } from "@shared";
import { openBody } from "@shared";
import { uuid } from "../../lib/id";
import { addMessage, findConversation, getDB, messagesFor, onlineUserIds, saveDB, toConversation } from "./db";

export interface MockSocket {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

const REPLIES = [
  "That makes sense.",
  "Love that.",
  "On it — give me a few minutes.",
  "Ha, exactly.",
  "Just saw this. Yes!",
  "Perfect, let’s do it.",
  "Good question — let me think.",
  "Saving this for later.",
];

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export function createMockSocket(): MockSocket {
  let readyState = 0;
  let closed = false;
  const timers: number[] = [];
  let ping: number | undefined;
  const db = getDB();
  const me = db.me;

  const emit = (frame: ServerFrame) => {
    if (closed || readyState !== 1) return;
    sock.onmessage?.({ data: JSON.stringify(frame) });
  };

  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      if (!closed) fn();
    }, ms);
    timers.push(t);
  };

  const peerFor = (conversationId: string): string | null => {
    const c = findConversation(conversationId);
    if (!c || c.kind === "channel") return null;
    const others = c.member_ids.filter((x) => x !== me);
    return others.length ? pick(others) : null;
  };

  const maybeReply = (conversationId: string, text: string) => {
    const peer = peerFor(conversationId);
    if (!peer || Math.random() < 0.18) return;
    const conv = findConversation(conversationId)!;
    if (!conv.member_ids.includes(peer)) return;
    later(900, () => emit({ t: "typing", conversation_id: conversationId, user_id: peer }));
    later(2400, () => {
      const reply = text.includes("?") ? REPLIES[6] : pick(REPLIES);
      const m = addMessage({
        conversation_id: conversationId,
        sender_id: peer,
        ciphertext: JSON.stringify({ kind: "text", text: reply }),
        nonce: null,
        client_msg_id: `mock-${uuid()}`,
        device_id: "d_demo",
      });
      emit({ t: "msg.new", message: m });
      const c = findConversation(conversationId);
      if (c) emit({ t: "conversation.upsert", conversation: toConversation(c) });
      // The peer has seen your message once they reply.
      later(700, () => emit({ t: "read", conversation_id: conversationId, user_id: peer, message_id: m.id }));
    });
  };

  const handle = (frame: ClientFrame) => {
    switch (frame.t) {
      case "pong":
        break;
      case "sync": {
        const since = frame.since ?? "";
        const myConvs = new Set(db.conversations.filter((c) => c.kind === "channel" || c.member_ids.includes(me)).map((c) => c.id));
        const missed = db.messages
          .filter((m) => myConvs.has(m.conversation_id) && m.sender_id !== me && m.created_at > since)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(-100);
        emit({ t: "sync.batch", messages: missed });
        break;
      }
      case "msg.send": {
        const conv = findConversation(frame.conversation_id);
        if (!conv) {
          emit({ t: "error", message: "That conversation isn’t available.", client_msg_id: frame.client_msg_id });
          break;
        }
        const message = addMessage({
          conversation_id: frame.conversation_id,
          sender_id: me,
          ciphertext: frame.ciphertext,
          nonce: frame.nonce,
          client_msg_id: frame.client_msg_id,
          device_id: frame.device_id,
        });
        emit({ t: "msg.ack", client_msg_id: frame.client_msg_id, message });
        const text = openBody(message).text ?? "";
        if (conv.kind !== "channel") maybeReply(frame.conversation_id, text);
        break;
      }
      case "typing": {
        const peer = peerFor(frame.conversation_id);
        if (peer) later(450, () => emit({ t: "typing", conversation_id: frame.conversation_id, user_id: peer }));
        break;
      }
      case "read": {
        const conv = findConversation(frame.conversation_id);
        if (conv) {
          conv.read_at = new Date().toISOString();
          saveDB();
        }
        const peer = peerFor(frame.conversation_id);
        if (peer) later(1100, () => emit({ t: "read", conversation_id: frame.conversation_id, user_id: peer, message_id: frame.message_id }));
        break;
      }
      case "react": {
        const message = db.messages.find((m) => m.id === frame.message_id);
        if (!message) break;
        if (frame.on) {
          const group = message.reactions.find((r) => r.emoji === frame.emoji);
          if (group && !group.user_ids.includes(me)) group.user_ids.push(me);
          if (!group) message.reactions.push({ emoji: frame.emoji, user_ids: [me] });
        } else {
          message.reactions = message.reactions
            .map((r) => (r.emoji === frame.emoji ? { ...r, user_ids: r.user_ids.filter((u) => u !== me) } : r))
            .filter((r) => r.user_ids.length);
        }
        saveDB();
        emit({ t: "msg.update", message });
        break;
      }
      default:
        break;
    }
  };

  const sock: MockSocket = {
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(raw: string) {
      if (closed || readyState !== 1) return;
      let frame: ClientFrame;
      try {
        frame = JSON.parse(raw) as ClientFrame;
      } catch {
        return;
      }
      handle(frame);
    },
    close() {
      closed = true;
      readyState = 3;
      clearInterval(ping);
      for (const t of timers) clearTimeout(t);
    },
  };

  // Open on the next tick, like a real socket handshake.
  window.setTimeout(() => {
    if (closed) return;
    readyState = 1;
    sock.readyState = 1;
    sock.onopen?.();
    const online = new Set(onlineUserIds());
    for (const u of db.users) {
      if (u.id === me) continue;
      emit({ t: "presence", user_id: u.id, online: online.has(u.id), last_seen: online.has(u.id) ? null : new Date(Date.now() - 25 * 60_000).toISOString() });
    }
    emit({ t: "ready", user_id: me });
    ping = window.setInterval(() => emit({ t: "ping" }), 20_000);
  }, 40);

  return sock;
}

/** Exposed for tests / future tooling. */
export function mockMessages(conversationId: string) {
  return messagesFor(conversationId);
}
