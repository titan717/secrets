/**
 * OpenRouter Chat Completions (OpenAI-compatible) streaming provider.
 * Docs: https://openrouter.ai/docs/api/reference/streaming
 *       https://openrouter.ai/docs/use-cases/reasoning-tokens
 *       https://openrouter.ai/docs/guides/features/tool-calling
 */
import type { Effort } from "../contract.js";
import { describeHttpError, fetchWithRetry, readSse } from "./sse.js";
import { ProviderError, type ChatProvider, type Chunk, type ConvMessage, type FinishReason, type StreamRequest, type ToolCall } from "./types.js";

const BASE = "https://openrouter.ai/api/v1";

/** effort -> OpenRouter `reasoning` object. Unsupported models simply ignore it. */
export function openRouterReasoning(effort: Effort): Record<string, unknown> {
  switch (effort.level) {
    case "low":
    case "medium":
    case "high":
      return { effort: effort.level };
    case "custom":
      if (typeof effort.thinkingBudget === "number") {
        return effort.thinkingBudget <= 0 ? { effort: "none" } : { max_tokens: Math.floor(effort.thinkingBudget) };
      }
      return { effort: "medium" };
  }
}

function toOpenAiMessages(messages: ConvMessage[]): unknown[] {
  return messages.map((m) => {
    switch (m.role) {
      case "system":
      case "user":
        return { role: m.role, content: m.content };
      case "assistant": {
        const out: Record<string, unknown> = { role: "assistant", content: m.content || (m.toolCalls?.length ? null : "") };
        if (m.toolCalls?.length) {
          out.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } }));
        }
        const pd = m.providerData as { reasoning_details?: unknown[] } | undefined;
        // Preserve reasoning blocks across tool-call turns (required by some providers, e.g. Anthropic / Gemini via OpenRouter).
        if (pd?.reasoning_details?.length) out.reasoning_details = pd.reasoning_details;
        return out;
      }
      case "tool":
        return { role: "tool", tool_call_id: m.callId, content: typeof m.result === "string" ? m.result : JSON.stringify(m.result) };
    }
  });
}

function mapFinish(r: string | null | undefined): FinishReason {
  switch (r) {
    case "stop":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "error":
      return "error";
    default:
      return "other";
  }
}

function parseArgs(s: string): Record<string, unknown> {
  if (!s.trim()) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : { value: v };
  } catch {
    return { _raw: s, _error: "Model produced invalid JSON arguments" };
  }
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_APP_URL || "https://github.com/titan717/ai.secrets",
    "X-Title": process.env.OPENROUTER_APP_TITLE || "Secrets",
  };
}

export const openrouter: ChatProvider = {
  id: "openrouter",

  async *stream(req: StreamRequest): AsyncIterable<Chunk> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAiMessages(req.messages),
      stream: true,
      reasoning: openRouterReasoning(req.effort),
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    }

    let res: Response;
    try {
      res = await fetchWithRetry(`${BASE}/chat/completions`, { method: "POST", headers: headers(req.apiKey), body: JSON.stringify(body), signal: req.signal });
    } catch (e) {
      if (req.signal.aborted) return;
      throw new ProviderError(`Could not reach OpenRouter: ${(e as Error).message}`);
    }
    if (!res.ok || !res.body) {
      let msg = await describeHttpError("OpenRouter", res);
      if (req.tools?.length && /tool/i.test(msg)) msg += " — this model may not support tool calling; turn off Agent mode or pick another model.";
      throw new ProviderError(msg, res.status);
    }

    // tool_calls stream as fragments keyed by `index`
    const calls = new Map<number, { id: string; name: string; args: string }>();
    const reasoningDetails: unknown[] = [];
    let finish: FinishReason | null = null;

    for await (const data of readSse(res.body, req.signal)) {
      if (data === "[DONE]") break;
      let j: any;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new ProviderError(`OpenRouter: ${j.error.message ?? "stream error"}${j.error.code ? ` (${j.error.code})` : ""}`);
      const choice = j.choices?.[0];
      if (!choice) continue;
      const d = choice.delta ?? {};
      if (Array.isArray(d.reasoning_details) && d.reasoning_details.length) {
        reasoningDetails.push(...d.reasoning_details);
        // Some providers send reasoning only via reasoning_details
        if (typeof d.reasoning !== "string" || !d.reasoning) {
          for (const rd of d.reasoning_details) {
            const t = rd?.text ?? rd?.summary;
            if (typeof t === "string" && t) yield { type: "reasoning", delta: t };
          }
        }
      }
      if (typeof d.reasoning === "string" && d.reasoning) yield { type: "reasoning", delta: d.reasoning };
      if (typeof d.content === "string" && d.content) yield { type: "text", delta: d.content };
      if (Array.isArray(d.tool_calls)) {
        for (const tc of d.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : calls.size;
          const cur = calls.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (typeof tc.function?.arguments === "string") cur.args += tc.function.arguments;
          calls.set(idx, cur);
        }
      }
      if (choice.finish_reason) finish = mapFinish(choice.finish_reason);
    }
    if (req.signal.aborted) return;

    const toolCalls: ToolCall[] = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, c]) => c.name)
      .map(([i, c]) => ({ id: c.id || `call_${i}_${Date.now().toString(36)}`, name: c.name, args: parseArgs(c.args) }));
    for (const call of toolCalls) yield { type: "tool_call", call };

    yield {
      type: "finish",
      reason: toolCalls.length ? "tool_calls" : (finish ?? "stop"),
      providerData: reasoningDetails.length ? { reasoning_details: reasoningDetails } : undefined,
    };
  },

  async listModels(apiKey: string, signal?: AbortSignal) {
    const res = await fetch(`${BASE}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal });
    if (!res.ok) throw new ProviderError(await describeHttpError("OpenRouter", res), res.status);
    const j = (await res.json()) as { data?: { id: string; name?: string }[] };
    return (j.data ?? []).map((m) => ({ id: m.id, name: m.name || m.id }));
  },
};
