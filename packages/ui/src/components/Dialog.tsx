import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "../cx";
import { IconButton } from "./Button";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** `modal` centered, `sheet` bottom sheet (mobile), `side` right panel. */
  variant?: "modal" | "sheet" | "side";
  size?: "sm" | "md" | "lg";
  hideClose?: boolean;
  /** Close when clicking the scrim. Default true. */
  dismissible?: boolean;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Accessible dialog: role="dialog" aria-modal, labelled/described, Escape to
 * close, focus trapped inside and restored on close, body scroll locked.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  size = "md",
  hideClose,
  dismissible = true,
  className,
  initialFocusRef,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = panel.current;
    const first = initialFocusRef?.current ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab" && el) {
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) {
          e.preventDefault();
          return;
        }
        const f = nodes[0]!;
        const l = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === f) {
          e.preventDefault();
          l.focus();
        } else if (!e.shiftKey && document.activeElement === l) {
          e.preventDefault();
          f.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, initialFocusRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={cx("s-dialog-root", `s-dialog-root--${variant}`)}>
      <div className="s-scrim" aria-hidden="true" onClick={dismissible ? onClose : undefined} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
        className={cx("s-dialog", `s-dialog--${variant}`, `s-dialog--${size}`, className)}
      >
        {variant === "sheet" && <span className="s-dialog__grabber" aria-hidden="true" />}
        <header className="s-dialog__header">
          <h2 id={`${id}-t`} className="s-dialog__title">{title}</h2>
          {!hideClose && <IconButton size="sm" label="Close" icon={<X size={18} />} onClick={onClose} />}
        </header>
        {description && <p id={`${id}-d`} className="s-dialog__desc">{description}</p>}
        {children && <div className="s-dialog__body">{children}</div>}
        {footer && <footer className="s-dialog__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Bottom sheet alias (mobile web compose, actions). */
export function Sheet(props: Omit<DialogProps, "variant"> & { side?: boolean }) {
  const { side, ...rest } = props;
  return <Dialog {...rest} variant={side ? "side" : "sheet"} />;
}
