import { createHash, createHmac } from "node:crypto";
import { config } from "../config.js";
import { db } from "../db/index.js";

/**
 * Object storage abstraction.
 *
 * `db` keeps bytes in `object_blobs` (local development, PGlite). `s3` talks to any
 * S3-compatible service (Cloudflare R2, MinIO, AWS) with hand-rolled SigV4 so the
 * API has no extra dependency and stays installable on arm64.
 */
export interface StoredObject {
  body: Buffer;
  contentType: string | null;
}

export interface ObjectInfo {
  size: number;
  contentType: string | null;
}

export interface Storage {
  readonly kind: "db" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  getPrefix(key: string, bytes: number): Promise<Buffer | null>;
  head(key: string): Promise<ObjectInfo | null>;
  delete(key: string): Promise<void>;
  /** Direct browser upload URL, or null when the driver cannot presign. */
  presignPut(key: string, contentType: string, ttlSeconds: number): Promise<string | null>;
  presignGet(key: string, ttlSeconds: number): Promise<string | null>;
}

// ── SigV4 primitives ────────────────────────────────────────────────────────

const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const rfc3986 = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function canonicalUri(path: string): string {
  return path
    .split("/")
    .map((seg) => rfc3986(seg))
    .join("/");
}

function canonicalQuery(entries: [string, string][]): string {
  return entries
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function amzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(dateStamp: string): Buffer {
  const secret = config.storage.secretAccessKey ?? "";
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, config.storage.region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function scope(dateStamp: string): string {
  return `${dateStamp}/${config.storage.region}/s3/aws4_request`;
}

function credential(dateStamp: string): string {
  return `${config.storage.accessKeyId}/${scope(dateStamp)}`;
}

function baseEndpoint(): string {
  if (config.storage.endpoint) return config.storage.endpoint.replace(/\/+$/, "");
  return `https://s3.${config.storage.region}.amazonaws.com`;
}

/** URL for an object, honouring path-style vs virtual-host addressing. */
function objectUrl(key: string): URL {
  const bucket = config.storage.bucket ?? "";
  const base = new URL(baseEndpoint());
  const prefix = base.pathname.replace(/\/+$/, "");
  if (config.storage.forcePathStyle || !config.storage.endpoint) {
    base.pathname = `${prefix}/${rfc3986(bucket)}/${canonicalUri(key)}`;
  } else {
    base.host = `${bucket}.${base.host}`;
    base.pathname = `${prefix}/${canonicalUri(key)}`;
  }
  return base;
}

function signedHeadersFor(headers: Record<string, string>): string {
  return Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
    .join(";");
}

function authorization(
  method: string,
  url: URL,
  headers: Record<string, string>,
  payloadHash: string,
  now: Date,
): string {
  const { amzDate, dateStamp } = amzDates(now);
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v.trim();
  lower["host"] = url.host;
  lower["x-amz-date"] = amzDate;
  lower["x-amz-content-sha256"] = payloadHash;
  const signed = signedHeadersFor(lower);
  const canonicalHeaders = signed
    .split(";")
    .map((h) => `${h}:${lower[h]}\n`)
    .join("");
  const canonicalRequest = [
    method,
    canonicalUri(url.pathname),
    canonicalQuery([...url.searchParams.entries()]),
    canonicalHeaders,
    signed,
    payloadHash,
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope(dateStamp), sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(dateStamp)).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${credential(dateStamp)}, SignedHeaders=${signed}, Signature=${signature}`;
}

function presign(method: string, url: URL, ttlSeconds: number): string {
  const { amzDate, dateStamp } = amzDates();
  const entries: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential(dateStamp)],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(Math.max(1, Math.min(ttlSeconds, 604800)))],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const query = canonicalQuery(entries);
  const canonicalRequest = [
    method,
    canonicalUri(url.pathname),
    query,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope(dateStamp), sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(dateStamp)).update(stringToSign).digest("hex");
  return `${url.origin}${url.pathname}?${query}&X-Amz-Signature=${signature}`;
}

// ── drivers ─────────────────────────────────────────────────────────────────

const dbStorage: Storage = {
  kind: "db",
  async put(key, body, contentType) {
    await db.query(
      `INSERT INTO object_blobs (key, data, content_type) VALUES ($1,$2,$3)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, content_type = EXCLUDED.content_type`,
      [key, body, contentType],
    );
  },
  async get(key) {
    const row = await db.one<{ data: Buffer | Uint8Array; content_type: string | null }>(
      `SELECT data, content_type FROM object_blobs WHERE key = $1`,
      [key],
    );
    if (!row) return null;
    return { body: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data), contentType: row.content_type };
  },
  async getPrefix(key, bytes) {
    const row = await db.one<{ data: Buffer | Uint8Array }>(`SELECT data FROM object_blobs WHERE key = $1`, [key]);
    if (!row) return null;
    return (Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data)).subarray(0, bytes);
  },
  async head(key) {
    const row = await db.one<{ size: number; content_type: string | null }>(
      `SELECT octet_length(data)::int AS size, content_type FROM object_blobs WHERE key = $1`,
      [key],
    );
    return row ? { size: Number(row.size), contentType: row.content_type } : null;
  },
  async delete(key) {
    await db.query(`DELETE FROM object_blobs WHERE key = $1`, [key]);
  },
  async presignPut() {
    return null;
  },
  async presignGet() {
    return null;
  },
};

async function s3Fetch(method: string, key: string, init: { body?: Buffer; headers?: Record<string, string> } = {}) {
  if (!config.storage.accessKeyId || !config.storage.secretAccessKey || !config.storage.bucket)
    throw new Error("object storage is not configured");
  const url = objectUrl(key);
  const body = init.body;
  const now = new Date();
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  const payloadHash = body ? sha256Hex(body) : sha256Hex("");
  headers["x-amz-content-sha256"] = payloadHash;
  headers["x-amz-date"] = amzDates(now).amzDate;
  headers.Authorization = authorization(method, url, headers, payloadHash, now);
  return fetch(url, { method, headers, body: body as any });
}

const s3Storage: Storage = {
  kind: "s3",
  async put(key, body, contentType) {
    const res = await s3Fetch("PUT", key, { body, headers: { "content-type": contentType } });
    if (!res.ok) throw new Error(`object storage PUT failed (${res.status})`);
  },
  async get(key) {
    const res = await s3Fetch("GET", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`object storage GET failed (${res.status})`);
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
  },
  async getPrefix(key, bytes) {
    const res = await s3Fetch("GET", key, { headers: { range: `bytes=0-${Math.max(0, bytes - 1)}` } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  },
  async head(key) {
    const res = await s3Fetch("HEAD", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`object storage HEAD failed (${res.status})`);
    return { size: Number(res.headers.get("content-length") ?? 0), contentType: res.headers.get("content-type") };
  },
  async delete(key) {
    const res = await s3Fetch("DELETE", key);
    if (!res.ok && res.status !== 404) throw new Error(`object storage DELETE failed (${res.status})`);
  },
  async presignPut(key, _contentType, ttlSeconds) {
    return presign("PUT", objectUrl(key), ttlSeconds);
  },
  async presignGet(key, ttlSeconds) {
    return presign("GET", objectUrl(key), ttlSeconds);
  },
};

export const storage: Storage = config.storage.kind === "s3" ? s3Storage : dbStorage;

export const storageKind = () => storage.kind;
