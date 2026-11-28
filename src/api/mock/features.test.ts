import { beforeEach, describe, expect, it } from "vitest";
import { mockRequest } from "./router";
import { resetFeatureDB } from "./features";
import { signInDemo } from "../../test/utils";

describe("mock feature routes", () => {
  beforeEach(() => {
    resetFeatureDB();
    signInDemo();
  });

  it("serves and saves story privacy settings", async () => {
    expect(await mockRequest("GET", "/v1/moments/settings")).toEqual({ visibility: "all_friends", user_ids: [] });
    await mockRequest("PUT", "/v1/moments/settings", { body: { visibility: "public", user_ids: [] } });
    expect(await mockRequest("GET", "/v1/moments/settings")).toMatchObject({ visibility: "public" });
  });

  it("posts a story that shows in my stories and the feed", async () => {
    await mockRequest("POST", "/v1/moments", { body: { text: "hello" } });
    expect(await mockRequest("GET", "/v1/moments/mine")).toHaveLength(1);
    const feed = (await mockRequest("GET", "/v1/moments/feed")) as { moments: unknown[] }[];
    expect(feed[0].moments).toHaveLength(1);
  });

  it("creates, lists and completes tasks", async () => {
    const t = (await mockRequest("POST", "/v1/tasks", { body: { title: "Test" } })) as { id: string };
    await mockRequest("PATCH", `/v1/tasks/${t.id}`, { body: { done: true } });
    const done = (await mockRequest("GET", "/v1/tasks?view=done")) as { id: string; done_at: string }[];
    expect(done.find((x) => x.id === t.id)?.done_at).toBeTruthy();
    const s = (await mockRequest("GET", "/v1/tasks/summary")) as { done: number };
    expect(s.done).toBe(1);
  });

  it("creates and searches notes", async () => {
    await mockRequest("POST", "/v1/notes", { body: { title: "Groceries", body: "milk" } });
    const hits = (await mockRequest("GET", "/v1/notes?q=milk")) as unknown[];
    expect(hits).toHaveLength(1);
  });

  it("reports a 5 GB drive", async () => {
    const u = (await mockRequest("GET", "/v1/vault/usage")) as { quota_bytes: number };
    expect(u.quota_bytes).toBe(5 * 1024 ** 3);
  });

  it("still answers user lookups", async () => {
    expect(await mockRequest("GET", "/v1/users/leo")).toBeTruthy();
  });
});
