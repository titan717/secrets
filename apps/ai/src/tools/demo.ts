/** Demo tools, only offered with the mock provider so the confirm flow can be shown without any tokens. */
import { str, type Tool } from "./types.js";

export const demoTools: Tool[] = [
  {
    name: "demo_search",
    description: "Demo read-only search (returns canned results).",
    writes: false,
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    async run(a) {
      const q = str(a, "query", false) || "anything";
      return { query: q, results: [1, 2, 3].map((i) => ({ title: `Result ${i} for "${q}"`, snippet: `Canned demo snippet #${i}.` })) };
    },
  },
  {
    name: "demo_create_note",
    description: "Demo write tool (pretends to save a note; requires confirmation).",
    writes: true,
    parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title"] },
    async run(a) {
      return { saved: true, id: `note_${Date.now().toString(36)}`, title: str(a, "title"), note: "Demo only — nothing was actually stored." };
    },
  },
];
