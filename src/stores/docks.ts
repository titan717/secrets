import { create } from "zustand";
import type { Channel, Dock, DockMember, DockRole } from "@shared";
import { api, apiRaw } from "../lib/api";
import { onFrame, useChat } from "./chat";
import { useSession } from "./session";

interface DocksState {
  docks: Record<string, Dock>;
  mine: string[];
  mineLoaded: boolean;
  mineError: string | null;
  members: Record<string, DockMember[]>;
  loadMine: () => Promise<void>;
  loadDock: (id: string) => Promise<Dock | null>;
  loadMembers: (id: string) => Promise<DockMember[]>;
  upsert: (d: Dock) => void;
  drop: (id: string) => void;
  create: (body: { name: string; handle: string; description?: string; visibility: Dock["visibility"] }) => Promise<Dock>;
  join: (id: string, invite_code?: string) => Promise<Dock>;
  joinByCode: (code: string) => Promise<Dock>;
  leave: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (id: string, body: Partial<Pick<Dock, "name" | "description" | "icon_url" | "visibility">>) => Promise<Dock>;
  addChannel: (id: string, name: string, topic?: string) => Promise<Channel>;
  editChannel: (id: string, channelId: string, body: { name?: string; topic?: string }) => Promise<Channel>;
  deleteChannel: (id: string, channelId: string) => Promise<void>;
  setRole: (id: string, userId: string, role: DockRole) => Promise<void>;
  kick: (id: string, userId: string) => Promise<void>;
  invite: (id: string) => Promise<string>;
}

const sortChannels = (d: Dock): Dock => ({ ...d, channels: [...(d.channels ?? [])].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)) });

export const useDocks = create<DocksState>((set, get) => ({
  docks: {},
  mine: [],
  mineLoaded: false,
  mineError: null,
  members: {},

  loadMine: async () => {
    try {
      const list = await api("GET /v1/docks", { query: { mine: "1" } });
      const docks = { ...get().docks };
      list.forEach((d) => {
        // list responses may omit channels; keep what we have
        const prev = docks[d.id];
        docks[d.id] = sortChannels({ ...prev, ...d, channels: d.channels?.length ? d.channels : prev?.channels ?? [] });
      });
      set({ docks, mine: list.map((d) => d.id), mineLoaded: true, mineError: null });
    } catch (e) {
      set({ mineLoaded: true, mineError: e instanceof Error ? e.message : "Couldn’t load docks" });
    }
  },

  loadDock: async (id) => {
    try {
      const d = await api("GET /v1/docks/:id", { params: { id } });
      get().upsert(d);
      return get().docks[id];
    } catch {
      return null;
    }
  },

  loadMembers: async (id) => {
    const list = await api("GET /v1/docks/:id/members", { params: { id } });
    useChat.getState().rememberUsers(list.map((m) => m.user));
    set({ members: { ...get().members, [id]: list } });
    return list;
  },

  upsert: (d) => {
    const prev = get().docks[d.id];
    const next = sortChannels({ ...prev, ...d, channels: d.channels ?? prev?.channels ?? [] });
    const mine = get().mine;
    set({
      docks: { ...get().docks, [d.id]: next },
      mine: next.my_role ? (mine.includes(d.id) ? mine : [d.id, ...mine]) : mine.filter((x) => x !== d.id),
    });
  },

  drop: (id) => {
    const docks = { ...get().docks };
    delete docks[id];
    set({ docks, mine: get().mine.filter((x) => x !== id) });
  },

  create: async (body) => {
    const d = await api("POST /v1/docks", { body });
    get().upsert(d);
    return get().docks[d.id];
  },

  join: async (id, invite_code) => {
    const d = await api("POST /v1/docks/:id/join", { params: { id }, body: invite_code ? { invite_code } : {} });
    get().upsert(d);
    return get().docks[d.id];
  },

  joinByCode: async (code) => {
    const d = await apiRaw<Dock>("POST /v1/docks/join-by-code", { body: { invite_code: code.trim() } });
    get().upsert(d);
    if (!d.channels?.length) await get().loadDock(d.id);
    return get().docks[d.id];
  },

  leave: async (id) => {
    await api("POST /v1/docks/:id/leave", { params: { id }, body: {} });
    get().drop(id);
  },

  remove: async (id) => {
    await api("DELETE /v1/docks/:id", { params: { id } });
    get().drop(id);
  },

  update: async (id, body) => {
    const d = await api("PATCH /v1/docks/:id", { params: { id }, body });
    get().upsert({ ...get().docks[id], ...d });
    return get().docks[id];
  },

  addChannel: async (id, name, topic) => {
    const ch = await api("POST /v1/docks/:id/channels", { params: { id }, body: { name, topic } });
    const d = get().docks[id];
    if (d && !d.channels.some((c) => c.id === ch.id)) get().upsert({ ...d, channels: [...d.channels, ch] });
    return ch;
  },

  editChannel: async (id, channelId, body) => {
    const ch = await api("PATCH /v1/docks/:id/channels/:channelId", { params: { id, channelId }, body });
    const d = get().docks[id];
    if (d) get().upsert({ ...d, channels: d.channels.map((c) => (c.id === ch.id ? ch : c)) });
    return ch;
  },

  deleteChannel: async (id, channelId) => {
    await api("DELETE /v1/docks/:id/channels/:channelId", { params: { id, channelId } });
    const d = get().docks[id];
    if (d) get().upsert({ ...d, channels: d.channels.filter((c) => c.id !== channelId) });
  },

  setRole: async (id, userId, role) => {
    const m = await api("PATCH /v1/docks/:id/members/:userId", { params: { id, userId }, body: { role } });
    const list = get().members[id] ?? [];
    set({ members: { ...get().members, [id]: list.map((x) => (x.user.id === userId ? { ...x, ...m, user: m.user ?? x.user } : x)) } });
  },

  kick: async (id, userId) => {
    await api("DELETE /v1/docks/:id/members/:userId", { params: { id, userId } });
    const list = get().members[id] ?? [];
    set({ members: { ...get().members, [id]: list.filter((x) => x.user.id !== userId) } });
    const d = get().docks[id];
    if (d) get().upsert({ ...d, member_count: Math.max(0, d.member_count - 1) });
  },

  invite: async (id) => {
    const r = await api("POST /v1/docks/:id/invite", { params: { id }, body: {} });
    return r.invite_code;
  },
}));

onFrame((f) => {
  if (f.t === "dock.upsert") {
    const me = useSession.getState().user?.id;
    const d = f.dock;
    // A frame without my_role can still mean I'm a member — keep the prior role if present.
    const prev = useDocks.getState().docks[d.id];
    useDocks.getState().upsert({ ...d, my_role: d.my_role ?? prev?.my_role ?? (d.owner_id === me ? "owner" : null) });
  }
});

export const roleRank: Record<DockRole, number> = { owner: 3, admin: 2, member: 1 };
export const isStaff = (r: DockRole | null | undefined) => r === "owner" || r === "admin";

/** Channels that only staff can post in. */
export function channelReadOnly(ch: Channel | undefined, role: DockRole | null | undefined): string | null {
  if (!ch) return null;
  if (!role) return "Join this dock to send messages.";
  if (ch.name === "announcements" && !isStaff(role)) return "Only admins can post in #announcements.";
  return null;
}

export function inviteLink(code: string) {
  return `${location.origin}/docks?join=${encodeURIComponent(code)}`;
}
