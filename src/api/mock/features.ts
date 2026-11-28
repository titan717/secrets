/**
 * Mock routes for Moments (stories), Notes, Tasks and the Drive (vault).
 * Stored in localStorage next to the main demo database so the app works
 * fully offline in mock mode.
 */
import type { Moment, MomentGroup, MomentSettings, Note, NoteFolder, Task, TaskView, User, VaultItem } from "@shared";
import { HttpError } from "../../lib/httpError";
import { uuid } from "../../lib/id";

const KEY = "secrets.mock.features";
const DAY = 86_400_000;
export const VAULT_QUOTA = 5 * 1024 ** 3;

interface FeatureDB {
  moments: Moment[];
  views: Record<string, { user_id: string; viewed_at: string }[]>;
  moment_settings: MomentSettings;
  notes: Note[];
  folders: Omit<NoteFolder, "note_count">[];
  tasks: Task[];
  vault: (VaultItem & { data?: string })[];
  /** Demo stories from friends are added once, on first read. */
  seededStories?: boolean;
}

let cache: FeatureDB | null = null;

const iso = (t = Date.now()) => new Date(t).toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function seed(): FeatureDB {
  const now = Date.now();
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(now + DAY));
  const task = (title: string, due_date: string | null, priority: Task["priority"] = "normal", done = false): Task => ({
    id: uuid(), title, notes: "", due_date, due_time: null, priority, done, done_at: done ? iso() : null, created_at: iso(), updated_at: iso(),
  });
  const folder = { id: uuid(), name: "Personal", position: 0, created_at: iso() };
  return {
    moments: [],
    views: {},
    moment_settings: { visibility: "all_friends", user_ids: [] },
    notes: [
      { id: uuid(), folder_id: folder.id, title: "Welcome to Notes", body: "Write notes and keep them next to your tasks.", tags: ["secrets"], pinned: true, starred: false, created_at: iso(now - DAY), updated_at: iso(now - DAY) },
    ],
    folders: [folder],
    tasks: [task("Reply to Leo about the weekend", today, "high"), task("Pick up film rolls", tomorrow), task("Read the new release notes", null, "low")],
    vault: [],
  };
}

function db(): FeatureDB {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as FeatureDB) : seed();
  } catch {
    cache = seed();
  }
  return cache;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    /* storage full: keep in memory */
  }
}
/** Test helper. */
export function resetFeatureDB() {
  cache = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const notFound = () => new HttpError(404, "not_found", "Not found");
const bad = (m: string) => new HttpError(400, "bad_request", m);

function taskBucket(t: Task, today: string): TaskView {
  if (t.done) return "done";
  if (!t.due_date) return "someday";
  return t.due_date <= today ? "today" : "upcoming";
}

/** Returns `undefined` when the path is not a feature route. */
export function featureRoute(
  m: string,
  seg: string[],
  body: Record<string, any>,
  q: (k: string) => string | undefined,
  me: User,
  users: User[],
): unknown {
  const d = db();
  const area = seg[1];

  /* --------------------------------------------------------------- moments */
  if (area === "moments" || (area === "users" && seg[3] === "moments")) {
    if (!d.seededStories) {
      d.seededStories = true;
      const friends = users.filter((u) => u.id !== me.id).slice(0, 3);
      const texts = ["Sunday market haul", "Ship it.", "New glaze test"];
      const bgs = ["aurora", "ocean", "ember"];
      friends.forEach((u, i) => {
        const at = Date.now() - (i + 1) * 3_600_000;
        d.moments.push({ id: uuid(), user_id: u.id, kind: "text", text: texts[i], background: bgs[i], attachment: null, visibility: "all_friends", created_at: iso(at), expires_at: iso(at + DAY), viewed: false, view_count: 0 });
      });
      save();
    }
    const live = () => d.moments.filter((x) => Date.parse(x.expires_at) > Date.now());
    if (area === "users") {
      const u = users.find((x) => x.username === seg[2]);
      return u ? live().filter((x) => x.user_id === u.id) : [];
    }
    if (m === "GET" && seg[2] === "settings") return d.moment_settings;
    if (m === "PUT" && seg[2] === "settings") {
      d.moment_settings = { visibility: body.visibility ?? "all_friends", user_ids: body.user_ids ?? [] };
      save();
      return d.moment_settings;
    }
    if (m === "GET" && seg[2] === "mine") return live().filter((x) => x.user_id === me.id);
    if (m === "GET" && seg[2] === "feed") {
      const groups = new Map<string, Moment[]>();
      for (const x of live()) groups.set(x.user_id, [...(groups.get(x.user_id) ?? []), x]);
      const out: MomentGroup[] = [];
      for (const [uid, list] of groups) {
        const user = users.find((u) => u.id === uid);
        if (!user) continue;
        out.push({ user, moments: list, has_unseen: list.some((x) => !x.viewed), latest_at: list[list.length - 1].created_at });
      }
      return out.sort((a, b) => b.latest_at.localeCompare(a.latest_at));
    }
    if (m === "POST" && !seg[2]) {
      if (!body.text && !body.attachment_id) throw bad("Add a photo or some text");
      const x: Moment = {
        id: uuid(), user_id: me.id, kind: body.attachment_id ? "image" : "text", text: body.text ?? "", background: body.background ?? null,
        attachment: null, visibility: body.visibility ?? d.moment_settings.visibility, user_ids: body.user_ids ?? d.moment_settings.user_ids,
        created_at: iso(), expires_at: iso(Date.now() + DAY), viewed: true, view_count: 0,
      };
      d.moments.push(x);
      save();
      return x;
    }
    const x = d.moments.find((y) => y.id === seg[2]);
    if (!x) throw notFound();
    if (m === "POST" && seg[3] === "view") {
      x.viewed = true;
      save();
      return { ok: true };
    }
    if (m === "GET" && seg[3] === "views") {
      return (d.views[x.id] ?? []).map((v) => ({ user: users.find((u) => u.id === v.user_id), viewed_at: v.viewed_at })).filter((v) => v.user);
    }
    if (m === "DELETE") {
      d.moments = d.moments.filter((y) => y.id !== x.id);
      save();
      return { ok: true };
    }
    throw notFound();
  }

  /* ----------------------------------------------------------------- notes */
  if (area === "notes") {
    if (seg[2] === "folders") {
      if (m === "GET") return d.folders.map((f) => ({ ...f, note_count: d.notes.filter((n) => n.folder_id === f.id).length }));
      if (m === "POST") {
        if (!String(body.name ?? "").trim()) throw bad("Give the folder a name");
        const f = { id: uuid(), name: String(body.name).trim(), position: d.folders.length, created_at: iso() };
        d.folders.push(f);
        save();
        return { ...f, note_count: 0 };
      }
      const f = d.folders.find((x) => x.id === seg[3]);
      if (!f) throw notFound();
      if (m === "PATCH") {
        f.name = String(body.name ?? f.name);
        save();
        return { ...f, note_count: d.notes.filter((n) => n.folder_id === f.id).length };
      }
      if (m === "DELETE") {
        d.folders = d.folders.filter((x) => x.id !== f.id);
        for (const n of d.notes) if (n.folder_id === f.id) n.folder_id = null;
        save();
        return { ok: true };
      }
    }
    if (m === "GET" && seg[2] === "tags") {
      const counts = new Map<string, number>();
      for (const n of d.notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts].map(([tag, count]) => ({ tag, count }));
    }
    if (m === "GET" && !seg[2]) {
      const needle = (q("q") ?? "").toLowerCase();
      return d.notes
        .filter((n) => (!q("folder_id") || n.folder_id === q("folder_id")) && (!q("tag") || n.tags.includes(q("tag")!)))
        .filter((n) => (!q("pinned") || n.pinned) && (!q("starred") || n.starred))
        .filter((n) => !needle || `${n.title} ${n.body}`.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
    }
    if (m === "POST" && !seg[2]) {
      const n: Note = {
        id: uuid(), folder_id: body.folder_id ?? null, title: body.title ?? "", body: body.body ?? "", tags: body.tags ?? [],
        pinned: !!body.pinned, starred: !!body.starred, created_at: iso(), updated_at: iso(),
      };
      d.notes.push(n);
      save();
      return n;
    }
    const n = d.notes.find((x) => x.id === seg[2]);
    if (!n) throw notFound();
    if (m === "GET") return n;
    if (m === "PATCH") {
      Object.assign(n, body, { updated_at: iso() });
      save();
      return n;
    }
    if (m === "DELETE") {
      d.notes = d.notes.filter((x) => x.id !== n.id);
      save();
      return { ok: true };
    }
  }

  /* ----------------------------------------------------------------- tasks */
  if (area === "tasks") {
    const today = ymd(new Date());
    if (m === "GET" && seg[2] === "summary") {
      const open = d.tasks.filter((t) => !t.done);
      return {
        today_date: today,
        overdue: open.filter((t) => t.due_date && t.due_date < today).length,
        today: open.filter((t) => t.due_date === today).length,
        upcoming: open.filter((t) => t.due_date && t.due_date > today).length,
        open: open.length,
        done: d.tasks.length - open.length,
      };
    }
    if (m === "DELETE" && seg[2] === "done") {
      const before = d.tasks.length;
      d.tasks = d.tasks.filter((t) => !t.done);
      save();
      return { ok: true, deleted: before - d.tasks.length };
    }
    if (m === "GET" && !seg[2]) {
      const view = (q("view") ?? "all") as TaskView;
      return d.tasks.filter((t) => (view === "all" ? !t.done : taskBucket(t, today) === view));
    }
    if (m === "POST" && !seg[2]) {
      if (!String(body.title ?? "").trim()) throw bad("Give the task a title");
      const t: Task = {
        id: uuid(), title: String(body.title).trim(), notes: body.notes ?? "", due_date: body.due_date ?? null, due_time: body.due_time ?? null,
        priority: body.priority ?? "normal", done: false, done_at: null, created_at: iso(), updated_at: iso(),
      };
      d.tasks.push(t);
      save();
      return t;
    }
    const t = d.tasks.find((x) => x.id === seg[2]);
    if (!t) throw notFound();
    if (m === "PATCH") {
      Object.assign(t, body, { updated_at: iso() });
      if ("done" in body) t.done_at = body.done ? iso() : null;
      save();
      return t;
    }
    if (m === "DELETE") {
      d.tasks = d.tasks.filter((x) => x.id !== t.id);
      save();
      return { ok: true };
    }
  }

  /* ----------------------------------------------------------------- drive */
  if (area === "vault") {
    const strip = ({ data: _data, ...v }: VaultItem & { data?: string }) => v;
    if (m === "GET" && seg[2] === "usage") {
      return { used_bytes: d.vault.reduce((s, v) => s + v.size, 0), item_count: d.vault.length, quota_bytes: VAULT_QUOTA, max_file_bytes: 2 * 1024 ** 3 };
    }
    if (m === "GET" && !seg[2]) {
      const needle = (q("q") ?? "").toLowerCase();
      const type = q("type");
      return d.vault
        .filter((v) => (!needle || v.name.toLowerCase().includes(needle)) && (!type || v.mime.startsWith(type)))
        .map(strip)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    const v = d.vault.find((x) => x.id === seg[2]);
    if (!v) throw notFound();
    if (m === "PATCH") {
      v.name = String(body.name ?? v.name);
      v.updated_at = iso();
      save();
      return strip(v);
    }
    if (m === "DELETE") {
      d.vault = d.vault.filter((x) => x.id !== v.id);
      save();
      return { ok: true };
    }
  }

  return undefined;
}

/** Mock upload used by `vaultApi.upload` when mocks are on. */
export async function mockVaultUpload(file: File, onProgress?: (p: number) => void): Promise<VaultItem> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Upload failed"));
    r.readAsDataURL(file);
  });
  onProgress?.(1);
  const id = uuid();
  const item = { id, name: file.name, mime: file.type || "application/octet-stream", size: file.size, url: data, encrypted: true, created_at: iso(), updated_at: iso() };
  const d = db();
  // Keep big files in memory only so localStorage doesn't overflow.
  d.vault.push(item);
  save();
  return item;
}
