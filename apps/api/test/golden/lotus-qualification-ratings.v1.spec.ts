/**
 * Qualification gate: every factorisation microskill is checked against the
 * exact Sarah 1–5 rating contract.  These are persona truth cells, not a
 * claim that one 15-question session has sampled every skill.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { calculateSkillRating, type SkillLedgerEntry } from "../../src/lotus/lotus-factorisation";
import {
  LOTUS_QUALIFICATION_MICROSKILL_COUNT,
  LOTUS_QUALIFICATION_ORACLE_VERSION,
  LOTUS_QUALIFICATION_RATING_MATRIX,
  type QualificationRatingCell,
} from "../fixtures/lotus-qualification-oracle";

function audit(skillId: string, responseTimeMs: number, kind: "SECURE" | "MISTAKE"): LotusQuestionAudit {
  return {
    question: {
      id: `${skillId}-${responseTimeMs}-${kind}`,
      phase: "DIAGNOSTIC",
      subtopic: skillId,
      prompt: `Qualification evidence for ${skillId}`,
      type: "CONSTRUCTED_RESPONSE",
      asksForWorking: true,
      purpose: "EVIDENCE",
      // Distinct expressions are material: two copies of the same item are
      // not independent evidence for Fluent/Mastery.
      answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "x", workedSolution: ["working"], diagnostics: { slot: 1, itemKind: "FACTORISE", expression: `x + ${responseTimeMs}`, skillId, level: "medium", origin: "CODE" } },
    },
    response: { answer: kind === "SECURE" ? "x" : "wrong", didNotKnow: false, responseTimeMs },
    verification: { status: kind === "SECURE" ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT", score: kind === "SECURE" ? 1 : 0 },
    skillEvidence: [{ skillId, kind }],
  };
}

function evidenceFor(cell: QualificationRatingCell): { entry: SkillLedgerEntry; audits: LotusQuestionAudit[] } {
  const clean = (responseTimeMs: number) => ({
    entry: { skillId: cell.skillId, state: "SECURE", mistakes: [], notes: ["clean one", "clean two"], sightings: [] } as SkillLedgerEntry,
    audits: [audit(cell.skillId, responseTimeMs, "SECURE"), audit(cell.skillId, responseTimeMs + 1, "SECURE")],
  });
  switch (cell.pattern) {
    case "SLOW_CLEAN": return clean(31_000);
    case "FLUENT_CLEAN": return clean(20_000);
    case "FAST_MASTERY": return clean(10_000);
    case "REPEATED_GAP": return {
      entry: { skillId: cell.skillId, state: "CONFIRMED", confirmedAt: 2, mistakes: ["QUALIFICATION_MISTAKE_A", "QUALIFICATION_MISTAKE_B"], notes: ["first independent mistake", "second independent mistake"], sightings: [{ q: 1, mistake: "QUALIFICATION_MISTAKE_A", how: "mistake" }, { q: 2, mistake: "QUALIFICATION_MISTAKE_B", how: "mistake" }] },
      audits: [audit(cell.skillId, 20_000, "MISTAKE"), audit(cell.skillId, 20_001, "MISTAKE")],
    };
    case "NO_DIRECT_EVIDENCE": return { entry: { skillId: cell.skillId, state: "UNTESTED", mistakes: [], notes: [] }, audits: [] };
  }
}

describe(`Lotus qualification rating matrix (${LOTUS_QUALIFICATION_ORACLE_VERSION})`, () => {
  it("contains every current factorisation microskill exactly five times", () => {
    assert.equal(LOTUS_QUALIFICATION_MICROSKILL_COUNT, 38);
    assert.equal(LOTUS_QUALIFICATION_RATING_MATRIX.length, 190);
    for (const skillId of new Set(LOTUS_QUALIFICATION_RATING_MATRIX.map((cell) => cell.skillId))) {
      assert.equal(LOTUS_QUALIFICATION_RATING_MATRIX.filter((cell) => cell.skillId === skillId).length, 5, `${skillId} must keep its five evidence personas`);
    }
  });

  for (const cell of LOTUS_QUALIFICATION_RATING_MATRIX) {
    it(cell.id, () => {
      const { entry, audits } = evidenceFor(cell);
      const actual = calculateSkillRating(entry, audits);
      if (cell.expectedRating === undefined) {
        assert.equal(actual, undefined, `${cell.skillId}: no direct evidence must not become a numeric rating`);
      } else {
        assert.deepEqual(actual, { rating: cell.expectedRating, ratingStatus: cell.expectedStatus });
      }
    });
  }
});
