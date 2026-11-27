import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openBody, sealBody } from "@secrets/shared";

/**
 * Integration tests against the real Fastify app on embedded Postgres (PGlite).
 * No mocks: routes, SQL, authorization and the session table are all exercised.
 */

let app: any;
let db: any;
let dir: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-api-test-"));
  process.env.PGLITE_DIR = dir;
  process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";

  const dbmod = await import("../src/db/index.js");
  const { migrate } = await import("../src/db/migrations.js");
  const { seed } = await import("../src/db/seed.js");
  const { initBus } = await import("../src/modules/realtime/bus.js");
  const { buildApp } = await import("../src/app.js");

  db = await dbmod.initDb();
  await migrate(db, () => {});
  await seed(() => {});
  await initBus({ info() {}, warn() {} } as any);
  app = await buildApp();
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app?.close().catch(() => {});
  await db?.close().catch(() => {});
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method: string, url: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await app.inject({
    method: method as any,
    url,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    payload: opts.body as any,
  });
  let body: any;
  try {
    body = res.json();
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body };
}

let seq = 0;
async function signup(prefix: string, password = "correct-horse-1") {
  const username = `${prefix}${++seq}`;
  const r = await call("POST", "/v1/auth/signup", { body: { username, password, display_name: username } });
  expect(r.status).toBe(201);
  return { ...r.body, username, password };
}

function envelope(text: string, id = randomUUID()) {
  return { ...sealBody({ text }), client_msg_id: id };
}

describe("auth", () => {
  it("signs up, logs in and reads the profile", async () => {
    const a = await signup("alice");
    expect(a.token).toBeTruthy();

    const me = await call("GET", "/v1/me", { token: a.token });
    expect(me.status).toBe(200);
    expect(me.body.username).toBe(a.username);

    const wrong = await call("POST", "/v1/auth/login", { body: { username: a.username, password: "nope-nope-nope" } });
    expect(wrong.status).toBe(401);

    const login = await call("POST", "/v1/auth/login", { body: { username: a.username, password: a.password } });
    expect(login.status).toBe(200);
    expect(login.body.device_id).toBeTruthy();
    expect(login.body.device_id).not.toBe(a.device_id);
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    const a = await signup("case");
    const dup = await call("POST", "/v1/auth/signup", { body: { username: a.username.toUpperCase(), password: "correct-horse-1" } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("username_taken");
  });

  it("requires a valid session for protected routes", async () => {
    expect((await call("GET", "/v1/me")).status).toBe(401);
    expect((await call("GET", "/v1/me", { token: "not-a-jwt" })).status).toBe(401);
  });

  it("revokes a session on logout", async () => {
    const a = await signup("revoke");
    const login = await call("POST", "/v1/auth/login", { body: { username: a.username, password: a.password } });
    expect(login.status).toBe(200);

    const out = await call("POST", "/v1/auth/logout", { token: login.body.token });
    expect(out.status).toBe(200);

    expect((await call("GET", "/v1/me", { token: login.body.token })).status).toBe(401);
    // The first device stays signed in.
    expect((await call("GET", "/v1/me", { token: a.token })).status).toBe(200);
  });
});

describe("messaging", () => {
  it("denies non-members access to a group", async () => {
    const owner = await signup("owner");
    const stranger = await signup("stranger");

    const group = await call("POST", "/v1/conversations/group", { token: owner.token, body: { title: "Private", member_ids: [] } });
    expect(group.status).toBe(201);
    const convId = group.body.id;

    expect((await call("GET", `/v1/conversations/${convId}/messages`, { token: stranger.token })).status).toBe(404);
    expect((await call("POST", `/v1/conversations/${convId}/messages`, { token: stranger.token, body: envelope("hi") })).status).toBe(404);
    expect((await call("GET", `/v1/conversations/${convId}`, { token: owner.token })).status).toBe(200);
  });

  it("is idempotent on client_msg_id", async () => {
    const a = await signup("idem");
    const group = await call("POST", "/v1/conversations/group", { token: a.token, body: { title: "Idempotent", member_ids: [] } });
    const convId = group.body.id;
    const payload = envelope("hello once");

    const first = await call("POST", `/v1/conversations/${convId}/messages`, { token: a.token, body: payload });
    expect(first.status).toBe(201);

    const second = await call("POST", `/v1/conversations/${convId}/messages`, { token: a.token, body: payload });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const list = await call("GET", `/v1/conversations/${convId}/messages`, { token: a.token });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(openBody(list.body[0]).text).toBe("hello once");
  });

  it("validates message payloads", async () => {
    const a = await signup("valid");
    const group = await call("POST", "/v1/conversations/group", { token: a.token, body: { title: "Validation", member_ids: [] } });
    const convId = group.body.id;

    expect((await call("POST", `/v1/conversations/${convId}/messages`, { token: a.token, body: { ciphertext: "", client_msg_id: "x" } })).status).toBe(400);
    expect((await call("POST", `/v1/conversations/${convId}/messages`, { token: a.token, body: { ciphertext: "{}" } })).status).toBe(400);

    const tooLong = await call("POST", `/v1/conversations/${convId}/messages`, { token: a.token, body: envelope("x".repeat(8001)) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBe("too_large");
  });
});

describe("docks", () => {
  it("hides a private dock and its channels from non-members", async () => {
    const owner = await signup("dockowner");
    const stranger = await signup("dockguest");

    const dock = await call("POST", "/v1/docks", {
      token: owner.token,
      body: { handle: `private-${randomUUID().slice(0, 8)}`, name: "Private Dock", visibility: "private" },
    });
    expect(dock.status).toBe(201);
    const channelId = dock.body.channels[0].id;

    expect((await call("GET", `/v1/docks/${dock.body.id}`, { token: stranger.token })).status).toBe(404);
    expect((await call("GET", `/v1/conversations/${channelId}/messages`, { token: stranger.token })).status).toBe(404);
    expect((await call("POST", `/v1/conversations/${channelId}/messages`, { token: stranger.token, body: envelope("sneak") })).status).toBe(404);

    expect((await call("GET", `/v1/conversations/${channelId}/messages`, { token: owner.token })).status).toBe(200);
    expect((await call("POST", `/v1/conversations/${channelId}/messages`, { token: owner.token, body: envelope("hello dock") })).status).toBe(201);
  });
});
