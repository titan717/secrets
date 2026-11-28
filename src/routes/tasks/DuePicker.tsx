import { useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarOff, Clock, Sun, Sunrise, CalendarRange } from "lucide-react";
import { addDaysYmd, todayYmd } from "../../lib/features/dates";

export interface Due { due_date: string | null; due_time: string | null }

/** Popover with quick picks (Today / Tomorrow / Next week / Someday) + exact date and time. */
export function DuePicker({ value, onChange, children, align = "left" }: { value: Due; onChange: (v: Due) => void; children: (open: () => void, isOpen: boolean) => React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  const today = todayYmd();
  const nextMon = (() => {
    const d = new Date().getDay();
    return addDaysYmd(today, ((8 - d) % 7) || 7);
  })();
  const pick = (d: string | null) => {
    onChange({ due_date: d, due_time: d ? value.due_time : null });
    setOpen(false);
  };
  const quick = [
    { label: "Today", icon: <Sun size={16} />, d: today },
    { label: "Tomorrow", icon: <Sunrise size={16} />, d: addDaysYmd(today, 1) },
    { label: "Next week", icon: <CalendarRange size={16} />, d: nextMon },
    { label: "Someday", icon: <CalendarOff size={16} />, d: null },
  ];
  return (
    <div className="dp-wrap" ref={ref}>
      {children(() => setOpen((o) => !o), open)}
      {open && (
        <div className={`dp dp-${align}`} role="dialog" aria-label="Pick a date">
          {quick.map((q) => (
            <button key={q.label} className={`dp-opt ${value.due_date === q.d ? "is-on" : ""}`} onClick={() => pick(q.d)}>
              {q.icon}
              <span className="grow">{q.label}</span>
              <span className="faint">{q.d ? new Date(q.d + "T00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "No date"}</span>
            </button>
          ))}
          <div className="dp-sep" />
          <label className="dp-field">
            <CalendarDays size={16} />
            <input type="date" value={value.due_date ?? ""} min="2000-01-01" onChange={(e) => onChange({ due_date: e.target.value || null, due_time: e.target.value ? value.due_time : null })} />
          </label>
          <label className="dp-field">
            <Clock size={16} />
            <input
              type="time"
              value={value.due_time ?? ""}
              onChange={(e) => onChange({ due_date: value.due_date ?? today, due_time: e.target.value || null })}
            />
            {value.due_time && (
              <button className="dp-clear" onClick={() => onChange({ ...value, due_time: null })}>
                Clear
              </button>
            )}
          </label>
        </div>
      )}
    </div>
  );
}
