/**
 * Re-check (Cogna Project Hub, decided Oct 25): when a child gets questions
 * that use a confirmed-gap skill right twice afterwards, the gap becomes
 * "needs a re-check" instead of standing as confirmed. One fresh question
 * aimed directly at the skill settles it: right clears it (the earlier
 * mistakes looked like slips), wrong confirms it again. One re-check per
 * skill, so it can't flip back and forth. Unsettled means no lesson yet.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { confirmedByDepth, foldLedger } from "../../src/lotus/lotus-factorisation";

const SKILL = "FAC_DIFF_SQUARES";
/** One answered turn: its question's headline skill, and what the answer showed for SKILL. */
const turn = (headline: string, kind: "MISTAKE" | "SECURE") =>
  ({
    question: { answerKey: { diagnostics: { skillId: headline } } },
    skillEvidence: [{ skillId: SKILL, kind, source: "INSTANT", ...(kind === "MISTAKE" ? { mistake: "WROTE_PERFECT_SQUARE" } : {}) }],
  }) as unknown as LotusQuestionAudit;

const confirmedThenRightTwice = [
  turn(SKILL, "MISTAKE"), turn(SKILL, "MISTAKE"),             // Q1, Q2: confirmed
  turn("FAC_FACTOR_FULLY", "SECURE"), turn("FAC_FACTOR_FULLY", "SECURE"), // Q3, Q4: right where the skill is one step
];
type Entry = { state: string; recheck?: boolean; clearedAfterSlip?: number };
const entryOf = (audits: LotusQuestionAudit[]) => foldLedger(audits).get(SKILL) as unknown as Entry;

describe("Re-check of a confirmed gap", () => {
  it("one later right answer leaves the gap confirmed", () => {
    assert.equal(entryOf(confirmedThenRightTwice.slice(0, 3)).state, "CONFIRMED");
  });

  it("two later right answers turn it into a re-check, not a confirmed gap", () => {
    const e = entryOf(confirmedThenRightTwice);
    assert.equal(e.state, "SUSPECTED");
    assert.equal(e.recheck, true);
    assert.equal(confirmedByDepth(foldLedger(confirmedThenRightTwice)).length, 0, "an unsettled re-check must not drive a lesson");
  });

  it("another indirect right answer doesn't settle it", () => {
    const e = entryOf([...confirmedThenRightTwice, turn("FAC_CANCEL_COMMON_FACTOR", "SECURE")]);
    assert.equal(e.state, "SUSPECTED", "only a question aimed at the skill settles a re-check");
  });

  it("right on a direct question clears it, noted as slips", () => {
    const e = entryOf([...confirmedThenRightTwice, turn(SKILL, "SECURE")]);
    assert.equal(e.state, "SECURE");
    assert.ok(e.clearedAfterSlip, "the report should say the earlier mistakes looked like slips");
  });

  it("wrong on the re-check confirms it again, and it never re-checks twice", () => {
    const reconfirmed = [...confirmedThenRightTwice, turn(SKILL, "MISTAKE")];
    assert.equal(entryOf(reconfirmed).state, "CONFIRMED");
    const later = [...reconfirmed, turn("FAC_FACTOR_FULLY", "SECURE"), turn("FAC_FACTOR_FULLY", "SECURE")];
    assert.equal(entryOf(later).state, "CONFIRMED", "a skill gets one re-check, then the evidence stands");
  });
});
