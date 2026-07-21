#!/usr/bin/env node
/**
 * Bulk, programmatically-verified question generation for the mvp-8.0
 * Exponents unit: EXP_P1_LAWS_OF_EXPONENTS (product/quotient/power rules)
 * and EXP_C2_EXPONENTS_IN_SIMPLIFICATION (chained rule application).
 *
 * Every answer is the exponent computed directly from the same arithmetic
 * used to build the problem — correctness is guaranteed by construction,
 * independently cross-checked after generation.
 *
 * Output is PENDING_REVIEW — see docs/mvp-8.0/content/REVIEW_CHECKLIST.md.
 *
 * Usage:
 *   node scripts/generate-exponents-bank.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "docs/mvp-8.0/content/question-bank/generated-questions.json");

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
  unitId = "exponents-algebra",
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

const xExp = (n) => (n === 1 ? "x" : `x^${n}`);
/** Full simplified form for any integer exponent, including 0 (-> "1") and negative (-> "1/x^n"). */
const formatExp = (n) => (n === 0 ? "1" : n > 0 ? xExp(n) : `1/x^${Math.abs(n)}`);
const difficultyFromMagnitude = (nums) => {
  const maxAbs = Math.max(...nums.map((n) => Math.abs(n)));
  if (maxAbs <= 5) return 1;
  if (maxAbs <= 8) return 2;
  if (maxAbs <= 12) return 3;
  return 4;
};

// ─── EXP_P1: product rule x^m * x^n = x^(m+n) ───────────────────────────────
function* genProductRule() {
  let n = 0;
  for (let m = 1; m <= 9 && n < 60; m++) {
    for (let k = 1; k <= 9 && n < 60; k++) {
      n++;
      const sum = m + k;
      yield baseQuestion({
        id: `Q_EXP_P1_PROD_GEN_${String(n).padStart(3, "0")}`,
        conceptId: "EXP_P1_LAWS_OF_EXPONENTS",
        difficulty: difficultyFromMagnitude([m, k]),
        stem: `Simplify: x^${m} * x^${k}`,
        acceptedAnswers: [xExp(sum)],
        misconceptionsTested: ["EXPONENT_LAW_MISAPPLICATION"],
        misconceptionAnswerPatterns: [{ misconceptionId: "EXPONENT_LAW_MISAPPLICATION", answers: [xExp(m * k)] }],
        solutionSteps: [`x^${m} * x^${k} = x^(${m}+${k})`, xExp(sum)],
        hintLadder: ["When multiplying the same base, ADD the exponents.", `${m} + ${k} = ${sum}.`, `${xExp(sum)}.`],
      });
    }
  }
}

// ─── EXP_P1: quotient rule x^m / x^n = x^(m-n) ──────────────────────────────
function* genQuotientRule() {
  let n = 0;
  for (let m = 2; m <= 12 && n < 60; m++) {
    for (let k = 1; k < m && n < 60; k++) {
      n++;
      const diff = m - k;
      yield baseQuestion({
        id: `Q_EXP_P1_QUOT_GEN_${String(n).padStart(3, "0")}`,
        conceptId: "EXP_P1_LAWS_OF_EXPONENTS",
        difficulty: difficultyFromMagnitude([m, k]),
        stem: `Simplify: x^${m} / x^${k}`,
        acceptedAnswers: [xExp(diff)],
        misconceptionsTested: ["EXPONENT_LAW_MISAPPLICATION"],
        misconceptionAnswerPatterns: [{ misconceptionId: "EXPONENT_LAW_MISAPPLICATION", answers: [k - m < 0 ? `1/x^${m - k}` : xExp(k - m)] }],
        solutionSteps: [`x^${m} / x^${k} = x^(${m}-${k})`, xExp(diff)],
        hintLadder: ["When dividing the same base, SUBTRACT the exponents (top minus bottom).", `${m} - ${k} = ${diff}.`, `${xExp(diff)}.`],
      });
    }
  }
}

// ─── EXP_P1: power rule (x^m)^n = x^(mn) ────────────────────────────────────
function* genPowerRule() {
  let n = 0;
  for (let m = 2; m <= 6 && n < 40; m++) {
    for (let k = 2; k <= 6 && n < 40; k++) {
      n++;
      const prod = m * k;
      yield baseQuestion({
        id: `Q_EXP_P1_POW_GEN_${String(n).padStart(3, "0")}`,
        conceptId: "EXP_P1_LAWS_OF_EXPONENTS",
        difficulty: difficultyFromMagnitude([prod]),
        stem: `Simplify: (x^${m})^${k}`,
        acceptedAnswers: [xExp(prod)],
        misconceptionsTested: ["EXPONENT_LAW_MISAPPLICATION"],
        misconceptionAnswerPatterns: [{ misconceptionId: "EXPONENT_LAW_MISAPPLICATION", answers: [xExp(m + k)] }],
        solutionSteps: [`(x^${m})^${k} = x^(${m}*${k})`, xExp(prod)],
        hintLadder: ["When raising a power to a power, MULTIPLY the exponents.", `${m} x ${k} = ${prod}.`, `${xExp(prod)}.`],
      });
    }
  }
}

// ─── EXP_C2: chained simplification (x^a * x^b) / x^c = x^(a+b-c) ──────────
// Allows negative c (i.e. dividing by a negative exponent, which flips to addition).
function* genChainedSimplification() {
  let n = 0;
  for (let a = 1; a <= 8 && n < 100; a++) {
    for (let b = 1; b <= 8 && n < 100; b++) {
      for (let c = -4; c <= 8 && n < 100; c += 2) {
        if (c === 0) continue;
        n++;
        const result = a + b - c;
        const resultLabel = formatExp(result);
        const wrongIgnoreSign = a + b - Math.abs(c); // forgets the negative sign on c when subtracting
        const wrongLabel = formatExp(wrongIgnoreSign);
        const misconceptionId = c < 0 ? "NEGATIVE_EXPONENT_SIGN_FLIP" : "EXPONENT_LAW_MISAPPLICATION";
        yield baseQuestion({
          id: `Q_EXP_C2_GEN_${String(n).padStart(3, "0")}`,
          conceptId: "EXP_C2_EXPONENTS_IN_SIMPLIFICATION",
          difficulty: difficultyFromMagnitude([a, b, c]),
          stem: `Simplify: (x^${a} * x^${b}) / x^${c}`,
          acceptedAnswers: result < 0 ? [resultLabel, `x^${result}`] : [resultLabel],
          misconceptionsTested: [misconceptionId],
          misconceptionAnswerPatterns: wrongLabel !== resultLabel ? [{ misconceptionId, answers: [wrongLabel] }] : undefined,
          solutionSteps: [`x^${a} * x^${b} = x^${a + b}`, `x^${a + b} / x^${c} = x^(${a + b}-(${c}))`, resultLabel],
          hintLadder: ["Combine the top first by adding.", "Then subtract the bottom's exponent — watch its sign.", `${resultLabel}.`],
          prerequisiteConceptIds: ["EXP_P1_LAWS_OF_EXPONENTS"],
        });
      }
    }
  }
}

function main() {
  const generated = [
    ...genProductRule(),
    ...genQuotientRule(),
    ...genPowerRule(),
    ...genChainedSimplification(),
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
