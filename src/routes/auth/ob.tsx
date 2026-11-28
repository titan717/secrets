import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { Avatar } from "../../ui";
import "./onboarding.css";

/** Full-screen onboarding page (blueprint p38–47): back arrow, content column, bottom action. */
export function ObScreen({ onBack, children, foot, label, className = "" }: { onBack?: () => void; children: ReactNode; foot?: ReactNode; label: string; className?: string }) {
  return (
    <main className={`ob ${className}`} aria-label={label}>
      <div className="ob-col">
        {onBack && (
          <button type="button" className="ob-back" aria-label="Back" onClick={onBack}>
            <ArrowLeft />
          </button>
        )}
        <div className="ob-body">{children}</div>
        {foot && <div className="ob-foot">{foot}</div>}
      </div>
    </main>
  );
}

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Demo Google accounts for the chooser (mock only). */
export const GOOGLE_ACCOUNTS = [
  { name: "Ava Chen", email: "ava@secrets.demo" },
  { name: "Maya Patel", email: "maya@secrets.demo" },
];

/** "Choose an account" sheet (blueprint p45). */
export function GoogleChooser({ open, onClose, onPick, onAdd }: { open: boolean; onClose: () => void; onPick: (email: string) => void; onAdd: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="ob-scrim" onClick={onClose}>
      <div className="ob-gsheet" role="dialog" aria-modal="true" aria-labelledby="ob-g-t" ref={ref} onClick={(e) => e.stopPropagation()}>
        <span className="ob-g-logo">
          <img src="/logo-mark.png" alt="" />
        </span>
        <h2 id="ob-g-t">Choose an account</h2>
        <p>to continue to Secrets</p>
        <ul>
          {GOOGLE_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button type="button" onClick={() => onPick(a.email)}>
                <Avatar name={a.name} size={28} />
                <span>
                  <strong>{a.name}</strong>
                  <small>{a.email}</small>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={onAdd}>
              <span className="ob-g-add" aria-hidden>
                <UserPlus />
              </span>
              <span>Add another account</span>
            </button>
          </li>
        </ul>
      </div>
    </div>,
    document.body,
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const longDate = (s: string) => {
  const d = fromIso(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** Material-style date picker dialog (blueprint p42–43): white header, purple calendar, CANCEL / OK. */
export function DatePickerDialog({ open, value, max, onCancel, onOk }: { open: boolean; value: string | null; max: Date; onCancel: () => void; onOk: (v: string) => void }) {
  const [sel, setSel] = useState(() => (value ? fromIso(value) : new Date(2000, 0, 1)));
  const [view, setView] = useState(() => new Date(sel.getFullYear(), sel.getMonth(), 1));
  const [years, setYears] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const d = value ? fromIso(value) : new Date(2000, 0, 1);
    setSel(d);
    setView(new Date(d.getFullYear(), d.getMonth(), 1));
    setYears(false);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    ref.current?.querySelector<HTMLButtonElement>(".ob-day.is-on")?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onCancel]);

  useEffect(() => {
    if (years) ref.current?.querySelector(".ob-year.is-on")?.scrollIntoView({ block: "center" });
  }, [years]);

  const cells = useMemo(() => {
    const first = view.getDay();
    const n = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)] as (number | null)[];
  }, [view]);

  if (!open) return null;
  const y = view.getFullYear();
  const m = view.getMonth();
  const canNext = new Date(y, m + 1, 1) <= max;
  const move = (delta: number) => setView(new Date(y, m + delta, 1));
  const pick = (d: number) => setSel(new Date(y, m, d));
  const onKey = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const nd = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() + step);
    if (nd > max) return;
    setSel(nd);
    setView(new Date(nd.getFullYear(), nd.getMonth(), 1));
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(".ob-day.is-on")?.focus());
  };
  const yearList = Array.from({ length: max.getFullYear() - 1900 + 1 }, (_, i) => max.getFullYear() - i);

  return createPortal(
    <div className="ob-scrim light" onClick={onCancel}>
      <div className="ob-dp" role="dialog" aria-modal="true" aria-label="Choose your date of birth" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="ob-dp-head">
          <span className="ob-dp-date">
            {DAYS[sel.getDay()]}, {sel.getDate()} {SHORT_MONTHS[sel.getMonth()]}
          </span>
        </div>
        <div className="ob-dp-body">
          <div className="ob-dp-nav">
            <button type="button" aria-label="Previous month" onClick={() => move(-1)} disabled={years}>
              <ChevronLeft />
            </button>
            <button type="button" className="ob-dp-month" aria-label={`${MONTHS[m]} ${y}, choose year`} onClick={() => setYears(!years)}>
              {MONTHS[m]} {y}
            </button>
            <button type="button" aria-label="Next month" onClick={() => move(1)} disabled={years || !canNext}>
              <ChevronRight />
            </button>
          </div>
          {years ? (
            <div className="ob-years" role="listbox" aria-label="Year">
              {yearList.map((yy) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={yy === y}
                  key={yy}
                  className={`ob-year ${yy === y ? "is-on" : ""}`}
                  onClick={() => {
                    setView(new Date(yy, m, 1));
                    const nd = new Date(yy, sel.getMonth(), Math.min(sel.getDate(), new Date(yy, sel.getMonth() + 1, 0).getDate()));
                    setSel(nd > max ? max : nd);
                    setYears(false);
                  }}
                >
                  {yy}
                </button>
              ))}
            </div>
          ) : (
            <div className="ob-cal" role="grid" onKeyDown={onKey}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="ob-wd" aria-hidden>
                  {d}
                </span>
              ))}
              {cells.map((d, i) => {
                if (!d) return <span key={i} />;
                const on = sel.getFullYear() === y && sel.getMonth() === m && sel.getDate() === d;
                const dis = new Date(y, m, d) > max;
                return (
                  <button type="button" key={i} className={`ob-day ${on ? "is-on" : ""}`} tabIndex={on ? 0 : -1} disabled={dis} aria-pressed={on} aria-label={`${d} ${MONTHS[m]} ${y}`} onClick={() => pick(d)}>
                    {d}
                  </button>
                );
              })}
            </div>
          )}
          <div className="ob-dp-actions">
            <button type="button" onClick={onCancel}>
              CANCEL
            </button>
            <button type="button" onClick={() => onOk(iso(sel))}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
