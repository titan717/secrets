/** Contracts for Moments, Notes, Tasks, Vault (served by the mock API in src/api/mock). */
import type { ID, User } from "./types";
import type { Attachment } from "./envelope";

export type MomentVisibility = "all_friends" | "public" | "only" | "except";
export interface Moment {
  id: ID; user_id: ID; kind: "image" | "text"; text: string; background: string | null;
  attachment: Attachment | null; visibility: MomentVisibility; user_ids?: ID[];
  created_at: string; expires_at: string; viewed: boolean; view_count?: number;
}
export interface MomentGroup { user: User; moments: Moment[]; has_unseen: boolean; latest_at: string }
export interface MomentSettings { visibility: MomentVisibility; user_ids: ID[] }

export interface Note {
  id: ID; folder_id: ID | null; title: string; body: string; tags: string[];
  pinned: boolean; starred: boolean; created_at: string; updated_at: string;
}
export interface NoteFolder { id: ID; name: string; position: number; note_count: number; created_at: string }

export type TaskPriority = "high" | "normal" | "low";
export type TaskView = "all" | "today" | "upcoming" | "someday" | "done";
export interface Task {
  id: ID; title: string; notes: string; due_date: string | null; due_time: string | null;
  priority: TaskPriority; done: boolean; done_at: string | null; created_at: string; updated_at: string;
}
export interface TaskSummary { today_date: string; overdue: number; today: number; upcoming: number; open: number; done: number }

export interface VaultItem { id: ID; name: string; mime: string; size: number; url: string; encrypted: boolean; created_at: string; updated_at: string }
export interface VaultUsage { used_bytes: number; item_count: number; quota_bytes: number; max_file_bytes: number }

export type FeatureServerFrame =
  | { t: "moment.new"; moment: Moment }
  | { t: "moment.remove"; moment_id: ID; user_id: ID }
  | { t: "moment.view"; moment_id: ID; user: User; viewed_at: string };
