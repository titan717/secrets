import sodium from "libsodium-wrappers-sumo"; import { hash, verify } from "@node-rs/argon2";
import { PGlite } from "@electric-sql/pglite"; import { Kysely } from "kysely"; import { PostgresDialect } from "kysely"; import { PGLiteSocketServer } from "@electric-sql/pglite-socket"; import pg from "pg"; import { drizzle } from "drizzle-orm/pglite"; import { sql } from "drizzle-orm";
import assert from "node:assert/strict";
await sodium.ready;
// attachment: XChaCha20-Poly1305 secretstream, random per-file key
const key = sodium.crypto_secretstream_xchacha20poly1305_keygen();
const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);
const T = sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE, F = sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
const c1 = sodium.crypto_secretstream_xchacha20poly1305_push(state, sodium.from_string("chunk1"), null, T);
const c2 = sodium.crypto_secretstream_xchacha20poly1305_push(state, sodium.from_string("chunk2"), null, F);
const st = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key);
const r1 = sodium.crypto_secretstream_xchacha20poly1305_pull(st, c1), r2 = sodium.crypto_secretstream_xchacha20poly1305_pull(st, c2);
assert.equal(sodium.to_string(r1.message)+sodium.to_string(r2.message), "chunk1chunk2"); assert.equal(r2.tag, F);
// key backup KEK: Argon2id (client-side, libsodium)
const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
const kek = sodium.crypto_pwhash(32, "recovery passphrase", salt, sodium.crypto_pwhash_OPSLIMIT_MODERATE, sodium.crypto_pwhash_MEMLIMIT_MODERATE, sodium.crypto_pwhash_ALG_ARGON2ID13);
console.log("secretstream OK, argon2id KEK bytes:", kek.length);
// server password hashing
const h = await hash("hunter2", { memoryCost: 19456, timeCost: 2, parallelism: 1 });
assert.ok(await verify(h, "hunter2")); assert.ok(!(await verify(h, "nope"))); console.log("@node-rs/argon2 OK", h.slice(0, 30));
// tests DB
const pgl = await PGlite.create(); const srv = new PGLiteSocketServer({ db: pgl, port: 54329 }); await srv.start();
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ host: "127.0.0.1", port: 54329, max: 1 }) }) });
await db.schema.createTable("t").addColumn("id", "serial", c => c.primaryKey()).addColumn("v", "text").execute();
await db.insertInto("t").values({ v: "x" }).execute();
console.log("pglite+kysely:", await db.selectFrom("t").selectAll().execute());
await db.destroy(); await srv.stop();
const dz = drizzle(await PGlite.create()); console.log("drizzle/pglite:", (await dz.execute(sql`select 1+1 as two`)).rows);
