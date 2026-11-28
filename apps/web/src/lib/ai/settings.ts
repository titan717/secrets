import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiProvider, Effort, EffortLevel } from "@secrets/shared";
import { toEffort } from "./effort";

/** AI settings live on this device only (localStorage "secrets.ai.settings"). Keys never leave the browser except as request headers to the AI service. */
export interface AiSettingsState {
  provider: AiProvider;
  keys: { gemini: string; openrouter: string };
  models: { gemini: string; openrouter: string; mock: string };
  /** "best" lets the service pick; "fast" models are preferred on instant effort. */
  modelChoice: "best" | "pinned";
  effort: EffortLevel;
  customSteps: number;
  thinkingBudget: number;
  tools: { github: boolean; secrets: boolean };
  githubToken: string;
  agentMode: boolean;
  /** Recall approved memory facts in every chat. */
  memoryEnabled: boolean;
  /** Use the ai.secrets bridge (v2 endpoints) for projects, usage, memory, connections, shares and upcoming. */
  bridgeSync: boolean;
  bridgeToken: string;
  /** Session-only: not persisted. */
  autoApprove: boolean;
  set: (p: Partial<Omit<AiSettingsState, "set">>) => void;
}

export const DEFAULT_MODELS = { gemini: "gemini-2.5-flash", openrouter: "openrouter/auto", mock: "mock-1" };
/** Fast defaults used by instant effort when the user hasn't pinned a model. */
export const FAST_MODELS = { gemini: "gemini-2.5-flash-lite", openrouter: "openrouter/auto", mock: "mock-1" };

export const ASSISTANT_NAME = "Grace";

export const useAiSettings = create<AiSettingsState>()(
  persist(
    (set) => ({
      provider: "mock",
      keys: { gemini: "", openrouter: "" },
      models: { ...DEFAULT_MODELS },
      modelChoice: "best",
      effort: "medium",
      customSteps: 12,
      thinkingBudget: 4096,
      tools: { github: false, secrets: true },
      githubToken: "",
      agentMode: true,
      memoryEnabled: true,
      bridgeSync: false,
      bridgeToken: "",
      autoApprove: false,
      set: (p) => set(p),
    }),
    {
      name: "secrets.ai.settings",
      version: 2,
      migrate: (state) => {
        const s = (state ?? {}) as Partial<AiSettingsState>;
        // v1 had no instant/ultra and pinned models only.
        return { modelChoice: "pinned", memoryEnabled: true, bridgeSync: false, bridgeToken: "", ...s } as AiSettingsState;
      },
      partialize: ({ autoApprove: _a, set: _s, ...rest }) => rest as Partial<AiSettingsState>,
    },
  ),
);

export function currentModel(s: AiSettingsState, override?: string): string {
  if (override) return override;
  if (s.modelChoice === "best") return s.effort === "instant" ? FAST_MODELS[s.provider] : DEFAULT_MODELS[s.provider];
  return s.models[s.provider] || DEFAULT_MODELS[s.provider];
}

/** Short display name for the header chip. */
export function modelLabel(s: AiSettingsState): string {
  if (s.modelChoice === "best") return `${ASSISTANT_NAME} · Best`;
  const id = s.models[s.provider] || DEFAULT_MODELS[s.provider];
  const short = id.split("/").pop() ?? id;
  return short.length > 22 ? `${short.slice(0, 21)}…` : short;
}

export function currentKey(s: AiSettingsState): string {
  return s.provider === "mock" ? "" : s.keys[s.provider];
}

export function effortOf(s: AiSettingsState): Effort {
  return toEffort(s.effort, { maxSteps: s.customSteps, thinkingBudget: s.thinkingBudget });
}

export const PROVIDER_LABEL: Record<AiProvider, string> = { mock: "Mock (demo)", gemini: "Gemini", openrouter: "OpenRouter" };
