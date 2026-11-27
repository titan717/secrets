import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Video, PanelRight, Hash, Lock } from "lucide-react";
import type { User } from "@secrets/shared";
import { conversationPeer, conversationTitle, useChat } from "../../stores/chat";
import { useSession } from "../../stores/session";
import { useSettings } from "../../stores/settings";
import { useUi } from "../../stores/ui";
import { useCalls } from "../../stores/calls";
import { WALLPAPERS } from "../../lib/theme";
import { lastSeenLabel } from "../../lib/time";
import { Avatar, GroupAvatar, IconButton } from "../../ui";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { InfoPanel } from "./InfoPanel";
import type { DisplayMsg } from "./Bubble";

export function wallpaperStyle(id: string, photo: string | null): React.CSSProperties {
  if (id === "photo" && photo) return { backgroundImage: `linear-gradient(var(--wall-dim), var(--wall-dim)), url(${photo})`, backgroundSize: "cover", backgroundPosition: "center" };
  const w = WALLPAPERS.find((x) => x.id === id) ?? WALLPAPERS[0];
  return { background: w.css };
}

export interface ChatViewProps {
  conversationId: string;
  /** Channel mode: header shows #name; info panel slot replaced. */
  channel?: { name: string; topic?: string; dockName: string; readOnly?: string | null };
  lookupExtra?: (id: string) => User | undefined;
  canModerate?: boolean;
  backTo?: string;
  sidePanel?: ReactNode;
  headerExtra?: ReactNode;
}

export function ChatView({ conversationId, channel, lookupExtra, canModerate = false, backTo = "/chats", sidePanel, headerExtra }: ChatViewProps) {
  const nav = useNavigate();
  const conv = useChat((s) => s.conversations[conversationId]);
  const users = useChat((s) => s.users);
  const presence = useChat((s) => s.presence);
  const lastSeen = useChat((s) => s.lastSeen);
  const typing = useChat((s) => s.typing[conversationId]);
  const { ensureConversation, loadMessages, setActive } = useChat.getState();
  const me = useSession((s) => s.user);
  const wallpaper = useSettings((s) => s.wallpaper);
  const wallPhoto = useSettings((s) => s.wallpaperPhoto);
  const infoOpen = useUi((s) => s.infoOpen);
  const setInfoOpen = useUi((s) => s.setInfoOpen);
  const startCall = useCalls((s) => s.start);
  const starting = useCalls((s) => s.starting);
  const [replyTo, setReplyTo] = useState<DisplayMsg | null>(null);
  const [editing, setEditing] = useState<DisplayMsg | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    void ensureConversation(conversationId).then((c) => alive && !c && !channel && setMissing(true));
    void loadMessages(conversationId);
    setActive(conversationId);
    const onVis = () => document.visibilityState === "visible" && useChat.getState().markRead(conversationId);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      setActive(null);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lookupUser = useCallback((id: string) => users[id] ?? lookupExtra?.(id) ?? conv?.members.find((m) => m.id === id), [users, lookupExtra, conv]);

  const myId = me?.id ?? "";
  const title = channel ? channel.name : conv ? conversationTitle(conv, users, myId) : "";
  const peer = conv ? conversationPeer(conv, myId) : undefined;
  const isGroup = !!channel || conv?.kind === "group";
  const typers = Object.keys(typing ?? {}).filter((u) => u !== myId);

  let subtitle: ReactNode = null;
  if (typers.length) subtitle = <span className="accent-text">{typers.length === 1 ? `${isGroup ? (lookupUser(typers[0])?.display_name.split(" ")[0] ?? "Someone") + " is " : ""}typing…` : `${typers.length} people typing…`}</span>;
  else if (channel) subtitle = channel.topic || channel.dockName;
  else if (conv?.kind === "dm" && peer) subtitle = presence[peer.id] ? <span className="online-text">Online</span> : lastSeenLabel(lastSeen[peer.id]) ?? `@${peer.username}`;
  else if (conv) subtitle = `${conv.members.length} members`;

  const call = (kind: "voice" | "video") => void startCall({ conversation_id: conversationId, kind, title: channel ? `#${channel.name}` : title });

  if (missing)
    return (
      <div className="chat chat-missing">
        <p className="muted">This conversation isn’t available. It may have been removed, or you’re no longer a member.</p>
        <button className="btn btn-secondary btn-md" onClick={() => nav("/chats")}>
          Back to chats
        </button>
      </div>
    );

  const replyName = replyTo ? (replyTo.mine ? "yourself" : lookupUser(replyTo.sender_id)?.display_name ?? "message") : undefined;

  return (
    <div className={`chat-wrap ${infoOpen ? "info-open" : ""}`}>
      <div className="chat">
        <header className="chat-head">
          <IconButton label="Back" className="mobile-back" onClick={() => nav(backTo)}>
            <ArrowLeft size={20} />
          </IconButton>
          <button className="chat-head-id" onClick={() => setInfoOpen(!infoOpen)} aria-label="Conversation info">
            {channel ? (
              <span className="channel-badge">
                <Hash size={20} />
              </span>
            ) : conv?.kind === "dm" ? (
              <Avatar name={title || "?"} src={peer?.avatar_url} seed={peer?.id ?? conversationId} size={40} online={peer ? !!presence[peer.id] : undefined} />
            ) : (
              <GroupAvatar names={(conv?.members ?? []).filter((m) => m.id !== myId).map((m) => m.display_name)} src={conv?.avatar_url} seed={conversationId} size={40} />
            )}
            <span className="col chat-head-text">
              <span className="chat-title truncate">{title || <span className="skeleton" style={{ width: 120, height: 14, display: "inline-block" }} />}</span>
              <span className="chat-sub truncate">
                {!channel && conv?.kind !== "dm" && conv && <Lock size={11} />} {subtitle}
              </span>
            </span>
          </button>
          <div className="row chat-head-actions">
            {headerExtra}
            <IconButton label="Video call" onClick={() => call("video")} disabled={starting}>
              <Video size={20} />
            </IconButton>
            <IconButton label="Voice call" onClick={() => call("voice")} disabled={starting}>
              <Phone size={19} />
            </IconButton>
            <IconButton label="Info" onClick={() => setInfoOpen(!infoOpen)} active={infoOpen} className="desktop-only">
              <PanelRight size={19} />
            </IconButton>
          </div>
        </header>
        <div className="chat-body" style={wallpaperStyle(wallpaper, wallPhoto)}>
          <MessageList
            conversationId={conversationId}
            isGroup={isGroup}
            canModerate={canModerate}
            onReply={(m) => {
              setEditing(null);
              setReplyTo(m);
            }}
            onEdit={(m) => {
              setReplyTo(null);
              setEditing(m);
            }}
            lookupUser={lookupUser}
            emptyHint={
              channel ? (
                <div className="channel-hello">
                  <span className="channel-badge big">
                    <Hash size={30} />
                  </span>
                  <h3>Welcome to #{channel.name}</h3>
                  <p className="muted">{channel.topic || `This is the start of #${channel.name} in ${channel.dockName}.`}</p>
                </div>
              ) : undefined
            }
          />
        </div>
        <Composer
          key={conversationId}
          conversationId={conversationId}
          replyTo={replyTo}
          replyName={replyName}
          onCancelReply={() => setReplyTo(null)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          disabled={channel?.readOnly}
          placeholder={channel ? `Message #${channel.name}` : "Type a message…"}
        />
      </div>
      {infoOpen && (
        <>
          <div className="info-scrim" onClick={() => setInfoOpen(false)} />
          <aside className="info-panel" aria-label="Details">
            {sidePanel ?? (conv ? <InfoPanel conversation={conv} onClose={() => setInfoOpen(false)} /> : null)}
          </aside>
        </>
      )}
    </div>
  );
}
