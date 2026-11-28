import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiUsageBudget, AiUsageRow, AiUsageSummary } from "@secrets/shared";
import { bridge, bridgeEnabled } from "./bridge";

export interface UsageRecord {
  at: number;
  model: string;
  input: number;
  output: number;
  cost: number;
  estimated: boolean;
}

interface UsageState {
  records: UsageRecord[];
  budget: AiUsageBudget | null;
  /** Latest percentUsed reported by the bridge (usage.update). */
  remotePercent: number | null;
  remote: AiUsageSummary | null;
  add: (r: UsageRecord) => void;
  setBudget: (b: AiUsageBudget | null) => void;
  setRemotePercent: (p: number | null) => void;
  reset: () => void;
  sync: () => Promise<void>;
}

/** USD per 1M tokens [input, output]. Estimates only; the bridge reports real cost when available. */
const PRICES: [RegExp, number, number][] = [
  [/mock/, 0, 0],
  [/flash-lite/, 0.1, 0.4],
  [/flash/, 0.3, 2.5],
  [/gemini.*pro/, 1.25, 10],
  [/:free$/, 0, 0],
  [/opus/, 15, 75],
  [/sonnet/, 3, 15],
  [/haiku/, 0.8, 4],
  [/gpt-4o-mini|mini/, 0.15, 0.6],
  [/gpt|o\d/, 2.5, 10],
];

export function estimateCost(model: string, input: number, output: number): number {
  const hit = PRICES.find(([re]) => re.test(model));
  const [, pi, po] = hit ?? [null, 1, 4];
  return (input * pi + output * po) / 1_000_000;
}

/** ~4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const useAiUsage = create<UsageState>()(
  persist(
    (set, get) => ({
      records: [],
      budget: null,
      remotePercent: null,
      remote: null,
      add: (r) => set({ records: [...get().records, r].slice(-5000) }),
      setBudget: (budget) => {
        set({ budget });
        if (bridgeEnabled()) void bridge("PUT", "/v1/usage/budget", budget ?? {}).catch(() => {});
      },
      setRemotePercent: (remotePercent) => set({ remotePercent }),
      reset: () => set({ records: [], remotePercent: null }),
      sync: async () => {
        if (!bridgeEnabled()) return;
        try {
          const remote = await bridge<AiUsageSummary>("GET", "/v1/usage");
          set({ remote, budget: remote.budget ?? get().budget, remotePercent: remote.percentUsed });
        } catch {
          /* keep local numbers */
        }
      },
    }),
    { name: "secrets.ai.usage", version: 1, partialize: ({ records, budget }) => ({ records, budget }) as UsageState },
  ),
);

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function periodStart(period: "day" | "month"): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "month") d.setDate(1);
  return d.getTime();
}

const sum = (rs: UsageRecord[]): AiUsageRow => rs.reduce((a, r) => ({ tokensIn: a.tokensIn + r.input, tokensOut: a.tokensOut + r.output, cost: a.cost + r.cost }), { tokensIn: 0, tokensOut: 0, cost: 0 });

/** Same shape as GET /v1/usage, computed on this device. */
export function summarize(records: UsageRecord[], budget: AiUsageBudget | null, days = 14): AiUsageSummary {
  const total = sum(records);
  const byModel = new Map<string, UsageRecord[]>();
  for (const r of records) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);
  const perModel = [...byModel.entries()].map(([model, rs]) => ({ model, ...sum(rs) })).sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut));
  const perDay: AiUsageSummary["perDay"] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const t = today.getTime() - i * 86_400_000;
    const key = dayKey(t);
    perDay.push({ date: key, ...sum(records.filter((r) => dayKey(r.at) === key)) });
  }
  let percentUsed: number | null = null;
  if (budget && budget.amount > 0) {
    const p = sum(records.filter((r) => r.at >= periodStart(budget.period)));
    const used = budget.kind === "usd" ? p.cost : p.tokensIn + p.tokensOut;
    percentUsed = Math.min(100, (used / budget.amount) * 100);
  }
  return { ...total, perModel, perDay, budget, percentUsed };
}

export function useUsageSummary(): AiUsageSummary {
  const records = useAiUsage((s) => s.records);
  const budget = useAiUsage((s) => s.budget);
  const remote = useAiUsage((s) => s.remote);
  const remotePercent = useAiUsage((s) => s.remotePercent);
  if (remote) return { ...remote, percentUsed: remotePercent ?? remote.percentUsed };
  const local = summarize(records, budget);
  return remotePercent !== null && budget ? { ...local, percentUsed: remotePercent } : local;
}

export function compact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
