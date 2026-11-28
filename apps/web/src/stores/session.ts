import { create } from "zustand";
import type { Session, User } from "@secrets/shared";
import { getDeviceId } from "../lib/id";
import { API_URL } from "../config";

/**
 * Session state. The token lives in memory only — the durable credential is the
 * httpOnly session cookie. On boot we restore the user from the cookie instead of
 * reading localStorage (an XSS could read that).
 */
interface SessionState {
  token: string | null;
  user: User | null;
  deviceId: string;
  /** True once the cookie restore attempt finished (avoids redirect flashes). */
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
  clear: () => set({ token: null, user: null }),
  restore: async () => {
    if (get().ready) return;
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
