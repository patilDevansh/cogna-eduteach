import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusGameResponse, LotusQuestion, LotusQuestionAudit, LotusStudentResponse } from "@cogna/shared";
import { gameOfPreferredKind } from "../../src/lotus/lotus-games";
import { resolveLotusResponse } from "../../src/lotus/lotus-interactions";
import { foldLedger, instantVerdict } from "../../src/lotus/lotus-factorisation";
import { adaptiveDecisionFor } from "../../src/lotus/lotus.service";
import { assessSkillEvidence } from "../../src/lotus/lotus-evidence-assessment";

// 6x + 36 = 6(x + 6). 6(x + 36) is what dividing only the first term gives.
function gcf(id: string): LotusQuestion {
  const expression = "6x + 36";
  const q: LotusQuestion = { id, phase: "DIAGNOSE", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "6(x + 6)", workedSolution: ["Take out 6"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: "FAC_DIVIDE_TERMS", taggedSkills: ["FAC_GCF_NUMERIC"], stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS"], level: "easy", origin: "AI",
        predictedMistakes: [{ answer: "6(x + 36)", mistake: "DIVIDED_FIRST_TERM_ONLY" }] } } };
  q.game = gameOfPreferredKind(q, ["SPLIT_CONFIDENCE"]);
  assert.ok(q.game, "split builds");
  return q;
}
const optionsOf = (q: LotusQuestion) => (q.game as { options: string[] }).options;
const base = (): LotusStudentResponse => ({ answer: "forged", working: "", confidence: 60, responseTimeMs: 20000, didNotKnow: false });
function chips(q: LotusQuestion, spec: Record<string, number>, extra: Partial<LotusStudentResponse> = {}) {
  const counts = optionsOf(q).map((o) => spec[o] ?? 0);
  return resolveLotusResponse(q, { ...base(), ...extra, game: { kind: "SPLIT_CONFIDENCE", counts } as LotusGameResponse });
}
const unlabelled = (q: LotusQuestion) => optionsOf(q).find((o) => o !== "6(x + 6)" && o !== "6(x + 36)")!;
const audit = (q: LotusQuestion, r: LotusStudentResponse): LotusQuestionAudit => {
  const v = instantVerdict(q, r);
  return { question: q, response: r, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;
};
const mostly = (q: LotusQuestion) => chips(q, { "6(x + 6)": 3, "6(x + 36)": 1 });
const sure = (q: LotusQuestion) => chips(q, { "6(x + 6)": 4 });

describe("Lotus split confidence: a mostly-right answer keeps its doubt", () => {
  it("reads the one chip as a doubt about the mistake that option shows", () => {
    const q = gcf("hedge-1");
    const r = mostly(q);
    assert.equal(r.answer, "6(x + 6)");
    assert.deepEqual(r.gameReading!.diagnosis!.hedge, { chips: 1, option: "6(x + 36)", mistake: "DIVIDED_FIRST_TERM_ONLY" });
    assert.ok(r.gameReading!.signals.includes("doubt_DIVIDED_FIRST_TERM_ONLY"));
  });
  it("still marks it right, puts the doubt on the skill it is about, and needs no AI review", () => {
    const q = gcf("hedge-2");
    const v = instantVerdict(q, mostly(q));
    assert.equal(v.verification.status, "VERIFIED_CORRECT");
    const doubted = v.evidence.find((e) => e.hedge)!;
    assert.equal(doubted.skillId, "FAC_DIVIDE_TERMS");
    assert.equal(doubted.kind, "UNFINISHED", "a doubted skill is partial evidence, not secure");
    assert.equal(doubted.mistake, undefined, "a doubt is never a mistake");
    assert.equal(v.evidence.filter((e) => e.kind === "SECURE" && e.skillId === "FAC_DIVIDE_TERMS").length, 0);
    assert.equal(v.evidence.find((e) => e.skillId === "FAC_GCF_NUMERIC")?.kind, "SECURE", "the skill with no doubt stays secure");
    assert.equal(v.evidence.find((e) => e.skillId === "FAC_GCF_NUMERIC")?.hedge, undefined);
    assert.equal(v.needsAnalysis, false, "code knows what the doubted option means");
  });
  it("asks for a background review only when the doubted option names no mistake, or there is working", () => {
    const q = gcf("hedge-3");
    const odd = instantVerdict(q, chips(q, { "6(x + 6)": 3, [unlabelled(q)]: 1 }));
    assert.equal(odd.needsAnalysis, true);
    assert.equal(odd.evidence.find((e) => e.hedge)?.hedge?.mistake, undefined);
    const withWorking = instantVerdict(q, chips(q, { "6(x + 6)": 3, "6(x + 36)": 1 }, { working: "6 goes into 6x" }));
    assert.equal(withWorking.needsAnalysis, true);
    assert.equal(instantVerdict(q, sure(q)).needsAnalysis, false, "all four on the right answer stays code-only");
  });
  it("the ledger: one doubt isn't secure and isn't a gap; the same doubt again makes it suspected", () => {
    const once = foldLedger([audit(gcf("l1"), mostly(gcf("l1")))]).get("FAC_DIVIDE_TERMS");
    assert.equal(once?.state, "UNTESTED");
    assert.match(once!.notes.at(-1)!, /doubt about the DIVIDED_FIRST_TERM_ONLY mistake/);
    const a = gcf("l2"), b = gcf("l3");
    const twice = foldLedger([audit(a, mostly(a)), audit(b, mostly(b))]).get("FAC_DIVIDE_TERMS");
    assert.equal(twice?.state, "SUSPECTED");
    assert.equal(twice?.suspectedAt, 2);
    assert.deepEqual(twice?.mistakes, ["DIVIDED_FIRST_TERM_ONLY"]);
    assert.equal(twice?.fromHedge, true);
  });
  it("the ledger: a doubt doesn't clear a skill already secure, and a sure right answer settles a doubted one", () => {
    const [a, b, c] = [gcf("s1"), gcf("s2"), gcf("s3")];
    const secureThenDoubt = foldLedger([audit(a, sure(a)), audit(b, sure(b)), audit(c, mostly(c))]).get("FAC_DIVIDE_TERMS");
    assert.equal(secureThenDoubt?.state, "SECURE", "one doubt after shown success stays secure");
    const [d, e, f] = [gcf("s4"), gcf("s5"), gcf("s6")];
    const settled = foldLedger([audit(d, mostly(d)), audit(e, mostly(e)), audit(f, sure(f))]).get("FAC_DIVIDE_TERMS");
    assert.equal(settled?.state, "SECURE");
    assert.equal(settled?.clearedAfterSlip, undefined, "a settled doubt is not recorded as a slip");
    assert.match(settled!.notes.at(-1)!, /earlier doubt looks settled/);
  });
  it("the ledger: two different doubts are not the same doubt twice", () => {
    const [a, b] = [gcf("d1"), gcf("d2")];
    const r2 = chips(b, { "6(x + 6)": 3, [unlabelled(b)]: 1 });
    assert.notEqual(foldLedger([audit(a, mostly(a)), audit(b, r2)]).get("FAC_DIVIDE_TERMS")?.state, "SUSPECTED");
  });
  it("the report doesn't count a doubted right answer as a direct demonstration", () => {
    const [a, b] = [gcf("r1"), gcf("r2")];
    const result = assessSkillEvidence([audit(a, mostly(a)), audit(b, sure(b))], "FAC_DIVIDE_TERMS");
    assert.deepEqual(result.directSuccessTurns, [2]);
  });
  it("the plan change names the doubt, not the verification note", () => {
    const q = gcf("o1");
    const a = audit(q, mostly(q));
    const decision = adaptiveDecisionFor(a, []);
    assert.match(decision.observedError, /kept 1 of 4 chips on 6\(x \+ 36\)/);
    assert.match(decision.observedError, /divided only the first term/);
    assert.ok(!decision.observedError.includes(a.verification!.explanation ?? "\u0000"));
  });
  it("a plainly right answer has no observed error", () => {
    const q = gcf("o2");
    assert.equal(adaptiveDecisionFor(audit(q, sure(q)), []).observedError, "No error: the answer was right.");
  });
  it("the doubt never counts as a direct success, and twice makes the skill suspected", () => {
    const [a, b] = [gcf("p1"), gcf("p2")];
    assert.deepEqual(assessSkillEvidence([audit(a, mostly(a))], "FAC_DIVIDE_TERMS").directSuccessTurns, []);
    assert.equal(foldLedger([audit(a, mostly(a)), audit(b, mostly(b))]).get("FAC_DIVIDE_TERMS")?.state, "SUSPECTED");
  });
  it("writing time never exceeds the time the item was on screen", () => {
    const q = gcf("t1");
    const ctx = { timing: { basis: "CLIENT_ITEM_MOUNT", elapsedMs: 44941, firstInputMs: 2323, hiddenMs: 0, visibilityChanges: 0, complete: false } } as unknown as LotusStudentResponse["interactionContext"];
    const play = { kind: "SPLIT_CONFIDENCE", counts: optionsOf(q).map((o) => (o === "6(x + 6)" ? 4 : 0)) } as LotusGameResponse;
    assert.equal(resolveLotusResponse(q, { ...base(), responseTimeMs: 180000, interactionContext: ctx, game: play }).responseTimeMs, 44941);
    assert.equal(resolveLotusResponse(q, { ...base(), responseTimeMs: 20000, interactionContext: ctx, game: play }).responseTimeMs, 20000);
  });
});
