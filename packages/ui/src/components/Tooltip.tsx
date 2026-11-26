import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "../cx";
import { Button } from "./Button";

export interface TooltipProps {
  content: ReactNode;
  /** A single focusable element. */
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

/** Hover/focus tooltip linked via aria-describedby; Escape dismisses. */
export function Tooltip({ content, children, side = "top", delay = 400 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const show = (immediate = false) => {
    clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  if (!isValidElement(children)) return children;
  const trigger = cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: () => show(),
    onMouseLeave: hide,
    onFocus: () => show(true),
    onBlur: hide,
  });
  return (
    <span className="s-tooltip-anchor">
      {trigger}
      {open && (
        <span role="tooltip" id={id} className={cx("s-tooltip", `s-tooltip--${side}`)}>
          {content}
        </span>
      )}
    </span>
  );
}

export interface CoachMarkProps {
  title: ReactNode;
  children: ReactNode;
  step: number;
  total: number;
  onDismiss: () => void;
  onNext?: () => void;
  dismissLabel?: string;
  nextLabel?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * One-at-a-time onboarding tip with "n of m" dots. Non-modal: it never traps
 * focus; it moves focus to its primary button once so keyboard users can act.
 */
export function CoachMark({
  title,
  children,
  step,
  total,
  onDismiss,
  onNext,
  dismissLabel = "Got it",
  nextLabel = "Next",
  side = "bottom",
  className,
}: CoachMarkProps) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
  }, [step]);
  const last = step >= total || !onNext;
  return (
    <div role="dialog" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`} className={cx("s-coach", `s-coach--${side}`, className)}>
      <p id={`${id}-t`} className="s-coach__title">{title}</p>
      <div id={`${id}-b`} className="s-coach__body">{children}</div>
      <div className="s-coach__footer">
        <span className="s-coach__dots" role="img" aria-label={`Tip ${step} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx("s-coach__dot", i + 1 === step && "is-active")} />
          ))}
        </span>
        <span className="s-coach__actions">
          {!last && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Skip
            </Button>
          )}
          <Button ref={btn} size="sm" variant="primary" onClick={last ? onDismiss : onNext}>
            {last ? dismissLabel : nextLabel}
          </Button>
        </span>
      </div>
    </div>
  );
}
