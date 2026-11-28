import type { ReactNode } from "react";
import { TopBar } from "../TopBar";

export function PageShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="g-thread">
      <TopBar title={title} />
      <div className="g-scroll">
        <div className="g-page">
          {actions && <div className="g-page-actions">{actions}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`g-card ${className}`}>{children}</section>;
}

export function relTime(iso: string | number): string {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const d = t - Date.now();
  const abs = Math.abs(d);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(d / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(d / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(d / 3_600_000), "hour");
  return rtf.format(Math.round(d / 86_400_000), "day");
}
