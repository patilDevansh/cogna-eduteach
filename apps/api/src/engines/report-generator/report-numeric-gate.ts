/**
 * Numeric cross-check for AI report prose (MVP 9.0.1 Phase D).
 *
 * Every number the model states must already appear in structuredData
 * (counts, accuracy %, mastery from/to/deltas, weekly questionCount,
 * pattern confidence when quoted). Voice alone is not enough — inventing
 * a percentage or swapping mastery deltas rejects the polish and the
 * caller falls back to the template string.
 */

/** Canonical string keys for allowed numeric values (no trailing zeros noise). */
export function canonicalizeNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  // Prefer integer form when the value is an integer within float noise.
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  // Trim floating noise (0.8500000001 → 0.85).
  const fixed = Number(n.toPrecision(12));
  return String(fixed);
}

/** Walk structuredData and collect every number that may legally appear in AI prose. */
export function collectAllowedNumbers(structuredData: unknown): Set<string> {
  const allowed = new Set<string>();

  const add = (n: number) => {
    const key = canonicalizeNumber(n);
    if (key === "") return;
    allowed.add(key);
    // Accuracy / confidence often appear as percents in templates (0.85 → 85).
    if (n >= 0 && n <= 1) {
      allowed.add(canonicalizeNumber(Math.round(n * 100)));
    }
    // Also allow the inverse: 85 stored as percent-ish → 0.85 (rare in our data).
    if (Number.isInteger(n) && n >= 0 && n <= 100) {
      allowed.add(canonicalizeNumber(n / 100));
    }
  };

  /** Prose fields may embed intentional counts (e.g. "10–15 minutes"); ids like C2_… must not. */
  const PROSE_KEYS = new Set(["parentActions", "uncertainty", "reason"]);

  const walk = (value: unknown, parentKey?: string): void => {
    if (value == null) return;
    if (typeof value === "number") {
      add(value);
      return;
    }
    if (typeof value === "string") {
      if (parentKey && PROSE_KEYS.has(parentKey)) {
        for (const token of extractNumericTokens(value)) {
          add(token);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, parentKey);
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      // Mastery deltas: from/to pairs contribute |to-from| as well.
      if (
        typeof record.from === "number" &&
        typeof record.to === "number" &&
        Number.isFinite(record.from) &&
        Number.isFinite(record.to)
      ) {
        add(Math.abs(record.to - record.from));
      }
      for (const [key, child] of Object.entries(record)) {
        walk(child, key);
      }
    }
  };

  walk(structuredData);
  return allowed;
}

/**
 * Pull numeric tokens from prose: 85%, 0.85, 3, -2, 10–15 (each end).
 * Skips bare years that look like ISO date fragments only when the whole
 * token is a 4-digit year inside a date — those still come from structured
 * periodStart/periodEnd via collectAllowedNumbers, so stating them is fine.
 */
export function extractNumericTokens(text: string): number[] {
  const out: number[] = [];
  // Percentages first so "85%" yields 85 (and we also allow 0.85 via collect).
  const percentRe = /(\d+(?:\.\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = percentRe.exec(text)) !== null) {
    out.push(Number(m[1]));
  }
  // Remaining numbers, including decimals and negatives. Skip the digits we
  // already captured as part of a percentage by matching independently —
  // duplicates are fine; the set check is idempotent.
  const numRe = /-?\d+(?:\.\d+)?/g;
  while ((m = numRe.exec(text)) !== null) {
    out.push(Number(m[0]));
  }
  return out.filter((n) => Number.isFinite(n));
}

export interface NumericGateResult {
  ok: boolean;
  /** Present when ok is false — surfaces in orchestrator failureReason. */
  reason?: string;
  /** Numbers stated in the AI text that were not in structuredData. */
  invented?: string[];
}

/**
 * Pure gate: every number stated in aiText must be in the allowed set derived
 * from structuredData. Empty AI text fails (nothing to serve).
 */
export function numericCrossCheck(aiText: string, structuredData: unknown): NumericGateResult {
  if (typeof aiText !== "string" || aiText.trim().length === 0) {
    return { ok: false, reason: "empty AI renderedText" };
  }

  const allowed = collectAllowedNumbers(structuredData);
  const stated = extractNumericTokens(aiText);
  const invented: string[] = [];

  for (const n of stated) {
    const key = canonicalizeNumber(n);
    if (key === "") continue;
    if (!allowed.has(key)) {
      // Percent form of a fraction already allowed (0.75 stated as 75%).
      if (n >= 0 && n <= 1 && allowed.has(canonicalizeNumber(Math.round(n * 100)))) {
        continue;
      }
      // Fraction form of an allowed percent (85 stated, 0.85 allowed via add).
      if (Number.isInteger(n) && n >= 0 && n <= 100 && allowed.has(canonicalizeNumber(n / 100))) {
        continue;
      }
      invented.push(key);
    }
  }

  if (invented.length > 0) {
    const unique = [...new Set(invented)];
    return {
      ok: false,
      reason: `numeric cross-check failed: invented or mismatched number(s) ${unique.join(", ")}`,
      invented: unique,
    };
  }

  return { ok: true };
}
