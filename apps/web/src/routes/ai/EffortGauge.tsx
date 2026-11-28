import type { EffortLevel } from "@secrets/shared";
import { effortPosition } from "../../lib/ai/effort";

/** Small speedometer icon whose needle and arc follow the effort level. */
export function EffortGauge({ level, customSteps, size = 24 }: { level: EffortLevel; customSteps?: number; size?: number }) {
  const p = effortPosition(level, customSteps);
  // arc from 210deg (left-bottom) to -30deg (right-bottom), clockwise through the top
  const start = 210;
  const sweep = 240;
  const ang = ((start - sweep * p) * Math.PI) / 180;
  const cx = 12;
  const cy = 13;
  const R = 8.5;
  const pt = (deg: number) => [cx + R * Math.cos((deg * Math.PI) / 180), cy - R * Math.sin((deg * Math.PI) / 180)];
  const [sx, sy] = pt(start);
  const [ex, ey] = pt(start - sweep);
  const [fx, fy] = pt(start - sweep * Math.max(0.02, p));
  const large = sweep * p > 180 ? 1 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="g-gauge">
      <path d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`} stroke="currentColor" strokeOpacity=".35" strokeWidth="2.2" strokeLinecap="round" />
      <path d={`M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${fx} ${fy}`} stroke="var(--g-effort)" strokeWidth="2.2" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + 5.2 * Math.cos(ang)} y2={cy - 5.2 * Math.sin(ang)} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
