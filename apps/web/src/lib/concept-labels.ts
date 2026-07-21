import {
  toStudentSafeText,
  toParentSafeText,
  containsForbiddenTerm,
  type StudentSafeText,
  type ParentSafeText,
} from "@cogna/shared";

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
  C7_VARIABLE_BOTH_SIDES: "Equations with x on both sides",
  ID_P1_TERM_BASICS: "Combining like terms",
  ID_P2_BINOMIAL_MULTIPLICATION: "Multiplying two binomials",
  ID_C1_SQUARE_OF_SUM: "The (a+b)² identity",
  ID_C2_SQUARE_OF_DIFFERENCE: "The (a-b)² identity",
  ID_C3_DIFFERENCE_OF_SQUARES: "The (a+b)(a-b) identity",
  ID_C4_TWO_BINOMIAL_IDENTITY: "The (x+a)(x+b) identity",
  ID_C5_MENTAL_MATH_APPLICATION: "Using identities for quick computation",
  FAC_P1_MONOMIAL_FACTORS: "Finding common factors",
  FAC_C1_COMMON_FACTOR: "Factorising by common factor",
  FAC_C2_REGROUPING: "Factorising by regrouping",
  FAC_C3_IDENTITY_BASED: "Factorising using identities",
  FAC_C4_TRINOMIAL: "Factorising x²+(a+b)x+ab",
  FAC_C5_DIVISION_CHECK: "Dividing to check a factorisation",
  C8_FRACTIONAL_COEFFICIENTS: "Equations with fractions",
  EXP_P1_LAWS_OF_EXPONENTS: "Laws of exponents",
  EXP_C1_NEGATIVE_EXPONENTS: "Negative exponents",
  EXP_C2_EXPONENTS_IN_SIMPLIFICATION: "Simplifying with exponent laws",
  RAT_P1_VARIABLES_IN_FRACTIONS: "Fractions with a variable",
  RAT_C1_SIMPLIFYING_ALGEBRAIC_FRACTIONS: "Simplifying algebraic fractions",
};

const CONCEPT_LABELS_STUDENT: Record<string, string> = {
  P1_INTEGER_ADD_SUB: "Adding and subtracting",
  P2_NEGATIVE_OPS: "Working with negatives",
  P3_VARIABLES_CONSTANTS: "Variables and constants",
  P3_VARIABLES: "Variables",
  P4_SIMPLE_EXPRESSIONS: "Simple expressions",
  P5_EQUALITY_BALANCE: "Keeping both sides balanced",
  C1_ONE_STEP_ADDITION: "Adding on both sides",
  C2_ONE_STEP_SUBTRACTION: "Plus and minus in equations",
  C3_ONE_STEP_MULTIPLICATION: "Multiplying to find x",
  C4_ONE_STEP_DIVISION: "Dividing to find x",
  C5_TWO_STEP_EQUATIONS: "Two-step equations",
  C6_SIMPLE_WORD_PROBLEMS: "Word problems",
  C7_VARIABLE_BOTH_SIDES: "Getting x on both sides",
  ID_P1_TERM_BASICS: "Combining like terms",
  ID_P2_BINOMIAL_MULTIPLICATION: "Multiplying two brackets",
  ID_C1_SQUARE_OF_SUM: "Squaring (a+b)",
  ID_C2_SQUARE_OF_DIFFERENCE: "Squaring (a-b)",
  ID_C3_DIFFERENCE_OF_SQUARES: "(a+b)(a-b)",
  ID_C4_TWO_BINOMIAL_IDENTITY: "(x+a)(x+b)",
  ID_C5_MENTAL_MATH_APPLICATION: "Fast mental math with identities",
  FAC_P1_MONOMIAL_FACTORS: "Finding common factors",
  FAC_C1_COMMON_FACTOR: "Pulling out a common factor",
  FAC_C2_REGROUPING: "Factorising by regrouping",
  FAC_C3_IDENTITY_BASED: "Factorising with identities",
  FAC_C4_TRINOMIAL: "Factorising x²+(a+b)x+ab",
  FAC_C5_DIVISION_CHECK: "Checking a factorisation by dividing",
  C8_FRACTIONAL_COEFFICIENTS: "Solving equations with fractions",
  EXP_P1_LAWS_OF_EXPONENTS: "Exponent rules",
  EXP_C1_NEGATIVE_EXPONENTS: "Negative exponents",
  EXP_C2_EXPONENTS_IN_SIMPLIFICATION: "Simplifying with exponents",
  RAT_P1_VARIABLES_IN_FRACTIONS: "Fractions with x in them",
  RAT_C1_SIMPLIFYING_ALGEBRAIC_FRACTIONS: "Simplifying x-fractions",
};

const MISCONCEPTION_LABELS: Record<string, string> = {
  SIGN_HANDLING: "sign handling",
  OPERATION_CHOICE: "choosing the operation",
  BALANCE_ERROR: "keeping both sides balanced",
  VARIABLE_MISREAD: "reading the variable",
  VARIABLE_COLLECTION_ERROR: "moving terms across the equals sign",
  CONSTANT_ADDITION_ERROR: "adding instead of multiplying the constants",
  MIDDLE_TERM_OMISSION: "dropping the middle term when expanding",
  INCOMPLETE_FACTOR_EXTRACTION: "not pulling out the full common factor",
  WRONG_FACTOR_PAIR: "picking numbers that multiply right but don't add up right",
  INCOMPLETE_REGROUPING: "not finishing the regrouping step",
  DENOMINATOR_CLEARING_ERROR: "not multiplying every term when clearing fractions",
  EXPONENT_LAW_MISAPPLICATION: "mixing up when to add, subtract, or multiply exponents",
  NEGATIVE_EXPONENT_SIGN_FLIP: "treating a negative exponent as a negative number",
};

const REVISION_TYPE_LABELS: Record<string, string> = {
  CONCEPT_REVIEW: "Review set",
  MISCONCEPTION_REMEDIATION: "Fix-it practice",
  SPACED_REVIEW: "Refresh practice",
  RETENTION_REVIEW: "Refresh practice",
  TRANSFER_CHECK: "Try-it practice",
};

const SOFT_DEFAULT = "A short set to keep this skill strong.";

function looksInternal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\bconfidence\b/.test(lower) ||
    /\bbelow\s+0\.\d+/.test(lower) ||
    /[<=>]\s*0\.\d+/.test(lower) ||
    /\d+\.\d{2}/.test(lower) ||
    /[_=]/.test(text)
  );
}

/**
 * Soften engine reasoning for student-facing UI.
 * Uses shared forbidden-term + branded StudentSafeText.
 */
export function childSafeReasoning(
  reasoning: string | undefined | null,
): StudentSafeText {
  if (!reasoning?.trim()) {
    return toStudentSafeText(SOFT_DEFAULT);
  }
  const text = reasoning.trim();
  if (containsForbiddenTerm(text) || looksInternal(text)) {
    return toStudentSafeText(SOFT_DEFAULT);
  }
  return toStudentSafeText(text);
}

export function conceptLabel(conceptId: string): string {
  return CONCEPT_LABELS[conceptId] ?? "Math practice";
}

export function conceptLabelStudent(conceptId: string): StudentSafeText {
  return toStudentSafeText(
    CONCEPT_LABELS_STUDENT[conceptId] ??
      CONCEPT_LABELS[conceptId] ??
      "Math practice",
  );
}

export function revisionTypeLabel(type: string): string {
  return REVISION_TYPE_LABELS[type] ?? "Practice set";
}

/** Parent-facing phrase for a misconception id, e.g. "sign handling". Falls back to a soft generic phrase rather than leaking the raw id. */
export function misconceptionLabel(misconceptionId: string): string {
  return MISCONCEPTION_LABELS[misconceptionId] ?? "a pattern in how a step is worked";
}

/** Replace raw concept / misconception IDs and strip internal metrics for parent copy. */
export function humanizeParentCopy(text: string): ParentSafeText {
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
  return toParentSafeText(out);
}

export function formatReportDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
