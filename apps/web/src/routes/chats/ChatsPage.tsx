import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { EmptyState, Button } from "../../ui";
import { useUi } from "../../stores/ui";
import { MessageCirclePlus } from "lucide-react";

export function useInChatClass(active: boolean) {
  useEffect(() => {
    document.body.classList.toggle("in-chat", active);
    return () => document.body.classList.remove("in-chat");
  }, [active]);
}

export function ChatsPage() {
  const { id } = useParams();
  const setNewChat = useUi((s) => s.setNewChat);
  useInChatClass(!!id);
  return (
    <div className={`split ${id ? "has-detail" : ""}`}>
      <ConversationList activeId={id} />
      <section className="split-detail">
        {id ? (
          <ChatView key={id} conversationId={id} />
        ) : (
          <div className="detail-empty">
            <EmptyState
              title="Pick up where you left off"
              body="Choose a conversation, or start a new one with anyone on Secrets."
              action={
                <Button icon={<MessageCirclePlus size={18} />} onClick={() => setNewChat("dm")}>
                  New chat
                </Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
