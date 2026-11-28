import type { ReactNode } from "react";
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "right" | "bottom" }) {
  return (
    <span className={`tip tip-${side}`} data-tip={label}>
      {children}
    </span>
  );
}
