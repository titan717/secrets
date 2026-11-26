import type { CSSProperties } from "react";
import { cx } from "../cx";

export interface SkeletonProps {
  shape?: "line" | "circle" | "rect";
  width?: number | string;
  height?: number | string;
  className?: string;
}

/** Decorative placeholder. Wrap groups in an element with aria-busy + a label. */
export function Skeleton({ shape = "line", width, height, className }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  return <span className={cx("s-skeleton", `s-skeleton--${shape}`, className)} style={style} aria-hidden="true" />;
}

export function ConversationRowSkeleton() {
  return (
    <div className="s-convo s-convo--skeleton" aria-hidden="true">
      <Skeleton shape="circle" width={40} height={40} />
      <span className="s-convo__body">
        <Skeleton width="55%" />
        <Skeleton width="80%" />
      </span>
    </div>
  );
}

export function ConversationListSkeleton({ rows = 6, label = "Loading conversations" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="s-skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <ConversationRowSkeleton key={i} />
      ))}
    </div>
  );
}
