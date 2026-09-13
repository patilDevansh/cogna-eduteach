export interface LanguageValidationResult {
  valid: boolean;
  errors?: string[];
}

const DENY_LIST_PATTERNS = [
  /\bADHD\b/i,
  /\bADD\b/,
  /\b(autis[mt]|asperger)\b/i,
  /\b(dyslexia|dyscalculia)\b/i,
  /\bIQ\b/i,
  /\b(anxiety|depression|disorder)\b/i,
  /\b(lazy|stupid|dumb|slow)\b/i,
  /\b(learning disab(ility|led))\b/i,
  /\b(personality type)\b/i,
  /\bintellectual level\b/i,
  /\bintelligence\b/i,
];

/**
 * Same clinical/personality deny-list as ContentValidationService, plus
 * extra student-facing bans for inferred ability language.
 */
export function validateVideoLanguage(texts: string[]): LanguageValidationResult {
  const errors: string[] = [];
  const haystack = texts.filter(Boolean).join("\n");
  for (const pattern of DENY_LIST_PATTERNS) {
    if (pattern.test(haystack)) {
      errors.push(
        `Content contains forbidden clinical/personality language: matched pattern ${pattern.source}`,
      );
      break;
    }
  }
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
