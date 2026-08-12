import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_FALLBACK_WEIGHT_MULTIPLIER,
  applyEvidenceToCounts,
  buildRuleHypothesis,
  computeMicroSkillStateUpdate,
  computeMicroSkillStatus,
  EMPTY_COUNTS,
  EVIDENCE_WEIGHTS,
  evidenceKindForStep,
  evidenceWeight,
  graderAgreesWithRule,
  interpreterAgreesWithRule,
  isAssisted,
  selectorAgreesWithRule,
} from "../../src/engines/diagnostic-v2/diagnostic-v2.formulas";
import {
  assertCatalogueIntegrity,
  layersForMicroSkill,
  MICRO_SKILL_CATALOGUE,
} from "../../src/engines/diagnostic-v2/micro-skills.catalog";
import {
  assistanceInForce,
  assessCoefficientVerificationGate,
  attributeMicroSkill,
  buildChildFacingSummary,
  contextModifiersForStep,
  isInterestingPattern,
  lastAcceptedLine,
  nextStagesAfter,
  reachedEndState,
  normalizeSubmittedMathLine,
  stageForTemplate,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import {
  assistanceTextFor,
  signProductQuestion,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-assistance-text";
import { findFixedItem, FIXED_ITEMS, verifyRendered } from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import {
  MICRO_SKILL_IDS,
  assertSubmitDiagnosticV2StepRequestShape,
  containsForbiddenTerm,
} from "@cogna/shared";

const item = (key: string) => {
  const found = findFixedItem(key);
  assert.ok(found, `fixture item ${key} must exist`);
  return found;
};

describe("micro-skill catalogue", () => {
  it("is internally consistent: no duplicate ids, no dangling prerequisites", () => {
    assert.doesNotThrow(() => assertCatalogueIntegrity());
  });

  it("only contains ids the shared contract knows about", () => {
    for (const skill of MICRO_SKILL_CATALOGUE) {
      assert.ok(MICRO_SKILL_IDS.includes(skill.id), `${skill.id} is not a contract MicroSkillId`);
    }
  });

  it("denormalizes layer 2/3 for every skill, and degrades to null for an unknown id", () => {
    assert.deepEqual(layersForMicroSkill("LIN_DISTRIBUTE_NEG"), {
      topicId: "BRACKETS_SIGNS_FRACTIONS",
      competencyFamilyId: "DISTRIBUTING_AND_CLEARING",
    });
    assert.deepEqual(layersForMicroSkill("NOT_A_SKILL"), { topicId: null, competencyFamilyId: null });
  });
});

describe("evidenceKindForStep", () => {
  it("produces no evidence at all from a line the checker could not decide", () => {
    for (const validity of ["PARSE_FAILED", "AMBIGUOUS"] as const) {
      assert.equal(
        evidenceKindForStep({ validity, assistanceLevel: "NONE", isSelfCorrection: false, isTransferCheck: false }),
        null,
      );
    }
  });

  it("distinguishes independent, assisted, self-corrected and transfer outcomes", () => {
    const base = { isSelfCorrection: false, isTransferCheck: false } as const;
    assert.equal(evidenceKindForStep({ ...base, validity: "VALID", assistanceLevel: "NONE" }), "INDEPENDENT_CORRECT");
    assert.equal(evidenceKindForStep({ ...base, validity: "INVALID", assistanceLevel: "NONE" }), "INDEPENDENT_INCORRECT");
    assert.equal(evidenceKindForStep({ ...base, validity: "VALID", assistanceLevel: "RULE_PROMPT" }), "ASSISTED_CORRECT");
    assert.equal(evidenceKindForStep({ ...base, validity: "INVALID", assistanceLevel: "RULE_PROMPT" }), "ASSISTED_INCORRECT");
    assert.equal(
      evidenceKindForStep({ ...base, isTransferCheck: true, validity: "VALID", assistanceLevel: "NONE" }),
      "TRANSFER_SUCCESS",
    );
    assert.equal(
      evidenceKindForStep({ ...base, isTransferCheck: true, validity: "INVALID", assistanceLevel: "NONE" }),
      "TRANSFER_FAILURE",
    );
    assert.equal(
      evidenceKindForStep({ validity: "VALID", assistanceLevel: "REVIEW_OPPORTUNITY", isSelfCorrection: true, isTransferCheck: false }),
      "SELF_CORRECTED",
    );
  });

  it("treats a review opportunity as still independent — looking again is not being told", () => {
    assert.equal(isAssisted("REVIEW_OPPORTUNITY"), false);
    assert.equal(isAssisted("NONE"), false);
    assert.equal(isAssisted("RULE_PROMPT"), true);
    assert.equal(isAssisted("FULL_EXPLANATION"), true);
  });
});

describe("evidenceWeight", () => {
  it("halves an AI-graded line — the same observation, read less certainly", () => {
    assert.equal(evidenceWeight("INDEPENDENT_CORRECT", "DETERMINISTIC"), EVIDENCE_WEIGHTS.INDEPENDENT_CORRECT);
    assert.equal(
      evidenceWeight("INDEPENDENT_CORRECT", "AI_FALLBACK"),
      EVIDENCE_WEIGHTS.INDEPENDENT_CORRECT * AI_FALLBACK_WEIGHT_MULTIPLIER,
    );
    assert.equal(
      evidenceWeight("INDEPENDENT_INCORRECT", "AI_FALLBACK"),
      EVIDENCE_WEIGHTS.INDEPENDENT_INCORRECT * AI_FALLBACK_WEIGHT_MULTIPLIER,
    );
  });

  it("never lets an AI-graded line outweigh a deterministically graded one", () => {
    for (const kind of Object.keys(EVIDENCE_WEIGHTS) as Array<keyof typeof EVIDENCE_WEIGHTS>) {
      assert.ok(
        Math.abs(evidenceWeight(kind, "AI_FALLBACK")) <= Math.abs(evidenceWeight(kind, "DETERMINISTIC")),
      );
    }
  });
});

describe("computeMicroSkillStatus", () => {
  const counts = (overrides: Partial<typeof EMPTY_COUNTS>) => ({ ...EMPTY_COUNTS, ...overrides });

  it("says UNKNOWN with no evidence — never 'weak' by absence", () => {
    assert.equal(computeMicroSkillStatus(EMPTY_COUNTS), "UNKNOWN");
  });

  it("needs three independent opportunities before calling two errors a gap", () => {
    assert.equal(computeMicroSkillStatus(counts({ evidenceCount: 1, independentFailureCount: 1 })), "EMERGING");
    assert.equal(computeMicroSkillStatus(counts({ evidenceCount: 2, independentFailureCount: 2 })), "EMERGING");
    assert.equal(computeMicroSkillStatus(counts({ evidenceCount: 3, independentSuccessCount: 1, independentFailureCount: 2 })), "LIKELY_GAP");
  });

  it("Defect B: a 50/50 independent split stays EMERGING, not LIKELY_GAP", () => {
    assert.equal(
      computeMicroSkillStatus(
        counts({ evidenceCount: 4, independentSuccessCount: 2, independentFailureCount: 2 }),
      ),
      "EMERGING",
    );
  });

  it("Defect B: failure rate above half can call LIKELY_GAP with two failures", () => {
    assert.equal(
      computeMicroSkillStatus(
        counts({ evidenceCount: 3, independentSuccessCount: 1, independentFailureCount: 2 }),
      ),
      "LIKELY_GAP",
    );
  });

  it("Defect B: neither 8 right / 5 wrong nor only 0 right / 2 wrong is enough for LIKELY_GAP", () => {
    assert.equal(
      computeMicroSkillStatus(
        counts({
          evidenceCount: 13,
          independentSuccessCount: 8,
          independentFailureCount: 5,
        }),
      ),
      "EMERGING",
    );
    assert.equal(
      computeMicroSkillStatus(counts({ evidenceCount: 2, independentFailureCount: 2 })),
      "EMERGING",
    );
  });

  it("needs two clean independent successes before calling it reliable", () => {
    assert.equal(computeMicroSkillStatus(counts({ evidenceCount: 1, independentSuccessCount: 1 })), "DEVELOPING");
    assert.equal(computeMicroSkillStatus(counts({ evidenceCount: 2, independentSuccessCount: 2 })), "RELIABLE");
    assert.equal(
      computeMicroSkillStatus(counts({ evidenceCount: 3, independentSuccessCount: 2, independentFailureCount: 1 })),
      "EMERGING",
    );
  });

  it("does not promote assisted success to reliable", () => {
    assert.equal(computeMicroSkillStatus(counts({ evidenceCount: 3, assistedSuccessCount: 3 })), "EMERGING");
  });
});

describe("coefficient verification evidence bar", () => {
  const observation = (
    questionId: string,
    validity: "VALID" | "INVALID",
    primaryMicroSkillId = "LIN_REMOVE_COEFFICIENT",
  ) => ({
    questionId,
    validity,
    primaryMicroSkillId,
    attemptedTransformation: primaryMicroSkillId === "LIN_REMOVE_COEFFICIENT" ? "REMOVE_COEFFICIENT" : "REMOVE_CONSTANT",
    assistanceLevel: "NONE" as const,
  });

  it("does not interrupt the flow after only two quotient mistakes", () => {
    const gate = assessCoefficientVerificationGate([
      observation("q1", "INVALID"),
      observation("q2", "INVALID"),
      observation("q1", "VALID", "LIN_REMOVE_CONSTANT"),
      observation("q2", "VALID", "LIN_COMBINE_LIKE"),
    ]);
    assert.equal(gate.eligible, false);
    assert.equal(gate.independentOpportunities, 2);
  });

  it("allows one neutral check only after three opportunities and contradictory success", () => {
    const gate = assessCoefficientVerificationGate([
      observation("q1", "INVALID"),
      observation("q2", "INVALID"),
      observation("q3", "VALID"),
    ]);
    assert.equal(gate.eligible, true);
    assert.match(gate.reason, /intent is not inferred/i);
  });

  it("does not treat assisted work as independent evidence", () => {
    const assisted = { ...observation("q3", "VALID"), assistanceLevel: "RULE_PROMPT" as const };
    const gate = assessCoefficientVerificationGate([
      observation("q1", "INVALID"),
      observation("q2", "INVALID"),
      assisted,
    ]);
    assert.equal(gate.eligible, false);
  });
});

describe("computeMicroSkillStateUpdate", () => {
  it("records which conditions a skill held up under, and which it did not", () => {
    const first = computeMicroSkillStateUpdate({
      previousCounts: EMPTY_COUNTS,
      previousStrengths: [],
      previousGaps: [],
      kind: "INDEPENDENT_INCORRECT",
      contextModifierIds: ["INDEPENDENT"],
    });
    assert.deepEqual(first.observedContextGaps, ["INDEPENDENT"]);
    assert.deepEqual(first.observedContextStrengths, []);

    const second = computeMicroSkillStateUpdate({
      previousCounts: first.counts,
      previousStrengths: first.observedContextStrengths,
      previousGaps: first.observedContextGaps,
      kind: "TRANSFER_SUCCESS",
      contextModifierIds: ["INDEPENDENT", "NEAR_TRANSFER"],
    });
    assert.deepEqual(second.observedContextStrengths, ["INDEPENDENT", "NEAR_TRANSFER"]);
    // The earlier gap is not erased by one later success — layer 7 is a history, not a latch.
    assert.deepEqual(second.observedContextGaps, ["INDEPENDENT"]);
  });

  it("is a pure replay of the evidence events — counts never drift from the log", () => {
    const kinds = ["INDEPENDENT_CORRECT", "INDEPENDENT_INCORRECT", "ASSISTED_CORRECT", "TRANSFER_SUCCESS"] as const;
    const replayed = kinds.reduce((acc, kind) => applyEvidenceToCounts(acc, kind), EMPTY_COUNTS);
    assert.deepEqual(replayed, {
      evidenceCount: 4,
      independentSuccessCount: 2,
      independentFailureCount: 1,
      assistedSuccessCount: 1,
    });
  });
});

describe("buildRuleHypothesis — the always-available fallback", () => {
  it("calls one error a possible slip, not a diagnosis", () => {
    const counts = { ...EMPTY_COUNTS, evidenceCount: 1, independentFailureCount: 1 };
    const h = buildRuleHypothesis({
      microSkillId: "LIN_DISTRIBUTE_NEG",
      microSkillName: "Distribute a negative multiplier and preserve sign products",
      sessionCounts: counts,
      lifetimeCounts: counts,
      firstInvalidActionDescription: "(-2)(-5) was evaluated as -10",
    });
    assert.equal(h.hypothesisLabel, "POSSIBLE_SLIP");
    assert.ok(h.confidence < 0.5);
  });

  it("keeps two failures across only two opportunities as a possible slip", () => {
    const counts = { ...EMPTY_COUNTS, evidenceCount: 2, independentFailureCount: 2 };
    const h = buildRuleHypothesis({
      microSkillId: "LIN_DISTRIBUTE_NEG",
      microSkillName: "Distribute a negative multiplier and preserve sign products",
      sessionCounts: counts,
      lifetimeCounts: counts,
    });
    assert.equal(h.hypothesisLabel, "POSSIBLE_SLIP");
    assert.match(h.reasoning, /not enough|only been 2 independent opportunities/i);
  });

  it("escalates only after three opportunities with errors on more than half", () => {
    const counts = { ...EMPTY_COUNTS, evidenceCount: 3, independentSuccessCount: 1, independentFailureCount: 2 };
    const h = buildRuleHypothesis({
      microSkillId: "LIN_DISTRIBUTE_NEG",
      microSkillName: "Distribute a negative multiplier and preserve sign products",
      sessionCounts: counts,
      lifetimeCounts: counts,
    });
    assert.equal(h.hypothesisLabel, "REPEATED_PATTERN");
  });

  it("Defect A: lifetime failures do not escalate a first-sitting slip to REPEATED_PATTERN", () => {
    const h = buildRuleHypothesis({
      microSkillId: "LIN_DISTRIBUTE_NEG",
      microSkillName: "Distribute a negative multiplier and preserve sign products",
      sessionCounts: { ...EMPTY_COUNTS, evidenceCount: 1, independentFailureCount: 1 },
      lifetimeCounts: { ...EMPTY_COUNTS, evidenceCount: 10, independentFailureCount: 5 },
    });
    assert.equal(h.hypothesisLabel, "POSSIBLE_SLIP");
    assert.match(h.reasoning, /once here|only once/i);
  });

  it("never puts a forbidden term in front of a child", () => {
    for (const failures of [0, 1, 2]) {
      const counts = { ...EMPTY_COUNTS, evidenceCount: failures, independentFailureCount: failures };
      const h = buildRuleHypothesis({
        microSkillId: "LIN_DISTRIBUTE_NEG",
        microSkillName: "Distribute a negative multiplier and preserve sign products",
        sessionCounts: counts,
        lifetimeCounts: counts,
      });
      assert.equal(containsForbiddenTerm(h.childFacingSummary), false, h.childFacingSummary);
    }
  });
});

describe("agreement functions reused by the shadow gate", () => {
  it("selector agrees only on the same choice type and the same target", () => {
    assert.equal(selectorAgreesWithRule({ choice: "EXISTING", index: 1 }, { choice: "EXISTING", index: 1 }), true);
    assert.equal(selectorAgreesWithRule({ choice: "EXISTING", index: 1 }, { choice: "EXISTING", index: 2 }), false);
    assert.equal(selectorAgreesWithRule({ choice: "EXISTING", index: 0 }, { choice: "GENERATE", templateId: "T" }), false);
  });

  it("interpreter agrees on the conclusion, not the wording", () => {
    assert.equal(interpreterAgreesWithRule("REPEATED_PATTERN", "REPEATED_PATTERN"), true);
    assert.equal(interpreterAgreesWithRule("REPEATED_PATTERN", "POSSIBLE_SLIP"), false);
  });

  it("grader has nothing to agree with — the rule baseline abstained by construction", () => {
    assert.equal(graderAgreesWithRule(), false);
  });
});

describe("micro-skill attribution", () => {
  it("attaches a bracket error to the distribution skill, not the item's headline skill", () => {
    const result = attributeMicroSkill({
      previousLine: "-2(x - 5) + 3 = 11",
      submittedLine: "-2x - 10 + 3 = 11",
      transformation: "DISTRIBUTE",
      item: item("NEG_DIST_MAIN"),
    });
    assert.equal(result.primary, "LIN_DISTRIBUTE_NEG");
    assert.deepEqual(result.supporting, ["FND_SIGN_MUL_DIV"]);
  });

  it("separates positive from negative distribution by the actual multiplier", () => {
    assert.equal(
      attributeMicroSkill({
        previousLine: "3(x + 2) = 12",
        submittedLine: "3x + 6 = 12",
        transformation: "DISTRIBUTE",
        item: item("NEG_DIST_MAIN"),
      }).primary,
      "LIN_DISTRIBUTE_POS",
    );
  });

  it("routes a correctly expanded line with a copied-side slip to checking, not distribution", () => {
    const result = attributeMicroSkill({
      previousLine: "-2(x - 5) + 3 = 11",
      submittedLine: "-2x + 10 + 3 = 10",
      transformation: "OTHER",
      firstInvalidActionCode: "COPIED_UNCHANGED_SIDE",
      item: item("NEG_DIST_MAIN"),
    });
    assert.equal(result.primary, "LIN_CHECK_SOLUTION");
    assert.deepEqual(result.supporting, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("attributes each isolating step to the operation actually performed", () => {
    const twoStep = item("ENTRY_TWO_STEP");
    assert.equal(
      attributeMicroSkill({ previousLine: "3x + 5 = 20", submittedLine: "3x = 15", transformation: "SUBTRACT_BOTH_SIDES", item: twoStep }).primary,
      "LIN_REMOVE_CONSTANT",
    );
    assert.equal(
      attributeMicroSkill({ previousLine: "3x = 15", submittedLine: "x = 5", transformation: "DIVIDE_BOTH_SIDES", item: twoStep }).primary,
      "LIN_REMOVE_COEFFICIENT",
    );
    assert.equal(
      attributeMicroSkill({ previousLine: "4x - 7 = 2x + 9", submittedLine: "2x - 7 = 9", transformation: "SUBTRACT_BOTH_SIDES", item: item("ENTRY_VARIABLE_BOTH") }).primary,
      "LIN_COMBINE_LIKE",
    );
  });

  it("falls back to the item's own skill when the line cannot be parsed", () => {
    const result = attributeMicroSkill({
      previousLine: "3x + 5 = 20",
      submittedLine: "no idea",
      transformation: "UNKNOWN",
      item: item("ENTRY_TWO_STEP"),
    });
    assert.equal(result.primary, "LIN_SOLVE_TWO_STEP");
  });
});

describe("assistance in force for the next line", () => {
  it("treats a line written after a review opportunity as still independent", () => {
    assert.equal(assistanceInForce({ priorDeclineCount: 0, retriedAfterInvalid: true }), "REVIEW_OPPORTUNITY");
    assert.equal(isAssisted(assistanceInForce({ priorDeclineCount: 0, retriedAfterInvalid: true })), false);
  });

  it("treats a line written after an 'I don't know' as assisted — the rule has been handed over", () => {
    assert.equal(assistanceInForce({ priorDeclineCount: 1, retriedAfterInvalid: false }), "RULE_PROMPT");
    assert.equal(isAssisted(assistanceInForce({ priorDeclineCount: 1, retriedAfterInvalid: false })), true);
  });

  it("is NONE on a fresh line", () => {
    assert.equal(assistanceInForce({ priorDeclineCount: 0, retriedAfterInvalid: false }), "NONE");
  });

  it("means a correct line after a decline scores as assisted, not independent", () => {
    const level = assistanceInForce({ priorDeclineCount: 1, retriedAfterInvalid: false });
    assert.equal(
      evidenceKindForStep({ validity: "VALID", assistanceLevel: level, isSelfCorrection: false, isTransferCheck: false }),
      "ASSISTED_CORRECT",
    );
  });
});

describe("an 'I don't know' as evidence", () => {
  // SKIPPED is the only kind that says "observed, but tells us nothing about
  // whether they can do it". Weight 0, and it moves no success or failure
  // counter — so no number of declines can ever push a skill to LIKELY_GAP.
  it("carries zero weight", () => {
    assert.equal(EVIDENCE_WEIGHTS.SKIPPED, 0);
    assert.equal(evidenceWeight("SKIPPED", "DETERMINISTIC"), 0);
  });

  it("counts as an observation but not as a success or a failure", () => {
    assert.deepEqual(applyEvidenceToCounts(EMPTY_COUNTS, "SKIPPED"), {
      evidenceCount: 1,
      independentSuccessCount: 0,
      independentFailureCount: 0,
      assistedSuccessCount: 0,
    });
  });

  it("leaves the skill UNKNOWN however many times it happens", () => {
    let counts = EMPTY_COUNTS;
    for (let i = 0; i < 5; i++) counts = applyEvidenceToCounts(counts, "SKIPPED");
    assert.equal(counts.evidenceCount, 5);
    assert.equal(computeMicroSkillStatus(counts), "UNKNOWN");
  });

  it("records no context strength and no context gap — declining says nothing about conditions", () => {
    const update = computeMicroSkillStateUpdate({
      previousCounts: EMPTY_COUNTS,
      previousStrengths: [],
      previousGaps: [],
      kind: "SKIPPED",
      contextModifierIds: ["INDEPENDENT"],
    });
    assert.deepEqual(update.observedContextStrengths, []);
    assert.deepEqual(update.observedContextGaps, []);
    assert.equal(update.status, "UNKNOWN");
  });

  it("is not an interesting pattern, so it never triggers an AI hypothesis", () => {
    assert.equal(
      isInterestingPattern({ kind: "SKIPPED", previousStatus: "UNKNOWN", nextStatus: "UNKNOWN" }),
      false,
    );
  });
});

describe("assistance text is deterministic and student-safe", () => {
  // Every string here comes from a fixed table plus integers re-read from the
  // student's own line — no model is involved at any point, which is what the
  // "no unchecked LLM math to students" rule requires.
  it("states the sign product using the numbers actually on the page", () => {
    assert.equal(
      signProductQuestion("-2(x - 5) + 3 = 11"),
      "What is (-2) x (-5)? Two negatives multiplied together give a positive, so it is 10, not -10.",
    );
    assert.equal(
      signProductQuestion("-3(y - 4)"),
      "What is (-3) x (-4)? Two negatives multiplied together give a positive, so it is 12, not -12.",
    );
    assert.equal(
      signProductQuestion("-4(z - 2) + 3 = 19"),
      "What is (-4) x (-2)? Two negatives multiplied together give a positive, so it is 8, not -8.",
    );
  });

  it("says nothing about numbers when there is no negative-times-negative to talk about", () => {
    assert.equal(signProductQuestion("3(x + 2) = 12"), null);
    assert.equal(signProductQuestion("-2(x + 5) = 11"), null);
    assert.equal(signProductQuestion("3x + 5 = 20"), null);
  });

  it("is a pure function — the same line always produces the same words", () => {
    const once = assistanceTextFor({ level: "RULE_PROMPT", microSkillId: "LIN_DISTRIBUTE_NEG", line: "-2(x - 5) + 3 = 11" });
    for (let i = 0; i < 5; i++) {
      assert.equal(
        assistanceTextFor({ level: "RULE_PROMPT", microSkillId: "LIN_DISTRIBUTE_NEG", line: "-2(x - 5) + 3 = 11" }),
        once,
      );
    }
    assert.match(once!, /\(-2\) x \(-5\)/);
    assert.match(once!, /it is 10/);
  });

  it("falls back to the plain rule when the line has no bracket to read", () => {
    const text = assistanceTextFor({ level: "RULE_PROMPT", microSkillId: "LIN_DISTRIBUTE_NEG", line: "-2x + 13 = 11" });
    assert.ok(text);
    assert.doesNotMatch(text, /What is/);
  });

  it("has a rule prompt and a full explanation for every micro-skill in the slice", () => {
    for (const microSkillId of MICRO_SKILL_IDS) {
      for (const level of ["RULE_PROMPT", "FULL_EXPLANATION"] as const) {
        const text = assistanceTextFor({ level, microSkillId, line: "3x + 5 = 20" });
        assert.ok(text && text.length > 0, `${microSkillId}/${level} has no text`);
        assert.equal(containsForbiddenTerm(text), false, text);
        assert.doesNotMatch(text, /LIN_|FND_/, text);
      }
    }
  });

  it("returns nothing for a level this phase never offers, rather than a placeholder", () => {
    for (const level of ["NONE", "GENERAL_PROMPT", "LOCATION_HINT", "MICRO_QUESTION", "PARTIAL_WORKED_STEP"] as const) {
      assert.equal(assistanceTextFor({ level, microSkillId: "LIN_DISTRIBUTE_NEG", line: "-2(x - 5) + 3 = 11" }), undefined);
    }
  });
});

describe("SubmitDiagnosticV2StepRequest guard", () => {
  const valid = { attemptId: "a1", previousLine: "3x + 5 = 20", submittedLine: "3x = 15" };

  it("accepts a normal submission", () => {
    assert.deepEqual(assertSubmitDiagnosticV2StepRequestShape(valid), valid);
  });

  it("accepts an explicit 'I don't know' with no line", () => {
    const parsed = assertSubmitDiagnosticV2StepRequestShape({
      attemptId: "a1",
      previousLine: "3x + 5 = 20",
      dontKnow: true,
    });
    assert.equal(parsed.dontKnow, true);
    assert.equal(parsed.submittedLine, "");
  });

  it("drops dontKnow:false rather than carrying a meaningless flag", () => {
    const parsed = assertSubmitDiagnosticV2StepRequestShape({ ...valid, dontKnow: false });
    assert.equal(parsed.dontKnow, undefined);
  });

  it("rejects a non-boolean dontKnow instead of coercing it", () => {
    assert.throws(() => assertSubmitDiagnosticV2StepRequestShape({ ...valid, dontKnow: "yes" }), /dontKnow/);
    assert.throws(() => assertSubmitDiagnosticV2StepRequestShape({ ...valid, dontKnow: 1 }), /dontKnow/);
  });

  it("rejects a missing attemptId or previousLine", () => {
    assert.throws(() => assertSubmitDiagnosticV2StepRequestShape({ ...valid, attemptId: "" }), /attemptId/);
    assert.throws(() => assertSubmitDiagnosticV2StepRequestShape({ ...valid, previousLine: "  " }), /previousLine/);
    assert.throws(() => assertSubmitDiagnosticV2StepRequestShape(null), /not an object/);
  });
});

describe("context modifiers (layer 5)", () => {
  it("tags every step independent or assisted, and marks the transfer item", () => {
    assert.deepEqual(contextModifiersForStep({ assistanceLevel: "NONE", isTransferCheck: false }), ["INDEPENDENT"]);
    assert.deepEqual(contextModifiersForStep({ assistanceLevel: "REVIEW_OPPORTUNITY", isTransferCheck: false }), ["INDEPENDENT"]);
    assert.deepEqual(contextModifiersForStep({ assistanceLevel: "RULE_PROMPT", isTransferCheck: false }), ["ASSISTED"]);
    assert.deepEqual(contextModifiersForStep({ assistanceLevel: "NONE", isTransferCheck: true }), ["INDEPENDENT", "NEAR_TRANSFER"]);
  });
});

describe("stage sequencing", () => {
  it("skips the contrast probe when the target skill did not fail", () => {
    assert.deepEqual(nextStagesAfter("NEG_DIST_MAIN", { targetSkillFailed: false, patternConfirmed: false }), [
      "TRANSFER_NEG_DIST",
    ]);
  });

  it("runs the contrast probe when the target skill failed once", () => {
    assert.deepEqual(nextStagesAfter("NEG_DIST_MAIN", { targetSkillFailed: true, patternConfirmed: false }), [
      "NEG_DIST_CONTRAST",
    ]);
  });

  it("only teaches once the same error repeats on a structurally different problem", () => {
    assert.deepEqual(nextStagesAfter("NEG_DIST_CONTRAST", { targetSkillFailed: true, patternConfirmed: false }), [
      "TRANSFER_NEG_DIST",
    ]);
    assert.deepEqual(nextStagesAfter("NEG_DIST_CONTRAST", { targetSkillFailed: true, patternConfirmed: true }), [
      "RULE_PROMPT",
      "TRANSFER_NEG_DIST",
    ]);
  });

  it("ends after the transfer check", () => {
    assert.deepEqual(nextStagesAfter("TRANSFER_NEG_DIST", { targetSkillFailed: false, patternConfirmed: true }), [
      "COMPLETE",
    ]);
  });

  it("returns to completion after the optional coefficient verification", () => {
    assert.deepEqual(
      nextStagesAfter("COEFFICIENT_VERIFICATION", { targetSkillFailed: false, patternConfirmed: false }),
      ["COMPLETE"],
    );
  });

  it("places a generated instance at the same stage as the item it stands in for", () => {
    for (const fixed of FIXED_ITEMS) {
      if (fixed.templateId === null) continue;
      assert.equal(stageForTemplate(fixed.templateId), fixed.itemKey);
    }
  });
});

describe("item end state", () => {
  it("removes harmless trailing punctuation before checking a submitted line", () => {
    assert.equal(normalizeSubmittedMathLine("x = 8]"), "x = 8");
    assert.equal(normalizeSubmittedMathLine("x = 8."), "x = 8");
    assert.equal(normalizeSubmittedMathLine("(x + 2)(x - 2)"), "(x + 2)(x - 2)");
  });

  it("ends an equation item at x = n, with no separate final-answer button", () => {
    assert.equal(reachedEndState(item("ENTRY_TWO_STEP"), "x = 5"), true);
    assert.equal(reachedEndState(item("ENTRY_TWO_STEP"), "3x = 15"), false);
  });

  it("ends an expand-the-bracket item once the bracket is gone", () => {
    assert.equal(reachedEndState(item("NEG_DIST_CONTRAST"), "-3y + 12"), true);
    assert.equal(reachedEndState(item("NEG_DIST_CONTRAST"), "-3(y - 4)"), false);
  });

  it("builds each new step on the last accepted line, never on a rejected one", () => {
    const twoStep = item("ENTRY_TWO_STEP");
    assert.equal(lastAcceptedLine(twoStep, []), "3x + 5 = 20");
    assert.equal(
      lastAcceptedLine(twoStep, [
        { validity: "VALID", submittedLine: "3x = 15" },
        { validity: "INVALID", submittedLine: "x = 15" },
      ]),
      "3x = 15",
    );
  });
});

describe("isInterestingPattern — when a hypothesis is worth writing", () => {
  it("writes one for any negative evidence", () => {
    assert.equal(
      isInterestingPattern({ kind: "INDEPENDENT_INCORRECT", previousStatus: "UNKNOWN", nextStatus: "EMERGING" }),
      true,
    );
  });

  it("writes one when a gap gets confirmed", () => {
    assert.equal(
      isInterestingPattern({ kind: "TRANSFER_FAILURE", previousStatus: "EMERGING", nextStatus: "LIKELY_GAP" }),
      true,
    );
  });

  it("writes one when a known gap survives a fresh problem", () => {
    assert.equal(
      isInterestingPattern({ kind: "TRANSFER_SUCCESS", previousStatus: "LIKELY_GAP", nextStatus: "LIKELY_GAP" }),
      true,
    );
  });

  it("stays quiet on routine correct work", () => {
    assert.equal(
      isInterestingPattern({ kind: "INDEPENDENT_CORRECT", previousStatus: "DEVELOPING", nextStatus: "RELIABLE" }),
      false,
    );
  });
});

describe("buildChildFacingSummary", () => {
  it("leads with what the student can do, and carries the hypothesis wording for the gap", () => {
    const summary = buildChildFacingSummary(
      [
        { microSkillId: "LIN_REMOVE_CONSTANT", status: "RELIABLE" },
        { microSkillId: "LIN_DISTRIBUTE_NEG", status: "LIKELY_GAP" },
      ],
      [{ microSkillId: "LIN_DISTRIBUTE_NEG", childFacingSummary: "Let's look at minus signs outside brackets." }],
    );
    assert.match(summary, /^You handled/);
    assert.match(summary, /minus signs outside brackets/);
    assert.equal(containsForbiddenTerm(summary), false);
  });

  it("says nothing negative when there is no gap, and never mentions a score", () => {
    const summary = buildChildFacingSummary([{ microSkillId: "LIN_SOLVE_TWO_STEP", status: "DEVELOPING" }], []);
    assert.equal(containsForbiddenTerm(summary), false);
    assert.doesNotMatch(summary, /\d+%/);
  });

  it("still produces safe text when no evidence was gathered at all", () => {
    const summary = buildChildFacingSummary([], []);
    assert.ok(summary.length > 0);
    assert.equal(containsForbiddenTerm(summary), false);
  });
});

describe("the fixed item bank", () => {
  it("re-verifies every hand-authored item independently", () => {
    for (const fixed of FIXED_ITEMS) {
      const result = verifyRendered(fixed);
      assert.equal(result.passed, true, `${fixed.itemKey}: ${result.failures.join("; ")}`);
    }
  });
});
