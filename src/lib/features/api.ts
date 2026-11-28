/** Typed clients for Moments, Notes, Tasks and Vault (answered by the mock API in src/api/mock). */
import type {
  Moment, MomentGroup, MomentSettings, MomentVisibility, Note, NoteFolder, Task, TaskSummary, TaskView, TaskPriority,
  VaultItem, VaultUsage, User,
} from "@shared";
import { apiRaw } from "../api";
import { API_URL, USE_MOCKS } from "../../config";
import { mockVaultUpload } from "../../api/mock/features";
import { getToken } from "../../stores/session";

export const momentsApi = {
  feed: () => apiRaw<MomentGroup[]>("GET /v1/moments/feed"),
  mine: () => apiRaw<Moment[]>("GET /v1/moments/mine"),
  ofUser: (username: string) => apiRaw<Moment[]>("GET /v1/users/:u/moments", { params: { u: username } }),
  create: (body: { text?: string; attachment_id?: string; background?: string | null; visibility?: MomentVisibility; user_ids?: string[] }) =>
    apiRaw<Moment>("POST /v1/moments", { body }),
  view: (id: string) => apiRaw<{ ok: true }>("POST /v1/moments/:id/view", { params: { id }, body: {} }),
  viewers: (id: string) => apiRaw<{ user: User; viewed_at: string }[]>("GET /v1/moments/:id/views", { params: { id } }),
  remove: (id: string) => apiRaw<{ ok: true }>("DELETE /v1/moments/:id", { params: { id } }),
  settings: () => apiRaw<MomentSettings>("GET /v1/moments/settings"),
  saveSettings: (body: MomentSettings) => apiRaw<MomentSettings>("PUT /v1/moments/settings", { body }),
};

export interface NoteQuery { folder_id?: string; tag?: string; q?: string; pinned?: "1"; starred?: "1" }
export type NoteInput = Partial<Pick<Note, "title" | "body" | "tags" | "folder_id" | "pinned" | "starred">>;
export const notesApi = {
  list: (query: NoteQuery = {}) => apiRaw<Note[]>("GET /v1/notes", { query: query as Record<string, unknown> }),
  get: (id: string) => apiRaw<Note>("GET /v1/notes/:id", { params: { id } }),
  create: (body: NoteInput) => apiRaw<Note>("POST /v1/notes", { body }),
  update: (id: string, body: NoteInput) => apiRaw<Note>("PATCH /v1/notes/:id", { params: { id }, body }),
  remove: (id: string) => apiRaw<{ ok: true }>("DELETE /v1/notes/:id", { params: { id } }),
  tags: () => apiRaw<{ tag: string; count: number }[]>("GET /v1/notes/tags"),
  folders: () => apiRaw<NoteFolder[]>("GET /v1/notes/folders"),
  createFolder: (name: string) => apiRaw<NoteFolder>("POST /v1/notes/folders", { body: { name } }),
  renameFolder: (id: string, name: string) => apiRaw<NoteFolder>("PATCH /v1/notes/folders/:id", { params: { id }, body: { name } }),
  removeFolder: (id: string) => apiRaw<{ ok: true }>("DELETE /v1/notes/folders/:id", { params: { id } }),
};

export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export type TaskInput = Partial<Pick<Task, "title" | "notes" | "due_date" | "due_time" | "priority" | "done">>;
export const tasksApi = {
  list: (view: TaskView) => apiRaw<Task[]>("GET /v1/tasks", { query: { view, tz: tz() } }),
  summary: () => apiRaw<TaskSummary>("GET /v1/tasks/summary", { query: { tz: tz() } }),
  create: (body: TaskInput & { title: string }) => apiRaw<Task>("POST /v1/tasks", { body }),
  update: (id: string, body: TaskInput) => apiRaw<Task>("PATCH /v1/tasks/:id", { params: { id }, body }),
  remove: (id: string) => apiRaw<{ ok: true }>("DELETE /v1/tasks/:id", { params: { id } }),
  clearDone: () => apiRaw<{ ok: true; deleted: number }>("DELETE /v1/tasks/done"),
};
export type { TaskPriority };

export const vaultApi = {
  list: (query: { q?: string; type?: string } = {}) => apiRaw<VaultItem[]>("GET /v1/vault", { query }),
  usage: () => apiRaw<VaultUsage>("GET /v1/vault/usage"),
  rename: (id: string, name: string) => apiRaw<VaultItem>("PATCH /v1/vault/:id", { params: { id }, body: { name } }),
  remove: (id: string) => apiRaw<{ ok: true }>("DELETE /v1/vault/:id", { params: { id } }),
  /** XHR upload with progress. */
  upload(file: File, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<VaultItem> {
    if (USE_MOCKS) return mockVaultUpload(file, onProgress);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/v1/vault`);
      const t = getToken();
      if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data: any = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data as VaultItem);
        else reject(new Error(data?.message ?? `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort());
      const fd = new FormData();
      fd.append("name", file.name);
      fd.append("file", file);
      xhr.send(fd);
    });
  },
  /** Fetch file bytes with the bearer token. */
  async blob(item: VaultItem): Promise<Blob> {
    if (USE_MOCKS) return (await fetch(item.url)).blob();
    const r = await fetch(`${API_URL}${item.url}?inline=1`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
    if (!r.ok) throw new Error(`Couldn't open file (${r.status})`);
    return r.blob();
  },
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
