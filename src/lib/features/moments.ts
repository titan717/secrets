import { create } from "zustand";
import type { Moment, MomentGroup, ServerFrame } from "@shared";
import { momentsApi } from "./api";
import { onFrame, useChat } from "../../stores/chat";
import { myId, useSession } from "../../stores/session";

/** Background presets for text moments (id stored server-side, ≤64 chars). */
export const BACKGROUNDS: Record<string, string> = {
  aurora: "linear-gradient(135deg, #a855f7 0%, #6d28d9 55%, #1e1b4b 100%)",
  dusk: "linear-gradient(160deg, #f472b6 0%, #a855f7 50%, #4c1d95 100%)",
  ocean: "linear-gradient(150deg, #22d3ee 0%, #3b82f6 50%, #312e81 100%)",
  ember: "linear-gradient(150deg, #fb923c 0%, #e11d48 60%, #4c0519 100%)",
  forest: "linear-gradient(150deg, #4ade80 0%, #0d9488 55%, #042f2e 100%)",
  ink: "linear-gradient(160deg, #3f3a52 0%, #16141d 100%)",
};
export const bgFor = (id: string | null | undefined) => BACKGROUNDS[id ?? ""] ?? (id && /^#|^rgb|^hsl/.test(id) ? id : BACKGROUNDS.aurora);

interface MomentsState {
  groups: MomentGroup[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  markViewed: (m: Moment) => void;
  removeLocal: (id: string) => void;
  addLocal: (m: Moment) => void;
}

function sortGroups(gs: MomentGroup[]): MomentGroup[] {
  const me = myId();
  return [...gs]
    .filter((g) => g.moments.length)
    .sort((a, b) => {
      if (a.user.id === me) return -1;
      if (b.user.id === me) return 1;
      if (a.has_unseen !== b.has_unseen) return a.has_unseen ? -1 : 1;
      return b.latest_at.localeCompare(a.latest_at);
    });
}

function regroup(g: MomentGroup): MomentGroup {
  const moments = [...g.moments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { ...g, moments, has_unseen: moments.some((m) => !m.viewed), latest_at: moments.at(-1)?.created_at ?? g.latest_at };
}

let unsub: (() => void) | null = null;
let inflight: Promise<void> | null = null;

export const useMoments = create<MomentsState>((set, get) => ({
  groups: [],
  loaded: false,
  error: null,
  load: () => {
    if (!unsub) unsub = onFrame(handleFrame);
    inflight ??= momentsApi
      .feed()
      .then((gs) => {
        useChat.getState().rememberUsers(gs.map((g) => g.user));
        set({ groups: sortGroups(gs.map(regroup)), loaded: true, error: null });
      })
      .catch((e) => set({ loaded: true, error: e instanceof Error ? e.message : String(e) }))
      .finally(() => (inflight = null));
    return inflight;
  },
  markViewed: (m) => {
    if (m.viewed || m.user_id === myId()) return;
    set({
      groups: sortGroups(
        get().groups.map((g) => (g.user.id === m.user_id ? regroup({ ...g, moments: g.moments.map((x) => (x.id === m.id ? { ...x, viewed: true } : x)) }) : g)),
      ),
    });
    void momentsApi.view(m.id).catch(() => undefined);
  },
  removeLocal: (id) =>
    set({ groups: sortGroups(get().groups.map((g) => regroup({ ...g, moments: g.moments.filter((m) => m.id !== id) }))) }),
  addLocal: (m) => {
    const gs = get().groups;
    const owner = gs.find((g) => g.user.id === m.user_id);
    if (owner) {
      if (owner.moments.some((x) => x.id === m.id)) return;
      set({ groups: sortGroups(gs.map((g) => (g === owner ? regroup({ ...g, moments: [...g.moments, m] }) : g))) });
      return;
    }
    const user = useChat.getState().users[m.user_id] ?? (m.user_id === myId() ? useSessionUser() : undefined);
    if (!user) {
      void get().load();
      return;
    }
    set({ groups: sortGroups([...gs, regroup({ user, moments: [m], has_unseen: !m.viewed, latest_at: m.created_at })]) });
  },
}));

function useSessionUser() {
  return useSession.getState().user ?? undefined;
}

function handleFrame(f: ServerFrame) {
  const s = useMoments.getState();
  switch (f.t) {
    case "moment.new":
      s.addLocal({ ...f.moment, viewed: f.moment.user_id === myId() ? true : f.moment.viewed });
      break;
    case "moment.remove":
      s.removeLocal(f.moment_id);
      break;
    case "moment.view":
      useMoments.setState({
        groups: s.groups.map((g) => ({
          ...g,
          moments: g.moments.map((m) => (m.id === f.moment_id ? { ...m, view_count: (m.view_count ?? 0) + 1 } : m)),
        })),
      });
      window.dispatchEvent(new CustomEvent("secrets:moment-view", { detail: f }));
      break;
  }
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
