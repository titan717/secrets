/**
 * Mock provider for demos without an API key (provider: "mock").
 * - No tools (agent mode off): streams a canned reply that echoes the user's message.
 * - Agent mode: step 1 calls the read tool `demo_search`, step 2 calls the write tool
 *   `demo_create_note` (so confirm_required fires unless auto_approve), step 3 answers
 *   with a summary that reflects whether the write was approved or denied.
 */
import type { ChatProvider, Chunk, ConvMessage, StreamRequest } from "./types.js";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

async function* words(text: string, signal: AbortSignal, type: "text" | "reasoning" = "text"): AsyncGenerator<Chunk> {
  for (const w of text.match(/\S+\s*/g) ?? []) {
    if (signal.aborted) return;
    yield { type, delta: w };
    await sleep(25, signal);
  }
}

export const MOCK_MODELS = [{ id: "mock-1", name: "Mock (demo, no key)" }];

export const mock: ChatProvider = {
  id: "mock" as ChatProvider["id"],

  async *stream(req: StreamRequest): AsyncIterable<Chunk> {
    const { messages, signal } = req;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    const lastUser = (messages[lastUserIdx] as Extract<ConvMessage, { role: "user" }> | undefined)?.content ?? "";
    const since = messages.slice(lastUserIdx + 1);
    const results = since.filter((m): m is Extract<ConvMessage, { role: "tool" }> => m.role === "tool");
    const has = (name: string) => req.tools?.some((t) => t.name === name);

    yield* words(`Thinking about "${lastUser.slice(0, 60)}" at ${req.effort.level} effort. `, signal, "reasoning");

    if (has("demo_search") && results.length === 0) {
      yield* words("Let me look that up first. ", signal);
      yield { type: "tool_call", call: { id: `mock_${Date.now().toString(36)}_1`, name: "demo_search", args: { query: lastUser.slice(0, 80) } } };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }
    if (has("demo_create_note") && results.length === 1) {
      yield* words("Found a few things. I'd like to save a note with them. ", signal);
      yield { type: "tool_call", call: { id: `mock_${Date.now().toString(36)}_2`, name: "demo_create_note", args: { title: `Notes: ${lastUser.slice(0, 40)}`, body: "Summary of demo search results." } } };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }
    if (results.length) {
      const denied = results.some((r) => r.result && typeof r.result === "object" && "error" in (r.result as object));
      yield* words(
        denied
          ? "Done searching. You declined saving the note, so nothing was written. Here is the answer anyway: this is a mock reply from the demo provider."
          : "All done: I searched and saved the note. This is a mock reply from the demo provider — connect Gemini or OpenRouter for real answers.",
        signal,
      );
      yield { type: "finish", reason: "stop" };
      return;
    }
    yield* words(
      `This is the **mock** provider (no API key needed). You said: "${lastUser.slice(0, 200)}". Turn on Agent mode to see tool calls and a confirmation step, or add a Gemini / OpenRouter key for real answers.`,
      signal,
    );
    yield { type: "finish", reason: "stop" };
  },

  async listModels() {
    return MOCK_MODELS;
  },
};
