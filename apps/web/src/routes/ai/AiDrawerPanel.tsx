import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, List, Maximize2, X } from "lucide-react";
import { IconButton } from "../../ui";
import { useAiChats } from "../../lib/ai/chats";
import { AiThread } from "./AiThread";
import { AiChatList } from "./AiChatList";
import { AiSettingsModal } from "./AiSettings";
import "../../styles/ai.css";

export function AiDrawerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const chats = useAiChats((s) => s.chats);
  const currentId = useAiChats((s) => s.currentId);
  const create = useAiChats((s) => s.create);
  const select = useAiChats((s) => s.select);
  const [view, setView] = useState<"thread" | "list">("thread");
  const [settings, setSettings] = useState(false);

  const id = currentId && chats.some((c) => c.id === currentId) ? currentId : null;

  useEffect(() => {
    if (!open) return;
    if (!id) {
      if (chats[0]) select(chats[0].id);
      else create();
    }
    setView("thread");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !settings && !document.querySelector(".modal-root")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, settings]);

  if (!open) return null;

  return createPortal(
    <div className="ai-drawer-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ai-drawer" role="dialog" aria-modal="true" aria-label="Ask Secrets AI">
        {view === "list" || !id ? (
          <div className="ai-drawer-list">
            <header className="ai-thread-head">
              <IconButton label="Back" onClick={() => setView("thread")} disabled={!id}>
                <ArrowLeft size={20} />
              </IconButton>
              <div className="grow ai-thread-title">AI chats</div>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </header>
            <AiChatList
              activeId={id}
              onPick={(cid) => {
                select(cid);
                setView("thread");
              }}
              onNew={() => {
                create();
                setView("thread");
              }}
            />
          </div>
        ) : (
          <AiThread
            chatId={id}
            compact
            onOpenSettings={() => setSettings(true)}
            leading={
              <IconButton label="All AI chats" onClick={() => setView("list")}>
                <List size={19} />
              </IconButton>
            }
            actions={
              <>
                <IconButton
                  label="Open full page"
                  className="desktop-only"
                  onClick={() => {
                    onClose();
                    nav(`/ai/${id}`);
                  }}
                >
                  <Maximize2 size={17} />
                </IconButton>
                <IconButton label="Close" onClick={onClose}>
                  <X size={18} />
                </IconButton>
              </>
            }
          />
        )}
      </aside>
      <AiSettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>,
    document.body,
  );
}
