import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import { formatCount, unreadLabel } from "../shared/format";
import type { Tone } from "../shared/types";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: "soft" | "solid";
}

export function Badge({ tone = "neutral", variant = "soft", className, ...rest }: BadgeProps) {
  return <span className={cx("s-badge", `s-badge--${tone}`, `s-badge--${variant}`, className)} {...rest} />;
}

export interface UnreadCountProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  count: number;
  max?: number;
  /** Muted conversations show a neutral count. */
  muted?: boolean;
}

export function UnreadCount({ count, max = 99, muted, className, ...rest }: UnreadCountProps) {
  if (count <= 0) return null;
  return (
    <span className={cx("s-unread", muted && "is-muted", className)} {...rest}>
      <span aria-hidden="true">{formatCount(count, max)}</span>
      <span className="s-sr-only">{unreadLabel(count)}</span>
    </span>
  );
}
