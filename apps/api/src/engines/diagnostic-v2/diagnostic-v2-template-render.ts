/**
 * Phase A's item content: a small fixed set of pre-validated items, plus
 * parametric templates the AI selector may ask to generate a fresh instance
 * from when none of the fixed items fit.
 *
 * Anything generated here is independently re-verified by verifyRendered()
 * before it can be shown — same principle as live-teaching's
 * ContentVerifierService: the checker must never trust the generator's own
 * arithmetic, so it re-derives the answer through the deterministic verifier
 * rather than reusing the numbers the renderer computed.
 */
import {
  parseLinearWithBracket,
  verifyStepValidity,
  isSolvedForm,
  ratToString,
  foldMinusLookalikes,
} from "./linear-bracket-verifier";
import {
  lineHasFractionSyntax,
  solveFractionEquationForDisplay,
  verifyFractionStepValidity,
} from "./fraction-linear-verifier";
import type { DiagnosticV2ItemOrigin, MicroSkillId } from "@cogna/shared";

export type DiagnosticV2TemplateId =
  | "TPL_TWO_STEP"
  | "TPL_VARIABLE_BOTH"
  | "TPL_NEG_DISTRIBUTION"
  | "TPL_NEG_DISTRIBUTION_BARE"
  | "TPL_TRANSFER_NEG_DISTRIBUTION"
  | "TPL_SIGN_MUL_DIV"
  | "TPL_FRAC_SIMPLE"
  | "TPL_FRAC_CLEAR"
  | "TPL_FRAC_CLEAR_BARE"
  | "TPL_TRANSFER_FRAC_CLEAR";

export const KNOWN_TEMPLATE_IDS: DiagnosticV2TemplateId[] = [
  "TPL_TWO_STEP",
  "TPL_VARIABLE_BOTH",
  "TPL_NEG_DISTRIBUTION",
  "TPL_NEG_DISTRIBUTION_BARE",
  "TPL_TRANSFER_NEG_DISTRIBUTION",
  "TPL_SIGN_MUL_DIV",
  "TPL_FRAC_SIMPLE",
  "TPL_FRAC_CLEAR",
  "TPL_FRAC_CLEAR_BARE",
  "TPL_TRANSFER_FRAC_CLEAR",
];

export function isKnownTemplateId(v: string): v is DiagnosticV2TemplateId {
  return (KNOWN_TEMPLATE_IDS as string[]).includes(v);
}

/**
 * Item-bearing stages. Declared here rather than in the session service
 * because an item now states which stage it occupies rather than having one
 * inferred from its template — the session service widens this with the two
 * stages that carry no item (`RULE_PROMPT`, `COMPLETE`).
 */
export type DiagnosticV2ItemStageId =
  | "ENTRY_TWO_STEP"
  | "ENTRY_VARIABLE_BOTH"
  | "NEG_DIST_MAIN"
  | "NEG_DIST_CONTRAST"
  | "TRANSFER_NEG_DIST"
  /**
   * Not part of the fixed backbone (ITEM_STAGE_ORDER) — only reachable when
   * the selector deliberately detours into it, because it found
   * FND_SIGN_MUL_DIV untested or weak while LIN_DISTRIBUTE_NEG kept failing.
   * The prerequisite the selector could see but had nothing to serve for.
   */
  | "PREREQ_SIGN_PROBE"
  /** Phase B1 — fraction-linear track stages. */
  | "ENTRY_FRAC_SIMPLE"
  | "FRAC_CLEAR_MAIN"
  | "FRAC_CLEAR_CONTRAST"
  | "TRANSFER_FRAC_CLEAR";

/**
 * What each template can produce, in one line, so the selector can tell
 * whether any of them covers a case rather than choosing between five opaque
 * ids. Kept next to the render code so a change to the pools has to walk past
 * the sentence that describes them.
 */
export const TEMPLATE_DESCRIPTIONS: Record<DiagnosticV2TemplateId, string> = {
  TPL_TWO_STEP: "a·x + b = c, a ∈ 2..6, b ∈ 1..4, positive integer solution, no bracket",
  TPL_VARIABLE_BOTH: "a·x − b = c·x ± d, variable on both sides, a ∈ 2..6, c ∈ 2..3, no bracket",
  TPL_NEG_DISTRIBUTION:
    "m(v − b) + c = d with a negative multiplier, m ∈ −2..−5, b ∈ 2..6, c ∈ 1..4, integer solution",
  TPL_NEG_DISTRIBUTION_BARE:
    "m(v − b) as an expression to expand, no equals sign, m ∈ −2..−5, b ∈ 2..6, one step and done",
  TPL_TRANSFER_NEG_DISTRIBUTION:
    "same shape as TPL_NEG_DISTRIBUTION but tagged as a post-teaching transfer check",
  TPL_SIGN_MUL_DIV:
    "(m)(n), two signed integers multiplied with no variable and no equation — a prerequisite probe for LIN_DISTRIBUTE_NEG, m,n ∈ 2..6 magnitude, sign chosen so the product's sign is the point",
  TPL_FRAC_SIMPLE:
    "v/d + b = c, single fraction on the left, d ∈ {2,3,4}, integer solution — entry for the fraction track",
  TPL_FRAC_CLEAR:
    "(v ± a)/d1 = (v ± b)/d2 + c with distinct denominators d1,d2 ∈ {2,3,4,6}, integer solution — primary clear-fractions target",
  TPL_FRAC_CLEAR_BARE:
    "(v ± a)/d = k, one fraction equals an integer, d ∈ {2,3,4}, contrast probe for clearing only",
  TPL_TRANSFER_FRAC_CLEAR:
    "same clear-fractions shape as TPL_FRAC_CLEAR but tagged as a post-teaching transfer check",
};

export const TEMPLATE_STAGES: Record<DiagnosticV2TemplateId, DiagnosticV2ItemStageId> = {
  TPL_TWO_STEP: "ENTRY_TWO_STEP",
  TPL_VARIABLE_BOTH: "ENTRY_VARIABLE_BOTH",
  TPL_NEG_DISTRIBUTION: "NEG_DIST_MAIN",
  TPL_NEG_DISTRIBUTION_BARE: "NEG_DIST_CONTRAST",
  TPL_TRANSFER_NEG_DISTRIBUTION: "TRANSFER_NEG_DIST",
  TPL_SIGN_MUL_DIV: "PREREQ_SIGN_PROBE",
  TPL_FRAC_SIMPLE: "ENTRY_FRAC_SIMPLE",
  TPL_FRAC_CLEAR: "FRAC_CLEAR_MAIN",
  TPL_FRAC_CLEAR_BARE: "FRAC_CLEAR_CONTRAST",
  TPL_TRANSFER_FRAC_CLEAR: "TRANSFER_FRAC_CLEAR",
};

export interface DiagnosticV2Item {
  itemKey: string;
  /** null only for an AI-authored item, which belongs to no template by definition. */
  templateId: DiagnosticV2TemplateId | null;
  origin: DiagnosticV2ItemOrigin;
  /** Where this item sits in the diagnostic sequence. Stated, never inferred from the item key. */
  stageId: DiagnosticV2ItemStageId;
  prompt: string;
  /** The line the student's first step is compared against. */
  openingLine: string;
  primaryMicroSkillId: MicroSkillId;
  supportingMicroSkillIds: MicroSkillId[];
  /** True for the post-teaching item, which produces TRANSFER_* evidence rather than ordinary independent evidence. */
  isTransferCheck: boolean;
  /** True for a bare expression (`-3(y - 4)`) rather than an equation — no `x = n` end state, one step and done. */
  isBareExpression: boolean;
}

/** The fixed, pre-validated sequence backbone. The AI selector picks among these first and only generates when none fit. */
export const FIXED_ITEMS: readonly DiagnosticV2Item[] = [
  {
    itemKey: "ENTRY_TWO_STEP",
    templateId: "TPL_TWO_STEP",
    origin: "PRE_WRITTEN",
    stageId: "ENTRY_TWO_STEP",
    prompt: "Solve for x:  3x + 5 = 20",
    openingLine: "3x + 5 = 20",
    primaryMicroSkillId: "LIN_SOLVE_TWO_STEP",
    supportingMicroSkillIds: ["LIN_REMOVE_CONSTANT", "LIN_REMOVE_COEFFICIENT"],
    isTransferCheck: false,
    isBareExpression: false,
  },
  {
    itemKey: "ENTRY_VARIABLE_BOTH",
    templateId: "TPL_VARIABLE_BOTH",
    origin: "PRE_WRITTEN",
    stageId: "ENTRY_VARIABLE_BOTH",
    prompt: "Solve for x:  4x - 7 = 2x + 9",
    openingLine: "4x - 7 = 2x + 9",
    primaryMicroSkillId: "LIN_SOLVE_VARIABLE_BOTH",
    supportingMicroSkillIds: ["LIN_COMBINE_LIKE", "LIN_REMOVE_COEFFICIENT"],
    isTransferCheck: false,
    isBareExpression: false,
  },
  {
    itemKey: "NEG_DIST_MAIN",
    templateId: "TPL_NEG_DISTRIBUTION",
    origin: "PRE_WRITTEN",
    stageId: "NEG_DIST_MAIN",
    prompt: "Solve for x:  -2(x - 5) + 3 = 11",
    openingLine: "-2(x - 5) + 3 = 11",
    primaryMicroSkillId: "LIN_DISTRIBUTE_NEG",
    supportingMicroSkillIds: ["FND_SIGN_MUL_DIV"],
    isTransferCheck: false,
    isBareExpression: false,
  },
  {
    itemKey: "NEG_DIST_CONTRAST",
    templateId: "TPL_NEG_DISTRIBUTION_BARE",
    origin: "PRE_WRITTEN",
    stageId: "NEG_DIST_CONTRAST",
    prompt: "Expand:  -3(y - 4)",
    openingLine: "-3(y - 4)",
    primaryMicroSkillId: "LIN_DISTRIBUTE_NEG",
    supportingMicroSkillIds: ["FND_SIGN_MUL_DIV"],
    isTransferCheck: false,
    isBareExpression: true,
  },
  {
    itemKey: "TRANSFER_NEG_DIST",
    templateId: "TPL_TRANSFER_NEG_DISTRIBUTION",
    origin: "PRE_WRITTEN",
    stageId: "TRANSFER_NEG_DIST",
    prompt: "Solve for z:  -4(z - 2) + 3 = 19",
    openingLine: "-4(z - 2) + 3 = 19",
    primaryMicroSkillId: "LIN_DISTRIBUTE_NEG",
    supportingMicroSkillIds: ["FND_SIGN_MUL_DIV"],
    isTransferCheck: true,
    isBareExpression: false,
  },
  {
    itemKey: "PREREQ_SIGN_PROBE",
    templateId: "TPL_SIGN_MUL_DIV",
    origin: "PRE_WRITTEN",
    stageId: "PREREQ_SIGN_PROBE",
    prompt: "Evaluate:  (-2)(-5)",
    openingLine: "(-2)(-5)",
    primaryMicroSkillId: "FND_SIGN_MUL_DIV",
    supportingMicroSkillIds: [],
    isTransferCheck: false,
    isBareExpression: true,
  },
  // ── Phase B1 fraction-linear track ───────────────────────────────────────
  {
    itemKey: "ENTRY_FRAC_SIMPLE",
    templateId: "TPL_FRAC_SIMPLE",
    origin: "PRE_WRITTEN",
    stageId: "ENTRY_FRAC_SIMPLE",
    prompt: "Solve for x:  x/2 + 3 = 7",
    openingLine: "x/2 + 3 = 7",
    primaryMicroSkillId: "LIN_SOLVE_FRACTIONS",
    supportingMicroSkillIds: ["FND_FRACTION_OPS", "LIN_CLEAR_FRACTIONS"],
    isTransferCheck: false,
    isBareExpression: false,
  },
  {
    itemKey: "FRAC_CLEAR_MAIN",
    templateId: "TPL_FRAC_CLEAR",
    origin: "PRE_WRITTEN",
    stageId: "FRAC_CLEAR_MAIN",
    prompt: "Solve for x:  (x + 1)/2 = (x - 1)/3 + 1",
    openingLine: "(x + 1)/2 = (x - 1)/3 + 1",
    primaryMicroSkillId: "LIN_CLEAR_FRACTIONS",
    supportingMicroSkillIds: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"],
    isTransferCheck: false,
    isBareExpression: false,
  },
  {
    itemKey: "FRAC_CLEAR_CONTRAST",
    templateId: "TPL_FRAC_CLEAR_BARE",
    origin: "PRE_WRITTEN",
    stageId: "FRAC_CLEAR_CONTRAST",
    prompt: "Solve for y:  (y + 2)/4 = 3",
    openingLine: "(y + 2)/4 = 3",
    primaryMicroSkillId: "LIN_CLEAR_FRACTIONS",
    supportingMicroSkillIds: ["FND_FRACTION_OPS"],
    isTransferCheck: false,
    isBareExpression: false,
  },
  {
    itemKey: "TRANSFER_FRAC_CLEAR",
    templateId: "TPL_TRANSFER_FRAC_CLEAR",
    origin: "PRE_WRITTEN",
    stageId: "TRANSFER_FRAC_CLEAR",
    prompt: "Solve for z:  (z - 2)/3 = (z + 1)/6 + 1",
    openingLine: "(z - 2)/3 = (z + 1)/6 + 1",
    primaryMicroSkillId: "LIN_CLEAR_FRACTIONS",
    supportingMicroSkillIds: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"],
    isTransferCheck: true,
    isBareExpression: false,
  },
] as const;

export function findFixedItem(itemKey: string): DiagnosticV2Item | undefined {
  return FIXED_ITEMS.find((i) => i.itemKey === itemKey);
}

// ─── Deterministic generation ───────────────────────────────────────────────

/**
 * Seeded so the same request always renders the same instance — a retry must
 * never silently change the question the student is looking at.
 *
 * The seed deliberately includes a per-request discriminator (see
 * `renderFreshInstance`). Phase A seeded on `sessionId:templateId` alone,
 * which meant "give this child another negative-bracket problem" returned the
 * exact question they had just been shown, three times in a row in one
 * observed live run.
 */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(values: readonly T[], seed: number, offset: number): T {
  return values[(seed + offset) % values.length]!;
}

const MULTIPLIERS = [-2, -3, -4, -5] as const;
const INNER_CONSTANTS = [2, 3, 4, 5, 6] as const;
const OUTER_CONSTANTS = [1, 2, 3, 4] as const;
const COEFFICIENTS = [2, 3, 4, 5, 6] as const;
const VARIABLES = ["x", "y", "z", "n"] as const;
const FRAC_DENOMS = [2, 3, 4, 6] as const;

/**
 * Renders a fresh instance of a known template. Returns the item plus the
 * numbers used, so verifyRendered() can re-derive independently rather than
 * being handed a precomputed answer to rubber-stamp.
 */
export function renderTemplate(
  templateId: DiagnosticV2TemplateId,
  seed: string,
): DiagnosticV2Item {
  const s = hashSeed(seed);

  switch (templateId) {
    case "TPL_TWO_STEP": {
      const a = pick(COEFFICIENTS, s, 0);
      const b = pick(OUTER_CONSTANTS, s, 1);
      const x = pick(INNER_CONSTANTS, s, 2);
      const c = a * x + b;
      return {
        itemKey: `GEN_TWO_STEP_${a}_${b}_${c}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Solve for x:  ${a}x + ${b} = ${c}`,
        openingLine: `${a}x + ${b} = ${c}`,
        primaryMicroSkillId: "LIN_SOLVE_TWO_STEP",
        supportingMicroSkillIds: ["LIN_REMOVE_CONSTANT", "LIN_REMOVE_COEFFICIENT"],
        isTransferCheck: false,
        isBareExpression: false,
      };
    }
    case "TPL_VARIABLE_BOTH": {
      const a = pick(COEFFICIENTS, s, 0);
      const cCoef = pick([2, 3], s, 1);
      const left = a === cCoef ? a + 2 : a;
      const x = pick(INNER_CONSTANTS, s, 2);
      const b = pick(OUTER_CONSTANTS, s, 3);
      // left*x + (-b) = cCoef*x + d  =>  d = (left - cCoef)*x - b
      const d = (left - cCoef) * x - b;
      return {
        itemKey: `GEN_VAR_BOTH_${left}_${b}_${cCoef}_${d}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Solve for x:  ${left}x - ${b} = ${cCoef}x ${d < 0 ? "-" : "+"} ${Math.abs(d)}`,
        openingLine: `${left}x - ${b} = ${cCoef}x ${d < 0 ? "-" : "+"} ${Math.abs(d)}`,
        primaryMicroSkillId: "LIN_SOLVE_VARIABLE_BOTH",
        supportingMicroSkillIds: ["LIN_COMBINE_LIKE", "LIN_REMOVE_COEFFICIENT"],
        isTransferCheck: false,
        isBareExpression: false,
      };
    }
    case "TPL_NEG_DISTRIBUTION":
    case "TPL_TRANSFER_NEG_DISTRIBUTION": {
      const m = pick(MULTIPLIERS, s, 0);
      const inner = pick(INNER_CONSTANTS, s, 1);
      const outer = pick(OUTER_CONSTANTS, s, 2);
      const v = pick(VARIABLES, s, 3);
      const x = pick(INNER_CONSTANTS, s, 4);
      // m*(v - inner) + outer = rhs
      const rhs = m * (x - inner) + outer;
      const isTransfer = templateId === "TPL_TRANSFER_NEG_DISTRIBUTION";
      return {
        // The two templates render the same shape but are NOT the same item:
        // a transfer instance carries NEAR_TRANSFER and produces TRANSFER_*
        // evidence. Phase A gave both the same key prefix, so a generated
        // transfer item was later read back as an ordinary one.
        itemKey: `${isTransfer ? "GEN_TRANSFER_NEG_DIST" : "GEN_NEG_DIST"}_${m}_${inner}_${outer}_${v}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Solve for ${v}:  ${m}(${v} - ${inner}) + ${outer} = ${rhs}`,
        openingLine: `${m}(${v} - ${inner}) + ${outer} = ${rhs}`,
        primaryMicroSkillId: "LIN_DISTRIBUTE_NEG",
        supportingMicroSkillIds: ["FND_SIGN_MUL_DIV"],
        isTransferCheck: isTransfer,
        isBareExpression: false,
      };
    }
    case "TPL_NEG_DISTRIBUTION_BARE": {
      const m = pick(MULTIPLIERS, s, 0);
      const inner = pick(INNER_CONSTANTS, s, 1);
      const v = pick(VARIABLES, s, 2);
      return {
        itemKey: `GEN_NEG_DIST_BARE_${m}_${inner}_${v}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Expand:  ${m}(${v} - ${inner})`,
        openingLine: `${m}(${v} - ${inner})`,
        primaryMicroSkillId: "LIN_DISTRIBUTE_NEG",
        supportingMicroSkillIds: ["FND_SIGN_MUL_DIV"],
        isTransferCheck: false,
        isBareExpression: true,
      };
    }
    case "TPL_SIGN_MUL_DIV": {
      // Both factors negative, so the point of the item is the sign, not the
      // magnitude — exactly the step that produces the canonical error
      // "(-2)(-5) was evaluated as -10".
      const left = pick(MULTIPLIERS, s, 0);
      const right = -pick(INNER_CONSTANTS, s, 1);
      return {
        itemKey: `GEN_SIGN_MUL_${left}_${right}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Evaluate:  (${left})(${right})`,
        openingLine: `(${left})(${right})`,
        primaryMicroSkillId: "FND_SIGN_MUL_DIV",
        supportingMicroSkillIds: [],
        isTransferCheck: false,
        isBareExpression: true,
      };
    }
    case "TPL_FRAC_SIMPLE": {
      // v/d + b = c with integer solution x = d·quot.
      const d = pick([2, 3, 4] as const, s, 0);
      const b = pick(OUTER_CONSTANTS, s, 1);
      const quot = pick(INNER_CONSTANTS, s, 2);
      const c = quot + b;
      const opening = `x/${d} + ${b} = ${c}`;
      return {
        itemKey: `GEN_FRAC_SIMPLE_${d}_${b}_${c}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Solve for x:  ${opening}`,
        openingLine: opening,
        primaryMicroSkillId: "LIN_SOLVE_FRACTIONS",
        supportingMicroSkillIds: ["FND_FRACTION_OPS", "LIN_CLEAR_FRACTIONS"],
        isTransferCheck: false,
        isBareExpression: false,
      };
    }
    case "TPL_FRAC_CLEAR":
    case "TPL_TRANSFER_FRAC_CLEAR": {
      // (v + a)/d1 = (v - b)/d2 + c  with distinct dens and integer solution.
      let d1 = pick(FRAC_DENOMS, s, 0);
      let d2 = pick(FRAC_DENOMS, s, 1);
      if (d1 === d2) d2 = d1 === 2 ? 3 : 2;
      const a = pick([1, 2, 3] as const, s, 2);
      const bInner = pick([1, 2, 3] as const, s, 3);
      const c = pick([1, 2] as const, s, 4);
      const v = pick(VARIABLES, s, 5);
      // Choose integer x in 1..8 such that the equation holds:
      // (x+a)/d1 - (x-bInner)/d2 = c
      // x/d1 + a/d1 - x/d2 + bInner/d2 = c
      // x (1/d1 - 1/d2) = c - a/d1 - bInner/d2
      let xSol = 1;
      let found = false;
      for (let trial = 1; trial <= 12; trial++) {
        const lhs = (trial + a) / d1;
        const rhs = (trial - bInner) / d2 + c;
        if (Math.abs(lhs - rhs) < 1e-9) {
          xSol = trial;
          found = true;
          break;
        }
      }
      if (!found) {
        // Fall back to the canonical fixed shape numbers with a fresh variable.
        const opening = `(${v} + 1)/2 = (${v} - 1)/3 + 1`;
        const isTransfer = templateId === "TPL_TRANSFER_FRAC_CLEAR";
        return {
          itemKey: `${isTransfer ? "GEN_TRANSFER_FRAC_CLEAR" : "GEN_FRAC_CLEAR"}_fallback_${v}`,
          templateId,
          origin: "TEMPLATE_RENDERED",
          stageId: TEMPLATE_STAGES[templateId],
          prompt: `Solve for ${v}:  ${opening}`,
          openingLine: opening,
          primaryMicroSkillId: "LIN_CLEAR_FRACTIONS",
          supportingMicroSkillIds: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"],
          isTransferCheck: isTransfer,
          isBareExpression: false,
        };
      }
      void xSol;
      const opening = `(${v} + ${a})/${d1} = (${v} - ${bInner})/${d2} + ${c}`;
      const isTransfer = templateId === "TPL_TRANSFER_FRAC_CLEAR";
      return {
        itemKey: `${isTransfer ? "GEN_TRANSFER_FRAC_CLEAR" : "GEN_FRAC_CLEAR"}_${d1}_${d2}_${a}_${bInner}_${c}_${v}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Solve for ${v}:  ${opening}`,
        openingLine: opening,
        primaryMicroSkillId: "LIN_CLEAR_FRACTIONS",
        supportingMicroSkillIds: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"],
        isTransferCheck: isTransfer,
        isBareExpression: false,
      };
    }
    case "TPL_FRAC_CLEAR_BARE": {
      const d = pick([2, 3, 4] as const, s, 0);
      const a = pick([1, 2, 3] as const, s, 1);
      const v = pick(["y", "n", "t"] as const, s, 2);
      const x = pick(INNER_CONSTANTS, s, 3);
      const k = (x + a) / d;
      const kInt = Number.isInteger(k) ? k : Math.round((pick(INNER_CONSTANTS, s, 4) + a) / d) || 3;
      const xAdj = kInt * d - a;
      void xAdj;
      const opening = `(${v} + ${a})/${d} = ${kInt}`;
      return {
        itemKey: `GEN_FRAC_CLEAR_BARE_${d}_${a}_${kInt}_${v}`,
        templateId,
        origin: "TEMPLATE_RENDERED",
        stageId: TEMPLATE_STAGES[templateId],
        prompt: `Solve for ${v}:  ${opening}`,
        openingLine: opening,
        primaryMicroSkillId: "LIN_CLEAR_FRACTIONS",
        supportingMicroSkillIds: ["FND_FRACTION_OPS"],
        isTransferCheck: false,
        isBareExpression: false,
      };
    }
  }
}

/**
 * Whitespace- and case-insensitive form used for "have we already shown this?"
 * comparisons. Minus lookalikes are folded too: without that, an authored
 * `−2(x − 5) + 3 = 11` reads as a different question from an already-served
 * `-2(x - 5) + 3 = 11` and the duplicate check waves it straight through.
 */
export function normalizedQuestionKey(line: string): string {
  return foldMinusLookalikes(line).replace(/\s+/g, "").toLowerCase();
}

/**
 * How many re-renders to try before admitting the pool cannot produce anything
 * new. The negative-distribution pool alone has 4x5x4x4 = 320 combinations, so
 * exhausting a dozen attempts means the session has genuinely run the shape
 * dry rather than that the seed was unlucky.
 */
export const MAX_RENDER_ATTEMPTS = 12;

export interface FreshInstanceResult {
  item: DiagnosticV2Item | null;
  /** Why nothing could be served, when `item` is null. */
  failure?: string;
  attempts: number;
}

/**
 * Renders an instance of `templateId` that the student has not already seen
 * this session, and that passes independent re-verification.
 *
 * A different seed is not the same thing as a different question — two seeds
 * can land on the same pool entries — so this compares the rendered text
 * itself and re-rolls on a collision. Deterministic: the same session, the
 * same template and the same set of already-served questions always produce
 * the same instance, so a retry cannot swap the question under the student.
 */
export function renderFreshInstance(input: {
  templateId: DiagnosticV2TemplateId;
  /** Stable per-session, per-request seed base — include something that advances as the session does. */
  seedBase: string;
  /** Normalized opening lines already served this session. */
  alreadyServed: ReadonlySet<string>;
  maxAttempts?: number;
}): FreshInstanceResult {
  const maxAttempts = input.maxAttempts ?? MAX_RENDER_ATTEMPTS;
  const verificationFailures: string[] = [];
  let collisions = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = renderTemplate(input.templateId, `${input.seedBase}#${attempt}`);
    if (input.alreadyServed.has(normalizedQuestionKey(candidate.openingLine))) {
      collisions++;
      continue;
    }
    const verification = verifyRendered(candidate);
    if (!verification.passed) {
      verificationFailures.push(verification.failures.join("; "));
      continue;
    }
    return { item: candidate, attempts: attempt + 1 };
  }

  return {
    item: null,
    attempts: maxAttempts,
    failure:
      verificationFailures.length > 0
        ? `no distinct instance of ${input.templateId} survived re-verification in ${maxAttempts} attempts: ${verificationFailures[0]}`
        : `every one of ${maxAttempts} rendered instances of ${input.templateId} repeated a question already served this session (${collisions} collisions)`,
  };
}

export interface RenderVerification {
  passed: boolean;
  failures: string[];
  /** The correctly-expanded / solved form, re-derived here, never taken from the renderer. */
  canonicalSolution?: string;
}

/**
 * Independent re-verification of a rendered item. Deliberately does NOT reuse
 * the numbers renderTemplate() computed — it re-parses the rendered prompt
 * text and re-solves it through the deterministic verifier, so a bug in the
 * renderer's arithmetic cannot also be baked into its own check.
 */
export function verifyRendered(item: DiagnosticV2Item): RenderVerification {
  const failures: string[] = [];
  const fractionItem =
    lineHasFractionSyntax(item.openingLine) ||
    item.primaryMicroSkillId === "LIN_CLEAR_FRACTIONS" ||
    item.primaryMicroSkillId === "LIN_SOLVE_FRACTIONS";

  let parsed;
  try {
    parsed = parseLinearWithBracket(item.openingLine);
  } catch (err) {
    return {
      passed: false,
      failures: [`opening line does not parse: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  if (!item.prompt.includes(item.openingLine)) {
    failures.push("prompt text does not contain the opening line the student will work from");
  }

  if (item.isBareExpression) {
    if (parsed.rhs !== null) {
      failures.push("expression item unexpectedly contains an equals sign");
    }
    if (!parsed.hadBracket) {
      failures.push("expand-the-bracket item has no bracket to expand");
    }
    // Re-derive the expansion and confirm it round-trips as VALID.
    const canonical = `${ratToString(parsed.lhs.a)}${parsed.variable ?? "x"}${
      parsed.lhs.b.n < 0 ? "-" : "+"
    }${Math.abs(parsed.lhs.b.n)}`;
    const check = verifyStepValidity(item.openingLine, canonical);
    if (check.validity !== "VALID") {
      failures.push(`re-derived expansion "${canonical}" did not verify as valid (${check.validity})`);
    }
    return { passed: failures.length === 0, failures, canonicalSolution: canonical };
  }

  if (parsed.rhs === null) {
    failures.push("equation item is missing an equals sign");
    return { passed: false, failures };
  }

  // Re-derive the solution, then require it to verify as a VALID step from the
  // original line — the same check the student's own final line will face.
  const variable = parsed.variable ?? "x";
  const candidate = fractionItem
    ? solveFractionEquationForDisplay(item.openingLine, variable) ??
      solveForDisplay(item.openingLine, variable)
    : solveForDisplay(item.openingLine, variable);
  if (!candidate) {
    failures.push("could not re-derive a solution for this equation");
    return { passed: false, failures };
  }
  if (fractionItem) {
    // B1 templates require an integer solution.
    if (candidate.includes("/")) {
      failures.push(`fraction-track item must have an integer solution, got "${candidate}"`);
    }
  }
  const check = fractionItem
    ? verifyFractionStepValidity(item.openingLine, candidate)
    : verifyStepValidity(item.openingLine, candidate);
  if (check.validity !== "VALID") {
    failures.push(`re-derived solution "${candidate}" did not verify as valid (${check.validity})`);
  }
  const solvedParse = parseLinearWithBracket(candidate);
  if (!isSolvedForm(solvedParse)) {
    failures.push(`re-derived solution "${candidate}" is not in solved form`);
  }

  return { passed: failures.length === 0, failures, canonicalSolution: candidate };
}

/** Re-derives `variable = value` from a line, using only the parser's own linear form. */
function solveForDisplay(line: string, variable: string): string | null {
  const parsed = parseLinearWithBracket(line);
  if (!parsed.rhs) return null;
  const aN = parsed.lhs.a.n * parsed.rhs.a.d - parsed.rhs.a.n * parsed.lhs.a.d;
  const aD = parsed.lhs.a.d * parsed.rhs.a.d;
  const bN = parsed.rhs.b.n * parsed.lhs.b.d - parsed.lhs.b.n * parsed.rhs.b.d;
  const bD = parsed.lhs.b.d * parsed.rhs.b.d;
  if (aN === 0) return null;
  // x = (bN/bD) / (aN/aD)
  const num = bN * aD;
  const den = bD * aN;
  if (den === 0) return null;
  const g = ((x: number, y: number): number => {
    x = Math.abs(x);
    y = Math.abs(y);
    while (y) [x, y] = [y, x % y];
    return x || 1;
  })(num, den);
  const sign = den < 0 ? -1 : 1;
  const n = (num / g) * sign;
  const d = (den / g) * sign;
  return d === 1 ? `${variable} = ${n}` : `${variable} = ${n}/${d}`;
}
