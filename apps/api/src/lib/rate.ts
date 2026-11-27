import { HttpError } from "./http.js";

/** Fixed-window in-memory rate limiter (per instance). */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (key: string) => {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset <= now) hits.set(key, (h = { n: 0, reset: now + windowMs }));
    if (++h.n > max) {
      const e = new HttpError(429, "rate_limited", "Too many requests, slow down a little");
      (e as any).retryAfter = Math.ceil((h.reset - now) / 1000);
      throw e;
    }
  };
}

export const authLimit = limiter(20, 60_000); // per IP: signup/login attempts per minute
export const sendLimit = limiter(30, 10_000); // per user: messages per 10s
