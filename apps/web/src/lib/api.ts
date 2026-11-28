import type { Routes, ApiError } from "@secrets/shared";
import { API_URL } from "../config";

type RouteKey = keyof Routes;
type Method<K> = K extends `${infer M} ${string}` ? M : never;
type PathOf<K> = K extends `${string} ${infer P}` ? P : never;
type BodyOf<K extends RouteKey> = Routes[K] extends { body: infer B } ? B : never;
type QueryOf<K extends RouteKey> = Routes[K] extends { query: infer Q } ? Q : never;
export type ResOf<K extends RouteKey> = Routes[K] extends { res: infer R } ? R : never;

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let tokenGetter: () => string | null = () => null;
let onUnauthorized: () => void = () => {};
export function configureApi(opts: { getToken: () => string | null; onUnauthorized: () => void }) {
  tokenGetter = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

export interface CallOpts<K extends RouteKey> {
  params?: Record<string, string>;
  query?: QueryOf<K> | Record<string, string | number | undefined>;
  body?: BodyOf<K>;
  signal?: AbortSignal;
}

/** Typed REST call against the shared Routes contract. */
export async function api<K extends RouteKey>(route: K, opts: CallOpts<K> = {}): Promise<ResOf<K>> {
  const [method, rawPath] = (route as string).split(" ") as [Method<K>, PathOf<K>];
  return request(method, rawPath, opts as RawOpts) as Promise<ResOf<K>>;
}

interface RawOpts {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
}

/** Untyped call for API extras not (yet) in the shared Routes map. */
export function apiRaw<T>(route: string, opts: RawOpts = {}): Promise<T> {
  const [method, path] = route.split(" ");
  return request(method, path, opts) as Promise<T>;
}

async function request(method: string, rawPath: string, opts: RawOpts): Promise<unknown> {
  let path: string = rawPath;
  for (const [k, v] of Object.entries(opts.params ?? {})) path = path.replace(`:${k}`, encodeURIComponent(v));
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) path += `?${s}`;
  }
  const headers: Record<string, string> = {};
  const token = tokenGetter();
  if (token) headers.Authorization = `Bearer ${token}`;
  // Double-submit CSRF token (readable cookie) for cookie-authenticated mutations.
  if (method !== "GET" && method !== "HEAD") {
    const csrf = document.cookie.match(/(?:^|;\s*)secrets_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body, signal: opts.signal, credentials: "include" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new HttpError(0, "network", "Can't reach Secrets right now. Check your connection.");
  }
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    let err: Partial<ApiError> = {};
    try {
      err = await res.json();
    } catch {
      /* ignore */
    }
    throw new HttpError(res.status, err.error ?? "http_error", err.message ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return await res.json();
  return await res.blob();
}

export function errorMessage(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
