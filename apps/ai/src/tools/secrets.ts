/**
 * Secrets tools: call the Secrets API (titan717/api.secrets) on behalf of the user with
 * Authorization: Bearer <x-secrets-token>. Messages are MessageView[] whose `ciphertext` is
 * plaintext JSON (prototype; see contract.ts openBody).
 */
import { openBody, type Conversation, type Dock, type DockMember, type MessageView, type User } from "../contract.js";
import { num, str, ToolError, type Tool, type ToolContext } from "./types.js";

async function api<T>(ctx: ToolContext, path: string): Promise<T> {
  if (!ctx.secretsToken) throw new ToolError("No Secrets session token provided (header x-secrets-token).");
  if (!ctx.secretsApiUrl) throw new ToolError("Secrets API URL unknown: send secrets_api_url in the request body or set SECRETS_API_URL.");
  let res: Response;
  try {
    res = await fetch(`${ctx.secretsApiUrl.replace(/\/+$/, "")}${path}`, { headers: { Authorization: `Bearer ${ctx.secretsToken}`, Accept: "application/json" }, signal: ctx.signal });
  } catch (e) {
    throw new ToolError(`Could not reach the Secrets API at ${ctx.secretsApiUrl}: ${(e as Error).message}`);
  }
  const text = await res.text();
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const hint = res.status === 401 ? " (session expired — sign in again)" : res.status === 403 ? " (you are not a member of this conversation)" : res.status === 404 ? " (not found)" : "";
    throw new ToolError(`Secrets API ${path.split("?")[0]} failed: ${res.status}${hint} ${j?.message ?? text.slice(0, 200)}`.trim());
  }
  return j as T;
}

async function userNames(ctx: ToolContext, convo: Conversation | null): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const add = (u: User) => names.set(u.id, u.display_name ? `${u.display_name} (@${u.username})` : `@${u.username}`);
  convo?.members?.forEach(add);
  if (convo?.dock_id && names.size === 0) {
    try {
      (await api<DockMember[]>(ctx, `/v1/docks/${encodeURIComponent(convo.dock_id)}/members`)).forEach((m) => add(m.user));
    } catch {
      /* best effort */
    }
  }
  return names;
}

async function transcript(ctx: ToolContext, conversationId: string, limit: number) {
  const id = encodeURIComponent(conversationId);
  const [msgs, convo] = await Promise.all([
    api<MessageView[]>(ctx, `/v1/conversations/${id}/messages?limit=${limit}`),
    api<Conversation>(ctx, `/v1/conversations/${id}`).catch(() => null),
  ]);
  const names = await userNames(ctx, convo);
  // API is newest-first; present chronologically
  const messages = [...msgs]
    .reverse()
    .filter((m) => !m.deleted)
    .map((m) => {
      const body = openBody(m);
      return {
        id: m.id,
        from: names.get(m.sender_id) ?? m.sender_id,
        at: m.created_at,
        text: body.text ?? "",
        ...(body.kind === "system" ? { system: true } : {}),
        ...(body.attachments?.length ? { attachments: body.attachments.map((a) => a.name ?? a.mime) } : {}),
        ...(body.reply_to ? { reply_to: body.reply_to } : {}),
      };
    });
  return { convo, messages };
}

export const secretsTools: Tool[] = [
  {
    name: "read_conversation",
    description: "Read recent messages of a Secrets conversation (DM, group or dock channel) in chronological order.",
    writes: false,
    parameters: {
      type: "object",
      properties: { conversation_id: { type: "string", description: "Conversation id" }, limit: { type: "integer", description: "Number of recent messages (1-200, default 50)" } },
      required: ["conversation_id"],
    },
    async run(a, ctx) {
      const { convo, messages } = await transcript(ctx, str(a, "conversation_id"), num(a, "limit", 50, 1, 200));
      return { conversation: convo ? { id: convo.id, kind: convo.kind, title: convo.title } : { id: str(a, "conversation_id") }, count: messages.length, messages };
    },
  },
  {
    name: "summarize_dock_channel",
    description: "Fetch recent messages of a dock channel so you can summarize them. Returns channel info and transcript; write the summary yourself.",
    writes: false,
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Channel id (same as its conversation id)" },
        dock_id: { type: "string", description: "Dock id (optional, adds channel name/topic)" },
        limit: { type: "integer", description: "Number of recent messages (1-200, default 100)" },
      },
      required: ["channel_id"],
    },
    async run(a, ctx) {
      const channelId = str(a, "channel_id");
      const { convo, messages } = await transcript(ctx, channelId, num(a, "limit", 100, 1, 200));
      const dockId = str(a, "dock_id", false) || convo?.dock_id || "";
      let channel: Record<string, unknown> = { id: channelId };
      if (dockId) {
        try {
          const dock = await api<Dock>(ctx, `/v1/docks/${encodeURIComponent(dockId)}`);
          const ch = dock.channels?.find((c) => c.id === channelId);
          channel = { id: channelId, name: ch?.name, topic: ch?.topic, dock: { id: dock.id, name: dock.name, handle: dock.handle } };
        } catch {
          /* best effort */
        }
      }
      return { channel, count: messages.length, messages, instruction: "Summarize key topics, decisions, open questions and action items (with owners)." };
    },
  },
  {
    name: "draft_message",
    description: "Prepare a draft message for a Secrets conversation. Does NOT send it — the user reviews and sends it themselves.",
    writes: true,
    parameters: {
      type: "object",
      properties: { conversation_id: { type: "string" }, text: { type: "string", description: "Draft message text" }, reply_to: { type: "string", description: "Optional message id to reply to" } },
      required: ["conversation_id", "text"],
    },
    async run(a) {
      return {
        draft: { conversation_id: str(a, "conversation_id"), text: str(a, "text"), reply_to: str(a, "reply_to", false) || null },
        sent: false,
        note: "Draft prepared. The user must send it from the app.",
      };
    },
  },
];
