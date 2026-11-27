import { create } from "zustand";
import type { Conversation, MessageBody, MessageView, ServerFrame, User } from "@secrets/shared";
import { openBody, sealBody } from "@secrets/shared";
import { api, apiRaw, errorMessage, HttpError } from "../lib/api";
import { uuid } from "../lib/id";
import { loadLastSync, loadOutbox, saveLastSync, saveOutbox, type PendingMsg } from "../lib/outbox";
import { realtime, type WsStatus } from "../lib/realtime";
import { useSession } from "./session";
import { useSettings } from "./settings";
import { toast } from "./toast";

const PAGE = 40;
const ACK_TIMEOUT = 12_000;

interface ChatState {
  conversations: Record<string, Conversation>;
  convLoaded: boolean;
  convError: string | null;
  messages: Record<string, MessageView[]>;
  hasMore: Record<string, boolean>;
  loadingOlder: Record<string, boolean>;
  pending: Record<string, PendingMsg>;
  typing: Record<string, Record<string, number>>;
  presence: Record<string, boolean>;
  lastSeen: Record<string, string>;
  reads: Record<string, Record<string, string>>; // conv -> user -> message created_at
  users: Record<string, User>;
  status: WsStatus;
  activeId: string | null;

  loadConversations: () => Promise<void>;
  upsertConversation: (c: Conversation) => void;
  ensureConversation: (id: string) => Promise<Conversation | null>;
  loadMessages: (id: string) => Promise<void>;
  loadOlder: (id: string) => Promise<void>;
  send: (conversationId: string, body: MessageBody) => void;
  retry: (clientMsgId: string) => void;
  discard: (clientMsgId: string) => void;
  react: (messageId: string, emoji: string) => Promise<void>;
  edit: (messageId: string, body: MessageBody) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
  pin: (messageId: string, on: boolean) => Promise<void>;
  applyMessage: (m: MessageView) => void;
  setActive: (id: string | null) => void;
  markRead: (conversationId: string) => void;
  sendTyping: (conversationId: string) => void;
  rememberUsers: (users: User[]) => void;
  reset: () => void;
}

const me = () => useSession.getState().user?.id ?? "";

function mergeMessages(list: MessageView[] | undefined, incoming: MessageView[]): MessageView[] {
  const byId = new Map<string, MessageView>();
  for (const m of list ?? []) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  // Drop any duplicates that share a client_msg_id (keep newest server copy).
  const seen = new Map<string, MessageView>();
  for (const m of byId.values()) {
    const k = `${m.sender_id}:${m.client_msg_id}`;
    seen.set(k, m);
  }
  return [...seen.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

const ackTimers = new Map<string, number>();
let lastTypingSent: Record<string, number> = {};

export const useChat = create<ChatState>((set, get) => {
  const persistOutbox = () => {
    const uid = me();
    if (uid) saveOutbox(uid, get().pending);
  };

  const setPending = (id: string, patch: Partial<PendingMsg> | null) => {
    const pending = { ...get().pending };
    if (patch === null) delete pending[id];
    else if (pending[id]) pending[id] = { ...pending[id], ...patch };
    set({ pending });
    persistOutbox();
  };

  const bumpSync = (iso: string) => {
    const uid = me();
    if (!uid) return;
    const cur = loadLastSync(uid);
    if (!cur || iso > cur) saveLastSync(uid, iso);
  };

  const ingest = (msgs: MessageView[], opts: { live: boolean }) => {
    if (!msgs.length) return;
    const byConv: Record<string, MessageView[]> = {};
    for (const m of msgs) (byConv[m.conversation_id] ??= []).push(m);
    const messages = { ...get().messages };
    const conversations = { ...get().conversations };
    const pending = { ...get().pending };
    let pendingChanged = false;
    let unknownConv = false;
    const uid = me();
    for (const [cid, list] of Object.entries(byConv)) {
      if (messages[cid]) messages[cid] = mergeMessages(messages[cid], list);
      for (const m of list) {
        if (m.sender_id === uid && pending[m.client_msg_id]) {
          delete pending[m.client_msg_id];
          pendingChanged = true;
          clearTimeout(ackTimers.get(m.client_msg_id));
        }
        bumpSync(m.created_at);
      }
      const newest = list.reduce((a, b) => (a.created_at > b.created_at ? a : b));
      const conv = conversations[cid];
      if (!conv) {
        unknownConv = true;
        continue;
      }
      const isNewer = !conv.last_message || newest.created_at >= conv.last_message.created_at;
      const incomingFromOthers = list.filter((m) => m.sender_id !== uid && (!conv.last_message || m.created_at > conv.last_message.created_at)).length;
      const isActive = get().activeId === cid && document.visibilityState === "visible";
      conversations[cid] = {
        ...conv,
        last_message: isNewer ? newest : conv.last_message,
        unread_count: isActive ? 0 : conv.unread_count + incomingFromOthers,
      };
      // Someone sent a message -> they're no longer typing.
      const typing = { ...get().typing };
      if (typing[cid]) {
        const t = { ...typing[cid] };
        for (const m of list) delete t[m.sender_id];
        typing[cid] = t;
        set({ typing });
      }
    }
    set({ messages, conversations, pending });
    if (pendingChanged) persistOutbox();
    if (unknownConv) void get().loadConversations();
    const active = get().activeId;
    if (active && byConv[active] && document.visibilityState === "visible") get().markRead(active);
  };

  const transmit = (p: PendingMsg) => {
    const deviceId = useSession.getState().deviceId;
    const ok = realtime.send({
      t: "msg.send",
      conversation_id: p.conversation_id,
      client_msg_id: p.client_msg_id,
      device_id: deviceId,
      ciphertext: p.ciphertext,
      nonce: p.nonce,
    });
    if (!ok) {
      if (navigator.onLine) void restFallback(p);
      return;
    }
    setPending(p.client_msg_id, { status: "sending", attempts: p.attempts + 1 });
    clearTimeout(ackTimers.get(p.client_msg_id));
    ackTimers.set(
      p.client_msg_id,
      window.setTimeout(() => {
        const cur = get().pending[p.client_msg_id];
        if (cur && cur.status === "sending") void restFallback(cur);
      }, ACK_TIMEOUT),
    );
  };

  /** REST send is idempotent on client_msg_id; used when the socket is down or slow. */
  const restFallback = async (p: PendingMsg) => {
    setPending(p.client_msg_id, { status: "sending" });
    try {
      const msg = await api("POST /v1/conversations/:id/messages", {
        params: { id: p.conversation_id },
        body: { ciphertext: p.ciphertext, nonce: p.nonce, client_msg_id: p.client_msg_id, device_id: useSession.getState().deviceId },
      });
      ingest([msg], { live: true });
    } catch (e) {
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
        setPending(p.client_msg_id, { status: "failed", error: e.message });
      } else {
        setPending(p.client_msg_id, { status: "queued" });
      }
    }
  };

  const flush = () => {
    const items = Object.values(get().pending)
      .filter((p) => p.status === "queued")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const p of items) transmit(p);
  };

  const handleFrame = (f: ServerFrame) => {
    switch (f.t) {
      case "ready":
        break;
      case "sync.batch":
        ingest(f.messages, { live: false });
        break;
      case "msg.ack":
        clearTimeout(ackTimers.get(f.client_msg_id));
        setPending(f.client_msg_id, null);
        ingest([f.message], { live: true });
        break;
      case "msg.new":
        ingest([f.message], { live: true });
        break;
      case "msg.update": {
        const m = f.message;
        const list = get().messages[m.conversation_id];
        if (list) set({ messages: { ...get().messages, [m.conversation_id]: mergeMessages(list, [m]) } });
        break;
      }
      case "typing": {
        if (f.user_id === me()) break;
        const typing = { ...get().typing };
        typing[f.conversation_id] = { ...(typing[f.conversation_id] ?? {}), [f.user_id]: Date.now() + 5000 };
        set({ typing });
        setTimeout(() => {
          const cur = get().typing[f.conversation_id]?.[f.user_id];
          if (cur && cur <= Date.now()) {
            const t = { ...get().typing };
            const c = { ...t[f.conversation_id] };
            delete c[f.user_id];
            t[f.conversation_id] = c;
            set({ typing: t });
          }
        }, 5100);
        break;
      }
      case "read": {
        const list = get().messages[f.conversation_id] ?? [];
        const msg = list.find((m) => m.id === f.message_id);
        const at = msg?.created_at ?? new Date().toISOString();
        const reads = { ...get().reads };
        const prev = reads[f.conversation_id]?.[f.user_id];
        if (!prev || at > prev) reads[f.conversation_id] = { ...(reads[f.conversation_id] ?? {}), [f.user_id]: at };
        set({ reads });
        if (f.user_id === me()) {
          const c = get().conversations[f.conversation_id];
          if (c) get().upsertConversation({ ...c, unread_count: 0 });
        }
        break;
      }
      case "conversation.upsert":
        get().upsertConversation(f.conversation);
        break;
      case "conversation.remove": {
        const conversations = { ...get().conversations };
        delete conversations[f.conversation_id];
        set({ conversations });
        break;
      }
      case "user.update": {
        get().rememberUsers([f.user]);
        if (f.user.id === me()) useSession.getState().setUser(f.user);
        const conversations = { ...get().conversations };
        for (const [id, c] of Object.entries(conversations)) {
          if (c.members.some((m) => m.id === f.user.id)) conversations[id] = { ...c, members: c.members.map((m) => (m.id === f.user.id ? f.user : m)) };
        }
        set({ conversations });
        break;
      }
      case "presence":
        set({ presence: { ...get().presence, [f.user_id]: f.online }, ...(f.last_seen ? { lastSeen: { ...get().lastSeen, [f.user_id]: f.last_seen } } : {}) });
        break;
      case "error":
        if (f.client_msg_id) setPending(f.client_msg_id, { status: "failed", error: f.message });
        break;
      default:
        break;
    }
  };

  realtime.on((f) => {
    handleFrame(f);
    // Let other stores (docks) react to frames too.
    frameListeners.forEach((l) => l(f));
  });
  realtime.onStatus((s) => set({ status: s }));
  realtime.onAuthFailed = () => {
    useSession.getState().clear();
    toast.info("Your session ended. Please sign in again.");
  };
  realtime.onOpen(() => {
    const uid = me();
    realtime.send({ t: "sync", since: uid ? loadLastSync(uid) : null });
    flush();
  });

  return {
    conversations: {},
    convLoaded: false,
    convError: null,
    messages: {},
    hasMore: {},
    loadingOlder: {},
    pending: {},
    typing: {},
    presence: {},
    lastSeen: {},
    reads: {},
    users: {},
    status: "idle",
    activeId: null,

    loadConversations: async () => {
      try {
        const list = await api("GET /v1/conversations");
        const conversations: Record<string, Conversation> = {};
        for (const c of list) conversations[c.id] = c;
        // keep channel conversations we've loaded separately
        for (const c of Object.values(get().conversations)) if (c.kind === "channel" && !conversations[c.id]) conversations[c.id] = c;
        set({ conversations, convLoaded: true, convError: null });
        get().rememberUsers(list.flatMap((c) => c.members));
        const ids = [...new Set(list.flatMap((c) => c.members.map((m) => m.id)))].filter((i) => i !== me());
        if (ids.length)
          apiRaw<Record<string, boolean> | { user_id: string; online: boolean; last_seen?: string | null }[]>("GET /v1/presence", { query: { ids: ids.slice(0, 200).join(",") } })
            .then((r) => {
              const presence = { ...get().presence };
              const lastSeen = { ...get().lastSeen };
              if (Array.isArray(r))
                for (const p of r) {
                  presence[p.user_id] = p.online;
                  if (p.last_seen) lastSeen[p.user_id] = p.last_seen;
                }
              set({ presence, lastSeen });
            })
            .catch(() => {});
      } catch (e) {
        set({ convLoaded: true, convError: errorMessage(e) });
      }
    },

    upsertConversation: (c) => {
      set({ conversations: { ...get().conversations, [c.id]: { ...get().conversations[c.id], ...c } } });
      get().rememberUsers(c.members ?? []);
    },

    ensureConversation: async (id) => {
      const have = get().conversations[id];
      if (have) return have;
      try {
        const c = await api("GET /v1/conversations/:id", { params: { id } });
        get().upsertConversation(c);
        return c;
      } catch {
        return null;
      }
    },

    loadMessages: async (id) => {
      try {
        const page = await api("GET /v1/conversations/:id/messages", { params: { id }, query: { limit: PAGE } });
        set({
          messages: { ...get().messages, [id]: mergeMessages(get().messages[id], page) },
          hasMore: { ...get().hasMore, [id]: page.length >= PAGE },
        });
        for (const m of page) bumpSync(m.created_at);
      } catch (e) {
        if (!get().messages[id]) set({ messages: { ...get().messages, [id]: [] } });
        toast.error(errorMessage(e));
      }
    },

    loadOlder: async (id) => {
      const list = get().messages[id];
      if (!list?.length || get().loadingOlder[id] || get().hasMore[id] === false) return;
      set({ loadingOlder: { ...get().loadingOlder, [id]: true } });
      try {
        const page = await api("GET /v1/conversations/:id/messages", { params: { id }, query: { before: list[0].id, limit: PAGE } });
        set({
          messages: { ...get().messages, [id]: mergeMessages(get().messages[id], page) },
          hasMore: { ...get().hasMore, [id]: page.length >= PAGE },
        });
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        set({ loadingOlder: { ...get().loadingOlder, [id]: false } });
      }
    },

    send: (conversationId, body) => {
      const sealed = sealBody({ kind: "text", ...body });
      const p: PendingMsg = {
        client_msg_id: uuid(),
        conversation_id: conversationId,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        created_at: new Date().toISOString(),
        status: "queued",
        attempts: 0,
      };
      set({ pending: { ...get().pending, [p.client_msg_id]: p } });
      persistOutbox();
      transmit(p);
    },

    retry: (id) => {
      const p = get().pending[id];
      if (!p) return;
      setPending(id, { status: "queued", error: undefined });
      transmit({ ...p, status: "queued" });
    },

    discard: (id) => setPending(id, null),

    react: async (messageId, emoji) => {
      const uid = me();
      let convId: string | null = null;
      let msg: MessageView | undefined;
      for (const [cid, list] of Object.entries(get().messages)) {
        msg = list.find((m) => m.id === messageId);
        if (msg) {
          convId = cid;
          break;
        }
      }
      if (!msg || !convId) return;
      const has = msg.reactions.find((r) => r.emoji === emoji)?.user_ids.includes(uid);
      // optimistic
      const reactions = has
        ? msg.reactions.map((r) => (r.emoji === emoji ? { ...r, user_ids: r.user_ids.filter((u) => u !== uid) } : r)).filter((r) => r.user_ids.length)
        : msg.reactions.some((r) => r.emoji === emoji)
          ? msg.reactions.map((r) => (r.emoji === emoji ? { ...r, user_ids: [...r.user_ids, uid] } : r))
          : [...msg.reactions, { emoji, user_ids: [uid] }];
      const optimistic = { ...msg, reactions };
      const cid = convId;
      set({ messages: { ...get().messages, [cid]: mergeMessages(get().messages[cid], [optimistic]) } });
      try {
        const updated = has
          ? await api("DELETE /v1/messages/:id/reactions/:emoji", { params: { id: messageId, emoji } })
          : await api("POST /v1/messages/:id/reactions", { params: { id: messageId }, body: { emoji } });
        if (updated && (updated as MessageView).id)
          set({ messages: { ...get().messages, [cid]: mergeMessages(get().messages[cid], [updated as MessageView]) } });
      } catch (e) {
        set({ messages: { ...get().messages, [cid]: mergeMessages(get().messages[cid], [msg]) } });
        toast.error(errorMessage(e));
      }
    },

    applyMessage: (m) => {
      const list = get().messages[m.conversation_id];
      if (list) set({ messages: { ...get().messages, [m.conversation_id]: mergeMessages(list, [m]) } });
      const c = get().conversations[m.conversation_id];
      if (c?.last_message?.id === m.id) get().upsertConversation({ ...c, last_message: m });
    },

    edit: async (messageId, body) => {
      try {
        const m = await apiRaw<MessageView>("PATCH /v1/messages/:id", { params: { id: messageId }, body: sealBody(body) });
        get().applyMessage(m);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },

    remove: async (messageId) => {
      try {
        const m = await apiRaw<MessageView>("DELETE /v1/messages/:id", { params: { id: messageId } });
        if (m && m.id) get().applyMessage(m);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },

    pin: async (messageId, on) => {
      try {
        const m = await apiRaw<MessageView | { ok: true }>(`${on ? "POST" : "DELETE"} /v1/messages/:id/pin`, { params: { id: messageId } });
        if (m && "id" in m) get().applyMessage(m);
        else {
          for (const list of Object.values(get().messages)) {
            const found = list.find((x) => x.id === messageId);
            if (found) get().applyMessage({ ...found, pinned: on });
          }
        }
        toast.success(on ? "Pinned" : "Unpinned");
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },

    setActive: (id) => {
      set({ activeId: id });
      if (id) get().markRead(id);
    },

    markRead: (conversationId) => {
      const list = get().messages[conversationId];
      const last = list?.[list.length - 1];
      const c = get().conversations[conversationId];
      if (c && c.unread_count) get().upsertConversation({ ...c, unread_count: 0 });
      if (!last) return;
      if (!realtime.send({ t: "read", conversation_id: conversationId, message_id: last.id })) {
        void api("POST /v1/conversations/:id/read", { params: { id: conversationId }, body: { message_id: last.id } }).catch(() => {});
      }
    },

    sendTyping: (conversationId) => {
      if (!useSettings.getState().privacy.typing) return;
      const now = Date.now();
      if ((lastTypingSent[conversationId] ?? 0) > now - 3000) return;
      lastTypingSent[conversationId] = now;
      realtime.send({ t: "typing", conversation_id: conversationId });
    },

    rememberUsers: (users) => {
      if (!users.length) return;
      const next = { ...get().users };
      for (const u of users) next[u.id] = u;
      set({ users: next });
    },

    reset: () => {
      lastTypingSent = {};
      set({ conversations: {}, convLoaded: false, messages: {}, hasMore: {}, pending: {}, typing: {}, presence: {}, lastSeen: {}, reads: {}, users: {}, activeId: null });
    },
  };
});

type FrameListener = (f: ServerFrame) => void;
const frameListeners = new Set<FrameListener>();
export function onFrame(l: FrameListener) {
  frameListeners.add(l);
  return () => frameListeners.delete(l);
}

/** Boot realtime + outbox for the signed-in user. */
export function startChat() {
  const s = useSession.getState();
  if (!s.token || !s.user) return;
  useChat.setState({ pending: loadOutbox(s.user.id) });
  realtime.start(s.token);
  void useChat.getState().loadConversations();
}

export function stopChat() {
  realtime.stop();
  useChat.getState().reset();
}

/** Display helpers */
export function conversationTitle(c: Conversation, users: Record<string, User>, myUserId: string): string {
  if (c.title) return c.title;
  const others = c.members.filter((m) => m.id !== myUserId);
  if (c.kind === "dm") return (others[0] && (users[others[0].id] ?? others[0]).display_name) || "Direct message";
  return others.map((o) => o.display_name.split(" ")[0]).slice(0, 4).join(", ") || "Group";
}

export function conversationPeer(c: Conversation, myUserId: string): User | undefined {
  if (c.kind !== "dm") return undefined;
  return c.members.find((m) => m.id !== myUserId) ?? c.members[0];
}

export function previewText(m: MessageView | null | undefined): string {
  if (!m) return "";
  if (m.deleted) return "Message deleted";
  const b = openBody(m);
  if (b.text?.trim()) return b.text.trim();
  if (b.attachments?.length) return b.attachments.length > 1 ? `${b.attachments.length} photos` : "Photo";
  return "";
}
