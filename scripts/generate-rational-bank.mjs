#!/usr/bin/env node
/**
 * Bulk, programmatically-verified question generation for the mvp-9.0
 * Rational Expressions unit: RAT_C1_SIMPLIFYING_ALGEBRAIC_FRACTIONS.
 *
 * Builds (x+a)(x+b) as the numerator and (x+a) as the denominator — by
 * construction the fraction always cancels cleanly to (x+b). This reverses
 * the exact FAC_C4_TRINOMIAL/ID_C4_TWO_BINOMIAL_IDENTITY formula already
 * independently verified this session, so correctness carries over.
 *
 * Output is PENDING_REVIEW — see docs/mvp-9.0/content/REVIEW_CHECKLIST.md.
 *
 * Usage:
 *   node scripts/generate-rational-bank.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "docs/mvp-9.0/content/question-bank/generated-questions.json");

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
  unitId = "rational-expressions",
}) {
  const q = {
    id, conceptId, difficulty, questionIntent, type, stem, acceptedAnswers,
    misconceptionsTested, solutionSteps, hintLadder,
    reviewStatus: "PENDING_REVIEW", version: 1, itemQualityWeight: 1.0,
    prerequisiteConceptIds, unitId,
  };
  if (misconceptionAnswerPatterns) q.misconceptionAnswerPatterns = misconceptionAnswerPatterns;
  return q;
}

const factorTerm = (v) => (v > 0 ? `+${v}` : `${v}`);
const factorTermSpaced = (v) => (v > 0 ? `+ ${v}` : `- ${Math.abs(v)}`);
const difficultyFromMagnitude = (nums) => {
  const maxAbs = Math.max(...nums.map((n) => Math.abs(n)));
  if (maxAbs <= 6) return 1;
  if (maxAbs <= 10) return 2;
  if (maxAbs <= 15) return 3;
  return 4;
};

function* genRatC1() {
  let n = 0;
  for (let a = -12; a <= 12 && n < 150; a++) {
    if (a === 0) continue;
    for (let b = -12; b <= 12 && n < 150; b++) {
      if (b === 0 || b === a) continue;

      const mid = a + b;
      const last = a * b;
      const midMagnitude = Math.abs(mid) === 1 ? "" : String(Math.abs(mid));
      const midTerm = mid === 0 ? "" : mid > 0 ? ` + ${midMagnitude}x` : ` - ${midMagnitude}x`;
      const lastTerm = last >= 0 ? ` + ${last}` : ` - ${Math.abs(last)}`;
      const numeratorSpaced = `x^2${midTerm}${lastTerm}`;
      const divisorSpaced = `(x ${a > 0 ? "+" : "-"} ${Math.abs(a)})`;
      const correctCompact = `x${factorTerm(b)}`;
      const correctSpaced = `x ${factorTermSpaced(b)}`;
      const wrongUncancelled = `(x${factorTerm(a)})(x${factorTerm(b)})/(x${factorTerm(a)})`;

      n++;
      yield baseQuestion({
        id: `Q_RAT_C1_GEN_${String(n).padStart(3, "0")}`,
        conceptId: "RAT_C1_SIMPLIFYING_ALGEBRAIC_FRACTIONS",
        difficulty: difficultyFromMagnitude([a, b]),
        stem: `Simplify: (${numeratorSpaced}) / ${divisorSpaced}`,
        acceptedAnswers: [correctCompact, correctSpaced],
        misconceptionsTested: ["INCOMPLETE_FACTOR_EXTRACTION"],
        misconceptionAnswerPatterns: [
          { misconceptionId: "INCOMPLETE_FACTOR_EXTRACTION", answers: [wrongUncancelled] },
        ],
        solutionSteps: [
          `${numeratorSpaced} = (x${factorTerm(a)})(x${factorTerm(b)})`,
          `Divide by ${divisorSpaced}`,
          correctSpaced,
        ],
        hintLadder: [
          "Factor the numerator into two binomials first.",
          "One of them should match the denominator exactly — cancel it.",
          `${correctSpaced}.`,
        ],
        prerequisiteConceptIds: ["FAC_C1_COMMON_FACTOR", "RAT_P1_VARIABLES_IN_FRACTIONS"],
      });
    }
  }
}

function main() {
  const generated = [...genRatC1()];

  const seen = new Set();
  for (const q of generated) {
    if (seen.has(q.id)) throw new Error(`duplicate id ${q.id}`);
    seen.add(q.id);
  }

  writeFileSync(OUT_PATH, JSON.stringify({ questions: generated }, null, 2) + "\n");

  console.log(`Wrote ${generated.length} generated questions to ${OUT_PATH}`);
}

main();
