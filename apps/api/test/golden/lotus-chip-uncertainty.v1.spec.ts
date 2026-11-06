import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusQuestionAudit } from "@cogna/shared";
import { foldLedger, planAdjustments, type FactorisationState } from "../../src/lotus/lotus-factorisation";

const skill = "FAC_PERFECT_SQUARE_MINUS";
const question = { id: "q1", type: "CONSTRUCTED_RESPONSE", answerKey: { diagnostics: { skillId: skill, itemKind: "FACTORISE", level: "medium", slot: 16, stepSkills: [skill], taggedSkills: [], predictedMistakes: [] } } } as unknown as LotusQuestion;
const split = (counts: number[]) => ({ question, response: { answer: "correct", game: { kind: "SPLIT_CONFIDENCE", counts }, gameReading: { diagnosis: { effect: "NEEDS_ANOTHER" } } }, verification: { status: "VERIFIED_CORRECT" }, skillEvidence: [{ skillId: skill, kind: "SECURE", source: "INSTANT" }] }) as unknown as LotusQuestionAudit;
const state: FactorisationState = { topic: "FACTORISATION", planTurn: 2, answeredTurns: [1], handledConfirmed: [], handledBroadened: [], fastSkips: 0, turns: [ { turn: 1, slot: 16, status: "PLANNED", version: 0 }, { turn: 2, slot: 18, status: "PLANNED", version: 0 }, { turn: 3, slot: 19, status: "PLANNED", version: 0 } ] };

describe("split-chip uncertainty", () => {
  it("keeps a correct 3–1 response as uncertainty and schedules a check without a mistake", () => {
    const ledger = foldLedger([split([1, 3, 0, 0])]);
    const entry = ledger.get(skill)!;
    assert.equal(entry.splitDoubtAt, 1);
    assert.notEqual(entry.state, "CONFIRMED");
    assert.deepEqual(entry.mistakes, []);
    const actions = planAdjustments({ state, ledger, itemAt: () => undefined, askedItems: [question], freezeNext: false });
    const check = actions.find((a) => a.kind === "REPURPOSE" && a.purpose === "CHECK" && a.forSkill === skill && /uncertainty/.test(a.reason));
    assert.ok(check);
    assert.equal(check.spec?.skillId, skill);
    assert.ok(check.turn > state.planTurn);
  });
  it("does not schedule an uncertainty check for a unanimous choice", () => {
    assert.equal(foldLedger([split([0, 4, 0, 0])]).get(skill)?.splitDoubtAt, undefined);
  });
  it("records a later independent correct answer after a split", () => {
    const independent = { ...split([0, 4, 0, 0]), response: { answer: "correct", didNotKnow: false } } as unknown as LotusQuestionAudit;
    assert.equal(foldLedger([split([1, 3, 0, 0]), independent]).get(skill)?.splitDoubtAt, undefined);
  });
  it("does not resolve split uncertainty from later multiple-choice answers", () => {
    const choice = { ...split([0, 4, 0, 0]), question: { ...question, type: "MULTIPLE_CHOICE", answerKey: { ...question.answerKey, diagnostics: { ...question.answerKey.diagnostics!, itemKind: "CHOICE" } } }, response: { answer: "correct" } } as unknown as LotusQuestionAudit;
    const entry = foldLedger([split([1, 3, 0, 0]), choice, choice]).get(skill)!;
    assert.equal(entry.splitDoubtAt, 1);
    assert.notEqual(entry.state, "SECURE");
  });
  it("does not promise a check if no future turn can be used", () => {
    const noCapacity = { ...state, turns: state.turns.filter((t) => t.turn <= state.planTurn) };
    const actions = planAdjustments({ state: noCapacity, ledger: foldLedger([split([1, 3, 0, 0])]), itemAt: () => undefined, askedItems: [question], freezeNext: false });
    assert.ok(!actions.some((a) => a.kind === "REPURPOSE" && a.forSkill === skill));
  });
});
