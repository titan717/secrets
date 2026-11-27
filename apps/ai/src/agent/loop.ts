/**
 * Agent loop. agent_mode=false => one streamed completion without tools.
 * agent_mode=true => up to maxSteps model calls; each step streams text/reasoning, then executes tool calls.
 * Write tools pause for confirmation unless auto_approve.
 */
import { EFFORT_STEPS, type AiChatRequest, type AiStreamEvent, type Effort } from "../contract.js";
import { ProviderError, type ChatProvider, type ConvMessage } from "../providers/types.js";
import { selectTools, truncateResult, ToolError, type Tool, type ToolContext } from "../tools/index.js";
import type { Run } from "./runs.js";

export function maxStepsFor(effort: Effort): number {
  if (effort.level === "custom") {
    const n = Number(effort.maxSteps);
    return Number.isFinite(n) && n >= 1 ? Math.min(100, Math.floor(n)) : EFFORT_STEPS.medium;
  }
  return EFFORT_STEPS[effort.level] ?? EFFORT_STEPS.medium;
}

const AGENT_SYSTEM = `You are the Secrets assistant. Use the available tools when they help; call read-only tools freely.
Write tools (create_branch, commit_file, open_issue, open_pr, draft_message) may require the user's approval — if a call is denied, do not retry it; explain and continue.
draft_message only prepares a draft; never claim a message was sent. Be concise.`;

export interface LoopInput {
  req: AiChatRequest;
  provider: ChatProvider;
  apiKey: string;
  ctx: Omit<ToolContext, "signal">;
  run: Run;
  emit: (e: AiStreamEvent) => void;
}

export async function runAgent({ req, provider, apiKey, ctx, run, emit }: LoopInput): Promise<void> {
  const signal = run.signal;
  const { tools, notes } = req.agent_mode ? selectTools(req, ctx) : { tools: [] as Tool[], notes: [] as string[] };
  const byName = new Map(tools.map((t) => [t.name, t]));

  const system = [req.agent_mode ? AGENT_SYSTEM : "", req.system_prompt ?? "", ...notes].filter(Boolean).join("\n\n");
  const messages: ConvMessage[] = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    ...req.messages.map((m) => (m.role === "assistant" ? { role: "assistant" as const, content: m.content } : { role: m.role, content: m.content })),
  ];

  const maxSteps = req.agent_mode ? maxStepsFor(req.effort) : 1;
  const toolCtx: ToolContext = { ...ctx, signal };

  try {
    for (let step = 1; step <= maxSteps; step++) {
      if (signal.aborted) return emit({ type: "done", reason: "stopped" });
      if (req.agent_mode) emit({ type: "step", step, max_steps: maxSteps });

      let text = "";
      let providerData: unknown;
      let finish: string | undefined;
      const calls: { id: string; name: string; args: Record<string, unknown> }[] = [];
      for await (const c of provider.stream({ apiKey, model: req.model, effort: req.effort, messages, tools: tools.length ? tools : undefined, signal })) {
        if (c.type === "text") {
          text += c.delta;
          emit({ type: "text", delta: c.delta });
        } else if (c.type === "reasoning") emit({ type: "reasoning", delta: c.delta });
        else if (c.type === "tool_call") calls.push(c.call);
        else if (c.type === "finish") {
          providerData = c.providerData;
          finish = c.reason;
        }
      }
      if (signal.aborted) return emit({ type: "done", reason: "stopped" });
      if (!calls.length && finish === "length") emit({ type: "text", delta: "\n\n_(Response cut off: the model reached its output token limit.)_" });
      if (!calls.length && finish === "content_filter" && !text) emit({ type: "text", delta: "_(The provider's content filter blocked this response.)_" });
      if (!calls.length && !text && finish !== "content_filter") emit({ type: "text", delta: "_(The model returned an empty response.)_" });

      messages.push({ role: "assistant", content: text, toolCalls: calls.length ? calls : undefined, providerData });
      if (!calls.length) return emit({ type: "done", reason: "complete" });

      for (const call of calls) {
        if (signal.aborted) return emit({ type: "done", reason: "stopped" });
        const tool = byName.get(call.name);
        emit({ type: "tool_call", call_id: call.id, name: call.name, args: call.args, writes: tool?.writes ?? false });
        if (!tool) {
          const result = { error: `Unknown tool "${call.name}". Available: ${[...byName.keys()].join(", ") || "none"}` };
          emit({ type: "tool_result", call_id: call.id, name: call.name, result });
          messages.push({ role: "tool", callId: call.id, name: call.name, result });
          continue;
        }
        if (tool.writes && !req.auto_approve) {
          emit({ type: "confirm_required", call_id: call.id, name: call.name, args: call.args });
          const { approve, reason } = await run.waitForConfirm(call.id);
          if (reason === "stopped" || signal.aborted) return emit({ type: "done", reason: "stopped" });
          if (!approve) {
            const result = { error: reason === "timeout" ? "No approval within 5 minutes; the action was not performed." : "The user denied this action; it was not performed." };
            emit({ type: "tool_result", call_id: call.id, name: call.name, result, denied: true });
            messages.push({ role: "tool", callId: call.id, name: call.name, result });
            continue;
          }
        }
        let result: unknown;
        try {
          result = truncateResult(await tool.run(call.args ?? {}, toolCtx));
        } catch (e) {
          if (signal.aborted) return emit({ type: "done", reason: "stopped" });
          result = { error: e instanceof ToolError ? e.message : `Tool ${call.name} failed: ${(e as Error).message}` };
        }
        emit({ type: "tool_result", call_id: call.id, name: call.name, result });
        messages.push({ role: "tool", callId: call.id, name: call.name, result });
      }
    }
    emit({ type: "done", reason: "step_limit" });
  } catch (e) {
    if (signal.aborted) return emit({ type: "done", reason: "stopped" });
    const message = e instanceof ProviderError || (e as Error)?.name === "StreamStallError" ? (e as Error).message : `Unexpected error: ${(e as Error).message}`;
    emit({ type: "error", message });
  }
}
