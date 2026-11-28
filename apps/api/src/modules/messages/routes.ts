import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/service.js";
import { sendMessage, listMessages, react, editMessage, deleteMessage, hideMessage, visibleMessage, setPin, listPins, searchMessages, messageReceipts } from "./service.js";
import { markDelivered } from "../moderation/service.js";
import { messageViews } from "../../lib/views.js";

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/v1/conversations/:id/messages", async (req) => {
    const q = (req.query ?? {}) as any;
    return listMessages(req.auth.id, (req.params as any).id, q.before, q.limit);
  });

  app.post("/v1/conversations/:id/messages", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const { message, created } = await sendMessage(req.auth.id, req.auth.device_id, (req.params as any).id, b);
    reply.code(created ? 201 : 200);
    return message;
  });

  // Text search in a conversation: ?q=&limit=&before=<messageId>
  app.get("/v1/conversations/:id/search", async (req) => {
    const q = (req.query ?? {}) as any;
    return searchMessages(req.auth.id, (req.params as any).id, q.q, q.limit, q.before);
  });

  // Extra: pinned messages in a conversation.
  app.get("/v1/conversations/:id/pins", async (req) => listPins(req.auth.id, (req.params as any).id));

  app.get("/v1/messages/:id", async (req) => {
    const { row } = await visibleMessage(req.auth.id, (req.params as any).id);
    return (await messageViews([row]))[0];
  });

  // Extra: edit (sender only). Body { ciphertext, nonce }.
  app.patch("/v1/messages/:id", async (req) => editMessage(req.auth.id, (req.params as any).id, (req.body ?? {}) as any));

  // Soft delete for everyone (sender, or group owner / dock admin). `?scope=me` hides it only for the caller.
  app.delete("/v1/messages/:id", async (req) => {
    if (String((req.query as any)?.scope ?? "") === "me") return hideMessage(req.auth.id, (req.params as any).id);
    return deleteMessage(req.auth.id, (req.params as any).id);
  });

  // Per-recipient delivered/read state (dm/group).
  app.get("/v1/messages/:id/receipts", async (req) => messageReceipts(req.auth.id, (req.params as any).id));

  app.post("/v1/messages/:id/reactions", async (req) => react(req.auth.id, (req.params as any).id, (req.body as any)?.emoji, true));

  app.delete("/v1/messages/:id/reactions/:emoji", async (req) => {
    const p = req.params as any;
    return react(req.auth.id, p.id, p.emoji, false);
  });

  // Delivery acknowledgement (REST fallback when the socket is unavailable).
  app.post("/v1/conversations/:id/delivered", async (req) => {
    const b = (req.body ?? {}) as any;
    await markDelivered(req.auth.id, String((req.params as any).id), typeof b.message_id === "string" ? b.message_id : null);
    return { ok: true as const };
  });

  app.post("/v1/messages/:id/pin", async (req) => setPin(req.auth.id, (req.params as any).id, true));
  app.delete("/v1/messages/:id/pin", async (req) => setPin(req.auth.id, (req.params as any).id, false));
}
