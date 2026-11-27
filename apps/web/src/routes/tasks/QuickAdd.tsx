import { useMemo, useRef, useState } from "react";
import { CalendarDays, CornerDownLeft, Flag, Plus } from "lucide-react";
import { parseQuickAdd, dueLabel } from "../../lib/features/dates";
import { useTasks } from "../../lib/features/tasks";
import { DuePicker, type Due } from "./DuePicker";

/** "e.g. Call mom tomorrow !high" — natural-language quick add with live preview chips. */
export function QuickAdd({ defaultDue, autoFocus, placeholder = "e.g. Call mom tomorrow 6pm !high" }: { defaultDue?: string | null; autoFocus?: boolean; placeholder?: string }) {
  const [text, setText] = useState("");
  const [manual, setManual] = useState<Due | null>(null);
  const [busy, setBusy] = useState(false);
  const add = useTasks((s) => s.add);
  const ref = useRef<HTMLInputElement>(null);
  const p = useMemo(() => parseQuickAdd(text), [text]);
  const due: Due = manual ?? { due_date: p.due_date ?? (defaultDue ?? null), due_time: p.due_time };

  const submit = async () => {
    if (!p.title || busy) return;
    setBusy(true);
    const t = await add({ title: p.title, due_date: due.due_date, due_time: due.due_time, priority: p.priority ?? undefined });
    setBusy(false);
    if (t) {
      setText("");
      setManual(null);
      ref.current?.focus();
    }
  };

  return (
    <div className="qa">
      <div className="qa-box input-box input-wrap">
        <Plus size={18} className="input-adorn" />
        <input
          ref={ref}
          className="input"
          aria-label="New task"
          placeholder={placeholder}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          maxLength={300}
        />
        <DuePicker value={due} onChange={setManual} align="right">
          {(open, isOpen) => (
            <button className={`qa-date ${due.due_date ? "is-set" : ""} ${isOpen ? "is-open" : ""}`} onClick={open} aria-label="Pick a date">
              <CalendarDays size={15} />
              <span>{due.due_date ? dueLabel(due.due_date, due.due_time) : "Pick a date"}</span>
            </button>
          )}
        </DuePicker>
      </div>
      {text.trim() && (
        <div className="qa-preview" aria-live="polite">
          <span className="qa-chip-title truncate">{p.title || "…"}</span>
          {due.due_date && <span className="qa-chip">{dueLabel(due.due_date, due.due_time)}</span>}
          {p.priority && (
            <span className={`qa-chip pri-${p.priority}`}>
              <Flag size={11} /> {p.priority}
            </span>
          )}
          <span className="grow" />
          <span className="qa-enter">
            <CornerDownLeft size={12} /> to add
          </span>
        </div>
      )}
    </div>
  );
}
