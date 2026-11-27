import path from "node:path";
import { flagsFromEnv } from "@secrets/shared";

const env = process.env;

export const DEV_JWT_SECRET = "secrets-dev-secret-change-me";

export const config = {
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? "0.0.0.0",
  databaseUrl: env.DATABASE_URL?.trim() || null,
  redisUrl: env.REDIS_URL?.trim() || null,
  jwtSecret: env.JWT_SECRET?.trim() || DEV_JWT_SECRET,
  /** Session lifetime in seconds (default 90 days). */
  jwtTtl: Number(env.JWT_TTL ?? 60 * 60 * 24 * 90),
  corsOrigin: (env.CORS_ORIGIN ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  pgliteDir: env.PGLITE_DIR ?? path.resolve(process.cwd(), "data/pglite"),
  maxUploadBytes: 8 * 1024 * 1024,
  webDist: env.WEB_DIST ?? null,
  logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "info"),
  features: flagsFromEnv(env),
};
