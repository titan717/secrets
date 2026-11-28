import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button, Modal, TextArea } from "../../ui";
import { useAiChats } from "../../lib/ai/chats";
import { useAiRuns, sendMessage, stopChat } from "../../lib/ai/runner";
import { Composer } from "./Composer";
import { AssistantMessage } from "./Message";
import { PlusMenu } from "./PlusMenu";
import "../../styles/ai.css";

export { MASCOT } from "./mascot";

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

export function AiThread({ chatId, compact, onCustomEffort }: { chatId: string; compact?: boolean; onCustomEffort: () => void }) {
  const chat = useAiChats((s) => s.chats.find((c) => c.id === chatId));
  const live = useAiRuns((s) => !!s.live[chatId]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const items = chat?.items ?? [];
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  useEffect(() => {
    stick.current = true;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatId]);

  if (!chat) return null;

  return (
    <div className={`g-thread ${compact ? "is-compact" : ""}`}>
      <div
        className="g-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          stick.current = near;
          if (near !== atBottom) setAtBottom(near);
        }}
      >
        <div className="g-msgs">
          {chat.incognito && <div className="g-incog-pill">Incognito · not saved</div>}
          {items.map((it) =>
            it.kind === "user" ? (
              <div key={it.id} className="g-user">
                <div className="g-bubble">{it.text}</div>
              </div>
            ) : (
              <AssistantMessage key={it.id} item={it} chatId={chatId} />
            ),
          )}
        </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          className="g-jump"
          aria-label="Scroll to latest"
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }}
        >
          <ArrowDown size={20} />
        </button>
      )}
      <Composer
        live={live}
        compact={compact}
        autoFocusKey={chatId}
        onSend={(t) => void sendMessage(chatId, t)}
        onStop={() => void stopChat(chatId)}
        onCustomEffort={onCustomEffort}
        plusMenu={(close) => <PlusMenu chatId={chatId} close={close} onInstructions={() => setPromptOpen(true)} />}
      />
      <SystemPromptModal chatId={chatId} open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  );
}

