/** Blueprint UI kit: the shared building blocks of the settings/onboarding screens (see docs/BLUEPRINT-CHECKLIST.md). */
import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

export function Screen({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={`bp-screen ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

export function ScreenBody({ children, flush, className = "" }: { children: ReactNode; flush?: boolean; className?: string }) {
  return <div className={`bp-body ${flush ? "flush" : ""} ${className}`}>{children}</div>;
}

export interface ScreenHeaderProps {
  title: ReactNode;
  /** Path to go back to, or a handler. Defaults to history back. `false` hides the button. */
  back?: string | (() => void) | false;
  /** "chevron" (`<`, most pages) or "arrow" (`←`, settings home / My Story). */
  icon?: "chevron" | "arrow";
  size?: "md" | "lg" | "xl";
  divider?: boolean;
  actions?: ReactNode;
}

export function ScreenHeader({ title, back, icon = "chevron", size = "md", divider = true, actions }: ScreenHeaderProps) {
  const nav = useNavigate();
  const Icon = icon === "arrow" ? ArrowLeft : ChevronLeft;
  const onBack = () => {
    if (typeof back === "function") back();
    else if (typeof back === "string") nav(back);
    else nav(-1);
  };
  return (
    <header className={`bp-header ${size} ${divider ? "" : "no-divider"}`}>
      {back !== false && (
        <button type="button" className="bp-back" onClick={onBack} aria-label="Back">
          <Icon strokeWidth={icon === "arrow" ? 2 : 2.2} />
        </button>
      )}
      <h1>{title}</h1>
      {actions && <div className="bp-actions">{actions}</div>}
    </header>
  );
}

export function SectionLabel({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="bp-label" id={id}>
      <span>{children}</span>
      {aside && <span>{aside}</span>}
    </div>
  );
}

export function Group({ children, label, className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={`bp-group ${className}`} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export interface RowProps {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  /** Right-side control (switch, radio …). Replaces the chevron. */
  trailing?: ReactNode;
  chevron?: boolean;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  /** ARIA role override, e.g. "radio" or "switch" for whole-row controls. */
  role?: string;
  checked?: boolean;
  label?: string;
}

export function Row({ icon, title, sub, value, trailing, chevron, to, onClick, danger, disabled, className = "", role, checked, label }: RowProps) {
  const cls = `bp-row ${sub ? "two" : ""} ${icon ? "iconed" : ""} ${danger ? "danger" : ""} ${className}`;
  const inner = (
    <>
      {icon && <span className="bp-ic" aria-hidden>{icon}</span>}
      <span className="bp-main">
        <span className="bp-title" style={{ display: "block" }}>{title}</span>
        {sub && <span className="bp-sub" style={{ display: "block" }}>{sub}</span>}
      </span>
      {value !== undefined && value !== null && <span className="bp-value">{value}</span>}
      {trailing}
      {(chevron ?? (!!to && !trailing)) && <ChevronRight className="bp-chev" aria-hidden />}
    </>
  );
  if (to && !disabled) {
    return (
      <Link to={to} className={cls} aria-label={label}>
        {inner}
      </Link>
    );
  }
  const roleChecked = role === "radio" || role === "switch" || role === "checkbox";
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} role={role} aria-checked={roleChecked ? !!checked : undefined} aria-label={label}>
      {inner}
    </button>
  );
}

export function Radio({ checked }: { checked: boolean }) {
  return <span className={`bp-radio ${checked ? "on" : "off"}`} aria-hidden />;
}

export function Switch({
  checked,
  onChange,
  label,
  variant = "mono",
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  variant?: "mono" | "accent";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`bp-switch ${variant === "accent" ? "accent" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    />
  );
}

/** A full row whose whole surface toggles the switch. */
export function SwitchRow({ icon, title, sub, checked, onChange, disabled }: { icon?: ReactNode; title: string; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`bp-row ${sub ? "two" : ""} ${icon ? "iconed" : ""}`} onClick={() => !disabled && onChange(!checked)}>
      {icon && <span className="bp-ic" aria-hidden>{icon}</span>}
      <span className="bp-main">
        <span className="bp-title" style={{ display: "block" }}>{title}</span>
        {sub && <span className="bp-sub" style={{ display: "block" }}>{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

export function PillButton({ variant = "solid", auto, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost"; auto?: boolean }) {
  return <button type="button" className={`bp-pill ${variant === "ghost" ? "ghost" : ""} ${auto ? "auto" : ""} ${className}`} {...rest} />;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="bp-sheet-scrim" onClick={onClose}>
      <div className="bp-sheet" role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <div className="bp-grab" aria-hidden />
        <h2 id={id} className="sr-only">{title}</h2>
        {children}
      </div>
    </div>
  );
}
