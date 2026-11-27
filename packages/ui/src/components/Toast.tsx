import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cx } from "../cx";
import { IconButton } from "./Button";

export type ToastTone = "info" | "success" | "danger";

export interface ToastData {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  /** ms; 0 = sticky. Default 5000. */
  duration?: number;
}

export interface ToastProps extends ToastData {
  onDismiss?: () => void;
}

const ICON = { info: Info, success: CheckCircle2, danger: AlertCircle };

export function Toast({ title, description, tone = "info", action, onDismiss }: ToastProps) {
  const Icon = ICON[tone];
  return (
    <div className={cx("s-toast", `s-toast--${tone}`)} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={18} className="s-toast__icon" aria-hidden="true" />
      <div className="s-toast__body">
        <div className="s-toast__title">{title}</div>
        {description && <div className="s-toast__desc">{description}</div>}
      </div>
      {action && (
        <button type="button" className="s-toast__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onDismiss && <IconButton size="sm" label="Dismiss" icon={<X size={16} />} onClick={onDismiss} />}
    </div>
  );
}

interface ToastApi {
  show: (t: ToastData) => string;
  dismiss: (id: string) => void;
}
const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<ToastData & { id: string }>>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (t: ToastData) => {
      const id = t.id ?? `toast-${++seq}`;
      setToasts((ts) => [...ts.filter((x) => x.id !== id), { ...t, id }].slice(-3));
      const d = t.duration ?? 5000;
      if (d > 0) timers.current.set(id, setTimeout(() => dismiss(id), d));
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <section className="s-toaster" aria-label="Notifications">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onDismiss={() => dismiss(t.id)} />
        ))}
      </section>
    </ToastCtx.Provider>
  );
}
