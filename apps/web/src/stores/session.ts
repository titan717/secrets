import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session, User } from "@secrets/shared";
import { getDeviceId } from "../lib/id";

interface SessionState {
  token: string | null;
  user: User | null;
  deviceId: string;
  setSession: (s: Session) => void;
  setUser: (u: User) => void;
  clear: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      deviceId: getDeviceId(),
      setSession: (s) => set({ token: s.token, user: s.user }),
      setUser: (u) => set({ user: u }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: "secrets.session", partialize: (s) => ({ token: s.token, user: s.user }) as Partial<SessionState> },
  ),
);

export const getToken = () => useSession.getState().token;
export const myId = () => useSession.getState().user?.id ?? "";
