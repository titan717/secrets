import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { bucket, useTasks } from "../../lib/features/tasks";
import { dueLabel, todayYmd } from "../../lib/features/dates";
import { TaskItem } from "../tasks/TaskItem";
import { QuickAdd } from "../tasks/QuickAdd";
import "../tasks/tasks.css";

/** Right-hand panel on Notes: today's tasks + a timed schedule. */
export function TasksPanel() {
  const { open, done, loaded, load } = useTasks();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const b = useMemo(() => bucket(open), [open]);
  const today = todayYmd();
  const focus = [...b.overdue, ...b.today, ...b.upcoming].slice(0, 5);
  const recentDone = done.filter((t) => t.done_at && t.done_at.slice(0, 10) >= today).slice(0, 2);
  const schedule = open.filter((t) => t.due_time && t.due_date && t.due_date >= today).slice(0, 4);
  return (
    <aside className="np" aria-label="Tasks and schedule">
      <section className="np-sec">
        <header className="np-head">
          <h3>Tasks</h3>
          <Link to="/tasks" className="np-link">
            See all <ChevronRight size={14} />
          </Link>
        </header>
        <QuickAdd placeholder="Add a task…" />
        {loaded && focus.length === 0 && recentDone.length === 0 ? (
          <p className="np-empty">Nothing due. Nice.</p>
        ) : (
          <ul className="tk-list">
            {[...recentDone, ...focus].map((t) => (
              <TaskItem key={t.id} task={t} compact />
            ))}
          </ul>
        )}
      </section>
      <section className="np-sec">
        <header className="np-head">
          <h3>Schedule</h3>
          <Link to="/tasks" className="np-link">
            See all <ChevronRight size={14} />
          </Link>
        </header>
        {schedule.length === 0 ? (
          <p className="np-empty">No timed tasks. Try "Team sync fri 11am".</p>
        ) : (
          <ul className="np-sched">
            {schedule.map((t) => (
              <li key={t.id}>
                <span className="np-sched-ico">
                  <CalendarClock size={16} />
                </span>
                <span className="grow">
                  <span className="np-sched-title truncate">{t.title}</span>
                  <span className="np-sched-time">{dueLabel(t.due_date, t.due_time)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
