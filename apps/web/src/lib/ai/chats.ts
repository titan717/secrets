import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uuid } from "../id";

export type ConfirmState = "pending" | "approved" | "denied";

export type AssistantPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; call_id: string; name: string; args: unknown; writes: boolean; result?: unknown; denied?: boolean; confirm?: ConfirmState };

export type AiItem =
  | { kind: "user"; id: string; text: string; at: string }
  | {
      kind: "assistant";
      id: string;
      at: string;
      parts: AssistantPart[];
      status: "streaming" | "done" | "stopped" | "error";
      step?: { step: number; max_steps: number };
      note?: string;
      error?: string;
      run_id?: string;
      /** When the first reasoning delta arrived / when it ended (ms epoch). */
      thinkStart?: number;
      thinkEnd?: number;
      /** From `thinking.summary`; overrides the measured time. */
      thoughtSeconds?: number;
      /** Progress labels from `activity` events (latest last). */
      activity?: { label: string; at: number }[];
      usage?: { input: number; output: number; cost: number; estimated: boolean };
      model?: string;
      finishedAt?: number;
      feedback?: "up" | "down";
      /** A fact the assistant proposed to remember (user confirms in the UI). */
      memoryProposal?: { text: string; state: "pending" | "saved" | "dismissed" };
    };

export type AssistantItem = Extract<AiItem, { kind: "assistant" }>;

export interface AiChat {
  id: string;
  title: string;
  systemPrompt: string;
  projectId?: string;
  /** Incognito chats are never persisted, searched, or used for memory. */
  incognito?: boolean;
  createdAt: string;
  updatedAt: string;
  items: AiItem[];
}

interface ChatsState {
  chats: AiChat[];
  currentId: string | null;
  create: (p?: Partial<Pick<AiChat, "title" | "systemPrompt" | "projectId" | "incognito">>) => string;
  setProject: (id: string, projectId: string | undefined) => void;
  setIncognito: (id: string, incognito: boolean) => void;
  /** Drop items from index onward (used by regenerate). */
  truncate: (id: string, fromItemId: string) => void;
  select: (id: string | null) => void;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  setSystemPrompt: (id: string, prompt: string) => void;
  clear: (id: string) => void;
  addItem: (id: string, item: AiItem) => void;
  /** Mutate an assistant item in place (immutably). */
  patchAssistant: (chatId: string, itemId: string, fn: (it: AssistantItem) => AssistantItem) => void;
}

const now = () => new Date().toISOString();

export const useAiChats = create<ChatsState>()(
  persist(
    (set, get) => {
      const update = (id: string, fn: (c: AiChat) => AiChat) => set({ chats: get().chats.map((c) => (c.id === id ? fn(c) : c)) });
      return {
        chats: [],
        currentId: null,
        create: (p = {}) => {
          const id = uuid();
          const chat: AiChat = { id, title: p.title ?? "New chat", systemPrompt: p.systemPrompt ?? "", projectId: p.projectId, incognito: p.incognito, createdAt: now(), updatedAt: now(), items: [] };
          set({ chats: [chat, ...get().chats], currentId: id });
          return id;
        },
        select: (currentId) => set({ currentId }),
        setProject: (id, projectId) => update(id, (c) => ({ ...c, projectId })),
        setIncognito: (id, incognito) => update(id, (c) => ({ ...c, incognito })),
        truncate: (id, fromItemId) =>
          update(id, (c) => {
            const i = c.items.findIndex((it) => it.id === fromItemId);
            return i < 0 ? c : { ...c, items: c.items.slice(0, i), updatedAt: now() };
          }),
        remove: (id) => {
          const chats = get().chats.filter((c) => c.id !== id);
          set({ chats, currentId: get().currentId === id ? (chats[0]?.id ?? null) : get().currentId });
        },
        rename: (id, title) => update(id, (c) => ({ ...c, title: title.trim() || c.title })),
        setSystemPrompt: (id, systemPrompt) => update(id, (c) => ({ ...c, systemPrompt })),
        clear: (id) => update(id, (c) => ({ ...c, items: [], updatedAt: now() })),
        addItem: (id, item) =>
          update(id, (c) => {
            const first = item.kind === "user" && !c.items.some((i) => i.kind === "user") && c.title === "New chat";
            return { ...c, items: [...c.items, item], updatedAt: now(), title: first ? titleFrom(item.text) : c.title };
          }),
        patchAssistant: (chatId, itemId, fn) =>
          update(chatId, (c) => ({ ...c, items: c.items.map((i) => (i.id === itemId && i.kind === "assistant" ? fn(i) : i)) })),
      };
    },
    {
      name: "secrets.ai.chats",
      version: 1,
      partialize: (s) => ({ chats: s.chats.filter((c) => !c.incognito), currentId: s.chats.some((c) => c.id === s.currentId && !c.incognito) ? s.currentId : null }) as unknown as ChatsState,
      // A reload mid-stream leaves items "streaming" — mark them stopped.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.chats = state.chats.map((c) => ({
          ...c,
          items: c.items.map((i) =>
            i.kind === "assistant" && i.status === "streaming"
              ? { ...i, status: "stopped", parts: i.parts.map((p) => (p.type === "tool" && p.confirm === "pending" ? { ...p, confirm: "denied" as const } : p)) }
              : i,
          ),
        }));
      },
    },
  ),
);

function titleFrom(text: string) {
  const t = text.replace(/[*_`#>~]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 46)}…` : t || "New chat";
}

export function getChat(id: string | null | undefined) {
  return id ? useAiChats.getState().chats.find((c) => c.id === id) : undefined;
}

/** Plain text of an assistant item (text parts only). */
export function assistantText(it: AssistantItem): string {
  return it.parts
    .filter((p): p is Extract<AssistantPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

/** Seconds spent thinking, preferring the bridge's `thinking.summary`. */
export function thoughtSeconds(it: AssistantItem): number | null {
  if (typeof it.thoughtSeconds === "number") return it.thoughtSeconds;
  if (!it.thinkStart) return null;
  const end = it.thinkEnd ?? it.finishedAt;
  if (!end) return null;
  return Math.max(1, Math.round((end - it.thinkStart) / 1000));
}

export function chatText(c: AiChat): string {
  return c.items.map((i) => (i.kind === "user" ? i.text : assistantText(i))).join("\n");
}
