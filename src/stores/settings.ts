import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_ACCENT, findAccent, type FontChoice, type ThemeMode } from "../lib/theme";

export type StoryAudience = "all_friends" | "public" | "only" | "except";
export type NameColorMode = "none" | "solid" | "gradient";

export interface NameStyle {
  font: string;
  color: NameColorMode;
  /** Solid colour or first gradient stop. */
  c1: string;
  c2: string;
}
export const DEFAULT_NAME_STYLE: NameStyle = { font: "inter", color: "none", c1: "#d56fff", c2: "#8f86ff" };

interface SettingsState {
  theme: ThemeMode;
  accent: string;
  /** Custom colours added under "My Colors" (#rrggbb). */
  myColors: string[];
  font: FontChoice;
  wallpaper: string; // wallpaper id or "photo"
  wallpaperPhoto: string | null; // data URL, device only
  clock24: boolean;
  haptics: boolean;
  appIcon: "default" | "ghost";
  language: string;
  /** Experimental "New chat screen" (Appearance, blueprint p10). */
  newChatScreen: boolean;
  enterToSend: boolean;
  reduceMotion: boolean;
  storiesEnabled: boolean;
  /** Share-profile card colour id (blueprint p1). */
  shareColor: string;
  nameStyle: NameStyle;
  nameBanner: string | null;
  /** Last "What's new" version the user has dismissed. */
  whatsNewSeen: string | null;
  notif: { messages: boolean; docks: boolean; calls: boolean; previews: boolean; sounds: boolean };
  privacy: { readReceipts: boolean; typing: boolean; onlineStatus: boolean; profilePreview: boolean; screenshots: boolean };
  coachSeen: Record<string, boolean>;
  set: (p: Partial<Omit<SettingsState, "set" | "setNotif" | "setPrivacy" | "markCoach" | "resetCoach">>) => void;
  setNotif: (p: Partial<SettingsState["notif"]>) => void;
  setPrivacy: (p: Partial<SettingsState["privacy"]>) => void;
  markCoach: (id: string) => void;
  resetCoach: () => void;
}

export const SETTINGS_DEFAULTS = {
  theme: "system" as ThemeMode,
  accent: DEFAULT_ACCENT,
  myColors: [] as string[],
  font: "system" as FontChoice,
  wallpaper: "default",
  wallpaperPhoto: null as string | null,
  clock24: false,
  haptics: true,
  appIcon: "default" as const,
  language: "en",
  newChatScreen: true,
  enterToSend: true,
  reduceMotion: false,
  storiesEnabled: true,
  shareColor: "pink",
  nameStyle: DEFAULT_NAME_STYLE,
  nameBanner: null as string | null,
  whatsNewSeen: null as string | null,
  notif: { messages: true, docks: true, calls: true, previews: true, sounds: true },
  privacy: { readReceipts: true, typing: true, onlineStatus: true, profilePreview: true, screenshots: true },
  coachSeen: {} as Record<string, boolean>,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...SETTINGS_DEFAULTS,
      set: (p) => set(p),
      setNotif: (p) => set({ notif: { ...get().notif, ...p } }),
      setPrivacy: (p) => set({ privacy: { ...get().privacy, ...p } }),
      markCoach: (id) => set({ coachSeen: { ...get().coachSeen, [id]: true } }),
      resetCoach: () => set({ coachSeen: {} }),
    }),
    {
      name: "secrets.settings",
      version: 2,
      // Older builds stored accent ids that no longer exist, fewer privacy keys, etc.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const accent = p.accent && findAccent(p.accent).id === p.accent ? p.accent : DEFAULT_ACCENT;
        let storiesEnabled = p.storiesEnabled;
        try {
          if (storiesEnabled === undefined) storiesEnabled = localStorage.getItem("secrets.moments.enabled") !== "0";
        } catch {
          /* ignore */
        }
        return {
          ...SETTINGS_DEFAULTS,
          ...p,
          accent,
          storiesEnabled: storiesEnabled ?? true,
          font: p.font === "system" ? "system" : "general",
          notif: { ...SETTINGS_DEFAULTS.notif, ...(p.notif ?? {}) },
          privacy: { ...SETTINGS_DEFAULTS.privacy, ...(p.privacy ?? {}) },
          nameStyle: { ...DEFAULT_NAME_STYLE, ...(p.nameStyle ?? {}) },
        } as SettingsState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          notif: { ...current.notif, ...(p.notif ?? {}) },
          privacy: { ...current.privacy, ...(p.privacy ?? {}) },
          nameStyle: { ...current.nameStyle, ...(p.nameStyle ?? {}) },
        };
      },
    },
  ),
);
