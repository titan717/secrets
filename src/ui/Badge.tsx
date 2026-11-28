import type { ReactNode } from "react";
export function Badge({ children, tone = "accent", className = "" }: { children: ReactNode; tone?: "accent" | "neutral" | "success" | "danger" | "outline"; className?: string }) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}
export function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="count-badge" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>;
}
