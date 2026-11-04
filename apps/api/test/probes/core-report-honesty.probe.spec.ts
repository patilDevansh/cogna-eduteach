/**
 * Core problems C10 and the tile-game guess (Cogna Project Hub, Oct 25):
 *  - C10: slips the AI noticed vanished from the teacher's view once they
 *    stopped counting as gaps. They should be listed, never as gaps.
 *  - A two-bracket tile build offers 6 tiles, so a guess is right about
 *    1 time in 15: like a tap, one right build isn't enough for "secure".
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { buildFactorisationReport, foldLedger } from "../../src/lotus/lotus-factorisation";

const state = { topic: "FACTORISATION", turns: [], fastSkips: 0 } as never;
const report = (audits: LotusQuestionAudit[]) =>
  (buildFactorisationReport as (a: unknown) => ReturnType<typeof buildFactorisationReport>)({ ledger: foldLedger(audits), state, pendingAnalyses: 0, audits });

describe("C10: the teacher sees the slips the AI noticed", () => {
  it("a slip is listed on the report, not as a gap", () => {
    const slip = {
      question: { answerKey: { diagnostics: { itemKind: "FACTORISE", skillId: "FAC_MONIC_TRINOMIAL", predictedMistakes: [] } } },
      response: { answer: "(x - 4)(x + 5)", working: "-4 and -5", confidence: 60, responseTimeMs: 30_000, didNotKnow: false },
      verification: { status: "VERIFIED_INCORRECT", correctAnswer: "(x - 4)(x - 5)", method: "DETERMINISTIC_ALGEBRA", explanation: "" },
      analysisStatus: "COMPLETE",
      conclusion: { mistakeKind: "SLIP", firstWrongStep: 2, mistakeDescription: "After choosing -4 and -5, wrote x + 5 instead of x - 5." },
      skillEvidence: [],
    } as unknown as LotusQuestionAudit;
    const r = report([slip]);
    assert.ok(r.uncertainAreas.some((u) => /slip/i.test(u) && /Q1/.test(u)), JSON.stringify(r.uncertainAreas));
    assert.notEqual(r.outcome, "SOLID_GAP");
  });
});

describe("Tile games: a guess is right 1 time in 15", () => {
  const bridge = (correct: boolean) => ({
    question: { interaction: { format: "BRACKET_BRIDGE" }, answerKey: { diagnostics: { itemKind: "FACTORISE", skillId: "FAC_MONIC_TRINOMIAL", predictedMistakes: [] } } },
    skillEvidence: [{ skillId: "FAC_MONIC_TRINOMIAL", kind: correct ? "SECURE" : "MISTAKE", source: "INSTANT" }],
  }) as unknown as LotusQuestionAudit;
  it("one right two-bracket tile build isn't secure yet", () => {
    assert.notEqual(foldLedger([bridge(true)]).get("FAC_MONIC_TRINOMIAL")?.state, "SECURE");
  });
  it("two right builds are", () => {
    assert.equal(foldLedger([bridge(true), bridge(true)]).get("FAC_MONIC_TRINOMIAL")?.state, "SECURE");
  });
});
