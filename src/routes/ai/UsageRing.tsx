import { useNavigate } from "react-router-dom";
import { compact, useUsageSummary } from "../../lib/ai/usage";

/** Ring in the top-right: remaining % of the user's budget, or today's tokens without one. */
export function UsageRing({ size = 44, onClick }: { size?: number; onClick?: () => void }) {
  const nav = useNavigate();
  const sum = useUsageSummary();
  const today = sum.perDay[sum.perDay.length - 1];
  const used = sum.percentUsed;
  const remaining = used === null ? null : Math.max(0, Math.round(100 - used));
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const frac = remaining === null ? 0 : remaining / 100;
  const tone = remaining === null ? "" : remaining <= 10 ? "is-danger" : remaining <= 30 ? "is-warn" : "";
  const label =
    remaining === null
      ? `Usage today: ${compact((today?.tokensIn ?? 0) + (today?.tokensOut ?? 0))} tokens. Set a budget in Usage & Limits.`
      : `${remaining}% of your ${sum.budget?.period === "month" ? "monthly" : "daily"} budget left`;
  return (
    <button type="button" className={`g-ring ${tone}`} onClick={onClick ?? (() => nav("/ai/usage"))} aria-label={label} title={label} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="g-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="g-ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="g-ring-num">{remaining === null ? compact((today?.tokensIn ?? 0) + (today?.tokensOut ?? 0)) : remaining}</span>
    </button>
  );
}
