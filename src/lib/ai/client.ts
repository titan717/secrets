import type { AiChatRequest, AiProvider, AiStreamEvent } from "@shared";
import { AI_URL } from "../../config";

export class AiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string; error?: string };
    return j.message || j.error || `AI service returned ${res.status}`;
  } catch {
    return `AI service returned ${res.status}`;
  }
}

function networkMessage(e: unknown) {
  return e instanceof TypeError ? `Can’t reach the AI service at ${AI_URL}. Is it running?` : (e as Error).message;
}

export interface StreamHeaders {
  providerKey?: string;
  githubToken?: string;
  secretsToken?: string | null;
}

function headersFor(h: StreamHeaders): Record<string, string> {
  const out: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (h.providerKey) out["x-provider-key"] = h.providerKey;
  if (h.githubToken) out["x-github-token"] = h.githubToken;
  if (h.secretsToken) out["x-secrets-token"] = h.secretsToken;
  return out;
}

/** POST /v1/chat and yield parsed SSE events from the ReadableStream. */
export async function* streamChat(body: AiChatRequest, h: StreamHeaders, signal: AbortSignal): AsyncGenerator<AiStreamEvent> {
  let res: Response;
  try {
    res = await fetch(`${AI_URL}/v1/chat`, { method: "POST", headers: headersFor(h), body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) return;
    throw new Error(networkMessage(e));
  }
  if (!res.ok || !res.body) throw new AiHttpError(res.status, await readError(res));
  const runHeader = res.headers.get("x-run-id");
  if (runHeader) yield { type: "run", run_id: runHeader };

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx: number;
      while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + (buf[idx] === "\r" ? 4 : 2));
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue; // comment / heartbeat
        try {
          yield JSON.parse(data) as AiStreamEvent;
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  } catch (e) {
    if (signal.aborted) return;
    throw new Error(networkMessage(e));
  } finally {
    reader.releaseLock();
  }
}

export async function stopRun(runId: string) {
  try {
    await fetch(`${AI_URL}/v1/chat/${encodeURIComponent(runId)}/stop`, { method: "POST" });
  } catch {
    /* closing the stream also stops the run */
  }
}

export async function confirmCall(runId: string, call_id: string, approve: boolean) {
  const res = await fetch(`${AI_URL}/v1/chat/${encodeURIComponent(runId)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id, approve }),
  }).catch((e) => {
    throw new Error(networkMessage(e));
  });
  if (!res.ok) throw new AiHttpError(res.status, await readError(res));
}

export interface ModelOption {
  id: string;
  name: string;
}

export async function fetchModels(provider: AiProvider, key: string, signal?: AbortSignal): Promise<ModelOption[]> {
  const res = await fetch(`${AI_URL}/v1/models?provider=${provider}`, { headers: key ? { "x-provider-key": key } : {}, signal }).catch((e) => {
    throw new Error(networkMessage(e));
  });
  if (!res.ok) throw new AiHttpError(res.status, await readError(res));
  const j = (await res.json()) as { models?: ModelOption[] };
  return j.models ?? [];
}

export async function aiHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(`${AI_URL}/health`, { signal });
    return r.ok;
  } catch {
    return false;
  }
}
