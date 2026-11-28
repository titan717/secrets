import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiMemoryFact } from "@secrets/shared";
import { uuid } from "../id";
import { bridge, bridgeEnabled, mirror } from "./bridge";

interface MemoryState {
  facts: AiMemoryFact[];
  add: (text: string, source?: AiMemoryFact["source"], sessionId?: string) => AiMemoryFact;
  remove: (id: string) => void;
  clear: () => void;
  sync: () => Promise<void>;
}

export const useAiMemory = create<MemoryState>()(
  persist(
    (set, get) => ({
      facts: [],
      add: (text, source = "user", sessionId) => {
        const fact: AiMemoryFact = { id: uuid(), text: text.trim(), source, status: "approved", sessionId, createdAt: new Date().toISOString() };
        set({ facts: [fact, ...get().facts.filter((f) => f.text.toLowerCase() !== fact.text.toLowerCase())] });
        mirror("POST", "/v1/memory", { text: fact.text, source, sessionId });
        return fact;
      },
      remove: (id) => {
        set({ facts: get().facts.filter((f) => f.id !== id) });
        mirror("DELETE", `/v1/memory/${encodeURIComponent(id)}`);
      },
      clear: () => {
        for (const f of get().facts) mirror("DELETE", `/v1/memory/${encodeURIComponent(f.id)}`);
        set({ facts: [] });
      },
      sync: async () => {
        if (!bridgeEnabled()) return;
        try {
          const r = await bridge<{ facts: AiMemoryFact[] }>("GET", "/v1/memory");
          set({ facts: r.facts.filter((f) => f.status === "approved") });
        } catch {
          /* keep local */
        }
      },
    }),
    { name: "secrets.ai.memory", version: 1, partialize: ({ facts }) => ({ facts }) as MemoryState },
  ),
);

/**
 * Local stand-in for the assistant's memory proposals: detects explicit, durable statements in
 * the user's message. The user always confirms before anything is saved.
 */
export function proposeFact(userText: string): string | null {
  const t = userText.trim().replace(/\s+/g, " ");
  const tidy = (s: string) => s.replace(/[.!?\s]+$/, "").trim();
  let m = t.match(/\b(?:please\s+)?remember(?:\s+that)?\s+(.{4,200})/i);
  if (m) return capital(tidy(m[1]).replace(/^i\b/i, "I").replace(/^my\b/i, "My"));
  m = t.match(/\bmy name is ([\p{L}][\p{L}' -]{1,40})/iu);
  if (m) return `Name is ${tidy(m[1]).split(/\s+(?:and|but)\s+/i)[0]}`;
  m = t.match(/\bcall me ([\p{L}][\p{L}' -]{1,30})/iu);
  if (m) return `Prefers to be called ${tidy(m[1])}`;
  m = t.match(/\bi (?:always )?prefer (.{3,120})/i);
  if (m) return `Prefers ${tidy(m[1])}`;
  m = t.match(/\bi(?:'m| am) (?:a|an) ([\p{L} -]{3,60}?)(?:[.,!]|$| and | who )/iu);
  if (m) return `Is a ${tidy(m[1])}`;
  return null;
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function memoryPrompt(facts: AiMemoryFact[]): string {
  const ok = facts.filter((f) => f.status === "approved").slice(0, 40);
  if (!ok.length) return "";
  return `Things the user asked you to remember (use when relevant, never recite unprompted):\n${ok.map((f) => `- ${f.text}`).join("\n")}`;
}
