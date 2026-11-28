import { create } from "zustand";
import type { AiChatRequest, AiMessage, AiStreamEvent } from "@shared";
import { apiBase } from "../../config";
import { uuid } from "../id";
import { getToken } from "../../stores/session";
import { useAiChats, getChat, type AssistantItem, type AssistantPart } from "./chats";
import { useAiSettings, currentKey, currentModel, effortOf } from "./settings";
import { confirmCall, stopRun, streamChat } from "./client";

interface Live {
  itemId: string;
  runId?: string;
  ctrl: AbortController;
}

/** In-memory registry of running streams, keyed by AI chat id. */
export const useAiRuns = create<{ live: Record<string, Live> }>(() => ({ live: {} }));

const setLive = (chatId: string, l: Live | null) => {
  const live = { ...useAiRuns.getState().live };
  if (l) live[chatId] = l;
  else delete live[chatId];
  useAiRuns.setState({ live });
};

function historyOf(chatId: string): AiMessage[] {
  const chat = getChat(chatId);
  if (!chat) return [];
  const out: AiMessage[] = [];
  for (const it of chat.items) {
    if (it.kind === "user") out.push({ role: "user", content: it.text });
    else {
      const text = it.parts
        .filter((p): p is Extract<AssistantPart, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("")
        .trim();
      if (text) out.push({ role: "assistant", content: text });
    }
  }
  return out;
}

function apply(it: AssistantItem, ev: AiStreamEvent): AssistantItem {
  const parts = [...it.parts];
  const last = parts[parts.length - 1];
  switch (ev.type) {
    case "run":
      return { ...it, run_id: ev.run_id };
    case "text":
    case "reasoning": {
      if (last && last.type === ev.type) parts[parts.length - 1] = { ...last, text: last.text + ev.delta };
      else parts.push({ type: ev.type, text: ev.delta });
      return { ...it, parts };
    }
    case "tool_call":
      if (parts.some((p) => p.type === "tool" && p.call_id === ev.call_id)) return it;
      parts.push({ type: "tool", call_id: ev.call_id, name: ev.name, args: ev.args, writes: ev.writes });
      return { ...it, parts };
    case "confirm_required": {
      const i = parts.findIndex((p) => p.type === "tool" && p.call_id === ev.call_id);
      if (i < 0) parts.push({ type: "tool", call_id: ev.call_id, name: ev.name, args: ev.args, writes: true, confirm: "pending" });
      else parts[i] = { ...(parts[i] as Extract<AssistantPart, { type: "tool" }>), confirm: "pending" };
      return { ...it, parts };
    }
    case "tool_result": {
      const i = parts.findIndex((p) => p.type === "tool" && p.call_id === ev.call_id);
      const prev = i >= 0 ? (parts[i] as Extract<AssistantPart, { type: "tool" }>) : null;
      const next: AssistantPart = {
        type: "tool",
        call_id: ev.call_id,
        name: ev.name,
        args: prev?.args ?? {},
        writes: prev?.writes ?? false,
        result: ev.result,
        denied: ev.denied,
        confirm: prev?.confirm === "pending" ? (ev.denied ? "denied" : "approved") : prev?.confirm,
      };
      if (i >= 0) parts[i] = next;
      else parts.push(next);
      return { ...it, parts };
    }
    case "step":
      return { ...it, step: { step: ev.step, max_steps: ev.max_steps } };
    case "done":
      return {
        ...it,
        status: ev.reason === "stopped" ? "stopped" : "done",
        note: ev.reason === "step_limit" ? "Stopped at the step limit — raise effort or max steps to let the agent go further." : it.note,
      };
    case "error":
      return { ...it, status: "error", error: ev.message };
    default:
      return it;
  }
}

export async function sendMessage(chatId: string, text: string) {
  const store = useAiChats.getState();
  if (useAiRuns.getState().live[chatId]) return;
  const chat = getChat(chatId);
  if (!chat) return;
  const s = useAiSettings.getState();

  store.addItem(chatId, { kind: "user", id: uuid(), text, at: new Date().toISOString() });
  const itemId = uuid();
  store.addItem(chatId, { kind: "assistant", id: itemId, at: new Date().toISOString(), parts: [], status: "streaming" });

  const ctrl = new AbortController();
  setLive(chatId, { itemId, ctrl });
  const patch = (fn: (it: AssistantItem) => AssistantItem) => useAiChats.getState().patchAssistant(chatId, itemId, fn);

  if (s.provider !== "mock" && !currentKey(s)) {
    patch((it) => ({ ...it, status: "error", error: `Add your ${s.provider === "gemini" ? "Gemini" : "OpenRouter"} API key in AI settings, or switch to the Mock provider.` }));
    setLive(chatId, null);
    return;
  }

  const body: AiChatRequest = {
    provider: s.provider,
    model: currentModel(s),
    effort: effortOf(s),
    system_prompt: chat.systemPrompt.trim() || undefined,
    messages: historyOf(chatId),
    agent_mode: s.agentMode,
    tools_enabled: { github: s.tools.github && !!s.githubToken, secrets: s.tools.secrets },
    auto_approve: s.autoApprove,
    secrets_api_url: apiBase(),
  };

  // Batch text deltas to one store write per animation frame.
  let pending: AiStreamEvent[] = [];
  let raf = 0;
  const flush = () => {
    raf = 0;
    const evs = pending;
    pending = [];
    if (evs.length) patch((it) => evs.reduce(apply, it));
  };

  try {
    for await (const ev of streamChat(body, { providerKey: currentKey(s), githubToken: s.tools.github ? s.githubToken : "", secretsToken: getToken() }, ctrl.signal)) {
      if (ev.type === "run") {
        const l = useAiRuns.getState().live[chatId];
        if (l) setLive(chatId, { ...l, runId: ev.run_id });
      }
      pending.push(ev);
      if (ev.type === "text" || ev.type === "reasoning") {
        if (!raf) raf = requestAnimationFrame(flush);
      } else {
        if (raf) cancelAnimationFrame(raf);
        flush();
      }
    }
    if (raf) cancelAnimationFrame(raf);
    flush();
    patch((it) => (it.status === "streaming" ? { ...it, status: ctrl.signal.aborted ? "stopped" : "done" } : it));
  } catch (e) {
    if (raf) cancelAnimationFrame(raf);
    flush();
    patch((it) => ({ ...it, status: "error", error: (e as Error).message }));
  } finally {
    patch((it) => ({
      ...it,
      parts: it.parts.map((p) => (p.type === "tool" && p.confirm === "pending" ? { ...p, confirm: "denied" as const } : p)),
    }));
    setLive(chatId, null);
  }
}

export async function stopChat(chatId: string) {
  const l = useAiRuns.getState().live[chatId];
  if (!l) return;
  if (l.runId) await stopRun(l.runId);
  l.ctrl.abort();
  useAiChats.getState().patchAssistant(chatId, l.itemId, (it) => (it.status === "streaming" ? { ...it, status: "stopped" } : it));
}

export async function answerConfirm(chatId: string, callId: string, approve: boolean) {
  const l = useAiRuns.getState().live[chatId];
  if (!l?.runId) throw new Error("This run has already ended.");
  const set = (confirm: "pending" | "approved" | "denied") =>
    useAiChats.getState().patchAssistant(chatId, l.itemId, (it) => ({
      ...it,
      parts: it.parts.map((p) => (p.type === "tool" && p.call_id === callId ? { ...p, confirm } : p)),
    }));
  set(approve ? "approved" : "denied");
  try {
    await confirmCall(l.runId, callId, approve);
  } catch (e) {
    set("pending");
    throw e;
  }
}
