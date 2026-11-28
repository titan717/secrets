import { useEffect, useRef, type ReactNode } from "react";

/** Minimal anchored menu. Closes on outside click and Escape. */
export function Popover({ open, onClose, children, className = "", label }: { open: boolean; onClose: () => void; children: ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-popover-anchor]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`g-pop ${className}`} role="menu" aria-label={label}>
      {children}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled, hint }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; hint?: ReactNode }) {
  return (
    <button type="button" role="menuitem" className={`g-pop-item ${danger ? "is-danger" : ""}`} onClick={onClick} disabled={disabled}>
      {icon}
      <span className="grow">{children}</span>
      {hint && <span className="faint g-pop-hint">{hint}</span>}
    </button>
  );
}
