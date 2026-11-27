/**
 * Vercel Node.js Function entry: wraps the Fastify app. vercel.json rewrites every path here.
 * SSE works because Vercel Node functions stream the response as it is written.
 * Limitation: the run registry is in-memory, so /confirm and /stop only work if they reach
 * the same function instance as the streaming /v1/chat request (not guaranteed on serverless).
 * Use auto_approve or a long-running host (Render/Railway/Docker) for confirmations.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";

const ready = buildApp().then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await ready;
  app.server.emit("request", req, res);
}
