import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, SquarePen, Plus, Clock, X } from "lucide-react";
import type { Conversation, User } from "@shared";
import { conversationPeer, conversationTitle, previewText, useChat } from "../../stores/chat";
import { useSession } from "../../stores/session";
import { useUi } from "../../stores/ui";
import { listTime } from "../../lib/time";
import { api, errorMessage } from "../../lib/api";
import { useUserSearch } from "../../lib/useUserSearch";
import { toast } from "../../stores/toast";
import { MomentsRow } from "../moments/MomentsRow";
import { Avatar, CountBadge, GroupAvatar, IconButton, Wordmark, EmptyState, Button } from "../../ui";

function ConvRow({ c, active }: { c: Conversation; active: boolean }) {
  const me = useSession((s) => s.user?.id ?? "");
  const users = useChat((s) => s.users);
  const presence = useChat((s) => s.presence);
  const typing = useChat((s) => s.typing[c.id]);
  const allPending = useChat((s) => s.pending);
  const pending = useMemo(() => Object.values(allPending).filter((p) => p.conversation_id === c.id), [allPending, c.id]);
  const title = conversationTitle(c, users, me);
  const peer = conversationPeer(c, me);
  const typers = Object.keys(typing ?? {}).filter((u) => u !== me);
  const lastPending = [...pending].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const lastAt = lastPending && (!c.last_message || lastPending.created_at > c.last_message.created_at) ? lastPending.created_at : c.last_message?.created_at;
  let preview = previewText(c.last_message);
  if (lastPending && lastAt === lastPending.created_at) {
    preview = previewText({ ciphertext: lastPending.ciphertext, nonce: lastPending.nonce } as never);
  }
  const senderPrefix = c.last_message && c.kind !== "dm" && !(lastPending && lastAt === lastPending.created_at) ? (c.last_message.sender_id === me ? "You: " : `${(users[c.last_message.sender_id]?.display_name ?? "").split(" ")[0]}${users[c.last_message.sender_id] ? ": " : ""}`) : c.last_message?.sender_id === me ? "You: " : "";
  return (
    <Link to={`/chats/${c.id}`} className={`conv ${active ? "is-active" : ""} ${c.unread_count ? "is-unread" : ""}`} aria-current={active ? "page" : undefined}>
      {c.kind === "dm" ? (
        <Avatar name={title} src={peer?.avatar_url} seed={peer?.id ?? c.id} size={46} online={peer ? !!presence[peer.id] : undefined} />
      ) : (
        <GroupAvatar names={c.members.filter((m) => m.id !== me).map((m) => m.display_name)} src={c.avatar_url} seed={c.id} size={46} />
      )}
      <span className="conv-body">
        <span className="conv-top">
          <span className="conv-title truncate">{title}</span>
          <span className="conv-time">{listTime(lastAt)}</span>
        </span>
        <span className="conv-bottom">
          {typers.length ? (
            <span className="conv-typing">typing…</span>
          ) : (
            <span className="conv-preview truncate">
              {lastPending && lastAt === lastPending.created_at && <Clock size={12} className="conv-pending" />}
              {preview ? `${senderPrefix}${preview}` : <span className="faint">No messages yet</span>}
            </span>
          )}
          <CountBadge count={c.unread_count} />
        </span>
      </span>
    </Link>
  );
}


export function ConversationList({ activeId }: { activeId?: string }) {
  const conversations = useChat((s) => s.conversations);
  const loaded = useChat((s) => s.convLoaded);
  const convError = useChat((s) => s.convError);
  const users = useChat((s) => s.users);
  const pending = useChat((s) => s.pending);
  const reload = useChat((s) => s.loadConversations);
  const upsert = useChat((s) => s.upsertConversation);
  const me = useSession((s) => s.user?.id ?? "");
  const setNewChat = useUi((s) => s.setNewChat);
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const { results: people, loading: searching } = useUserSearch(q, 2);

  const list = useMemo(() => {
    const lastAt = (c: Conversation) => {
      let t = c.last_message?.created_at ?? c.created_at;
      for (const p of Object.values(pending)) if (p.conversation_id === c.id && p.created_at > t) t = p.created_at;
      return t;
    };
    const needle = q.trim().toLowerCase();
    return Object.values(conversations)
      .filter((c) => c.kind !== "channel")
      .filter((c) => (filter === "unread" ? c.unread_count > 0 : filter === "groups" ? c.kind === "group" : true))
      .filter((c) => !needle || conversationTitle(c, users, me).toLowerCase().includes(needle) || c.members.some((m) => m.username.includes(needle)))
      .sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  }, [conversations, users, me, q, filter, pending]);

  const startDm = async (u: User) => {
    try {
      const c = await api("POST /v1/conversations/dm", { body: { user_id: u.id } });
      upsert(c);
      setQ("");
      nav(`/chats/${c.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const dmPeers = new Set(list.filter((c) => c.kind === "dm").flatMap((c) => c.members.map((m) => m.id)));
  const newPeople = people.filter((p) => p.id !== me && !dmPeers.has(p.id));

  return (
    <aside className="split-list">
      <div className="list-head mobile-only">
        <Wordmark size={26} />
        <IconButton label="New chat" onClick={() => setNewChat("dm")} data-coach="new-chat">
          <SquarePen size={20} />
        </IconButton>
      </div>
      <div className="list-search">
        <label className="search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations or people" aria-label="Search conversations or people" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="search-x">
              <X size={14} />
            </button>
          )}
        </label>
        <IconButton label="New chat" onClick={() => setNewChat("dm")} className="desktop-only" data-coach="new-chat">
          <SquarePen size={19} />
        </IconButton>
      </div>
      <div className="list-scroll">
        {!q && <MomentsRow />}
        <div className="list-filters">
          {(["all", "unread", "groups"] as const).map((f) => (
            <button key={f} className={`chip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "unread" ? "Unread" : "Groups"}
            </button>
          ))}
        </div>
        {!loaded && (
          <div className="conv-skeletons">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="conv-skel">
                <span className="skeleton" style={{ width: 46, height: 46, borderRadius: "50%" }} />
                <span className="grow col">
                  <span className="skeleton" style={{ width: "55%", height: 12 }} />
                  <span className="skeleton" style={{ width: "80%", height: 10 }} />
                </span>
              </div>
            ))}
          </div>
        )}
        {loaded && convError && !list.length && (
          <EmptyState compact title="Couldn’t load chats" body={convError} action={<Button variant="secondary" size="sm" onClick={() => reload()}>Try again</Button>} />
        )}
        {loaded && !convError && !list.length && !q && (
          <EmptyState compact title="It’s quiet in here" body="Start a conversation — find friends by their @username." action={<Button size="sm" onClick={() => setNewChat("dm")}>New chat</Button>} />
        )}
        <div className="conv-list" role="list">
          {list.map((c) => (
            <ConvRow key={c.id} c={c} active={c.id === activeId} />
          ))}
        </div>
        {q.trim().length >= 2 && (
          <div className="list-section">
            <h3 className="list-group-title">People {searching && "…"}</h3>
            {newPeople.length === 0 && !searching && <p className="faint people-empty">No one else matches “{q}”.</p>}
            {newPeople.map((u) => (
              <button key={u.id} className="person" onClick={() => startDm(u)}>
                <Avatar name={u.display_name} src={u.avatar_url} seed={u.id} size={40} />
                <span className="grow col" style={{ gap: 0 }}>
                  <span className="truncate person-name">{u.display_name}</span>
                  <span className="truncate faint">@{u.username}</span>
                </span>
                <span className="badge badge-accent">Message</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
