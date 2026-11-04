/**
 * Evidence rules decided Oct 25 (Cogna Project Hub, scenario map):
 *  1. One right multiple-choice tap isn't enough to call a skill secure
 *     (a 1-in-4 guess could land on it): two right taps or one right typed
 *     answer are needed.
 *  2. One cause, many gaps: when the same sign mistake confirms several
 *     gaps, the report names signs with negative numbers as the start.
 *  3. Not trying: when most answers are very fast and wrong, the report
 *     says the test doesn't tell us much and gives no gap to teach.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { buildFactorisationReport, foldLedger } from "../../src/lotus/lotus-factorisation";

type Ev = { skillId: string; kind: "SECURE" | "MISTAKE"; mistake?: string };
const turn = (itemKind: string, headline: string, evidence: Ev[], answer?: { ms: number; correct: boolean }) => ({
  question: { answerKey: { diagnostics: { itemKind, skillId: headline, predictedMistakes: evidence.filter((e) => e.mistake).map((e) => ({ answer: "?", mistake: e.mistake })) } } },
  skillEvidence: evidence.map((e) => ({ ...e, source: "INSTANT" })),
  response: { answer: "?", working: "", confidence: 50, responseTimeMs: answer?.ms ?? 30_000, didNotKnow: false },
  verification: { status: answer ? (answer.correct ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT") : "VERIFIED_CORRECT", correctAnswer: "?", method: "DETERMINISTIC_ALGEBRA", explanation: "" },
}) as unknown as LotusQuestionAudit;
const state = { topic: "FACTORISATION", turns: [], fastSkips: 0 } as never;
const report = (audits: LotusQuestionAudit[]) =>
  (buildFactorisationReport as (a: unknown) => ReturnType<typeof buildFactorisationReport>)({ ledger: foldLedger(audits), state, pendingAnalyses: 0, audits });

describe("1. Multiple-choice taps", () => {
  it("one right tap leaves the skill short of secure", () => {
    const e = foldLedger([turn("CHOICE", "FAC_CHOOSE_METHOD", [{ skillId: "FAC_CHOOSE_METHOD", kind: "SECURE" }])]).get("FAC_CHOOSE_METHOD");
    assert.notEqual(e?.state, "SECURE");
  });
  it("two right taps, or one right typed answer, make it secure", () => {
    const tap = turn("CHOICE", "FAC_MEANING", [{ skillId: "FAC_MEANING", kind: "SECURE" }]);
    assert.equal(foldLedger([tap, tap]).get("FAC_MEANING")?.state, "SECURE");
    assert.equal(foldLedger([turn("FACTORISE", "FAC_DIVIDE_TERMS", [{ skillId: "FAC_DIVIDE_TERMS", kind: "SECURE" }])]).get("FAC_DIVIDE_TERMS")?.state, "SECURE");
  });
  it("the report says a single tap isn't enough yet", () => {
    const r = report([turn("CHOICE", "FAC_CHOOSE_METHOD", [{ skillId: "FAC_CHOOSE_METHOD", kind: "SECURE" }])]);
    assert.ok(r.uncertainAreas.some((u) => /choos/i.test(u) && /multiple-choice/i.test(u)), JSON.stringify(r.uncertainAreas));
  });
});

describe("2. One cause, many gaps", () => {
  it("sign mistakes confirming three gaps make signs the starting point", () => {
    const sign = (skillId: string, mistake: string) => turn("FACTORISE", skillId, [{ skillId, kind: "MISTAKE", mistake }]);
    const r = report([
      sign("FAC_GCF_NEGATIVE", "KEPT_ORIGINAL_SIGNS"), sign("FAC_GCF_NEGATIVE", "KEPT_ORIGINAL_SIGNS"),
      sign("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR"), sign("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR"),
      sign("FAC_GROUP_SIGN", "SIGN_NOT_FLIPPED_IN_GROUP"), sign("FAC_GROUP_SIGN", "SIGN_NOT_FLIPPED_IN_GROUP"),
    ]);
    assert.equal(r.outcome, "SOLID_GAP");
    assert.match(r.startingPoint, /sign/i, r.startingPoint);
    assert.match(r.startingPoint, /negative/i);
  });
});

describe("3. Not trying", () => {
  it("mostly very fast wrong answers give no gap to teach", () => {
    const fastWrong = (skillId: string) => turn("FACTORISE", skillId, [{ skillId, kind: "MISTAKE", mistake: "DIVIDED_FIRST_TERM_ONLY" }], { ms: 2_000, correct: false });
    const audits = Array.from({ length: 10 }, (_, i) => fastWrong(i % 2 ? "FAC_DIVIDE_TERMS" : "FAC_GCF_NUMERIC"));
    const r = report(audits);
    assert.equal(r.outcome, "INSUFFICIENT_OR_CONFLICTING", "a gap from rushed answers must not be taught");
    assert.match(r.startingPoint, /fast/i, r.startingPoint);
  });
  it("a careful child with real mistakes still gets a gap", () => {
    const slowWrong = turn("FACTORISE", "FAC_DIVIDE_TERMS", [{ skillId: "FAC_DIVIDE_TERMS", kind: "MISTAKE", mistake: "DIVIDED_FIRST_TERM_ONLY" }], { ms: 40_000, correct: false });
    const right = turn("FACTORISE", "FAC_GCF_NUMERIC", [{ skillId: "FAC_GCF_NUMERIC", kind: "SECURE" }], { ms: 30_000, correct: true });
    assert.equal(report([slowWrong, right, slowWrong, right, right, right, right, right]).outcome, "SOLID_GAP");
  });
});
