import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiShareLink } from "@secrets/shared";
import { uuid } from "../id";
import { bridge, bridgeEnabled } from "./bridge";
import type { AiItem } from "./chats";
import { getChat } from "./chats";

export interface ShareSnapshot extends AiShareLink {
  items: AiItem[];
  /** true when the link only works on this device (no bridge). */
  local: boolean;
}

interface SharesState {
  shares: ShareSnapshot[];
  create: (sessionId: string) => Promise<ShareSnapshot>;
  revoke: (id: string) => Promise<void>;
}

export const useAiShares = create<SharesState>()(
  persist(
    (set, get) => ({
      shares: [],
      create: async (sessionId) => {
        const chat = getChat(sessionId);
        if (!chat) throw new Error("Chat not found.");
        if (chat.incognito) throw new Error("Incognito chats can’t be shared.");
        const existing = get().shares.find((s) => s.sessionId === sessionId && !s.revokedAt);
        const items = chat.items.filter((i) => i.kind === "user" || i.status !== "streaming");
        if (existing) {
          const updated = { ...existing, items, title: chat.title };
          set({ shares: get().shares.map((s) => (s.id === existing.id ? updated : s)) });
          return updated;
        }
        let link: AiShareLink;
        let local = true;
        if (bridgeEnabled()) {
          link = (await bridge<{ share: AiShareLink }>("POST", `/v1/sessions/${encodeURIComponent(sessionId)}/share`, { title: chat.title, items })).share;
          local = false;
        } else {
          const id = uuid().replace(/-/g, "").slice(0, 16);
          link = { id, sessionId, title: chat.title, url: `${window.location.origin}/ai/s/${id}`, createdAt: new Date().toISOString() };
        }
        const snap: ShareSnapshot = { ...link, items, local };
        set({ shares: [snap, ...get().shares] });
        return snap;
      },
      revoke: async (id) => {
        const s = get().shares.find((x) => x.id === id);
        if (s && !s.local && bridgeEnabled()) await bridge("DELETE", `/v1/shares/${encodeURIComponent(id)}`);
        set({ shares: get().shares.map((x) => (x.id === id ? { ...x, revokedAt: new Date().toISOString() } : x)) });
      },
    }),
    { name: "secrets.ai.shares", version: 1, partialize: ({ shares }) => ({ shares }) as SharesState },
  ),
);
