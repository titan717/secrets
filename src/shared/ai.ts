/**
 * Contract between apps/web and the ai.secrets service.
 * Keys (provider + GitHub) live in browser storage only and are sent per request
 * in headers; the service never logs or stores them.
 *
 * POST {AI_URL}/v1/chat  (SSE response, text/event-stream)
 *   headers: x-provider-key, x-github-token (optional)
 *   body: AiChatRequest
 *   events: `data: <AiStreamEvent JSON>\n\n`
 * POST {AI_URL}/v1/chat/:runId/confirm  body { call_id, approve }  -> resumes a paused agent run
 * POST {AI_URL}/v1/chat/:runId/stop     -> aborts the run
 * GET  {AI_URL}/v1/models?provider=gemini|openrouter  (header x-provider-key) -> { models: {id,name}[] }
 *
 * Secrets tools (read_conversation, summarize_dock_channel, draft_message) are executed by
 * the AI service calling apps/api with the user's session token from header x-secrets-token.
 */
export type AiProvider = "gemini" | "openrouter" | "mock"; // mock = keyless demo provider
export type EffortLevel = "low" | "medium" | "high" | "custom";
export interface Effort { level: EffortLevel; maxSteps?: number; thinkingBudget?: number }

export interface AiMessage { role: "user" | "assistant" | "system"; content: string }

export interface AiChatRequest {
  provider: AiProvider;
  model: string;
  effort: Effort;
  system_prompt?: string;
  messages: AiMessage[];
  agent_mode: boolean;
  tools_enabled: { github: boolean; secrets: boolean };
  auto_approve: boolean;
  secrets_api_url?: string;
}

export type AiStreamEvent =
  | { type: "run"; run_id: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call"; call_id: string; name: string; args: unknown; writes: boolean }
  | { type: "confirm_required"; call_id: string; name: string; args: unknown }
  | { type: "tool_result"; call_id: string; name: string; result: unknown; denied?: boolean }
  | { type: "step"; step: number; max_steps: number }
  | { type: "done"; reason: "complete" | "step_limit" | "stopped" }
  | { type: "error"; message: string };

export const EFFORT_STEPS: Record<Exclude<EffortLevel, "custom">, number> = { low: 3, medium: 8, high: 20 };
