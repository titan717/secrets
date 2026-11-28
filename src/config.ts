const trim = (s: string) => s.replace(/\/+$/, "");

/** Standalone demo mode: in-memory REST + WebSocket, no backend needed. */
// Frontend-only repo: the mock API is on unless explicitly turned off.
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

/** Base URL of api.secrets. Empty string = same origin. */
export const API_URL = trim(import.meta.env.VITE_API_URL ?? "");
export const AI_URL = trim(import.meta.env.VITE_AI_URL || "http://localhost:4000");
export const VOICE_URL = trim(import.meta.env.VITE_VOICE_URL || "http://localhost:5000");

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
