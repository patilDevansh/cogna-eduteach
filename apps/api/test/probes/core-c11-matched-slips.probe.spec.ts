/**
 * Core problem C11 (Cogna Project Hub): a slip that looks exactly like a
 * known wrong answer is counted instantly, without the AI seeing working that
 * already reached the right answer; and once a gap is confirmed, later
 * correct answers are hidden.
 *
 * Seen Oct 25: X01 (knows every skill) wrote (3p - 4q)(3p - 4q) after working
 * that reached (3p - 4q)(3p + 4q). Two such slips confirmed a false gap, and
 * three later correct difference-of-squares answers never reached the report.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusQuestionAudit, LotusStudentResponse } from "@cogna/shared";
import { foldLedger, instantVerdict } from "../../src/lotus/lotus-factorisation";

const diffSquares = {
  id: "probe-c11",
  answerKey: {
    canonicalAnswer: "(3p - 4q)(3p + 4q)",
    workedSolution: ["9p^2 - 16q^2 = (3p)^2 - (4q)^2", "(3p - 4q)(3p + 4q)"],
    diagnostics: {
      itemKind: "FACTORISE", expression: "9p^2 - 16q^2", skillId: "FAC_DIFF_SQUARES", taggedSkills: [], stepSkills: ["ID_REVERSE_PATTERN", "FAC_DIFF_SQUARES"],
      predictedMistakes: [{ answer: "(3p - 4q)^2", mistake: "WROTE_PERFECT_SQUARE" }, { answer: "(9p - 16q)(9p + 16q)", mistake: "COEFFICIENT_NOT_ROOTED" }],
      origin: "AI",
    },
  },
} as unknown as LotusQuestion;

const respond = (answer: string, working: string): LotusStudentResponse => ({ answer, working, confidence: 70, responseTimeMs: 20_000, didNotKnow: false });

describe("C11: a matched wrong answer after correct working goes to the AI, and later right answers stay visible", () => {
  it("working that reached the right answer stops an instant MISTAKE and asks for a review", () => {
    const verdict = instantVerdict(diffSquares, respond("(3p - 4q)(3p - 4q)", "(3p)^2 - (4q)^2\n(3p - 4q)(3p + 4q)\nso (3p - 4q)(3p - 4q)"));
    assert.equal(verdict.verification?.status, "VERIFIED_INCORRECT");
    assert.equal(verdict.evidence.length, 0, `counted instantly as ${JSON.stringify(verdict.evidence.map((e) => e.mistake))}`);
    assert.ok(verdict.needsAnalysis, "the AI review should decide whether this was a slip");
  });

  it("the same matched answer with working that never reaches the right answer still counts at once", () => {
    const verdict = instantVerdict(diffSquares, respond("(3p - 4q)(3p - 4q)", "both are squares so I wrote it as one bracket squared"));
    assert.equal(verdict.evidence[0]?.mistake, "WROTE_PERFECT_SQUARE");
    assert.equal(verdict.needsAnalysis, false);
  });

  it("right answers after a confirmed gap are recorded on it, not dropped", () => {
    const turn = (skillEvidence: unknown[]) => ({ skillEvidence }) as unknown as LotusQuestionAudit;
    const mistake = { skillId: "FAC_DIFF_SQUARES", kind: "MISTAKE", mistake: "WROTE_PERFECT_SQUARE", source: "INSTANT" };
    const right = { skillId: "FAC_DIFF_SQUARES", kind: "SECURE", source: "INSTANT" };
    const entry = foldLedger([turn([mistake]), turn([mistake]), turn([right])]).get("FAC_DIFF_SQUARES") as unknown as { state: string; rightSinceConfirmed?: number[] };
    assert.equal(entry.state, "CONFIRMED", "a confirmed gap is not silently erased");
    assert.deepEqual(entry.rightSinceConfirmed, [3], "the later right answer must be kept so the report can show it");
    // Two later right answers reopen it for a re-check: see core-recheck.probe.spec.ts.
  });
});
