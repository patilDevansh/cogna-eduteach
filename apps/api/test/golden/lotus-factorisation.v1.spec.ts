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
  assertFixedItemIsValid,
} from "../../src/lotus/lotus-factorisation-catalogue";
import {
  type FactorisationState,
  type Ledger,
  buildFactorisationReport,
  evidenceFromAnalysis,
  factorisationStopReason,
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
const support = (skillId: string): LotusSkillEvidence => ({ skillId, kind: "DID_NOT_KNOW", source: "INSTANT" });

function freshState(planTurn: number): FactorisationState {
  return {
    planTurn,
    turns: FACTORISATION_SLOTS.map((spec) => ({ turn: spec.slot, slot: spec.slot, status: "PLANNED" as const, version: 0 })),
    answeredTurns: [],
    handledConfirmed: [],
    handledBroadened: [],
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

  it("a mistake that recurs after being cleared as a slip confirms, instead of restarting the cycle", () => {
    const ledger = foldLedger([
      audit([mistake("FAC_DIFF_SQUARES")]), audit([secure("FAC_DIFF_SQUARES")]), audit([mistake("FAC_DIFF_SQUARES")]),
    ]);
    const entry = ledger.get("FAC_DIFF_SQUARES")!;
    assert.equal(entry.state, "CONFIRMED");
    assert.equal(entry.confirmedAt, 3);
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

  it("a pure support signal schedules one easier prerequisite without calling it a gap", () => {
    const { state, itemAt, askedItems } = planFixture(1);
    const ledger = foldLedger([audit([support("FAC_DIVIDE_TERMS")])]);
    assert.equal(ledger.get("FAC_DIVIDE_TERMS")!.state, "UNTESTED");
    const actions = planAdjustments({ state, ledger, itemAt, askedItems });
    const descent = actions.find((action) => action.kind === "REPURPOSE" && action.purpose === "DESCENT");
    assert.ok(descent, "an explicit support request should lead to one lower prerequisite check");
    assert.ok(descent.turn > 2, "the immediately staged question remains protected");
    if (descent.kind === "REPURPOSE") {
      state.turns.find((turn) => turn.turn === descent.turn)!.purpose = "DESCENT";
      state.turns.find((turn) => turn.turn === descent.turn)!.forSkill = descent.forSkill;
    }
    assert.equal(
      planAdjustments({ state, ledger, itemAt, askedItems })
        .filter((action) => action.kind === "REPURPOSE" && action.purpose === "DESCENT").length,
      0,
      "the reserved support probe must prevent duplicate descent questions",
    );
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
    // Going down reaches the number-common-to-every-term skill too: the 25 slots never ask
    // about it, so it is checked with a short code-made question (lotus-skill-checks.ts)
    // instead of being passed over. No hardcoded foundation item is installed.
    assert.deepEqual(descents.map((d) => d.kind === "REPURPOSE" && d.forSkill), ["FAC_GCF_NUMERIC", "FAC_GCF_VARIABLE"]);
    // −4x − 8 and the common-bracket question both need dividing every term, so their turns are freed and reused to go down.
    assert.deepEqual(descents.map((d) => d.turn), [5, 7]);
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
    assert.deepEqual(descents, ["FAC_GCF_NUMERIC", "FAC_GCF_VARIABLE"]);
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

  it("a sign error under a trinomial goes down to signed numbers first, with short code-made checks", () => {
    const { state, itemAt, askedItems } = planFixture(13);
    const ledger = foldLedger([
      audit([mistake("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR")]),
      audit([mistake("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR")]),
    ]);
    const descents = planAdjustments({ state, ledger, itemAt, askedItems }).filter((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT");
    // The gap's own mistake points at signs, so the sign skills come before reading b and c or factor pairs.
    assert.deepEqual(descents.map((d) => d.kind === "REPURPOSE" && d.forSkill), ["FND_SIGN_MUL_DIV", "FND_SIGN_ADD_SUB"]);
    for (const d of descents) {
      assert.ok(d.kind === "REPURPOSE" && d.spec && d.spec.slot >= 100, "a check slot, never one of the 25 plan slots");
      assert.deepEqual(d.kind === "REPURPOSE" && d.spec?.mistakes, [], "the writer picks a condition that shows the mistake being checked");
    }
  });

  it("a gap that doesn't point at a shared pattern keeps its prerequisites in the listed order", () => {
    const { state, itemAt, askedItems } = planFixture(13);
    const ledger = foldLedger([
      audit([mistake("FAC_PAIR_PRODUCT_SUM", "WRONG_FACTOR_PAIR_SUM")]),
      audit([mistake("FAC_PAIR_PRODUCT_SUM", "WRONG_FACTOR_PAIR_SUM")]),
    ]);
    const descents = planAdjustments({ state, ledger, itemAt, askedItems }).filter((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT");
    assert.deepEqual(descents.map((d) => d.kind === "REPURPOSE" && d.forSkill), ["FAC_READ_ABC_SIGNS", "FND_FACTOR_PAIRS"]);
  });

  it("two confirmed skills sharing an untested prerequisite install only one descent turn for it, not two", () => {
    // FAC_GCF_NEGATIVE and FAC_COMMON_MONOMIAL both dependsOn FAC_DIVIDE_TERMS
    // directly (lotus-factorisation-catalogue.ts), and neither depends on the
    // other — so both become independent CONFIRMED ledger entries from the
    // same fold, each separately eligible to descend into the same
    // prerequisite. Before the fix, the per-call CHECK dedup guard didn't
    // extend to DESCENT, so both entries' iterations would each claim their
    // own turn for FAC_DIVIDE_TERMS in the same replan.
    const { state, itemAt, askedItems } = planFixture(3);
    const ledger = foldLedger([
      audit([mistake("FAC_GCF_NEGATIVE", "KEPT_ORIGINAL_SIGNS")]),
      audit([mistake("FAC_GCF_NEGATIVE", "KEPT_ORIGINAL_SIGNS")]),
      audit([mistake("FAC_COMMON_MONOMIAL", "PARTIAL_GCF")]),
      audit([mistake("FAC_COMMON_MONOMIAL", "PARTIAL_GCF")]),
    ]);
    assert.equal(ledger.get("FAC_GCF_NEGATIVE")!.state, "CONFIRMED");
    assert.equal(ledger.get("FAC_COMMON_MONOMIAL")!.state, "CONFIRMED");
    const descents = planAdjustments({ state, ledger, itemAt, askedItems })
      .filter((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT" && a.forSkill === "FAC_DIVIDE_TERMS");
    assert.equal(descents.length, 1, `expected exactly one DESCENT turn for the shared prerequisite, got ${descents.length}`);
  });
});

describe("assertFixedItemIsValid — a SIMPLIFY item's own canonical answer must actually be reduced", () => {
  // Regression coverage for the bug where this function validated a SIMPLIFY
  // item by calling classifySimplification(answer, expression, answer) — the
  // candidate compared against itself, so the UNFINISHED branch could never
  // fire (degree(s) <= degree(s) is always true). It now uses
  // classifyReducedForm, which compares against the original expression with
  // strict inequality instead.
  const expression = "(x^2 - 9) / (x^2 - 6x + 9)";
  const baseDiagnostics = {
    itemKind: "SIMPLIFY" as const,
    expression,
    skillId: "FAC_CANCEL_COMMON_FACTOR",
    taggedSkills: [] as string[],
    stepSkills: ["FAC_CANCEL_COMMON_FACTOR"],
    slot: 22,
    level: "hard" as const,
    origin: "AI" as const,
    predictedMistakes: [
      { answer: "1/x", mistake: "CANCELLED_TERMS_NOT_FACTORS" },
      { answer: "2/x", mistake: "DIVIDED_ONE_TERM_ONLY" },
    ],
  };
  const itemWith = (canonicalAnswer: string) => ({
    prompt: `Simplify: ${expression}`,
    answerKey: { canonicalAnswer, workedSolution: ["step"], diagnostics: baseDiagnostics },
  });

  it("rejects a claimed-reduced answer that is really just the unreduced original", () => {
    assert.throws(
      () => assertFixedItemIsValid(itemWith(expression), "test item"),
      /answer is UNFINISHED/,
    );
  });

  it("rejects a factored-but-uncancelled answer, even though it's algebraically equal", () => {
    assert.throws(
      () => assertFixedItemIsValid(itemWith("(x-3)(x+3)/((x-3)(x-3))"), "test item"),
      /answer is UNFINISHED/,
    );
  });

  it("accepts a genuinely reduced answer", () => {
    assert.doesNotThrow(() => assertFixedItemIsValid(itemWith("(x + 3)/(x - 3)"), "test item"));
  });
});

describe("planAdjustments — BROADEN: a correct transfer answer in a different representation", () => {
  it("a skill secured from a single correct answer gets a later check in a different catalogue shape", () => {
    const { state, itemAt, askedItems } = planFixture(9); // slot 9: FAC_DIFF_SQUARES, "x^2 - 9"
    const ledger = foldLedger([audit([secure("FAC_DIFF_SQUARES")])]);
    const actions = planAdjustments({ state, ledger, itemAt, askedItems });
    const widen = actions.find((a) => a.kind === "REPURPOSE" && a.purpose === "WIDEN");
    assert.ok(widen, "expected a BROADEN/WIDEN action");
    assert.equal(widen!.kind === "REPURPOSE" && widen!.forSkill, "FAC_DIFF_SQUARES");
    assert.equal(widen!.kind === "REPURPOSE" && widen!.spec?.slot, 10); // the other FAC_DIFF_SQUARES shape, "49a^2 - 25b^2"
    assert.deepEqual(state.handledBroadened, ["FAC_DIFF_SQUARES"]);
  });

  it("a skill secured on its only catalogue shape has no transfer target, so the plan is left unchanged (KEEP)", () => {
    const { state, itemAt, askedItems } = planFixture(11); // slot 11: FAC_PERFECT_SQUARE_PLUS, the only slot for that skill
    const ledger = foldLedger([audit([secure("FAC_PERFECT_SQUARE_PLUS")])]);
    const actions = planAdjustments({ state, ledger, itemAt, askedItems });
    assert.deepEqual(actions.filter((a) => a.kind === "REPURPOSE" && a.purpose === "WIDEN"), []);
    // The skill is still marked handled — an unavailable target is a considered decision, not a retry-forever.
    assert.deepEqual(state.handledBroadened, ["FAC_PERFECT_SQUARE_PLUS"]);
  });

  it("a skill secured after clearing an earlier slip is not offered a transfer check", () => {
    const { state, itemAt, askedItems } = planFixture(10);
    const ledger = foldLedger([audit([mistake("FAC_DIFF_SQUARES")]), audit([secure("FAC_DIFF_SQUARES")])]);
    const actions = planAdjustments({ state, ledger, itemAt, askedItems });
    assert.deepEqual(actions.filter((a) => a.kind === "REPURPOSE" && a.purpose === "WIDEN"), []);
  });

  it("never proposes a second widen for a skill already offered one — no duplicate transfer checks", () => {
    const { state, itemAt, askedItems } = planFixture(9);
    const ledger = foldLedger([audit([secure("FAC_DIFF_SQUARES")])]);
    const first = planAdjustments({ state, ledger, itemAt, askedItems });
    assert.equal(first.filter((a) => a.kind === "REPURPOSE" && a.purpose === "WIDEN").length, 1);
    // Same ledger, same (already-mutated) state — as a later background re-plan would call it again.
    const second = planAdjustments({ state, ledger, itemAt, askedItems });
    assert.deepEqual(second.filter((a) => a.kind === "REPURPOSE" && a.purpose === "WIDEN"), []);
  });
});

describe("fixes from the held-out scorecard v1", () => {
  /** An answered question that only needs these skills, with evidence: enough for the ledger's "which skills did this question need". */
  const answered = (skillId: string, tagged: string[], evidence: LotusSkillEvidence[]): LotusQuestionAudit =>
    ({ skillEvidence: evidence, question: { answerKey: { diagnostics: { skillId, taggedSkills: tagged, stepSkills: [skillId] } } } }) as unknown as LotusQuestionAudit;

  describe("a skill the test never asked about is named, not read as 'no gap found'", () => {
    const allButCancel = () => foldLedger(FACTORISATION_SLOTS.filter((s) => s.skillId !== "FAC_CANCEL_COMMON_FACTOR").map((s) => audit([secure(s.skillId)])));

    it("names it in the starting point, the uncertain areas, the next step, the limits and the skill list", () => {
      const report = buildFactorisationReport({ ledger: allButCancel(), state: freshState(25), pendingAnalyses: 0 });
      assert.equal(report.outcome, "ADVANCEMENT", "the outcome is not changed; the report says what it does not cover");
      assert.match(report.startingPoint, /Not asked in this test: cancelling factors, never terms/);
      assert.ok(report.uncertainAreas.some((a) => /Cancelling factors, never terms: not asked in this test/.test(a)));
      assert.match(report.recommendedNextStep, /cancelling factors, never terms wasn't asked/);
      assert.ok(report.limitations.some((l) => /planned but not asked/.test(l) && /cancelling factors/.test(l)));
      assert.deepEqual(report.skills!.filter((s) => s.skillId === "FAC_CANCEL_COMMON_FACTOR").map((s) => s.state), ["UNTESTED"]);
    });

    it("says nothing extra when every planned skill was asked", () => {
      const ledger = foldLedger(FACTORISATION_SLOTS.map((s) => audit([secure(s.skillId)])));
      const report = buildFactorisationReport({ ledger, state: freshState(25), pendingAnalyses: 0 });
      assert.doesNotMatch(report.startingPoint, /Not asked/);
      assert.equal(report.recommendedNextStep, "No teaching gap found in factorisation from this test.");
      assert.ok(!report.uncertainAreas.some((a) => /not asked in this test/.test(a)));
    });

    it("does not list a skill that was left out because it depends on a confirmed gap (that is 'not tested', already said)", () => {
      const state = freshState(10);
      state.turns[23]!.status = "SKIPPED"; // slot 24: cancelling
      state.turns[23]!.reason = "Not tested: it depends on something.";
      const report = buildFactorisationReport({ ledger: allButCancel(), state, pendingAnalyses: 0 });
      assert.ok(!report.uncertainAreas.some((a) => /Cancelling factors/.test(a)));
      assert.equal(report.notTested!.length, 1);
    });

    it("a catch-up asks only about its own skills, so nothing is 'not reached'", () => {
      const state = { ...freshState(10), focusSkills: ["FAC_DIVIDE_TERMS"] };
      const ledger = foldLedger([audit([secure("FAC_DIVIDE_TERMS")])]);
      const report = buildFactorisationReport({ ledger, state, pendingAnalyses: 0 });
      assert.ok(!report.uncertainAreas.some((a) => /not asked in this test/.test(a)));
    });
  });

  describe("widening a secure skill never uses up the only question left for a skill nobody has asked about", () => {
    it("takes a question that still has a sibling, not the sole question for an unasked skill", () => {
      const { state, itemAt, askedItems } = planFixture(9);
      const ledger = foldLedger([audit([secure("FAC_DIFF_SQUARES")])]);
      const widen = planAdjustments({ state, ledger, itemAt, askedItems }).find((a) => a.kind === "REPURPOSE" && a.purpose === "WIDEN");
      assert.ok(widen && widen.kind === "REPURPOSE");
      const skill = itemAt(widen.turn)!.answerKey.diagnostics!.skillId;
      const siblings = FACTORISATION_SLOTS.filter((s) => s.skillId === skill && s.slot !== widen.turn);
      assert.ok(siblings.length > 0, `${skill} (turn ${widen.turn}) still has another question`);
      // Turns 11 and 12 are the only questions for the perfect square with a plus and for product and sum.
      assert.ok(![11, 12].includes(widen.turn));
    });

    it("a real gap check still may take such a question when nothing else is left", () => {
      const { state, itemAt, askedItems } = planFixture(3);
      const ledger = foldLedger([audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")]), audit([mistake("FAC_DIVIDE_TERMS", "DIVIDED_FIRST_TERM_ONLY")])]);
      const actions = planAdjustments({ state, ledger, itemAt, askedItems });
      assert.ok(actions.some((a) => a.kind === "REPURPOSE" && a.purpose === "DESCENT"), "going down is unchanged");
    });
  });

  describe("the early stop waits while any confirmed gap has an untested prerequisite", () => {
    // GCF_VARIABLE is the most foundational confirmed gap and its prerequisite is secure; DIVIDE_TERMS is confirmed too,
    // and builds on the number-common skill, which nothing has asked about.
    const base = () => [
      audit([secure("FND_MIN_EXP_COMMON")]), audit([secure("FND_EXPONENT_PRODUCT")]),
      audit([mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")]), audit([mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")]),
      audit([mistake("FAC_DIVIDE_TERMS", "DROPPED_THE_ONE")]), audit([mistake("FAC_DIVIDE_TERMS", "DROPPED_THE_ONE")]),
      audit([secure("FAC_MEANING")]), audit([secure("FND_SIGN_MUL_DIV")]),
    ];

    it("keeps going while the other gap's prerequisite is untested", () => {
      assert.equal(factorisationStopReason(base(), 0), null);
    });

    it("stops once that prerequisite is settled", () => {
      const stop = factorisationStopReason([...base(), audit([secure("FAC_GCF_NUMERIC")])], 0);
      assert.equal(stop?.reason, "STARTING_POINT_FOUND");
    });

    it("a prerequisite that is itself a confirmed gap counts as settled", () => {
      const withGap = [...base(), audit([mistake("FAC_GCF_NUMERIC", "GAVE_LCM")]), audit([mistake("FAC_GCF_NUMERIC", "GAVE_LCM")]), audit([secure("FND_GCD_NUMERIC")])];
      // FAC_GCF_NUMERIC is now confirmed and is the most foundational start; its own prerequisite must be secure.
      assert.equal(foldLedger(withGap).get("FAC_GCF_NUMERIC")!.state, "CONFIRMED");
      assert.equal(factorisationStopReason(withGap, 0)?.reason, "STARTING_POINT_FOUND");
    });
  });

  describe("a gap whose only evidence could be another branch's doing is shown as suspected", () => {
    const gcd = () => [
      answered("FND_GCD_NUMERIC", [], [mistake("FND_GCD_NUMERIC", "GAVE_LCM")]),
      answered("FND_GCD_NUMERIC", [], [mistake("FND_GCD_NUMERIC", "GAVE_LCM")]),
    ];

    it("demotes it, names the cause, and keeps the cause confirmed", () => {
      // Both questions that went wrong on the letters skill also needed dividing every term, which builds on HCF.
      const ledger = foldLedger([...gcd(),
        answered("FAC_GCF_VARIABLE", ["FAC_DIVIDE_TERMS"], [mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")]),
        answered("FAC_GCF_VARIABLE", ["FAC_DIVIDE_TERMS"], [mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")])]);
      assert.equal(ledger.get("FND_GCD_NUMERIC")!.state, "CONFIRMED");
      const letters = ledger.get("FAC_GCF_VARIABLE")!;
      assert.equal(letters.state, "SUSPECTED");
      assert.equal(letters.explainedBy, "FND_GCD_NUMERIC");
      assert.ok(letters.notes.some((n) => /may be the cause/.test(n)));
      const report = buildFactorisationReport({ ledger, state: freshState(10), pendingAnalyses: 0 });
      assert.ok(report.uncertainAreas.some((a) => /Finding the letters common to every term: unclear/.test(a) && /confirmed gap/.test(a)));
      assert.ok(!report.skills!.some((s) => s.skillId === "FAC_GCF_VARIABLE" && s.state === "CONFIRMED"));
    });

    it("keeps it confirmed if any mistake came on a question that needed nothing from the other gap", () => {
      const ledger = foldLedger([...gcd(),
        answered("FAC_GCF_VARIABLE", ["FAC_DIVIDE_TERMS"], [mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")]),
        answered("FAC_GCF_VARIABLE", [], [mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")])]);
      assert.equal(ledger.get("FAC_GCF_VARIABLE")!.state, "CONFIRMED");
      assert.equal(ledger.get("FAC_GCF_VARIABLE")!.explainedBy, undefined);
    });

    it("leaves alone a skill built on the gap: that is one cause, many gaps, and the report starts at the root", () => {
      const ledger = foldLedger([
        answered("FND_SIGN_MUL_DIV", [], [mistake("FND_SIGN_MUL_DIV", "SIGN_PRODUCT_ERROR")]),
        answered("FND_SIGN_MUL_DIV", [], [mistake("FND_SIGN_MUL_DIV", "SIGN_PRODUCT_ERROR")]),
        answered("FAC_GCF_NEGATIVE", ["FND_SIGN_MUL_DIV"], [mistake("FAC_GCF_NEGATIVE", "KEPT_ORIGINAL_SIGNS")]),
        answered("FAC_GCF_NEGATIVE", ["FND_SIGN_MUL_DIV"], [mistake("FAC_GCF_NEGATIVE", "KEPT_ORIGINAL_SIGNS")]),
      ]);
      assert.equal(ledger.get("FAC_GCF_NEGATIVE")!.state, "CONFIRMED");
    });

    it("leaves alone a skill the other gap is built on: its prerequisite may be the real cause", () => {
      // Dividing every term is confirmed and builds on the letters skill; the letters skill's own questions also tagged it.
      const ledger = foldLedger([
        answered("FAC_DIVIDE_TERMS", [], [mistake("FAC_DIVIDE_TERMS", "DROPPED_THE_ONE")]),
        answered("FAC_DIVIDE_TERMS", [], [mistake("FAC_DIVIDE_TERMS", "DROPPED_THE_ONE")]),
        answered("FAC_GCF_VARIABLE", ["FAC_DIVIDE_TERMS"], [mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")]),
        answered("FAC_GCF_VARIABLE", ["FAC_DIVIDE_TERMS"], [mistake("FAC_GCF_VARIABLE", "TOOK_HIGHEST_POWER")]),
      ]);
      assert.equal(ledger.get("FAC_GCF_VARIABLE")!.state, "CONFIRMED");
    });

    it("does not touch a gap confirmed by the student's own 'I don't know'", () => {
      const ledger = foldLedger([...gcd(),
        answered("FAC_GCF_VARIABLE", ["FAC_DIVIDE_TERMS"], [support("FAC_GCF_VARIABLE")]),
        answered("FAC_GCF_VARIABLE", ["FAC_DIVIDE_TERMS"], [support("FAC_GCF_VARIABLE")])]);
      assert.equal(ledger.get("FAC_GCF_VARIABLE")!.state, "CONFIRMED");
    });
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
    // The one mistake is listed as unconfirmed; the other planned skills weren't asked at all in this contrived test, and say so.
    assert.equal(report.uncertainAreas.filter((a) => /one mistake, not confirmed/.test(a)).length, 1);
    assert.equal(report.uncertainAreas.filter((a) => /not asked in this test/.test(a)).length, report.uncertainAreas.length - 1);
  });

  it("nextOpenTurn skips removed turns", () => {
    const state = freshState(3);
    state.turns[3]!.status = "SKIPPED";
    assert.equal(nextOpenTurn(state, 3), 5);
    assert.equal(nextOpenTurn(state, 25), null);
  });
});
