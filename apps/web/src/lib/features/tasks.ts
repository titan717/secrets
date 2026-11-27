import { create } from "zustand";
import type { Task } from "@secrets/shared";
import { tasksApi, type TaskInput } from "./api";
import { todayYmd } from "./dates";
import { errorMessage } from "../api";
import { toast } from "../../stores/toast";

/** Shared task cache for the Tasks page and the Notes side panel. */
interface TasksState {
  open: Task[];
  done: Task[];
  loaded: boolean;
  doneLoaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  loadDone: () => Promise<void>;
  add: (t: TaskInput & { title: string }) => Promise<Task | null>;
  update: (id: string, patch: TaskInput) => Promise<void>;
  toggle: (t: Task) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
}

const PRI = { high: 0, normal: 1, low: 2 } as const;
export function sortTasks(ts: Task[]): Task[] {
  return [...ts].sort((a, b) => {
    const ad = a.due_date ?? "9999-99-99";
    const bd = b.due_date ?? "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.due_time ?? "99:99";
    const bt = b.due_time ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    if (PRI[a.priority] !== PRI[b.priority]) return PRI[a.priority] - PRI[b.priority];
    return a.created_at.localeCompare(b.created_at);
  });
}

export const useTasks = create<TasksState>((set, get) => ({
  open: [],
  done: [],
  loaded: false,
  doneLoaded: false,
  error: null,
  load: async () => {
    try {
      const open = await tasksApi.list("all");
      set({ open: sortTasks(open), loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: errorMessage(e) });
    }
  },
  loadDone: async () => {
    try {
      set({ done: await tasksApi.list("done"), doneLoaded: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  },
  add: async (t) => {
    try {
      const task = await tasksApi.create(t);
      set({ open: sortTasks([...get().open, task]) });
      return task;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    }
  },
  update: async (id, patch) => {
    const prev = { open: get().open, done: get().done };
    const apply = (ts: Task[]) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t));
    set({ open: sortTasks(apply(prev.open)), done: apply(prev.done) });
    try {
      const t = await tasksApi.update(id, patch);
      const rep = (ts: Task[]) => ts.map((x) => (x.id === id ? t : x));
      set({ open: sortTasks(rep(get().open)), done: rep(get().done) });
    } catch (e) {
      set(prev);
      toast.error(errorMessage(e));
    }
  },
  toggle: async (task) => {
    const prev = { open: get().open, done: get().done };
    const flipped: Task = { ...task, done: !task.done, done_at: task.done ? null : new Date().toISOString() };
    if (flipped.done) set({ open: prev.open.filter((t) => t.id !== task.id), done: [flipped, ...prev.done] });
    else set({ done: prev.done.filter((t) => t.id !== task.id), open: sortTasks([...prev.open, flipped]) });
    try {
      const t = await tasksApi.update(task.id, { done: flipped.done });
      const rep = (ts: Task[]) => ts.map((x) => (x.id === t.id ? t : x));
      set({ open: rep(get().open), done: rep(get().done) });
    } catch (e) {
      set(prev);
      toast.error(errorMessage(e));
    }
  },
  remove: async (id) => {
    const prev = { open: get().open, done: get().done };
    set({ open: prev.open.filter((t) => t.id !== id), done: prev.done.filter((t) => t.id !== id) });
    try {
      await tasksApi.remove(id);
    } catch (e) {
      set(prev);
      toast.error(errorMessage(e));
    }
  },
  clearDone: async () => {
    const prev = get().done;
    set({ done: [] });
    try {
      const r = await tasksApi.clearDone();
      toast.success(`Cleared ${r.deleted} completed ${r.deleted === 1 ? "task" : "tasks"}`);
    } catch (e) {
      set({ done: prev });
      toast.error(errorMessage(e));
    }
  },
}));

export function bucket(ts: Task[]) {
  const today = todayYmd();
  return {
    overdue: ts.filter((t) => t.due_date && t.due_date < today),
    today: ts.filter((t) => t.due_date === today),
    upcoming: ts.filter((t) => t.due_date && t.due_date > today),
    someday: ts.filter((t) => !t.due_date),
  };
}
