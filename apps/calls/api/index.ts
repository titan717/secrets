/**
 * Vercel Node.js Function entry: wraps the Fastify app. vercel.json rewrites every path here.
 * The service is stateless, so it works fully on Vercel.
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
