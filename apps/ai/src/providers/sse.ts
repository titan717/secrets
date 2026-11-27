const STALL_MS = Number(process.env.PROVIDER_STALL_TIMEOUT_MS) || 120_000;

export class StreamStallError extends Error {
  constructor(ms: number) {
    super(`The model stopped sending data for ${Math.round(ms / 1000)}s; the request was aborted. Try again.`);
    this.name = "StreamStallError";
  }
}

/** Minimal spec-compliant SSE reader: yields the `data` payload of each event (multi-line data joined by \n). Comment lines (": ...") are skipped. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let data: string[] = [];
  const onAbort = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      let stall: NodeJS.Timeout | undefined;
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          stall = setTimeout(() => reject(new StreamStallError(STALL_MS)), STALL_MS);
        }),
      ]).finally(() => clearTimeout(stall));
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r?\n/)) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + (buf[idx] === "\r" ? 2 : 1));
        if (line === "") {
          if (data.length) yield data.join("\n");
          data = [];
        } else if (line.startsWith(":")) {
          continue;
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
    }
    if (data.length) yield data.join("\n");
  } catch (e) {
    reader.cancel().catch(() => {});
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/** Turn a non-2xx provider response into a readable message (no secrets). */
export async function describeHttpError(provider: string, res: Response): Promise<string> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message ?? j?.message ?? text;
      const raw = j?.error?.metadata?.raw;
      if (raw && typeof raw === "string") detail += ` (${raw.slice(0, 300)})`;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  detail = String(detail).slice(0, 600);
  const hint =
    res.status === 401 || res.status === 403 || (res.status === 400 && /api[ _-]?key/i.test(detail))
      ? `Invalid or unauthorized ${provider} API key.`
      : res.status === 402
        ? `${provider}: insufficient credits.`
        : res.status === 429
          ? `${provider} rate limit or quota exceeded — wait a moment and retry.`
          : res.status === 404
            ? `${provider}: model or endpoint not found.`
            : `${provider} request failed (${res.status}).`;
  return detail ? `${hint} ${detail}` : hint;
}

/** fetch with up to `retries` retries on 429/5xx (before any stream byte is consumed). Honors Retry-After (capped) and abort. */
export async function fetchWithRetry(url: string | URL, init: RequestInit & { signal: AbortSignal }, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (attempt >= retries || ![429, 500, 502, 503, 504].includes(res.status)) return res;
    const ra = Number(res.headers.get("retry-after"));
    const wait = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * 2 ** attempt, 5000);
    await res.body?.cancel().catch(() => {});
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, wait);
      init.signal.addEventListener("abort", () => (clearTimeout(t), reject(init.signal.reason)), { once: true });
    });
  }
}
