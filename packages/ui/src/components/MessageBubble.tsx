import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, Check, CheckCheck, Clock, RotateCw } from "lucide-react";
import { cx } from "../cx";
import { STATUS_LABEL } from "../shared/format";
import type { GroupPosition, MessageDirection, MessageStatus, Reaction, ReplyPreview } from "../shared/types";

export interface MessageStatusIconProps {
  status: MessageStatus;
}

export function MessageStatusIcon({ status }: MessageStatusIconProps) {
  const Icon = { sending: Clock, sent: Check, delivered: CheckCheck, read: CheckCheck, failed: AlertCircle }[status];
  return (
    <span className={cx("s-status", `is-${status}`)}>
      <Icon size={14} strokeWidth={status === "read" ? 2.75 : 2} aria-hidden="true" />
      <span className="s-sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

export interface MessageBubbleProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  direction: MessageDirection;
  children: ReactNode;
  /** Sender name; shown on the first incoming bubble of a group (group chats). */
  author?: string;
  time?: string;
  /** ISO timestamp for <time dateTime>. */
  dateTime?: string;
  status?: MessageStatus;
  edited?: boolean;
  position?: GroupPosition;
  replyTo?: ReplyPreview;
  onReplyClick?: () => void;
  reactions?: Reaction[];
  onReactionClick?: (emoji: string) => void;
  onRetry?: () => void;
  /** Media/attachment slot rendered above the text. */
  media?: ReactNode;
}

export function MessageBubble({
  direction,
  children,
  author,
  time,
  dateTime,
  status,
  edited,
  position = "single",
  replyTo,
  onReplyClick,
  reactions,
  onReactionClick,
  onRetry,
  media,
  className,
  ...rest
}: MessageBubbleProps) {
  const showAuthor = direction === "in" && author && (position === "single" || position === "first");
  const failed = status === "failed";
  return (
    <div
      className={cx("s-msg", `s-msg--${direction}`, `is-${position}`, failed && "is-failed", className)}
      {...rest}
    >
      {showAuthor && <div className="s-msg__author">{author}</div>}
      <div className="s-msg__bubble">
        {replyTo && (
          <button type="button" className="s-msg__reply" onClick={onReplyClick} aria-label={`Reply to ${replyTo.author}: ${replyTo.text}`}>
            <span className="s-msg__reply-author">{replyTo.author}</span>
            <span className="s-msg__reply-text">{replyTo.text}</span>
          </button>
        )}
        {media && <div className="s-msg__media">{media}</div>}
        <div className="s-msg__text">{children}</div>
        <div className="s-msg__meta">
          {edited && <span className="s-msg__edited">edited</span>}
          {time && (dateTime ? <time dateTime={dateTime}>{time}</time> : <span>{time}</span>)}
          {direction === "out" && status && <MessageStatusIcon status={status} />}
        </div>
      </div>
      {failed && onRetry && (
        <button type="button" className="s-msg__retry" onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" /> Not sent. Retry
        </button>
      )}
      {reactions && reactions.length > 0 && (
        <ul className="s-msg__reactions" aria-label="Reactions">
          {reactions.map((r) => (
            <li key={r.emoji}>
              <button
                type="button"
                className={cx("s-reaction", r.mine && "is-mine")}
                aria-pressed={!!r.mine}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ", you reacted" : ""}`}
                onClick={() => onReactionClick?.(r.emoji)}
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span aria-hidden="true" className="s-reaction__count">{r.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DayDivider({ label }: { label: string }) {
  return (
    <div className="s-divider" role="separator" aria-label={label}>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

export function NewMessagesDivider({ label = "New messages", id }: { label?: string; id?: string }) {
  return (
    <div className="s-divider s-divider--new" role="separator" aria-label={label} id={id}>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}
