/**
 * The one implementation of session-token signing/verification and secret
 * resolution, shared by apps/api and every Next.js route that checks or issues
 * a token. Node-only (uses node:crypto), so it is deliberately NOT exported
 * from the package index — importing the index from a client component must
 * never pull node:crypto into a browser bundle. Import it as
 * "@cogna/shared/dist/session".
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Labelled insecure local-only fallback. Never used in staging/production.
 * Requires COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET=true.
 */
export const INSECURE_LOCAL_DEV_SESSION_SECRET = "INSECURE_LOCAL_DEV_ONLY_cogna-session-secret";

type Env = Record<string, string | undefined>;

export function isProductionLike(env: Env = process.env): boolean {
  const era = (env.COGNA_ENV ?? "").trim().toLowerCase();
  return env.NODE_ENV === "production" || era === "production" || era === "staging";
}

export function sessionSecretFromEnv(env: Env = process.env): string | null {
  const configured = env.COGNA_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (isProductionLike(env)) return null;
  if (env.COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET === "true") return INSECURE_LOCAL_DEV_SESSION_SECRET;
  return null;
}

export function signPayload(payload: string, secret: string): string {
  const body = Buffer.from(payload).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

/** Returns the decoded payload if the token's MAC is valid, else null. Expiry is the caller's check. */
export function verifyMac(token: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(parts[1]!).digest("base64url"));
  const actual = Buffer.from(parts[2]!);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return Buffer.from(parts[1]!, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
