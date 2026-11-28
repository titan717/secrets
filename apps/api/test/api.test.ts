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
  process.env.LOG_LEVEL = "error";

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

async function callRaw(method: string, url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await app.inject({
    method: method as any,
    url,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.headers ?? {}) },
    payload: opts.body as any,
  });
  let body: any;
  try {
    body = res.json();
  } catch {
    body = res.body;
  }
  const cookies = Object.fromEntries((res.cookies ?? []).map((c: any) => [c.name, c.value]));
  return { status: res.statusCode, body, cookies, headers: res.headers };
}

async function call(method: string, url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const { status, body } = await callRaw(method, url, opts);
  return { status, body };
}

let seq = 0;
async function signup(prefix: string, password = "correct-horse-1") {
  const username = `${prefix}${++seq}`;
  const r = await call("POST", "/v1/auth/signup", { body: { username, email: `${username}@example.test`, password, display_name: username } });
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
    const dup = await call("POST", "/v1/auth/signup", { body: { username: a.username.toUpperCase(), email: `dup-${a.username}@example.test`, password: "correct-horse-1" } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("signup_failed");
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

describe("auth hardening", () => {
  it("authenticates with an httpOnly session cookie", async () => {
    const a = await signup("cookie");
    const login = await callRaw("POST", "/v1/auth/login", { body: { username: a.username, password: a.password } });
    expect(login.status).toBe(200);
    const sid = login.cookies["secrets_session"];
    expect(sid).toBeTruthy();

    const me = await callRaw("GET", "/v1/me", { headers: { cookie: `secrets_session=${sid}` } });
    expect(me.status).toBe(200);
    expect(me.body.username).toBe(a.username);
  });

  it("rejects cookie-authenticated mutations without a CSRF token", async () => {
    const a = await signup("csrf");
    const login = await callRaw("POST", "/v1/auth/login", { body: { username: a.username, password: a.password } });
    const cookie = `secrets_session=${login.cookies["secrets_session"]}; secrets_csrf=${login.cookies["secrets_csrf"]}`;

    const blocked = await callRaw("PATCH", "/v1/me", { body: { status: "hi" }, headers: { cookie } });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("csrf_failed");

    const ok = await callRaw("PATCH", "/v1/me", {
      body: { status: "hi" },
      headers: { cookie, "x-csrf-token": login.cookies["secrets_csrf"] },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("hi");
  });

  it("resets a password with a single-use token and revokes every session", async () => {
    const a = await signup("reset");
    const forgot = await callRaw("POST", "/v1/auth/forgot-password", { body: { email: `${a.username}@example.test` } });
    expect(forgot.status).toBe(202);
    const token = forgot.body.dev_token;
    expect(token).toBeTruthy();

    expect((await call("POST", "/v1/auth/reset-password", { body: { token, password: "brand-new-password-1" } })).status).toBe(200);
    expect((await call("GET", "/v1/me", { token: a.token })).status).toBe(401);
    expect((await call("POST", "/v1/auth/login", { body: { username: a.username, password: a.password } })).status).toBe(401);
    expect((await call("POST", "/v1/auth/login", { body: { username: a.username, password: "brand-new-password-1" } })).status).toBe(200);
    // single use
    expect((await call("POST", "/v1/auth/reset-password", { body: { token, password: "another-password-1" } })).status).toBe(400);
  });

  it("changes a password and keeps only the current device signed in", async () => {
    const a = await signup("change");
    const second = await callRaw("POST", "/v1/auth/login", { body: { username: a.username, password: a.password } });
    const t2 = second.body.token;

    const changed = await call("POST", "/v1/auth/change-password", {
      token: t2,
      body: { current_password: a.password, new_password: "changed-password-1" },
    });
    expect(changed.status).toBe(200);
    expect((await call("GET", "/v1/me", { token: a.token })).status).toBe(401);
    expect((await call("GET", "/v1/me", { token: t2 })).status).toBe(200);
  });

  it("deletes an account and invalidates access", async () => {
    const a = await signup("deleted");
    expect((await call("DELETE", "/v1/me", { token: a.token, body: { password: "wrong-password" } })).status).toBe(401);
    expect((await call("DELETE", "/v1/me", { token: a.token, body: { password: a.password } })).status).toBe(200);
    expect((await call("GET", "/v1/me", { token: a.token })).status).toBe(401);
    expect((await call("POST", "/v1/auth/login", { body: { username: a.username, password: a.password } })).status).toBe(401);
  });

  it("exports account data as a JSON attachment", async () => {
    const a = await signup("exporter");
    const res = await callRaw("POST", "/v1/me/export", { token: a.token, body: {} });
    expect(res.status).toBe(200);
    expect(String(res.headers["content-disposition"])).toContain("attachment");
    expect(res.body.profile.username).toBe(a.username);
  });
});
