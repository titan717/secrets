import { create } from "zustand";

/** Ephemeral UI state for the AI section (not persisted). */
interface AiUiState {
  navOpen: boolean;
  /** Draft options for the next chat started from the home screen. */
  projectId?: string;
  incognito: boolean;
  scheduleOpen: boolean;
  settingsOpen: boolean;
  modelsOpen: boolean;
  searchOpen: boolean;
  set: (p: Partial<Omit<AiUiState, "set">>) => void;
}

export const useAiUi = create<AiUiState>((set) => ({
  navOpen: false,
  incognito: false,
  scheduleOpen: false,
  settingsOpen: false,
  modelsOpen: false,
  searchOpen: false,
  set: (p) => set(p),
}));
