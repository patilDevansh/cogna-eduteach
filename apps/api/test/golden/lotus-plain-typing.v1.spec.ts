import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusQuestionAudit, LotusStudentResponse } from "@cogna/shared";
import { resolveLotusResponse } from "../../src/lotus/lotus-interactions";
import { foldLedger, instantVerdict } from "../../src/lotus/lotus-factorisation";

// An ordinary typed question, with no game: 6x + 36 = 6(x + 6); 6(x + 36) is dividing only the first term.
function typed(id: string): LotusQuestion {
  const expression = "6x + 36";
  return { id, phase: "DIAGNOSE", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "6(x + 6)", workedSolution: ["Take out 6"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: "FAC_DIVIDE_TERMS", taggedSkills: ["FAC_GCF_NUMERIC"], stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS"], level: "easy", origin: "AI",
        predictedMistakes: [{ answer: "6(x + 36)", mistake: "DIVIDED_FIRST_TERM_ONLY" }] } } };
}
// "How many terms": a number answer, not a factorisation.
function count(id: string): LotusQuestion {
  return { id, phase: "EXPLORE", subtopic: "Terms", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: "How many terms does 6(x + 5) have?", purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "1", workedSolution: ["A product is one term"],
      diagnostics: { itemKind: "NUMBER", expression: "6(x + 5)", skillId: "FAC_TERMS", taggedSkills: [], stepSkills: ["FAC_TERMS"], level: "easy", origin: "AI",
        predictedMistakes: [{ answer: "2", mistake: "COUNTED_INSIDE_BRACKET" }] } } };
}
const send = (q: LotusQuestion, answer: string, typing?: unknown, extra: Partial<LotusStudentResponse> = {}) =>
  resolveLotusResponse(q, { answer, working: "", confidence: 70, responseTimeMs: 20000, didNotKnow: false, ...(typing !== undefined ? { typing } : {}), ...extra } as LotusStudentResponse);
const audit = (q: LotusQuestion, r: LotusStudentResponse): LotusQuestionAudit => {
  const v = instantVerdict(q, r);
  return { question: q, response: r, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;
};
const caught = [{ t: 3000, v: "6(x + 36)" }, { t: 4200, v: "6(x + " }, { t: 7000, v: "6(x + 6)" }];

describe("Lotus ordinary typed answers: drafts and pauses read like Typing replay", () => {
  it("a discarded draft that matched a known mistake is caught, with the pause and first key", () => {
    const r = send(typed("p1"), "6(x + 6)", caught);
    assert.deepEqual(r.typing, caught);
    assert.ok(r.typingReading!.signals.includes("caught_own_mistake"));
    assert.ok(r.typingReading!.signals.includes("draft_mistake:DIVIDED_FIRST_TERM_ONLY"));
    assert.equal(r.typingReading!.diagnosis?.effect, "NEEDS_ANOTHER");
    assert.equal(r.typingReading!.facts.firstKeyMs, 3000);
    assert.equal(r.typingReading!.facts.drafts, 1);
    assert.equal(r.gameReading, undefined, "no game was played");
  });
  it("straight through is fluent; a long wait before starting is noted", () => {
    const r = send(typed("p2"), "6(x + 6)", [{ t: 6000, v: "6(x + 6)" }]);
    assert.ok(r.typingReading!.signals.includes("straight_through"));
    assert.match(r.typingReading!.summary, /Longest pause: 6\.0s before starting/);
  });
  it("a right answer with a caught mistake isn't proof on its own; without one it counts as usual", () => {
    const withCatch = foldLedger([audit(typed("l1"), send(typed("l1"), "6(x + 6)", caught))]).get("FAC_DIVIDE_TERMS");
    const clean = foldLedger([audit(typed("l2"), send(typed("l2"), "6(x + 6)", [{ t: 3000, v: "6(x + 6)" }]))]).get("FAC_DIVIDE_TERMS");
    assert.notEqual(withCatch?.state, clean?.state, "the caught draft changes how far the answer counts");
    assert.notEqual(withCatch?.state, "SECURE");
  });
  it("works for a number answer too, against the question's own key", () => {
    const r = send(count("n1"), "1", [{ t: 2000, v: "2" }, { t: 2600, v: "" }, { t: 5000, v: "1" }]);
    assert.ok(r.typingReading!.signals.includes("draft_mistake:COUNTED_INSIDE_BRACKET"));
    assert.ok(r.typingReading!.signals.includes("final_right"));
  });
  it("the submitted answer is always the record's last entry", () => {
    const r = send(typed("e1"), "6(x + 6)", [{ t: 3000, v: "6(x + " }]);
    assert.equal(r.typing!.at(-1)!.v, "6(x + 6)");
  });
  it("a malformed record is dropped, never refused, and a reading sent by the browser is discarded", () => {
    const backwards = send(typed("m1"), "6(x + 6)", [{ t: 5000, v: "6" }, { t: 100, v: "6(x + 6)" }]);
    assert.equal(backwards.answer, "6(x + 6)");
    assert.equal(backwards.typing, undefined);
    assert.equal(backwards.typingReading, undefined);
    const forged = send(typed("m2"), "6(x + 6)", undefined, { typingReading: { kind: "EDIT_HISTORY", summary: "forged", signals: [], certainty: 1, skillId: "X", facts: {} } });
    assert.equal(forged.typingReading, undefined);
  });
  it("a tile, game or 'don't know' answer keeps no typing record", () => {
    assert.equal(send(typed("d1"), "I don't know", caught, { didNotKnow: true }).typing, undefined);
  });
});
