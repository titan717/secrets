import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EffortLevel } from "@shared";
import { EFFORT_LEVELS, EFFORT_META, effortSummary, effortPosition } from "../../lib/ai/effort";
import { useAiSettings } from "../../lib/ai/settings";

/**
 * Full-screen effort picker from the blueprint: dimmed page, "<Level> effort" title and a wide
 * pill slider with five stops. Drag, tap a stop, or use arrow keys. Release closes it.
 */
export function EffortSlider({ open, onClose, onCustom }: { open: boolean; onClose: () => void; onCustom: () => void }) {
  const effort = useAiSettings((s) => s.effort);
  const customSteps = useAiSettings((s) => s.customSteps);
  const thinkingBudget = useAiSettings((s) => s.thinkingBudget);
  const set = useAiSettings((s) => s.set);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const closeTimer = useRef<number>();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => track.current?.focus());
    return () => {
      prev?.focus?.();
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(closeTimer.current);
    };
  }, [open, onClose]);

  if (!open) return null;

  const idx = effort === "custom" ? -1 : EFFORT_LEVELS.indexOf(effort);
  const pos = drag ?? effortPosition(effort, customSteps);
  const shown: EffortLevel = drag !== null ? EFFORT_LEVELS[Math.round(drag * (EFFORT_LEVELS.length - 1))] : effort;
  const label = shown === "custom" ? "Custom" : EFFORT_META[shown].label;

  const fromX = (clientX: number) => {
    const el = track.current!;
    const r = el.getBoundingClientRect();
    const pad = 32; // thumb radius
    return Math.min(1, Math.max(0, (clientX - r.left - pad) / (r.width - pad * 2)));
  };
  const commit = (p: number) => {
    const lvl = EFFORT_LEVELS[Math.round(p * (EFFORT_LEVELS.length - 1))];
    set({ effort: lvl });
    return lvl;
  };
  const step = (d: number) => {
    const i = Math.min(EFFORT_LEVELS.length - 1, Math.max(0, (idx < 0 ? 2 : idx) + d));
    set({ effort: EFFORT_LEVELS[i] });
  };

  return createPortal(
    <div className="g-effort-root" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="g-effort">
        <div className="g-effort-title" aria-live="polite">
          <span className="g-effort-word">{label}</span> effort
        </div>
        <div className="g-effort-sub">{effortSummary(shown, { maxSteps: customSteps, thinkingBudget })}</div>
        <div
          ref={track}
          className={`g-effort-track ${drag !== null ? "is-dragging" : ""}`}
          role="slider"
          tabIndex={0}
          aria-label="Effort"
          aria-valuemin={0}
          aria-valuemax={EFFORT_LEVELS.length - 1}
          aria-valuenow={idx < 0 ? 2 : idx}
          aria-valuetext={`${label} effort`}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); step(1); }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); step(-1); }
            if (e.key === "Home") set({ effort: "instant" });
            if (e.key === "End") set({ effort: "ultra" });
          }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            window.clearTimeout(closeTimer.current);
            setDrag(fromX(e.clientX));
          }}
          onPointerMove={(e) => drag !== null && setDrag(fromX(e.clientX))}
          onPointerUp={(e) => {
            if (drag === null) return;
            commit(fromX(e.clientX));
            setDrag(null);
            closeTimer.current = window.setTimeout(onClose, 550);
          }}
          onPointerCancel={() => setDrag(null)}
          style={{ ["--p" as string]: pos }}
        >
          <div className="g-effort-fill" />
          {EFFORT_LEVELS.map((l, i) => (
            <span key={l} className="g-effort-stop" style={{ ["--i" as string]: i / (EFFORT_LEVELS.length - 1) }} aria-hidden />
          ))}
          <div className="g-effort-thumb" />
        </div>
        <div className="g-effort-legend" aria-hidden>
          {EFFORT_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              tabIndex={-1}
              className={l === shown ? "is-on" : ""}
              onClick={() => {
                set({ effort: l });
                closeTimer.current = window.setTimeout(onClose, 450);
              }}
            >
              {EFFORT_META[l].label}
            </button>
          ))}
        </div>
        <button type="button" className={`g-effort-custom ${effort === "custom" ? "is-on" : ""}`} onClick={onCustom}>
          {effort === "custom" ? `Custom: ${customSteps} steps · ${thinkingBudget ? `${thinkingBudget} thinking tokens` : "no reasoning"} — edit` : "Custom steps and thinking budget…"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
