import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Plus, X } from "lucide-react";
import { Button, EmptyState } from "../../../ui";
import { useAiUpcoming } from "../../../lib/ai/upcoming";
import { ScheduleSheet } from "../sheets";
import { PageShell, relTime } from "./Shell";

const ACTIVE = new Set(["scheduled", "queued", "running"]);

export default function UpcomingPage() {
  const tasks = useAiUpcoming((s) => s.tasks);
  const { cancel, removeFinished } = useAiUpcoming.getState();
  const [open, setOpen] = useState(false);
  const upcoming = tasks.filter((t) => ACTIVE.has(t.status)).sort((a, b) => a.runAt.localeCompare(b.runAt));
  const history = tasks.filter((t) => !ACTIVE.has(t.status)).sort((a, b) => b.runAt.localeCompare(a.runAt));
  return (
    <PageShell title="Upcoming" actions={<Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>Schedule</Button>}>
      {upcoming.length === 0 ? (
        <EmptyState compact art={<CalendarClock size={44} className="faint" />} title="Nothing scheduled" body="Schedule a prompt to run later. It runs while Secrets is open, or on the bridge when sync is on." action={<Button onClick={() => setOpen(true)}>Schedule a task</Button>} />
      ) : (
        <ul className="g-rows">
          {upcoming.map((t) => (
            <li key={t.id} className="g-row">
              <span className={`g-dot is-${t.status}`} aria-hidden />
              <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
                <span className="truncate">{t.title}</span>
                <span className="g-meta">
                  {t.status === "running" ? "Running now" : t.status === "queued" ? "Queued" : `${new Date(t.runAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${relTime(t.runAt)}`}
                </span>
              </div>
              {t.status !== "running" && (
                <button type="button" className="g-icon" aria-label={`Cancel ${t.title}`} onClick={() => cancel(t.id)}>
                  <X size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {history.length > 0 && (
        <>
          <h3 className="g-sec row">
            <span className="grow">History</span>
            <button type="button" className="g-link" onClick={removeFinished}>Clear</button>
          </h3>
          <ul className="g-rows">
            {history.map((t) => (
              <li key={t.id} className="g-row">
                <span className={`g-dot is-${t.status}`} aria-hidden />
                <span className="truncate grow">{t.title}</span>
                <span className="g-meta">{t.status}</span>
                {t.sessionId && <Link to={`/ai/${t.sessionId}`} className="g-link">Open</Link>}
              </li>
            ))}
          </ul>
        </>
      )}
      <ScheduleSheet open={open} onClose={() => setOpen(false)} />
    </PageShell>
  );
}
