/**
 * Fixed-window, in-memory rate limiter shared by apps/api and the Next.js routes.
 *
 * ponytail: per-process, so N replicas allow N × max, and it resets on restart. Swap the Map
 * for Redis/Postgres before scaling out horizontally or if an attacker-facing limit must be exact.
 */
export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function createRateLimiter(options: { windowMs: number; max: number; now?: () => number }) {
  const { windowMs, max } = options;
  const now = options.now ?? Date.now;
  const hits = new Map<string, { windowStart: number; count: number }>();
  let lastSweep = now();

  return function hit(key: string): RateLimitResult {
    const t = now();
    if (t - lastSweep > windowMs) {
      // Drop expired windows so the map can't grow without bound.
      for (const [k, v] of hits) if (t - v.windowStart >= windowMs) hits.delete(k);
      lastSweep = t;
    }
    const entry = hits.get(key);
    if (!entry || t - entry.windowStart >= windowMs) {
      hits.set(key, { windowStart: t, count: 1 });
      return { ok: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > max) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStart + windowMs - t) / 1000)) };
    }
    return { ok: true, retryAfterSeconds: 0 };
  };
}
