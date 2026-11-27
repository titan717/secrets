import { randomUUID, randomBytes } from "node:crypto";

export class HttpError extends Error {
  constructor(
    public status: number,
    public error: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, error = "bad_request") => new HttpError(400, error, message);
export const unauthorized = (message = "Authentication required") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do that") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string, error = "conflict") => new HttpError(409, error, message);

export const uuid = () => randomUUID();
export const token = (bytes = 9) => randomBytes(bytes).toString("base64url");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Throws 404 for malformed ids so Postgres never sees an invalid uuid cast. */
export function assertId(v: unknown, what = "Resource"): string {
  if (!isUuid(v)) throw notFound(`${what} not found`);
  return v;
}

export function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string | undefined {
  if (v === undefined || v === null) {
    if (opts.optional) return undefined;
    throw badRequest(`${field} is required`);
  }
  if (typeof v !== "string") throw badRequest(`${field} must be a string`);
  const s = v.trim();
  if (opts.min !== undefined && s.length < opts.min) throw badRequest(`${field} must be at least ${opts.min} characters`);
  if (opts.max !== undefined && s.length > opts.max) throw badRequest(`${field} must be at most ${opts.max} characters`);
  return s;
}

export const iso = (d: unknown): string => (d instanceof Date ? d.toISOString() : d ? new Date(d as string).toISOString() : (null as any));
