import type { FastifyInstance } from "fastify";
import { requireAuth, audit } from "../auth/service.js";
import { badRequest } from "../../lib/http.js";
import {
  blockUser,
  unblockUser,
  listBlocks,
  setNotificationLevel,
  getNotificationLevel,
  parseLevel,
  listNotifications,
  markNotificationsRead,
  unreadNotificationCount,
  deleteNotification,
} from "./service.js";
import { searchLimit } from "../../lib/rate.js";

export async function moderationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ── blocks ──────────────────────────────────────────────────────────────
  app.get("/v1/me/blocks", async (req) => listBlocks(req.auth.id));

  app.post("/v1/users/:username/block", async (req) => {
    const username = (req.params as any).username;
    const result = await blockUser(req.auth.id, username);
    await audit({ actorId: req.auth.id, action: "user.blocked", targetType: "user", req, metadata: { username } });
    return result;
  });

  app.delete("/v1/users/:username/block", async (req) => {
    const username = (req.params as any).username;
    const result = await unblockUser(req.auth.id, username);
    await audit({ actorId: req.auth.id, action: "user.unblocked", targetType: "user", req, metadata: { username } });
    return result;
  });

  // ── notification levels ─────────────────────────────────────────────────
  app.get("/v1/conversations/:id/notification-level", async (req) => getNotificationLevel(req.auth.id, (req.params as any).id));

  app.put("/v1/conversations/:id/notification-level", async (req) => {
    const b = (req.body ?? {}) as any;
    const level = parseLevel(b.level);
    if (b.muted_until !== undefined && b.muted_until !== null && typeof b.muted_until !== "string")
      throw badRequest("muted_until must be an ISO timestamp or null");
    return setNotificationLevel(req.auth.id, (req.params as any).id, level, b.muted_until);
  });

  // ── in-app notification centre ──────────────────────────────────────────
  app.get("/v1/notifications", async (req) => {
    searchLimit(`notifications:${req.auth.id}`);
    const q = (req.query ?? {}) as any;
    return listNotifications(req.auth.id, q.before, q.limit);
  });

  app.get("/v1/notifications/unread-count", async (req) => ({ count: await unreadNotificationCount(req.auth.id) }));

  app.post("/v1/notifications/read", async (req) => {
    const b = (req.body ?? {}) as any;
    return markNotificationsRead(req.auth.id, b.ids);
  });

  app.delete("/v1/notifications/:id", async (req) => deleteNotification(req.auth.id, (req.params as any).id));
}
