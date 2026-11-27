import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import type { Task } from "@secrets/shared";
import { Button, EmptyState, Spinner, Tabs } from "../../ui";
import { PageHeader } from "../PageHeader";
import { bucket, useTasks } from "../../lib/features/tasks";
import { dueLabel, todayYmd } from "../../lib/features/dates";
import { useConfirm } from "../../lib/features/Confirm";
import { QuickAdd } from "./QuickAdd";
import { TaskItem } from "./TaskItem";
import { TaskDetail } from "./TaskDetail";
import "./tasks.css";

type Tab = "today" | "upcoming" | "someday" | "done";
const TAB_KEY = "secrets.tasks.tab";

function Section({ title, tasks, onOpen, empty, action, showDate = true, tone }: { title: string; tasks: Task[]; onOpen: (t: Task) => void; empty?: string; action?: React.ReactNode; showDate?: boolean; tone?: "danger" }) {
  if (!tasks.length && !empty) return null;
  return (
    <section className="tk-sec">
      <header className={`tk-sec-head ${tone === "danger" ? "is-danger" : ""}`}>
        <h3>{title}</h3>
        {tasks.length > 0 && <span className="tk-sec-count">{tasks.length}</span>}
        <span className="grow" />
        {action}
      </header>
      {tasks.length ? (
        <ul className="tk-list">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} onOpen={onOpen} showDate={showDate} />
          ))}
        </ul>
      ) : (
        <p className="tk-empty">{empty}</p>
      )}
    </section>
  );
}

export default function TasksPage() {
  const { open, done, loaded, doneLoaded, error, load, loadDone, clearDone } = useTasks();
  const [tab, setTabState] = useState<Tab>(() => (sessionStorage.getItem(TAB_KEY) as Tab) || "today");
  const [detail, setDetail] = useState<Task | null>(null);
  const { confirm, dialog } = useConfirm();
  const setTab = (t: Tab) => {
    setTabState(t);
    sessionStorage.setItem(TAB_KEY, t);
  };

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab === "done") void loadDone();
  }, [tab, loadDone]);

  const b = useMemo(() => bucket(open), [open]);
  const upcomingByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of b.upcoming) m.set(t.due_date!, [...(m.get(t.due_date!) ?? []), t]);
    return [...m.entries()];
  }, [b.upcoming]);
  const todayCount = b.overdue.length + b.today.length;
  const longDate = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page tasks-page">
      <PageHeader title="Tasks" subtitle={loaded ? `${todayCount ? `${todayCount} due today` : "Nothing due today"} · ${open.length} open` : longDate} />
      <div className="page-body tk-body">
        <QuickAdd autoFocus defaultDue={tab === "today" ? todayYmd() : null} placeholder={tab === "someday" ? "Add a someday task…" : undefined} />
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: "today", label: "Today", count: todayCount },
            { id: "upcoming", label: "Upcoming", count: b.upcoming.length },
            { id: "someday", label: "Someday", count: b.someday.length },
            { id: "done", label: "Done" },
          ]}
        />
        {!loaded ? (
          <div className="page-loading">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState compact title="Couldn't load tasks" body={error} action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>} />
        ) : tab === "today" ? (
          <>
            <p className="tk-date">{longDate}</p>
            <Section title="Overdue" tone="danger" tasks={b.overdue} onOpen={setDetail} />
            <Section title="Today" tasks={b.today} onOpen={setDetail} showDate={false} empty={b.overdue.length ? undefined : "Nothing due today. Add something above, or enjoy the calm."} />
            {b.upcoming.length > 0 && (
              <Section title="Coming up" tasks={b.upcoming.slice(0, 3)} onOpen={setDetail} action={b.upcoming.length > 3 ? <button className="tk-link" onClick={() => setTab("upcoming")}>See all {b.upcoming.length}</button> : undefined} />
            )}
          </>
        ) : tab === "upcoming" ? (
          upcomingByDay.length ? (
            upcomingByDay.map(([d, ts]) => <Section key={d} title={dueLabel(d)} tasks={ts} onOpen={setDetail} showDate={false} />)
          ) : (
            <EmptyState compact art={<Sparkles size={40} className="tk-art" />} title="Nothing upcoming" body={'Try "Dentist friday 10am" or "Pay rent in 3 days".'} />
          )
        ) : tab === "someday" ? (
          b.someday.length ? (
            <Section title="Someday" tasks={b.someday} onOpen={setDetail} />
          ) : (
            <EmptyState compact art={<Sparkles size={40} className="tk-art" />} title="No someday tasks" body="Tasks without a date land here." />
          )
        ) : !doneLoaded ? (
          <div className="page-loading">
            <Spinner />
          </div>
        ) : done.length ? (
          <Section
            title="Completed"
            tasks={done}
            onOpen={setDetail}
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (await confirm("Clear completed tasks?", { body: `${done.length} completed ${done.length === 1 ? "task" : "tasks"} will be deleted.`, action: "Clear" })) void clearDone();
                }}
              >
                Clear all
              </Button>
            }
          />
        ) : (
          <EmptyState compact art={<CheckCircle2 size={40} className="tk-art" />} title="No completed tasks yet" body="Check something off and it'll show up here." />
        )}
      </div>
      <TaskDetail task={detail} onClose={() => setDetail(null)} />
      {dialog}
    </div>
  );
}

export { TasksPage };
