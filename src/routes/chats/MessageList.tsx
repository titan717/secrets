import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { Attachment, User } from "@shared";
import { openBody } from "@shared";
import { useChat } from "../../stores/chat";
import { useSession } from "../../stores/session";
import { toast } from "../../stores/toast";
import { dayLabel, isSameDay } from "../../lib/time";
import { Avatar, Spinner, EmptyState } from "../../ui";
import { Bubble, type DisplayMsg } from "./Bubble";
import { Lightbox } from "./Lightbox";

const EMPTY: never[] = [];
const GROUP_GAP_MS = 5 * 60 * 1000;

export interface MessageListProps {
  conversationId: string;
  isGroup: boolean;
  canModerate: boolean;
  onReply: (m: DisplayMsg) => void;
  onEdit: (m: DisplayMsg) => void;
  lookupUser: (id: string) => User | undefined;
  emptyHint?: React.ReactNode;
}

export function MessageList({ conversationId, isGroup, canModerate, onReply, onEdit, lookupUser, emptyHint }: MessageListProps) {
  const messages = useChat((s) => s.messages[conversationId]);
  const allPending = useChat((s) => s.pending);
  const hasMore = useChat((s) => s.hasMore[conversationId]);
  const loadingOlder = useChat((s) => s.loadingOlder[conversationId]);
  const loadOlder = useChat((s) => s.loadOlder);
  const reads = useChat((s) => s.reads[conversationId]);
  const typing = useChat((s) => s.typing[conversationId]);
  const { react, retry, discard, remove, pin } = useChat.getState();
  const myId = useSession((s) => s.user?.id ?? "");
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const prevHeight = useRef<number | null>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: Attachment[]; index: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const items: DisplayMsg[] = useMemo(() => {
    const othersRead = Object.entries(reads ?? {})
      .filter(([u]) => u !== myId)
      .map(([, at]) => at);
    const maxRead = othersRead.sort().pop();
    const list: DisplayMsg[] = (messages ?? EMPTY).map((m) => ({
      key: m.client_msg_id ? `c:${m.sender_id}:${m.client_msg_id}` : m.id,
      id: m.id,
      client_msg_id: m.client_msg_id,
      sender_id: m.sender_id,
      created_at: m.created_at,
      body: m.deleted ? {} : openBody(m),
      reactions: m.reactions ?? [],
      status: m.sender_id === myId && maxRead && maxRead >= m.created_at ? "read" : "sent",
      mine: m.sender_id === myId,
      edited: !!m.edited_at,
      deleted: !!m.deleted,
      pinned: !!m.pinned,
    }));
    const known = new Set(list.map((m) => m.client_msg_id));
    const pend = Object.values(allPending)
      .filter((p) => p.conversation_id === conversationId && !known.has(p.client_msg_id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map<DisplayMsg>((p) => ({
        key: `c:${myId}:${p.client_msg_id}`,
        id: null,
        client_msg_id: p.client_msg_id,
        sender_id: myId,
        created_at: p.created_at,
        body: openBody(p),
        reactions: [],
        status: p.status,
        mine: true,
        edited: false,
        deleted: false,
        pinned: false,
        error: p.error,
      }));
    return [...list, ...pend];
  }, [messages, allPending, conversationId, myId, reads]);

  const byId = useMemo(() => {
    const m = new Map<string, DisplayMsg>();
    for (const i of items) if (i.id) m.set(i.id, i);
    return m;
  }, [items]);

  // Infinite scroll up
  useEffect(() => {
    const el = topSentinel.current;
    const root = scroller.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore !== false && messages?.length) {
          prevHeight.current = root.scrollHeight - root.scrollTop;
          void loadOlder(conversationId);
        }
      },
      { root, rootMargin: "300px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [conversationId, hasMore, loadOlder, messages?.length]);

  // Preserve position when older messages prepend; stick to bottom on new ones.
  const lastKey = items[items.length - 1]?.key;
  const firstKey = items[0]?.key;
  const lastMine = items[items.length - 1]?.mine;
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root) return;
    if (prevHeight.current !== null && !loadingOlder) {
      root.scrollTop = root.scrollHeight - prevHeight.current;
      prevHeight.current = null;
      return;
    }
  }, [firstKey, loadingOlder]);
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root) return;
    if (atBottom.current || lastMine) root.scrollTop = root.scrollHeight;
  }, [lastKey, lastMine, typing]);

  // Initial: jump to bottom once messages arrive.
  const didInit = useRef(false);
  useLayoutEffect(() => {
    if (didInit.current || !messages) return;
    didInit.current = true;
    const root = scroller.current;
    if (root) root.scrollTop = root.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const root = scroller.current;
    if (!root) return;
    const dist = root.scrollHeight - root.scrollTop - root.clientHeight;
    atBottom.current = dist < 80;
    setShowJump(dist > 400);
  };

  const jumpTo = useCallback((id: string) => {
    const el = scroller.current?.querySelector(`[data-mid="${id}"]`);
    if (!el) {
      toast.info("That message is further back — scroll up to load it.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash(null), 1400);
  }, []);

  const typers = Object.keys(typing ?? {}).filter((u) => u !== myId);

  const onReact = useCallback((m: DisplayMsg, emoji: string) => m.id && void react(m.id, emoji), [react]);
  const onRetry = useCallback((m: DisplayMsg) => retry(m.client_msg_id), [retry]);
  const onDiscard = useCallback((m: DisplayMsg) => discard(m.client_msg_id), [discard]);
  const onDelete = useCallback((m: DisplayMsg) => {
    if (m.id && window.confirm("Delete this message for everyone?")) void remove(m.id);
  }, [remove]);
  const onPin = useCallback((m: DisplayMsg) => m.id && void pin(m.id, !m.pinned), [pin]);
  const onOpenImage = useCallback((items: Attachment[], index: number) => setLightbox({ items, index }), []);

  return (
    <div className="msg-scroll" ref={scroller} onScroll={onScroll}>
      <div ref={topSentinel} className="msg-sentinel" />
      {loadingOlder && (
        <div className="msg-older">
          <Spinner size={16} />
        </div>
      )}
      {hasMore === false && items.length > 0 && <div className="msg-begin faint">This is the beginning of the conversation.</div>}
      {!messages && (
        <div className="msg-loading">
          {[60, 40, 72, 35, 55].map((w, i) => (
            <div key={i} className={`skeleton msg-skel ${i % 2 ? "is-mine" : ""}`} style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {messages && items.length === 0 && <div className="msg-empty">{emptyHint ?? <EmptyState compact title="No messages yet" body="Say hi — your first message starts the story." />}</div>}
      <div className="msg-list">
        {items.map((m, i) => {
          const prev = items[i - 1];
          const next = items[i + 1];
          const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
          const groupStart = newDay || !prev || prev.sender_id !== m.sender_id || +new Date(m.created_at) - +new Date(prev.created_at) > GROUP_GAP_MS;
          const groupEnd = !next || next.sender_id !== m.sender_id || !isSameDay(next.created_at, m.created_at) || +new Date(next.created_at) - +new Date(m.created_at) > GROUP_GAP_MS;
          const replyTo = m.body.reply_to ? byId.get(m.body.reply_to) : null;
          const quoted = m.body.reply_to
            ? replyTo
              ? { name: replyTo.mine ? "You" : lookupUser(replyTo.sender_id)?.display_name ?? "Someone", text: replyTo.deleted ? "Deleted message" : replyTo.body.text || (replyTo.body.attachments?.length ? "Photo" : "") }
              : { name: "Reply", text: "Original message" }
            : null;
          const system = m.body.kind === "system";
          return (
            <div key={m.key} className={flash && m.id === flash ? "msg-flash" : undefined}>
              {newDay && (
                <div className="day-sep" role="separator">
                  <span>{dayLabel(m.created_at)}</span>
                </div>
              )}
              {system ? (
                <div className="sys-msg">{m.body.text}</div>
              ) : (
                <Bubble
                  m={m}
                  sender={lookupUser(m.sender_id)}
                  showName={isGroup && groupStart}
                  showAvatar={isGroup && groupEnd}
                  groupStart={groupStart}
                  groupEnd={groupEnd}
                  quoted={quoted}
                  myId={myId}
                  onReply={onReply}
                  onReact={onReact}
                  onOpenImage={onOpenImage}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onPin={onPin}
                  onRetry={onRetry}
                  onDiscard={onDiscard}
                  onJump={jumpTo}
                  canModerate={canModerate}
                />
              )}
            </div>
          );
        })}
        {typers.length > 0 && (
          <div className="msg-row typing-row">
            {isGroup && (
              <div className="msg-avatar">
                <Avatar name={lookupUser(typers[0])?.display_name ?? "?"} seed={typers[0]} size={30} />
              </div>
            )}
            <div className="bubble bubble-in typing-bubble" aria-label={`${typers.map((t) => lookupUser(t)?.display_name ?? "Someone").join(", ")} typing`}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
      {showJump && (
        <button className="jump-bottom" aria-label="Jump to latest" onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })}>
          <ArrowDown size={18} />
        </button>
      )}
      {lightbox && <Lightbox items={lightbox.items} index={lightbox.index} onIndex={(index) => setLightbox({ ...lightbox, index })} onClose={() => setLightbox(null)} />}
    </div>
  );
}
