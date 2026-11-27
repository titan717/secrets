/**
 * Tiny query adapter: the same parameterized SQL ($1, $2, …) runs on
 * node-postgres (DATABASE_URL) or embedded PGlite (zero-config fallback).
 */
import fs from "node:fs";
import { config } from "../config.js";

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  kind: "postgres" | "pglite";
  one<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function withOne(base: Omit<Db, "one">): Db {
  return Object.assign(base, {
    async one<T>(sql: string, params?: unknown[]) {
      const rows = await base.query<T>(sql, params);
      return rows[0] ?? null;
    },
  }) as Db;
}

async function createPg(url: string): Promise<Db> {
  const pg = (await import("pg")).default;
  // Keep bigint (COUNT) as JS numbers; ids are uuids so no precision concern.
  pg.types.setTypeParser(20, (v: string) => Number(v));
  // DATE columns stay "YYYY-MM-DD" (avoid local-timezone shifts).
  pg.types.setTypeParser(1082, (v: string) => v);
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url) || /sslmode=disable/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX ?? 10),
  });
  pool.on("error", (err) => console.error("[db] pool error", err));
  return withOne({
    kind: "postgres",
    async query(sql, params = []) {
      const r = await pool.query(sql, params as any[]);
      return r.rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const res = await fn({
          async query(sql, params = []) {
            const r = await client.query(sql, params as any[]);
            return r.rows;
          },
        });
        await client.query("COMMIT");
        return res;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  });
}

async function createPglite(dir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  // PGlite is single-connection: serialize transactions against plain queries.
  let chain: Promise<unknown> = Promise.resolve();
  const lock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const norm = (rows: any[]) =>
    rows.map((r) => {
      for (const k in r) if (typeof r[k] === "bigint") r[k] = Number(r[k]);
      return r;
    });
  return withOne({
    kind: "pglite",
    query: (sql, params = []) => lock(async () => norm((await db.query(sql, params as any[])).rows as any[])),
    exec: (sql) => lock(async () => void (await db.exec(sql))),
    tx: (fn) =>
      lock(() =>
        db.transaction(async (t) =>
          fn({ query: async (sql, params = []) => norm((await t.query(sql, params as any[])).rows as any[]) }),
        ),
      ) as any,
    async close() {
      await db.close();
    },
  });
}

export let db: Db;

export async function initDb(): Promise<Db> {
  db = config.databaseUrl ? await createPg(config.databaseUrl) : await createPglite(config.pgliteDir);
  return db;
}
