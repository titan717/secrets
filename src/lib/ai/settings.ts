import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiProvider, Effort, EffortLevel } from "@shared";
import { EFFORT_STEPS } from "@shared";

/** AI settings live on this device only (localStorage "secrets.ai.settings"). Keys never leave the browser except as request headers to the AI service. */
export interface AiSettingsState {
  provider: AiProvider;
  keys: { gemini: string; openrouter: string };
  models: { gemini: string; openrouter: string; mock: string };
  effort: EffortLevel;
  customSteps: number;
  thinkingBudget: number;
  tools: { github: boolean; secrets: boolean };
  githubToken: string;
  agentMode: boolean;
  /** Session-only: not persisted. */
  autoApprove: boolean;
  set: (p: Partial<Omit<AiSettingsState, "set">>) => void;
}

export const DEFAULT_MODELS = { gemini: "gemini-2.5-flash", openrouter: "openrouter/auto", mock: "mock-1" };

export const useAiSettings = create<AiSettingsState>()(
  persist(
    (set) => ({
      provider: "mock",
      keys: { gemini: "", openrouter: "" },
      models: { ...DEFAULT_MODELS },
      effort: "medium",
      customSteps: 12,
      thinkingBudget: 4096,
      tools: { github: false, secrets: true },
      githubToken: "",
      agentMode: true,
      autoApprove: false,
      set: (p) => set(p),
    }),
    {
      name: "secrets.ai.settings",
      version: 1,
      partialize: ({ autoApprove: _a, set: _s, ...rest }) => rest as Partial<AiSettingsState>,
    },
  ),
);

export function currentModel(s: AiSettingsState): string {
  return s.models[s.provider] || DEFAULT_MODELS[s.provider];
}

export function currentKey(s: AiSettingsState): string {
  return s.provider === "mock" ? "" : s.keys[s.provider];
}

export function effortOf(s: AiSettingsState): Effort {
  if (s.effort === "custom") return { level: "custom", maxSteps: s.customSteps, thinkingBudget: s.thinkingBudget };
  return { level: s.effort, maxSteps: EFFORT_STEPS[s.effort] };
}

export const PROVIDER_LABEL: Record<AiProvider, string> = { mock: "Mock (demo)", gemini: "Gemini", openrouter: "OpenRouter" };
