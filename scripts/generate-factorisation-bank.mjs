#!/usr/bin/env node
/**
 * Bulk, programmatically-verified question generation for the mvp-7.0
 * Factorisation unit: FAC_C1_COMMON_FACTOR, FAC_C3_IDENTITY_BASED, and
 * FAC_C4_TRINOMIAL (the reverse of the (x+a)(x+b) identity — B4 run backwards).
 *
 * Every answer is computed from the same closed-form formula used to build
 * the problem — correctness is guaranteed by construction, cross-checked
 * independently after generation (see the verification pass in the session
 * that authored this script).
 *
 * Output is PENDING_REVIEW — see docs/mvp-7.0/content/REVIEW_CHECKLIST.md.
 *
 * Usage:
 *   node scripts/generate-factorisation-bank.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "docs/mvp-7.0/content/question-bank/generated-questions.json");

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
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
  unitId = "factorisation",
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
    unitId,
  };
  if (misconceptionAnswerPatterns) q.misconceptionAnswerPatterns = misconceptionAnswerPatterns;
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

const termSign = (n, suffix, spaced) => {
  if (n === 0) return "";
  const sign = n > 0 ? "+" : "-";
  const sep = spaced ? " " : "";
  const magnitude = Math.abs(n) === 1 && suffix ? "" : String(Math.abs(n));
  return `${sep}${sign}${sep}${magnitude}${suffix}`;
};

// ─── FAC_C1_COMMON_FACTOR: gx*(mx + n) expanded to g*m*x^2 + g*n*x ──────────
// Wrong (INCOMPLETE_FACTOR_EXTRACTION): pulls out only x, leaving the numeric GCF unextracted.
function* genFAC_C1() {
  let n = 0;
  for (let g = 2; g <= 9 && n < 120; g++) {
    for (let m = 1; m <= 8 && n < 120; m++) {
      for (let nn = 1; nn <= 8 && n < 120; nn++) {
        if (gcd(m, nn) !== 1) continue; // ensure g is truly the full GCF, not a partial one
        const c1 = g * m;
        const c2 = g * nn;
        const mLabel = m === 1 ? "" : String(m);
        const stem = `Factorise: ${c1}x^2 + ${c2}x`;
        const correct = `${g}x(${mLabel}x+${nn})`;
        const correctSpaced = `${g}x(${mLabel}x + ${nn})`;
        const wrong = `x(${c1}x+${c2})`;
        n++;
        yield baseQuestion({
          id: `Q_FAC_C1_GEN_${String(n).padStart(3, "0")}`,
          conceptId: "FAC_C1_COMMON_FACTOR",
          difficulty: difficultyFromMagnitude([c1, c2]),
          stem,
          acceptedAnswers: [correct, correctSpaced],
          misconceptionsTested: ["INCOMPLETE_FACTOR_EXTRACTION"],
          misconceptionAnswerPatterns: [
            { misconceptionId: "INCOMPLETE_FACTOR_EXTRACTION", answers: [wrong, wrong.replace("+", " + ")] },
          ],
          solutionSteps: [`GCF of ${c1}x^2 and ${c2}x is ${g}x`, correctSpaced],
          hintLadder: ["Find the full GCF — the number AND the shared power of x.", `${correctSpaced}.`],
          prerequisiteConceptIds: ["FAC_P1_MONOMIAL_FACTORS"],
        });
      }
    }
  }
}

// ─── FAC_C3_IDENTITY_BASED: reverse of ID_C1/ID_C2/ID_C3 ────────────────────
function* genFAC_C3() {
  let n = 0;
  for (let b = 1; b <= 20 && n < 60; b++) {
    const mid = 2 * b;
    const sq = b * b;
    n++;
    yield baseQuestion({
      id: `Q_FAC_C3_GEN_${String(n).padStart(3, "0")}`,
      conceptId: "FAC_C3_IDENTITY_BASED",
      difficulty: difficultyFromMagnitude([b]),
      stem: `Factorise using an identity: x^2 + ${mid}x + ${sq}`,
      acceptedAnswers: [`(x+${b})^2`, `(x + ${b})^2`],
      misconceptionsTested: ["SIGN_HANDLING"],
      misconceptionAnswerPatterns: [{ misconceptionId: "SIGN_HANDLING", answers: [`(x-${b})^2`, `(x - ${b})^2`] }],
      solutionSteps: [`x^2 + ${mid}x + ${sq} matches a^2 + 2ab + b^2 with a=x, b=${b}`, `(x + ${b})^2`],
      hintLadder: ["Positive middle term means (a+b)^2.", `(x + ${b})^2.`],
      unitId: "factorisation",
    });
  }
  for (let b = 1; b <= 20 && n < 120; b++) {
    const mid = 2 * b;
    const sq = b * b;
    n++;
    yield baseQuestion({
      id: `Q_FAC_C3_GEN_${String(n).padStart(3, "0")}`,
      conceptId: "FAC_C3_IDENTITY_BASED",
      difficulty: difficultyFromMagnitude([b]),
      stem: `Factorise using an identity: x^2 - ${mid}x + ${sq}`,
      acceptedAnswers: [`(x-${b})^2`, `(x - ${b})^2`],
      misconceptionsTested: ["SIGN_HANDLING"],
      misconceptionAnswerPatterns: [{ misconceptionId: "SIGN_HANDLING", answers: [`(x+${b})^2`, `(x + ${b})^2`] }],
      solutionSteps: [`x^2 - ${mid}x + ${sq} matches a^2 - 2ab + b^2 with a=x, b=${b}`, `(x - ${b})^2`],
      hintLadder: ["Negative middle term means (a-b)^2.", `(x - ${b})^2.`],
      unitId: "factorisation",
    });
  }
  for (let b = 1; b <= 25 && n < 180; b++) {
    const sq = b * b;
    n++;
    yield baseQuestion({
      id: `Q_FAC_C3_GEN_${String(n).padStart(3, "0")}`,
      conceptId: "FAC_C3_IDENTITY_BASED",
      difficulty: difficultyFromMagnitude([b]),
      stem: `Factorise using an identity: x^2 - ${sq}`,
      acceptedAnswers: [`(x+${b})(x-${b})`, `(x + ${b})(x - ${b})`],
      misconceptionsTested: ["SIGN_HANDLING"],
      misconceptionAnswerPatterns: [{ misconceptionId: "SIGN_HANDLING", answers: [`(x+${b})(x+${b})`, `(x-${b})(x-${b})`] }],
      solutionSteps: [`x^2 - ${sq} = x^2 - ${b}^2, matches a^2 - b^2`, `(x + ${b})(x - ${b})`],
      hintLadder: ["Difference of two squares: a^2 - b^2 = (a+b)(a-b).", `(x + ${b})(x - ${b}).`],
      unitId: "factorisation",
    });
  }
}

// ─── FAC_C4_TRINOMIAL: reverse of ID_C4 — factor x^2+(a+b)x+ab into (x+a)(x+b) ──
// Wrong (SIGN_HANDLING): flips the sign of the second factor only.
function* genFAC_C4() {
  let n = 0;
  for (let a = -12; a <= 12 && n < 220; a++) {
    if (a === 0) continue;
    for (let b = -12; b <= 12 && n < 220; b++) {
      if (b === 0) continue;
      const mid = a + b;
      const last = a * b;
      const stem = `Factorise: x^2${termSign(mid, "x", true)}${termSign(last, "", true)}`;

      const correctFactor = (v) => (v > 0 ? `+${v}` : `${v}`);
      const correctCompact = `(x${correctFactor(a)})(x${correctFactor(b)})`;
      const correctSpaced = `(x ${a > 0 ? "+" : "-"} ${Math.abs(a)})(x ${b > 0 ? "+" : "-"} ${Math.abs(b)})`;
      const wrongSignCompact = `(x${correctFactor(a)})(x${correctFactor(-b)})`;

      n++;
      yield baseQuestion({
        id: `Q_FAC_C4_GEN_${String(n).padStart(3, "0")}`,
        conceptId: "FAC_C4_TRINOMIAL",
        difficulty: difficultyFromMagnitude([a, b]),
        stem,
        acceptedAnswers: [correctCompact, correctSpaced],
        misconceptionsTested: ["SIGN_HANDLING", "WRONG_FACTOR_PAIR"],
        misconceptionAnswerPatterns: [
          { misconceptionId: "SIGN_HANDLING", answers: [wrongSignCompact] },
        ],
        solutionSteps: [
          "Find two numbers whose product is the constant and whose sum is the middle coefficient.",
          `${a} and ${b}: sum=${mid}, product=${last}`,
          correctSpaced,
        ],
        hintLadder: [
          "Find a factor pair of the constant term whose sum equals the middle coefficient.",
          "Check both the product AND the sum — a pair can multiply right and still sum wrong.",
          `${correctSpaced}.`,
        ],
        prerequisiteConceptIds: ["ID_C4_TWO_BINOMIAL_IDENTITY"],
      });
    }
  }
}

function main() {
  const generated = [...genFAC_C1(), ...genFAC_C3(), ...genFAC_C4()];

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
