import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FontChoice, ThemeMode } from "../lib/theme";

interface SettingsState {
  theme: ThemeMode;
  accent: string;
  font: FontChoice;
  wallpaper: string; // wallpaper id or "photo"
  wallpaperPhoto: string | null; // data URL, device only
  clock24: boolean;
  enterToSend: boolean;
  reduceMotion: boolean;
  notif: { messages: boolean; docks: boolean; calls: boolean; previews: boolean; sounds: boolean };
  privacy: { readReceipts: boolean; typing: boolean; onlineStatus: boolean; profilePreview: boolean };
  coachSeen: Record<string, boolean>;
  set: (p: Partial<Omit<SettingsState, "set" | "setNotif" | "setPrivacy" | "markCoach" | "resetCoach">>) => void;
  setNotif: (p: Partial<SettingsState["notif"]>) => void;
  setPrivacy: (p: Partial<SettingsState["privacy"]>) => void;
  markCoach: (id: string) => void;
  resetCoach: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "system",
      accent: "g-secrets",
      font: "general",
      wallpaper: "default",
      wallpaperPhoto: null,
      clock24: false,
      enterToSend: true,
      reduceMotion: false,
      notif: { messages: true, docks: true, calls: true, previews: true, sounds: true },
      privacy: { readReceipts: true, typing: true, onlineStatus: true, profilePreview: true },
      coachSeen: {},
      set: (p) => set(p),
      setNotif: (p) => set({ notif: { ...get().notif, ...p } }),
      setPrivacy: (p) => set({ privacy: { ...get().privacy, ...p } }),
      markCoach: (id) => set({ coachSeen: { ...get().coachSeen, [id]: true } }),
      resetCoach: () => set({ coachSeen: {} }),
    }),
    { name: "secrets.settings" },
  ),
);
