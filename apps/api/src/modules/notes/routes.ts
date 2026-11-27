/** Notes: private markdown notes with folders, tags, pinned and starred. */
import type { FastifyInstance } from "fastify";
import type { Note, NoteFolder } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest, notFound, uuid, isUuid, assertId, iso } from "../../lib/http.js";
import { requireAuth } from "../auth/service.js";

const MAX_BODY = 200_000;

function noteView(r: any): Note {
  return {
    id: r.id,
    folder_id: r.folder_id ?? null,
    title: r.title ?? "",
    body: r.body ?? "",
    tags: (r.tags ?? []) as string[],
    pinned: !!r.pinned,
    starred: !!r.starred,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function folderView(r: any): NoteFolder {
  return { id: r.id, name: r.name, position: Number(r.position ?? 0), note_count: Number(r.note_count ?? 0), created_at: iso(r.created_at) };
}

function parseTags(v: unknown): string[] {
  if (!Array.isArray(v)) throw badRequest("tags must be an array of strings");
  const out = new Set<string>();
  for (const t of v) {
    if (typeof t !== "string") throw badRequest("tags must be an array of strings");
    const s = t.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
    if (!s) continue;
    if (s.length > 32) throw badRequest("Tags are limited to 32 characters");
    out.add(s);
  }
  if (out.size > 20) throw badRequest("At most 20 tags per note");
  return [...out];
}

async function ownFolder(userId: string, id: unknown) {
  if (id === null) return null;
  if (!isUuid(id)) throw badRequest("folder_id must be a folder id or null");
  const f = await db.one(`SELECT id FROM note_folders WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!f) throw badRequest("Folder not found");
  return f.id as string;
}

/** Validate a note create/patch body into column → value. */
async function noteFields(userId: string, b: any, partial: boolean) {
  const f: Record<string, unknown> = {};
  if (b.title !== undefined) {
    if (typeof b.title !== "string" || b.title.length > 200) throw badRequest("title must be at most 200 characters");
    f.title = b.title.trim();
  }
  if (b.body !== undefined) {
    if (typeof b.body !== "string" || b.body.length > MAX_BODY) throw badRequest("body must be a string (≤ 200k chars)");
    f.body = b.body;
  }
  if (b.tags !== undefined) f.tags = parseTags(b.tags);
  if (b.folder_id !== undefined) f.folder_id = await ownFolder(userId, b.folder_id);
  for (const k of ["pinned", "starred"]) {
    if (b[k] !== undefined) {
      if (typeof b[k] !== "boolean") throw badRequest(`${k} must be a boolean`);
      f[k] = b[k];
    }
  }
  if (!partial && !f.title && !f.body) f.title = "Untitled";
  return f;
}

export async function noteRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ---- folders ---------------------------------------------------------------
  app.get("/v1/notes/folders", async (req) => {
    const rows = await db.query(
      `SELECT f.*, (SELECT COUNT(*)::int FROM notes n WHERE n.folder_id = f.id) AS note_count FROM note_folders f
       WHERE f.user_id = $1 ORDER BY f.position ASC, f.created_at ASC`,
      [req.auth.id],
    );
    return rows.map(folderView);
  });

  app.post("/v1/notes/folders", async (req, reply) => {
    const name = typeof (req.body as any)?.name === "string" ? (req.body as any).name.trim() : "";
    if (!name || name.length > 64) throw badRequest("name must be 1-64 characters");
    const n = await db.one(`SELECT COUNT(*)::int AS n, COALESCE(MAX(position), -1) + 1 AS p FROM note_folders WHERE user_id = $1`, [req.auth.id]);
    if (Number(n?.n ?? 0) >= 200) throw badRequest("At most 200 folders");
    const id = uuid();
    await db.query(`INSERT INTO note_folders (id, user_id, name, position) VALUES ($1, $2, $3, $4)`, [id, req.auth.id, name, Number(n?.p ?? 0)]);
    reply.code(201);
    return folderView(await db.one(`SELECT * FROM note_folders WHERE id = $1`, [id]));
  });

  app.patch("/v1/notes/folders/:id", async (req) => {
    const id = assertId((req.params as any).id, "Folder");
    const b = (req.body ?? {}) as any;
    const f = await db.one(`SELECT * FROM note_folders WHERE id = $1 AND user_id = $2`, [id, req.auth.id]);
    if (!f) throw notFound("Folder not found");
    if (b.name !== undefined) {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name || name.length > 64) throw badRequest("name must be 1-64 characters");
      await db.query(`UPDATE note_folders SET name = $2 WHERE id = $1`, [id, name]);
    }
    if (b.position !== undefined) {
      if (!Number.isInteger(b.position) || b.position < 0) throw badRequest("position must be a non-negative integer");
      await db.query(`UPDATE note_folders SET position = $2 WHERE id = $1`, [id, b.position]);
    }
    return folderView(
      await db.one(`SELECT f.*, (SELECT COUNT(*)::int FROM notes n WHERE n.folder_id = f.id) AS note_count FROM note_folders f WHERE f.id = $1`, [id]),
    );
  });

  /** Deleting a folder keeps its notes (they move to "no folder"). */
  app.delete("/v1/notes/folders/:id", async (req) => {
    const id = assertId((req.params as any).id, "Folder");
    const rows = await db.query(`DELETE FROM note_folders WHERE id = $1 AND user_id = $2 RETURNING id`, [id, req.auth.id]);
    if (!rows.length) throw notFound("Folder not found");
    return { ok: true as const };
  });

  // ---- tags ------------------------------------------------------------------
  app.get("/v1/notes/tags", async (req) => {
    const rows = await db.query(
      `SELECT t AS tag, COUNT(*)::int AS count FROM notes, unnest(tags) AS t WHERE user_id = $1 GROUP BY t ORDER BY count DESC, t ASC`,
      [req.auth.id],
    );
    return rows.map((r: any) => ({ tag: r.tag, count: Number(r.count) }));
  });

  // ---- notes -----------------------------------------------------------------
  /** ?folder_id=<id|none> &tag= &q= &pinned=1 &starred=1 &limit= (pinned first, then recently updated). */
  app.get("/v1/notes", async (req) => {
    const q = (req.query ?? {}) as any;
    const where = ["user_id = $1"];
    const vals: unknown[] = [req.auth.id];
    const add = (sql: string, v: unknown) => {
      vals.push(v);
      where.push(sql.replaceAll("?", `$${vals.length}`));
    };
    if (q.folder_id === "none") where.push("folder_id IS NULL");
    else if (q.folder_id) {
      if (!isUuid(q.folder_id)) throw badRequest("folder_id must be a folder id or 'none'");
      add("folder_id = ?", q.folder_id);
    }
    if (q.tag) add("? = ANY(tags)", String(q.tag).toLowerCase().replace(/^#/, ""));
    if (q.pinned === "1" || q.pinned === "true") where.push("pinned = true");
    if (q.starred === "1" || q.starred === "true") where.push("starred = true");
    if (q.q) {
      const like = `%${String(q.q).toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`;
      add("(lower(title) LIKE ? OR lower(body) LIKE ?)", like);
    }
    const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 500);
    vals.push(limit);
    const rows = await db.query(
      `SELECT * FROM notes WHERE ${where.join(" AND ")} ORDER BY pinned DESC, updated_at DESC LIMIT $${vals.length}`,
      vals,
    );
    return rows.map(noteView);
  });

  app.post("/v1/notes", async (req, reply) => {
    const f = await noteFields(req.auth.id, req.body ?? {}, false);
    const id = uuid();
    const cols = ["id", "user_id", ...Object.keys(f)];
    const vals = [id, req.auth.id, ...Object.values(f)];
    await db.query(`INSERT INTO notes (${cols.join(", ")}) VALUES (${cols.map((c, i) => (c === "tags" ? `$${i + 1}::text[]` : `$${i + 1}`)).join(", ")})`, vals);
    reply.code(201);
    return noteView(await db.one(`SELECT * FROM notes WHERE id = $1`, [id]));
  });

  app.get("/v1/notes/:id", async (req) => {
    const id = assertId((req.params as any).id, "Note");
    const r = await db.one(`SELECT * FROM notes WHERE id = $1 AND user_id = $2`, [id, req.auth.id]);
    if (!r) throw notFound("Note not found");
    return noteView(r);
  });

  app.patch("/v1/notes/:id", async (req) => {
    const id = assertId((req.params as any).id, "Note");
    const existing = await db.one(`SELECT id FROM notes WHERE id = $1 AND user_id = $2`, [id, req.auth.id]);
    if (!existing) throw notFound("Note not found");
    const f = await noteFields(req.auth.id, req.body ?? {}, true);
    const keys = Object.keys(f);
    if (keys.length) {
      // Only content edits bump updated_at (pin/star toggles don't reorder the list).
      const touches = keys.some((k) => ["title", "body", "tags", "folder_id"].includes(k));
      await db.query(
        `UPDATE notes SET ${keys.map((k, i) => `${k} = $${i + 2}${k === "tags" ? "::text[]" : ""}`).join(", ")}${touches ? ", updated_at = now()" : ""} WHERE id = $1`,
        [id, ...keys.map((k) => f[k])],
      );
    }
    return noteView(await db.one(`SELECT * FROM notes WHERE id = $1`, [id]));
  });

  app.delete("/v1/notes/:id", async (req) => {
    const id = assertId((req.params as any).id, "Note");
    const rows = await db.query(`DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id`, [id, req.auth.id]);
    if (!rows.length) throw notFound("Note not found");
    return { ok: true as const };
  });
}
