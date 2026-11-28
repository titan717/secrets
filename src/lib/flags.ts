import { create } from "zustand";
import { DEFAULT_FLAGS, type FeatureFlags } from "@shared";
import { apiRaw } from "./api";

/**
 * Server-evaluated flags for UX gating only. Authorization always happens server-side.
 * Defaults keep the MVP surface on and experimental modules off until /v1/config answers.
 */
interface FlagsState {
  flags: FeatureFlags;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useFlags = create<FlagsState>((set, get) => ({
  flags: DEFAULT_FLAGS,
  loaded: false,
  async load() {
    if (get().loaded) return;
    try {
      const r = await apiRaw<{ features?: Partial<FeatureFlags> }>("GET /v1/config");
      set({ flags: { ...DEFAULT_FLAGS, ...(r?.features ?? {}) }, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
