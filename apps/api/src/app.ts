import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { HttpError } from "./lib/http.js";
import { redisStatus } from "./modules/realtime/bus.js";
import { authRoutes } from "./modules/auth/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { conversationRoutes } from "./modules/conversations/routes.js";
import { messageRoutes } from "./modules/messages/routes.js";
import { dockRoutes } from "./modules/docks/routes.js";
import { attachmentRoutes } from "./modules/attachments/routes.js";
import { realtimeRoutes } from "./modules/realtime/ws.js";
import { momentRoutes } from "./modules/moments/routes.js";
import { noteRoutes } from "./modules/notes/routes.js";
import { taskRoutes } from "./modules/tasks/routes.js";
import { vaultRoutes } from "./modules/vault/routes.js";

function findWebDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    config.webDist,
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(here, "../../web/dist"),
    path.resolve(here, "../../../apps/web/dist"),
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(path.join(p, "index.html"))) ?? null;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: config.corsOrigin.includes("*") ? true : config.corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-secrets-token"],
  });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError && (err as any).retryAfter) reply.header("retry-after", String((err as any).retryAfter));
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.error, message: err.message });
    if (err?.validation || err?.statusCode === 400) return reply.code(400).send({ error: "bad_request", message: err.message });
    if (err?.code === "FST_ERR_CTP_BODY_TOO_LARGE" || err?.statusCode === 413)
      return reply.code(413).send({ error: "too_large", message: "Request body is too large" });
    if (err?.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.code ?? "error", message: err.message });
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal", message: "Something went wrong" });
  });

  app.get("/health", async () => ({ ok: true as const, db: db.kind, redis: redisStatus() }));
  // Public flags: UX gating only. Every endpoint still authorizes independently.
  app.get("/v1/config", async () => ({ features: config.features }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(dockRoutes);
  await app.register(attachmentRoutes);
  await app.register(realtimeRoutes);
  await app.register(momentRoutes);
  await app.register(noteRoutes);
  await app.register(taskRoutes);
  await app.register(vaultRoutes);

  const webDist = findWebDist();
  if (webDist) {
    app.log.info(`serving web client from ${webDist}`);
    await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false, index: ["index.html"] });
    app.setNotFoundHandler((req, reply) => {
      const url = req.raw.url ?? "/";
      if (req.method !== "GET" || url.startsWith("/v1/") || url === "/v1" || url.startsWith("/health"))
        return reply.code(404).send({ error: "not_found", message: "Route not found" });
      // Hashed assets: real 404 for missing files with an extension.
      if (/\.[a-z0-9]{1,8}(\?|$)/i.test(url) && !url.endsWith(".html")) return reply.code(404).send({ error: "not_found", message: "File not found" });
      return reply.header("cache-control", "no-cache").sendFile("index.html");
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "not_found", message: "Route not found" }));
  }

  return app;
}
