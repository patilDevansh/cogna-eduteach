import type { NextFunction, Request, Response } from "express";
import { createRateLimiter } from "@cogna/shared";

const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const general = createRateLimiter({ windowMs: 60_000, max: num("RATE_LIMIT_GENERAL_PER_MIN", 600) });
// Routes that mint sessions, spend OpenAI/ElevenLabs credits or start renders.
const strict = createRateLimiter({ windowMs: 60_000, max: num("RATE_LIMIT_BILLED_PER_MIN", 60) });
const STRICT_ROUTE = /^\/(lotus|personalized-videos|ai|auth|parents|sessions|diagnostic-v2)(\/|$)/;

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === "/health") return next();
  // Key by student when signed in: a whole classroom shares one school NAT IP and must not throttle each other.
  // The Next.js routes proxy here, so their signed headers arrive intact but req.ip may be the proxy.
  const key = req.header("x-cogna-student-id") || req.header("x-cogna-teacher-token") || req.ip || "unknown";
  const isStrict = req.method !== "GET" && STRICT_ROUTE.test(req.path);
  const result = (isStrict ? strict : general)(isStrict ? `strict:${key}` : key);
  if (result.ok) return next();
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({ message: "Too many requests. Please wait a moment and try again." });
}
