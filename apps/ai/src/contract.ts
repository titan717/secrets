/**
 * Copied verbatim from titan717/api.secrets packages/shared/src/ai.ts (+ the MessageView /
 * MessageBody shapes from types.ts / envelope.ts). This repo is standalone; keep shapes identical.
 *
 * POST {AI_URL}/v1/chat  (SSE response, text/event-stream)
 *   headers: x-provider-key, x-github-token (optional), x-secrets-token (optional)
 *   body: AiChatRequest
 *   events: `data: <AiStreamEvent JSON>\n\n`
 * POST {AI_URL}/v1/chat/:runId/confirm  body { call_id, approve }  -> resumes a paused agent run
 * POST {AI_URL}/v1/chat/:runId/stop     -> aborts the run
 * GET  {AI_URL}/v1/models?provider=gemini|openrouter|mock  (header x-provider-key) -> { models: {id,name}[] }
 */
/** "mock" = demo provider, no key required (streams canned replies, exercises tools + confirm). */
export type AiProvider = "gemini" | "openrouter" | "mock";
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

/* ---- subset of packages/shared/src/types.ts + envelope.ts used by the Secrets tools ---- */
export interface Reaction { emoji: string; user_ids: string[] }
export interface MessageView {
  id: string;
  conversation_id: string;
  sender_id: string;
  device_id: string;
  ciphertext: string;
  nonce: string | null;
  created_at: string;
  client_msg_id: string;
  reactions: Reaction[];
  edited_at?: string | null;
  deleted?: boolean;
}
export interface Attachment { id: string; url: string; mime: string; width?: number; height?: number; size: number; name?: string }
export interface MessageBody { text?: string; reply_to?: string | null; attachments?: Attachment[]; kind?: "text" | "system" }
export interface User { id: string; username: string; display_name: string; about: string; avatar_url: string | null; accent: string | null; created_at: string }
export interface Channel { id: string; dock_id: string; name: string; topic: string; position: number }
export interface Dock { id: string; name: string; handle: string; description: string; channels: Channel[]; [k: string]: unknown }
export interface DockMember { user: User; role: string; joined_at: string }
export interface Conversation { id: string; kind: "dm" | "group" | "channel"; title: string | null; dock_id: string | null; members: User[]; [k: string]: unknown }

/** PROTOTYPE: ciphertext holds plaintext JSON (see envelope.ts openBody). */
export function openBody(env: Pick<MessageView, "ciphertext" | "nonce">): MessageBody {
  try {
    return JSON.parse(env.ciphertext) as MessageBody;
  } catch {
    return { text: env.ciphertext };
  }
}
