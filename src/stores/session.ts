import { create } from "zustand";
import type { Session, User } from "@shared";
import { getDeviceId } from "../lib/id";
import { API_URL, USE_MOCKS } from "../config";
import { getDB } from "../api/mock/db";

/**
 * Session state. The token lives in memory only — the durable credential is the
 * httpOnly session cookie. On boot we restore the user from the cookie instead of
 * reading localStorage (an XSS could read that).
 *
 * In mock mode the "cookie" is a flag in the demo database.
 */
interface SessionState {
  token: string | null;
  user: User | null;
  deviceId: string;
  /** True once the restore attempt finished (avoids redirect flashes). */
  ready: boolean;
  setSession: (s: Session) => void;
  setUser: (u: User) => void;
  clear: () => void;
  restore: () => Promise<void>;
}

// Drop the legacy persisted token from older builds.
try {
  localStorage.removeItem("secrets.session");
} catch {
  /* ignore */
}

export const useSession = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  deviceId: getDeviceId(),
  ready: false,
  setSession: (s) => set({ token: s.token, user: s.user, ready: true }),
  setUser: (u) => set({ user: u }),
  clear: () => {
    if (USE_MOCKS) {
      const db = getDB();
      db.session = false;
      db.me = "";
    }
    set({ token: null, user: null });
  },
  restore: async () => {
    if (get().ready) return;
    if (USE_MOCKS) {
      // In demo mode, requery the in-memory DB to see if the session flag is set.
      const db = getDB();
      if (db.session) {
        const me = db.users.find((u) => u.id === db.me);
        if (me) return set({ user: me, token: "mock-session", ready: true });
      }
      return set({ ready: true });
    }
    try {
      const res = await fetch(`${API_URL}/v1/auth/session`, { credentials: "include" });
      if (!res.ok) return set({ ready: true });
      const data = (await res.json()) as { user: User; token?: string };
      set({ user: data.user, token: data.token ?? null, ready: true });
    } catch {
      set({ ready: true });
    }
  },
}));

export const getToken = () => useSession.getState().token;
export const myId = () => useSession.getState().user?.id ?? "";