import { useState, type HTMLAttributes } from "react";
import { cx } from "../cx";
import { avatarColor, initials, PRESENCE_LABEL } from "../shared/format";
import type { AvatarData, AvatarSize, Presence } from "../shared/types";

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  name: string;
  src?: string;
  size?: AvatarSize;
  presence?: Presence;
  /** Render without an accessible name (when the name is shown next to it). */
  decorative?: boolean;
}

export function Avatar({ name, src, size = "md", presence, decorative, className, ...rest }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = presence ? `${name}, ${PRESENCE_LABEL[presence]}` : name;
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": label };
  return (
    <span className={cx("s-avatar", `s-avatar--${size}`, className)} {...a11y} {...rest}>
      {src && !failed ? (
        <img src={src} alt="" className="s-avatar__img" onError={() => setFailed(true)} />
      ) : (
        <span className="s-avatar__initials" style={{ background: avatarColor(name) }} aria-hidden="true">
          {initials(name)}
        </span>
      )}
      {presence && presence !== "offline" && (
        <span className={cx("s-avatar__presence", `is-${presence}`)} aria-hidden="true" />
      )}
    </span>
  );
}

export interface AvatarGroupProps extends HTMLAttributes<HTMLSpanElement> {
  people: AvatarData[];
  max?: number;
  size?: AvatarSize;
  /** Accessible label; defaults to listing names. */
  label?: string;
}

export function AvatarGroup({ people, max = 3, size = "sm", label, className, ...rest }: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const name =
    label ?? (extra > 0 ? `${shown.map((p) => p.name).join(", ")} and ${extra} more` : people.map((p) => p.name).join(", "));
  return (
    <span role="img" aria-label={name} className={cx("s-avatar-group", `s-avatar-group--${size}`, className)} {...rest}>
      {shown.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} src={p.src} size={size} decorative />
      ))}
      {extra > 0 && (
        <span className={cx("s-avatar", `s-avatar--${size}`, "s-avatar--more")} aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  );
}
