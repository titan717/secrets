import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BellOff, Pin, ShieldCheck, Users } from "lucide-react";
import { cx } from "../cx";
import { Avatar, AvatarGroup } from "./Avatar";
import { UnreadCount } from "./Badge";
import { typingLabel } from "../shared/format";
import type { ConversationSummary } from "../shared/types";

export interface ListItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
}

/** Generic interactive row (settings, members, devices). */
export function ListItem({ leading, title, subtitle, meta, trailing, selected, className, type = "button", ...rest }: ListItemProps) {
  return (
    <button type={type} className={cx("s-list-item", selected && "is-selected", className)} aria-current={selected || undefined} {...rest}>
      {leading && <span className="s-list-item__leading">{leading}</span>}
      <span className="s-list-item__body">
        <span className="s-list-item__title">{title}</span>
        {subtitle && <span className="s-list-item__subtitle">{subtitle}</span>}
      </span>
      {(meta || trailing) && (
        <span className="s-list-item__trailing">
          {meta && <span className="s-list-item__meta">{meta}</span>}
          {trailing}
        </span>
      )}
    </button>
  );
}

export interface ConversationRowProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title">,
    Omit<ConversationSummary, "id"> {
  selected?: boolean;
}

export function ConversationRow({
  title,
  avatars,
  preview,
  time,
  unread = 0,
  pinned,
  muted,
  draft,
  isGroup,
  typing,
  verified,
  selected,
  className,
  type = "button",
  ...rest
}: ConversationRowProps) {
  const typingText = typing && typing.length > 0 ? (isGroup ? typingLabel(typing) : "typing…") : "";
  const isTyping = typingText.length > 0;
  const hasUnread = unread > 0;
  const first = avatars[0];
  return (
    <button
      type={type}
      className={cx("s-convo", selected && "is-selected", hasUnread && "is-unread", muted && "is-muted", className)}
      aria-current={selected || undefined}
      {...rest}
    >
      <span className="s-convo__avatar">
        {isGroup && avatars.length > 1 ? (
          <AvatarGroup people={avatars} max={2} size="sm" className="s-convo__stack" label={title} />
        ) : first ? (
          <Avatar name={first.name} src={first.src} presence={first.presence} size="md" decorative />
        ) : null}
      </span>
      <span className="s-convo__body">
        <span className="s-convo__top">
          <span className="s-convo__title">
            <span className="s-truncate">{title}</span>
            {isGroup && <Users size={14} className="s-convo__icon" aria-label="Group" role="img" />}
            {verified && <ShieldCheck size={14} className="s-convo__icon is-verified" aria-label="Verified" role="img" />}
          </span>
          {time && <span className="s-convo__time">{time}</span>}
        </span>
        <span className="s-convo__bottom">
          <span className={cx("s-convo__preview", isTyping && "is-typing")}>
            {isTyping ? (
              <span className="s-truncate">{typingText}</span>
            ) : draft ? (
              <span className="s-truncate">
                <span className="s-convo__draft">Draft: </span>
                {draft}
              </span>
            ) : (
              <span className="s-truncate">{preview}</span>
            )}
          </span>
          <span className="s-convo__flags">
            {muted && <BellOff size={14} aria-label="Muted" role="img" />}
            {pinned && <Pin size={14} aria-label="Pinned" role="img" />}
            <UnreadCount count={unread} muted={muted} />
          </span>
        </span>
      </span>
    </button>
  );
}
