import { createRateLimiter } from "@cogna/shared";

// Per-process limiter for the Next.js routes that do NOT proxy to the API (session minting, teacher claim);
// everything else proxies to apps/api, whose middleware limits it (see the ponytail note in
// packages/shared/src/rate-limit.ts). Keyed by signed-in student (a classroom shares one school IP),
// falling back to client IP. The unauthenticated "auth" bucket (session mint / teacher claim) is per IP.
const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const billed = createRateLimiter({ windowMs: 60_000, max: num("RATE_LIMIT_BILLED_PER_MIN", 60) });
const auth = createRateLimiter({ windowMs: 60_000, max: num("RATE_LIMIT_AUTH_PER_MIN", 30) });

function clientKey(request: Request, bucket: string): string {
  const student = bucket === "billed" ? request.headers.get("x-cogna-student-id") : null;
  return student || clientIp(request);
}

function clientIp(request: Request): string {
  // Only meaningful behind a proxy that overwrites x-forwarded-for; otherwise a caller can rotate it.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Returns a 429 Response when the caller is over the limit, otherwise null. Call at the top of a handler. */
export function rateLimited(request: Request, bucket: "billed" | "auth"): Response | null {
  const result = (bucket === "auth" ? auth : billed)(`${bucket}:${clientKey(request, bucket)}`);
  if (result.ok) return null;
  return Response.json(
    { message: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}
