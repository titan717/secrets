import type { AiProvider } from "../contract.js";
import { gemini } from "./gemini.js";
import { mock } from "./mock.js";
import { openrouter } from "./openrouter.js";
import type { ChatProvider } from "./types.js";

export const providers: Record<AiProvider, ChatProvider> = { gemini, openrouter, mock };

export function getProvider(id: string): ChatProvider | undefined {
  return (providers as Record<string, ChatProvider>)[id];
}
