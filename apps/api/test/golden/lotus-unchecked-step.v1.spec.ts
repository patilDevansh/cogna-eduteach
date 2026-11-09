// DATA-025: a gap is not confirmed when every miss also needed a skill this test never checked.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { foldLedger } from "../../src/lotus/lotus-factorisation";

const FULLY = "FAC_FACTOR_FULLY";
const SQUARES = "FAC_DIFF_SQUARES";
function audit(skillId: string, stepSkills: string[], right: boolean, mistake?: string): LotusQuestionAudit {
  return {
    question: { id: `q-${skillId}-${right}`, type: "CONSTRUCTED_RESPONSE", answerKey: { diagnostics: { skillId, itemKind: "FACTORISE", level: "medium", slot: 1, taggedSkills: [], stepSkills, predictedMistakes: [] } } },
    response: { answer: right ? "right" : "wrong", didNotKnow: false },
    verification: { status: right ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT" },
    skillEvidence: [{ skillId, kind: right ? "SECURE" : "MISTAKE", mistake, source: right ? "INSTANT" : "ANALYSIS" }],
  } as unknown as LotusQuestionAudit;
}
// 5x² − 20 written as 5(x² − 4), then x⁴ − 81 left as (x² + 9)(x² − 9): both need a difference of squares.
const missA = audit(FULLY, [SQUARES], false, "INCOMPLETE_FACTORISATION");
const missB = audit(FULLY, [SQUARES], false, "INCOMPLETE_FACTORISATION");

describe("a miss that needed an unchecked skill does not confirm a gap", () => {
  it("H20: difference of squares never asked, so factorising fully stays suspected and says why", () => {
    const e = foldLedger([missA, missB]).get(FULLY)!;
    assert.equal(e.state, "SUSPECTED");
    assert.equal(e.explainedBy, SQUARES);
    assert.equal(e.explainedByUnchecked, true);
    assert.match(e.notes.at(-1)!, /never checked/);
  });
  it("difference of squares shown secure: the misses are factorising fully's own, so it is confirmed", () => {
    const e = foldLedger([audit(SQUARES, [], true), missA, missB]).get(FULLY)!;
    assert.equal(e.state, "CONFIRMED");
    assert.equal(e.explainedBy, undefined);
  });
  it("one miss that needed nothing unchecked keeps the gap confirmed", () => {
    assert.equal(foldLedger([missA, audit(FULLY, [], false, "INCOMPLETE_FACTORISATION")]).get(FULLY)!.state, "CONFIRMED");
  });
});
