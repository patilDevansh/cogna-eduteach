/**
 * Core problem C3 (Cogna Project Hub): right answers and predicted mistakes
 * get no closer look, so the child's working is ignored there.
 *
 * Each probe states what the product SHOULD do and fails while C3 is open.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import { instantVerdict } from "../../src/lotus/lotus-factorisation";

const trinomial: LotusQuestion = {
  id: "probe-c3",
  phase: "DIAGNOSE",
  subtopic: "Trinomials",
  prompt: "Factorise completely: x^2 - 9x + 20",
  type: "CONSTRUCTED_RESPONSE",
  asksForWorking: true,
  purpose: "probe",
  answerKey: {
    kind: "OPEN_RESPONSE",
    canonicalAnswer: "(x - 4)(x - 5)",
    workedSolution: ["-4 × -5 = 20 and -4 + -5 = -9", "(x - 4)(x - 5)"],
    diagnostics: {
      itemKind: "FACTORISE",
      expression: "x^2 - 9x + 20",
      skillId: "FAC_MONIC_TRINOMIAL",
      taggedSkills: ["FAC_PAIR_PRODUCT_SUM"],
      stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"],
      predictedMistakes: [
        { answer: "(x + 4)(x + 5)", mistake: "SIGN_PAIR_ERROR" },
        { answer: "(x - 2)(x - 10)", mistake: "WRONG_FACTOR_PAIR_SUM" },
      ],
      origin: "AI",
    },
  },
} as unknown as LotusQuestion;

const respond = (answer: string, working: string): LotusStudentResponse => ({
  answer, working, confidence: 60, responseTimeMs: 40_000, didNotKnow: false,
});

const expansion = {
  id: "probe-c3-expand",
  answerKey: {
    canonicalAnswer: "x^2 - 2x - 15",
    workedSolution: ["x·x + x·(-5) + 3·x + 3·(-5)", "x^2 - 5x + 3x - 15", "x^2 - 2x - 15"],
    diagnostics: { itemKind: "EXPAND", expression: "(x + 3)(x - 5)", skillId: "EXP_EXPAND_BINOMIALS", taggedSkills: [], stepSkills: ["EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS", "EXP_EXPAND_BINOMIALS"], predictedMistakes: [], origin: "AI" },
  },
} as unknown as LotusQuestion;

describe("C3: the working gets a closer look when it doesn't fit the answer", () => {
  it("two mistakes that cancel out still send a right answer for review", () => {
    // Step 2 gets the sign of 3x wrong (-3x), step 3 combines -5x - 3x as -2x:
    // two errors that cancel to the right answer.
    const verdict = instantVerdict(expansion, respond("x^2 - 2x - 15", "x^2 - 5x - 3x - 15\nx^2 - 2x - 15"));
    assert.equal(verdict.verification?.status, "VERIFIED_CORRECT");
    assert.ok(verdict.needsAnalysis, "a working line isn't equal to (x + 3)(x - 5), yet no review was requested");
    assert.ok(!verdict.evidence.some((e) => e.kind === "SECURE"), "the skill shouldn't be marked secure before the review");
  });

  it("a right answer with sound working stays secure with no review", () => {
    const verdict = instantVerdict(expansion, respond("x^2 - 2x - 15", "x^2 - 5x + 3x - 15\nx^2 - 2x - 15"));
    assert.equal(verdict.needsAnalysis, false);
    assert.ok(verdict.evidence.some((e) => e.kind === "SECURE"));
  });

  it("a right answer reached by wrong working is sent for review", () => {
    // Right final answer, but the working adds where it should multiply:
    // 4 + 5 = 20 is false. A lucky answer like this is not secure evidence.
    const verdict = instantVerdict(trinomial, respond("(x - 4)(x - 5)", "4 + 5 = 20 and 4 × 5 = 9\n(x - 4)(x - 5)"));
    assert.equal(verdict.verification?.status, "VERIFIED_CORRECT", "code still marks the answer right");
    assert.ok(verdict.needsAnalysis,
      "the working contradicts the answer, but no AI review was requested and every skill was marked secure: " +
      JSON.stringify(verdict.evidence.map((e) => `${e.skillId}:${e.kind}`)));
  });

  it("a predicted mistake whose working shows a different cause is sent for review", () => {
    // Matches the predicted SIGN_PAIR_ERROR answer, but the working shows the
    // child found -4 and -5 correctly and only miscopied the signs at the end:
    // a transcription slip, not a sign-pair misconception.
    const verdict = instantVerdict(trinomial, respond("(x + 4)(x + 5)", "-4 × -5 = 20, -4 + -5 = -9\n(x + 4)(x + 5)"));
    assert.ok(verdict.needsAnalysis,
      "the working shows the right pair, so the predicted label may be wrong, but no AI review was requested; recorded as " +
      JSON.stringify(verdict.evidence.map((e) => e.mistake ?? e.kind)));
  });
});
