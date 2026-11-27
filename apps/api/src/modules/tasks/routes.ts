/**
 * Tasks: personal to-dos with optional due date/time and priority.
 * Priority can be typed inline: "Call mom !high" → title "Call mom", priority "high".
 * Date views are computed in the caller's timezone (?tz=Asia/Kolkata, default UTC).
 */
import type { FastifyInstance } from "fastify";
import type { Task, TaskSummary } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest, notFound, uuid, assertId, iso } from "../../lib/http.js";
import { requireAuth } from "../auth/service.js";

const PRIORITIES = ["high", "normal", "low"] as const;
type Priority = (typeof PRIORITIES)[number];
const UPCOMING_DAYS = 14;

const PRIO_TOKENS: Record<string, Priority> = {
  "!high": "high",
  "!h": "high",
  "!urgent": "high",
  "!!": "high",
  "!low": "low",
  "!l": "low",
  "!normal": "normal",
  "!medium": "normal",
  "!med": "normal",
};

/** Strip "!high" / "!low" (etc.) tokens from a title. Last token wins. */
export function parsePriority(raw: string): { title: string; priority: Priority | null } {
  let priority: Priority | null = null;
  const title = raw
    .split(/\s+/)
    .filter((w) => {
      const p = PRIO_TOKENS[w.toLowerCase()];
      if (p) priority = p;
      return !p;
    })
    .join(" ")
    .trim();
  return { title, priority };
}

/** Today's date (YYYY-MM-DD) in an IANA timezone. */
function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    throw badRequest("tz must be a valid IANA timezone, e.g. Asia/Kolkata");
  }
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function dateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function taskView(r: any): Task {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes ?? "",
    due_date: dateStr(r.due_date), // YYYY-MM-DD or null
    due_time: r.due_time ?? null, // HH:MM or null
    priority: r.priority as Priority,
    done: !!r.done,
    done_at: r.done_at ? iso(r.done_at) : null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function fields(b: any, partial: boolean) {
  const f: Record<string, unknown> = {};
  if (!partial || b.title !== undefined) {
    if (typeof b.title !== "string") throw badRequest("title is required");
    const { title, priority } = parsePriority(b.title);
    if (!title || title.length > 300) throw badRequest("title must be 1-300 characters");
    f.title = title;
    if (priority && b.priority === undefined) f.priority = priority;
  }
  if (b.priority !== undefined) {
    if (!PRIORITIES.includes(b.priority)) throw badRequest('priority must be "high", "normal" or "low"');
    f.priority = b.priority;
  }
  if (b.notes !== undefined) {
    if (typeof b.notes !== "string" || b.notes.length > 5000) throw badRequest("notes must be at most 5000 characters");
    f.notes = b.notes;
  }
  if (b.due_date !== undefined) {
    if (b.due_date !== null && (typeof b.due_date !== "string" || !DATE_RE.test(b.due_date) || isNaN(Date.parse(b.due_date))))
      throw badRequest("due_date must be YYYY-MM-DD or null");
    f.due_date = b.due_date;
    if (b.due_date === null) f.due_time = null;
  }
  if (b.due_time !== undefined) {
    if (b.due_time !== null && (typeof b.due_time !== "string" || !TIME_RE.test(b.due_time))) throw badRequest("due_time must be HH:MM or null");
    f.due_time = b.due_time;
  }
  if (b.done !== undefined) {
    if (typeof b.done !== "boolean") throw badRequest("done must be a boolean");
    f.done = b.done;
  }
  return f;
}

const ORDER = `CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`;

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /**
   * ?view=all (open tasks, default) | today (due today or overdue) | upcoming (next 14 days, after today)
   *      | someday (no due date) | done (completed, newest first)
   * &tz=<IANA timezone>
   */
  app.get("/v1/tasks", async (req) => {
    const q = (req.query ?? {}) as any;
    const view = String(q.view ?? "all");
    const today = todayIn(typeof q.tz === "string" && q.tz ? q.tz : "UTC");
    const me = req.auth.id;
    let rows: any[];
    switch (view) {
      case "today":
        rows = await db.query(
          `SELECT * FROM tasks WHERE user_id = $1 AND done = false AND due_date <= $2::date
           ORDER BY ${ORDER}, due_date ASC, due_time ASC NULLS LAST, created_at ASC`,
          [me, today],
        );
        break;
      case "upcoming":
        rows = await db.query(
          `SELECT * FROM tasks WHERE user_id = $1 AND done = false AND due_date > $2::date AND due_date <= $3::date
           ORDER BY due_date ASC, due_time ASC NULLS LAST, ${ORDER}, created_at ASC`,
          [me, today, addDays(today, UPCOMING_DAYS)],
        );
        break;
      case "someday":
        rows = await db.query(`SELECT * FROM tasks WHERE user_id = $1 AND done = false AND due_date IS NULL ORDER BY ${ORDER}, created_at DESC`, [me]);
        break;
      case "done":
        rows = await db.query(`SELECT * FROM tasks WHERE user_id = $1 AND done = true ORDER BY done_at DESC LIMIT 200`, [me]);
        break;
      case "all":
        rows = await db.query(
          `SELECT * FROM tasks WHERE user_id = $1 AND done = false ORDER BY due_date ASC NULLS LAST, due_time ASC NULLS LAST, ${ORDER}, created_at ASC`,
          [me],
        );
        break;
      default:
        throw badRequest("view must be all, today, upcoming, someday or done");
    }
    return rows.map(taskView);
  });

  /** Counts for sidebar badges. */
  app.get("/v1/tasks/summary", async (req): Promise<TaskSummary> => {
    const tz = (req.query as any)?.tz;
    const today = todayIn(typeof tz === "string" && tz ? tz : "UTC");
    const r = await db.one(
      `SELECT
         COUNT(*) FILTER (WHERE done = false AND due_date < $2::date)::int AS overdue,
         COUNT(*) FILTER (WHERE done = false AND due_date <= $2::date)::int AS today,
         COUNT(*) FILTER (WHERE done = false AND due_date > $2::date AND due_date <= $3::date)::int AS upcoming,
         COUNT(*) FILTER (WHERE done = false)::int AS open,
         COUNT(*) FILTER (WHERE done = true)::int AS done
       FROM tasks WHERE user_id = $1`,
      [req.auth.id, today, addDays(today, UPCOMING_DAYS)],
    );
    return { today_date: today, overdue: r.overdue, today: r.today, upcoming: r.upcoming, open: r.open, done: r.done };
  });

  app.post("/v1/tasks", async (req, reply) => {
    const f = fields(req.body ?? {}, false);
    const n = await db.one(`SELECT COUNT(*)::int AS n FROM tasks WHERE user_id = $1`, [req.auth.id]);
    if (Number(n?.n ?? 0) >= 5000) throw badRequest("Task limit reached");
    const id = uuid();
    if (f.done) f.done_at = new Date().toISOString();
    const cols = ["id", "user_id", ...Object.keys(f)];
    await db.query(`INSERT INTO tasks (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, [id, req.auth.id, ...Object.values(f)]);
    reply.code(201);
    return taskView(await db.one(`SELECT * FROM tasks WHERE id = $1`, [id]));
  });

  app.get("/v1/tasks/:id", async (req) => {
    const id = assertId((req.params as any).id, "Task");
    const r = await db.one(`SELECT * FROM tasks WHERE id = $1 AND user_id = $2`, [id, req.auth.id]);
    if (!r) throw notFound("Task not found");
    return taskView(r);
  });

  app.patch("/v1/tasks/:id", async (req) => {
    const id = assertId((req.params as any).id, "Task");
    const cur = await db.one(`SELECT * FROM tasks WHERE id = $1 AND user_id = $2`, [id, req.auth.id]);
    if (!cur) throw notFound("Task not found");
    const f = fields(req.body ?? {}, true);
    if (f.due_time && !f.due_date && !cur.due_date) throw badRequest("Set a due_date before a due_time");
    if (f.done !== undefined && f.done !== cur.done) f.done_at = f.done ? new Date().toISOString() : null;
    const keys = Object.keys(f);
    if (keys.length)
      await db.query(`UPDATE tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [
        id,
        ...keys.map((k) => f[k]),
      ]);
    return taskView(await db.one(`SELECT * FROM tasks WHERE id = $1`, [id]));
  });

  app.delete("/v1/tasks/:id", async (req) => {
    const id = assertId((req.params as any).id, "Task");
    const rows = await db.query(`DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`, [id, req.auth.id]);
    if (!rows.length) throw notFound("Task not found");
    return { ok: true as const };
  });

  /** Bulk-clear completed tasks. */
  app.delete("/v1/tasks/done", async (req) => {
    const rows = await db.query(`DELETE FROM tasks WHERE user_id = $1 AND done = true RETURNING id`, [req.auth.id]);
    return { ok: true as const, deleted: rows.length };
  });
}
