/**
 * Scenario map (Oct 25), two free checks:
 *  - Tired halfway: careful and right for the first half, then fast and
 *    wrong. Gaps confirmed only by the late rushed answers shouldn't be
 *    taught as real gaps without a warning.
 *  - A mistake that only shows sometimes: right on x² − 49, wrong on
 *    81a² − 16b² (didn't root the coefficient). A later x² − 49 can't show
 *    that mistake, so it mustn't clear it (the C6 rule).
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { buildFactorisationReport, foldLedger } from "../../src/lotus/lotus-factorisation";

type Ev = { skillId: string; kind: "SECURE" | "MISTAKE"; mistake?: string };
const turn = (skillId: string, evidence: Ev[], ms: number, correct: boolean, predicted: string[] = []) => ({
  question: { answerKey: { diagnostics: { itemKind: "FACTORISE", skillId, predictedMistakes: predicted.map((mistake) => ({ answer: "?", mistake })) } } },
  skillEvidence: evidence.map((e) => ({ ...e, source: "INSTANT" })),
  response: { answer: "?", working: "", confidence: 50, responseTimeMs: ms, didNotKnow: false },
  verification: { status: correct ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT", correctAnswer: "?", method: "DETERMINISTIC_ALGEBRA", explanation: "" },
}) as unknown as LotusQuestionAudit;
const state = { topic: "FACTORISATION", turns: [], fastSkips: 0 } as never;

describe("Tired halfway", () => {
  it("gaps confirmed only by late rushed answers come with a warning, not a lesson", () => {
    const careful = ["FAC_GCF_NUMERIC", "FAC_GCF_VARIABLE", "FAC_DIVIDE_TERMS", "FAC_COMMON_MONOMIAL", "FAC_COMMON_BINOMIAL", "FAC_GROUP_TERMS", "FAC_DIFF_SQUARES", "FAC_PERFECT_SQUARE_PLUS"]
      .map((s) => turn(s, [{ skillId: s, kind: "SECURE" }], 35_000, true));
    const rushedWrong = (s: string, m: string) => turn(s, [{ skillId: s, kind: "MISTAKE", mistake: m }], 3_000, false, [m]);
    const audits = [
      ...careful,
      rushedWrong("FAC_MONIC_TRINOMIAL", "WRONG_FACTOR_PAIR_SUM"), rushedWrong("FAC_MONIC_TRINOMIAL", "WRONG_FACTOR_PAIR_SUM"),
      rushedWrong("FAC_FACTOR_FULLY", "INCOMPLETE_FACTORISATION"), rushedWrong("FAC_FACTOR_FULLY", "INCOMPLETE_FACTORISATION"),
      rushedWrong("FAC_CANCEL_COMMON_FACTOR", "CANCELLED_TERMS_NOT_FACTORS"),
    ];
    const report = (buildFactorisationReport as (a: unknown) => ReturnType<typeof buildFactorisationReport>)({ ledger: foldLedger(audits), state, pendingAnalyses: 0, audits });
    const warned = [...report.limitations, ...report.uncertainAreas, report.startingPoint].some((t) => /tired|faster|rush/i.test(t));
    assert.ok(warned, "the answers got much faster and wrong after question 8, but the report doesn't say so");
    assert.notEqual(report.outcome, "SOLID_GAP", `taught as a solid gap: ${report.startingPoint}`);
  });
});

describe("A mistake that only shows sometimes", () => {
  it("right on x² − 49 doesn't clear a coefficient mistake seen on 81a² − 16b²", () => {
    const ds = (kind: "SECURE" | "MISTAKE", predicted: string[], mistake?: string) =>
      turn("FAC_DIFF_SQUARES", [{ skillId: "FAC_DIFF_SQUARES", kind, ...(mistake ? { mistake } : {}) }], 30_000, kind === "SECURE", predicted);
    const ledger = foldLedger([
      ds("SECURE", ["WROTE_PERFECT_SQUARE", "DROPPED_SQUARE"]),                                   // x² − 49: right
      ds("MISTAKE", ["COEFFICIENT_NOT_ROOTED", "WROTE_PERFECT_SQUARE"], "COEFFICIENT_NOT_ROOTED"), // 81a² − 16b²: (81a − 16b)(81a + 16b)
      ds("SECURE", ["WROTE_PERFECT_SQUARE", "DROPPED_SQUARE"]),                                   // another x² − c²: right, can't show it
    ]);
    assert.equal(ledger.get("FAC_DIFF_SQUARES")?.state, "SUSPECTED");
  });

  it("wrong again on a coefficient question confirms it", () => {
    const ds = (kind: "SECURE" | "MISTAKE", predicted: string[], mistake?: string) =>
      turn("FAC_DIFF_SQUARES", [{ skillId: "FAC_DIFF_SQUARES", kind, ...(mistake ? { mistake } : {}) }], 30_000, kind === "SECURE", predicted);
    const ledger = foldLedger([
      ds("SECURE", ["WROTE_PERFECT_SQUARE"]),
      ds("MISTAKE", ["COEFFICIENT_NOT_ROOTED"], "COEFFICIENT_NOT_ROOTED"),
      ds("MISTAKE", ["COEFFICIENT_NOT_ROOTED"], "COEFFICIENT_NOT_ROOTED"),
    ]);
    assert.equal(ledger.get("FAC_DIFF_SQUARES")?.state, "CONFIRMED");
  });
});
