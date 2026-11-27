import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";

export interface TabItem {
  id: string;
  label: ReactNode;
  content?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
  variant?: "underline" | "pill";
}

/** WAI-ARIA tabs with roving tabindex, arrow/Home/End keys, automatic activation. */
export function Tabs({ items, value, defaultValue, onChange, label, className, variant = "underline" }: TabsProps) {
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const active = value ?? inner;
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = items.filter((i) => !i.disabled);

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
    refs.current[id]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const idx = enabled.findIndex((i) => i.id === active);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(enabled[next]!.id);
    }
  };
  const activeItem = items.find((i) => i.id === active);

  return (
    <div className={cx("s-tabs", `s-tabs--${variant}`, className)}>
      <div role="tablist" aria-label={label} className="s-tabs__list">
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={item.content !== undefined ? `${base}-panel-${item.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              className={cx("s-tab", selected && "is-selected")}
              onClick={() => select(item.id)}
              onKeyDown={onKeyDown}
            >
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>
      {activeItem?.content !== undefined && (
        <div
          role="tabpanel"
          id={`${base}-panel-${activeItem.id}`}
          aria-labelledby={`${base}-tab-${activeItem.id}`}
          tabIndex={0}
          className="s-tabs__panel"
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
