import type { FastifyInstance } from "fastify";
import type { Attachment } from "@secrets/shared";
import { db } from "../../db/index.js";
import { config } from "../../config.js";
import { badRequest, notFound, uuid, isUuid, HttpError } from "../../lib/http.js";
import { requireAuth } from "../auth/service.js";
import { sniffImage } from "./image.js";

export async function attachmentRoutes(app: FastifyInstance) {
  app.post("/v1/attachments", { preHandler: requireAuth }, async (req, reply) => {
    if (!req.isMultipart()) throw badRequest('Send multipart/form-data with a "file" field');
    let file;
    try {
      file = await req.file({ limits: { fileSize: config.maxUploadBytes, files: 1 } });
    } catch (e: any) {
      throw badRequest(e?.message ?? "Invalid upload");
    }
    if (!file) throw badRequest('Missing "file" field');
    const buf = await file.toBuffer().catch((e: any) => {
      if (e?.code === "FST_REQ_FILE_TOO_LARGE") throw new HttpError(413, "too_large", "Images must be 8 MB or smaller");
      throw e;
    });
    if ((file.file as any).truncated) throw new HttpError(413, "too_large", "Images must be 8 MB or smaller");
    if (!buf.length) throw badRequest("File is empty");
    const info = sniffImage(buf);
    if (!info) throw new HttpError(415, "unsupported_type", "Only PNG, JPEG, GIF, WebP or AVIF images are supported");
    const id = uuid();
    const name = (file.filename || "image").slice(0, 200);
    await db.query(`INSERT INTO attachments (id, owner_id, mime, size, width, height, name, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
      id,
      req.auth.id,
      info.mime,
      buf.length,
      info.width ?? null,
      info.height ?? null,
      name,
      buf,
    ]);
    const att: Attachment = { id, url: `/v1/attachments/${id}`, mime: info.mime, size: buf.length, name };
    if (info.width) att.width = info.width;
    if (info.height) att.height = info.height;
    reply.code(201);
    return att;
  });

  // Public by unguessable id so <img src> works without auth headers. Content is immutable.
  app.get("/v1/attachments/:id", async (req, reply) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw notFound("Attachment not found");
    if (req.headers["if-none-match"] === `"${id}"`) return reply.code(304).send();
    const row = await db.one<{ mime: string; data: Buffer | Uint8Array; name: string | null }>(`SELECT mime, data, name FROM attachments WHERE id = $1 AND private = false`, [id]);
    if (!row) throw notFound("Attachment not found");
    const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    reply
      .header("content-type", row.mime)
      .header("content-length", data.length)
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("etag", `"${id}"`)
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", `inline; filename="${encodeURIComponent(row.name ?? "image")}"`);
    return reply.send(data);
  });
}
