/** Shared forbidden terms — runtime guard, ContentVerifier, language tests. */

export const FORBIDDEN_STUDENT_TERMS: readonly string[] = [
  "mastery",
  "diagnos",
  "diagnostic",
  "misconception",
  "retentionestimate",
  "retention estimate",
  "threshold",
  "fatigue",
  "adhd",
  "autism",
  "depression",
  "anxiety disorder",
  "iq",
  "weak in",
  "you're weak",
  "you are weak",
  "failure",
  "clinical",
];

/** Rough concept-id shape never shown to humans. */
export const CONCEPT_ID_PATTERN = /\b[PC]\d+_[A-Z0-9_]+\b/;

/**
 * Choice-index jargon from the selector ("option 0", "option 1") must never
 * reach students — live Phase B audit caught this in Why-this-question prose.
 */
export const OPTION_INDEX_PATTERN = /\boption\s*\d+\b/i;

export function containsForbiddenTerm(text: string): boolean {
  const lower = text.toLowerCase();
  if (CONCEPT_ID_PATTERN.test(text)) return true;
  if (OPTION_INDEX_PATTERN.test(text)) return true;
  return FORBIDDEN_STUDENT_TERMS.some((t) => lower.includes(t));
}

export function assertNoForbiddenTerms(text: string, label = "text"): void {
  if (containsForbiddenTerm(text)) {
    throw new Error(`Forbidden term in ${label}`);
  }
}
