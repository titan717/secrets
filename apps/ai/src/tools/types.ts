import type { ToolSpec } from "../providers/types.js";

export interface ToolContext {
  githubToken?: string;
  secretsToken?: string;
  secretsApiUrl?: string;
  signal: AbortSignal;
}

export interface Tool extends ToolSpec {
  /** Write tools require user confirmation unless auto_approve is on. */
  writes: boolean;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

/** Thrown by tools for expected failures; message is shown to the model and the user. */
export class ToolError extends Error {}

export const MAX_TOOL_RESULT_CHARS = Number(process.env.MAX_TOOL_RESULT_CHARS) || 16_000;

/** Keep tool results small enough for the model context; strings and JSON are cut with an explicit marker. */
export function truncateResult(result: unknown, max = MAX_TOOL_RESULT_CHARS): unknown {
  if (typeof result === "string") {
    return result.length > max ? `${result.slice(0, max)}\n…[truncated ${result.length - max} chars]` : result;
  }
  let json: string;
  try {
    json = JSON.stringify(result) ?? "null";
  } catch {
    return String(result);
  }
  if (json.length <= max) return result;
  if (Array.isArray(result)) {
    // drop trailing items until it fits
    let items = result.slice();
    while (items.length > 1 && JSON.stringify(items).length > max) items = items.slice(0, Math.ceil(items.length * 0.7));
    if (JSON.stringify(items).length <= max) return { items, truncated: true, total_items: result.length, shown_items: items.length };
  }
  if (result && typeof result === "object") {
    const obj: Record<string, unknown> = {};
    const per = Math.floor(max / Math.max(1, Object.keys(result).length));
    for (const [k, v] of Object.entries(result)) obj[k] = typeof v === "string" && v.length > per ? `${v.slice(0, per)}…[truncated]` : v;
    if (JSON.stringify(obj).length <= max) return { ...obj, truncated: true };
  }
  return { truncated: true, preview: json.slice(0, max), total_chars: json.length };
}

export const str = (args: Record<string, unknown>, key: string, required = true): string => {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`Missing required argument "${key}"`);
    return "";
  }
  return String(v);
};

export const num = (args: Record<string, unknown>, key: string, def: number, min = 1, max = 100): number => {
  const v = Number(args[key]);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def;
};
