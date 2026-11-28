import { useEffect, useState } from "react";
import { AlertTriangle, Bookmark, Check, ChevronRight, Copy, Info, MoreHorizontal, RotateCcw, Share2, ThumbsDown, ThumbsUp, Volume2, VolumeX, X } from "lucide-react";
import { Markdown } from "../../lib/ai/markdown";
import { assistantText, thoughtSeconds, useAiChats, type AssistantItem, type AssistantPart } from "../../lib/ai/chats";
import { regenerate, useAiRuns } from "../../lib/ai/runner";
import { useAiMemory } from "../../lib/ai/memory";
import { useAiShares } from "../../lib/ai/shares";
import { compact, usd } from "../../lib/ai/usage";
import { toolLabel } from "../../lib/ai/tools";
import { toast } from "../../stores/toast";
import { ToolCard } from "./Parts";
import { Popover, MenuItem } from "./Popover";

type ToolPart = Extract<AssistantPart, { type: "tool" }>;

export function useNow(active: boolean, every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Live status line: "Searching the web… 2s" + elapsed, driven by activity/tool/reasoning. */
function LiveStatus({ item }: { item: AssistantItem }) {
  const now = useNow(true);
  const last = item.parts[item.parts.length - 1];
  const runningTool = [...item.parts].reverse().find((p): p is ToolPart => p.type === "tool" && p.result === undefined);
  const act = item.activity?.[item.activity.length - 1];
  let label = "Working";
  let since = new Date(item.at).getTime();
  if (runningTool?.confirm === "pending") label = "Waiting for your approval";
  else if (act && (!last || last.type !== "text")) { label = act.label.replace(/…$/, ""); since = act.at; }
  else if (runningTool) label = toolLabel(runningTool.name);
  else if (last?.type === "reasoning") { label = "Thinking"; since = item.thinkStart ?? since; }
  else if (last?.type === "text") return null;
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <div className="g-live" aria-live="polite">
      <span className="g-live-label">{label}…</span>
      <span className="g-live-secs">{secs}s</span>
      {item.step && item.step.step > 1 && <span className="g-live-secs">· step {item.step.step}/{item.step.max_steps}</span>}
    </div>
  );
}

function Expander({ label, children, defaultOpen = false }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`g-exp ${open ? "is-open" : ""}`}>
      <button type="button" className="g-exp-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}
        <ChevronRight size={16} className="g-exp-chev" />
      </button>
      {open && <div className="g-exp-body">{children}</div>}
    </div>
  );
}

function MemoryCard({ chatId, item }: { chatId: string; item: AssistantItem }) {
  const add = useAiMemory((s) => s.add);
  const patch = useAiChats((s) => s.patchAssistant);
  const p = item.memoryProposal;
  if (!p || p.state === "dismissed") return null;
  const setState = (state: "saved" | "dismissed") => patch(chatId, item.id, (it) => ({ ...it, memoryProposal: { ...p, state } }));
  if (p.state === "saved")
    return (
      <div className="g-mem is-saved">
        <Check size={15} /> Saved to memory: <span className="g-mem-text">{p.text}</span>
      </div>
    );
  return (
    <div className="g-mem" role="group" aria-label="Memory suggestion">
      <Bookmark size={16} className="g-mem-ico" />
      <div className="grow">
        <div className="g-mem-q">Remember this?</div>
        <div className="g-mem-text">{p.text}</div>
      </div>
      <button type="button" className="g-chip-btn" onClick={() => setState("dismissed")}>
        <X size={14} /> Not now
      </button>
      <button
        type="button"
        className="g-chip-btn is-primary"
        onClick={() => {
          add(p.text, "assistant", chatId);
          setState("saved");
        }}
      >
        <Check size={14} /> Save
      </button>
    </div>
  );
}

function Actions({ chatId, item }: { chatId: string; item: AssistantItem }) {
  const patch = useAiChats((s) => s.patchAssistant);
  const createShare = useAiShares((s) => s.create);
  const live = useAiRuns((s) => !!s.live[chatId]);
  const [speaking, setSpeaking] = useState(false);
  const [more, setMore] = useState(false);
  const text = assistantText(item);

  useEffect(() => () => void (speaking && speechSynthesis.cancel()), [speaking]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn’t copy");
    }
  };
  const speak = () => {
    if (!("speechSynthesis" in window)) return toast.error("Read aloud isn’t supported here.");
    if (speaking) return speechSynthesis.cancel(), setSpeaking(false);
    const u = new SpeechSynthesisUtterance(text.replace(/[#*_`>|]/g, ""));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setSpeaking(true);
  };
  const share = async () => {
    try {
      const s = await createShare(chatId);
      await navigator.clipboard.writeText(s.url).catch(() => {});
      toast.success(s.local ? "Read-only link copied (works on this device until the bridge is on)" : "Read-only link copied");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const vote = (v: "up" | "down") => patch(chatId, item.id, (it) => ({ ...it, feedback: it.feedback === v ? undefined : v }));

  return (
    <div className="g-actions">
      <button type="button" aria-label="Copy" title="Copy" onClick={copy} disabled={!text}>
        <Copy size={19} />
      </button>
      <button type="button" aria-label="Good response" aria-pressed={item.feedback === "up"} title="Good response" className={item.feedback === "up" ? "is-on" : ""} onClick={() => vote("up")}>
        <ThumbsUp size={19} />
      </button>
      <button type="button" aria-label="Bad response" aria-pressed={item.feedback === "down"} title="Bad response" className={item.feedback === "down" ? "is-on" : ""} onClick={() => vote("down")}>
        <ThumbsDown size={19} />
      </button>
      <button type="button" aria-label={speaking ? "Stop reading" : "Read aloud"} title={speaking ? "Stop reading" : "Read aloud"} onClick={speak} disabled={!text}>
        {speaking ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      <button type="button" aria-label="Share" title="Share" onClick={share}>
        <Share2 size={19} />
      </button>
      <div className="g-plus-wrap">
        <button type="button" aria-label="More" title="More" data-popover-anchor onClick={() => setMore(!more)}>
          <MoreHorizontal size={19} />
        </button>
        <Popover open={more} onClose={() => setMore(false)} label="Message options" className="g-pop-msg">
          <MenuItem icon={<RotateCcw size={16} />} disabled={live} onClick={() => (setMore(false), void regenerate(chatId, item.id))}>
            Regenerate
          </MenuItem>
          <div className="g-pop-info">
            <Info size={14} />
            <span>
              {item.model ?? "model"}
              {item.usage && (
                <>
                  {" · "}
                  {compact(item.usage.input)} in / {compact(item.usage.output)} out · {usd(item.usage.cost)}
                  {item.usage.estimated ? " (est.)" : ""}
                </>
              )}
            </span>
          </div>
        </Popover>
      </div>
    </div>
  );
}

export function AssistantMessage({ item, chatId, readOnly }: { item: AssistantItem; chatId: string; readOnly?: boolean }) {
  const live = item.status === "streaming";
  const reasoning = item.parts.filter((p) => p.type === "reasoning").map((p) => (p as { text: string }).text).join("\n\n").trim();
  const tools = item.parts.filter((p): p is ToolPart => p.type === "tool");
  const pendingTools = tools.filter((t) => t.confirm === "pending" && live);
  const otherTools = tools.filter((t) => !(t.confirm === "pending" && live));
  const texts = item.parts.filter((p) => p.type === "text") as Extract<AssistantPart, { type: "text" }>[];
  const secs = thoughtSeconds(item);
  const lastText = texts[texts.length - 1];
  const activities = item.activity ?? [];

  return (
    <div className="g-bot">
      {live && <LiveStatus item={item} />}
      {!live && reasoning && secs !== null && (
        <Expander label={<span className="g-thought">Thought for {plural(secs, "second")}</span>}>
          <div className="g-reason">{reasoning}</div>
        </Expander>
      )}
      {live && reasoning && (
        <Expander label={<span className="g-thought">Thinking</span>}>
          <div className="g-reason">{reasoning}</div>
        </Expander>
      )}
      {(otherTools.length > 0 || activities.length > 0) && (
        <Expander label={<span className="g-thought">Activity{otherTools.length ? ` · ${plural(otherTools.length, "step")}` : ""}</span>}>
          <div className="g-activity">
            {otherTools.length === 0 &&
              activities.map((a, i) => (
                <div key={i} className="g-activity-row">
                  <span className="g-dot" /> {a.label}
                </div>
              ))}
            {otherTools.map((p) => (
              <ToolCard key={p.call_id} part={p} chatId={chatId} live={live} />
            ))}
          </div>
        </Expander>
      )}
      {pendingTools.map((p) => (
        <ToolCard key={p.call_id} part={p} chatId={chatId} live={live} />
      ))}
      {texts.map((p, i) => (
        <Markdown key={i} text={p.text} className={`g-md ${live && p === lastText ? "is-streaming" : ""}`} />
      ))}
      {item.status === "stopped" && <div className="g-note">Stopped.</div>}
      {item.note && <div className="g-note">{item.note}</div>}
      {item.status === "error" && (
        <div className="g-error" role="alert">
          <AlertTriangle size={16} />
          <span>{item.error || "Something went wrong."}</span>
        </div>
      )}
      {!live && !readOnly && item.status !== "error" && <Actions chatId={chatId} item={item} />}
      {!live && !readOnly && <MemoryCard chatId={chatId} item={item} />}
    </div>
  );
}
