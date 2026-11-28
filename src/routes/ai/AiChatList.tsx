import { useState } from "react";
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton } from "../../ui";
import { useAiChats, type AiChat } from "../../lib/ai/chats";
import { useAiRuns } from "../../lib/ai/runner";

function when(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 6 * 86_400_000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function preview(c: AiChat) {
  for (let i = c.items.length - 1; i >= 0; i--) {
    const it = c.items[i];
    if (it.kind === "user") return it.text;
    const t = [...it.parts].reverse().find((p) => p.type === "text");
    if (t && t.type === "text" && t.text.trim()) return t.text.replace(/[#*_`>]/g, "").trim();
  }
  return c.systemPrompt ? `Prompt: ${c.systemPrompt}` : "No messages yet";
}

export function AiChatList({ activeId, onPick, onNew }: { activeId: string | null; onPick: (id: string) => void; onNew: () => void }) {
  const chats = useAiChats((s) => s.chats);
  const remove = useAiChats((s) => s.remove);
  const rename = useAiChats((s) => s.rename);
  const live = useAiRuns((s) => s.live);
  const [editing, setEditing] = useState<string | null>(null);
  const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="ai-list">
      <Button block icon={<MessageSquarePlus size={17} />} onClick={onNew}>
        New AI chat
      </Button>
      <div className="ai-list-items">
        {sorted.length === 0 && <p className="faint ai-small ai-list-empty">Your AI chats are saved on this device.</p>}
        {sorted.map((c) => (
          <div key={c.id} className={`ai-list-item ${c.id === activeId ? "is-active" : ""}`}>
            {editing === c.id ? (
              <input
                className="ai-rename"
                defaultValue={c.title}
                autoFocus
                aria-label="Chat title"
                onBlur={(e) => {
                  rename(c.id, e.target.value);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <button type="button" className="ai-list-main" onClick={() => onPick(c.id)}>
                <span className="row ai-list-top">
                  <span className="ai-list-title truncate grow">{c.title}</span>
                  {live[c.id] ? <span className="ai-live-dot" aria-label="Running" /> : <span className="faint ai-list-time">{when(c.updatedAt)}</span>}
                </span>
                <span className="ai-list-sub truncate">{preview(c)}</span>
              </button>
            )}
            <span className="ai-list-actions">
              <IconButton label="Rename" size="sm" onClick={() => setEditing(c.id)}>
                <Pencil size={14} />
              </IconButton>
              <IconButton label="Delete chat" size="sm" variant="danger" onClick={() => remove(c.id)} disabled={!!live[c.id]}>
                <Trash2 size={14} />
              </IconButton>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
