import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Eraser, ScrollText, Settings2, Square } from "lucide-react";
import { Button, IconButton, Modal, TextArea } from "../../ui";
import { useAiChats } from "../../lib/ai/chats";
import { useAiRuns, sendMessage, stopChat } from "../../lib/ai/runner";
import { PROVIDER_LABEL, currentModel, useAiSettings } from "../../lib/ai/settings";
import { useSettings } from "../../stores/settings";
import { AssistantBody } from "./Parts";
import "../../styles/ai.css";

export const MASCOT = "/ghost-128.png";

const SUGGESTIONS = [
  "Summarize my latest conversation",
  "Draft a friendly reply to say I'll be late",
  "What can you do with tools?",
  "Explain end-to-end encryption simply",
];

const PROMPT_PRESETS = [
  { label: "Concise", text: "Be concise. Prefer short bullet points. No preamble." },
  { label: "Friendly", text: "You are a warm, upbeat assistant. Keep answers clear and human." },
  { label: "Engineer", text: "You are a senior software engineer. Give precise, working code and explain trade-offs briefly." },
];

export function SystemPromptModal({ chatId, open, onClose }: { chatId: string; open: boolean; onClose: () => void }) {
  const chat = useAiChats((s) => s.chats.find((c) => c.id === chatId));
  const setPrompt = useAiChats((s) => s.setSystemPrompt);
  const [draft, setDraft] = useState(chat?.systemPrompt ?? "");
  useEffect(() => {
    if (open) setDraft(chat?.systemPrompt ?? "");
  }, [open, chat?.systemPrompt]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="System prompt"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setPrompt(chatId, draft);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="muted ai-small">Instructions for this chat only. Leave empty for the default assistant.</p>
      <div className="chips">
        {PROMPT_PRESETS.map((p) => (
          <button key={p.label} type="button" className={`chip ${draft === p.text ? "is-active" : ""}`} onClick={() => setDraft(p.text)}>
            {p.label}
          </button>
        ))}
      </div>
      <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} placeholder="You are a helpful assistant…" autoFocus />
    </Modal>
  );
}

function Composer({ chatId, live, compact }: { chatId: string; live: boolean; compact?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const enterToSend = useSettings((s) => s.enterToSend);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    ref.current?.focus();
  }, [chatId]);

  const send = () => {
    const t = text.trim();
    if (!t || live) return;
    setText("");
    void sendMessage(chatId, t);
  };

  return (
    <form
      className={`ai-composer ${compact ? "is-compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder="Ask anything…"
        aria-label="Message the assistant"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && (enterToSend ? !e.shiftKey : e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      {live ? (
        <IconButton label="Stop" variant="danger" type="button" onClick={() => void stopChat(chatId)} className="ai-send">
          <Square size={14} fill="currentColor" />
        </IconButton>
      ) : (
        <IconButton label="Send" variant="accent" type="submit" disabled={!text.trim()} className="ai-send">
          <ArrowUp size={18} />
        </IconButton>
      )}
    </form>
  );
}

export function AiThread({ chatId, compact, leading, actions, onOpenSettings }: { chatId: string; compact?: boolean; leading?: ReactNode; actions?: ReactNode; onOpenSettings: () => void }) {
  const chat = useAiChats((s) => s.chats.find((c) => c.id === chatId));
  const clear = useAiChats((s) => s.clear);
  const live = useAiRuns((s) => !!s.live[chatId]);
  const provider = useAiSettings((s) => s.provider);
  const model = useAiSettings(currentModel);
  const agent = useAiSettings((s) => s.agentMode);
  const [promptOpen, setPromptOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const items = chat?.items ?? [];
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  if (!chat) return null;

  return (
    <div className={`ai-thread ${compact ? "is-compact" : ""}`}>
      <header className="ai-thread-head">
        {leading}
        <img src={MASCOT} alt="" className="ai-head-ghost" width={34} height={34} />
        <div className="grow">
          <div className="ai-thread-title truncate">{chat.title}</div>
          <button type="button" className="ai-model-chip" onClick={onOpenSettings} title="Change model">
            <span className="truncate">
              {PROVIDER_LABEL[provider]} · {model}
            </span>
            {agent && <span className="ai-agent-dot">Agent</span>}
          </button>
        </div>
        <IconButton label="System prompt" onClick={() => setPromptOpen(true)} active={!!chat.systemPrompt}>
          <ScrollText size={18} />
        </IconButton>
        {!compact && items.length > 0 && (
          <IconButton label="Clear chat" onClick={() => clear(chatId)} disabled={live}>
            <Eraser size={18} />
          </IconButton>
        )}
        <IconButton label="AI settings" onClick={onOpenSettings}>
          <Settings2 size={18} />
        </IconButton>
        {actions}
      </header>

      <div
        className="ai-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {items.length === 0 ? (
          <div className="ai-empty">
            <img src="/ghost.webp" alt="" className="ghost ghost-float" width={compact ? 92 : 128} />
            <h2>How can I help?</h2>
            <p className="muted">
              {provider === "mock" ? "You’re on the Mock provider — a keyless demo. Add a Gemini or OpenRouter key in settings for real answers." : "Ask a question, or let the agent use your Secrets and GitHub tools."}
            </p>
            <div className="ai-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void sendMessage(chatId, s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-msgs">
            {items.map((it) =>
              it.kind === "user" ? (
                <div key={it.id} className="ai-msg ai-msg-user">
                  <div className="ai-bubble">{it.text}</div>
                </div>
              ) : (
                <div key={it.id} className="ai-msg ai-msg-bot">
                  <img src={MASCOT} alt="" className="ai-avatar" width={28} height={28} />
                  <AssistantBody item={it} chatId={chatId} />
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <Composer chatId={chatId} live={live} compact={compact} />
      <SystemPromptModal chatId={chatId} open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  );
}
