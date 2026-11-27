/**
 * In-memory run registry. A run lives while its SSE stream is open; paused write-tool calls
 * wait here for POST /v1/chat/:runId/confirm. NOTE: per-process memory — on serverless
 * (Vercel) confirm/stop must hit the same instance, which is not guaranteed.
 */
import { randomUUID } from "node:crypto";

export const CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;

interface Pending { resolve: (approve: boolean) => void; timer: NodeJS.Timeout }

export class Run {
  readonly id = randomUUID();
  readonly controller = new AbortController();
  readonly pending = new Map<string, Pending>();
  readonly createdAt = Date.now();

  get signal() {
    return this.controller.signal;
  }

  /** Resolves true (approved) / false (denied, timed out or stopped). */
  waitForConfirm(callId: string, timeoutMs = CONFIRM_TIMEOUT_MS): Promise<{ approve: boolean; reason?: "timeout" | "stopped" }> {
    return new Promise((resolve) => {
      if (this.signal.aborted) return resolve({ approve: false, reason: "stopped" });
      const onAbort = () => finish(false, "stopped");
      const finish = (approve: boolean, reason?: "timeout" | "stopped") => {
        const p = this.pending.get(callId);
        if (p) clearTimeout(p.timer);
        this.pending.delete(callId);
        this.signal.removeEventListener("abort", onAbort);
        resolve({ approve, reason });
      };
      const timer = setTimeout(() => finish(false, "timeout"), timeoutMs);
      this.pending.set(callId, { resolve: (a) => finish(a), timer });
      this.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  confirm(callId: string, approve: boolean): boolean {
    const p = this.pending.get(callId);
    if (!p) return false;
    p.resolve(approve);
    return true;
  }

  stop() {
    this.controller.abort();
  }
}

const runs = new Map<string, Run>();

export function createRun(): Run {
  const run = new Run();
  runs.set(run.id, run);
  return run;
}
export const getRun = (id: string) => runs.get(id);
export function endRun(run: Run) {
  run.stop();
  runs.delete(run.id);
}
export const activeRuns = () => runs.size;
