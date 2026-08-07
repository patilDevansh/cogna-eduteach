/**
 * The gate every AI-authored question must clear before a student sees it.
 *
 * The whole safety argument for Goal 2 is one sentence: **AI authors freely
 * inside a grammar we can independently verify; anything that fails any check
 * here is discarded, never shown.** So this file is deliberately paranoid, and
 * its reject path matters more than its accept path.
 *
 * Two rules shape everything below.
 *
 * 1. Nothing the model asserted is consulted as evidence. `claimedSolution` is
 *    read only so it can be *compared*; a mismatch is a rejection, never a
 *    correction. The equation is re-solved from the printed string.
 *
 * 2. The re-solve is checked against a genuinely second implementation.
 *    `linear-bracket-verifier.ts`'s parser is the trust root for the algebraic
 *    solve, so a check that merely re-entered that parser and agreed with
 *    itself would prove nothing. `substituteAndEvaluate()` below is an
 *    independent numeric evaluator — its own tokenizer, its own recursive
 *    descent, its own rational arithmetic, no shared code path — which puts
 *    the re-derived root back into the printed string and requires both sides
 *    to come out equal. A parser bug would have to be reproduced twice, in two
 *    unrelated implementations, to reach a child.
 *
 * Pure: no NestJS, no Prisma, no model call.
 */
import {
  containsForbiddenTerm,
  type DiagnosticV2AuthoredItem,
  type MicroSkillId,
} from "@cogna/shared";
import {
  foldMinusLookalikes,
  matchSingleBracket,
  parseLinearWithBracket,
} from "./linear-bracket-verifier";
import {
  denominatorsOf,
  lineHasFractionSyntax,
} from "./fraction-linear-verifier";
import {
  normalizedQuestionKey,
  type DiagnosticV2Item,
  type DiagnosticV2ItemStageId,
} from "./diagnostic-v2-template-render";

/** Every distinct way an authored item can be thrown away. Each has a test that stubs the model into producing it. */
export type AuthoredItemRejectionCode =
  | "PARSE_FAILED"
  | "NOT_AN_EQUATION"
  | "OUT_OF_RANGE"
  | "DEGENERATE"
  | "NON_INTEGER_SOLUTION"
  | "CLAIMED_ANSWER_UNREADABLE"
  | "CLAIMED_ANSWER_MISMATCH"
  | "SUBSTITUTION_MISMATCH"
  | "UNSUPPORTED_TARGET_SKILL"
  | "SKILL_NOT_EXERCISED"
  | "DUPLICATE"
  | "FORBIDDEN_TERM";

export interface AuthoredItemRejection {
  code: AuthoredItemRejectionCode;
  detail: string;
}

export type AuthoredItemGateResult =
  | { passed: true; item: DiagnosticV2Item; solution: string }
  | { passed: false; rejection: AuthoredItemRejection };

/**
 * Grade-8 sanity bound. Nothing in this slice's curriculum needs a literal
 * past two digits, and an unbounded literal is how an authored question turns
 * into arithmetic homework the diagnostic was never measuring.
 */
export const MAX_AUTHORED_LITERAL = 99;
export const MAX_AUTHORED_LENGTH = 80;

/**
 * Which skills an authored item is allowed to target, and what the *printed
 * equation itself* must contain for that claim to be true. A tag is a claim
 * about the mathematics, so it is checked against the mathematics — a question
 * tagged `LIN_DISTRIBUTE_NEG` that has no negative multiplier on a bracket is
 * rejected however well-formed it otherwise is.
 *
 * Skills absent from this table cannot be authored for at all: `FND_SIGN_MUL_DIV`
 * is a prerequisite this slice never scores directly, `LIN_COMBINE_LIKE` and
 * `LIN_CHECK_SOLUTION` have no single-equation shape that reliably exercises
 * them, and an unverifiable claim is not a claim we will act on.
 */
const SKILL_REQUIREMENTS: Partial<
  Record<MicroSkillId, { requirement: string; holds: (facts: EquationFacts) => boolean }>
> = {
  LIN_DISTRIBUTE_NEG: {
    requirement: "a bracket with a negative multiplier in front of it",
    holds: (f) => f.bracketMultiplier !== null && f.bracketMultiplier < 0,
  },
  LIN_DISTRIBUTE_POS: {
    requirement: "a bracket with a positive multiplier greater than one in front of it",
    holds: (f) => f.bracketMultiplier !== null && f.bracketMultiplier > 1,
  },
  LIN_SOLVE_VARIABLE_BOTH: {
    requirement: "the variable appearing on both sides of the equals sign",
    holds: (f) => f.variableOnBothSides,
  },
  LIN_SOLVE_TWO_STEP: {
    requirement: "a non-unit coefficient and a constant term, with no bracket and the variable on one side",
    holds: (f) => !f.hasBracket && !f.variableOnBothSides && f.hasNonUnitCoefficient && f.hasConstantTerm,
  },
  LIN_REMOVE_CONSTANT: {
    requirement: "a constant term on the variable's side to move across",
    holds: (f) => f.hasConstantTerm,
  },
  LIN_REMOVE_COEFFICIENT: {
    requirement: "a non-unit coefficient on the variable",
    holds: (f) => f.hasNonUnitCoefficient,
  },
  // B1.5 — fraction grammar (verified via the same parse + independent substitute path;
  // fraction-linear-verifier owns step classification; authoring only needs checkable shape).
  LIN_CLEAR_FRACTIONS: {
    requirement: "fraction syntax with at least one denominator greater than 1 to clear",
    holds: (f) => f.hasFractionSyntax && f.fractionDenominatorCount >= 1,
  },
  LIN_SOLVE_FRACTIONS: {
    requirement: "a linear equation that uses fraction syntax",
    holds: (f) => f.hasFractionSyntax,
  },
};

const SUPPORTING_SKILLS: Partial<Record<MicroSkillId, MicroSkillId[]>> = {
  LIN_DISTRIBUTE_NEG: ["FND_SIGN_MUL_DIV"],
  LIN_DISTRIBUTE_POS: ["FND_SIGN_MUL_DIV"],
  LIN_SOLVE_TWO_STEP: ["LIN_REMOVE_CONSTANT", "LIN_REMOVE_COEFFICIENT"],
  LIN_SOLVE_VARIABLE_BOTH: ["LIN_COMBINE_LIKE", "LIN_REMOVE_COEFFICIENT"],
  LIN_CLEAR_FRACTIONS: ["FND_FRACTION_EQUIV", "FND_FRACTION_OPS"],
  LIN_SOLVE_FRACTIONS: ["FND_FRACTION_OPS", "LIN_CLEAR_FRACTIONS"],
};

interface EquationFacts {
  hasBracket: boolean;
  bracketMultiplier: number | null;
  variableOnBothSides: boolean;
  hasNonUnitCoefficient: boolean;
  hasConstantTerm: boolean;
  hasFractionSyntax: boolean;
  fractionDenominatorCount: number;
}

export interface AuthoredItemGateInput {
  authored: DiagnosticV2AuthoredItem;
  /** The place in the sequence this item is standing in for — stated by the caller, never guessed from the item. */
  stageId: DiagnosticV2ItemStageId;
  isTransferCheck: boolean;
  /** Normalized opening lines already served this session. */
  alreadyServed: ReadonlySet<string>;
}

const reject = (code: AuthoredItemRejectionCode, detail: string): AuthoredItemGateResult => ({
  passed: false,
  rejection: { code, detail },
});

export function gateAuthoredItem(input: AuthoredItemGateInput): AuthoredItemGateResult {
  const equation = input.authored.equation.trim();

  // ── Voice, before anything else: text that cannot be shown cannot be shown
  //    even if the mathematics turns out to be flawless.
  for (const [label, text] of [
    ["equation", equation],
    ["claimed solution", input.authored.claimedSolution],
  ] as const) {
    if (containsForbiddenTerm(text)) {
      return reject("FORBIDDEN_TERM", `the authored ${label} contains language a student must never be shown`);
    }
  }

  if (equation.length > MAX_AUTHORED_LENGTH) {
    return reject("OUT_OF_RANGE", `the authored equation is ${equation.length} characters, over the ${MAX_AUTHORED_LENGTH} limit`);
  }
  const oversized = [...equation.matchAll(/\d+/g)]
    .map((m) => Number(m[0]))
    .find((n) => n > MAX_AUTHORED_LITERAL);
  if (oversized !== undefined) {
    return reject("OUT_OF_RANGE", `the authored equation uses ${oversized}, above the ${MAX_AUTHORED_LITERAL} limit for this slice`);
  }

  // ── Grammar.
  let parsed;
  try {
    parsed = parseLinearWithBracket(equation);
  } catch (err) {
    return reject("PARSE_FAILED", `"${equation}" is outside the supported grammar: ${errText(err)}`);
  }
  if (parsed.rhs === null) {
    return reject("NOT_AN_EQUATION", `"${equation}" has no equals sign; authored items in this slice must be equations`);
  }
  if (!parsed.variable) {
    return reject("DEGENERATE", `"${equation}" contains no variable to solve for`);
  }

  // ── Independent re-solve, from the printed string, ignoring every claim the
  //    model made about it.
  const a = subtract(parsed.lhs.a, parsed.rhs.a);
  const b = subtract(parsed.rhs.b, parsed.lhs.b);
  if (a.n === 0) {
    return reject(
      "DEGENERATE",
      b.n === 0
        ? `"${equation}" is an identity — every value of ${parsed.variable} satisfies it, so there is nothing to solve`
        : `"${equation}" has no solution — the variable cancels out and the constants disagree`,
    );
  }
  const root = divide(b, a);
  if (root.d !== 1) {
    return reject("NON_INTEGER_SOLUTION", `"${equation}" solves to ${fracToString(root)}, which is outside this slice's integer scope`);
  }
  if (Math.abs(root.n) > MAX_AUTHORED_LITERAL) {
    return reject("OUT_OF_RANGE", `"${equation}" solves to ${root.n}, beyond the ${MAX_AUTHORED_LITERAL} limit`);
  }

  // ── Second, unrelated implementation: put the root back into the printed
  //    string and require both sides to agree.
  let substituted;
  try {
    substituted = substituteAndEvaluate(equation, parsed.variable, root);
  } catch (err) {
    return reject("SUBSTITUTION_MISMATCH", `"${equation}" could not be evaluated by substitution: ${errText(err)}`);
  }
  if (substituted.rhs === null || !fracEq(substituted.lhs, substituted.rhs)) {
    return reject(
      "SUBSTITUTION_MISMATCH",
      `substituting ${parsed.variable} = ${root.n} back into "${equation}" gives ${fracToString(substituted.lhs)} = ${
        substituted.rhs ? fracToString(substituted.rhs) : "nothing"
      }, so the two independent solvers disagree`,
    );
  }

  // ── Only now is the model's own claim looked at, and only to compare.
  const claimed = readClaimedSolution(input.authored.claimedSolution);
  if (!claimed) {
    return reject("CLAIMED_ANSWER_UNREADABLE", `claimed solution "${input.authored.claimedSolution}" is not a number this gate can compare`);
  }
  if (!fracEq(claimed, root)) {
    return reject(
      "CLAIMED_ANSWER_MISMATCH",
      `claimed ${parsed.variable} = ${fracToString(claimed)} but "${equation}" independently solves to ${root.n}`,
    );
  }

  // ── The tag has to be true of the mathematics.
  const requirement = SKILL_REQUIREMENTS[input.authored.targetMicroSkillId];
  if (!requirement) {
    return reject(
      "UNSUPPORTED_TARGET_SKILL",
      `${input.authored.targetMicroSkillId} has no checkable equation-level signature, so an item cannot be authored against it`,
    );
  }
  const bracket = matchSingleBracket(equation);
  const dens = denominatorsOf(parsed);
  const facts: EquationFacts = {
    hasBracket: parsed.hadBracket,
    bracketMultiplier: parsed.hadBracket && bracket ? bracket.multiplier : null,
    variableOnBothSides: parsed.lhs.a.n !== 0 && parsed.rhs.a.n !== 0,
    hasNonUnitCoefficient: Math.abs(a.n) !== a.d,
    hasConstantTerm: parsed.lhs.b.n !== 0 || parsed.rhs.b.n !== 0,
    hasFractionSyntax: lineHasFractionSyntax(equation),
    fractionDenominatorCount: dens.length,
  };
  if (!requirement.holds(facts)) {
    return reject(
      "SKILL_NOT_EXERCISED",
      `"${equation}" is tagged ${input.authored.targetMicroSkillId} but does not contain ${requirement.requirement}`,
    );
  }

  // ── Not something they have already been given.
  if (input.alreadyServed.has(normalizedQuestionKey(equation))) {
    return reject("DUPLICATE", `"${equation}" has already been served in this session`);
  }

  const prompt = `Solve for ${parsed.variable}:  ${equation}`;
  if (containsForbiddenTerm(prompt)) {
    return reject("FORBIDDEN_TERM", "the assembled prompt contains language a student must never be shown");
  }

  return {
    passed: true,
    solution: `${parsed.variable} = ${root.n}`,
    item: {
      itemKey: `AUTH_${authoredKeySuffix(equation)}`,
      templateId: null,
      origin: "AI_AUTHORED",
      stageId: input.stageId,
      prompt,
      openingLine: equation,
      primaryMicroSkillId: input.authored.targetMicroSkillId,
      supportingMicroSkillIds: [...(SUPPORTING_SKILLS[input.authored.targetMicroSkillId] ?? [])],
      isTransferCheck: input.isTransferCheck,
      isBareExpression: false,
    },
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Stable, readable, collision-resistant enough for an item key that only has to be unique within one session. */
function authoredKeySuffix(equation: string): string {
  let h = 2166136261;
  const normalized = normalizedQuestionKey(equation);
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h).toString(36).toUpperCase();
}

// ─── Reading the model's claim ──────────────────────────────────────────────

/** Accepts `x = 3`, `3`, `x=-2`, `-1/2` — anything else is unreadable, which is itself a rejection. */
export function readClaimedSolution(raw: string): Frac | null {
  const text = raw.trim();
  const afterEquals = text.includes("=") ? text.slice(text.lastIndexOf("=") + 1) : text;
  const m = /^\s*(-?\d+)\s*(?:\/\s*(-?\d+))?\s*$/.exec(foldMinusLookalikes(afterEquals));
  if (!m) return null;
  const n = Number(m[1]);
  const d = m[2] === undefined ? 1 : Number(m[2]);
  if (d === 0) return null;
  return frac(n, d);
}

// ─── Independent rational arithmetic ────────────────────────────────────────
// Deliberately local. Sharing the verifier's helpers would make the
// substitution check depend on the very code it exists to cross-examine.

export interface Frac {
  n: number;
  d: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error("zero denominator");
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n * sign, d * sign);
  return { n: (n * sign) / g, d: (d * sign) / g };
}

function add(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

function subtract(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

function multiply(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

function divide(a: Frac, b: Frac): Frac {
  if (b.n === 0) throw new Error("division by zero");
  return frac(a.n * b.d, a.d * b.n);
}

function fracEq(a: Frac, b: Frac): boolean {
  return a.n === b.n && a.d === b.d;
}

function fracToString(a: Frac): string {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}

// ─── The second implementation ──────────────────────────────────────────────

type NumToken =
  | { kind: "num"; value: Frac }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "eq" };

/**
 * Substitutes `value` for `variable` in the raw printed line and evaluates
 * both sides numerically.
 *
 * Shares no code with `parseLinearWithBracket` on purpose: it tokenizes the
 * string itself, and because the variable is already a number by the time any
 * arithmetic happens it has no notion of degree, no linear form, and no
 * grammar restriction to get wrong in the same way. Agreement between the two
 * is therefore evidence; agreement with itself would not be.
 */
export function substituteAndEvaluate(
  line: string,
  variable: string,
  value: Frac,
): { lhs: Frac; rhs: Frac | null } {
  const tokens = tokenizeNumeric(line, variable, value);
  const eqAt = tokens.findIndex((t) => t.kind === "eq");
  if (eqAt === -1) {
    return { lhs: evaluateTokens(tokens), rhs: null };
  }
  return {
    lhs: evaluateTokens(tokens.slice(0, eqAt)),
    rhs: evaluateTokens(tokens.slice(eqAt + 1)),
  };
}

function tokenizeNumeric(line: string, variable: string, value: Frac): NumToken[] {
  const tokens: NumToken[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < line.length && line[j]! >= "0" && line[j]! <= "9") j++;
      tokens.push({ kind: "num", value: frac(Number(line.slice(i, j))) });
      i = j;
      continue;
    }
    if (c.toLowerCase() === variable.toLowerCase()) {
      tokens.push({ kind: "num", value });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c === "−" || c === "–") {
      tokens.push({ kind: "op", value: "-" });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (c === "=") {
      tokens.push({ kind: "eq" });
      i++;
      continue;
    }
    throw new Error(`unexpected character "${c}"`);
  }
  return tokens;
}

function evaluateTokens(tokens: NumToken[]): Frac {
  let pos = 0;

  const peek = (): NumToken | undefined => tokens[pos];

  const factor = (): Frac => {
    const t = peek();
    if (!t) throw new Error("unexpected end of expression");
    if (t.kind === "op" && t.value === "-") {
      pos++;
      return multiply(factor(), frac(-1));
    }
    if (t.kind === "op" && t.value === "+") {
      pos++;
      return factor();
    }
    if (t.kind === "num") {
      pos++;
      return t.value;
    }
    if (t.kind === "lparen") {
      pos++;
      const inner = expression();
      const close = peek();
      if (!close || close.kind !== "rparen") throw new Error("unbalanced bracket");
      pos++;
      return inner;
    }
    throw new Error("unexpected token");
  };

  const term = (): Frac => {
    let left = factor();
    for (;;) {
      const t = peek();
      if (t && t.kind === "op" && (t.value === "*" || t.value === "/")) {
        pos++;
        const right = factor();
        left = t.value === "*" ? multiply(left, right) : divide(left, right);
        continue;
      }
      // Implicit multiplication: `3x` becomes `3` next to a number once the
      // variable has been substituted, and `-2(x - 5)` becomes `-2` next to a
      // bracket.
      if (t && (t.kind === "num" || t.kind === "lparen")) {
        left = multiply(left, factor());
        continue;
      }
      return left;
    }
  };

  const expression = (): Frac => {
    let left = term();
    for (;;) {
      const t = peek();
      if (t && t.kind === "op" && (t.value === "+" || t.value === "-")) {
        pos++;
        const right = term();
        left = t.value === "+" ? add(left, right) : subtract(left, right);
        continue;
      }
      return left;
    }
  };

  const result = expression();
  if (pos !== tokens.length) throw new Error("trailing tokens");
  return result;
}
