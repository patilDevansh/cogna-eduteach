import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusQuestionAudit } from "@cogna/shared";
import { foldLedger, planAdjustments, type FactorisationState } from "../../src/lotus/lotus-factorisation";

const skill = "FAC_DIVIDE_TERMS";
function turn(level: "easy" | "medium" | "hard", kind: "CHOICE" | "FACTORISE", result: "MISTAKE" | "SECURE", slot: number): LotusQuestionAudit {
  return {
    question: { id: `q-${level}-${kind}-${result}`, type: kind === "CHOICE" ? "MULTIPLE_CHOICE" : "CONSTRUCTED_RESPONSE", answerKey: { diagnostics: { skillId: kind === "CHOICE" ? skill : "FAC_COMMON_MONOMIAL", itemKind: kind, level, slot, taggedSkills: [skill], stepSkills: [skill], predictedMistakes: [] } } },
    response: { answer: result === "SECURE" ? "right" : "wrong", didNotKnow: false },
    verification: { status: result === "SECURE" ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT" },
    skillEvidence: [{ skillId: skill, kind: result, source: result === "SECURE" ? "INSTANT" : "ANALYSIS" }],
  } as unknown as LotusQuestionAudit;
}
const wrong = turn("hard", "FACTORISE", "MISTAKE", 4);
const simpler = turn("easy", "CHOICE", "SECURE", 1);
const strong = turn("hard", "FACTORISE", "SECURE", 4);

describe("targeted checks preserve the original concern", () => {
  it("records an easier chosen answer as positive evidence without clearing a harder concern", () => {
    const e = foldLedger([wrong, simpler]).get(skill)!;
    assert.equal(e.state, "SUSPECTED");
    assert.equal(e.needsComparableCheck, true);
    assert.match(e.notes.join(" "), /Q2: right on a weaker check.*Q1/);
  });
  it("a later comparable constructed answer can resolve it", () => {
    const e = foldLedger([wrong, simpler, strong]).get(skill)!;
    assert.equal(e.state, "SECURE");
    assert.equal(e.needsComparableCheck, false);
  });
  it("reserves a new check based on the original harder shape after the simpler check", () => {
    const audits = [wrong, simpler];
    const state: FactorisationState = { topic: "FACTORISATION", planTurn: 3, answeredTurns: [1, 2], handledConfirmed: [], handledBroadened: [], fastSkips: 0, turns: [
      { turn: 1, slot: 4, status: "PLANNED", version: 0 },
      { turn: 2, slot: 1, status: "REPURPOSED", purpose: "CHECK", forSkill: skill, version: 1 },
      { turn: 3, slot: 7, status: "PLANNED", version: 0 },
      { turn: 4, slot: 8, status: "PLANNED", version: 0 },
    ] };
    const actions = planAdjustments({ state, ledger: foldLedger(audits), itemAt: () => undefined, askedItems: audits.map((a) => a.question as LotusQuestion), freezeNext: false });
    const action = actions.find((a) => a.kind === "REPURPOSE" && a.purpose === "CHECK" && a.forSkill === skill);
    assert.ok(action, "the answered weaker check must not suppress another check");
    assert.equal(action.spec?.slot, 4);
    assert.equal(action.spec?.level, "hard");
  });
});
