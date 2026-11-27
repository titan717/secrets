import type { FastifyInstance } from "fastify";
import type { DockRole } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest, conflict, forbidden, notFound, uuid, token, assertId } from "../../lib/http.js";
import { dockView, dockViews, userView, channelView, USER_COLS } from "../../lib/views.js";
import { iso } from "../../lib/http.js";
import { requireAuth } from "../auth/service.js";
import { publish, dockAudience } from "../realtime/bus.js";
import { HANDLE_RE, normalizeChannelName, getDock, roleIn, visibleDock, requireManager, createChannel } from "./service.js";

const ROLES: DockRole[] = ["owner", "admin", "member"];

/** Push personalised dock.upsert to every member. */
async function pushDock(dockId: string, extra: string[] = []) {
  const users = [...new Set([...(await dockAudience(dockId)), ...extra])];
  await Promise.all(
    users.map(async (u) => {
      const v = await dockView(dockId, u);
      if (v) publish([u], { t: "dock.upsert", dock: v });
    }),
  );
}

function validateDockFields(b: any, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name || name.length > 48) throw badRequest("name must be 1-48 characters");
    out.name = name;
  }
  if (b.description !== undefined) {
    if (typeof b.description !== "string" || b.description.length > 500) throw badRequest("description must be at most 500 characters");
    out.description = b.description;
  }
  if (!partial || b.visibility !== undefined) {
    if (b.visibility !== "public" && b.visibility !== "private") throw badRequest('visibility must be "public" or "private"');
    out.visibility = b.visibility;
  }
  if (b.icon_url !== undefined) {
    if (b.icon_url !== null && (typeof b.icon_url !== "string" || b.icon_url.length > 1000)) throw badRequest("icon_url must be a string or null");
    out.icon_url = b.icon_url || null;
  }
  return out;
}

export async function dockRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/v1/docks", async (req) => {
    const mine = (req.query as any)?.mine;
    const rows =
      mine === "1" || mine === "true"
        ? await db.query(
            `SELECT d.* FROM docks d JOIN dock_members m ON m.dock_id = d.id AND m.user_id = $1 ORDER BY m.joined_at ASC`,
            [req.auth.id],
          )
        : await db.query(
            `SELECT d.* FROM docks d LEFT JOIN dock_members m ON m.dock_id = d.id AND m.user_id = $1
             WHERE m.user_id IS NOT NULL OR d.visibility = 'public' ORDER BY (m.user_id IS NOT NULL) DESC, d.created_at ASC LIMIT 200`,
            [req.auth.id],
          );
    return dockViews(rows, req.auth.id);
  });

  app.get("/v1/docks/discover", async (req) => {
    const q = String((req.query as any)?.q ?? "").trim().toLowerCase();
    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const rows = await db.query(
      `SELECT d.*, (SELECT COUNT(*) FROM dock_members x WHERE x.dock_id = d.id) AS n FROM docks d
       WHERE d.visibility = 'public' AND ($1 = '' OR lower(d.name) LIKE $2 OR d.handle LIKE $2 OR lower(d.description) LIKE $2)
       ORDER BY n DESC, d.created_at ASC LIMIT 50`,
      [q, like],
    );
    return dockViews(rows, req.auth.id);
  });

  // Extra: look a dock up by handle (public, or private if member).
  app.get("/v1/docks/by-handle/:handle", async (req) => {
    const d = await db.one(`SELECT id FROM docks WHERE handle = $1`, [String((req.params as any).handle).toLowerCase()]);
    if (!d) throw notFound("Dock not found");
    const { dock } = await visibleDock(d.id, req.auth.id);
    return dockView(dock.id, req.auth.id);
  });

  app.post("/v1/docks", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const f = validateDockFields(b, false);
    const handle = typeof b.handle === "string" ? b.handle.trim().toLowerCase().replace(/^@/, "") : "";
    if (!HANDLE_RE.test(handle)) throw badRequest("handle must be 3-32 chars: lowercase letters, numbers and dashes", "invalid_handle");
    if (await db.one(`SELECT 1 FROM docks WHERE handle = $1`, [handle])) throw conflict("That handle is taken", "handle_taken");
    const id = uuid();
    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO docks (id, name, handle, description, icon_url, visibility, owner_id, invite_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, f.name, handle, f.description ?? "", f.icon_url ?? null, f.visibility, req.auth.id, token(6)],
        );
        await q.query(`INSERT INTO dock_members (dock_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, req.auth.id]);
        await createChannel(q, id, "general", "General chat", req.auth.id, 0);
      });
    } catch (e: any) {
      if (e?.code === "23505" || /unique|duplicate/i.test(e?.message ?? "")) throw conflict("That handle is taken", "handle_taken");
      throw e;
    }
    reply.code(201);
    return dockView(id, req.auth.id);
  });

  app.get("/v1/docks/:id", async (req) => {
    const { dock } = await visibleDock((req.params as any).id, req.auth.id);
    return dockView(dock.id, req.auth.id);
  });

  app.patch("/v1/docks/:id", async (req) => {
    const { dock, role } = await requireManager((req.params as any).id, req.auth.id);
    const f = validateDockFields(req.body ?? {}, true);
    if (f.visibility && f.visibility !== dock.visibility && role !== "owner") throw forbidden("Only the owner can change visibility");
    const keys = Object.keys(f);
    if (keys.length) {
      await db.query(`UPDATE docks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`, [dock.id, ...keys.map((k) => f[k])]);
      await pushDock(dock.id);
    }
    return dockView(dock.id, req.auth.id);
  });

  app.delete("/v1/docks/:id", async (req) => {
    const { dock, role } = await visibleDock((req.params as any).id, req.auth.id);
    if (role !== "owner") throw forbidden("Only the owner can delete a dock");
    const members = await dockAudience(dock.id);
    const channels = await db.query<{ id: string }>(`SELECT id FROM channels WHERE dock_id = $1`, [dock.id]);
    await db.tx(async (q) => {
      await q.query(`DELETE FROM conversations WHERE dock_id = $1`, [dock.id]);
      await q.query(`DELETE FROM docks WHERE id = $1`, [dock.id]);
    });
    for (const c of channels) publish(members, { t: "conversation.remove", conversation_id: c.id });
    return { ok: true as const };
  });

  app.post("/v1/docks/:id/join", async (req) => {
    const d = await getDock((req.params as any).id);
    const existing = await roleIn(d.id, req.auth.id);
    if (!existing) {
      if (d.visibility === "private") {
        const code = (req.body as any)?.invite_code;
        if (typeof code !== "string" || !d.invite_code || code.trim() !== d.invite_code) throw notFound("Dock not found or invite code invalid");
      }
      await db.query(`INSERT INTO dock_members (dock_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`, [d.id, req.auth.id]);
      await pushDock(d.id);
    }
    return dockView(d.id, req.auth.id);
  });

  // Extra: join by invite code alone (for share links). Body { invite_code }.
  app.post("/v1/docks/join-by-code", async (req) => {
    const code = (req.body as any)?.invite_code;
    if (typeof code !== "string" || !code.trim()) throw badRequest("invite_code is required");
    const d = await db.one(`SELECT * FROM docks WHERE invite_code = $1`, [code.trim()]);
    if (!d) throw notFound("Invite code invalid");
    await db.query(`INSERT INTO dock_members (dock_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`, [d.id, req.auth.id]);
    await pushDock(d.id);
    return dockView(d.id, req.auth.id);
  });

  app.post("/v1/docks/:id/leave", async (req) => {
    const { dock, role } = await visibleDock((req.params as any).id, req.auth.id);
    if (!role) throw badRequest("You're not a member of this dock");
    if (role === "owner") throw badRequest("The owner can't leave; transfer ownership or delete the dock", "owner_cannot_leave");
    await db.query(`DELETE FROM dock_members WHERE dock_id = $1 AND user_id = $2`, [dock.id, req.auth.id]);
    const view = await dockView(dock.id, req.auth.id);
    if (view) publish([req.auth.id], { t: "dock.upsert", dock: view });
    await pushDock(dock.id);
    return { ok: true as const };
  });

  /** Returns the current invite code (owner/admin). `{ rotate: true }` issues a new one. */
  app.post("/v1/docks/:id/invite", async (req) => {
    const { dock } = await requireManager((req.params as any).id, req.auth.id);
    let code = dock.invite_code as string | null;
    if (!code || (req.body as any)?.rotate) {
      code = token(6);
      await db.query(`UPDATE docks SET invite_code = $2 WHERE id = $1`, [dock.id, code]);
    }
    return { invite_code: code };
  });

  app.get("/v1/docks/:id/members", async (req) => {
    const { dock } = await visibleDock((req.params as any).id, req.auth.id);
    const rows = await db.query(
      `SELECT ${USER_COLS}, m.role, m.joined_at FROM dock_members m JOIN users u ON u.id = m.user_id WHERE m.dock_id = $1
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at ASC LIMIT 1000`,
      [dock.id],
    );
    return rows.map((r: any) => ({ user: userView(r), role: r.role, joined_at: iso(r.joined_at) }));
  });

  app.patch("/v1/docks/:id/members/:userId", async (req) => {
    const p = req.params as any;
    const { dock, role } = await requireManager(p.id, req.auth.id);
    const target = assertId(p.userId, "Member");
    const newRole = (req.body as any)?.role as DockRole;
    if (!ROLES.includes(newRole)) throw badRequest('role must be "owner", "admin" or "member"');
    const current = await roleIn(dock.id, target);
    if (!current) throw notFound("Member not found");
    if (newRole === "owner" || current === "owner") {
      // Ownership transfer: owner only, demotes the old owner to admin.
      if (role !== "owner") throw forbidden("Only the owner can transfer ownership");
      if (current === "owner" && newRole !== "owner") throw badRequest("Transfer ownership to someone else instead");
      if (newRole === "owner" && target !== req.auth.id) {
        await db.tx(async (q) => {
          await q.query(`UPDATE dock_members SET role = 'admin' WHERE dock_id = $1 AND user_id = $2`, [dock.id, req.auth.id]);
          await q.query(`UPDATE dock_members SET role = 'owner' WHERE dock_id = $1 AND user_id = $2`, [dock.id, target]);
          await q.query(`UPDATE docks SET owner_id = $2 WHERE id = $1`, [dock.id, target]);
        });
      }
    } else {
      if (role === "admin" && current === "admin" && target !== req.auth.id) throw forbidden("Admins can't change other admins");
      await db.query(`UPDATE dock_members SET role = $3 WHERE dock_id = $1 AND user_id = $2`, [dock.id, target, newRole]);
    }
    await pushDock(dock.id);
    const r = await db.one(`SELECT ${USER_COLS}, m.role, m.joined_at FROM dock_members m JOIN users u ON u.id = m.user_id WHERE m.dock_id = $1 AND m.user_id = $2`, [
      dock.id,
      target,
    ]);
    return { user: userView(r), role: r.role, joined_at: iso(r.joined_at) };
  });

  app.delete("/v1/docks/:id/members/:userId", async (req) => {
    const p = req.params as any;
    const target = assertId(p.userId, "Member");
    if (target === req.auth.id) throw badRequest("Use POST /v1/docks/:id/leave to leave a dock");
    const { dock, role } = await requireManager(p.id, req.auth.id);
    const current = await roleIn(dock.id, target);
    if (!current) throw notFound("Member not found");
    if (current === "owner") throw forbidden("The owner can't be removed");
    if (current === "admin" && role !== "owner") throw forbidden("Only the owner can remove admins");
    await db.query(`DELETE FROM dock_members WHERE dock_id = $1 AND user_id = $2`, [dock.id, target]);
    const v = await dockView(dock.id, target);
    if (v) publish([target], { t: "dock.upsert", dock: v });
    await pushDock(dock.id);
    return { ok: true as const };
  });

  app.post("/v1/docks/:id/channels", async (req, reply) => {
    const { dock } = await requireManager((req.params as any).id, req.auth.id);
    const b = (req.body ?? {}) as any;
    const name = normalizeChannelName(b.name);
    const topic = typeof b.topic === "string" ? b.topic.slice(0, 250) : "";
    const count = await db.one(`SELECT COUNT(*)::int AS n FROM channels WHERE dock_id = $1`, [dock.id]);
    if (Number(count?.n ?? 0) >= 100) throw badRequest("A dock can have at most 100 channels");
    const ch = await db.tx((q) => createChannel(q, dock.id, name, topic, req.auth.id));
    reply.code(201);
    await pushDock(dock.id);
    return channelView(ch);
  });

  app.patch("/v1/docks/:id/channels/:channelId", async (req) => {
    const p = req.params as any;
    const { dock } = await requireManager(p.id, req.auth.id);
    const chId = assertId(p.channelId, "Channel");
    const ch = await db.one(`SELECT * FROM channels WHERE id = $1 AND dock_id = $2`, [chId, dock.id]);
    if (!ch) throw notFound("Channel not found");
    const b = (req.body ?? {}) as any;
    if (b.name !== undefined) {
      const name = normalizeChannelName(b.name);
      if (name !== ch.name) {
        if (await db.one(`SELECT 1 FROM channels WHERE dock_id = $1 AND name = $2`, [dock.id, name])) throw conflict(`#${name} already exists`, "channel_exists");
        await db.query(`UPDATE channels SET name = $2 WHERE id = $1`, [chId, name]);
        await db.query(`UPDATE conversations SET title = $2 WHERE id = $1`, [chId, name]);
      }
    }
    if (b.topic !== undefined) {
      if (typeof b.topic !== "string") throw badRequest("topic must be a string");
      await db.query(`UPDATE channels SET topic = $2 WHERE id = $1`, [chId, b.topic.slice(0, 250)]);
    }
    if (b.position !== undefined) {
      const pos = Number(b.position);
      if (!Number.isInteger(pos) || pos < 0 || pos > 10000) throw badRequest("position must be a non-negative integer");
      await db.query(`UPDATE channels SET position = $2 WHERE id = $1`, [chId, pos]);
    }
    await pushDock(dock.id);
    return channelView(await db.one(`SELECT * FROM channels WHERE id = $1`, [chId]));
  });

  app.delete("/v1/docks/:id/channels/:channelId", async (req) => {
    const p = req.params as any;
    const { dock } = await requireManager(p.id, req.auth.id);
    const chId = assertId(p.channelId, "Channel");
    const ch = await db.one(`SELECT * FROM channels WHERE id = $1 AND dock_id = $2`, [chId, dock.id]);
    if (!ch) throw notFound("Channel not found");
    const n = await db.one(`SELECT COUNT(*)::int AS n FROM channels WHERE dock_id = $1`, [dock.id]);
    if (Number(n?.n ?? 0) <= 1) throw badRequest("A dock needs at least one channel");
    const members = await dockAudience(dock.id);
    await db.query(`DELETE FROM conversations WHERE id = $1`, [chId]);
    publish(members, { t: "conversation.remove", conversation_id: chId });
    await pushDock(dock.id);
    return { ok: true as const };
  });
}
