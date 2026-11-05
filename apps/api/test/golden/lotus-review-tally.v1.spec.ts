import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeTally, isUnexplained, tallyReviews, type ReviewResultLike } from "../../scripts/lotus-review-tally";

const r = (id: string, nature: string, over: Partial<ReviewResultLike> = {}): ReviewResultLike => ({
  id, nature, codeVerdict: "VERIFIED_INCORRECT", mistakeKind: "MISUNDERSTANDING", firstWrongStep: 1, landedSkill: "FAC_GCF_NEGATIVE", ...over,
});

describe("review tally: what the review-reading rules depend on", () => {
  it("counts an answer as unexplained exactly as foldLedger does: verified wrong, called a misunderstanding, no skill evidence", () => {
    assert.equal(isUnexplained(r("a", "CONCEPT", { firstWrongStep: null, landedSkill: null })), true);
    assert.equal(isUnexplained(r("b", "CONCEPT", { codeVerdict: "VERIFIED_UNFINISHED", firstWrongStep: null, landedSkill: null })), true);
    // not unexplained:
    assert.equal(isUnexplained(r("c", "CONCEPT")), false, "a skill got evidence");
    assert.equal(isUnexplained(r("d", "SLIP", { mistakeKind: "SLIP", firstWrongStep: null, landedSkill: null })), false, "called a slip");
    assert.equal(isUnexplained(r("e", "GUESS", { mistakeKind: "GUESS", landedSkill: null })), false, "called a guess");
    assert.equal(isUnexplained(r("f", "FORMAT", { mistakeKind: "UNREADABLE", landedSkill: null })), false, "called unreadable");
    assert.equal(isUnexplained(r("g", "CONCEPT", { codeVerdict: "NOT_DETERMINISTIC", landedSkill: null })), false, "the code couldn't read it");
    assert.equal(isUnexplained(r("h", "LUCKY_CORRECT", { codeVerdict: "VERIFIED_CORRECT", landedSkill: null })), false, "a right answer");
  });

  it("tallies real gaps, slips and guesses separately", () => {
    const t = tallyReviews([
      r("c1", "CONCEPT"), r("c2", "CONCEPT", { firstWrongStep: null, landedSkill: null }), r("c3", "CONCEPT", { mistakeKind: "SLIP", landedSkill: null, firstWrongStep: null }),
      r("s1", "SLIP", { mistakeKind: "SLIP", firstWrongStep: null, landedSkill: null }),
      r("s2", "SLIP"), // a slip the review blamed on a skill
      r("s3", "FORMAT", { firstWrongStep: null, landedSkill: null }), // would keep a solid child's test open
      r("s4", "FORMAT", { mistakeKind: "UNREADABLE", firstWrongStep: null, landedSkill: null }),
      r("g1", "GUESS", { mistakeKind: "GUESS", landedSkill: "FAC_GCF_NEGATIVE" }), r("g2", "GUESS"),
      r("o1", "LUCKY_CORRECT", { codeVerdict: "VERIFIED_CORRECT", mistakeKind: null, firstWrongStep: null, landedSkill: null }),
    ]);
    assert.deepEqual(t.concept, { n: 3, namedStep: 1, gaveEvidence: 1, unexplained: 1, calledSlipOrGuess: 1 });
    assert.equal(t.slips.n, 4);
    assert.equal(t.slips.calledSlip, 1);
    assert.equal(t.slips.calledUnreadable, 1);
    assert.equal(t.slips.calledMisunderstanding, 2);
    assert.equal(t.slips.becameEvidence, 1);
    assert.deepEqual(t.slips.ids, { becameEvidence: ["s2"], unexplained: ["s3"] });
    assert.deepEqual(t.guesses, { n: 2, calledGuess: 1 });
    assert.equal(t.other.n, 1);
    assert.deepEqual(t.unexplainedIds, ["c2", "s3"]);
    assert.equal(t.unexplainedTotal, 2);
  });

  it("says each result in one plain line, and flags the slips that would keep a solid child's test open", () => {
    const lines = describeTally(tallyReviews([r("s3", "FORMAT", { firstWrongStep: null, landedSkill: null }), r("c1", "CONCEPT")]));
    assert.equal(lines.length, 5);
    assert.match(lines[0]!, /named a step in 100% \(1 of 1\)/);
    assert.match(lines[3]!, /keep a solid child's test open\): 100% \(1 of 1\) \(s3\)/);
    assert.match(describeTally(tallyReviews([]))[0]!, /n\/a/);
  });
});
