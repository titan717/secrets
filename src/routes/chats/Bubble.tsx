import { memo, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock, AlertCircle, Reply, SmilePlus, Copy, Pencil, Trash2, Pin, RotateCw, X } from "lucide-react";
import type { Attachment, MessageBody, Reaction, User } from "@shared";
import { clock } from "../../lib/time";
import { AuthImage, Avatar } from "../../ui";
import { isEmojiOnly, RichText } from "./linkify";
import { QUICK_REACTIONS } from "./emoji";

export type MsgStatus = "queued" | "sending" | "failed" | "sent" | "read";

export interface DisplayMsg {
  key: string;
  id: string | null;
  client_msg_id: string;
  sender_id: string;
  created_at: string;
  body: MessageBody;
  reactions: Reaction[];
  status: MsgStatus;
  mine: boolean;
  edited: boolean;
  deleted: boolean;
  pinned: boolean;
  error?: string;
}

export interface BubbleProps {
  m: DisplayMsg;
  sender?: User;
  showName: boolean;
  showAvatar: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  quoted?: { name: string; text: string } | null;
  myId: string;
  onReply: (m: DisplayMsg) => void;
  onReact: (m: DisplayMsg, emoji: string) => void;
  onOpenImage: (items: Attachment[], index: number) => void;
  onEdit: (m: DisplayMsg) => void;
  onDelete: (m: DisplayMsg) => void;
  onPin: (m: DisplayMsg) => void;
  onRetry: (m: DisplayMsg) => void;
  onDiscard: (m: DisplayMsg) => void;
  onJump: (id: string) => void;
  canModerate: boolean;
}

function Ticks({ status }: { status: MsgStatus }) {
  switch (status) {
    case "queued":
    case "sending":
      return <Clock size={12} className="tick tick-pending" aria-label={status === "queued" ? "Waiting to send" : "Sending"} />;
    case "failed":
      return <AlertCircle size={13} className="tick tick-failed" aria-label="Failed to send" />;
    case "read":
      return <CheckCheck size={14} className="tick tick-read" aria-label="Read" />;
    default:
      return <Check size={14} className="tick" aria-label="Sent" />;
  }
}

function Gallery({ items, onOpen }: { items: Attachment[]; onOpen: (i: number) => void }) {
  const images = items.filter((a) => a.mime.startsWith("image/"));
  const n = images.length;
  if (!n) return null;
  if (n === 1) {
    const a = images[0];
    const ratio = a.width && a.height ? Math.min(1.6, Math.max(0.6, a.height / a.width)) : 0.75;
    return (
      <button className="att-single" onClick={() => onOpen(0)} style={{ aspectRatio: `${1 / ratio}` }} aria-label="Open photo">
        <AuthImage path={a.url} alt={a.name ?? "Photo"} />
      </button>
    );
  }
  return (
    <div className={`att-grid att-grid-${Math.min(n, 4)}`}>
      {images.slice(0, 4).map((a, i) => (
        <button key={a.id} className="att-cell" onClick={() => onOpen(i)} aria-label={`Open photo ${i + 1}`}>
          <AuthImage path={a.url} alt="" />
          {i === 3 && n > 4 && <span className="att-more">+{n - 4}</span>}
        </button>
      ))}
    </div>
  );
}

export const Bubble = memo(function Bubble(p: BubbleProps) {
  const { m } = p;
  const [picker, setPicker] = useState(false);
  const [dx, setDx] = useState(0);
  const [selected, setSelected] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    const off = (e: Event) => {
      if (!rowRef.current?.contains(e.target as Node)) {
        setSelected(false);
        setPicker(false);
      }
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [selected]);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const text = m.body.text ?? "";
  const atts = m.body.attachments ?? [];
  const bigEmoji = !atts.length && !p.quoted && isEmojiOnly(text);
  const confirmed = !!m.id;

  // Swipe-to-reply (touch only)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !confirmed || m.deleted) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const ddx = e.clientX - s.x;
    if (Math.abs(e.clientY - s.y) > 30 && Math.abs(ddx) < 20) {
      start.current = null;
      setDx(0);
      return;
    }
    setDx(Math.max(0, Math.min(80, ddx)));
  };
  const onPointerUp = () => {
    if (dx > 56) p.onReply(m);
    start.current = null;
    setDx(0);
  };

  const copy = () => navigator.clipboard?.writeText(text).catch(() => {});

  return (
    <div
      ref={rowRef}
      className={`msg-row ${m.mine ? "is-mine" : ""} ${p.groupStart ? "g-start" : ""} ${p.groupEnd ? "g-end" : ""} ${picker ? "has-picker" : ""} ${selected ? "is-selected" : ""}`}
      data-mid={m.id ?? undefined}
      onMouseLeave={() => !selected && setPicker(false)}
      onContextMenu={(e) => {
        if (!confirmed || m.deleted) return;
        if ((e.target as HTMLElement).closest("a")) return;
        e.preventDefault();
        setSelected(true);
        setPicker(true);
      }}
    >
      {!m.mine && <div className="msg-avatar">{p.showAvatar && <Avatar name={p.sender?.display_name ?? "?"} src={p.sender?.avatar_url} seed={m.sender_id} size={30} />}</div>}
      <div
        className="msg-stack"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={dx ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined}
      >
        {dx > 0 && (
          <span className="swipe-reply" style={{ opacity: Math.min(1, dx / 56) }}>
            <Reply size={16} />
          </span>
        )}
        {p.showName && !m.mine && <div className="msg-name" style={{ ["--hue" as string]: 0 }}>{p.sender?.display_name ?? "Someone"}</div>}
        <div className={`bubble ${m.mine ? "bubble-out" : "bubble-in"} ${bigEmoji ? "bubble-emoji" : ""} ${atts.length && !text ? "bubble-media" : ""} ${m.deleted ? "bubble-deleted" : ""} ${m.status === "failed" ? "is-failed" : ""}`}>
          {m.pinned && (
            <span className="msg-pinned">
              <Pin size={11} /> Pinned
            </span>
          )}
          {p.quoted && (
            <button className="quote" onClick={() => m.body.reply_to && p.onJump(m.body.reply_to)}>
              <span className="quote-name">{p.quoted.name}</span>
              <span className="quote-text truncate">{p.quoted.text}</span>
            </button>
          )}
          {m.deleted ? (
            <span className="deleted-text">This message was deleted</span>
          ) : (
            <>
              {atts.length > 0 && <Gallery items={atts} onOpen={(i) => p.onOpenImage(atts.filter((a) => a.mime.startsWith("image/")), i)} />}
              {text && (
                <div className="msg-text">
                  <RichText text={text} />
                  <span className="meta-spacer" aria-hidden />
                </div>
              )}
            </>
          )}
          <span className={`meta ${atts.length && !text ? "meta-overlay" : ""}`}>
            {m.edited && !m.deleted && <span>edited</span>}
            <time dateTime={m.created_at}>{clock(m.created_at)}</time>
            {m.mine && !m.deleted && <Ticks status={m.status} />}
          </span>
        </div>
        {m.status === "failed" && (
          <div className="msg-failed">
            <span>{m.error ?? "Not sent"}</span>
            <button onClick={() => p.onRetry(m)}>
              <RotateCw size={12} /> Retry
            </button>
            <button onClick={() => p.onDiscard(m)}>
              <X size={12} /> Discard
            </button>
          </div>
        )}
        {m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} className={`reaction ${r.user_ids.includes(p.myId) ? "is-mine" : ""}`} onClick={() => p.onReact(m, r.emoji)} aria-label={`${r.emoji} ${r.user_ids.length}`}>
                <span>{r.emoji}</span>
                {r.user_ids.length > 1 && <span className="reaction-n">{r.user_ids.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {confirmed && !m.deleted && (
        <div className="msg-actions" role="toolbar" aria-label="Message actions">
          <button aria-label="React" title="React" onClick={() => setPicker(!picker)}>
            <SmilePlus size={16} />
          </button>
          <button aria-label="Reply" title="Reply" onClick={() => p.onReply(m)}>
            <Reply size={16} />
          </button>
          {text && (
            <button aria-label="Copy" title="Copy text" onClick={copy}>
              <Copy size={15} />
            </button>
          )}
          <button aria-label={m.pinned ? "Unpin" : "Pin"} title={m.pinned ? "Unpin" : "Pin"} onClick={() => p.onPin(m)}>
            <Pin size={15} />
          </button>
          {m.mine && text && (
            <button aria-label="Edit" title="Edit" onClick={() => p.onEdit(m)}>
              <Pencil size={15} />
            </button>
          )}
          {(m.mine || p.canModerate) && (
            <button aria-label="Delete" title="Delete" className="is-danger" onClick={() => p.onDelete(m)}>
              <Trash2 size={15} />
            </button>
          )}
          {picker && (
            <div className="quick-react" role="menu">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  role="menuitem"
                  onClick={() => {
                    p.onReact(m, e);
                    setPicker(false);
                    setSelected(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
