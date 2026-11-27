import { buildApp } from "./app.js";

const port = Number(process.env.PORT) || 8791;
const host = process.env.HOST || "0.0.0.0";

const app = await buildApp();
try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0));
  });
}
