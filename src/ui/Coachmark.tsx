import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../stores/settings";

export interface CoachStep {
  /** CSS selector of the element to point at (data-coach="...") */
  target: string;
  title: string;
  body: string;
}

/**
 * First-run coach-mark tour. Shows one tooltip at a time anchored to
 * `[data-coach=target]`, with Next / Got it. Remembered per tour id.
 */
export function CoachTour({ id, steps, delay = 700 }: { id: string; steps: CoachStep[]; delay?: number }) {
  const seen = useSettings((s) => s.coachSeen[id]);
  const markCoach = useSettings((s) => s.markCoach);
  const [i, setI] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (seen) return;
    const t = setTimeout(() => setI(0), delay);
    return () => clearTimeout(t);
  }, [seen, delay]);

  const step = i >= 0 ? steps[i] : undefined;
  useLayoutEffect(() => {
    if (!step) return;
    const find = () => {
      const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-coach="${step.target}"]`));
      const el = all.find((e) => e.offsetParent !== null || e.getClientRects().length);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    window.addEventListener("resize", find);
    const iv = setInterval(find, 500);
    return () => {
      window.removeEventListener("resize", find);
      clearInterval(iv);
    };
  }, [step]);

  if (seen || !step) return null;
  const finish = () => {
    markCoach(id);
    setI(-1);
  };
  const next = () => (i < steps.length - 1 ? setI(i + 1) : finish());

  // Place below if room, else above; clamp horizontally.
  const W = 280;
  let style: React.CSSProperties = { left: "50%", bottom: 96, transform: "translateX(-50%)" };
  let arrow: "up" | "down" | "none" = "none";
  if (rect) {
    const below = rect.bottom + 12 + 150 < window.innerHeight;
    const left = Math.min(window.innerWidth - W - 12, Math.max(12, rect.left + rect.width / 2 - W / 2));
    style = below ? { left, top: rect.bottom + 12 } : { left, top: rect.top - 12, transform: "translateY(-100%)" };
    arrow = below ? "up" : "down";
    (style as Record<string, unknown>)["--arrow-x"] = `${Math.min(W - 20, Math.max(20, rect.left + rect.width / 2 - left))}px`;
  }
  return createPortal(
    <>
      {rect && <div className="coach-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className={`coach coach-${arrow}`} style={{ ...style, width: W }} role="dialog" aria-live="polite" aria-label={step.title}>
        <div className="coach-step">
          {i + 1} / {steps.length}
        </div>
        <strong className="coach-title">{step.title}</strong>
        <p className="coach-body">{step.body}</p>
        <div className="coach-actions">
          <button className="coach-skip" onClick={finish}>
            {i < steps.length - 1 ? "Skip" : ""}
          </button>
          <button className="coach-next" onClick={next} autoFocus>
            {i < steps.length - 1 ? "Next" : "Got it"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
