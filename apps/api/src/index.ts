import { config, DEV_JWT_SECRET } from "./config.js";
import { initDb, db } from "./db/index.js";
import { migrate } from "./db/migrations.js";
import { seed } from "./db/seed.js";
import { initBus } from "./modules/realtime/bus.js";
import { buildApp } from "./app.js";

async function main() {
  const app = await buildApp();
  const log = app.log;
  if (config.jwtSecret === DEV_JWT_SECRET) log.warn("JWT_SECRET is not set — using an insecure development secret. Set JWT_SECRET in production!");

  await initDb();
  log.info(`database: ${db.kind}${db.kind === "pglite" ? ` (${config.pgliteDir})` : ""}`);
  await migrate(db, (m) => log.info(m));
  await seed((m) => log.info(m));
  await initBus({ info: (m) => log.info(m), warn: (m) => log.warn(m) });

  await app.listen({ port: config.port, host: config.host });

  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return;
    closing = true;
    log.info(`${sig} received, shutting down`);
    const t = setTimeout(() => process.exit(1), 10_000).unref();
    try {
      await app.close();
      await db.close();
    } finally {
      clearTimeout(t);
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("fatal: failed to start", err);
  process.exit(1);
});
