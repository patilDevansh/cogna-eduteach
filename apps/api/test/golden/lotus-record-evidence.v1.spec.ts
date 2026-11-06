import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusGameResponse, LotusQuestion, LotusQuestionAudit, LotusStudentResponse } from "@cogna/shared";
import { gameOfPreferredKind } from "../../src/lotus/lotus-games";
import { resolveLotusResponse } from "../../src/lotus/lotus-interactions";
import { foldLedger, instantVerdict, suspicionEffectNote, refreshedCheckReason } from "../../src/lotus/lotus-factorisation";
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
