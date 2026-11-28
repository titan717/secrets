import { AI_URL } from "../../config";
import { useAiSettings } from "./settings";

/**
 * Thin client for the ai.secrets bridge v2 resources (projects, usage, memory, connections,
 * shares, sessions search, upcoming). The AI section is local-first: every store works on this
 * device, and when "Sync with bridge" is on it also mirrors changes to these endpoints.
 */
export class BridgeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function bridgeEnabled(): boolean {
  const s = useAiSettings.getState();
  return s.bridgeSync && !!s.bridgeToken;
}

export async function bridge<T>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const { bridgeToken } = useAiSettings.getState();
  let res: Response;
  try {
    res = await fetch(`${AI_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${bridgeToken}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new BridgeError(0, `Can’t reach the ai.secrets bridge at ${AI_URL}.`);
  }
  if (!res.ok) {
    let msg = `Bridge returned ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string; message?: string };
      msg = (typeof j.error === "object" ? j.error?.message : j.error) || j.message || msg;
    } catch {
      /* ignore */
    }
    throw new BridgeError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Fire-and-forget mirror of a local change. Failures are reported once via onError. */
export function mirror(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown, onError?: (e: Error) => void) {
  if (!bridgeEnabled()) return;
  bridge(method, path, body).catch((e: Error) => onError?.(e));
}
