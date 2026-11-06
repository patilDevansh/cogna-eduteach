import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusGameResponse, LotusQuestion, LotusQuestionAudit, LotusStudentResponse } from "@cogna/shared";
import { gameOfPreferredKind } from "../../src/lotus/lotus-games";
import { resolveLotusResponse } from "../../src/lotus/lotus-interactions";
import { foldLedger, instantVerdict, suspicionEffectNote, refreshedCheckReason, evidenceFromAnalysis, questionsActuallyLeft, reachableQuestionsAhead } from "../../src/lotus/lotus-factorisation";
import { planAdjustments, type FactorisationState } from "../../src/lotus/lotus-factorisation";
import { curriculumFor } from "../../src/lotus/lotus-factorisation-catalogue";
import { checkWrittenItem, methodGivenAway } from "../../src/lotus/lotus-question-factory";
import { singleReviewPrompt } from "../../src/lotus/lotus-prompts";

function item(id: string, expression: string, canonical: string, skillId: string, tagged: string[], mistakes: Array<{ answer: string; mistake: string }> = []): LotusQuestion {
  const q: LotusQuestion = { id, phase: "DIAGNOSE", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: canonical, workedSolution: ["Take out the common factor"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId, taggedSkills: tagged, stepSkills: tagged, level: "medium", origin: "AI", predictedMistakes: mistakes } } };
  return q;
}
const base = (): LotusStudentResponse => ({ answer: "x", working: "", confidence: 60, responseTimeMs: 20000, didNotKnow: false });
const typed = (q: LotusQuestion, answer: string): LotusStudentResponse => ({ ...base(), answer });
const historyOf = (q: LotusQuestion, values: string[]): LotusStudentResponse => {
  q.game = gameOfPreferredKind(q, ["EDIT_HISTORY"]);
  assert.ok(q.game, "edit history builds");
  return resolveLotusResponse(q, { ...base(), game: { kind: "EDIT_HISTORY", history: values.map((v, i) => ({ v, t: 1000 + i * 2000 })) } as LotusGameResponse });
};
const auditOf = (q: LotusQuestion, r: LotusStudentResponse): LotusQuestionAudit => {
  const v = instantVerdict(q, r);
  return { question: q, response: r, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;
};
const monomial = (id: string) => item(id, "8x^2y + 12x", "4x(2xy + 3)", "FAC_COMMON_MONOMIAL", ["FAC_GCF_NUMERIC", "FAC_GCF_VARIABLE", "FAC_DIVIDE_TERMS"]);

describe("Lotus blames the skill that was actually wrong", () => {
  it("2x(4xy + 12) for 8x²y + 12x: letters right, number not highest, second term undivided", () => {
    const v = instantVerdict(monomial("a1"), typed(monomial("a1"), "2x(4xy + 12)"));
    assert.equal(v.verification.status, "VERIFIED_INCORRECT");
    assert.equal(v.evidence.find((e) => e.skillId === "FAC_GCF_VARIABLE")?.kind, "SECURE", "the common letter was found");
    assert.equal(v.evidence.some((e) => e.skillId === "FAC_GCF_VARIABLE" && e.kind !== "SECURE"), false);
    assert.equal(v.evidence.find((e) => e.kind === "MISTAKE" && e.skillId === "FAC_DIVIDE_TERMS")?.mistake, "DIVIDED_FIRST_TERM_ONLY");
    assert.equal(v.evidence.find((e) => e.kind === "MISTAKE" && e.mistake === "COMMON_NOT_HIGHEST")?.skillId, "FAC_GCF_NUMERIC");
  });
  it("a wrong letter outside is still not credited", () => {
    const v = instantVerdict(monomial("a2"), typed(monomial("a2"), "4(2x^2y + 3x)"));
    assert.equal(v.evidence.some((e) => e.skillId === "FAC_GCF_VARIABLE" && e.kind === "SECURE" && /right letters/.test(e.description ?? "")), false);
  });
});

describe("Lotus links the same doubt across questions", () => {
  const q1 = () => item("h1", "6x + 48", "6(x + 8)", "FAC_DIVIDE_TERMS", ["FAC_GCF_NUMERIC"], [{ answer: "6(x + 48)", mistake: "DIVIDED_FIRST_TERM_ONLY" }]);
  const hedged = () => {
    const q = q1();
    q.game = gameOfPreferredKind(q, ["SPLIT_CONFIDENCE"]);
    assert.ok(q.game);
    const options = (q.game as { options: string[] }).options;
    const counts = options.map((o) => (o === "6(x + 8)" ? 3 : o === "6(x + 48)" ? 1 : 0));
    return auditOf(q, resolveLotusResponse(q, { ...base(), game: { kind: "SPLIT_CONFIDENCE", counts } as LotusGameResponse }));
  };
  it("a draft that swaps a correct second quotient back to the undivided value is a read signal", () => {
    const q = monomial("d1");
    const r = historyOf(q, ["2", "2(", "2x(4xy + 6)", "2x(4xy + 12)"]);
    assert.ok(r.gameReading!.signals.includes("replaced_correct_quotient:DIVIDED_FIRST_TERM_ONLY"));
    assert.match(r.gameReading!.summary, /first wrote the second term divided correctly/);
  });
  it("the earlier doubt and the real mistake are the same doubt seen twice, counted as one second sighting", () => {
    const first = hedged();
    const q = monomial("d2");
    const second = auditOf(q, historyOf(q, ["2x(4xy + 6)", "2x(4xy + 12)"]));
    const ledger = foldLedger([first, second]).get("FAC_DIVIDE_TERMS");
    assert.equal(ledger?.state, "SUSPECTED");
    assert.ok(ledger!.notes.some((n) => /second sighting/.test(n)));
    assert.match(suspicionEffectNote([first], second) ?? "", /second sighting/);
  });
  it("a correct final answer after a draft that matched the mistake is a doubt on that skill, not secure", () => {
    const q = item("d3", "6x + 48", "6(x + 8)", "FAC_DIVIDE_TERMS", ["FAC_GCF_NUMERIC"]);
    const r = historyOf(q, ["6(x + 48)", "6(x + 8)"]);
    const v = instantVerdict(q, r);
    const doubted = v.evidence.find((e) => e.hedge);
    assert.equal(doubted?.skillId, "FAC_DIVIDE_TERMS");
    assert.notEqual(doubted?.kind, "SECURE");
    assert.equal(doubted?.mistake, undefined);
  });
});

describe("Lotus questions do not give the method away", () => {
  it("catches the step in the prompt", () => {
    assert.ok(methodGivenAway("Factorise completely: divide every term by the common factor in 6x + 20.", "FACTORISE"));
    assert.ok(methodGivenAway("Factorise 6x + 20 by taking out the HCF", "FACTORISE"));
    assert.equal(methodGivenAway("Factorise completely: 6x + 20", "FACTORISE"), null);
    assert.equal(methodGivenAway("Find the highest common factor of 12 and 18", "NUMBER"), null);
  });
  it("rejects a written or banked item whose prompt leaks, and accepts the plain one", () => {
    const q = item("p1", "6x + 20", "2(3x + 10)", "FAC_DIVIDE_TERMS", ["FAC_GCF_NUMERIC"], [{ answer: "2(3x + 20)", mistake: "DIVIDED_FIRST_TERM_ONLY" }]);
    const req = { spec: { skillId: "FAC_DIVIDE_TERMS", kind: "FACTORISE", level: "easy", shape: "", mistakes: ["DIVIDED_FIRST_TERM_ONLY"], tagged: [] }, avoid: [], purpose: "FILL" } as never;
    const { id: _id, ...bare } = q;
    const leaked = { ...bare, prompt: "Factorise completely: divide every term by the common factor in 6x + 20." };
    assert.ok(checkWrittenItem(req, leaked).some((r) => /gives the method away/.test(r)));
    assert.equal(checkWrittenItem(req, bare).some((r) => /gives the method away/.test(r)), false);
  });
});

describe("Lotus review prompt", () => {
  it("counts drafts as working and asks for strengths", () => {
    const q = monomial("r1");
    const r = historyOf(q, ["2x(4xy + 6)", "2x(4xy + 12)"]);
    const prompt = singleReviewPrompt({ audits: [], currentQuestion: q, currentResponse: r, currentVerification: instantVerdict(q, r).verification, elapsedSeconds: 10, answeredCount: 1, phase: "DIAGNOSE" });
    assert.match(prompt, /never say or imply that there is no working/);
    assert.match(prompt, /"strengths": \[\]/);
    assert.match(prompt, /2x\(4xy \+ 6\)/);
  });
});

const divide = (id: string, expression: string, canonical: string, wrong: string) =>
  item(id, expression, canonical, "FAC_DIVIDE_TERMS", ["FAC_GCF_NUMERIC"], [{ answer: wrong, mistake: "DIVIDED_FIRST_TERM_ONLY" }]);
const wrongTyped = (id: string) => auditOf(divide(id, "6x + 20", "2(3x + 10)", "2(3x + 20)"), typed(divide(id, "6x + 20", "2(3x + 10)", "2(3x + 20)"), "2(3x + 20)"));
const rightTyped = (id: string) => auditOf(divide(id, "12x + 20", "4(3x + 5)", "4(3x + 20)"), typed(divide(id, "12x + 20", "4(3x + 5)", "4(3x + 20)"), "4(3x + 5)"));
const hedgedFirst = () => {
  const q = divide("hq", "6x + 48", "6(x + 8)", "6(x + 48)");
  q.game = gameOfPreferredKind(q, ["SPLIT_CONFIDENCE"]);
  const options = (q.game as { options: string[] }).options;
  const counts = options.map((o) => (o === "6(x + 8)" ? 3 : o === "6(x + 48)" ? 1 : 0));
  return auditOf(q, resolveLotusResponse(q, { ...base(), game: { kind: "SPLIT_CONFIDENCE", counts } as LotusGameResponse }));
};

describe("Lotus split-chip ties", () => {
  it("a 2-2 tie between the right answer and a mistake is a tie, not the wrong answer", () => {
    const q = divide("tie1", "6x + 20", "2(3x + 10)", "2(3x + 20)");
    q.game = gameOfPreferredKind(q, ["SPLIT_CONFIDENCE"]);
    const options = (q.game as { options: string[] }).options;
    const counts = options.map((o) => (o === "2(3x + 10)" || o === "2(3x + 20)" ? 2 : 0));
    const r = resolveLotusResponse(q, { ...base(), game: { kind: "SPLIT_CONFIDENCE", counts } as LotusGameResponse });
    assert.ok(r.gameReading!.signals.includes("tied_options"));
    assert.ok(r.answer.includes("2(3x + 10)") && r.answer.includes("2(3x + 20)") && / or /.test(r.answer));
    const v = instantVerdict(q, r);
    assert.equal(v.verification.status, "NOT_DETERMINISTIC");
    assert.match(v.verification.explanation, /tied/);
    assert.equal(v.evidence.find((e) => e.kind === "MISTAKE")?.mistake, "DIVIDED_FIRST_TERM_ONLY", "the named mistake is kept");
  });
});

describe("Lotus repeated doubt is one pattern", () => {
  it("counts sightings across a doubt and mistakes, and says so", () => {
    const a = hedgedFirst(), b = wrongTyped("rep2"), c = wrongTyped("rep3");
    const entry = foldLedger([a, b, c]).get("FAC_DIVIDE_TERMS")!;
    assert.deepEqual(entry.sightings?.map((s) => [s.q, s.how]), [[1, "doubt"], [2, "mistake"], [3, "mistake"]]);
    assert.match(suspicionEffectNote([a, b], c) ?? "", /3 times.*question 1 as a doubt, question 2, question 3/);
    assert.notEqual(entry.state, "SECURE");
  });
  it("a booked check's reason is refreshed with the sightings, not left at the first doubt's text", () => {
    const ledger = foldLedger([hedgedFirst(), wrongTyped("rf2"), wrongTyped("rf3")]);
    const text = refreshedCheckReason(ledger, "FAC_DIVIDE_TERMS", "A split-chip response favoured the correct answer but gave weight to an alternative.");
    assert.match(text ?? "", /Booked after question 1; questions 2 and 3 showed the same thing/);
    assert.equal(refreshedCheckReason(foldLedger([hedgedFirst()]), "FAC_DIVIDE_TERMS", "x"), null);
  });
});

describe("Lotus shaky until two", () => {
  it("one right answer after 2+ sightings is shaky, not secure; a second right answer settles it", () => {
    const [a, b] = [hedgedFirst(), wrongTyped("sk2")];
    const once = foldLedger([a, b, rightTyped("sk3")]).get("FAC_DIVIDE_TERMS")!;
    assert.equal(once.state, "SUSPECTED");
    assert.equal(once.shakyRightAt, 3);
    assert.ok(once.needsComparableCheck, "the plan books a comparable check for the second right answer");
    assert.match(once.notes.at(-1)!, /after 2 earlier doubts; counts as shaky until another right answer/);
    assert.match(suspicionEffectNote([a, b], rightTyped("sk3")) ?? "", /shaky until another right answer/);
    const twice = foldLedger([a, b, rightTyped("sk3"), rightTyped("sk4")]).get("FAC_DIVIDE_TERMS")!;
    assert.equal(twice.state, "SECURE");
  });
  it("a suspicion from a single sighting is still cleared by one right answer", () => {
    const entry = foldLedger([wrongTyped("one1"), rightTyped("one2")]).get("FAC_DIVIDE_TERMS")!;
    assert.equal(entry.state, "SECURE");
    assert.equal(entry.shakyRightAt, undefined);
  });
  it("a whole session: doubt, mistake, tie, then one right answer is not secure", () => {
    const tie = (() => {
      const q = divide("ws3", "6x + 20", "2(3x + 10)", "2(3x + 20)");
      q.game = gameOfPreferredKind(q, ["SPLIT_CONFIDENCE"]);
      const options = (q.game as { options: string[] }).options;
      const counts = options.map((o) => (o === "2(3x + 10)" || o === "2(3x + 20)" ? 2 : 0));
      return auditOf(q, resolveLotusResponse(q, { ...base(), game: { kind: "SPLIT_CONFIDENCE", counts } as LotusGameResponse }));
    })();
    const entry = foldLedger([hedgedFirst(), wrongTyped("ws2"), tie, rightTyped("ws4")]).get("FAC_DIVIDE_TERMS")!;
    assert.notEqual(entry.state, "SECURE");
    assert.ok(entry.sightings!.length >= 3);
  });
});

describe("Lotus confidence is never invented", () => {
  it("a response with no confidence is accepted and the prompt sees none", async () => {
    const { confidenceForPrompt } = await import("../../src/lotus/lotus-prompts");
    const q = monomial("c1");
    const r = resolveLotusResponse(q, { ...base(), answer: "2x(4xy + 12)", confidence: undefined });
    assert.equal(r.confidence, undefined);
    assert.equal(confidenceForPrompt(r), null);
  });
});

const powers = (): LotusQuestion => ({ id: "n1", phase: "DIAGNOSE", subtopic: "Powers", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
  prompt: "Find the value of 2² * 2² * 2³.", purpose: "",
  answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "128", workedSolution: ["2^(2+2+3) = 2^7", "2^7 = 128"],
    diagnostics: { itemKind: "NUMBER", expression: "2^2 * 2^2 * 2^3", skillId: "FND_EXPONENT_PRODUCT", taggedSkills: ["FND_EXPONENT_PRODUCT"], stepSkills: ["FND_EXPONENT_PRODUCT", "FND_EXPONENT_PRODUCT"], level: "easy", origin: "AI", predictedMistakes: [] } } });

describe("Lotus numeric answers that are equal but not evaluated", () => {
  for (const written of ["2^7", "2⁷", "4*32"]) {
    it(`${written} for 128 is never marked incorrect`, () => {
      const v = instantVerdict(powers(), typed(powers(), written));
      assert.notEqual(v.verification.status, "VERIFIED_INCORRECT");
      assert.equal(v.verification.status, "VERIFIED_UNFINISHED");
      assert.ok(v.evidence.length > 0 && v.evidence.every((e) => e.kind === "SECURE"), "the skill was shown");
      assert.equal(v.needsAnalysis, false);
    });
  }
  it("a plain 128 is correct and a wrong power is still wrong", () => {
    assert.equal(instantVerdict(powers(), typed(powers(), "128")).verification.status, "VERIFIED_CORRECT");
    assert.notEqual(instantVerdict(powers(), typed(powers(), "2⁶")).verification.status, "VERIFIED_CORRECT");
    assert.notEqual(instantVerdict(powers(), typed(powers(), "27")).verification.status, "VERIFIED_CORRECT");
  });
  it("a review cannot turn the unevaluated power into a mistake on the skill shown", () => {
    const existing = instantVerdict(powers(), typed(powers(), "2⁷")).evidence;
    const out = evidenceFromAnalysis(powers(), existing, 2, "After correctly writing 2^7, the student stopped instead of evaluating it as 128", "MISUNDERSTANDING", false, true);
    assert.ok(out.every((e) => e.kind === "SECURE"));
    const guarded = evidenceFromAnalysis(powers(), [], 1, "stopped", "MISUNDERSTANDING", false, true);
    assert.ok(guarded.every((e) => e.kind === "SECURE"));
  });
});

describe("Lotus after the developer chooses to stay in the test", () => {
  it("the time estimate says nothing is reachable, but the questions actually left are", () => {
    assert.equal(reachableQuestionsAhead(901, 7, 900), 0);
    const state = { planTurn: 7, turns: [8, 9, 10, 11].map((turn) => ({ turn, slot: turn, status: turn === 9 ? "SKIPPED" : "PLANNED", version: 1 })) } as never;
    assert.equal(questionsActuallyLeft(state), 3);
  });
});

describe("Lotus credits what a wrong pick shows, in plain third person", () => {
  const square = () => item("sq1", "4x^2 + 12x + 9", "(2x + 3)^2", "FAC_PERFECT_SQUARE_PLUS", ["FND_RECOGNISE_SQUARE"],
    [{ answer: "(2x + 3)(2x - 3)", mistake: "WROTE_DIFF_OF_SQUARES" }, { answer: "(4x + 9)^2", mistake: "NOT_ROOTED" }]);
  const pick = (q: LotusQuestion, answer: string) => {
    q.game = gameOfPreferredKind(q, ["SPLIT_CONFIDENCE"]);
    assert.ok(q.game, "split builds");
    const options = (q.game as { options: string[] }).options;
    const r = resolveLotusResponse(q, { ...base(), game: { kind: "SPLIT_CONFIDENCE", counts: options.map((o) => (o === answer ? 4 : 0)) } as LotusGameResponse });
    return instantVerdict(q, r);
  };
  it("the difference-of-squares pick for a perfect-square trinomial still blames the tested skill but credits the roots", () => {
    const v = pick(square(), "(2x + 3)(2x - 3)");
    assert.equal(v.evidence.find((e) => e.kind === "MISTAKE")?.mistake, "WROTE_DIFF_OF_SQUARES");
    const credit = v.evidence.find((e) => e.skillId === "FND_RECOGNISE_SQUARE");
    assert.equal(credit?.kind, "SECURE");
    assert.match(credit!.description!, /correct square roots/);
  });
  it("wrong roots earn no credit", () => {
    const v = pick(square(), "(4x + 9)^2");
    assert.equal(v.evidence.some((e) => e.skillId === "FND_RECOGNISE_SQUARE" && e.kind === "SECURE"), false);
  });
  it("code never speaks for the student: no mistake description is first person", () => {
    const v = pick(square(), "(2x + 3)(2x - 3)");
    for (const e of v.evidence) assert.doesNotMatch(e.description ?? "", /\b(I|my|me)\b|It looked like/);
    assert.match(v.evidence.find((e) => e.kind === "MISTAKE")!.description!, /^(Chose|Wrote) /);
  });
});

describe("Lotus after one I-don't-know", () => {
  const slotOf = (skill: string) => curriculumFor("FACTORISATION").slots.find((sl) => sl.skillId === skill)?.slot ?? 1;
  const make = (turn: number, skillId: string, level: "easy" | "medium" | "hard", stepSkills: string[]) =>
    ({ id: `t${turn}`, type: "CONSTRUCTED_RESPONSE", answerKey: { diagnostics: { skillId, itemKind: "FACTORISE", level, slot: slotOf(skillId), stepSkills, taggedSkills: [], predictedMistakes: [] } } }) as unknown as LotusQuestion;
  it("books the foundation check at the nearest slot, holds same-skill and dependent questions, and says what it placed", () => {
    const asked = make(1, "FAC_DIFF_SQUARES", "medium", ["FAC_DIFF_SQUARES"]);
    const items: Record<number, LotusQuestion> = {
      2: make(2, "FAC_DIFF_SQUARES", "medium", ["FAC_DIFF_SQUARES"]),
      3: make(3, "FAC_PERFECT_SQUARE_PLUS", "medium", ["FAC_PERFECT_SQUARE_PLUS", "FND_RECOGNISE_SQUARE"]),
      4: make(4, "FAC_DIFF_SQUARES", "hard", ["FAC_DIFF_SQUARES"]),
      5: make(5, "FAC_GCF_NUMERIC", "easy", ["FAC_GCF_NUMERIC"]),
    };
    const state: FactorisationState = { topic: "FACTORISATION", planTurn: 1, answeredTurns: [1], handledConfirmed: [], handledBroadened: [], fastSkips: 0,
      turns: [1, 2, 3, 4, 5].map((turn) => ({ turn, slot: slotOf((turn === 1 ? asked : items[turn]!).answerKey.diagnostics!.skillId), status: "PLANNED" as const, version: 0 })) };
    const dnk = { question: asked, response: { answer: "I don't know", didNotKnow: true }, verification: { status: "NO_ANSWER" }, skillEvidence: [{ skillId: "FAC_DIFF_SQUARES", kind: "DID_NOT_KNOW", source: "INSTANT" }] } as unknown as LotusQuestionAudit;
    const actions = planAdjustments({ state, ledger: foldLedger([dnk]), itemAt: (turn) => items[turn], askedItems: [asked], freezeNext: false });
    const descent = actions.find((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT");
    assert.ok(descent && descent.kind === "REPURPOSE");
    assert.equal(descent.forSkill, "FND_RECOGNISE_SQUARE", "the first foundation, not a middle rung");
    assert.equal(descent.turn, 2, "the nearest reachable slot");
    const skipped = actions.filter((a) => a.kind === "SKIP").map((a) => a.turn);
    assert.deepEqual(skipped, [4], "the harder question of the same skill waits");
    const held = actions.find((a) => a.kind === "REPURPOSE" && a.purpose === "AVOID" && a.turn === 3);
    assert.ok(held, "the question that also needs square recognition waits behind the check");
  });
  it("with no slot reachable in the time left, no descent is promised", () => {
    const asked = make(1, "FAC_DIFF_SQUARES", "medium", ["FAC_DIFF_SQUARES"]);
    const state: FactorisationState = { topic: "FACTORISATION", planTurn: 1, answeredTurns: [1], handledConfirmed: [], handledBroadened: [], fastSkips: 0,
      turns: [{ turn: 1, slot: slotOf("FAC_DIFF_SQUARES"), status: "PLANNED", version: 0 }, { turn: 2, slot: slotOf("FAC_GCF_NUMERIC"), status: "PLANNED", version: 0 }] };
    const dnk = { question: asked, response: { answer: "I don't know", didNotKnow: true }, verification: { status: "NO_ANSWER" }, skillEvidence: [{ skillId: "FAC_DIFF_SQUARES", kind: "DID_NOT_KNOW", source: "INSTANT" }] } as unknown as LotusQuestionAudit;
    let noSlot = false;
    const actions = planAdjustments({ state, ledger: foldLedger([dnk]), itemAt: () => make(2, "FAC_GCF_NUMERIC", "easy", ["FAC_GCF_NUMERIC"]), askedItems: [asked], freezeNext: false, reachableQuestions: 0, onNoReachableSlot: () => { noSlot = true; } });
    assert.equal(actions.some((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT"), false);
    assert.equal(noSlot, true);
  });
});
