/**
 * The mock REST router. It receives the same method/path/opts the real client
 * would send, and answers from the demo database in `./db.ts`.
 */
import type { Attachment, Dock, DockRole, Session, User } from "@shared";
import { openBody } from "@shared";
import { HttpError } from "../../lib/httpError";
import { uuid } from "../../lib/id";
import {
  addDockChannel,
  addMessage,
  DEMO_PASSWORD,
  dockMembers,
  findConversation,
  findUser,
  getDB,
  isMockSession,
  messagesFor,
  onlineUserIds,
  saveDB,
  setMockSession,
  toConversation,
  toDock,
  toNotification,
  userByUsername,
} from "./db";
import { featureRoute } from "./features";

interface Opts {
  body?: unknown;
  query?: Record<string, unknown>;
}

const bad = (message: string, code = "bad_request") => new HttpError(400, code, message);
const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
const unauth = () => new HttpError(401, "unauthorized", "Sign in to continue");

function bodyOf<T>(opts: Opts): T {
  return (opts.body ?? {}) as T;
}

function requireSession() {
  if (!isMockSession()) throw unauth();
  const db = getDB();
  const me = findUser(db.me);
  if (!me) throw unauth();
  return { db, me };
}

function asUser(u: User): User {
  return u;
}

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(bad("Could not read that file", "upload_failed"));
    reader.readAsDataURL(file);
  });
}

export async function mockRequest(method: string, path: string, opts: Opts = {}): Promise<unknown> {
  const url = new URL(path, "http://mock.local");
  const seg = url.pathname.split("/").filter(Boolean);
  const m = method.toUpperCase();
  const q = (key: string) => url.searchParams.get(key) ?? undefined;

  /* ------------------------------------------------------------------ config */

  if (m === "GET" && seg[1] === "config") {
    return { features: { calls: true, ai: true, docks: true, attachments: true, emailVerification: false, experimental: false } };
  }

  /* -------------------------------------------------------------------- auth */

  if (seg[1] === "auth") {
    const action = seg[2] ?? "";
    const db = getDB();

    if (m === "POST" && action === "signup") {
      const b = bodyOf<{ username?: string; email?: string; password?: string; display_name?: string }>(opts);
      const username = (b.username ?? "").trim().toLowerCase();
      const email = (b.email ?? "").trim().toLowerCase();
      if (!/^[a-z0-9_.]{3,24}$/.test(username)) throw bad("Use 3–24 letters, numbers, dots or underscores.");
      if (db.users.some((u) => u.username.toLowerCase() === username)) throw new HttpError(409, "username_taken", "That username is taken.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad("Enter a valid email address.");
      if ((b.password ?? "").length < 10) throw bad("Use at least 10 characters for your password.");
      const user: User = {
        id: uuid(),
        username,
        display_name: (b.display_name ?? "").trim() || username,
        about: "",
        avatar_url: null,
        accent: null,
        status: null,
        profile_visibility: "public",
        email,
        email_verified: false,
        created_at: new Date().toISOString(),
      };
      db.users.push(user);
      db.passwords[user.id] = b.password ?? "";
      db.session = true;
      db.me = user.id;
      saveDB();
      return { token: "mock-session", user, device_id: "d_demo" } satisfies Session;
    }

    if (m === "POST" && action === "login") {
      const b = bodyOf<{ username?: string; password?: string }>(opts);
      const user = userByUsername(b.username ?? "");
      if (!user) throw new HttpError(401, "invalid_credentials", "That username and password don’t match.");
      if (!(b.password ?? "").trim()) throw new HttpError(401, "invalid_credentials", "Enter your password.");
      const stored = db.passwords[user.id];
      if (stored && b.password !== stored && b.password !== DEMO_PASSWORD) {
        throw new HttpError(401, "invalid_credentials", "That username and password don’t match.");
      }
      db.session = true;
      db.me = user.id;
      saveDB();
      return { token: "mock-session", user, device_id: "d_demo" } satisfies Session;
    }

    if (m === "POST" && action === "logout") {
      setMockSession(false);
      return { ok: true as const };
    }

    if (m === "GET" && action === "session") {
      const { me } = requireSession();
      return { user: me, device_id: "d_demo", token: "mock-session" };
    }

    if (m === "GET" && action === "username-available") {
      const username = (q("username") ?? "").toLowerCase();
      return { available: !!username && !db.users.some((u) => u.username.toLowerCase() === username) };
    }

    if (m === "POST" && action === "verify-email") {
      const { me } = requireSession();
      me.email_verified = true;
      saveDB();
      return { ok: true as const, verified: true };
    }

    if (m === "POST" && action === "resend-verification") return { ok: true as const, dev_token: "mock-verify" };
    if (m === "POST" && action === "forgot-password") return { ok: true as const, dev_token: "mock-reset" };
    if (m === "POST" && action === "reset-password") return { ok: true as const, revoked_all: true };
    if (m === "POST" && action === "change-password") return { ok: true as const };
    if (m === "POST" && action === "service-token") return { token: "mock-service", expires_in: 3600 };
  }

  /* ---------------------------------------------------------------------- me */

  if (seg[1] === "me") {
    const { db, me } = requireSession();
    if (m === "GET" && seg.length === 2) return asUser(me);
    if (m === "PATCH" && seg.length === 2) {
      const b = bodyOf<Partial<Pick<User, "display_name" | "about" | "avatar_url" | "accent" | "status" | "profile_visibility">>>(opts);
      for (const key of ["display_name", "about", "avatar_url", "accent", "status", "profile_visibility"] as const) {
        if (b[key] !== undefined) (me as unknown as Record<string, unknown>)[key] = b[key];
      }
      saveDB();
      return me;
    }
    if (m === "DELETE" && seg.length === 2) {
      setMockSession(false);
      return { ok: true as const };
    }
    if (m === "POST" && seg[2] === "export") {
      return {
        user: me,
        conversations: db.conversations.filter((c) => c.member_ids.includes(me.id)).map((c) => toConversation(c)),
        messages: db.messages.filter((msg) => msg.sender_id === me.id),
        exported_at: new Date().toISOString(),
      };
    }
  }

  /* ------------------------------------------------------------------- users */

  if (seg[1] === "users") {
    requireSession();
    const db = getDB();
    if (m === "GET" && seg[2] === "search") {
      const needle = (q("q") ?? "").trim().toLowerCase().replace(/^@/, "");
      if (!needle) return [];
      return db.users
        .filter((u) => u.id !== db.me && !db.blocked.includes(u.id))
        .filter((u) => u.username.toLowerCase().includes(needle) || u.display_name.toLowerCase().includes(needle))
        .slice(0, 20);
    }
    if (m === "GET" && seg[2] && !seg[3]) {
      const u = userByUsername(decodeURIComponent(seg[2]));
      if (!u) throw notFound("User not found");
      return u;
    }
  }

  if (m === "GET" && seg[1] === "presence") {
    requireSession();
    const ids = (q("ids") ?? "").split(",").filter(Boolean);
    const online = new Set(onlineUserIds());
    const rows = (ids.length ? ids : getDB().users.map((u) => u.id)).map((id) => ({
      user_id: id,
      online: online.has(id),
      last_seen: online.has(id) ? null : new Date(Date.now() - 30 * 60_000).toISOString(),
    }));
    return rows;
  }

  /* ------------------------------------------------------------ conversations */

  if (seg[1] === "conversations") {
    const { db, me } = requireSession();
    const id = seg[2] ? decodeURIComponent(seg[2]) : "";

    if (m === "GET" && !id) {
      return db.conversations
        .filter((c) => c.kind !== "channel")
        .map(toConversation)
        .sort((a, b) => (b.last_message?.created_at ?? b.created_at).localeCompare(a.last_message?.created_at ?? a.created_at));
    }

    if (m === "POST" && id === "dm") {
      const b = bodyOf<{ user_id?: string }>(opts);
      const other = findUser(b.user_id);
      if (!other) throw notFound("User not found");
      if (other.id === me.id) throw bad("You can’t start a DM with yourself");
      if (db.blocked.includes(other.id)) throw bad("You can’t message this person.", "blocked");
      const existing = db.conversations.find(
        (c) => c.kind === "dm" && c.member_ids.length === 2 && c.member_ids.includes(me.id) && c.member_ids.includes(other.id),
      );
      if (existing) return toConversation(existing);
      const c = {
        id: uuid(),
        kind: "dm" as const,
        title: null,
        avatar_url: null,
        dock_id: null,
        member_ids: [me.id, other.id],
        created_at: new Date().toISOString(),
        read_at: new Date().toISOString(),
      };
      db.conversations.push(c);
      saveDB();
      return toConversation(c);
    }

    if (m === "POST" && id === "group") {
      const b = bodyOf<{ title?: string; member_ids?: string[] }>(opts);
      const ids = [...new Set([me.id, ...(b.member_ids ?? [])])].filter((x) => !!findUser(x));
      if (ids.length < 2) throw bad("Pick at least one other person");
      const c = {
        id: uuid(),
        kind: "group" as const,
        title: (b.title ?? "").trim() || "New group",
        avatar_url: null,
        dock_id: null,
        member_ids: ids,
        created_at: new Date().toISOString(),
        read_at: new Date().toISOString(),
      };
      db.conversations.push(c);
      saveDB();
      return toConversation(c);
    }

    const conv = findConversation(id);
    if (!conv) throw notFound("Conversation not found");
    if (conv.kind !== "channel" && !conv.member_ids.includes(me.id)) throw new HttpError(403, "forbidden", "You’re not a member of this conversation.");

    if (m === "GET" && seg.length === 3) return toConversation(conv);

    if (m === "PATCH" && seg.length === 3) {
      const b = bodyOf<{ title?: string; avatar_url?: string | null }>(opts);
      if (b.title !== undefined) conv.title = b.title;
      if (b.avatar_url !== undefined) conv.avatar_url = b.avatar_url;
      saveDB();
      return toConversation(conv);
    }

    if (m === "POST" && seg[3] === "members") {
      const b = bodyOf<{ user_ids?: string[] }>(opts);
      for (const uid of b.user_ids ?? []) if (findUser(uid) && !conv.member_ids.includes(uid)) conv.member_ids.push(uid);
      saveDB();
      return toConversation(conv);
    }

    if (m === "DELETE" && seg[3] === "members" && seg[4]) {
      const uid = decodeURIComponent(seg[4]);
      conv.member_ids = conv.member_ids.filter((x) => x !== uid);
      if (uid === me.id) {
        db.conversations = db.conversations.filter((c) => c.id !== conv.id);
      }
      saveDB();
      return { ok: true as const };
    }

    if (m === "POST" && seg[3] === "read") {
      const b = bodyOf<{ message_id?: string }>(opts);
      const target = db.messages.find((x) => x.id === b.message_id);
      conv.read_at = target?.created_at ?? new Date().toISOString();
      saveDB();
      return { ok: true as const };
    }

    if (m === "POST" && seg[3] === "delivered") return { ok: true as const };

    if (seg[3] === "messages") {
      if (m === "GET") {
        const limit = Math.min(Math.max(Number(q("limit")) || 40, 1), 100);
        const before = q("before");
        let list = messagesFor(conv.id).reverse();
        if (before) {
          const anchor = db.messages.find((x) => x.id === before);
          if (anchor) list = list.filter((x) => x.created_at < anchor.created_at);
        }
        return list.slice(0, limit);
      }
      if (m === "POST") {
        const b = bodyOf<{ ciphertext?: string; nonce?: string | null; client_msg_id?: string; device_id?: string }>(opts);
        if (!b.ciphertext) throw bad("Message body is required");
        return addMessage({
          conversation_id: conv.id,
          sender_id: me.id,
          ciphertext: b.ciphertext,
          nonce: b.nonce ?? null,
          client_msg_id: b.client_msg_id,
          device_id: b.device_id,
        });
      }
    }

    if (m === "GET" && seg[3] === "pins") {
      return messagesFor(conv.id)
        .filter((x) => x.pinned && !x.deleted)
        .reverse();
    }

    if (m === "GET" && seg[3] === "search") {
      const needle = (q("q") ?? "").trim().toLowerCase();
      if (!needle) return [];
      return messagesFor(conv.id)
        .filter((x) => !x.deleted && (openBody(x).text ?? "").toLowerCase().includes(needle))
        .reverse()
        .slice(0, 50);
    }
  }

  /* ----------------------------------------------------------------- messages */

  if (seg[1] === "messages" && seg[2]) {
    const { db, me } = requireSession();
    const message = db.messages.find((x) => x.id === decodeURIComponent(seg[2]!));
    if (!message) throw notFound("Message not found");
    const conv = findConversation(message.conversation_id);
    if (!conv) throw notFound("Conversation not found");

    if (m === "GET" && seg.length === 3) return message;

    if (m === "PATCH" && seg.length === 3) {
      if (message.sender_id !== me.id) throw new HttpError(403, "forbidden", "You can only edit your own messages.");
      const b = bodyOf<{ ciphertext?: string; nonce?: string | null }>(opts);
      if (b.ciphertext) message.ciphertext = b.ciphertext;
      if (b.nonce !== undefined) message.nonce = b.nonce;
      message.edited_at = new Date().toISOString();
      saveDB();
      return message;
    }

    if (m === "DELETE" && seg.length === 3) {
      if (message.sender_id !== me.id) throw new HttpError(403, "forbidden", "You can only delete your own messages.");
      message.deleted = true;
      message.ciphertext = JSON.stringify({ kind: "text", text: "" });
      saveDB();
      return message;
    }

    if (seg[3] === "reactions") {
      if (m === "POST") {
        const b = bodyOf<{ emoji?: string }>(opts);
        const emoji = (b.emoji ?? "").trim();
        if (!emoji) throw bad("Emoji is required");
        const group = message.reactions.find((r) => r.emoji === emoji);
        if (group) {
          if (!group.user_ids.includes(me.id)) group.user_ids.push(me.id);
        } else {
          message.reactions.push({ emoji, user_ids: [me.id] });
        }
        saveDB();
        return message;
      }
      if (m === "DELETE") {
        const emoji = decodeURIComponent(seg[4] ?? "");
        message.reactions = message.reactions
          .map((r) => (r.emoji === emoji ? { ...r, user_ids: r.user_ids.filter((u) => u !== me.id) } : r))
          .filter((r) => r.user_ids.length);
        saveDB();
        return message;
      }
    }

    if (seg[3] === "pin") {
      message.pinned = m === "POST";
      saveDB();
      return message;
    }

    if (seg[3] === "receipts") {
      return { delivered_count: 1, read_count: 1, delivered: [], read: [] };
    }
  }

  /* -------------------------------------------------------------- attachments */

  if (seg[1] === "attachments") {
    const { db } = requireSession();
    if (m === "POST") {
      const form = opts.body;
      if (!(form instanceof FormData)) throw bad("Send the file as multipart/form-data");
      const file = form.get("file");
      if (!(file instanceof File)) throw bad("Choose a file");
      if (file.size > 8 * 1024 * 1024) throw new HttpError(413, "too_large", "Files must be under 8 MB.");
      const allowed = ["image/", "application/pdf", "text/plain", "application/zip"];
      if (!allowed.some((p) => file.type.startsWith(p))) throw new HttpError(415, "unsupported_type", "That file type isn’t supported yet.");
      const att: Attachment = {
        id: uuid(),
        url: await dataUrl(file),
        mime: file.type || "application/octet-stream",
        size: file.size,
        name: file.name,
      };
      db.attachments[att.id] = att;
      saveDB();
      return att;
    }
    if (m === "GET" && seg[2]) {
      const att = db.attachments[decodeURIComponent(seg[2])];
      if (!att) throw notFound("Attachment not found");
      const res = await fetch(att.url);
      return res.blob();
    }
  }

  /* -------------------------------------------------------------------- docks */

  if (seg[1] === "docks") {
    const { db, me } = requireSession();

    if (m === "GET" && !seg[2]) {
      const mine = q("mine") === "1";
      return db.docks
        .map(toDock)
        .filter((d) => (mine ? !!d.my_role : d.visibility === "public" || !!d.my_role))
        .sort((a, b) => b.member_count - a.member_count);
    }

    if (m === "GET" && seg[2] === "discover") {
      const needle = (q("q") ?? "").trim().toLowerCase();
      return db.docks
        .map(toDock)
        .filter((d) => d.visibility === "public")
        .filter((d) => !needle || d.name.toLowerCase().includes(needle) || d.handle.includes(needle) || d.description.toLowerCase().includes(needle))
        .sort((a, b) => b.member_count - a.member_count);
    }

    if (m === "POST" && seg[2] === "join-by-code") {
      const code = (bodyOf<{ invite_code?: string }>(opts).invite_code ?? "").trim().toLowerCase();
      const dock = db.docks.find((d) => db.invites[d.id]?.toLowerCase() === code || d.handle.toLowerCase() === code);
      if (!dock) throw notFound("That invite code doesn’t match a dock.");
      const members = (db.dock_members[dock.id] ??= []);
      if (!members.some((x) => x.user_id === me.id)) members.push({ user_id: me.id, role: "member", joined_at: new Date().toISOString() });
      saveDB();
      return toDock(dock);
    }

    if (m === "POST" && !seg[2]) {
      const b = bodyOf<{ name?: string; handle?: string; description?: string; visibility?: Dock["visibility"] }>(opts);
      const name = (b.name ?? "").trim();
      const handle = (b.handle ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (!name) throw bad("Give your dock a name");
      if (handle.length < 3) throw bad("Handle must be at least 3 characters");
      if (db.docks.some((d) => d.handle === handle)) throw new HttpError(409, "handle_taken", "That handle is taken.");
      const dock = {
        id: uuid(),
        name,
        handle,
        description: (b.description ?? "").trim(),
        icon_url: null,
        visibility: b.visibility === "private" ? ("private" as const) : ("public" as const),
        owner_id: me.id,
        created_at: new Date().toISOString(),
      };
      db.docks.push(dock);
      db.dock_members[dock.id] = [{ user_id: me.id, role: "owner", joined_at: new Date().toISOString() }];
      db.invites[dock.id] = `${handle.slice(0, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      addDockChannel(dock.id, "general", "Start here. Say hello.");
      saveDB();
      return toDock(dock);
    }

    const dock = db.docks.find((d) => d.id === seg[2]);
    if (!dock) throw notFound("Dock not found");
    const members = (db.dock_members[dock.id] ??= []);

    if (m === "GET" && seg.length === 3) return toDock(dock);

    if (m === "PATCH" && seg.length === 3) {
      const b = bodyOf<Partial<Pick<Dock, "name" | "description" | "icon_url" | "visibility">>>(opts);
      for (const key of ["name", "description", "icon_url", "visibility"] as const) {
        if (b[key] !== undefined) (dock as unknown as Record<string, unknown>)[key] = b[key];
      }
      saveDB();
      return toDock(dock);
    }

    if (m === "DELETE" && seg.length === 3) {
      db.docks = db.docks.filter((d) => d.id !== dock.id);
      delete db.dock_members[dock.id];
      const channelIds = db.channels.filter((c) => c.dock_id === dock.id).map((c) => c.id);
      db.channels = db.channels.filter((c) => c.dock_id !== dock.id);
      db.conversations = db.conversations.filter((c) => !channelIds.includes(c.id));
      db.messages = db.messages.filter((x) => !channelIds.includes(x.conversation_id));
      saveDB();
      return { ok: true as const };
    }

    if (m === "POST" && seg[3] === "join") {
      if (!members.some((x) => x.user_id === me.id)) members.push({ user_id: me.id, role: "member", joined_at: new Date().toISOString() });
      saveDB();
      return toDock(dock);
    }

    if (m === "POST" && seg[3] === "leave") {
      db.dock_members[dock.id] = members.filter((x) => x.user_id !== me.id);
      saveDB();
      return { ok: true as const };
    }

    if (m === "POST" && seg[3] === "invite") {
      const code = db.invites[dock.id] ?? `${dock.handle.slice(0, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      db.invites[dock.id] = code;
      saveDB();
      return { invite_code: code };
    }

    if (seg[3] === "members") {
      if (m === "GET") return dockMembers(dock.id);
      if (m === "PATCH" && seg[4]) {
        const uid = decodeURIComponent(seg[4]);
        const role = bodyOf<{ role?: DockRole }>(opts).role;
        if (!role) throw bad("Role is required");
        const target = members.find((x) => x.user_id === uid);
        if (target) target.role = role;
        saveDB();
        return dockMembers(dock.id).find((x) => x.user.id === uid);
      }
      if (m === "DELETE" && seg[4]) {
        const uid = decodeURIComponent(seg[4]);
        db.dock_members[dock.id] = members.filter((x) => x.user_id !== uid);
        saveDB();
        return { ok: true as const };
      }
    }

    if (seg[3] === "channels") {
      if (m === "GET") return db.channels.filter((c) => c.dock_id === dock.id);
      if (m === "POST") {
        const b = bodyOf<{ name?: string; topic?: string }>(opts);
        const name = (b.name ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (!name) throw bad("Channel needs a name");
        if (db.channels.some((c) => c.dock_id === dock.id && c.name === name)) throw new HttpError(409, "channel_exists", "That channel already exists.");
        return addDockChannel(dock.id, name, b.topic ?? "");
      }
      if (seg[4]) {
        const ch = db.channels.find((c) => c.id === seg[4] && c.dock_id === dock.id);
        if (!ch) throw notFound("Channel not found");
        if (m === "PATCH") {
          const b = bodyOf<{ name?: string; topic?: string; position?: number }>(opts);
          if (b.name !== undefined) ch.name = b.name;
          if (b.topic !== undefined) ch.topic = b.topic;
          if (b.position !== undefined) ch.position = b.position;
          saveDB();
          return ch;
        }
        if (m === "DELETE") {
          db.channels = db.channels.filter((c) => c.id !== ch.id);
          db.conversations = db.conversations.filter((c) => c.id !== ch.id);
          db.messages = db.messages.filter((x) => x.conversation_id !== ch.id);
          saveDB();
          return { ok: true as const };
        }
      }
    }
  }

  /* ------------------------------------------------------------- notifications */

  if (seg[1] === "notifications") {
    const { db } = requireSession();
    if (m === "GET" && seg[2] === "unread-count") {
      return { count: db.notifications.filter((n) => !n.read_at).length };
    }
    if (m === "GET") {
      const limit = Math.min(Math.max(Number(q("limit")) || 40, 1), 100);
      let list = [...db.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const before = q("before");
      if (before) {
        const anchor = list.find((n) => n.id === before);
        if (anchor) list = list.filter((n) => n.created_at < anchor.created_at);
      }
      return list.slice(0, limit).map(toNotification);
    }
    if (m === "POST" && seg[2] === "read") {
      const b = bodyOf<{ ids?: string[] }>(opts);
      const ids = b.ids?.length ? new Set(b.ids) : null;
      let updated = 0;
      for (const n of db.notifications) {
        if (!n.read_at && (!ids || ids.has(n.id))) {
          n.read_at = new Date().toISOString();
          updated += 1;
        }
      }
      saveDB();
      return { ok: true as const, updated };
    }
    if (m === "DELETE" && seg[2]) {
      db.notifications = db.notifications.filter((n) => n.id !== seg[2]);
      saveDB();
      return { ok: true as const };
    }
  }

  /* ------------------------------------------------------------------- search */

  if (m === "GET" && seg[1] === "search") {
    const { db, me } = requireSession();
    const needle = (q("q") ?? "").trim().toLowerCase();
    if (!needle) throw bad("q is required");
    const convIds = db.conversations
      .filter((c) => c.kind !== "channel" ? c.member_ids.includes(me.id) : true)
      .map((c) => c.id);
    const messageRows = db.messages
      .filter((x) => convIds.includes(x.conversation_id) && !x.deleted && (openBody(x).text ?? "").toLowerCase().includes(needle))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20)
      .map((message) => {
        const c = findConversation(message.conversation_id)!;
        return { message, conversation: { id: c.id, kind: c.kind, title: c.title ?? (c.kind === "dm" ? "Direct message" : "Conversation") } };
      });
    return {
      query: needle,
      messages: messageRows,
      users: db.users.filter((u) => u.id !== me.id && (u.username.includes(needle) || u.display_name.toLowerCase().includes(needle))).slice(0, 10),
      conversations: db.conversations
        .filter((c) => c.kind !== "channel" && c.member_ids.includes(me.id) && (c.title ?? "").toLowerCase().includes(needle))
        .map(toConversation)
        .slice(0, 10),
      docks: db.docks
        .filter((d) => d.visibility === "public" || (db.dock_members[d.id] ?? []).some((x) => x.user_id === me.id))
        .filter((d) => d.name.toLowerCase().includes(needle) || d.handle.includes(needle))
        .map(toDock)
        .slice(0, 10),
    };
  }

  /* ------------------------------------------- moments, notes, tasks, drive */

  if (["moments", "notes", "tasks", "vault"].includes(seg[1]) || (seg[1] === "users" && seg[3] === "moments")) {
    const { db, me } = requireSession();
    const out = featureRoute(m, seg, (opts.body ?? {}) as Record<string, any>, q, me, db.users);
    if (out !== undefined) return out;
  }

  throw notFound(`${method} ${url.pathname}`);
}
