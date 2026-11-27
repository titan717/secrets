import type { ReactNode } from "react";
import { cx } from "../cx";
import mascot from "../assets/mascot-ghost.png";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Defaults to the Secrets ghost. Pass null for no illustration. */
  illustration?: ReactNode | null;
  size?: "sm" | "md";
  className?: string;
  /** Heading level for the title. */
  as?: "h2" | "h3" | "p";
}

export const mascotSrc: string = mascot;

export function EmptyState({ title, description, action, illustration, size = "md", className, as: Title = "h2" }: EmptyStateProps) {
  return (
    <div className={cx("s-empty", `s-empty--${size}`, className)}>
      {illustration === undefined ? (
        <img src={mascot} alt="" className="s-empty__art" width={size === "sm" ? 72 : 120} height={size === "sm" ? 72 : 120} />
      ) : (
        illustration
      )}
      <Title className="s-empty__title">{title}</Title>
      {description && <p className="s-empty__desc">{description}</p>}
      {action && <div className="s-empty__action">{action}</div>}
    </div>
  );
}
