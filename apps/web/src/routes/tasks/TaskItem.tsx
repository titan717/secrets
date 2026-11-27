import { Check, Flag, Trash2 } from "lucide-react";
import type { Task } from "@secrets/shared";
import { dueLabel, isOverdue } from "../../lib/features/dates";
import { useTasks } from "../../lib/features/tasks";
import { IconButton } from "../../ui";

export function TaskCheck({ task, size = 22 }: { task: Task; size?: number }) {
  const toggle = useTasks((s) => s.toggle);
  return (
    <button
      className={`tk-check pri-${task.priority} ${task.done ? "is-done" : ""}`}
      style={{ width: size, height: size }}
      role="checkbox"
      aria-checked={task.done}
      aria-label={task.done ? `Mark "${task.title}" not done` : `Complete "${task.title}"`}
      onClick={(e) => {
        e.stopPropagation();
        void toggle(task);
      }}
    >
      <Check size={size * 0.6} strokeWidth={3} />
    </button>
  );
}

/** One task row. `compact` is used in the Notes side panel. */
export function TaskItem({ task, onOpen, compact, showDate = true }: { task: Task; onOpen?: (t: Task) => void; compact?: boolean; showDate?: boolean }) {
  const remove = useTasks((s) => s.remove);
  const overdue = !task.done && isOverdue(task.due_date);
  const due = dueLabel(task.due_date, task.due_time);
  return (
    <li className={`tk ${compact ? "tk-compact" : ""} ${task.done ? "is-done" : ""}`}>
      <TaskCheck task={task} size={compact ? 20 : 22} />
      <button className="tk-main" onClick={() => onOpen?.(task)}>
        <span className="tk-title">{task.title}</span>
        {(showDate && due) || task.notes || task.priority !== "normal" ? (
          <span className="tk-meta">
            {task.priority === "high" && !task.done && (
              <span className="tk-pri is-high">
                <Flag size={11} /> High
              </span>
            )}
            {task.priority === "low" && !task.done && <span className="tk-pri is-low">Low</span>}
            {showDate && due && <span className={overdue ? "tk-overdue" : ""}>{compact ? `Due ${due}` : due}</span>}
            {!compact && task.notes && <span className="truncate tk-notes">{task.notes}</span>}
          </span>
        ) : null}
      </button>
      {!compact && (
        <IconButton label="Delete task" size="sm" className="tk-del" onClick={() => void remove(task.id)}>
          <Trash2 size={15} />
        </IconButton>
      )}
    </li>
  );
}
