import type { Effort, EffortLevel, EffortPreset } from "@secrets/shared";
import { EFFORT_LEVELS, EFFORT_REASONING, EFFORT_STEPS } from "@secrets/shared";

export { EFFORT_LEVELS };

export const EFFORT_META: Record<EffortPreset, { label: string; blurb: string }> = {
  instant: { label: "Instant", blurb: "No reasoning, up to 2 steps, prefers a fast model" },
  low: { label: "Low", blurb: "Light reasoning, up to 4 steps" },
  medium: { label: "Medium", blurb: "Balanced reasoning, up to 10 steps" },
  high: { label: "High", blurb: "Deep reasoning, up to 20 steps" },
  ultra: { label: "Ultra", blurb: "Maximum reasoning, up to 40 steps" },
};

export function effortLabel(level: EffortLevel): string {
  return level === "custom" ? "Custom" : EFFORT_META[level].label;
}

/** 0..1 position of a level on the gauge / slider. Custom sits by its step count. */
export function effortPosition(level: EffortLevel, customSteps = 10): number {
  if (level !== "custom") return EFFORT_LEVELS.indexOf(level) / (EFFORT_LEVELS.length - 1);
  const s = Math.max(1, Math.min(40, customSteps));
  return Math.log(s) / Math.log(40);
}

export function toEffort(level: EffortLevel, custom: { maxSteps: number; thinkingBudget: number }): Effort {
  if (level === "custom") return { level, maxSteps: custom.maxSteps, thinkingBudget: custom.thinkingBudget };
  return { level, maxSteps: EFFORT_STEPS[level], thinkingBudget: level === "instant" ? 0 : undefined };
}

export function effortSummary(level: EffortLevel, custom: { maxSteps: number; thinkingBudget: number }): string {
  if (level === "custom") return `Up to ${custom.maxSteps} steps, ${custom.thinkingBudget ? `${custom.thinkingBudget.toLocaleString()} thinking tokens` : "no reasoning"}`;
  const r = EFFORT_REASONING[level];
  return `Up to ${EFFORT_STEPS[level]} steps, ${r === "none" ? "no reasoning" : `${r} reasoning`}`;
}
