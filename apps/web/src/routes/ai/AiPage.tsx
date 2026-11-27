import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquarePlus } from "lucide-react";
import { Button, IconButton } from "../../ui";
import { useAiChats } from "../../lib/ai/chats";
import { AiChatList } from "./AiChatList";
import { AiThread, MASCOT } from "./AiThread";
import { AiSettingsModal } from "./AiSettings";
import "../../styles/ai.css";

export function AiPage() {
  const { chatId } = useParams();
  const nav = useNavigate();
  const chats = useAiChats((s) => s.chats);
  const create = useAiChats((s) => s.create);
  const select = useAiChats((s) => s.select);
  const currentId = useAiChats((s) => s.currentId);
  const [settings, setSettings] = useState(false);
  const exists = chatId && chats.some((c) => c.id === chatId);

  useEffect(() => {
    if (chatId && exists) select(chatId);
    else if (chatId && !exists) nav("/ai", { replace: true });
  }, [chatId, exists, select, nav]);

  // Mobile hides the bottom nav while a thread is open.
  useEffect(() => {
    if (!chatId) return;
    document.body.classList.add("in-chat");
    return () => document.body.classList.remove("in-chat");
  }, [chatId]);

  const desktopId = exists ? chatId! : currentId && chats.some((c) => c.id === currentId) ? currentId : (chats[0]?.id ?? null);
  const newChat = () => nav(`/ai/${create()}`);

  return (
    <div className={`ai-page ${chatId ? "has-thread" : ""}`}>
      <aside className="ai-side">
        <div className="ai-side-head">
          <img src={MASCOT} alt="" width={30} height={30} />
          <h1 className="page-title">Ask Secrets</h1>
        </div>
        <AiChatList activeId={desktopId} onPick={(id) => nav(`/ai/${id}`)} onNew={newChat} />
      </aside>
      <section className="ai-main">
        {desktopId ? (
          <AiThread
            chatId={desktopId}
            onOpenSettings={() => setSettings(true)}
            leading={
              <IconButton label="Back to AI chats" className="mobile-only" onClick={() => nav("/ai")}>
                <ArrowLeft size={20} />
              </IconButton>
            }
          />
        ) : (
          <div className="ai-empty ai-empty-page">
            <img src="/ghost.webp" alt="" className="ghost ghost-float" width={140} />
            <h2>Meet your assistant</h2>
            <p className="muted">Chat with Gemini or OpenRouter models, or try the keyless Mock demo. Chats and keys stay on this device.</p>
            <Button icon={<MessageSquarePlus size={17} />} onClick={newChat}>
              Start a chat
            </Button>
          </div>
        )}
      </section>
      <AiSettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
