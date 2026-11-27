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
    };

export type AssistantItem = Extract<AiItem, { kind: "assistant" }>;

export interface AiChat {
  id: string;
  title: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
  items: AiItem[];
}

interface ChatsState {
  chats: AiChat[];
  currentId: string | null;
  create: (p?: Partial<Pick<AiChat, "title" | "systemPrompt">>) => string;
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
          const chat: AiChat = { id, title: p.title ?? "New chat", systemPrompt: p.systemPrompt ?? "", createdAt: now(), updatedAt: now(), items: [] };
          set({ chats: [chat, ...get().chats], currentId: id });
          return id;
        },
        select: (currentId) => set({ currentId }),
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
