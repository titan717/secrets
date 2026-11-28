import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiConnection } from "@secrets/shared";
import { uuid } from "../id";
import { apiBase } from "../../config";
import { getToken } from "../../stores/session";
import { bridge, bridgeEnabled, mirror } from "./bridge";
import { useAiSettings } from "./settings";

interface ConnectionsState {
  /** Custom MCP servers + last test results for built-ins (keyed by id). */
  custom: AiConnection[];
  tests: Record<string, Pick<AiConnection, "status" | "message" | "lastTestedAt">>;
  addCustom: (c: { name: string; url?: string; command?: string }) => void;
  removeCustom: (id: string) => void;
  setCustomEnabled: (id: string, enabled: boolean) => void;
  test: (id: string) => Promise<void>;
}

export const useAiConnections = create<ConnectionsState>()(
  persist(
    (set, get) => ({
      custom: [],
      tests: {},
      addCustom: (c) => {
        const conn: AiConnection = { id: uuid(), kind: "custom", name: c.name.trim() || "Custom MCP", url: c.url?.trim() || undefined, command: c.command?.trim() || undefined, enabled: true, status: "untested" };
        set({ custom: [...get().custom, conn] });
        mirror("POST", "/v1/connections", conn);
      },
      removeCustom: (id) => {
        set({ custom: get().custom.filter((c) => c.id !== id) });
        mirror("DELETE", `/v1/connections/${encodeURIComponent(id)}`);
      },
      setCustomEnabled: (id, enabled) => {
        set({ custom: get().custom.map((c) => (c.id === id ? { ...c, enabled } : c)) });
        mirror("PATCH", `/v1/connections/${encodeURIComponent(id)}`, { enabled });
      },
      test: async (id) => {
        const put = (status: AiConnection["status"], message: string) => set({ tests: { ...get().tests, [id]: { status, message, lastTestedAt: new Date().toISOString() } } });
        try {
          if (bridgeEnabled()) {
            const r = await bridge<{ ok: boolean; message: string }>("POST", `/v1/connections/${encodeURIComponent(id)}/test`);
            put(r.ok ? "connected" : "error", r.message);
            return;
          }
          put(...(await localTest(id, get().custom)));
        } catch (e) {
          put("error", (e as Error).message);
        }
      },
    }),
    { name: "secrets.ai.connections", version: 1, partialize: ({ custom, tests }) => ({ custom, tests }) as ConnectionsState },
  ),
);

async function localTest(id: string, custom: AiConnection[]): Promise<[AiConnection["status"], string]> {
  if (id === "github") {
    const token = useAiSettings.getState().githubToken;
    if (!token) return ["error", "Add a GitHub token first."];
    const r = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    if (!r.ok) return ["error", r.status === 401 ? "GitHub rejected the token." : `GitHub returned ${r.status}.`];
    const j = (await r.json()) as { login?: string };
    return ["connected", `Signed in as @${j.login}`];
  }
  if (id === "secrets") {
    const t = getToken();
    const r = await fetch(`${apiBase()}/v1/me`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, credentials: "include" });
    return r.ok ? ["connected", "Secrets API reachable with your session."] : ["error", `Secrets API returned ${r.status}.`];
  }
  const c = custom.find((x) => x.id === id);
  if (!c) return ["error", "Unknown connection."];
  if (!c.url) return ["untested", "Local command servers are tested by the bridge."];
  try {
    await fetch(c.url, { method: "GET", mode: "no-cors" });
    return ["connected", "Server reachable."];
  } catch {
    return ["error", "Couldn’t reach that URL from this browser."];
  }
}

/** Built-in + custom connections in the GET /v1/connections shape. */
export function useConnectionList(): AiConnection[] {
  const tools = useAiSettings((s) => s.tools);
  const token = useAiSettings((s) => s.githubToken);
  const custom = useAiConnections((s) => s.custom);
  const tests = useAiConnections((s) => s.tests);
  const built: AiConnection[] = [
    { id: "github", kind: "github", name: "GitHub MCP", enabled: tools.github, status: !tools.github ? "disabled" : token ? "untested" : "error", message: token ? undefined : "Needs a token" },
    { id: "secrets", kind: "secrets", name: "secrets-mcp", enabled: tools.secrets, status: tools.secrets ? "untested" : "disabled" },
  ];
  return [...built, ...custom].map((c) => {
    const t = tests[c.id];
    if (!c.enabled) return { ...c, status: "disabled" as const };
    return t ? { ...c, ...t } : c;
  });
}
