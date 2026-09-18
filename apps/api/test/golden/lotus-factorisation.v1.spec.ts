/**
 * The factorisation skill tracker's rules, with no AI and no service:
 * what one answer proves, when a gap is suspected or confirmed, and how the
 * unseen part of the test changes in response.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusQuestionAudit, LotusSkillEvidence, LotusStudentResponse } from "@cogna/shared";
import {
  FACTORISATION_SLOTS,
} from "../../src/lotus/lotus-factorisation-catalogue";
import {
  type FactorisationState,
  type Ledger,
  buildFactorisationReport,
  evidenceFromAnalysis,
  foldLedger,
  instantVerdict,
  nextOpenTurn,
  planAdjustments,
} from "../../src/lotus/lotus-factorisation";

let nextId = 0;
const withId = (item: Omit<LotusQuestion, "id">): LotusQuestion => ({ ...item, id: `q${(nextId += 1)}` });

/**
 * Controlled AI-style items used only by this pure policy suite. Runtime
 * questions must come through the writer and validator; keeping fixtures
 * here stops a deleted product fallback bank from silently returning.
 */
function controlledItem(slot: number): LotusQuestion {
  const spec = FACTORISATION_SLOTS[slot - 1]!;
  const base = {
    phase: spec.phase,
    subtopic: spec.skillId,
    purpose: "Controlled test item",
    asksForWorking: spec.kind !== "CHOICE",
  } as const;
  const generic = {
    ...base,
    type: "CONSTRUCTED_RESPONSE" as const,
    prompt: `Factorise completely: ${spec.shape}`,
    answerKey: {
      kind: "OPEN_RESPONSE" as const,
      canonicalAnswer: "x",
      workedSolution: ["Controlled step"],
      diagnostics: {
        itemKind: spec.kind,
        expression: spec.shape,
        skillId: spec.skillId,
        taggedSkills: spec.tagged,
        stepSkills: [spec.skillId],
        slot: spec.slot,
        level: spec.level,
        origin: "AI" as const,
        predictedMistakes: spec.mistakes.slice(0, 2).map((mistake) => ({ answer: "wrong", mistake })),
      },
    },
  };
  if (slot === 1) return withId({
    ...base, type: "CONSTRUCTED_RESPONSE", prompt: "Factorise completely: 6x + 9",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "3(2x + 3)", workedSolution: ["6x + 9 = 3(2x + 3)"], diagnostics: {
      ...generic.answerKey.diagnostics, itemKind: "FACTORISE", expression: "6x + 9",
      stepSkills: ["FAC_GCF_NUMERIC", "FAC_DIVIDE_TERMS"],
      predictedMistakes: [{ answer: "3(2x + 9)", mistake: "DIVIDED_FIRST_TERM_ONLY" }, { answer: "6(x + 9)", mistake: "COMMON_NOT_HIGHEST" }],
    } },
  });
  if (slot === 4) return withId({
    ...base, type: "CONSTRUCTED_RESPONSE", prompt: "Factorise completely: 10x^2 - 18x^3 + 14x^4",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "2x^2(5 - 9x + 7x^2)", workedSolution: ["Find 2x^2", "Divide each term", "2x^2(5 - 9x + 7x^2)"], diagnostics: {
      ...generic.answerKey.diagnostics, itemKind: "FACTORISE", expression: "10x^2 - 18x^3 + 14x^4",
      stepSkills: ["FAC_GCF_NUMERIC", "FAC_GCF_VARIABLE", "FAC_DIVIDE_TERMS"],
    } },
  });
  if (slot === 12) return withId({
    ...base, type: "MULTIPLE_CHOICE", asksForWorking: false, prompt: "Which two numbers have a product of 12 and a sum of -7?", options: ["-3 and -4", "3 and 4", "-2 and -6", "1 and 12"],
    answerKey: { kind: "MULTIPLE_CHOICE", canonicalAnswer: "-3 and -4", workedSolution: ["-3 × -4 = 12 and -3 + -4 = -7"], diagnostics: {
      ...generic.answerKey.diagnostics, itemKind: "CHOICE", expression: undefined,
      predictedMistakes: [{ answer: "3 and 4", mistake: "SIGN_PAIR_ERROR" }, { answer: "-2 and -6", mistake: "WRONG_FACTOR_PAIR_SUM" }],
    } },
  });
  if (slot === 20) return withId({
    ...base, type: "CONSTRUCTED_RESPONSE", prompt: "Factorise completely: 3x^2 - 12",
    answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "3(x - 2)(x + 2)", workedSolution: ["3(x^2 - 4)", "3(x - 2)(x + 2)"], diagnostics: {
      ...generic.answerKey.diagnostics, itemKind: "FACTORISE", expression: "3x^2 - 12",
      stepSkills: ["FAC_COMMON_MONOMIAL", "FAC_DIFF_SQUARES", "FAC_FACTOR_FULLY"],
      predictedMistakes: [{ answer: "3(x^2 - 4)", mistake: "INCOMPLETE_FACTORISATION" }, { answer: "3(x - 2)^2", mistake: "WROTE_PERFECT_SQUARE" }],
    } },
  });
  return withId(generic);
}

const slotItem = (slot: number) => controlledItem(slot);

function respond(answer: string, extra: Partial<LotusStudentResponse> = {}): LotusStudentResponse {
  return { answer, working: "my working", confidence: 60, responseTimeMs: 40_000, didNotKnow: false, ...extra };
}

function audit(skillEvidence: LotusSkillEvidence[]): LotusQuestionAudit {
  return { skillEvidence } as unknown as LotusQuestionAudit;
}

const mistake = (skillId: string, code = "SOME_MISTAKE"): LotusSkillEvidence => ({ skillId, kind: "MISTAKE", mistake: code, source: "INSTANT" });
const secure = (skillId: string): LotusSkillEvidence => ({ skillId, kind: "SECURE", source: "INSTANT" });

function freshState(planTurn: number): FactorisationState {
  return {
    planTurn,
    turns: FACTORISATION_SLOTS.map((spec) => ({ turn: spec.slot, slot: spec.slot, status: "PLANNED" as const, version: 0 })),
    answeredTurns: [],
    handledConfirmed: [],
    fastSkips: 0,
  };
}

function planFixture(planTurn: number) {
  const items = new Map(FACTORISATION_SLOTS.map((spec) => [spec.slot, controlledItem(spec.slot)]));
  const state = freshState(planTurn);
  const asked = [...items.entries()].filter(([turn]) => turn <= planTurn).map(([, item]) => item);
  return { state, itemAt: (turn: number) => items.get(turn), askedItems: asked };
}

describe("instantVerdict — what code alone learns from one answer", () => {
  const opener = controlledItem(1); // 6x + 9

  it("a right answer is proven by expanding and makes every skill it used secure", () => {
    const verdict = instantVerdict(opener, respond("3(2x+3)"));
    assert.equal(verdict.verification.status, "VERIFIED_CORRECT");
    assert.equal(verdict.verification.method, "DETERMINISTIC_ALGEBRA");
    assert.deepEqual(verdict.evidence.map((e) => e.kind), ["SECURE", "SECURE"]);
    assert.equal(verdict.needsAnalysis, false);
  });

  it("a predicted wrong answer names the mistake straight away", () => {
    const verdict = instantVerdict(opener, respond("3(2x + 9)"));
    assert.equal(verdict.verification.status, "VERIFIED_INCORRECT");
    assert.deepEqual(verdict.evidence, [{ skillId: "FAC_DIVIDE_TERMS", kind: "MISTAKE", mistake: "DIVIDED_FIRST_TERM_ONLY", source: "INSTANT", description: "Wrote 3(2x + 9)." }]);
    assert.equal(verdict.needsAnalysis, false);
  });

  it("the verification never names the mistake, because past verifications are shown to the student", () => {
    const verdict = instantVerdict(slotItem(12), respond("3 and 4"));
    assert.equal(verdict.verification.status, "VERIFIED_INCORRECT");
    assert.doesNotMatch(verdict.verification.explanation, /SIGN_PAIR_ERROR/);
    assert.equal(verdict.evidence[0]!.mistake, "SIGN_PAIR_ERROR");
  });

  it("an equal but unfinished answer is its own verdict, with the 'unfinished' mistake", () => {
    const verdict = instantVerdict(slotItem(20), respond("3(x^2 - 4)")); // 3x² − 12
    assert.equal(verdict.verification.status, "VERIFIED_UNFINISHED");
    assert.equal(verdict.evidence[0]!.mistake, "INCOMPLETE_FACTORISATION");
    assert.equal(verdict.evidence[0]!.skillId, "FAC_FACTOR_FULLY");
  });

  it("an unpredicted wrong answer has no evidence yet — the AI review has to explain it", () => {
    const verdict = instantVerdict(opener, respond("3(2x + 4)"));
    assert.equal(verdict.verification.status, "VERIFIED_INCORRECT");
    assert.deepEqual(verdict.evidence, []);
    assert.equal(verdict.needsAnalysis, true);
  });

  it("an explicit I-don't-know response is evidence regardless of speed", () => {
    const verdict = instantVerdict(opener, respond("I don't know", { didNotKnow: true, working: "", responseTimeMs: 4_000 }));
    assert.equal(verdict.fastSkip, false);
    assert.equal(verdict.evidence[0]?.kind, "DID_NOT_KNOW");
  });

  it("'I don't know' after really trying counts against the question's skill", () => {
    const verdict = instantVerdict(opener, respond("I don't know", { didNotKnow: true, working: "", responseTimeMs: 60_000 }));
    assert.equal(verdict.fastSkip, false);
    assert.equal(verdict.evidence[0]!.kind, "DID_NOT_KNOW");
  });
});

describe("evidenceFromAnalysis — the AI points at a step, the step's tag names the skill", () => {
  const item = slotItem(4); // steps: GCF_NUMERIC, GCF_VARIABLE, DIVIDE_TERMS, COMMON_MONOMIAL

  it("maps the first wrong step to that step's skill", () => {
    assert.equal(evidenceFromAnalysis(item, [], 2, "Took the highest power.")[0]!.skillId, "FAC_GCF_VARIABLE");
  });

  it("accepts a step number sent as text", () => {
    assert.equal(evidenceFromAnalysis(item, [], "3", undefined)[0]!.skillId, "FAC_DIVIDE_TERMS");
  });

  it("never overrides what code already proved", () => {
    const proven = [secure("FAC_COMMON_MONOMIAL")];
    assert.equal(evidenceFromAnalysis(item, proven, 2, "x"), proven);
  });

  it("no wrong step means no new evidence", () => {
    assert.deepEqual(evidenceFromAnalysis(item, [], null, ""), []);
    assert.deepEqual(evidenceFromAnalysis(item, [], 0, ""), []);
  });
});

describe("foldLedger — one mistake is a suspicion, two is a gap", () => {
  it("one mistake only makes a skill SUSPECTED", () => {
    assert.equal(foldLedger([audit([mistake("FAC_DIFF_SQUARES")])]).get("FAC_DIFF_SQUARES")!.state, "SUSPECTED");
  });

  it("the same skill going wrong on a later question confirms it", () => {
    const ledger = foldLedger([audit([mistake("FAC_DIFF_SQUARES")]), audit([]), audit([mistake("FAC_DIFF_SQUARES")])]);
    assert.equal(ledger.get("FAC_DIFF_SQUARES")!.state, "CONFIRMED");
    assert.equal(ledger.get("FAC_DIFF_SQUARES")!.confirmedAt, 3);
  });

  it("a later right answer clears the suspicion as a slip", () => {
    const entry = foldLedger([audit([mistake("FAC_DIFF_SQUARES")]), audit([secure("FAC_DIFF_SQUARES")])]).get("FAC_DIFF_SQUARES")!;
    assert.equal(entry.state, "SECURE");
    assert.equal(entry.clearedAfterSlip, 1);
  });

  it("a confirmed gap stays confirmed after a later success", () => {
    const ledger = foldLedger([
      audit([mistake("FAC_DIFF_SQUARES")]), audit([mistake("FAC_DIFF_SQUARES")]), audit([secure("FAC_DIFF_SQUARES")]),
    ]);
    assert.equal(ledger.get("FAC_DIFF_SQUARES")!.state, "CONFIRMED");
  });
});

describe("planAdjustments — changing only questions the student hasn't reached", () => {
  it("a suspicion with no later question on that skill gets a re-check, beyond the frozen next question", () => {
    const { state, itemAt, askedItems } = planFixture(24);
    const ledger: Ledger = foldLedger([audit([mistake("FAC_GCF_NEGATIVE", "FLIPPED_ONE_SIGN")])]);
    const actions = planAdjustments({ state, ledger, itemAt, askedItems });
    // Turn 24 is on screen and 25 is frozen, so there is nowhere left to put a check.
    assert.deepEqual(actions, []);

    const early = planFixture(18);
    const earlyActions = planAdjustments({ state: early.state, ledger, itemAt: early.itemAt, askedItems: early.askedItems });
    const check = earlyActions.find((a) => a.kind === "REPURPOSE" && a.purpose === "CHECK");
    assert.ok(check, "expected a re-check");
    assert.ok(check.turn > 19, `re-check at turn ${check.turn} must be after the frozen next turn 19`);
    assert.equal(check.kind === "REPURPOSE" && check.forSkill, "FAC_GCF_NEGATIVE");
  });

  it("a suspicion that a later planned question already tests needs no change", () => {
    const { state, itemAt, askedItems } = planFixture(2);
    const ledger = foldLedger([audit([mistake("FAC_DIFF_SQUARES", "DROPPED_SQUARE")])]);
    assert.deepEqual(planAdjustments({ state, ledger, itemAt, askedItems }), []);
  });

  it("a confirmed gap removes dependent questions, goes down to the skills underneath, and never touches the next question", () => {
    const { state, itemAt, askedItems } = planFixture(3);
    const ledger = foldLedger([
      audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
      audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
    ]);
    const actions = planAdjustments({ state, ledger, itemAt, askedItems });
    assert.ok(actions.every((a) => a.turn > 4), "turn 3 is on screen and turn 4 is frozen");
    const skipped = actions.filter((a) => a.kind === "SKIP").map((a) => a.turn);
    assert.ok(skipped.includes(8), "grouping needs dividing every term");
    assert.ok(skipped.includes(17), "grouping with a minus needs dividing every term");
    const descents = actions.filter((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT");
    // Fresh AI-written prerequisite probes can revisit the nearest skill in a
    // new numerical form; no retired fixed foundation item is installed.
    assert.deepEqual(descents.map((d) => d.kind === "REPURPOSE" && d.forSkill), ["FAC_GCF_VARIABLE"]);
    // −4x − 8 and the common-bracket question both need dividing every term, so their turns are freed and reused to go down.
    assert.deepEqual(descents.map((d) => d.turn), [5]);
    const rewrites = actions.filter((a) => a.kind === "REPURPOSE" && a.purpose === "AVOID");
    assert.ok(rewrites.every((a) => a.kind === "REPURPOSE" && a.avoidSkill === "FAC_DIVIDE_TERMS" && a.skipUntilReady));
    assert.deepEqual(state.handledConfirmed, ["FAC_DIVIDE_TERMS"]);
    // Handled once: the same ledger doesn't prune again.
    assert.deepEqual(planAdjustments({ state, ledger, itemAt, askedItems }), []);
  });

  it("right after an answer, the question after next may change too", () => {
    const { state, itemAt, askedItems } = planFixture(3);
    const ledger = foldLedger([
      audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
      audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
    ]);
    const actions = planAdjustments({ state, ledger, itemAt, askedItems, freezeNext: false });
    assert.ok(actions.some((a) => a.turn === 4), "turn 4 (10x² − 18x³ + 14x⁴) depends on dividing terms");
    assert.ok(actions.every((a) => a.turn > 3));
  });

  it("going down tries the skills directly underneath first, when they have an unused question", () => {
    const { state, itemAt, askedItems } = planFixture(3);
    const ledger = foldLedger([
      audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
      audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
    ]);
    const notSlot2 = askedItems.filter((item) => item.answerKey.diagnostics?.slot !== 2);
    const descents = planAdjustments({ state, ledger, itemAt, askedItems: notSlot2 })
      .filter((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT")
      .map((a) => a.kind === "REPURPOSE" && a.forSkill);
    assert.deepEqual(descents, ["FAC_GCF_VARIABLE"]);
  });

  it("a skill already secure is solid ground: nothing below it is checked", () => {
    const { state, itemAt, askedItems } = planFixture(3);
    const ledger = foldLedger([
      audit([secure("FAC_GCF_NUMERIC"), secure("FAC_GCF_VARIABLE"), secure("FND_EXPONENT_PRODUCT"), mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
      audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]),
    ]);
    const descents = planAdjustments({ state, ledger, itemAt, askedItems }).filter((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT");
    assert.deepEqual(descents, []);
  });

  it("descent never invents a retired fixed foundation item when no safe AI slot exists", () => {
    const { state, itemAt, askedItems } = planFixture(13);
    const ledger = foldLedger([
      audit([mistake("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR")]),
      audit([mistake("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR")]),
    ]);
    const descents = planAdjustments({ state, ledger, itemAt, askedItems }).filter((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT");
    assert.deepEqual(descents, []);
  });
});

describe("buildFactorisationReport", () => {
  it("reports a confirmed gap, and lists removed questions as not tested rather than wrong", () => {
    const state = freshState(10);
    state.turns[16]!.status = "SKIPPED"; // slot 17, grouping with a minus
    state.turns[16]!.reason = "Not tested: it depends on Taking out a negative common factor, which isn't secure yet.";
    const ledger = foldLedger([
      audit([mistake("FAC_GCF_NEGATIVE", "FLIPPED_ONE_SIGN")]),
      audit([secure("FAC_DIFF_SQUARES")]),
      audit([mistake("FAC_GCF_NEGATIVE", "KEPT_ORIGINAL_SIGNS")]),
    ]);
    const report = buildFactorisationReport({ ledger, state, pendingAnalyses: 1 });
    assert.equal(report.outcome, "SOLID_GAP");
    assert.match(report.startingPoint, /negative common factor/i);
    assert.equal(report.notTested!.length, 1);
    assert.match(report.notTested![0]!, /^Grouping when the second pair starts with a minus — not tested/);
    assert.ok(report.skills!.some((s) => s.skillId === "FAC_GROUP_SIGN" && s.state === "NOT_TESTED_DEPENDENCY"));
    assert.ok(report.limitations.some((l) => /1 answer\(s\) didn't finish/.test(l)));
  });

  it("a skill tested elsewhere isn't listed as not tested", () => {
    const state = freshState(10);
    state.turns[9]!.status = "SKIPPED"; // slot 10, a harder difference of squares
    state.turns[9]!.reason = "Not tested: something.";
    const ledger = foldLedger([audit([secure("FAC_DIFF_SQUARES")])]);
    assert.deepEqual(buildFactorisationReport({ ledger, state, pendingAnalyses: 0 }).notTested, []);
  });

  it("one unconfirmed mistake is never reported as a gap", () => {
    const report = buildFactorisationReport({ ledger: foldLedger([audit([mistake("FAC_DIFF_SQUARES")])]), state: freshState(5), pendingAnalyses: 0 });
    assert.notEqual(report.outcome, "SOLID_GAP");
    assert.equal(report.uncertainAreas.length, 1);
  });

  it("nextOpenTurn skips removed turns", () => {
    const state = freshState(3);
    state.turns[3]!.status = "SKIPPED";
    assert.equal(nextOpenTurn(state, 3), 5);
    assert.equal(nextOpenTurn(state, 25), null);
  });
});
