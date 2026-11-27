const trim = (s: string) => s.replace(/\/+$/, "");

/** Base URL of apps/api. Empty string = same origin (API serves the web build, or Vite proxy in dev). */
export const API_URL = trim(import.meta.env.VITE_API_URL ?? "");
export const AI_URL = trim(import.meta.env.VITE_AI_URL || "http://localhost:8790");
export const VOICE_URL = trim(import.meta.env.VITE_VOICE_URL || "http://localhost:8791");

/** Absolute API base, used for WS and for building attachment URLs. */
export function apiBase(): string {
  return API_URL || window.location.origin;
}

export function wsUrl(token: string): string {
  const base = apiBase().replace(/^http/, "ws");
  return `${base}/v1/ws?token=${encodeURIComponent(token)}`;
}

/** Resolve an API-relative path like /v1/attachments/:id to an absolute URL. */
export function resolveApiUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
