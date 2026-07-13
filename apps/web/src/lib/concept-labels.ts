/** Child-safe topic labels — never show raw concept IDs to students. */
const CONCEPT_LABELS: Record<string, string> = {
  C2_ONE_STEP_SUBTRACTION: "One-step equations",
  C6_SIMPLE_WORD_PROBLEMS: "Word problems",
  P1_INTEGER_ADD_SUB: "Adding and subtracting integers",
  P2_NEGATIVE_OPS: "Working with negatives",
  P3_VARIABLES: "Variables and expressions",
  P5_EQUALITY_BALANCE: "Keeping equations balanced",
};

const REVISION_TYPE_LABELS: Record<string, string> = {
  CONCEPT_REVIEW: "Review set",
  MISCONCEPTION_REMEDIATION: "Fix-it practice",
  SPACED_REVIEW: "Refresh practice",
  RETENTION_REVIEW: "Refresh practice",
  TRANSFER_CHECK: "Try-it practice",
};

/** Soften engine reasoning for student-facing UI. */
export function childSafeReasoning(reasoning: string | undefined | null): string {
  if (!reasoning?.trim()) {
    return "A short set to keep this skill strong.";
  }
  const lower = reasoning.toLowerCase();
  if (
    lower.includes("low mastery") ||
    lower.includes("weak") ||
    lower.includes("fail") ||
    lower.includes("misconception") ||
    lower.includes("fatigue") ||
    lower.includes("diagnos")
  ) {
    return "A short set to keep this skill strong.";
  }
  return reasoning;
}

export function conceptLabel(conceptId: string): string {
  return CONCEPT_LABELS[conceptId] ?? "Math practice";
}

export function revisionTypeLabel(type: string): string {
  return REVISION_TYPE_LABELS[type] ?? "Practice set";
}
