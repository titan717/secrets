/**
 * In-memory demo database for mock mode (`VITE_USE_MOCKS=true`).
 *
 * It is a tiny, hand-written "backend": users, conversations, messages, Docks,
 * channels, notifications and attachments. Everything is persisted to
 * localStorage so a demo survives a refresh, and `resetMockDB()` restores the
 * seed. Nothing here talks to the network.
 */
import type {
  Attachment,
  Channel,
  Conversation,
  Dock,
  DockMember,
  DockRole,
  MessageView,
  NotificationItem,
  User,
} from "@shared";
import { uuid } from "../../lib/id";

export const MOCK_DB_KEY = "secrets.mock.db.v2";
export const DEMO_PASSWORD = "secrets123";

interface MockConversation {
  id: string;
  kind: Conversation["kind"];
  title: string | null;
  avatar_url: string | null;
  dock_id: string | null;
  member_ids: string[];
  created_at: string;
  read_at: string | null;
}

interface MockDock {
  id: string;
  name: string;
  handle: string;
  description: string;
  icon_url: string | null;
  visibility: Dock["visibility"];
  owner_id: string;
  created_at: string;
}

interface MockNotification {
  id: string;
  kind: NotificationItem["kind"];
  title: string;
  body: string;
  actor_id: string | null;
  conversation_id: string | null;
  dock_id: string | null;
  read_at: string | null;
  created_at: string;
}

interface MockMember {
  user_id: string;
  role: DockRole;
  joined_at: string;
}

export interface MockDB {
  v: number;
  session: boolean;
  me: string;
  users: User[];
  passwords: Record<string, string>;
  conversations: MockConversation[];
  messages: MessageView[];
  docks: MockDock[];
  dock_members: Record<string, MockMember[]>;
  channels: Channel[];
  notifications: MockNotification[];
  attachments: Record<string, Attachment>;
  invites: Record<string, string>;
  blocked: string[];
  seeded_at: string;
}

const nowIso = () => new Date().toISOString();
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function svgCover(a: string, b: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="960" height="640" fill="url(#g)"/><circle cx="760" cy="180" r="180" fill="rgba(255,255,255,.10)"/><circle cx="220" cy="500" r="220" fill="rgba(255,255,255,.06)"/><text x="64" y="556" font-family="Inter,system-ui,sans-serif" font-size="46" font-weight="600" fill="rgba(255,255,255,.92)">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const COVER_ONE = svgCover("#2c3fb0", "#0b0f2e", "studio / 04");
const COVER_TWO = svgCover("#a855f7", "#1e1b4b", "soft glow");

let seq = 0;
const msg = (
  conversation_id: string,
  sender_id: string,
  text: string,
  minutesAgo: number,
  extra: Partial<MessageView> & { attachments?: Attachment[] } = {},
): MessageView => {
  seq += 1;
  const { attachments, ...rest } = extra;
  const body: Record<string, unknown> = { kind: "text", text };
  if (attachments?.length) body.attachments = attachments;
  return {
    id: `m_${String(seq).padStart(3, "0")}`,
    conversation_id,
    sender_id,
    device_id: "d_demo",
    ciphertext: JSON.stringify(body),
    nonce: null,
    created_at: ago(minutesAgo),
    client_msg_id: `cm_${String(seq).padStart(3, "0")}`,
    reactions: [],
    ...rest,
  };
};

function seed(): MockDB {
  seq = 0;
  const me = "u_ava";
  const maya = "u_maya";
  const noah = "u_noah";
  const iris = "u_iris";
  const leo = "u_leo";
  const sofia = "u_sofia";
  const dev = "u_dev";

  const user = (id: string, username: string, display_name: string, about: string, status: string, email: string): User => ({
    id,
    username,
    display_name,
    about,
    avatar_url: null,
    accent: null,
    status,
    profile_visibility: "public",
    email,
    email_verified: true,
    created_at: ago(60 * 24 * 200),
  });

  const users: User[] = [
    user(me, "ava", "Ava Chen", "Designing quiet software. Coffee, film and long walks.", "In the studio", "ava@secrets.demo"),
    user(maya, "maya", "Maya Patel", "Product designer. Soft gradients, sharp type.", "Heads down", "maya@secrets.demo"),
    user(noah, "noah", "Noah Kim", "Building small tools that feel good.", "Around", "noah@secrets.demo"),
    user(iris, "iris", "Iris Okafor", "Community, ceramics and code.", "Out walking", "iris@secrets.demo"),
    user(leo, "leo", "Leo Martins", "Music + pixels.", "Making noise", "leo@secrets.demo"),
    user(sofia, "sofia", "Sofia Reyes", "Founder at Indie Makers.", "Shipping", "sofia@secrets.demo"),
    user(dev, "dev", "Dev Sharma", "Backend gremlin. Ask me about queues.", "Deep work", "dev@secrets.demo"),
  ];

  const conversations: MockConversation[] = [
    { id: "c_maya", kind: "dm", title: null, avatar_url: null, dock_id: null, member_ids: [me, maya], created_at: ago(60 * 24 * 40), read_at: ago(120) },
    { id: "c_noah", kind: "dm", title: null, avatar_url: null, dock_id: null, member_ids: [me, noah], created_at: ago(60 * 24 * 22), read_at: ago(200) },
    { id: "c_iris", kind: "dm", title: null, avatar_url: null, dock_id: null, member_ids: [me, iris], created_at: ago(60 * 24 * 12), read_at: ago(400) },
    { id: "g_crew", kind: "group", title: "Weekend crew", avatar_url: null, dock_id: null, member_ids: [me, maya, noah, iris], created_at: ago(60 * 24 * 60), read_at: ago(300) },
    { id: "ch_night_general", kind: "channel", title: "general", avatar_url: null, dock_id: "d_night", member_ids: [me, maya, noah, iris], created_at: ago(60 * 24 * 90), read_at: ago(100) },
    { id: "ch_night_design", kind: "channel", title: "design", avatar_url: null, dock_id: "d_night", member_ids: [me, maya, noah, iris], created_at: ago(60 * 24 * 80), read_at: ago(100) },
    { id: "ch_night_random", kind: "channel", title: "random", avatar_url: null, dock_id: "d_night", member_ids: [me, maya, noah, iris], created_at: ago(60 * 24 * 70), read_at: ago(100) },
    { id: "ch_indie_general", kind: "channel", title: "general", avatar_url: null, dock_id: "d_indie", member_ids: [me, iris, leo, sofia, dev], created_at: ago(60 * 24 * 45), read_at: ago(600) },
    { id: "ch_indie_showcase", kind: "channel", title: "showcase", avatar_url: null, dock_id: "d_indie", member_ids: [me, iris, leo, sofia, dev], created_at: ago(60 * 24 * 40), read_at: ago(600) },
    { id: "ch_design_lobby", kind: "channel", title: "lobby", avatar_url: null, dock_id: "d_design", member_ids: [maya, noah, leo, sofia], created_at: ago(60 * 24 * 30), read_at: null },
  ];

  const photo: Attachment = {
    id: "a_studio",
    url: COVER_ONE,
    mime: "image/svg+xml",
    width: 960,
    height: 640,
    size: 1480,
    name: "studio-04.svg",
  };
  const photo2: Attachment = {
    id: "a_glow",
    url: COVER_TWO,
    mime: "image/svg+xml",
    width: 960,
    height: 640,
    size: 1320,
    name: "soft-glow.svg",
  };

  const messages: MessageView[] = [
    msg("c_maya", maya, "Hey! Did you see the new dock layout?", 190),
    msg("c_maya", me, "Just opened it. The channel list feels so much calmer.", 180),
    msg("c_maya", maya, "That’s what I was going for. Less chrome, more room to breathe.", 175),
    msg("c_maya", maya, "A little preview 👇", 170, { attachments: [photo] }),
    msg("c_maya", me, "Okay this is gorgeous. Can we ship it Friday?", 160, { reactions: [{ emoji: "🔥", user_ids: [maya, noah] }] }),
    msg("c_maya", maya, "Friday works. I’ll do a final pass tonight.", 150),
    msg("c_maya", maya, "Also — are we still on for the night market?", 95),
    msg("c_maya", maya, "I found the little ramen place you mentioned 🍜", 35),

    msg("c_noah", noah, "The sync bug is fixed — retries no longer duplicate messages.", 300),
    msg("c_noah", me, "Legend. Deploying after lunch.", 280),
    msg("c_noah", noah, "I’ll keep an eye on the logs.", 270),

    msg("c_iris", me, "Sent you the invite to Night Owls.", 600),
    msg("c_iris", iris, "Joined! The design channel is lovely.", 580),
    msg("c_iris", iris, "Ceramics studio tour this weekend? I have two spots.", 420),

    msg("g_crew", noah, "Saturday hike? The weather looks unreal.", 500),
    msg("g_crew", iris, "I’m in. 8am at the north gate?", 480),
    msg("g_crew", maya, "Make it 9 and I’ll bring coffee.", 470),
    msg("g_crew", me, "9 it is. I’ll bring the good camera.", 460),
    msg("g_crew", noah, "Deal. Bringing snacks.", 40),

    msg("ch_night_general", maya, "Morning, owls. New palette is in #design.", 240),
    msg("ch_night_general", iris, "The violet is perfect. Very us.", 220),
    msg("ch_night_general", me, "Pinned the rollout plan. Shout if anything’s missing.", 200, { pinned: true }),

    msg("ch_night_design", maya, "Two directions — soft glow or sharp edges?", 300, { attachments: [photo2] }),
    msg("ch_night_design", noah, "Soft glow. Feels warmer.", 280),
    msg("ch_night_design", iris, "Soft glow, but keep the type sharp.", 260),
    msg("ch_night_design", me, "Agreed. Let’s lock soft glow + sharp type.", 240, { reactions: [{ emoji: "💜", user_ids: [maya, iris] }] }),

    msg("ch_night_random", noah, "Who else is watching the meteor shower tonight?", 150),
    msg("ch_night_random", iris, "Me! Bringing a blanket and too much tea.", 140),

    msg("ch_indie_general", sofia, "Welcome Ava! Introduce yourself in #showcase when you’re ready.", 800),
    msg("ch_indie_general", leo, "Hey Ava 👋", 780),
    msg("ch_indie_general", me, "Thanks! Happy to be here — I design calm interfaces.", 700),

    msg("ch_indie_showcase", leo, "Shipped a tiny synth that runs in the browser.", 900),
    msg("ch_indie_showcase", sofia, "This is delightful. Adding it to the Friday list.", 880),

    msg("ch_design_lobby", sofia, "Design Lab is open for critique night.", 1200),
  ];

  const docks: MockDock[] = [
    {
      id: "d_night",
      name: "Night Owls",
      handle: "nightowls",
      description: "A small studio for people who do their best work after midnight.",
      icon_url: null,
      visibility: "private",
      owner_id: me,
      created_at: ago(60 * 24 * 120),
    },
    {
      id: "d_indie",
      name: "Indie Makers",
      handle: "indiemakers",
      description: "Ship small things, share the process, cheer each other on.",
      icon_url: null,
      visibility: "public",
      owner_id: sofia,
      created_at: ago(60 * 24 * 200),
    },
    {
      id: "d_design",
      name: "Design Lab",
      handle: "designlab",
      description: "Weekly critique, type talk and interface archaeology.",
      icon_url: null,
      visibility: "public",
      owner_id: sofia,
      created_at: ago(60 * 24 * 90),
    },
  ];

  const member = (user_id: string, role: DockRole, days = 40): MockMember => ({ user_id, role, joined_at: ago(days * 24 * 60) });

  const dock_members: Record<string, MockMember[]> = {
    d_night: [member(me, "owner", 120), member(maya, "admin", 110), member(noah, "member", 80), member(iris, "member", 40)],
    d_indie: [member(sofia, "owner", 200), member(leo, "admin", 150), member(me, "member", 30), member(dev, "member", 60)],
    d_design: [member(sofia, "owner", 90), member(maya, "member", 60), member(noah, "member", 55), member(leo, "member", 20)],
  };

  const channel = (id: string, dock_id: string, name: string, topic: string, position: number): Channel => ({ id, dock_id, name, topic, position });

  const channels: Channel[] = [
    channel("ch_night_general", "d_night", "general", "Studio-wide announcements and hellos.", 0),
    channel("ch_night_design", "d_night", "design", "Work in progress, critique, and pretty pixels.", 1),
    channel("ch_night_random", "d_night", "random", "Off-topic, links, and late-night thoughts.", 2),
    channel("ch_indie_general", "d_indie", "general", "Say hello and share what you’re making.", 0),
    channel("ch_indie_showcase", "d_indie", "showcase", "Finished things and brave experiments.", 1),
    channel("ch_design_lobby", "d_design", "lobby", "Critique night starts here.", 0),
  ];

  const notifications: MockNotification[] = [
    { id: "n_1", kind: "mention", title: "Maya mentioned you", body: "“Agreed. Let’s lock soft glow + sharp type.”", actor_id: maya, conversation_id: "ch_night_design", dock_id: "d_night", read_at: null, created_at: ago(240) },
    { id: "n_2", kind: "message", title: "Noah in Weekend crew", body: "Deal. Bringing snacks.", actor_id: noah, conversation_id: "g_crew", dock_id: null, read_at: null, created_at: ago(40) },
    { id: "n_3", kind: "reaction", title: "Maya reacted 🔥", body: "to your message in your chat", actor_id: maya, conversation_id: "c_maya", dock_id: null, read_at: null, created_at: ago(150) },
    { id: "n_4", kind: "invite", title: "You joined Indie Makers", body: "Say hello in #general.", actor_id: sofia, conversation_id: "ch_indie_general", dock_id: "d_indie", read_at: ago(700), created_at: ago(720) },
    { id: "n_5", kind: "call", title: "Missed call from Noah", body: "Voice call · yesterday", actor_id: noah, conversation_id: "c_noah", dock_id: null, read_at: ago(200), created_at: ago(210) },
  ];

  return {
    v: 2,
    session: false,
    me,
    users,
    passwords: { [me]: DEMO_PASSWORD },
    conversations,
    messages,
    docks,
    dock_members,
    channels,
    notifications,
    attachments: { [photo.id]: photo, [photo2.id]: photo2 },
    invites: { d_night: "OWLS-9F2K", d_indie: "MAKERS-4Q", d_design: "LAB-7X" },
    blocked: [],
    seeded_at: nowIso(),
  };
}

let cache: MockDB | null = null;

export function getDB(): MockDB {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(MOCK_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDB;
      if (parsed?.v === 2) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    /* corrupted storage — reseed */
  }
  cache = seed();
  saveDB();
  return cache;
}

export function saveDB() {
  if (!cache) return;
  try {
    localStorage.setItem(MOCK_DB_KEY, JSON.stringify(cache));
  } catch {
    /* quota or private mode — keep working in memory */
  }
}

export function resetMockDB(): MockDB {
  cache = seed();
  saveDB();
  return cache;
}

/* ------------------------------------------------------------------ helpers */

export const isMockSession = () => getDB().session;
export const setMockSession = (on: boolean) => {
  getDB().session = on;
  saveDB();
};

export function findUser(id: string | null | undefined): User | undefined {
  if (!id) return undefined;
  return getDB().users.find((u) => u.id === id);
}

export function userByUsername(username: string): User | undefined {
  const u = username.replace(/^@/, "").toLowerCase();
  return getDB().users.find((x) => x.username.toLowerCase() === u || x.email?.toLowerCase() === u);
}

export function onlineUserIds(): string[] {
  return ["u_maya", "u_noah", "u_leo", "u_sofia"];
}

export function messagesFor(conversationId: string): MessageView[] {
  return getDB()
    .messages.filter((m) => m.conversation_id === conversationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function lastMessageFor(conversationId: string): MessageView | null {
  const list = messagesFor(conversationId);
  return list.length ? list[list.length - 1] : null;
}

function unreadFor(c: MockConversation, me: string): number {
  if (c.kind === "channel") return 0;
  const after = c.read_at ?? "";
  return messagesFor(c.id).filter((m) => m.sender_id !== me && !m.deleted && m.created_at > after).length;
}

export function toConversation(c: MockConversation): Conversation {
  const db = getDB();
  const memberIds = c.kind === "channel" ? (db.dock_members[c.dock_id ?? ""] ?? []).map((m) => m.user_id) : c.member_ids;
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    avatar_url: c.avatar_url,
    dock_id: c.dock_id,
    members: memberIds.map((id) => findUser(id)).filter((u): u is User => !!u),
    last_message: lastMessageFor(c.id),
    unread_count: unreadFor(c, db.me),
    created_at: c.created_at,
  };
}

export function findConversation(id: string): MockConversation | undefined {
  return getDB().conversations.find((c) => c.id === id);
}

export function toDock(d: MockDock): Dock {
  const db = getDB();
  const members = db.dock_members[d.id] ?? [];
  const mine = members.find((m) => m.user_id === db.me);
  return {
    id: d.id,
    name: d.name,
    handle: d.handle,
    description: d.description,
    icon_url: d.icon_url,
    visibility: d.visibility,
    owner_id: d.owner_id,
    member_count: members.length,
    my_role: mine?.role ?? null,
    channels: db.channels.filter((c) => c.dock_id === d.id).sort((a, b) => a.position - b.position),
    created_at: d.created_at,
  };
}

export function dockMembers(dockId: string): DockMember[] {
  return (getDB().dock_members[dockId] ?? [])
    .map((m) => {
      const user = findUser(m.user_id);
      return user ? { user, role: m.role, joined_at: m.joined_at } : null;
    })
    .filter((m): m is DockMember => !!m);
}

export function toNotification(n: MockNotification): NotificationItem {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    actor: findUser(n.actor_id) ?? null,
    conversation_id: n.conversation_id,
    dock_id: n.dock_id,
    read_at: n.read_at,
    created_at: n.created_at,
  };
}

export function addMessage(input: {
  conversation_id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string | null;
  client_msg_id?: string;
  device_id?: string;
}): MessageView {
  const db = getDB();
  if (input.client_msg_id) {
    const existing = db.messages.find((m) => m.sender_id === input.sender_id && m.client_msg_id === input.client_msg_id);
    if (existing) return existing;
  }
  const m: MessageView = {
    id: uuid(),
    conversation_id: input.conversation_id,
    sender_id: input.sender_id,
    device_id: input.device_id ?? "d_demo",
    ciphertext: input.ciphertext,
    nonce: input.nonce,
    created_at: nowIso(),
    client_msg_id: input.client_msg_id ?? uuid(),
    reactions: [],
  };
  db.messages.push(m);
  saveDB();
  return m;
}

export function notify(input: Omit<MockNotification, "id" | "read_at" | "created_at"> & { created_at?: string }): NotificationItem {
  const db = getDB();
  const n: MockNotification = {
    ...input,
    id: uuid(),
    read_at: null,
    created_at: input.created_at ?? nowIso(),
  };
  db.notifications.unshift(n);
  saveDB();
  return toNotification(n);
}

export function addDockChannel(dockId: string, name: string, topic = ""): Channel {
  const db = getDB();
  const position = db.channels.filter((c) => c.dock_id === dockId).length;
  const id = uuid();
  const ch: Channel = { id, dock_id: dockId, name, topic, position };
  db.channels.push(ch);
  const members = (db.dock_members[dockId] ?? []).map((m) => m.user_id);
  db.conversations.push({ id, kind: "channel", title: name, avatar_url: null, dock_id: dockId, member_ids: members, created_at: nowIso(), read_at: nowIso() });
  saveDB();
  return ch;
}
