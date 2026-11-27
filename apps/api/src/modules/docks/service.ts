import { db, type Queryable } from "../../db/index.js";
import { badRequest, forbidden, notFound, uuid, assertId, conflict } from "../../lib/http.js";
import type { DockRole } from "@secrets/shared";

export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
export const CHANNEL_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const DEFAULT_DOCK_HANDLE = "secrets-hq";

export const normalizeChannelName = (raw: unknown): string => {
  if (typeof raw !== "string") throw badRequest("name is required");
  const n = raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
  if (!CHANNEL_RE.test(n)) throw badRequest("Channel names are 1-32 chars: lowercase letters, numbers, - or _", "invalid_channel_name");
  return n;
};

export async function getDock(id: unknown, q: Queryable = db) {
  const dockId = assertId(id, "Dock");
  const d = (await q.query(`SELECT * FROM docks WHERE id = $1`, [dockId]))[0];
  if (!d) throw notFound("Dock not found");
  return d;
}

export async function roleIn(dockId: string, userId: string, q: Queryable = db): Promise<DockRole | null> {
  const r = (await q.query(`SELECT role FROM dock_members WHERE dock_id = $1 AND user_id = $2`, [dockId, userId]))[0];
  return (r?.role as DockRole) ?? null;
}

/** Load a dock the user may see (private docks are invisible to non-members). */
export async function visibleDock(id: unknown, userId: string) {
  const d = await getDock(id);
  const role = await roleIn(d.id, userId);
  if (d.visibility === "private" && !role) throw notFound("Dock not found");
  return { dock: d, role };
}

export async function requireManager(id: unknown, userId: string) {
  const { dock, role } = await visibleDock(id, userId);
  if (role !== "owner" && role !== "admin") throw forbidden("Only dock owners and admins can do that");
  return { dock, role };
}

export async function createChannel(q: Queryable, dockId: string, name: string, topic: string, createdBy: string, position?: number) {
  const exists = (await q.query(`SELECT 1 FROM channels WHERE dock_id = $1 AND name = $2`, [dockId, name]))[0];
  if (exists) throw conflict(`#${name} already exists`, "channel_exists");
  const id = uuid();
  const pos =
    position ?? Number((await q.query(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM channels WHERE dock_id = $1`, [dockId]))[0]?.p ?? 0);
  await q.query(`INSERT INTO conversations (id, kind, title, dock_id, created_by) VALUES ($1, 'channel', $2, $3, $4)`, [id, name, dockId, createdBy]);
  await q.query(`INSERT INTO channels (id, dock_id, name, topic, position) VALUES ($1, $2, $3, $4, $5)`, [id, dockId, name, topic, pos]);
  return (await q.query(`SELECT * FROM channels WHERE id = $1`, [id]))[0];
}

export async function joinDefaultDocks(userId: string) {
  await db.query(
    `INSERT INTO dock_members (dock_id, user_id, role) SELECT id, $1, 'member' FROM docks WHERE handle = $2 ON CONFLICT DO NOTHING`,
    [userId, DEFAULT_DOCK_HANDLE],
  );
}
