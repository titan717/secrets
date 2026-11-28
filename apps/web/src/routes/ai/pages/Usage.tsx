import { useState } from "react";
import type { AiUsageBudget } from "@secrets/shared";
import { Button, Input, Tabs } from "../../../ui";
import { compact, usd, useAiUsage, useUsageSummary } from "../../../lib/ai/usage";
import { PageShell, Card } from "./Shell";

function BigRing({ remaining }: { remaining: number | null }) {
  const size = 168;
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const frac = remaining === null ? 0 : remaining / 100;
  const tone = remaining === null ? "" : remaining <= 10 ? "is-danger" : remaining <= 30 ? "is-warn" : "";
  return (
    <div className={`g-bigring ${tone}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="g-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="g-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="g-bigring-txt">
        <b>{remaining === null ? "—" : `${remaining}%`}</b>
        <span>{remaining === null ? "No budget" : "left"}</span>
      </div>
    </div>
  );
}

export default function UsagePage() {
  const sum = useUsageSummary();
  const budget = useAiUsage((s) => s.budget);
  const setBudget = useAiUsage((s) => s.setBudget);
  const reset = useAiUsage((s) => s.reset);
  const [draft, setDraft] = useState<AiUsageBudget>(budget ?? { kind: "tokens", amount: 200_000, period: "day" });
  const remaining = sum.percentUsed === null ? null : Math.max(0, Math.round(100 - sum.percentUsed));
  const max = Math.max(1, ...sum.perDay.map((d) => d.tokensIn + d.tokensOut));
  return (
    <PageShell title="Usage & Limits">
      <Card className="g-usage-hero">
        <BigRing remaining={remaining} />
        <div className="g-stats">
          <div><span>Tokens in</span><b>{compact(sum.tokensIn)}</b></div>
          <div><span>Tokens out</span><b>{compact(sum.tokensOut)}</b></div>
          <div><span>Est. cost</span><b>{usd(sum.cost)}</b></div>
        </div>
      </Card>

      <h3 className="g-sec">Budget</h3>
      <Card>
        <div className="col" style={{ gap: 12 }}>
          <Tabs<AiUsageBudget["kind"]> variant="pill" items={[{ id: "tokens", label: "Tokens" }, { id: "usd", label: "Dollars" }]} value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
          <div className="g-budget">
            <Input label={draft.kind === "usd" ? "Amount (USD)" : "Tokens"} type="number" min={0} step={draft.kind === "usd" ? 0.5 : 10000} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: Math.max(0, +e.target.value || 0) })} />
            <div className="col" style={{ gap: 6 }}>
              <span className="g-label">Resets</span>
              <Tabs<AiUsageBudget["period"]> variant="pill" items={[{ id: "day", label: "Daily" }, { id: "month", label: "Monthly" }]} value={draft.period} onChange={(period) => setDraft({ ...draft, period })} />
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button onClick={() => setBudget(draft.amount > 0 ? draft : null)}>Save budget</Button>
            {budget && <Button variant="ghost" onClick={() => setBudget(null)}>Remove</Button>}
          </div>
          <p className="faint ai-small">The ring in the top bar shows what’s left. Costs are estimates unless the bridge reports real numbers.</p>
        </div>
      </Card>

      <h3 className="g-sec">Last 14 days</h3>
      <Card>
        <div className="g-bars" role="img" aria-label="Tokens per day, last 14 days">
          {sum.perDay.map((d) => {
            const t = d.tokensIn + d.tokensOut;
            return (
              <div key={d.date} className="g-bar" title={`${d.date}: ${compact(t)} tokens, ${usd(d.cost)}`}>
                <i style={{ height: `${Math.max(2, (t / max) * 100)}%` }} />
                <span>{new Date(d.date + "T00:00").toLocaleDateString(undefined, { day: "numeric" })}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <h3 className="g-sec">By model</h3>
      {sum.perModel.length === 0 ? (
        <p className="faint">No usage yet.</p>
      ) : (
        <Card className="g-tablecard">
          <table className="g-table">
            <thead>
              <tr><th>Model</th><th>In</th><th>Out</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {sum.perModel.map((m) => (
                <tr key={m.model}>
                  <td className="truncate">{m.model}</td>
                  <td>{compact(m.tokensIn)}</td>
                  <td>{compact(m.tokensOut)}</td>
                  <td>{usd(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="g-page-foot">
        <Button variant="ghost" onClick={() => confirm("Clear usage history on this device?") && reset()}>Reset usage history</Button>
      </div>
    </PageShell>
  );
}
