import type { AiProvider, Effort } from "../contract.js";

/** JSON-schema-ish parameter schema (subset accepted by both Gemini and OpenAI-style tools). */
export interface JsonSchema {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Provider-neutral conversation. `providerData` round-trips opaque state (Gemini thoughtSignature parts, OpenRouter reasoning_details). */
export type ConvMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[]; providerData?: unknown }
  | { role: "tool"; callId: string; name: string; result: unknown };

export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "error" | "other";

export type Chunk =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "finish"; reason: FinishReason; providerData?: unknown };

export interface StreamRequest {
  apiKey: string;
  model: string;
  effort: Effort;
  messages: ConvMessage[];
  tools?: ToolSpec[];
  signal: AbortSignal;
}

export interface ChatProvider {
  id: AiProvider;
  stream(req: StreamRequest): AsyncIterable<Chunk>;
  listModels(apiKey: string, signal?: AbortSignal): Promise<{ id: string; name: string }[]>;
}

/** Error with a user-facing message (never contains the API key). */
export class ProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}
