/**
 * Moments (stories): image or text posts that expire after 24h.
 * Visibility: all_friends (people you share a dm/group with), public, only (listed users),
 * except (friends minus listed users). Friends = contacts (shared dm/group).
 */
import type { FastifyInstance } from "fastify";
import type { Moment, MomentGroup } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest, forbidden, notFound, uuid, isUuid, assertId, iso } from "../../lib/http.js";
import { USER_COLS, userView, attachmentView } from "../../lib/views.js";
import { requireAuth, normalizeUsername } from "../auth/service.js";
import { publish, contactsOf } from "../realtime/bus.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const VIS = ["all_friends", "public", "only", "except"] as const;
type Visibility = (typeof VIS)[number];

const MOMENT_COLS = `mo.*, a.mime AS a_mime, a.size AS a_size, a.width AS a_width, a.height AS a_height, a.name AS a_name`;

/** SQL predicate: can $viewer see moment `mo`? */
const CAN_SEE = (viewer: string) => `(
  mo.user_id = ${viewer}
  OR mo.visibility = 'public'
  OR (mo.visibility = 'only' AND ${viewer} = ANY(mo.audience))
  OR (mo.visibility IN ('all_friends','except')
      AND NOT (mo.visibility = 'except' AND ${viewer} = ANY(mo.audience))
      AND EXISTS (SELECT 1 FROM conversation_members c1 JOIN conversations cv ON cv.id = c1.conversation_id AND cv.kind IN ('dm','group')
                  JOIN conversation_members c2 ON c2.conversation_id = c1.conversation_id
                  WHERE c1.user_id = mo.user_id AND c2.user_id = ${viewer}))
)`;

function momentView(r: any, viewerId: string, viewed: Set<string>, counts: Map<string, number>): Moment {
  const mine = r.user_id === viewerId;
  return {
    id: r.id,
    user_id: r.user_id,
    kind: r.kind as "image" | "text",
    text: r.text ?? "",
    background: r.background ?? null,
    attachment: r.attachment_id
      ? attachmentView({ id: r.attachment_id, mime: r.a_mime, size: r.a_size, width: r.a_width, height: r.a_height, name: r.a_name })
      : null,
    visibility: r.visibility as Visibility,
    user_ids: mine ? (r.audience ?? []) : undefined,
    created_at: iso(r.created_at),
    expires_at: iso(r.expires_at),
    viewed: mine || viewed.has(r.id),
    view_count: mine ? (counts.get(r.id) ?? 0) : undefined,
  };
}

async function views(rows: any[], viewerId: string): Promise<Moment[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const seen = await db.query<{ moment_id: string }>(`SELECT moment_id FROM moment_views WHERE viewer_id = $1 AND moment_id = ANY($2::uuid[])`, [viewerId, ids]);
  const mineIds = rows.filter((r) => r.user_id === viewerId).map((r) => r.id);
  const counts = mineIds.length
    ? await db.query<{ moment_id: string; n: number }>(
        `SELECT moment_id, COUNT(*)::int AS n FROM moment_views WHERE moment_id = ANY($1::uuid[]) GROUP BY moment_id`,
        [mineIds],
      )
    : [];
  const viewed = new Set(seen.map((s) => s.moment_id));
  const countBy = new Map(counts.map((c) => [c.moment_id, Number(c.n)]));
  return rows.map((r) => momentView(r, viewerId, viewed, countBy));
}

function parseAudience(b: any, fallback?: { visibility: string; audience: string[] }) {
  const visibility = (b.visibility ?? fallback?.visibility ?? "all_friends") as Visibility;
  if (!VIS.includes(visibility)) throw badRequest(`visibility must be one of ${VIS.join(", ")}`);
  let audience: string[] = [];
  if (visibility === "only" || visibility === "except") {
    const raw = b.user_ids ?? fallback?.audience ?? [];
    if (!Array.isArray(raw) || raw.some((x) => !isUuid(x))) throw badRequest("user_ids must be an array of user ids");
    audience = [...new Set(raw as string[])].slice(0, 1000);
    if (visibility === "only" && !audience.length) throw badRequest('visibility "only" needs at least one user_id');
  }
  return { visibility, audience };
}

async function getSettings(userId: string) {
  const s = await db.one(`SELECT visibility, audience FROM moment_settings WHERE user_id = $1`, [userId]);
  return { visibility: (s?.visibility ?? "all_friends") as Visibility, audience: (s?.audience ?? []) as string[] };
}

/** Users who may see a moment right now (for realtime fan-out). */
async function audienceOf(ownerId: string, visibility: Visibility, audience: string[]): Promise<string[]> {
  const friends = await contactsOf(ownerId);
  if (visibility === "only") return audience;
  if (visibility === "except") return friends.filter((f) => !audience.includes(f));
  return friends; // all_friends + public (public reach = friends live; others see it on profile)
}

export async function momentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Purge expired moments every 10 minutes (attachments are kept; they're unreferenced bytes).
  const purge = setInterval(() => {
    db.query(`DELETE FROM moments WHERE expires_at < now() - interval '1 hour'`).catch(() => {});
  }, 10 * 60_000);
  purge.unref();
  app.addHook("onClose", async () => clearInterval(purge));

  app.get("/v1/moments/settings", async (req) => {
    const s = await getSettings(req.auth.id);
    return { visibility: s.visibility, user_ids: s.audience };
  });

  app.put("/v1/moments/settings", async (req) => {
    const { visibility, audience } = parseAudience(req.body ?? {});
    await db.query(
      `INSERT INTO moment_settings (user_id, visibility, audience) VALUES ($1, $2, $3::uuid[])
       ON CONFLICT (user_id) DO UPDATE SET visibility = EXCLUDED.visibility, audience = EXCLUDED.audience, updated_at = now()`,
      [req.auth.id, visibility, audience],
    );
    return { visibility, user_ids: audience };
  });

  app.post("/v1/moments", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (text.length > 700) throw badRequest("Moment text is limited to 700 characters");
    let attachmentId: string | null = null;
    if (b.attachment_id !== undefined && b.attachment_id !== null) {
      if (!isUuid(b.attachment_id)) throw badRequest("attachment_id must be an attachment id");
      const a = await db.one(`SELECT owner_id, mime FROM attachments WHERE id = $1`, [b.attachment_id]);
      if (!a || a.owner_id !== req.auth.id) throw badRequest("Attachment not found");
      if (!String(a.mime).startsWith("image/")) throw badRequest("Moments support images only");
      attachmentId = b.attachment_id;
    }
    const kind = attachmentId ? "image" : "text";
    if (kind === "text" && !text) throw badRequest("A moment needs text or an image");
    if (b.background !== undefined && b.background !== null && (typeof b.background !== "string" || b.background.length > 64))
      throw badRequest("background must be a short string (e.g. a color or gradient id)");
    const { visibility, audience } = parseAudience(b, await getSettings(req.auth.id));
    const id = uuid();
    await db.query(
      `INSERT INTO moments (id, user_id, kind, text, background, attachment_id, visibility, audience, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9)`,
      [id, req.auth.id, kind, text, b.background ?? null, attachmentId, visibility, audience, new Date(Date.now() + TTL_MS).toISOString()],
    );
    const row = await db.one(`SELECT ${MOMENT_COLS} FROM moments mo LEFT JOIN attachments a ON a.id = mo.attachment_id WHERE mo.id = $1`, [id]);
    const [mine] = await views([row], req.auth.id);
    // Realtime: tell the audience (personalised view without owner-only fields).
    const viewers = await audienceOf(req.auth.id, visibility, audience);
    const theirs: Moment = { ...mine, user_ids: undefined, view_count: undefined, viewed: false };
    publish(viewers, { t: "moment.new", moment: theirs });
    publish([req.auth.id], { t: "moment.new", moment: mine }, req.auth.device_id);
    reply.code(201);
    return mine;
  });

  /** Active moments of me + friends (visibility-filtered), grouped by user. Mine first, then unseen first, newest first. */
  app.get("/v1/moments/feed", async (req) => {
    const me = req.auth.id;
    const rows = await db.query(
      `SELECT ${MOMENT_COLS} FROM moments mo LEFT JOIN attachments a ON a.id = mo.attachment_id
       WHERE mo.expires_at > now() AND ${CAN_SEE("$1")}
         AND (mo.user_id = $1 OR EXISTS (SELECT 1 FROM conversation_members c1 JOIN conversations cv ON cv.id = c1.conversation_id AND cv.kind IN ('dm','group')
               JOIN conversation_members c2 ON c2.conversation_id = c1.conversation_id WHERE c1.user_id = mo.user_id AND c2.user_id = $1))
       ORDER BY mo.created_at ASC LIMIT 2000`,
      [me],
    );
    const vs = await views(rows, me);
    const userIds = [...new Set(vs.map((v) => v.user_id))];
    const users = userIds.length ? await db.query(`SELECT ${USER_COLS} FROM users u WHERE u.id = ANY($1::uuid[])`, [userIds]) : [];
    const userBy = new Map(users.map((u: any) => [u.id, userView(u)]));
    const groups: MomentGroup[] = userIds.map((uid) => {
      const moments = vs.filter((v) => v.user_id === uid);
      return {
        user: userBy.get(uid)!,
        moments, // oldest → newest (playback order)
        has_unseen: moments.some((m) => !m.viewed),
        latest_at: moments[moments.length - 1].created_at,
      };
    });
    groups.sort((a, b) => {
      if (a.user.id === me) return -1;
      if (b.user.id === me) return 1;
      if (a.has_unseen !== b.has_unseen) return a.has_unseen ? -1 : 1;
      return b.latest_at.localeCompare(a.latest_at);
    });
    return groups;
  });

  app.get("/v1/moments/mine", async (req) => {
    const rows = await db.query(
      `SELECT ${MOMENT_COLS} FROM moments mo LEFT JOIN attachments a ON a.id = mo.attachment_id
       WHERE mo.user_id = $1 AND mo.expires_at > now() ORDER BY mo.created_at ASC`,
      [req.auth.id],
    );
    return views(rows, req.auth.id);
  });

  /** A user's active moments visible to me (works for public moments of non-friends). */
  app.get("/v1/users/:username/moments", async (req) => {
    const u = await db.one(`SELECT id FROM users WHERE username = $1`, [normalizeUsername((req.params as any).username)]);
    if (!u) throw notFound("User not found");
    const rows = await db.query(
      `SELECT ${MOMENT_COLS} FROM moments mo LEFT JOIN attachments a ON a.id = mo.attachment_id
       WHERE mo.user_id = $2 AND mo.expires_at > now() AND ${CAN_SEE("$1")} ORDER BY mo.created_at ASC`,
      [req.auth.id, u.id],
    );
    return views(rows, req.auth.id);
  });

  async function visible(id: unknown, viewer: string) {
    const mid = assertId(id, "Moment");
    const row = await db.one(
      `SELECT ${MOMENT_COLS} FROM moments mo LEFT JOIN attachments a ON a.id = mo.attachment_id
       WHERE mo.id = $2 AND mo.expires_at > now() AND ${CAN_SEE("$1")}`,
      [viewer, mid],
    );
    if (!row) throw notFound("Moment not found or expired");
    return row;
  }

  app.get("/v1/moments/:id", async (req) => (await views([await visible((req.params as any).id, req.auth.id)], req.auth.id))[0]);

  app.post("/v1/moments/:id/view", async (req) => {
    const row = await visible((req.params as any).id, req.auth.id);
    if (row.user_id !== req.auth.id) {
      const ins = await db.query(`INSERT INTO moment_views (moment_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING viewed_at`, [
        row.id,
        req.auth.id,
      ]);
      if (ins.length) {
        const me = await db.one(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [req.auth.id]);
        publish([row.user_id], { t: "moment.view", moment_id: row.id, user: userView(me), viewed_at: iso(ins[0].viewed_at) });
      }
    }
    return { ok: true as const };
  });

  app.get("/v1/moments/:id/views", async (req) => {
    const id = assertId((req.params as any).id, "Moment");
    const m = await db.one(`SELECT user_id FROM moments WHERE id = $1`, [id]);
    if (!m) throw notFound("Moment not found");
    if (m.user_id !== req.auth.id) throw forbidden("Only the author can see who viewed a moment");
    const rows = await db.query(
      `SELECT ${USER_COLS}, v.viewed_at FROM moment_views v JOIN users u ON u.id = v.viewer_id WHERE v.moment_id = $1 ORDER BY v.viewed_at DESC`,
      [id],
    );
    return rows.map((r: any) => ({ user: userView(r), viewed_at: iso(r.viewed_at) }));
  });

  app.delete("/v1/moments/:id", async (req) => {
    const id = assertId((req.params as any).id, "Moment");
    const rows = await db.query(`DELETE FROM moments WHERE id = $1 AND user_id = $2 RETURNING id, visibility, audience`, [id, req.auth.id]);
    if (!rows.length) throw notFound("Moment not found");
    const viewers = await audienceOf(req.auth.id, rows[0].visibility, rows[0].audience ?? []);
    publish([...viewers, req.auth.id], { t: "moment.remove", moment_id: id, user_id: req.auth.id });
    return { ok: true as const };
  });
}
