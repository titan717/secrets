import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import { config } from "../../config.js";
import { badRequest, notFound, uuid, isUuid, HttpError } from "../../lib/http.js";
import { requireAuth, verifyToken, bearer } from "../auth/service.js";
import { attachmentView } from "../../lib/views.js";
import { storage, storageKind } from "../../lib/storage.js";
import { sniffImage } from "./image.js";
import { sniffUpload, mimeForUpload, isImageMime } from "./files.js";
import { uploadLimit } from "../../lib/rate.js";

const UPLOAD_TTL = 15 * 60;

function tooLarge(mime: string): HttpError {
  return isImageMime(mime)
    ? new HttpError(413, "too_large", "Images must be 8 MB or smaller")
    : new HttpError(413, "too_large", "Files must be 25 MB or smaller");
}

async function readMultipart(req: any, maxBytes: number) {
  if (!req.isMultipart()) throw badRequest('Send multipart/form-data with a "file" field');
  let file;
  try {
    file = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
  } catch (e: any) {
    throw badRequest(e?.message ?? "Invalid upload");
  }
  if (!file) throw badRequest('Missing "file" field');
  const buf = await file.toBuffer().catch((e: any) => {
    if (e?.code === "FST_REQ_FILE_TOO_LARGE") throw new HttpError(413, "too_large", "That file is too large");
    throw e;
  });
  if ((file.file as any).truncated) throw new HttpError(413, "too_large", "That file is too large");
  if (!buf.length) throw badRequest("File is empty");
  return { buf, filename: (file.filename || "file").slice(0, 200) };
}

export async function attachmentRoutes(app: FastifyInstance) {
  /** Multipart upload (works with the database driver and with S3). */
  app.post("/v1/attachments", { preHandler: requireAuth }, async (req, reply) => {
    uploadLimit(req.auth.id);
    const { buf, filename } = await readMultipart(req, config.maxUploadBytes);
    const declared = String((req.headers["x-file-type"] as string) ?? "");
    const info = sniffUpload(buf, declared, filename);
    if (!info) throw new HttpError(415, "unsupported_type", "Unsupported file type. Send an image, PDF, text, ZIP or Office document.");
    if (info.kind === "image" && buf.length > config.maxImageBytes) throw tooLarge(info.mime);
    if (buf.length > config.maxUploadBytes) throw tooLarge(info.mime);

    const id = uuid();
    const key = `att/${id}`;
    await storage.put(key, buf, info.mime);
    await db.query(
      `INSERT INTO attachments (id, owner_id, mime, size, width, height, name, data, storage_key, storage_kind, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,'ready')`,
      [id, req.auth.id, info.mime, buf.length, info.width ?? null, info.height ?? null, filename, key, storage.kind],
    );
    const row = await db.one(`SELECT * FROM attachments WHERE id = $1`, [id]);
    reply.code(201);
    return attachmentView(row);
  });

  /**
   * Direct-to-object-storage upload: returns a presigned PUT URL. Disabled for the
   * embedded database driver, where clients use multipart instead.
   */
  app.post("/v1/attachments/presign", { preHandler: requireAuth }, async (req, reply) => {
    uploadLimit(req.auth.id);
    if (storageKind() !== "s3") {
      reply.code(501);
      return { error: "presign_unsupported", message: "Direct uploads are not configured; use multipart upload." };
    }
    const b = (req.body ?? {}) as any;
    const name = typeof b.name === "string" ? b.name.slice(0, 200) : "file";
    const mime = mimeForUpload(b.mime, name);
    if (!mime) throw new HttpError(415, "unsupported_type", "Unsupported file type. Send an image, PDF, text, ZIP or Office document.");
    const size = Number(b.size);
    if (!Number.isFinite(size) || size <= 0) throw badRequest("size is required");
    if (size > (isImageMime(mime) ? config.maxImageBytes : config.maxUploadBytes)) throw tooLarge(mime);
    const isPrivate = b.private === true;

    // Abuse guard: cap in-flight and hourly uploads per account.
    const pending = await db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM attachments WHERE owner_id = $1 AND status = 'pending' AND created_at > now() - interval '1 hour'`,
      [req.auth.id],
    );
    if (Number(pending?.n ?? 0) >= 25) throw new HttpError(429, "upload_quota", "Too many unfinished uploads. Try again later.");

    const id = uuid();
    const key = `att/${id}`;
    const upload_url = await storage.presignPut(key, mime, UPLOAD_TTL);
    if (!upload_url) {
      reply.code(501);
      return { error: "presign_unsupported", message: "Direct uploads are not configured; use multipart upload." };
    }
    await db.query(
      `INSERT INTO attachments (id, owner_id, mime, size, name, data, storage_key, storage_kind, status, private)
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,'pending',$8)`,
      [id, req.auth.id, mime, size, name, key, storage.kind, isPrivate],
    );
    return {
      id,
      key,
      upload_url,
      method: "PUT" as const,
      headers: { "content-type": mime },
      expires_in: UPLOAD_TTL,
    };
  });

  /** Confirm a direct upload: verify size + magic bytes, then publish metadata. */
  app.post("/v1/attachments/:id/complete", { preHandler: requireAuth }, async (req) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw notFound("Attachment not found");
    const row = await db.one<any>(`SELECT * FROM attachments WHERE id = $1 AND owner_id = $2`, [id, req.auth.id]);
    if (!row || row.status !== "pending") throw notFound("Upload not found");
    const info = await storage.head(row.storage_key);
    if (!info) throw badRequest("Upload did not reach storage. Try again.");
    if (Number(info.size) !== Number(row.size)) {
      await storage.delete(row.storage_key).catch(() => {});
      await db.query(`DELETE FROM attachments WHERE id = $1`, [id]);
      throw badRequest("Uploaded size did not match the request");
    }
    if (Number(row.size) > (isImageMime(row.mime) ? config.maxImageBytes : config.maxUploadBytes)) {
      await storage.delete(row.storage_key).catch(() => {});
      await db.query(`DELETE FROM attachments WHERE id = $1`, [id]);
      throw tooLarge(row.mime);
    }
    const prefix = await storage.getPrefix(row.storage_key, 4096);
    const sniffed = prefix ? sniffUpload(prefix, row.mime, row.name) : null;
    if (!sniffed) {
      await storage.delete(row.storage_key).catch(() => {});
      await db.query(`DELETE FROM attachments WHERE id = $1`, [id]);
      throw new HttpError(415, "unsupported_type", "The uploaded file type did not match its contents");
    }
    await db.query(
      `UPDATE attachments SET mime = $2, width = $3, height = $4, status = 'ready' WHERE id = $1`,
      [id, sniffed.mime, sniffed.width ?? null, sniffed.height ?? null],
    );
    const ready = await db.one(`SELECT * FROM attachments WHERE id = $1`, [id]);
    return attachmentView(ready);
  });

  /** Client-generated thumbnail (canvas) for an image attachment. */
  app.post("/v1/attachments/:id/thumbnail", { preHandler: requireAuth }, async (req) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw notFound("Attachment not found");
    const row = await db.one<any>(`SELECT * FROM attachments WHERE id = $1 AND owner_id = $2 AND status = 'ready'`, [id, req.auth.id]);
    if (!row) throw notFound("Attachment not found");
    if (!isImageMime(row.mime)) throw badRequest("Thumbnails are only supported for images");
    const { buf } = await readMultipart(req, 512 * 1024);
    const info = sniffImage(buf);
    if (!info) throw new HttpError(415, "unsupported_type", "Thumbnail must be an image");
    const key = `thumb/${id}`;
    await storage.put(key, buf, info.mime);
    await db.query(`UPDATE attachments SET thumbnail_key = $2 WHERE id = $1`, [id, key]);
    const updated = await db.one(`SELECT * FROM attachments WHERE id = $1`, [id]);
    return attachmentView(updated);
  });

  // Public by unguessable id so <img src> works without auth headers. Private
  // attachments (vault) require the owner's session.
  app.get("/v1/attachments/:id", async (req, reply) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw notFound("Attachment not found");
    const variant = (req.query as any)?.variant === "thumb" ? "thumb" : "full";
    const row = await db.one<any>(`SELECT * FROM attachments WHERE id = $1 AND status = 'ready'`, [id]);
    if (!row) throw notFound("Attachment not found");
    if (row.private) {
      let viewer;
      try {
        viewer = await verifyToken(bearer(req));
      } catch {
        throw notFound("Attachment not found");
      }
      if (viewer.id !== row.owner_id) throw notFound("Attachment not found");
    }

    const key = variant === "thumb" && row.thumbnail_key ? row.thumbnail_key : row.storage_key;
    const mime = variant === "thumb" && row.thumbnail_key ? "image/jpeg" : row.mime;
    const etag = `"${id}-${variant}"`;
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();

    const cache = row.private ? "private, no-store" : "public, max-age=31536000, immutable";
    const common = (r: any) =>
      r
        .header("etag", etag)
        .header("cache-control", cache)
        .header("x-content-type-options", "nosniff")
        .header("content-disposition", `inline; filename="${encodeURIComponent(row.name ?? "file")}"`);

    if (row.data) {
      const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      common(reply).header("content-type", mime).header("content-length", data.length);
      return reply.send(data);
    }
    if (!key) throw notFound("Attachment not found");

    // Object storage: hand the browser a short-lived presigned URL.
    const url = await storage.presignGet(key, 300);
    if (url) return common(reply).redirect(url, 302);
    const obj = await storage.get(key);
    if (!obj) throw notFound("Attachment not found");
    common(reply).header("content-type", obj.contentType ?? mime).header("content-length", obj.body.length);
    return reply.send(obj.body);
  });
}
