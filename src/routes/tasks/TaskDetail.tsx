import { useEffect, useState } from "react";
import { CalendarDays, Flag, Trash2 } from "lucide-react";
import type { Task, TaskPriority } from "@shared";
import { Button, Input, Modal, TextArea } from "../../ui";
import { useTasks } from "../../lib/features/tasks";
import { dueLabel } from "../../lib/features/dates";
import { DuePicker } from "./DuePicker";

/** Side drawer for editing a task's title, notes, due date/time and priority. */
export function TaskDetail({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const update = useTasks((s) => s.update);
  const remove = useTasks((s) => s.remove);
  const toggle = useTasks((s) => s.toggle);
  const live = useTasks((s) => (task ? s.open.find((t) => t.id === task.id) ?? s.done.find((t) => t.id === task.id) : undefined));
  const t = live ?? task;
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return null;
  const commit = () => {
    const patch: Partial<Task> = {};
    if (title.trim() && title.trim() !== t.title) patch.title = title.trim();
    if (notes !== t.notes) patch.notes = notes;
    if (Object.keys(patch).length) void update(t.id, patch);
  };
  const close = () => {
    commit();
    onClose();
  };
  return (
    <Modal open={!!task} onClose={close} title={t.done ? "Completed task" : "Task"} kind="side" className="td">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} maxLength={300} onKeyDown={(e) => e.key === "Enter" && commit()} />
      <div className="field">
        <span className="field-label">Due</span>
        <DuePicker value={{ due_date: t.due_date, due_time: t.due_time }} onChange={(d) => void update(t.id, d)}>
          {(open) => (
            <button className="td-due input-box" onClick={open}>
              <CalendarDays size={16} />
              <span className={t.due_date ? "" : "faint"}>{t.due_date ? dueLabel(t.due_date, t.due_time) : "Someday — pick a date"}</span>
            </button>
          )}
        </DuePicker>
      </div>
      <div className="field">
        <span className="field-label">Priority</span>
        <div className="td-pri" role="radiogroup">
          {(["high", "normal", "low"] as TaskPriority[]).map((p) => (
            <button key={p} role="radio" aria-checked={t.priority === p} className={`td-pri-opt pri-${p} ${t.priority === p ? "is-on" : ""}`} onClick={() => void update(t.id, { priority: p })}>
              <Flag size={14} /> {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commit} placeholder="Add details…" maxLength={5000} />
      <div className="row">
        <Button variant={t.done ? "secondary" : "primary"} onClick={() => void toggle(t)}>
          {t.done ? "Mark as not done" : "Mark complete"}
        </Button>
        <span className="grow" />
        <Button
          variant="danger"
          icon={<Trash2 size={15} />}
          onClick={() => {
            void remove(t.id);
            onClose();
          }}
        >
          Delete
        </Button>
      </div>
    </Modal>
  );
}
