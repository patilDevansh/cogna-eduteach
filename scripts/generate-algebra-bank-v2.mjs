#!/usr/bin/env node
/**
 * Bulk, programmatically-verified question generation for the Grade 8 Algebra
 * skills added in the mvp-6.0 pass: C7_VARIABLE_BOTH_SIDES (linear equations,
 * variable on both sides), the algebraic-identities unit (ID_C1..ID_C4), and
 * extra C6_SIMPLE_WORD_PROBLEMS narrative templates.
 *
 * Every answer (correct AND wrong/misconception) is computed from the same
 * closed-form formula used to build the problem — correctness is guaranteed
 * by construction, the same approach as scripts/generate-approved-bank.mjs.
 *
 * Output is PENDING_REVIEW (not APPROVED) — see docs/mvp-6.0/content/REVIEW_CHECKLIST.md:
 * bulk-generated content still needs a human pass on copy/hint quality before
 * it reaches real students, even though the math itself is self-verified.
 *
 * Usage:
 *   node scripts/generate-algebra-bank-v2.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "docs/mvp-6.0/content/question-bank/generated-questions.json");

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Format a fraction num/den as a reduced fraction string and a decimal string. */
function fraction(num, den) {
  if (den === 0) return null;
  if (num % den === 0) return { clean: true, str: String(num / den) };
  const g = gcd(num, den);
  let n = num / g;
  let d = den / g;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const decimal = (n / d).toFixed(2);
  return { clean: false, fracStr: `${n}/${d}`, decimalStr: decimal };
}

function answerStrings(num, den) {
  const f = fraction(num, den);
  if (!f) return null;
  if (f.clean) return [f.str, `x=${f.str}`, `x = ${f.str}`];
  return [f.fracStr, `x=${f.fracStr}`, f.decimalStr, `x=${f.decimalStr}`];
}

function baseQuestion({
  id,
  conceptId,
  difficulty,
  stem,
  acceptedAnswers,
  solutionSteps,
  hintLadder,
  type = "NUMERIC",
  questionIntent = "STANDARD_PRACTICE",
  misconceptionsTested = [],
  misconceptionAnswerPatterns,
  prerequisiteConceptIds = [],
  unitId,
}) {
  const q = {
    id,
    conceptId,
    difficulty,
    questionIntent,
    type,
    stem,
    acceptedAnswers,
    misconceptionsTested,
    solutionSteps,
    hintLadder,
    reviewStatus: "PENDING_REVIEW",
    version: 1,
    itemQualityWeight: 1.0,
    prerequisiteConceptIds,
  };
  if (misconceptionAnswerPatterns) q.misconceptionAnswerPatterns = misconceptionAnswerPatterns;
  if (unitId) q.unitId = unitId;
  return q;
}

function difficultyFromMagnitude(nums) {
  const maxAbs = Math.max(...nums.map((n) => Math.abs(n)));
  if (maxAbs <= 6) return 1;
  if (maxAbs <= 10) return 2;
  if (maxAbs <= 15) return 3;
  if (maxAbs <= 25) return 4;
  return 5;
}

// ─── C7_VARIABLE_BOTH_SIDES: ax + b = cx + d, solved for x ─────────────────
// Correct: x = (d - b) / (a - c)
// SIGN_HANDLING error: forgets to flip the constant's sign when moving it -> x = (d + b) / (a - c)
// VARIABLE_COLLECTION_ERROR: forgets to flip the variable term's sign -> x = (d - b) / (a + c)
function* genC7() {
  let n = 0;
  const seen = new Set();
  for (let a = 2; a <= 9 && n < 180; a++) {
    for (let c = 1; c <= 9 && n < 180; c++) {
      if (a === c) continue;
      for (let b = -15; b <= 15 && n < 180; b += 3) {
        for (let d = -15; d <= 15 && n < 180; d += 3) {
          const diffAC = a - c;
          if ((d - b) % diffAC !== 0) continue;
          const x = (d - b) / diffAC;
          if (x === 0 || Math.abs(x) > 20) continue;
          const key = `${a}|${b}|${c}|${d}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const patterns = [];
          const signWrong = fraction(d + b, diffAC);
          if (signWrong && (signWrong.clean ? Number(signWrong.str) !== x : true)) {
            patterns.push({
              misconceptionId: "SIGN_HANDLING",
              answers: signWrong.clean
                ? [signWrong.str, `x=${signWrong.str}`]
                : [signWrong.fracStr, signWrong.decimalStr],
            });
          }
          const sumAC = a + c;
          if (sumAC !== 0) {
            const collectWrong = fraction(d - b, sumAC);
            if (collectWrong) {
              const isDifferent = collectWrong.clean
                ? Number(collectWrong.str) !== x
                : true;
              if (isDifferent) {
                patterns.push({
                  misconceptionId: "VARIABLE_COLLECTION_ERROR",
                  answers: collectWrong.clean
                    ? [collectWrong.str, `x=${collectWrong.str}`]
                    : [collectWrong.fracStr, collectWrong.decimalStr],
                });
              }
            }
          }

          const bTerm = b === 0 ? "" : b > 0 ? ` + ${b}` : ` - ${Math.abs(b)}`;
          const dTerm = d === 0 ? "" : d > 0 ? ` + ${d}` : ` - ${Math.abs(d)}`;
          const aLabel = a === 1 ? "" : String(a);
          const cLabel = c === 1 ? "" : String(c);
          const stem = `Solve for x: ${aLabel}x${bTerm} = ${cLabel}x${dTerm}`;

          n++;
          yield baseQuestion({
            id: `Q_C7_GEN_${String(n).padStart(3, "0")}`,
            conceptId: "C7_VARIABLE_BOTH_SIDES",
            difficulty: difficultyFromMagnitude([a, b, c, d]),
            stem,
            acceptedAnswers: answerStrings(x, 1),
            misconceptionsTested: patterns.map((p) => p.misconceptionId),
            misconceptionAnswerPatterns: patterns.length ? patterns : undefined,
            solutionSteps: [
              `${aLabel}x - ${cLabel}x = ${d} - (${b})`,
              `${diffAC}x = ${d - b}`,
              `x = ${x}`,
            ],
            hintLadder: [
              "Collect the x terms on one side and the numbers on the other.",
              `${aLabel}x - ${cLabel}x = ${d - b >= 0 ? d - b : `(${d - b})`}`,
              `x = ${x}`,
            ],
            prerequisiteConceptIds: ["C5_TWO_STEP_EQUATIONS"],
          });
        }
      }
    }
  }
}

// ─── ID_C1_SQUARE_OF_SUM: (x + b)^2 = x^2 + 2bx + b^2 ───────────────────────
function* genID_C1() {
  let n = 0;
  for (let b = 1; b <= 20 && n < 60; b++) {
    const mid = 2 * b;
    const last = b * b;
    n++;
    yield baseQuestion({
      id: `Q_ID_C1_GEN_${String(n).padStart(3, "0")}`,
      conceptId: "ID_C1_SQUARE_OF_SUM",
      difficulty: difficultyFromMagnitude([b]),
      stem: `Expand using the identity: (x + ${b})^2`,
      acceptedAnswers: [`x^2+${mid}x+${last}`, `x^2 + ${mid}x + ${last}`],
      misconceptionsTested: ["MIDDLE_TERM_OMISSION"],
      misconceptionAnswerPatterns: [
        { misconceptionId: "MIDDLE_TERM_OMISSION", answers: [`x^2+${last}`, `x^2 + ${last}`] },
      ],
      solutionSteps: [`(x+${b})^2 = x^2 + 2(${b})x + ${b}^2`, `x^2 + ${mid}x + ${last}`],
      hintLadder: ["Use (a+b)^2 = a^2 + 2ab + b^2.", `x^2 + ${mid}x + ${last}.`],
      unitId: "algebraic-identities",
    });
  }
}

// ─── ID_C2_SQUARE_OF_DIFFERENCE: (x - b)^2 = x^2 - 2bx + b^2 ────────────────
function* genID_C2() {
  let n = 0;
  for (let b = 1; b <= 20 && n < 60; b++) {
    const mid = 2 * b;
    const last = b * b;
    n++;
    yield baseQuestion({
      id: `Q_ID_C2_GEN_${String(n).padStart(3, "0")}`,
      conceptId: "ID_C2_SQUARE_OF_DIFFERENCE",
      difficulty: difficultyFromMagnitude([b]),
      stem: `Expand using the identity: (x - ${b})^2`,
      acceptedAnswers: [`x^2-${mid}x+${last}`, `x^2 - ${mid}x + ${last}`],
      misconceptionsTested: ["SIGN_HANDLING", "MIDDLE_TERM_OMISSION"],
      misconceptionAnswerPatterns: [
        { misconceptionId: "SIGN_HANDLING", answers: [`x^2+${mid}x+${last}`, `x^2 + ${mid}x + ${last}`] },
        { misconceptionId: "MIDDLE_TERM_OMISSION", answers: [`x^2+${last}`, `x^2 + ${last}`] },
      ],
      solutionSteps: [`(x-${b})^2 = x^2 - 2(${b})x + ${b}^2`, `x^2 - ${mid}x + ${last}`],
      hintLadder: ["Use (a-b)^2 = a^2 - 2ab + b^2 — the middle term is negative.", `x^2 - ${mid}x + ${last}.`],
      unitId: "algebraic-identities",
    });
  }
}

// ─── ID_C3_DIFFERENCE_OF_SQUARES: (x + b)(x - b) = x^2 - b^2 ────────────────
function* genID_C3() {
  let n = 0;
  for (let b = 1; b <= 25 && n < 60; b++) {
    const last = b * b;
    n++;
    yield baseQuestion({
      id: `Q_ID_C3_GEN_${String(n).padStart(3, "0")}`,
      conceptId: "ID_C3_DIFFERENCE_OF_SQUARES",
      difficulty: difficultyFromMagnitude([b]),
      stem: `Expand using the identity: (x + ${b})(x - ${b})`,
      acceptedAnswers: [`x^2-${last}`, `x^2 - ${last}`],
      misconceptionsTested: ["SIGN_HANDLING"],
      misconceptionAnswerPatterns: [
        { misconceptionId: "SIGN_HANDLING", answers: [`x^2+${last}`, `x^2 + ${last}`] },
      ],
      solutionSteps: [`(x+${b})(x-${b}) = x^2 - ${b}^2`, `x^2 - ${last}`],
      hintLadder: ["This matches (a+b)(a-b) = a^2 - b^2 — the middle terms cancel.", `x^2 - ${last}.`],
      unitId: "algebraic-identities",
    });
  }
}

// ─── ID_C4_TWO_BINOMIAL_IDENTITY: (x + a)(x + b) = x^2 + (a+b)x + ab ────────
function* genID_C4() {
  let n = 0;
  for (let a = -12; a <= 12 && n < 220; a++) {
    if (a === 0) continue;
    for (let b = -12; b <= 12 && n < 220; b++) {
      if (b === 0) continue;
      const mid = a + b;
      const last = a * b;

      // termStr(coef, suffix, spaced) builds "+ 5x" / "- 5x" / "+ x" (coef 1, no digit) / "" with
      // either compact ("+5x") or spaced ("+ 5x") signs.
      const termStr = (coef, suffix, spaced) => {
        if (coef === 0) return "";
        const sign = coef > 0 ? "+" : "-";
        const sep = spaced ? " " : "";
        const magnitude = Math.abs(coef) === 1 && suffix ? "" : String(Math.abs(coef));
        return `${sep}${sign}${sep}${magnitude}${suffix}`;
      };
      const buildExpr = (spaced) => `x^2${termStr(mid, "x", spaced)}${termStr(last, "", spaced)}`;
      const correctCompact = buildExpr(false);
      const correctSpaced = buildExpr(true);

      const constAddWrong = `x^2${termStr(mid, "x", false)}${termStr(mid, "", false)}`;
      const middleOmitWrong = `x^2${termStr(last, "", false)}`;

      const aTerm = a > 0 ? `+ ${a}` : `- ${Math.abs(a)}`;
      const bTerm = b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
      const stem = `Expand using the identity: (x ${aTerm})(x ${bTerm})`;

      n++;
      yield baseQuestion({
        id: `Q_ID_C4_GEN_${String(n).padStart(3, "0")}`,
        conceptId: "ID_C4_TWO_BINOMIAL_IDENTITY",
        difficulty: difficultyFromMagnitude([a, b]),
        stem,
        acceptedAnswers: [correctCompact, correctSpaced],
        misconceptionsTested: ["CONSTANT_ADDITION_ERROR", "MIDDLE_TERM_OMISSION"],
        misconceptionAnswerPatterns: [
          { misconceptionId: "CONSTANT_ADDITION_ERROR", answers: [constAddWrong] },
          { misconceptionId: "MIDDLE_TERM_OMISSION", answers: [middleOmitWrong] },
        ],
        solutionSteps: [`(x+a)(x+b) = x^2 + (a+b)x + ab, with a=${a}, b=${b}`, correctSpaced],
        hintLadder: [
          "Use (x+a)(x+b) = x^2 + (a+b)x + ab.",
          "The middle term ADDS a and b. The last term MULTIPLIES them.",
          `${correctSpaced}.`,
        ],
        unitId: "algebraic-identities",
      });
    }
  }
}

// ─── C6 narrative templates: age (future/past) and cost-ratio ──────────────
const NAMES = ["Aarav", "Meera", "Kabir", "Priya", "Rohan", "Sanya", "Ishaan", "Divya", "Vikram", "Anika"];
const ITEM_PAIRS = [
  ["pen", "pencil"],
  ["notebook", "eraser"],
  ["storybook", "comic"],
  ["water bottle", "lunch box"],
];

function* genC6Narrative() {
  let n = 0;

  // "In K years, NAME will be M years old. How old is NAME now?"  x + K = M
  for (let k = 2; k <= 10 && n < 60; k++) {
    for (let x = 6; x <= 15 && n < 60; x++) {
      const m = x + k;
      const name = NAMES[n % NAMES.length];
      n++;
      yield baseQuestion({
        id: `Q_C6_GEN2_${String(n).padStart(3, "0")}`,
        conceptId: "C6_SIMPLE_WORD_PROBLEMS",
        difficulty: k <= 5 ? 1 : 2,
        type: "WORD_PROBLEM",
        stem: `In ${k} years, ${name} will be ${m} years old. How old is ${name} now?`,
        acceptedAnswers: [String(x), `x=${x}`, `x = ${x}`],
        misconceptionsTested: ["WORD_TO_EQUATION"],
        misconceptionAnswerPatterns: [
          { misconceptionId: "WORD_TO_EQUATION", answers: [String(m + k), `x=${m + k}`] },
        ],
        solutionSteps: [`x + ${k} = ${m}`, `x = ${x}`],
        hintLadder: [`Let ${name}'s age now be x.`, `x + ${k} = ${m}.`, `x = ${x}.`],
      });
    }
  }

  // "K years ago, NAME was M years old. How old is NAME now?"  x - K = M
  for (let k = 2; k <= 10 && n < 120; k++) {
    for (let x = 10; x <= 20 && n < 120; x++) {
      const m = x - k;
      if (m <= 0) continue;
      const name = NAMES[n % NAMES.length];
      n++;
      yield baseQuestion({
        id: `Q_C6_GEN2_${String(n).padStart(3, "0")}`,
        conceptId: "C6_SIMPLE_WORD_PROBLEMS",
        difficulty: k <= 5 ? 1 : 2,
        type: "WORD_PROBLEM",
        stem: `${k} years ago, ${name} was ${m} years old. How old is ${name} now?`,
        acceptedAnswers: [String(x), `x=${x}`, `x = ${x}`],
        misconceptionsTested: ["WORD_TO_EQUATION", "SIGN_HANDLING"],
        misconceptionAnswerPatterns: [
          { misconceptionId: "SIGN_HANDLING", answers: [String(m - k), `x=${m - k}`] },
        ],
        solutionSteps: [`x - ${k} = ${m}`, `x = ${x}`],
        hintLadder: [`Let ${name}'s age now be x.`, `x - ${k} = ${m}.`, `x = ${x}.`],
      });
    }
  }

  // Cost ratio: N*x + R = P, x = (P-R)/N
  for (let nn = 2; nn <= 5 && n < 180; nn++) {
    for (let x = 5; x <= 20 && n < 180; x++) {
      for (let r = 2; r <= 10 && n < 180; r += 2) {
        const p = nn * x + r;
        const [item1, item2] = ITEM_PAIRS[n % ITEM_PAIRS.length];
        n++;
        yield baseQuestion({
          id: `Q_C6_GEN2_${String(n).padStart(3, "0")}`,
          conceptId: "C6_SIMPLE_WORD_PROBLEMS",
          difficulty: p <= 30 ? 2 : 3,
          type: "WORD_PROBLEM",
          stem: `The cost of a ${item1} is ₹${r} more than ${nn} times the cost of a ${item2}. If the ${item1} costs ₹${p}, what is the cost of the ${item2}?`,
          acceptedAnswers: [String(x), `x=${x}`, `x = ${x}`],
          misconceptionsTested: ["WORD_TO_EQUATION", "INVERSE_OPERATION"],
          misconceptionAnswerPatterns: [
            { misconceptionId: "INVERSE_OPERATION", answers: [String(Math.round(p / nn)), `x=${Math.round(p / nn)}`] },
          ],
          solutionSteps: [`${nn}x + ${r} = ${p}`, `${nn}x = ${p - r}`, `x = ${x}`],
          hintLadder: [`Let the ${item2}'s cost be x.`, `${nn}x + ${r} = ${p}.`, `x = ${x}.`],
        });
      }
    }
  }
}

function main() {
  const generated = [
    ...genC7(),
    ...genID_C1(),
    ...genID_C2(),
    ...genID_C3(),
    ...genID_C4(),
    ...genC6Narrative(),
  ];

  const seen = new Set();
  for (const q of generated) {
    if (seen.has(q.id)) throw new Error(`duplicate id ${q.id}`);
    seen.add(q.id);
  }

  writeFileSync(OUT_PATH, JSON.stringify({ questions: generated }, null, 2) + "\n");

  const byConceptCount = {};
  for (const q of generated) byConceptCount[q.conceptId] = (byConceptCount[q.conceptId] ?? 0) + 1;

  console.log(`Wrote ${generated.length} generated questions to ${OUT_PATH}`);
  console.log(byConceptCount);
}

main();
