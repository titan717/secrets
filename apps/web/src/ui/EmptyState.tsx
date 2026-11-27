import type { ReactNode } from "react";
import { Ghost } from "./Logo";

export function EmptyState({ title, body, action, art, compact }: { title: string; body?: ReactNode; action?: ReactNode; art?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty ${compact ? "empty-compact" : ""}`}>
      {art ?? <Ghost size={compact ? 72 : 120} float />}
      <h3>{title}</h3>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}
