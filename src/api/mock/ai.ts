/**
 * Keyless AI demo: streams a short answer, runs a fake read tool, then asks for
 * approval before a write action. It mirrors the ai.secrets SSE contract, so
 * switching to the real service only changes the transport.
 */
import type { AiChatRequest, AiStreamEvent } from "@shared";
import { uuid } from "../../lib/id";

interface Pending {
  callId: string;
  resolve: (approve: boolean) => void;
}

const pending = new Map<string, Pending>();

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

function waitForApproval(runId: string, callId: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(runId);
      resolve(false);
    }, 90_000);
    const done = (approve: boolean) => {
      clearTimeout(timer);
      pending.delete(runId);
      resolve(approve);
    };
    pending.set(runId, { callId, resolve: done });
    signal.addEventListener(
      "abort",
      () => {
        const p = pending.get(runId);
        if (p) p.resolve(false);
        pending.delete(runId);
        resolve(false);
      },
      { once: true },
    );
  });
}

export function mockConfirm(runId: string, callId: string, approve: boolean): void {
  const p = pending.get(runId);
  if (p && p.callId === callId) p.resolve(approve);
}

export function mockStop(runId: string): void {
  const p = pending.get(runId);
  if (p) p.resolve(false);
  pending.delete(runId);
}

const OPENERS = [
  "Here’s how I’d think about it.",
  "Good one. Let me sketch an answer.",
  "I can help with that.",
  "Let’s make this simple.",
];

const CLOSERS = [
  "Want me to turn this into a message or a checklist?",
  "I can draft something you can send, if you like.",
  "Tell me which part to go deeper on.",
  "Say the word and I’ll take the next step.",
];

export async function* mockChatStream(body: AiChatRequest, signal: AbortSignal): AsyncGenerator<AiStreamEvent> {
  const runId = uuid();
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
  const topic = lastUser.length > 90 ? `${lastUser.slice(0, 87)}…` : lastUser || "your question";
  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  const closer = CLOSERS[Math.floor(Math.random() * CLOSERS.length)];

  yield { type: "run", run_id: runId };
  yield { type: "reasoning", delta: `Reading “${topic}” and checking what context is available.` };
  await sleep(380, signal);
  if (signal.aborted) {
    yield { type: "done", reason: "stopped" };
    return;
  }

  const answer = `${opener}\n\n${topic.endsWith("?") ? "Short answer: yes — and the details matter more than the headline." : "The short version: start with the smallest version that feels good, then let it grow."} I’d keep one clear goal, remove anything that doesn’t serve it, and give yourself a deadline you can actually keep.\n\n${closer}`;

  for (const word of answer.split(/(\s+)/)) {
    if (signal.aborted) {
      yield { type: "done", reason: "stopped" };
      return;
    }
    if (!word) continue;
    yield { type: "text", delta: word };
    await sleep(word.trim() ? 18 + Math.random() * 22 : 4, signal);
  }

  if (body.agent_mode) {
    const maxSteps = body.effort.maxSteps ?? 8;
    await sleep(320, signal);
    if (signal.aborted) {
      yield { type: "done", reason: "stopped" };
      return;
    }
    yield { type: "step", step: 1, max_steps: maxSteps };

    const searchId = uuid();
    const searchArgs = { query: topic.slice(0, 64) };
    yield { type: "tool_call", call_id: searchId, name: "search_secrets", args: searchArgs, writes: false };
    await sleep(650, signal);
    if (signal.aborted) {
      yield { type: "done", reason: "stopped" };
      return;
    }
    yield {
      type: "tool_result",
      call_id: searchId,
      name: "search_secrets",
      result: { matches: 3, summary: "Found related messages in Night Owls and Weekend crew." },
    };

    if (body.tools_enabled.secrets) {
      await sleep(280, signal);
      if (signal.aborted) {
        yield { type: "done", reason: "stopped" };
        return;
      }
      yield { type: "step", step: 2, max_steps: maxSteps };
      const writeId = uuid();
      const writeArgs = {
        to: "Maya",
        text: "Quick thought from our chat: keep the soft glow, sharpen the type, and ship the smaller version on Friday.",
      };
      yield { type: "tool_call", call_id: writeId, name: "draft_message", args: writeArgs, writes: true };
      yield { type: "confirm_required", call_id: writeId, name: "draft_message", args: writeArgs };

      const approved = body.auto_approve ? true : await waitForApproval(runId, writeId, signal);
      if (signal.aborted) {
        yield { type: "done", reason: "stopped" };
        return;
      }
      yield {
        type: "tool_result",
        call_id: writeId,
        name: "draft_message",
        result: approved ? { drafted: true, to: "Maya", chars: 118 } : { drafted: false, reason: "You didn’t approve the draft." },
        denied: !approved,
      };
      await sleep(220, signal);
      const tail = approved
        ? "I put that draft in your notes — you can edit it before sending."
        : "I didn’t send anything. The draft is ready whenever you want it.";
      for (const word of tail.split(/(\s+)/)) {
        if (signal.aborted) {
          yield { type: "done", reason: "stopped" };
          return;
        }
        if (word) yield { type: "text", delta: word };
        await sleep(16, signal);
      }
    }
  }

  yield { type: "done", reason: signal.aborted ? "stopped" : "complete" };
}
