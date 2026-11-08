import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusDebateClosure, LotusQuestion } from "@cogna/shared";
import { aiOnlyAnalysis, aiOnlyEvidence, aiOnlyInstant, aiJudgedVerification, isAiOnlyUnmarked, withoutCodeReadings } from "../../src/lotus/lotus-ai-only";
import { singleReviewPrompt } from "../../src/lotus/lotus-prompts";

const q: LotusQuestion = {
  id: "q1", phase: "DIAGNOSE", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
  prompt: "Factorise completely: 8x^2y + 12x", purpose: "",
  answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "4x(2xy + 3)", workedSolution: ["Find 4x", "Divide each term"],
    diagnostics: { itemKind: "FACTORISE", expression: "8x^2y + 12x", skillId: "FAC_COMMON_MONOMIAL", taggedSkills: [], stepSkills: ["FAC_GCF_VARIABLE", "FAC_DIVIDE_TERMS"], level: "medium", origin: "AI", predictedMistakes: [] } },
};
const closure = (over: Partial<LotusDebateClosure>): LotusDebateClosure => ({
  verdict: "ACCEPTED", acceptedFromGpt: [], acceptedFromChallenger: [], rejectedClaims: [], conclusion: "x", evidenceState: "PARTIAL",
  uncertainty: [], phase: "DIAGNOSE", action: "ASK", selectionReason: "", exitDiagnostic: false, ...over,
});

describe("Lotus AI-only analysis experiment", () => {
  it("is off unless switched on", () => {
    assert.equal(aiOnlyAnalysis({}), false);
    assert.equal(aiOnlyAnalysis({ LOTUS_AI_ONLY_ANALYSIS: "true" }), true);
  });
  it("submit records no code verdict and no evidence, and always asks for a review", () => {
    const v = aiOnlyInstant(q);
    assert.equal(v.verification.status, "NOT_DETERMINISTIC");
    assert.equal(isAiOnlyUnmarked(v.verification), true);
    assert.deepEqual(v.evidence, []);
    assert.equal(v.needsAnalysis, true);
  });
  it("code's play readings are removed before the review", () => {
    const r = withoutCodeReadings({ answer: "a", working: "", responseTimeMs: 1, didNotKnow: false, gameReading: { kind: "SPLIT_CONFIDENCE" } as never, typingReading: { kind: "EDIT_HISTORY" } as never });
    assert.equal("gameReading" in r, false);
    assert.equal("typingReading" in r, false);
  });
  it("the AI's marking replaces code's", () => {
    assert.equal(aiJudgedVerification(q, closure({ answerJudgment: "INCORRECT", answerJudgmentReason: "12 not divided" })).status, "VERIFIED_INCORRECT");
    assert.equal(aiJudgedVerification(q, closure({ answerJudgment: "CORRECT" })).status, "VERIFIED_CORRECT");
    assert.equal(aiJudgedVerification(q, closure({ answerJudgment: "UNCLEAR" })).status, "NOT_DETERMINISTIC");
  });
  it("a wrong step blames that step's skill; a wrong answer with no step still blames the question's skill", () => {
    assert.equal(aiOnlyEvidence(q, closure({ answerJudgment: "INCORRECT", firstWrongStep: 2, mistakeDescription: "12 not divided", mistakeKind: "MISUNDERSTANDING" }))[0]?.skillId, "FAC_DIVIDE_TERMS");
    const noStep = aiOnlyEvidence(q, closure({ answerJudgment: "INCORRECT", firstWrongStep: null, mistakeDescription: "wrong", mistakeKind: "MISUNDERSTANDING" }));
    assert.deepEqual(noStep.map((e) => [e.kind, e.skillId]), [["MISTAKE", "FAC_COMMON_MONOMIAL"]]);
  });
  it("right with a doubt the AI read is a doubt, never a mistake", () => {
    const e = aiOnlyEvidence(q, closure({ answerJudgment: "CORRECT", firstWrongStep: 2, mistakeDescription: "one chip on the undivided answer" }));
    const doubt = e.find((x) => x.skillId === "FAC_DIVIDE_TERMS");
    assert.equal(doubt?.kind, "UNFINISHED");
    assert.ok(doubt?.hedge);
    assert.ok(!e.some((x) => x.kind === "MISTAKE"));
  });
  it("the review prompt asks for the AI's own marking only in this mode", () => {
    const args = { audits: [], currentQuestion: q, currentResponse: { answer: "4x(2xy + 12)", working: "", responseTimeMs: 1, didNotKnow: false },
      currentVerification: aiOnlyInstant(q).verification, elapsedSeconds: 1, answeredCount: 0, phase: "DIAGNOSE" as const };
    const before = process.env.LOTUS_AI_ONLY_ANALYSIS;
    process.env.LOTUS_AI_ONLY_ANALYSIS = "true";
    assert.match(singleReviewPrompt(args), /"answerJudgment"/);
    delete process.env.LOTUS_AI_ONLY_ANALYSIS;
    assert.doesNotMatch(singleReviewPrompt(args), /answerJudgment/);
    if (before !== undefined) process.env.LOTUS_AI_ONLY_ANALYSIS = before;
  });
});
