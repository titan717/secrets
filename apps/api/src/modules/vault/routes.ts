/**
 * Vault: private file store (any type, ≤ 25 MB each, 500 MB per user).
 * Bytes live in `attachments` (private = true) so they never leak via the public
 * /v1/attachments/:id route. PROTOTYPE: stored as-is; `nonce` is reserved for
 * client-side encryption later (the server would then only ever see ciphertext).
 */
import type { FastifyInstance } from "fastify";
import type { VaultItem, VaultUsage } from "@secrets/shared";
import { db } from "../../db/index.js";
import { badRequest, notFound, uuid, assertId, iso, HttpError } from "../../lib/http.js";
import { requireAuth, verifyToken, bearer } from "../auth/service.js";
import { sniffImage } from "../attachments/image.js";

const MAX_FILE = 25 * 1024 * 1024;
const QUOTA = Number(process.env.VAULT_QUOTA_BYTES ?? 500 * 1024 * 1024);

function itemView(r: any): VaultItem {
  return {
    id: r.id,
    name: r.name,
    mime: r.mime,
    size: Number(r.size),
    url: `/v1/vault/${r.id}/download`,
    encrypted: !!r.nonce,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function cleanName(v: unknown, fallback = "file"): string {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f/\\]/g, "").trim() : "";
  return (s || fallback).slice(0, 200);
}

/** Best-effort mime: trust the client's type unless it's generic and we can sniff an image. */
function pickMime(declared: string | undefined, buf: Buffer): string {
  const d = (declared ?? "").toLowerCase();
  if (d && d !== "application/octet-stream" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(d)) return d;
  return sniffImage(buf)?.mime ?? "application/octet-stream";
}

async function usage(userId: string): Promise<VaultUsage> {
  const r = await db.one(`SELECT COALESCE(SUM(size), 0)::bigint AS used, COUNT(*)::int AS n FROM vault_items WHERE user_id = $1`, [userId]);
  return { used_bytes: Number(r?.used ?? 0), item_count: Number(r?.n ?? 0), quota_bytes: QUOTA, max_file_bytes: MAX_FILE };
}

export async function vaultRoutes(app: FastifyInstance) {
  /** multipart: field "file" (required), optional text fields "name" and "nonce" (send text fields before the file). */
  app.post("/v1/vault", { preHandler: requireAuth }, async (req, reply) => {
    if (!req.isMultipart()) throw badRequest('Send multipart/form-data with a "file" field');
    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_FILE, files: 1 } });
    } catch (e: any) {
      throw badRequest(e?.message ?? "Invalid upload");
    }
    if (!file) throw badRequest('Missing "file" field');
    const buf = await file.toBuffer().catch((e: any) => {
      if (e?.code === "FST_REQ_FILE_TOO_LARGE") throw new HttpError(413, "too_large", "Vault files must be 25 MB or smaller");
      throw e;
    });
    if ((file.file as any).truncated) throw new HttpError(413, "too_large", "Vault files must be 25 MB or smaller");
    if (!buf.length) throw badRequest("File is empty");
    const u = await usage(req.auth.id);
    if (u.used_bytes + buf.length > QUOTA) throw new HttpError(413, "quota_exceeded", "Your vault is full — delete something to make room");
    const fieldVal = (k: string) => {
      const f = (file!.fields as any)?.[k];
      return f && !Array.isArray(f) && "value" in f ? f.value : undefined;
    };
    const name = cleanName(fieldVal("name") ?? file.filename);
    const nonce = typeof fieldVal("nonce") === "string" && fieldVal("nonce") ? String(fieldVal("nonce")).slice(0, 200) : null;
    const mime = pickMime(file.mimetype, buf);
    const attId = uuid();
    const id = uuid();
    await db.tx(async (q) => {
      await q.query(`INSERT INTO attachments (id, owner_id, mime, size, name, data, private) VALUES ($1,$2,$3,$4,$5,$6,true)`, [
        attId,
        req.auth.id,
        mime,
        buf.length,
        name,
        buf,
      ]);
      await q.query(`INSERT INTO vault_items (id, user_id, attachment_id, name, mime, size, nonce) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
        id,
        req.auth.id,
        attId,
        name,
        mime,
        buf.length,
        nonce,
      ]);
    });
    reply.code(201);
    return itemView(await db.one(`SELECT * FROM vault_items WHERE id = $1`, [id]));
  });

  /** ?q= name filter, ?type=image|video|audio|pdf|other */
  app.get("/v1/vault", { preHandler: requireAuth }, async (req) => {
    const q = (req.query ?? {}) as any;
    const where = ["user_id = $1"];
    const vals: unknown[] = [req.auth.id];
    if (q.q) {
      vals.push(`%${String(q.q).toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`);
      where.push(`lower(name) LIKE $${vals.length}`);
    }
    const types: Record<string, string> = {
      image: "mime LIKE 'image/%'",
      video: "mime LIKE 'video/%'",
      audio: "mime LIKE 'audio/%'",
      pdf: "mime = 'application/pdf'",
      other: "mime NOT LIKE 'image/%' AND mime NOT LIKE 'video/%' AND mime NOT LIKE 'audio/%' AND mime <> 'application/pdf'",
    };
    if (q.type) {
      if (!types[q.type]) throw badRequest("type must be image, video, audio, pdf or other");
      where.push(types[q.type]);
    }
    const rows = await db.query(`SELECT * FROM vault_items WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 1000`, vals);
    return rows.map(itemView);
  });

  app.get("/v1/vault/usage", { preHandler: requireAuth }, async (req) => usage(req.auth.id));

  app.get("/v1/vault/:id", { preHandler: requireAuth }, async (req) => {
    const id = assertId((req.params as any).id, "File");
    const r = await db.one(`SELECT * FROM vault_items WHERE id = $1 AND user_id = $2`, [id, req.auth.id]);
    if (!r) throw notFound("File not found");
    return itemView(r);
  });

  /**
   * Download. Auth via Authorization header, or ?token=<session> so plain links/<img>/<video> work.
   * ?inline=1 to display in the browser instead of downloading.
   */
  app.get("/v1/vault/:id/download", async (req, reply) => {
    const q = (req.query ?? {}) as any;
    const auth = await verifyToken(bearer(req) ?? (typeof q.token === "string" ? q.token : null));
    const id = assertId((req.params as any).id, "File");
    const r = await db.one(
      `SELECT v.name, v.mime, v.nonce, a.data FROM vault_items v JOIN attachments a ON a.id = v.attachment_id WHERE v.id = $1 AND v.user_id = $2`,
      [id, auth.id],
    );
    if (!r) throw notFound("File not found");
    const data = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
    const inline = q.inline === "1" || q.inline === "true";
    reply
      .header("content-type", r.mime)
      .header("content-length", data.length)
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "sandbox")
      .header("content-disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(r.name)}`);
    if (r.nonce) reply.header("x-vault-nonce", r.nonce);
    return reply.send(data);
  });

  app.patch("/v1/vault/:id", { preHandler: requireAuth }, async (req) => {
    const id = assertId((req.params as any).id, "File");
    const name = (req.body as any)?.name;
    if (typeof name !== "string" || !name.trim()) throw badRequest("name is required");
    const rows = await db.query(`UPDATE vault_items SET name = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`, [
      id,
      req.auth.id,
      cleanName(name),
    ]);
    if (!rows.length) throw notFound("File not found");
    return itemView(rows[0]);
  });

  app.delete("/v1/vault/:id", { preHandler: requireAuth }, async (req) => {
    const id = assertId((req.params as any).id, "File");
    const rows = await db.query(`DELETE FROM vault_items WHERE id = $1 AND user_id = $2 RETURNING attachment_id`, [id, req.auth.id]);
    if (!rows.length) throw notFound("File not found");
    await db.query(`DELETE FROM attachments WHERE id = $1`, [rows[0].attachment_id]);
    return { ok: true as const };
  });
}
