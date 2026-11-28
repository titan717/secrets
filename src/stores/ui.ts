import { create } from "zustand";

interface UiState {
  newChat: "dm" | "group" | null;
  setNewChat: (m: "dm" | "group" | null) => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  infoOpen: boolean;
  setInfoOpen: (v: boolean) => void;
}
export const useUi = create<UiState>((set) => ({
  newChat: null,
  setNewChat: (newChat) => set({ newChat }),
  aiOpen: false,
  setAiOpen: (aiOpen) => set({ aiOpen }),
  infoOpen: typeof window !== "undefined" && window.innerWidth > 1400,
  setInfoOpen: (infoOpen) => set({ infoOpen }),
}));
