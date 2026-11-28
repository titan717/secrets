import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiUpcomingTask } from "@secrets/shared";
import { uuid } from "../id";
import { bridge, bridgeEnabled, mirror } from "./bridge";

interface UpcomingState {
  tasks: AiUpcomingTask[];
  schedule: (t: Pick<AiUpcomingTask, "prompt" | "runAt" | "projectId"> & { title?: string }) => AiUpcomingTask;
  cancel: (id: string) => void;
  patch: (id: string, p: Partial<AiUpcomingTask>) => void;
  removeFinished: () => void;
  sync: () => Promise<void>;
}

export const useAiUpcoming = create<UpcomingState>()(
  persist(
    (set, get) => ({
      tasks: [],
      schedule: (t) => {
        const task: AiUpcomingTask = { id: uuid(), title: t.title?.trim() || t.prompt.slice(0, 60), prompt: t.prompt, runAt: t.runAt, projectId: t.projectId, status: "scheduled" };
        set({ tasks: [...get().tasks, task] });
        mirror("POST", "/v1/upcoming", task);
        return task;
      },
      cancel: (id) => {
        get().patch(id, { status: "cancelled" });
        mirror("DELETE", `/v1/upcoming/${encodeURIComponent(id)}`);
      },
      patch: (id, p) => set({ tasks: get().tasks.map((x) => (x.id === id ? { ...x, ...p } : x)) }),
      removeFinished: () => set({ tasks: get().tasks.filter((t) => t.status === "scheduled" || t.status === "queued" || t.status === "running") }),
      sync: async () => {
        if (!bridgeEnabled()) return;
        try {
          const r = await bridge<{ tasks: AiUpcomingTask[] }>("GET", "/v1/upcoming");
          set({ tasks: r.tasks });
        } catch {
          /* keep local */
        }
      },
    }),
    { name: "secrets.ai.upcoming", version: 1, partialize: ({ tasks }) => ({ tasks }) as UpcomingState },
  ),
);

/**
 * While the app is open, run due local tasks. With the bridge on, the bridge runs them instead
 * and this only refreshes the list.
 */
export function useUpcomingRunner(run: (task: AiUpcomingTask) => Promise<string | undefined>) {
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      if (bridgeEnabled()) return void useAiUpcoming.getState().sync();
      const due = useAiUpcoming.getState().tasks.find((t) => t.status === "scheduled" && new Date(t.runAt).getTime() <= Date.now());
      if (!due) return;
      busy = true;
      const { patch } = useAiUpcoming.getState();
      patch(due.id, { status: "running" });
      try {
        const sessionId = await run(due);
        patch(due.id, { status: "done", sessionId });
      } catch {
        patch(due.id, { status: "failed" });
      } finally {
        busy = false;
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 15_000);
    return () => clearInterval(t);
  }, [run]);
}
