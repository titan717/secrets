import { useId, type ReactNode } from "react";

export interface TabItem<T extends string> { id: T; label: ReactNode; count?: number }
export function Tabs<T extends string>({ items, value, onChange, variant = "underline", className = "" }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; variant?: "underline" | "pill"; className?: string }) {
  const id = useId();
  return (
    <div role="tablist" className={`tabs tabs-${variant} ${className}`}>
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`${id}-${t.id}`}
          aria-selected={value === t.id}
          className={`tab ${value === t.id ? "is-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
