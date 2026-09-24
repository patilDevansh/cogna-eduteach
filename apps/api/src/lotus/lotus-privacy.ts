/**
 * Pseudonymous identification and retention for Lotus durability
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §10 Phase 0). `studentId` stays
 * in the session record for now — the service still needs it to look a
 * session up by student — but every durable row also carries a one-way
 * pseudonym so an observer or export can be built against that instead of
 * the raw id, and so a future de-identification pass has something to key
 * on without re-deriving it from scratch.
 */
import { createHmac } from "crypto";

const DEFAULT_RETENTION_DAYS = 180;
/** Never used outside a developer machine: db push --accept-data-loss already gates this database to localhost. */
const INSECURE_DEV_FALLBACK_SECRET = "lotus-dev-only-pseudonym-secret-not-for-production";

function pseudonymSecret(): string {
  const configured = process.env.LOTUS_PSEUDONYM_SECRET;
  if (configured && configured.trim().length > 0) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("LOTUS_PSEUDONYM_SECRET must be set before Lotus can persist sessions in production.");
  }
  return INSECURE_DEV_FALLBACK_SECRET;
}

/** Deterministic and one-way: the same student always maps to the same pseudonym, but the pseudonym alone cannot recover the student id. */
export function pseudonymousLearnerId(studentId: string): string {
  return createHmac("sha256", pseudonymSecret()).update(studentId).digest("base64url").slice(0, 22);
}

function retentionDays(): number {
  const configured = Number(process.env.LOTUS_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_DAYS;
}

/** When a session's durable data becomes eligible for deletion under the classroom retention policy. */
export function retentionDeadline(startedAtIso: string): Date {
  const started = new Date(startedAtIso);
  return new Date(started.getTime() + retentionDays() * 24 * 60 * 60 * 1000);
}
