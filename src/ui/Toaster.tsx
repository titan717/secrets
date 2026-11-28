import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useToasts } from "../stores/toast";

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          {t.kind === "success" ? <CheckCircle2 size={18} /> : t.kind === "error" ? <AlertCircle size={18} /> : <Info size={18} />}
          <span className="grow">{t.text}</span>
          <button className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
