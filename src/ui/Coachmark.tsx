import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../stores/settings";

export interface CoachStep {
  /** `data-coach` value of the element to point at. */
  target: string;
  title: string;
  body: string;
}

/** Find the first visible `[data-coach=target]` element. */
function findTarget(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-coach="${target}"]`));
  return all.find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden") ?? null;
}

function useRect(get: () => HTMLElement | null, key: unknown) {
  const [rect, setRect] = useState<{ r: DOMRect; radius: number } | null>(null);
  const getRef = useRef(get);
  getRef.current = get;
  useLayoutEffect(() => {
    const find = () => {
      const el = getRef.current();
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      const br = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      setRect((old) => (old && old.r.x === r.x && old.r.y === r.y && old.r.width === r.width && old.r.height === r.height ? old : { r, radius: br }));
    };
    find();
    window.addEventListener("resize", find);
    window.addEventListener("scroll", find, true);
    const iv = setInterval(find, 400);
    return () => {
      window.removeEventListener("resize", find);
      window.removeEventListener("scroll", find, true);
      clearInterval(iv);
    };
  }, [key]);
  return rect;
}

interface BubbleProps {
  rect: { r: DOMRect; radius: number } | null;
  title: string;
  body: string;
  index?: number;
  total?: number;
  /** Primary pill label. */
  primary: string;
  onPrimary: () => void;
  /** Optional text button left of the pill (p29: "Got it" + "Continue"). */
  secondary?: string;
  onSecondary?: () => void;
  onDismiss: () => void;
}

const W = 328;
const GAP = 14;

function Bubble({ rect, title, body, index, total, primary, onPrimary, secondary, onSecondary, onDismiss }: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(150);
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onDismiss]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(W, vw - 32);
  let style: CSSProperties = { left: (vw - width) / 2, bottom: 110, width };
  let arrow: CSSProperties | null = null;
  let ring: CSSProperties | null = null;
  if (rect) {
    const { r, radius } = rect;
    const pad = 5;
    ring = { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, borderRadius: radius ? radius + pad : 14 };
    const cx = r.left + r.width / 2;
    const left = Math.min(vw - width - 16, Math.max(16, cx - width / 2));
    const below = r.bottom + pad + GAP + h < vh - 8 || r.top - pad - GAP - h < 8;
    style = below ? { left, top: r.bottom + pad + GAP, width } : { left, top: r.top - pad - GAP - h, width };
    const ax = Math.min(width - 22, Math.max(16, cx - left - 7));
    arrow = below ? { left: ax, top: -6 } : { left: ax, bottom: -6 };
  }
  return createPortal(
    <>
      <div className={`bp-dim ${ring ? "clear" : ""}`} onClick={onDismiss} aria-hidden />
      {ring && <div className="bp-ring" style={ring} aria-hidden />}
      <div ref={ref} className="bp-tip" style={style} role="dialog" aria-live="polite" aria-label={title}>
        {arrow && <span className="bp-tip-arrow" style={arrow} aria-hidden />}
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="bp-tip-foot">
          <span className="bp-dots" aria-label={total ? `Tip ${(index ?? 0) + 1} of ${total}` : undefined}>
            {total && total > 1 ? Array.from({ length: total }, (_, k) => <i key={k} className={k === index ? "on" : ""} />) : null}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {secondary && (
              <button className="bp-tip-skip" onClick={onSecondary}>
                {secondary}
              </button>
            )}
            <button className="bp-tip-next" onClick={onPrimary} autoFocus>
              {primary}
            </button>
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * First-run tip tour (blueprint p21–27, p29–32). One bubble at a time anchored to
 * `[data-coach=target]`, dots for progress, Next / Got it. Remembered per tour id.
 * Steps whose target isn't on screen are skipped.
 */
export function CoachTour({
  id,
  steps,
  delay = 700,
  finalSecondary,
  onFinalPrimary,
}: {
  id: string;
  steps: CoachStep[];
  delay?: number;
  /** Text button on the last step (p29 "Got it"); the pill then reads "Continue". */
  finalSecondary?: string;
  onFinalPrimary?: () => void;
}) {
  const seen = useSettings((s) => !!s.coachSeen[id]);
  const markCoach = useSettings((s) => s.markCoach);
  const [i, setI] = useState(-1);

  useEffect(() => {
    if (seen) return;
    const t = setTimeout(() => setI(0), delay);
    return () => clearTimeout(t);
  }, [seen, delay]);

  const step = i >= 0 ? steps[i] : undefined;
  const rect = useRect(() => (step ? findTarget(step.target) : null), step?.target);

  if (seen || !step) return null;
  const finish = () => {
    markCoach(id);
    setI(-1);
  };
  const last = i === steps.length - 1;
  const next = () => (last ? finish() : setI(i + 1));
  return (
    <Bubble
      rect={rect}
      title={step.title}
      body={step.body}
      index={i}
      total={steps.length}
      primary={last ? (finalSecondary ? "Continue" : "Got it") : "Next"}
      onPrimary={() => {
        if (last && onFinalPrimary) {
          finish();
          onFinalPrimary();
        } else next();
      }}
      secondary={last ? finalSecondary : undefined}
      onSecondary={finish}
      onDismiss={finish}
    />
  );
}

/** A single tip anchored to an element ref (e.g. Stories "Preview it first", p28). */
export function TipBubble({ target, title, body, onDone }: { target: RefObject<HTMLElement>; title: string; body: string; onDone: () => void; single?: boolean }) {
  const rect = useRect(() => target.current, target);
  return <Bubble rect={rect} title={title} body={body} primary="Got it" onPrimary={onDone} onDismiss={onDone} />;
}
