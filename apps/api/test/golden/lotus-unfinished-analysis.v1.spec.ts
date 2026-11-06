import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusQuestionAudit, LotusStudentResponse } from "@cogna/shared";
import { resolveLotusResponse } from "../../src/lotus/lotus-interactions";
import { foldLedger, instantVerdict, planAdjustments, suspicionEffectNote, conflictsWithEarlier, reachableQuestionsAhead, type FactorisationState } from "../../src/lotus/lotus-factorisation";
import { ownerOfMistake } from "../../src/lotus/lotus-factorisation-catalogue";
import { assessSkillEvidence } from "../../src/lotus/lotus-evidence-assessment";
import { adaptiveDecisionFor, reconcileInstalledDecision } from "../../src/lotus/lotus.service";
import { evidenceFormatNeed } from "../../src/lotus/lotus-format-guide";

// The real case: 6x² + 10xy, answered x(6x + 10y). No predicted mistake covers it.
function letters(id: string): LotusQuestion {
  const expression = "6x^2 + 10xy";
  return { id, phase: "DIAGNOSE", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "2x(3x + 5y)", workedSolution: ["Take out 2x"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: "FAC_GCF_VARIABLE", taggedSkills: ["FAC_GCF_NUMERIC"], stepSkills: ["FAC_GCF_VARIABLE"], level: "medium", origin: "AI",
        predictedMistakes: [{ answer: "2x(3x + 10y)", mistake: "DIVIDED_FIRST_TERM_ONLY" }] } } };
}
// Two brackets, common factor never taken out.
function method(id: string): LotusQuestion {
  const expression = "2x^2 + 10x + 12";
  return { id, phase: "CONFIRM", subtopic: "Factorisation", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "2(x + 2)(x + 3)", workedSolution: ["Take out 2", "Split"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: "FAC_FACTOR_FULLY", taggedSkills: ["FAC_COMMON_MONOMIAL", "FAC_MONIC_TRINOMIAL", "FAC_CHOOSE_METHOD"], stepSkills: ["FAC_COMMON_MONOMIAL", "FAC_MONIC_TRINOMIAL"], level: "medium", origin: "AI",
        predictedMistakes: [] } } };
}
const send = (q: LotusQuestion, answer: string, typing?: unknown) =>
  resolveLotusResponse(q, { answer, working: "", confidence: 60, responseTimeMs: 161000, didNotKnow: false, ...(typing !== undefined ? { typing } : {}) } as LotusStudentResponse);
const record = [
  { t: 19700, v: "3" }, { t: 21000, v: "" }, { t: 24000, v: "x(6x +" }, { t: 26000, v: "x(" }, { t: 28000, v: "x(6x +" }, { t: 31000, v: "x(6x + 10y)" },
];

describe("Lotus unfinished answers: who is blamed, what is credited, what is reviewed", () => {
  const q = letters("u1");
  const r = send(q, "x(6x + 10y)", record);
  const v = instantVerdict(q, r);

  it("x(6x + 10y) is a numeric factor left inside, not a skipped method check", () => {
    assert.equal(v.verification.status, "VERIFIED_UNFINISHED");
    const blamed = v.evidence.find((e) => e.kind === "UNFINISHED")!;
    assert.equal(blamed.mistake, "COMMON_NOT_HIGHEST");
    assert.equal(blamed.skillId, ownerOfMistake("COMMON_NOT_HIGHEST", q.answerKey.diagnostics!));
    assert.equal(blamed.skillId, "FAC_GCF_NUMERIC");
    assert.notEqual(blamed.skillId, "FAC_CHOOSE_METHOD");
  });

  it("the letters taken out are credited as secure; the missed skill is not", () => {
    const secure = v.evidence.filter((e) => e.kind === "SECURE");
    assert.deepEqual(secure.map((e) => e.skillId), ["FAC_GCF_VARIABLE"]);
    assert.ok(!v.evidence.some((e) => e.skillId === "FAC_GCF_NUMERIC" && e.kind === "SECURE"));
    const audits = [{ question: q, response: r, verification: v.verification, skillEvidence: v.evidence }] as unknown as LotusQuestionAudit[];
    const ledger = foldLedger(audits);
    assert.equal(ledger.get("FAC_GCF_NUMERIC")?.state, "SUSPECTED");
    assert.notEqual(ledger.get("FAC_GCF_VARIABLE")?.state, "SECURE", "a wrong answer alone does not make a skill secure");
    assert.ok(ledger.get("FAC_GCF_VARIABLE")?.notes.some((n) => /right as part of a wrong answer/.test(n)));
    const assessed = assessSkillEvidence(audits, "FAC_GCF_VARIABLE");
    assert.equal(assessed.distinctDirectSuccessCount, 0, "not counted as a direct demonstration");
    assert.deepEqual(assessed.unscopedSuccessTurns, [1]);
  });

  it("a guessed cause goes to the background review", () => {
    assert.equal(v.needsAnalysis, true);
  });

  it("the typing summary says not fully factorised, with the pause", () => {
    const t = r.typingReading!;
    assert.match(t.summary, /not fully factorised/);
    assert.ok(t.signals.includes("final_unfinished"));
    assert.match(t.summary, /Longest pause: 19\.7s before starting/);
    assert.doesNotMatch(t.summary, /isn't the factorisation/);
  });

  it("an unfinished answer gets a format that separates stopping early from not knowing", () => {
    const audits = [{ question: q, response: r, verification: v.verification, skillEvidence: v.evidence }] as unknown as LotusQuestionAudit[];
    const need = evidenceFormatNeed(audits);
    assert.ok(need);
    assert.ok(need.kinds.includes("TRUE_FALSE"));
    assert.ok(!need.kinds.includes("READBACK" as never));
  });

  it("(2x + 4)(x + 3) is still a skipped common-factor check, with no letters credit", () => {
    const m = method("u2");
    const mv = instantVerdict(m, send(m, "(2x + 4)(x + 3)"));
    assert.equal(mv.verification.status, "VERIFIED_UNFINISHED");
    assert.equal(mv.evidence.find((e) => e.kind === "UNFINISHED")?.mistake, "SKIPPED_COMMON_FACTOR_CHECK");
    assert.ok(!mv.evidence.some((e) => e.kind === "SECURE"));
  });

  it("clean right answers and predicted wrong answers stay code-only", () => {
    const right = instantVerdict(q, send(q, "2x(3x + 5y)"));
    assert.equal(right.needsAnalysis, false);
    const predicted = instantVerdict(q, send(q, "2x(3x + 10y)"));
    assert.equal(predicted.needsAnalysis, false);
  });

  it("a draft that matches no known mistake under a wrong final answer is reviewed", () => {
    const wrong = send(q, "2x(3x + 7y)", [{ t: 3000, v: "5" }, { t: 4000, v: "" }, { t: 9000, v: "2x(3x + 7y)" }]);
    assert.equal(instantVerdict(q, wrong).needsAnalysis, true);
    const straight = send(q, "2x(3x + 7y)", [{ t: 9000, v: "2x(3x + 7y)" }]);
    assert.equal(instantVerdict(q, straight).needsAnalysis, true, "an unpredicted wrong answer is reviewed anyway");
  });
});

describe("Lotus credits only skills the expression can show", () => {
  const choice = (id: string, expression: string, tagged: string[]): LotusQuestion => ({
    id, phase: "DIAGNOSE", subtopic: "Dividing", type: "MULTIPLE_CHOICE", asksForWorking: false,
    prompt: `Factorise completely: divide every term by the common factor in ${expression}.`, purpose: "",
    options: ["3(3x + 6)", "3(3x)", "3(3x + 5)", "3(3x + 15)"],
    answerKey: { kind: "MULTIPLE_CHOICE", canonicalAnswer: "3(3x + 5)", workedSolution: ["a", "b", "c"],
      diagnostics: { itemKind: "CHOICE", skillId: "FAC_DIVIDE_TERMS", taggedSkills: tagged, stepSkills: ["FAC_DIVIDE_TERMS", "FAC_DIVIDE_TERMS", "FAC_DIVIDE_TERMS"], level: "easy", origin: "CODE", provenance: "CODE_BUILT_GAME",
        predictedMistakes: [{ answer: "3(3x + 15)", mistake: "DIVIDED_FIRST_TERM_ONLY" }] } } } as unknown as LotusQuestion);
  it("9x + 15 shares no letter, so a typed right answer does not credit the letters skill", () => {
    const q9 = letters("c1");
    (q9.answerKey.diagnostics as { expression: string }).expression = "9x + 15";
    (q9.answerKey.diagnostics as { skillId: string }).skillId = "FAC_DIVIDE_TERMS";
    (q9.answerKey.diagnostics as { taggedSkills: string[] }).taggedSkills = ["FAC_GCF_VARIABLE", "FAC_GCF_NUMERIC"];
    const v9 = instantVerdict(q9, send(q9, "3(3x + 5)"));
    const ids = v9.evidence.map((e) => e.skillId);
    assert.ok(ids.includes("FAC_DIVIDE_TERMS") && ids.includes("FAC_GCF_NUMERIC"));
    assert.ok(!ids.includes("FAC_GCF_VARIABLE"));
  });
  it("6x² + 10xy still credits the letters skill on a right answer", () => {
    const q = letters("c2");
    const ids = instantVerdict(q, send(q, "2x(3x + 5y)")).evidence.map((e) => e.skillId);
    assert.ok(ids.includes("FAC_GCF_VARIABLE") && ids.includes("FAC_GCF_NUMERIC"));
  });
  it("the built division probe drops a tag its expression cannot show", async () => {
    const { expressionCanShowSkill } = await import("../../src/lotus/lotus-algebra");
    assert.equal(expressionCanShowSkill("FAC_GCF_VARIABLE", "9x + 15"), false);
    assert.equal(expressionCanShowSkill("FAC_GCF_VARIABLE", "3x^2 + 3x"), true);
    assert.equal(expressionCanShowSkill("FAC_GCF_NUMERIC", "7x + 3"), false);
    assert.equal(expressionCanShowSkill("FAC_GCF_NUMERIC", "6x + 9"), true);
    assert.equal(expressionCanShowSkill("FAC_DIVIDE_TERMS", "7x + 3"), true);
  });

  describe("what an answer did to an open suspicion", () => {
    const first = (() => {
      const q = letters("s1");
      const d = q.answerKey.diagnostics as { expression: string; skillId: string; taggedSkills: string[]; predictedMistakes: Array<{ answer: string; mistake: string }> };
      d.expression = "2x + 18"; d.skillId = "FAC_DIVIDE_TERMS"; d.taggedSkills = ["FAC_GCF_NUMERIC"];
      d.predictedMistakes = [{ answer: "2(x + 18)", mistake: "DIVIDED_FIRST_TERM_ONLY" }];
      q.answerKey.canonicalAnswer = "2(x + 9)";
      const r = send(q, "2(x + 18)");
      const v = instantVerdict(q, r);
      return { question: q, response: r, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;
    })();
    const secondAudit = (q: LotusQuestion, answer: string, tag: boolean): LotusQuestionAudit => {
      const response = { answer, working: "", confidence: 60, responseTimeMs: 9000, didNotKnow: false } as LotusStudentResponse;
      const v = instantVerdict(q, response);
      return { question: q, response, verification: v.verification, skillEvidence: v.evidence,
        questionSelection: tag ? { adaptationTag: { kind: "TARGETED_CHECK" } } : {} } as unknown as LotusQuestionAudit;
    };
    it("a right pick that avoided the suspected option says so, and says what the ledger did", () => {
      const q = choice("s2", "9x + 15", ["FAC_GCF_NUMERIC"]);
      const a = secondAudit(q, "3(3x + 5)", true);
      const note = suspicionEffectNote([first], a)!;
      assert.match(note, /Avoided the "divided only the first term/);
      assert.match(note, /3\(3x \+ 15\)/);
      const state = foldLedger([first, a]).get("FAC_DIVIDE_TERMS")?.state;
      assert.equal(state, "SECURE", "the ledger clears a suspicion on one right re-check, picked or not");
      assert.match(note, /picked answer .* clearing/);
    });
    it("repeating the mistake says the suspicion stands or is confirmed", () => {
      const q = choice("s3", "9x + 15", ["FAC_GCF_NUMERIC"]);
      const note = suspicionEffectNote([first], secondAudit(q, "3(3x + 15)", true))!;
      assert.match(note, /Made the same mistake again/);
      assert.match(note, /confirmed/);
    });
    it("no open suspicion, no note", () => {
      const q = choice("s4", "9x + 15", ["FAC_GCF_NUMERIC"]);
      assert.equal(suspicionEffectNote([], secondAudit(q, "3(3x + 5)", false)), null);
    });
  });
});

describe("Lotus repeat of a mistake: no pointless step down, and the typed check stays", () => {
  const typedQ = (id: string, expression: string, key: string, wrong: string): LotusQuestion => ({
    id, phase: "DIAGNOSE", subtopic: "Dividing", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: key, workedSolution: ["a", "b"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: "FAC_DIVIDE_TERMS", taggedSkills: ["FAC_GCF_NUMERIC"], stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS"], level: "easy", origin: "AI",
        predictedMistakes: [{ answer: wrong, mistake: "DIVIDED_FIRST_TERM_ONLY" }] } } });
  const pickQ = (id: string, expression: string, options: string[], key: string, wrong: string): LotusQuestion => ({
    id, phase: "DIAGNOSE", subtopic: "Dividing", type: "MULTIPLE_CHOICE", asksForWorking: false,
    prompt: `Factorise completely: divide every term by the common factor in ${expression}.`, purpose: "", options,
    answerKey: { kind: "MULTIPLE_CHOICE", canonicalAnswer: key, workedSolution: ["a", "b", "c"],
      diagnostics: { itemKind: "CHOICE", skillId: "FAC_DIVIDE_TERMS", taggedSkills: ["FAC_GCF_NUMERIC"], stepSkills: ["FAC_DIVIDE_TERMS", "FAC_DIVIDE_TERMS", "FAC_DIVIDE_TERMS"], level: "easy", origin: "CODE", provenance: "CODE_BUILT_GAME",
        predictedMistakes: [{ answer: wrong, mistake: "DIVIDED_FIRST_TERM_ONLY" }] } } } as unknown as LotusQuestion);
  const answered = (q: LotusQuestion, answer: string): LotusQuestionAudit => {
    const response = { answer, working: "", confidence: 90, responseTimeMs: 9000, didNotKnow: false } as LotusStudentResponse;
    const v = instantVerdict(q, response);
    return { question: q, response, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;
  };
  const q1 = typedQ("r1", "2x + 18", "2(x + 9)", "2(x + 18)");
  const q3 = pickQ("r3", "9x + 15", ["3(3x + 6)", "3(3x)", "3(3x + 5)", "3(3x + 15)"], "3(3x + 5)", "3(3x + 15)");
  const q4 = pickQ("r4", "4x + 6", ["2(2x + 3)", "2(2x + 6)", "2(2x + 4)", "2(2x)"], "2(2x + 3)", "2(2x + 6)");
  const audits = [answered(q1, "2(x + 18)"), answered(q3, "3(3x + 5)"), answered(q4, "2(2x + 6)")];
  const typedCheck = typedQ("r7", "5x + 10", "5(x + 2)", "5(x + 10)");

  it("names the matched mistake in plain words", () => {
    assert.equal(audits[2]!.skillEvidence!.find((e) => e.kind === "MISTAKE")!.description, 'Chose "2(2x + 6)": divided only the first term by the common factor.');
  });
  it("the same mistake twice confirms the skill and shows the factor was found", () => {
    const ledger = foldLedger(audits);
    assert.equal(ledger.get("FAC_DIVIDE_TERMS")?.state, "CONFIRMED");
    assert.ok((ledger.get("FAC_GCF_NUMERIC")?.shownInWrong ?? 0) > 0);
  });
  it("does not go down to the number skill, and leaves the typed re-check of the skill in place", () => {
    const state: FactorisationState = {
      planTurn: 4, answeredTurns: [1, 3, 4], handledConfirmed: [], handledBroadened: [], fastSkips: 0,
      turns: [1, 2, 3, 4, 5, 6, 7, 8].map((turn) => ({ turn, slot: turn, status: "PLANNED" as const, version: 1 })),
    };
    const actions = planAdjustments({
      state, ledger: foldLedger(audits), freezeNext: true,
      itemAt: (turn) => (turn === 7 ? typedCheck : undefined), askedItems: [q1, q3, q4],
    });
    assert.ok(!actions.some((a) => a.kind === "REPURPOSE" && a.forSkill === "FAC_GCF_NUMERIC"), "the number skill was shown by the answers");
    assert.ok(!actions.some((a) => (a.kind === "REPURPOSE" || a.kind === "SKIP") && a.turn === 7), "the planned typed check keeps its place");
  });
  it("the format reason says 'again' and the typed format leads when every answer was picked", () => {
    const need = evidenceFormatNeed([audits[1]!, audits[2]!].map((a, i) => i === 0 ? { ...a, verification: { ...a.verification!, status: "VERIFIED_INCORRECT" as const } } : a));
    assert.match(need!.reason, /Wrong again/);
    assert.equal(need!.kinds[0], "EDIT_HISTORY");
  });
});

describe("Lotus choose-several: ranking, format reason, review and reach", () => {
  const SEP = " | ";
  const cards = ["2(x^2 - 9)", "3y(x + 2) + 2(x + 2)", "3x(x + 2)", "(3x + 6)(x + 3)", "2(x - 3)(x + 3)", "(x + 3)(x + 2)"];
  const select: LotusQuestion = {
    id: "sel1", phase: "DIAGNOSE", subtopic: "Factorising fully", type: "MULTIPLE_CHOICE", asksForWorking: false,
    prompt: "Pick every expression that is fully factorised.", purpose: "", options: cards,
    answerKey: { kind: "MULTIPLE_CHOICE", canonicalAnswer: ["3x(x + 2)", "2(x - 3)(x + 3)", "(x + 3)(x + 2)"].join(SEP), workedSolution: ["a", "b"],
      diagnostics: { itemKind: "SELECT", skillId: "FAC_FACTOR_FULLY", taggedSkills: [], stepSkills: ["FAC_FACTOR_FULLY", "FAC_FACTOR_FULLY"], level: "medium", origin: "CODE", provenance: "CODE_BUILT_GAME",
        // Listed with the smaller miss first on purpose.
        predictedMistakes: [{ answer: "2(x^2 - 9)", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "3y(x + 2) + 2(x + 2)", mistake: "SUM_ACCEPTED_AS_FACTORISED" }] } } } as unknown as LotusQuestion;
  const response = { answer: ["2(x^2 - 9)", "3y(x + 2) + 2(x + 2)", "2(x - 3)(x + 3)"].join(SEP), working: "", confidence: 80, responseTimeMs: 20000, didNotKnow: false } as LotusStudentResponse;
  const v = instantVerdict(select, response);
  const audit = { question: select, response, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;

  it("the misconception (a sum taken as factorised) outranks the completeness miss, and both are named", () => {
    assert.equal(v.evidence[0]!.mistake, "SUM_ACCEPTED_AS_FACTORISED");
    assert.equal(v.evidence.length, 2);
    const decision = adaptiveDecisionFor(audit, []);
    assert.ok(decision.observedError.startsWith('Chose "3y(x + 2) + 2(x + 2)"'));
    assert.match(decision.observedError, /2\(x\^2 - 9\)/);
  });
  it("with room for one check, the misconception is probed and the other stays a suspicion", () => {
    const state: FactorisationState = {
      planTurn: 6, answeredTurns: [6], handledConfirmed: [], handledBroadened: [], fastSkips: 0,
      turns: [6, 7, 8].map((turn) => ({ turn, slot: turn, status: "PLANNED" as const, version: 1 })),
    };
    const ledger = foldLedger([audit]);
    const actions = planAdjustments({ state, ledger, freezeNext: true, itemAt: () => undefined, askedItems: [select] });
    const check = actions.find((a) => a.kind === "REPURPOSE" && a.purpose === "CHECK");
    assert.equal(check?.kind === "REPURPOSE" ? check.forSkill : undefined, "FAC_MEANING");
    assert.equal(ledger.get("FAC_FACTOR_FULLY")?.state, "SUSPECTED");
  });
  it("a sum accepted as factorised is not 'the pair of numbers went wrong'", () => {
    const need = evidenceFormatNeed([audit])!;
    assert.doesNotMatch(need.reason, /pair of numbers/);
    assert.match(need.reason, /factorised/);
    assert.ok(need.kinds.every((k) => ["TRUE_FALSE", "COMMIT_THEN_CHOOSE", "EDIT_HISTORY"].includes(k)));
  });
  it("leaving right cards out is reviewed even though the wrong picks were named", () => {
    assert.equal(v.needsAnalysis, true);
    const exact = instantVerdict(select, { ...response, answer: select.answerKey.canonicalAnswer } as LotusStudentResponse);
    assert.equal(exact.needsAnalysis, false);
  });
  it("conflicting answers on one skill ask for a review; a clean right answer does not", () => {
    const q = letters("k1");
    (q.answerKey.diagnostics as { skillId: string }).skillId = "FAC_DIVIDE_TERMS";
    const right = instantVerdict(q, send(q, "2x(3x + 5y)"));
    const rightAudit = { question: q, response: send(q, "2x(3x + 5y)"), verification: right.verification, skillEvidence: right.evidence } as unknown as LotusQuestionAudit;
    const slip = instantVerdict(q, send(q, "2x(3x + 10y)"));
    assert.equal(slip.needsAnalysis, false, "code alone explains it");
    assert.equal(conflictsWithEarlier([rightAudit], slip.evidence, slip.verification.status), true, "mistake after a right answer");
    const wrongAudit = { question: q, response: send(q, "2x(3x + 10y)"), verification: slip.verification, skillEvidence: slip.evidence } as unknown as LotusQuestionAudit;
    assert.equal(conflictsWithEarlier([wrongAudit], right.evidence, right.verification.status), true, "right answer after that mistake");
    assert.equal(conflictsWithEarlier([], right.evidence, right.verification.status), false, "a clean right answer is code-only");
    assert.equal(conflictsWithEarlier([rightAudit], right.evidence, right.verification.status), false);
    assert.equal(conflictsWithEarlier([wrongAudit], slip.evidence, slip.verification.status), false, "the same mistake twice is not a conflict");
  });
  it("no check is placed where the student cannot get to it in the time left", () => {
    const q = letters("k2");
    const wrong = instantVerdict(q, send(q, "2x(3x + 10y)"));
    const a = { question: q, response: send(q, "2x(3x + 10y)"), verification: wrong.verification, skillEvidence: wrong.evidence } as unknown as LotusQuestionAudit;
    const mk = (): FactorisationState => ({
      planTurn: 3, answeredTurns: [3], handledConfirmed: [], handledBroadened: [], fastSkips: 0,
      turns: Array.from({ length: 12 }, (_, i) => ({ turn: i + 1, slot: i + 1, status: "PLANNED" as const, version: 1 })),
    });
    let late = false;
    const none = planAdjustments({ state: mk(), ledger: foldLedger([a]), freezeNext: true, itemAt: () => undefined, askedItems: [q], reachableQuestions: 1, onNoReachableSlot: () => { late = true; } });
    assert.ok(!none.some((x) => x.kind === "REPURPOSE"), "nothing beyond the one question the student will certainly see");
    assert.equal(late, true);
    const some = planAdjustments({ state: mk(), ledger: foldLedger([a]), freezeNext: true, itemAt: () => undefined, askedItems: [q], reachableQuestions: 4 });
    const turn = some.find((x) => x.kind === "REPURPOSE");
    assert.ok(turn && turn.turn <= 3 + 4, "the check lands inside the questions that fit");
    assert.match(adaptiveDecisionFor(a, [], null, true).implementationDetail, /No time left to check this/);
    assert.equal(reachableQuestionsAhead(900, 6, 900), 0);
    assert.ok(reachableQuestionsAhead(420, 6, 900) >= 6);
  });
});

describe("Lotus: a later term left undivided is recognised by its shape", () => {
  const item = (id: string, expression: string, key: string, skill = "FAC_DIVIDE_TERMS", predicted: Array<{ answer: string; mistake: string }> = []): LotusQuestion => ({
    id, phase: "DIAGNOSE", subtopic: "Dividing", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: key, workedSolution: ["a", "b"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: skill, taggedSkills: ["FAC_GCF_NUMERIC"], stepSkills: ["FAC_GCF_NUMERIC", skill], level: "easy", origin: "AI", predictedMistakes: predicted } } });
  const mark = (q: LotusQuestion, answer: string): LotusQuestionAudit => {
    const response = { answer, working: "", confidence: 90, responseTimeMs: 24000, didNotKnow: false } as LotusStudentResponse;
    const v = instantVerdict(q, response);
    return { question: q, response, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit;
  };
  const mistakeOf = (q: LotusQuestion, answer: string) => mark(q, answer).skillEvidence!.find((e) => e.kind === "MISTAKE")?.mistake;
  it("names the mistake for each shape, with no predicted list needed", () => {
    assert.equal(mistakeOf(item("a", "2x + 18", "2(x + 9)"), "2(x + 18)"), "DIVIDED_FIRST_TERM_ONLY");
    assert.equal(mistakeOf(item("b", "4x + 6", "2(2x + 3)"), "2(2x + 6)"), "DIVIDED_FIRST_TERM_ONLY");
    assert.equal(mistakeOf(item("c", "3x^2y + 9x", "3x(xy + 3)"), "3x(xy + 9)"), "DIVIDED_FIRST_TERM_ONLY");
  });
  it("does not fire on a right answer or on an unfinished one", () => {
    assert.equal(mistakeOf(item("d", "3x^2y + 9x", "3x(xy + 3)"), "3x(xy + 3)"), undefined);
    const unfinished = mark(item("e", "6x^2 + 10xy", "2x(3x + 5y)", "FAC_GCF_VARIABLE"), "x(6x + 10y)");
    assert.equal(unfinished.skillEvidence!.find((e) => e.kind === "UNFINISHED")?.mistake, "COMMON_NOT_HIGHEST");
    assert.ok(!unfinished.skillEvidence!.some((e) => e.kind === "MISTAKE"));
  });
  it("Q1, Q3, Q4 and Q8 together: the dividing skill is no longer a one-off", () => {
    const q1 = mark(item("s1", "2x + 18", "2(x + 9)"), "2(x + 18)");
    const q3 = mark(item("s3", "9x + 15", "3(3x + 5)"), "3(3x + 5)");
    const q4 = mark(item("s4", "4x + 6", "2(2x + 3)"), "2(2x + 6)");
    const q8 = mark(item("s8", "3x^2y + 9x", "3x(xy + 3)"), "3x(xy + 9)");
    assert.equal(foldLedger([q1]).get("FAC_DIVIDE_TERMS")?.state, "SUSPECTED");
    assert.equal(foldLedger([q1, q3, q4]).get("FAC_DIVIDE_TERMS")?.state, "CONFIRMED");
    assert.equal(foldLedger([q1, q3, q4, q8]).get("FAC_DIVIDE_TERMS")?.state, "CONFIRMED");
    assert.match(suspicionEffectNote([q1, q3, q4], q8) ?? "", /same mistake again|Made the same mistake/);
    assert.match(q8.skillEvidence!.find((e) => e.kind === "MISTAKE")!.description!, /divided only the first term/);
  });
  it("a reason the answer contradicts is kept as a note, not as a mistake or a probe target", async () => {
    const { reasonEvidence, buildReasonCheck } = await import("../../src/lotus/lotus-reasons");
    const q = item("r8", "3x^2y + 9x", "3x(xy + 3)", "FAC_GCF_VARIABLE", [{ answer: "3x^2(y + 3)", mistake: "INCLUDED_NON_COMMON_VARIABLE" }, { answer: "3x(xy + 9)", mistake: "DIVIDED_FIRST_TERM_ONLY" }]);
    const option = buildReasonCheck(q).options.find((o) => /isn't in every term/.test(o.text))!;
    const out = reasonEvidence(q, option.id, "3x(xy + 9)");
    assert.equal(out.valid, true);
    assert.equal(out.evidence, null, "no MISTAKE on the letters skill");
    assert.match(out.mismatch!, /every letter taken out is in every term/);
    // Without the answer to check against, the reason still counts, as before.
    assert.equal(reasonEvidence(q, option.id).evidence?.mistake, "INCLUDED_NON_COMMON_VARIABLE");
  });
  it("the two credits for the common factor read differently", () => {
    const r = mark(item("x1", "4x + 6", "2(2x + 3)", "FAC_GCF_VARIABLE"), "2(2x + 6)");
    const lines = r.skillEvidence!.filter((e) => e.kind === "SECURE").map((e) => e.description);
    assert.equal(new Set(lines).size, lines.length);
  });
});

describe("Lotus square patterns and torn splits", () => {
  const square = (id: string, expression: string, key: string): LotusQuestion => ({
    id, phase: "DIAGNOSE", subtopic: "Squares", type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    prompt: `Factorise completely: ${expression}`, purpose: "",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: key, workedSolution: ["a", "b"],
      diagnostics: { itemKind: "FACTORISE", expression, skillId: "FAC_PERFECT_SQUARE_MINUS", taggedSkills: [], stepSkills: ["FAC_PERFECT_SQUARE_MINUS"], level: "medium", origin: "AI", predictedMistakes: [] } } });
  const torn = (answer: string): LotusStudentResponse => ({ answer, working: "", confidence: 60, responseTimeMs: 20000, didNotKnow: false,
    gameReading: { kind: "SPLIT_CONFIDENCE", summary: "split", signals: ["torn"], certainty: 0.5, skillId: "FAC_PERFECT_SQUARE_MINUS", diagnosis: { effect: "NO_EVIDENCE", note: "Torn." }, facts: {} } } as unknown as LotusStudentResponse);
  it("names the difference-of-squares belief from the answer's shape", () => {
    const q = square("sq1", "9a^2 - 30a + 25", "(3a - 5)^2");
    const v = instantVerdict(q, { answer: "(3a - 5)(3a + 5)", working: "", confidence: 60, responseTimeMs: 9000, didNotKnow: false } as LotusStudentResponse);
    assert.equal(v.evidence.find((e) => e.kind === "MISTAKE")?.mistake, "WROTE_DIFF_OF_SQUARES");
    const sum = square("sq2", "x^2 + 36", "x^2 + 36");
    const s = instantVerdict(sum, { answer: "(x - 6)(x + 6)", working: "", confidence: 60, responseTimeMs: 9000, didNotKnow: false } as LotusStudentResponse);
    assert.equal(s.evidence.find((e) => e.kind === "MISTAKE")?.mistake, "NOT_DIFF_OF_SQUARES");
  });
  it("does not fire on a right answer or a different wrong one", () => {
    const q = square("sq3", "9a^2 - 30a + 25", "(3a - 5)^2");
    assert.equal(instantVerdict(q, { answer: "(3a - 5)^2", working: "", confidence: 60, responseTimeMs: 9000, didNotKnow: false } as LotusStudentResponse).evidence.some((e) => e.kind === "MISTAKE"), false);
    assert.equal(instantVerdict(q, { answer: "(3a - 5)(3a - 4)", working: "", confidence: 60, responseTimeMs: 9000, didNotKnow: false } as LotusStudentResponse).evidence.some((e) => e.mistake === "WROTE_DIFF_OF_SQUARES"), false);
  });
  it("a torn split on a wrong answer keeps the mistake as a doubt and asks for a review when none is named", () => {
    const q = square("sq4", "9a^2 - 30a + 25", "(3a - 5)^2");
    const named = instantVerdict(q, torn("(3a - 5)(3a + 5)"));
    assert.equal(named.evidence.find((e) => e.kind === "MISTAKE")?.mistake, "WROTE_DIFF_OF_SQUARES");
    assert.match(named.evidence[0]!.description!, /doubt/);
    const unnamed = instantVerdict(q, torn("(3a - 5)(3a - 4)"));
    assert.equal(unnamed.needsAnalysis, true);
    const right = instantVerdict(q, torn("(3a - 5)^2"));
    assert.deepEqual(right.evidence, []);
    assert.equal(right.needsAnalysis, false);
  });
});

describe("Lotus typed don't-know", () => {
  const q = letters("dk1");
  (q.answerKey.diagnostics as { expression: string }).expression = "8x^2 + 20x + 12";
  const drafts = [{ t: 9000, v: "2(2x" }, { t: 20000, v: "2(2x^2 + 10x + 6)" }, { t: 32000, v: "" }, { t: 60000, v: "idk" }];
  const r = resolveLotusResponse(q, { answer: "idk", working: "2(2x^2 + 10x + 6) there is no integer that multiplies to 12 and adds to 10", confidence: 25, responseTimeMs: 61000, didNotKnow: false, typing: drafts } as LotusStudentResponse);
  it("'idk' is a don't-know with the drafts and working kept, and a review reads them", () => {
    const v = instantVerdict(q, r);
    assert.equal(v.verification.status, "NO_ANSWER");
    assert.deepEqual(v.evidence.map((e) => [e.kind, e.skillId]), [["DID_NOT_KNOW", "FAC_GCF_VARIABLE"]]);
    assert.ok(r.typing && r.typing.length === 4, "the typing record is kept");
    assert.equal(r.typingReading?.facts.drafts, 1);
    assert.equal(v.needsAnalysis, true);
    const bare = instantVerdict(q, resolveLotusResponse(q, { answer: "I don't know.", working: "", confidence: 25, responseTimeMs: 5000, didNotKnow: false } as LotusStudentResponse));
    assert.equal(bare.verification.status, "NO_ANSWER");
    assert.equal(bare.needsAnalysis, false, "nothing to read");
  });
  it("the format guide treats it as a don't-know", () => {
    const v = instantVerdict(q, r);
    const need = evidenceFormatNeed([{ question: q, response: r, verification: v.verification, skillEvidence: v.evidence } as unknown as LotusQuestionAudit]);
    assert.match(need!.reason, /didn't know/);
  });
  it("real short answers are not swallowed", async () => {
    const { isDontKnowText } = await import("../../src/lotus/lotus-factorisation");
    for (const real of ["1", "x", "2x", "2(x + 3)", "I don't know why it is 2"]) assert.equal(isDontKnowText(real), false, real);
    for (const dk of ["IDK", " idk ", "i dont know", "I don’t know!", "dunno", "no idea", "?", "??"]) assert.equal(isDontKnowText(dk), true, dk);
  });
});

describe("Lotus student view states where a question came from", () => {
  it("redaction strips the diagnostics but keeps the provenance", async () => {
    const { redactQuestion } = await import("../../src/lotus/lotus.service");
    const ai = redactQuestion(letters("p1"));
    assert.equal(ai.provenance, "AI_GENERATED_FOR_SESSION");
    assert.equal(ai.answerKey.diagnostics, undefined);
    const bank = letters("p2");
    (bank.answerKey.diagnostics as { provenance?: string }).provenance = "AI_REUSED_FROM_BANK";
    assert.equal(redactQuestion(bank).provenance, "AI_REUSED_FROM_BANK");
    const code = letters("p3");
    (code.answerKey.diagnostics as { origin: string }).origin = "CODE";
    assert.equal(redactQuestion(code).provenance, "CODE_BUILT_GAME");
  });
});

describe("Lotus decisions follow the item that was actually installed", () => {
  it("a code-built or bank item installed before the decision existed flips it to INSTALLED", () => {
    const q = letters("i1");
    const built = { ...letters("i2"), id: "built1" } as LotusQuestion;
    (built.answerKey.diagnostics as { origin: string; provenance: string }).origin = "CODE";
    (built.answerKey.diagnostics as { origin: string; provenance: string }).provenance = "CODE_BUILT_GAME";
    const f = {
      state: { planTurn: 4, answeredTurns: [], handledConfirmed: [], handledBroadened: [], fastSkips: 0,
        turns: [{ turn: 7, slot: 7, status: "REPURPOSED" as const, purpose: "DESCENT" as const, version: 2 }] },
      versions: { "7": [built] }, preferred: { "7": "built1" },
    };
    const audit = { question: q, adaptiveDecision: { action: "EASIER_PREREQUISITE", targetTurn: 7, implementation: "QUEUED_FOR_GENERATION", outcome: "QUEUED", implementationDetail: "queued", observedError: "", alternatives: [], rationale: "", expectedInformationGain: "", source: "RULE_VALIDATED_PLAN" } } as unknown as LotusQuestionAudit;
    reconcileInstalledDecision(f as never, audit);
    assert.equal(audit.adaptiveDecision!.implementation, "APPLIED");
    assert.equal(audit.adaptiveDecision!.outcome, "INSTALLED");
    assert.ok(audit.adaptiveDecision!.validatedAt && audit.adaptiveDecision!.installedAt);
    assert.match(audit.adaptiveDecision!.implementationDetail, /built and checked by code/);
    // Still waiting when the slot is held back (not yet installed).
    f.state.turns[0]!.status = "SKIPPED" as never;
    const waiting = { adaptiveDecision: { ...audit.adaptiveDecision, implementation: "QUEUED_FOR_GENERATION", outcome: "QUEUED" } } as unknown as LotusQuestionAudit;
    reconcileInstalledDecision(f as never, waiting);
    assert.equal(waiting.adaptiveDecision!.implementation, "QUEUED_FOR_GENERATION");
  });
});

describe("Lotus forced checks name who decided", () => {
  const q = letters("u3");
  const state: FactorisationState = {
    planTurn: 1, answeredTurns: [1], handledConfirmed: [], handledBroadened: [], fastSkips: 0,
    turns: [1, 2, 3, 4, 5].map((turn) => ({ turn, slot: turn, status: "PLANNED" as const, version: 1 })),
  };
  const run = (decidedBy: Record<string, "AI" | "CODE">) => {
    const v = instantVerdict(q, send(q, "x(6x + 10y)"));
    const audits = [{ question: q, response: send(q, "x(6x + 10y)"), verification: v.verification, skillEvidence: v.evidence }] as unknown as LotusQuestionAudit[];
    return planAdjustments({
      state, ledger: foldLedger(audits), forceCheckSkills: ["FAC_GCF_NUMERIC"], forceCheckDecidedBy: decidedBy,
      itemAt: () => undefined, askedItems: [q], freezeNext: true,
    });
  };
  it("code's own evidence is not described as an AI request", () => {
    const action = run({ FAC_GCF_NUMERIC: "CODE" }).find((a) => a.kind === "REPURPOSE");
    if (action?.kind === "REPURPOSE") {
      assert.match(action.reason, /^Code's evidence rules/);
      assert.doesNotMatch(action.reason, /AI review/);
    }
  });
  it("evidence from the AI review is credited to it", () => {
    const action = run({ FAC_GCF_NUMERIC: "AI" }).find((a) => a.kind === "REPURPOSE");
    if (action?.kind === "REPURPOSE") assert.match(action.reason, /^The AI review requested/);
  });
});
