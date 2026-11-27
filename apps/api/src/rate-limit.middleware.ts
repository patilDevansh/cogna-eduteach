import type { NextFunction, Request, Response } from "express";
import { createRateLimiter } from "@cogna/shared";

const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const general = createRateLimiter({ windowMs: 60_000, max: num("RATE_LIMIT_GENERAL_PER_MIN", 600) });
// Routes that mint sessions, spend OpenAI/ElevenLabs credits or start renders.
const strict = createRateLimiter({ windowMs: 60_000, max: num("RATE_LIMIT_BILLED_PER_MIN", 60) });
const STRICT_ROUTE = /^\/(lotus|personalized-videos|ai|auth|parents|sessions|diagnostic-v2|voice-tutor)(\/|$)/;
// The voice tutor's spoken reply is billed too, but an <audio> tag fetches it with no session headers, so it is
// limited per address at the billed rate, never by a header the caller could change. A school where a whole
// class shares one address can raise RATE_LIMIT_VOICE_PER_IP_PER_MIN on its own.
const voice = createRateLimiter({ windowMs: 60_000, max: num("RATE_LIMIT_VOICE_PER_IP_PER_MIN", num("RATE_LIMIT_BILLED_PER_MIN", 60)) });
const VOICE_ROUTE = "/voice-tutor/voice";

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Health checks and CORS preflights are free: a preflight is the browser asking, not the user.
  if (req.path === "/health" || req.method === "OPTIONS") return next();
  // Key by who is signed in: a whole classroom (or a family) shares one NAT IP and must not throttle each other.
  // The Next.js routes proxy here, so their signed headers arrive intact but req.ip may be the proxy.
  const key = req.header("x-cogna-student-id") || req.header("x-cogna-teacher-token") || req.header("x-parent-id") || req.header("authorization") || req.ip || "unknown";
  const isVoice = (req.method === "GET" || req.method === "HEAD") && req.path === VOICE_ROUTE;
  const isStrict = req.method !== "GET" && STRICT_ROUTE.test(req.path);
  const result = isVoice ? voice(`voice:${req.ip || "unknown"}`) : (isStrict ? strict : general)(isStrict ? `strict:${key}` : key);
  if (result.ok) return next();
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({ message: "Too many requests. Please wait a moment and try again." });
}
