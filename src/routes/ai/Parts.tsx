import { useState } from "react";
import { AlertTriangle, Brain, Check, ChevronDown, CircleSlash, Hammer, Loader2, PenLine, ShieldAlert, X } from "lucide-react";
import { Button } from "../../ui";
import { Markdown } from "../../lib/ai/markdown";
import type { AssistantItem, AssistantPart } from "../../lib/ai/chats";
import { answerConfirm } from "../../lib/ai/runner";
import { toast } from "../../stores/toast";
import { toolLabel } from "../../lib/ai/tools";

type ToolPart = Extract<AssistantPart, { type: "tool" }>;

export { toolLabel };

function pretty(v: unknown): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function argSummary(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const entries = Object.entries(args as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ")
    .slice(0, 140);
}

export function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ai-reason ${open ? "is-open" : ""}`}>
      <button type="button" className="ai-reason-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Brain size={14} />
        <span>{live ? "Thinking…" : "Reasoning"}</span>
        <span className="faint">{Math.max(1, Math.round(text.split(/\s+/).length))} words</span>
        <ChevronDown size={14} className={`chev ${open ? "is-down" : ""}`} />
      </button>
      {open && <div className="ai-reason-body">{text}</div>}
    </div>
  );
}

export function ToolCard({ part, chatId, live }: { part: ToolPart; chatId: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const done = part.result !== undefined;
  const pending = part.confirm === "pending" && live;
  const state = part.denied || part.confirm === "denied" ? "denied" : done ? "done" : pending ? "confirm" : live ? "running" : "idle";

  const answer = async (approve: boolean) => {
    setBusy(approve ? "approve" : "deny");
    try {
      await answerConfirm(chatId, part.call_id, approve);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const errored = done && typeof part.result === "object" && part.result !== null && "error" in (part.result as object);

  return (
    <div className={`ai-tool is-${state} ${part.writes ? "is-write" : ""}`}>
      <button type="button" className="ai-tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="ai-tool-ico">
          {state === "running" ? <Loader2 size={14} className="spin" /> : state === "denied" ? <CircleSlash size={14} /> : state === "confirm" ? <ShieldAlert size={14} /> : errored ? <AlertTriangle size={14} /> : part.writes ? <PenLine size={14} /> : <Hammer size={14} />}
        </span>
        <span className="ai-tool-name">{toolLabel(part.name)}</span>
        <span className="ai-tool-args faint truncate">{argSummary(part.args)}</span>
        <span className="ai-tool-state">{state === "denied" ? "Denied" : state === "confirm" ? "Needs approval" : state === "running" ? "Running" : errored ? "Failed" : done ? "Done" : ""}</span>
        <ChevronDown size={14} className={`chev ${open ? "is-down" : ""}`} />
      </button>
      {(open || pending) && (
        <div className="ai-tool-body">
          <div className="ai-tool-label">Arguments</div>
          <pre>{pretty(part.args) || "{}"}</pre>
          {done && open && (
            <>
              <div className="ai-tool-label">Result</div>
              <pre className="ai-tool-result">{pretty(part.result)}</pre>
            </>
          )}
        </div>
      )}
      {pending && (
        <div className="ai-confirm">
          <p>
            <ShieldAlert size={15} /> The assistant wants to <strong>{toolLabel(part.name).toLowerCase()}</strong>. Allow it?
          </p>
          <div className="row">
            <Button size="sm" variant="secondary" icon={<X size={15} />} loading={busy === "deny"} disabled={!!busy} onClick={() => answer(false)}>
              Deny
            </Button>
            <Button size="sm" icon={<Check size={15} />} loading={busy === "approve"} disabled={!!busy} onClick={() => answer(true)}>
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AssistantBody({ item, chatId }: { item: AssistantItem; chatId: string }) {
  const live = item.status === "streaming";
  const lastIdx = item.parts.length - 1;
  const showDots = live && (lastIdx < 0 || item.parts[lastIdx].type === "tool");
  return (
    <div className="ai-assistant">
      {item.parts.map((p, i) =>
        p.type === "text" ? (
          <Markdown key={i} text={p.text} className={live && i === lastIdx ? "is-streaming" : ""} />
        ) : p.type === "reasoning" ? (
          <Reasoning key={i} text={p.text} live={live && i === lastIdx} />
        ) : (
          <ToolCard key={p.call_id} part={p} chatId={chatId} live={live} />
        ),
      )}
      {showDots && (
        <div className="ai-typing" aria-label="Assistant is working">
          <i />
          <i />
          <i />
          {item.step && item.step.step > 1 && <span className="faint">Step {item.step.step} of {item.step.max_steps}</span>}
        </div>
      )}
      {item.status === "stopped" && <div className="ai-note">Stopped.</div>}
      {item.note && <div className="ai-note">{item.note}</div>}
      {item.status === "error" && (
        <div className="ai-error" role="alert">
          <AlertTriangle size={15} />
          <span>{item.error || "Something went wrong."}</span>
        </div>
      )}
    </div>
  );
}
