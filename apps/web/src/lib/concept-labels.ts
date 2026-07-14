/** Child-safe topic labels — never show raw concept IDs to students or parents. */
const CONCEPT_LABELS: Record<string, string> = {
  P1_INTEGER_ADD_SUB: "Adding and subtracting integers",
  P2_NEGATIVE_OPS: "Working with negatives",
  P3_VARIABLES_CONSTANTS: "Variables and constants",
  P3_VARIABLES: "Variables and expressions",
  P4_SIMPLE_EXPRESSIONS: "Simple expressions",
  P5_EQUALITY_BALANCE: "Keeping equations balanced",
  C1_ONE_STEP_ADDITION: "One-step addition equations",
  C2_ONE_STEP_SUBTRACTION: "One-step equations",
  C3_ONE_STEP_MULTIPLICATION: "One-step multiplication equations",
  C4_ONE_STEP_DIVISION: "One-step division equations",
  C5_TWO_STEP_EQUATIONS: "Two-step equations",
  C6_SIMPLE_WORD_PROBLEMS: "Word problems",
};

const MISCONCEPTION_LABELS: Record<string, string> = {
  SIGN_HANDLING: "sign handling",
  OPERATION_CHOICE: "choosing the operation",
  BALANCE_ERROR: "keeping both sides balanced",
  VARIABLE_MISREAD: "reading the variable",
};

const REVISION_TYPE_LABELS: Record<string, string> = {
  CONCEPT_REVIEW: "Review set",
  MISCONCEPTION_REMEDIATION: "Fix-it practice",
  SPACED_REVIEW: "Refresh practice",
  RETENTION_REVIEW: "Refresh practice",
  TRANSFER_CHECK: "Try-it practice",
};

const SOFT_DEFAULT = "A short set to keep this skill strong.";

/**
 * Soften engine reasoning for student-facing UI.
 * Default to soft copy unless the text looks like plain, child-safe language.
 */
export function childSafeReasoning(reasoning: string | undefined | null): string {
  if (!reasoning?.trim()) {
    return SOFT_DEFAULT;
  }
  const text = reasoning.trim();
  const lower = text.toLowerCase();

  const looksInternal =
    /\bmastery\b/.test(lower) ||
    /\bretent(?:ion|estimate)\b/.test(lower) ||
    /\bthreshold\b/.test(lower) ||
    /\bconfidence\b/.test(lower) ||
    /\bmisconception\b/.test(lower) ||
    /\bfatigue\b/.test(lower) ||
    /\bdiagnos/.test(lower) ||
    /\bweak\b/.test(lower) ||
    /\bfail\b/.test(lower) ||
    /\bbelow\s+0\.\d+/.test(lower) ||
    /[<=>]\s*0\.\d+/.test(lower) ||
    /\d+\.\d{2}/.test(lower) ||
    /[_=]/.test(text) ||
    /\b[CPC]\d+[A-Z_]+\b/.test(text);

  if (looksInternal) {
    return SOFT_DEFAULT;
  }

  return text;
}

export function conceptLabel(conceptId: string): string {
  return CONCEPT_LABELS[conceptId] ?? "Math practice";
}

export function revisionTypeLabel(type: string): string {
  return REVISION_TYPE_LABELS[type] ?? "Practice set";
}

/** Replace raw concept / misconception IDs and strip internal metrics for parent copy. */
export function humanizeParentCopy(text: string): string {
  let out = text;

  for (const [id, label] of Object.entries(CONCEPT_LABELS)) {
    const labelized = id.replace(/_/g, " ").toLowerCase();
    out = out.split(id).join(label);
    out = out.split(labelized).join(label);
  }

  for (const [id, label] of Object.entries(MISCONCEPTION_LABELS)) {
    const labelized = id.replace(/_/g, " ").toLowerCase();
    out = out.split(id).join(label);
    out = out.split(labelized).join(label);
  }

  out = out.replace(/\s*\(confidence\s+\d+(?:\.\d+)?\)/gi, "");
  return out;
}

export function formatReportDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Date-only (YYYY-MM-DD) — avoid timezone shifting the calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, day] = iso.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
