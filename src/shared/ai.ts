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
/** Five presets plus custom. instant = no reasoning, max 2 steps, prefers a fast model. */
export type EffortLevel = "instant" | "low" | "medium" | "high" | "ultra" | "custom";
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
  | { type: "error"; message: string }
  // ---- Additive (amendment 1): clients may ignore ----
  /** Lets the UI show "Thought for N seconds". */
  | { type: "thinking.summary"; seconds: number }
  /** Tool / agent progress label, e.g. "Searching the web…". */
  | { type: "activity"; label: string }
  | { type: "usage.update"; tokens: { input: number; output: number }; costEstimate: number; percentUsed?: number };

export type EffortPreset = Exclude<EffortLevel, "custom">;
export const EFFORT_LEVELS: readonly EffortPreset[] = ["instant", "low", "medium", "high", "ultra"];
export const EFFORT_STEPS: Record<EffortPreset, number> = { instant: 2, low: 4, medium: 10, high: 20, ultra: 40 };
/** Provider reasoning effort per preset ("none" = reasoning off). */
export const EFFORT_REASONING: Record<EffortPreset, "none" | "low" | "medium" | "high" | "max"> = {
  instant: "none",
  low: "low",
  medium: "medium",
  high: "high",
  ultra: "max",
};

// ============================================================================
// ai.secrets bridge v2 resources used by the AI section (amendment 2).
// All routes require `Authorization: Bearer <bridge token>`.
//
//   GET/POST/PATCH/DELETE /v1/projects[/:id]
//   GET    /v1/usage
//   GET/POST/DELETE       /v1/memory[/:id]
//   GET/POST/DELETE       /v1/connections[/:id]   (+ PATCH enable/disable, POST /:id/test)
//   POST   /v1/sessions/:id/share   DELETE /v1/shares/:id
//   GET    /v1/sessions?project=&q=
//   GET    /v1/upcoming
// ============================================================================

export interface AiProject {
  id: string;
  name: string;
  workspace: string;
  repo: string;
  systemPrompt: string;
  defaultModel: string;
  createdAt: string;
  updatedAt: string;
}
export type AiProjectInput = Pick<AiProject, "name" | "workspace" | "repo" | "systemPrompt" | "defaultModel">;

export interface AiUsageRow { tokensIn: number; tokensOut: number; cost: number }
export interface AiUsageBudget { kind: "tokens" | "usd"; amount: number; period: "day" | "month" }
export interface AiUsageSummary extends AiUsageRow {
  perModel: (AiUsageRow & { model: string })[];
  perDay: (AiUsageRow & { date: string })[];
  budget: AiUsageBudget | null;
  /** 0–100 against the budget for the current period; null without a budget. */
  percentUsed: number | null;
}

export interface AiMemoryFact {
  id: string;
  text: string;
  /** assistant = proposed by the assistant, then confirmed by the user. */
  source: "user" | "assistant";
  status: "proposed" | "approved";
  sessionId?: string;
  createdAt: string;
}

export type AiConnectionKind = "github" | "secrets" | "custom";
export interface AiConnection {
  id: string;
  kind: AiConnectionKind;
  name: string;
  enabled: boolean;
  status: "connected" | "error" | "untested" | "disabled";
  /** custom MCP: remote URL or local command */
  url?: string;
  command?: string;
  message?: string;
  lastTestedAt?: string;
}

export interface AiShareLink {
  id: string;
  sessionId: string;
  title: string;
  url: string;
  createdAt: string;
  revokedAt?: string;
}

export interface AiUpcomingTask {
  id: string;
  title: string;
  prompt: string;
  runAt: string;
  status: "scheduled" | "queued" | "running" | "done" | "failed" | "cancelled";
  projectId?: string;
  sessionId?: string;
}
