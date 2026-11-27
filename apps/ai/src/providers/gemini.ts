/**
 * Gemini generateContent REST streaming provider (`:streamGenerateContent?alt=sse`).
 * Docs: https://ai.google.dev/api/generate-content
 *       https://ai.google.dev/gemini-api/docs/generate-content/thinking
 *       https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures
 *       https://ai.google.dev/api/models
 */
import type { Effort } from "../contract.js";
import { describeHttpError, fetchWithRetry, readSse } from "./sse.js";
import { ProviderError, type ChatProvider, type Chunk, type ConvMessage, type FinishReason, type StreamRequest, type ToolCall } from "./types.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Documented escape hatch for functionCall parts that have no signature (e.g. history built elsewhere). */
const SKIP_SIGNATURE = "skip_thought_signature_validator";
const GENERATED_ID_PREFIX = "gc_";

interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [k: string]: unknown;
}
interface GeminiContent { role: "user" | "model"; parts: GeminiPart[] }

export function modelGeneration(model: string): { major: number; minor: number; family: "gemini" | "other" } {
  const m = model.replace(/^models\//, "").match(/^gemini-(\d+)(?:\.(\d+))?/i);
  if (!m) return { major: 0, minor: 0, family: "other" };
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), family: "gemini" };
}

function budgetToLevel(b: number): "LOW" | "MEDIUM" | "HIGH" {
  if (b <= 2048) return "LOW";
  if (b <= 12000) return "MEDIUM";
  return "HIGH";
}

/**
 * effort -> generationConfig.thinkingConfig
 *  - Gemini 2.5: thinkingBudget (low 1024 / medium 8192 / high 24576, Pro 32768; custom = given budget, -1 dynamic)
 *  - Gemini 3.x: thinkingLevel LOW/MEDIUM/HIGH (gemini-3-pro supports only LOW/HIGH); custom = thinkingBudget (backwards-compatible on 3.x)
 *  - Gemini 4+: thinkingLevel only (thinkingBudget returns 400) — custom budget is mapped to the nearest level
 */
export function geminiThinkingConfig(model: string, effort: Effort): Record<string, unknown> | undefined {
  const g = modelGeneration(model);
  if (g.family !== "gemini" || g.major < 2 || (g.major === 2 && g.minor < 5)) return undefined;
  const isPro = /-pro/i.test(model);
  if (g.major >= 3) {
    if (effort.level === "custom") {
      const b = effort.thinkingBudget;
      if (typeof b !== "number") return { thinkingLevel: "MEDIUM", includeThoughts: true };
      if (g.major >= 4 || b < 0) return { thinkingLevel: b < 0 ? "HIGH" : budgetToLevel(b), includeThoughts: true };
      return { thinkingBudget: Math.floor(b), includeThoughts: true };
    }
    let level = effort.level.toUpperCase();
    if (g.major === 3 && g.minor === 0 && isPro && level === "MEDIUM") level = "HIGH"; // gemini-3-pro-preview: low|high only
    return { thinkingLevel: level, includeThoughts: true };
  }
  // 2.5 series
  const max = isPro ? 32768 : 24576;
  const budget =
    effort.level === "custom"
      ? (typeof effort.thinkingBudget === "number" ? Math.floor(effort.thinkingBudget) : -1)
      : { low: 1024, medium: 8192, high: max }[effort.level];
  return { thinkingBudget: budget === -1 ? -1 : Math.min(budget, max), includeThoughts: budget !== 0 };
}

function toContents(messages: ConvMessage[]): { system?: string; contents: GeminiContent[] } {
  const system: string[] = [];
  const contents: GeminiContent[] = [];
  const push = (role: GeminiContent["role"], parts: GeminiPart[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };
  for (const m of messages) {
    switch (m.role) {
      case "system":
        system.push(m.content);
        break;
      case "user":
        push("user", [{ text: m.content }]);
        break;
      case "assistant": {
        const pd = m.providerData as { parts?: GeminiPart[] } | undefined;
        if (pd?.parts?.length) {
          push("model", pd.parts);
          break;
        }
        const parts: GeminiPart[] = [];
        if (m.content) parts.push({ text: m.content });
        m.toolCalls?.forEach((c, i) =>
          parts.push({
            functionCall: { ...(c.id.startsWith(GENERATED_ID_PREFIX) ? {} : { id: c.id }), name: c.name, args: c.args },
            ...(i === 0 ? { thoughtSignature: SKIP_SIGNATURE } : {}),
          }),
        );
        push("model", parts);
        break;
      }
      case "tool": {
        const r = m.result;
        const response =
          r && typeof r === "object" && !Array.isArray(r) && "error" in (r as object) ? { error: (r as any).error } : { result: r };
        push("user", [{ functionResponse: { ...(m.callId.startsWith(GENERATED_ID_PREFIX) ? {} : { id: m.callId }), name: m.name, response } }]);
        break;
      }
    }
  }
  // Newer Gemini models reject requests whose last turn is a (prefilled) model turn.
  while (contents.length && contents[contents.length - 1].role === "model") contents.pop();
  return { system: system.length ? system.join("\n\n") : undefined, contents };
}

function mapFinish(r: string | undefined): FinishReason | null {
  if (!r) return null;
  if (r === "STOP") return "stop";
  if (r === "MAX_TOKENS") return "length";
  if (["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE"].includes(r)) return "content_filter";
  return "other";
}

export const gemini: ChatProvider = {
  id: "gemini",

  async *stream(req: StreamRequest): AsyncIterable<Chunk> {
    const model = req.model.replace(/^models\//, "");
    const { system, contents } = toContents(req.messages);
    const thinkingConfig = geminiThinkingConfig(model, req.effort);
    const build = (withThinking: boolean) => {
      const body: Record<string, unknown> = { contents };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (req.tools?.length) body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
      if (withThinking && thinkingConfig) body.generationConfig = { thinkingConfig };
      return JSON.stringify(body);
    };
    const url = `${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const call = (withThinking: boolean) =>
      fetchWithRetry(url, { method: "POST", headers: { "x-goog-api-key": req.apiKey, "Content-Type": "application/json" }, body: build(withThinking), signal: req.signal });

    let res: Response;
    try {
      res = await call(true);
      // Some models reject a given thinking setting (e.g. 2.5 Pro cannot disable thinking, non-thinking models) — retry once without it.
      if (res.status === 400 && thinkingConfig) {
        const text = await res.clone().text();
        if (/thinking|thought/i.test(text) && !/thought_signature/i.test(text)) res = await call(false);
      }
    } catch (e) {
      if (req.signal.aborted) return;
      throw new ProviderError(`Could not reach Gemini: ${(e as Error).message}`);
    }
    if (!res.ok || !res.body) {
      let msg = await describeHttpError("Gemini", res);
      if (res.status === 400 && /API key/i.test(msg)) msg = `Invalid Gemini API key. ${msg}`;
      throw new ProviderError(msg, res.status);
    }

    const parts: GeminiPart[] = []; // accumulated model turn, signatures preserved in the exact part they arrived on
    const toolCalls: ToolCall[] = [];
    let finish: FinishReason | null = null;
    let n = 0;

    for await (const data of readSse(res.body, req.signal)) {
      let j: any;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new ProviderError(`Gemini: ${j.error.message ?? "stream error"}`);
      if (j.promptFeedback?.blockReason) throw new ProviderError(`Gemini blocked the prompt (${j.promptFeedback.blockReason}).`);
      const cand = j.candidates?.[0];
      if (!cand) continue;
      for (const p of (cand.content?.parts ?? []) as GeminiPart[]) {
        if (p.functionCall) {
          const id = p.functionCall.id || `${GENERATED_ID_PREFIX}${Date.now().toString(36)}_${n++}`;
          toolCalls.push({ id, name: p.functionCall.name, args: p.functionCall.args ?? {} });
          parts.push(p);
          continue;
        }
        if (typeof p.text === "string") {
          if (p.text) yield p.thought ? { type: "reasoning", delta: p.text } : { type: "text", delta: p.text };
          const last = parts[parts.length - 1];
          const mergeable =
            last && !p.thoughtSignature && !last.thoughtSignature && !last.functionCall && typeof last.text === "string" && !!last.thought === !!p.thought;
          if (mergeable) last.text += p.text;
          else parts.push({ ...p });
          continue;
        }
        parts.push(p); // other part kinds (executableCode, inlineData, ...) are kept verbatim
      }
      if (cand.finishReason) {
        if (cand.finishReason === "MALFORMED_FUNCTION_CALL") throw new ProviderError("Gemini produced a malformed function call. Try again or use a higher effort / different model.");
        if (cand.finishReason === "MISSING_THOUGHT_SIGNATURE") throw new ProviderError("Gemini rejected the history: missing thought signature.");
        finish = mapFinish(cand.finishReason);
      }
    }
    if (req.signal.aborted) return;

    for (const call of toolCalls) yield { type: "tool_call", call };
    yield { type: "finish", reason: toolCalls.length ? "tool_calls" : (finish ?? "stop"), providerData: { parts } };
  },

  async listModels(apiKey: string, signal?: AbortSignal) {
    const out: { id: string; name: string }[] = [];
    let pageToken = "";
    for (let i = 0; i < 10; i++) {
      const u = new URL(`${BASE}/models`);
      u.searchParams.set("pageSize", "1000");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const res = await fetch(u, { headers: { "x-goog-api-key": apiKey }, signal });
      if (!res.ok) throw new ProviderError(await describeHttpError("Gemini", res), res.status);
      const j = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
      for (const m of j.models ?? []) {
        if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes("generateContent")) continue;
        const id = m.name.replace(/^models\//, "");
        if (/embedding|aqa|imagen|veo/i.test(id)) continue;
        out.push({ id, name: m.displayName || id });
      }
      if (!j.nextPageToken) break;
      pageToken = j.nextPageToken;
    }
    return out;
  },
};
