import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DiagnosticV2SessionService } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import { containsForbiddenTerm } from "@cogna/shared";
import { createFakePrisma, makeSelectorService, mockOrchestrator, type FakeDb } from "./helpers/diagnostic-v2-fakes";

/**
 * The canonical Arun scenario, end to end, run twice: once with all three AI
 * capabilities serving, once with all three switched off.
 *
 * The whole design rests on one claim — AI changes how a session is *explained*
 * and *narrated*, never whether a line was right or wrong, never which skill
 * the evidence lands on, and never where the student is routed. This spec is
 * that claim written as an assertion: every evidence row, every micro-skill
 * counter and every stage in the route must come out byte-identical either way.
 *
 * Student: solves both entry items cleanly, then makes the same
 * negative-distribution sign error twice on structurally different problems,
 * gets taught, and clears a fresh transfer equation.
 */

const STUDENT_ID = "student-1";

const SCRIPT: Array<{ itemKey: string; lines: Array<[string, string]> }> = [
  {
    itemKey: "ENTRY_TWO_STEP",
    lines: [
      ["3x + 5 = 20", "3x = 15"],
      ["3x = 15", "x = 5"],
    ],
  },
  {
    itemKey: "ENTRY_VARIABLE_BOTH",
    lines: [
      ["4x - 7 = 2x + 9", "2x - 7 = 9"],
      ["2x - 7 = 9", "2x = 16"],
      ["2x = 16", "x = 8"],
    ],
  },
  {
    // The signature error: (-2)(-5) read as -10 instead of +10.
    itemKey: "NEG_DIST_MAIN",
    lines: [["-2(x - 5) + 3 = 11", "-2x - 10 + 3 = 11"]],
  },
  {
    // A structurally different probe of the same skill — this is what turns a
    // slip into a confirmed pattern.
    itemKey: "NEG_DIST_CONTRAST",
    lines: [["-3(y - 4)", "-3y - 12"]],
  },
  {
    itemKey: "TRANSFER_NEG_DIST",
    lines: [
      ["-4(z - 2) + 3 = 19", "-4z + 8 + 3 = 19"],
      ["-4z + 8 + 3 = 19", "-4z = 8"],
      ["-4z = 8", "z = -2"],
    ],
  },
];

type StepResponse = Awaited<ReturnType<DiagnosticV2SessionService["submitStep"]>>;

interface RunResult {
  db: FakeDb;
  responses: StepResponse[];
  debug: Awaited<ReturnType<DiagnosticV2SessionService["getDebugView"]>>;
  summary: Awaited<ReturnType<DiagnosticV2SessionService["getSummary"]>>;
  aiCallCount: number;
  graderCallCount: number;
  interpreterCallCount: number;
}

/** Narrows a response that the scenario expects to have been a real submitted line. */
function submitted(response: StepResponse) {
  assert.equal(response.outcome, "SUBMITTED");
  return response as Extract<StepResponse, { outcome: "SUBMITTED" }>;
}

async function runScenario(aiEnabled: boolean): Promise<RunResult> {
  const { prisma, db } = createFakePrisma([STUDENT_ID]);

  const selector = mockOrchestrator({
    generate: aiEnabled,
    // The model is asked to pick the most informative next question and lands
    // on the same one the rules would — the realistic agreeing case. It is the
    // *source* and the *reasoning* that change, not the choice.
    raw: (call) =>
      JSON.stringify({
        choice: "EXISTING",
        index: (call.ruleOutput as { index: number }).index,
        confidence: 0.82,
        reasoning: "LIN_DISTRIBUTE_NEG status and the recent error make this the most informative next question.",
      }),
  });
  const interpreter = mockOrchestrator({
    generate: aiEnabled,
    raw: (call) =>
      JSON.stringify({
        hypothesisLabel: (call.ruleOutput as { hypothesisLabel: string }).hypothesisLabel,
        confidence: 0.91,
        reasoning: "The same sign slip shows up whenever a minus sits directly outside a bracket.",
        childFacingSummary: "Let's look at what a minus sign just outside a bracket does to the numbers inside.",
      }),
  });
  const grader = mockOrchestrator({ generate: aiEnabled });

  const service = new DiagnosticV2SessionService(
    prisma,
    makeSelectorService(selector.service),
    new DiagnosticV2AiInterpreterService(interpreter.service),
    new DiagnosticV2AiGraderService(grader.service),
  );

  const start = await service.startSession(STUDENT_ID);
  let attemptId = start.attemptId;
  let itemKey = start.itemKey;
  const responses: RunResult["responses"] = [];

  for (const block of SCRIPT) {
    assert.equal(itemKey, block.itemKey, `expected to be on ${block.itemKey}, was on ${itemKey}`);
    for (const [previousLine, submittedLine] of block.lines) {
      const response = await service.submitStep(start.sessionId, { attemptId, previousLine, submittedLine });
      responses.push(response);
      if (response.nextAttempt) {
        attemptId = response.nextAttempt.attemptId;
        itemKey = response.nextAttempt.itemKey;
      }
    }
  }

  return {
    db,
    responses,
    debug: await service.getDebugView(start.sessionId),
    summary: await service.getSummary(start.sessionId),
    aiCallCount: selector.calls.length + interpreter.calls.length + grader.calls.length,
    graderCallCount: grader.calls.length,
    interpreterCallCount: interpreter.calls.length,
  };
}

/** Everything that must not depend on whether AI was involved. */
function deterministicFacts(run: RunResult) {
  return {
    route: run.debug.stageHistory.map((s) => s.stageId),
    steps: run.debug.steps.map((s) => ({
      stepIndex: s.stepIndex,
      submittedLine: s.submittedLine,
      validity: s.validity,
      verificationSource: s.verificationSource,
      attemptedTransformation: s.attemptedTransformation,
      primaryMicroSkillId: s.primaryMicroSkillId,
      topicId: s.topicId,
      competencyFamilyId: s.competencyFamilyId,
      contextModifierIds: s.contextModifierIds,
      assistanceLevel: s.assistanceLevel,
    })),
    evidence: run.db.evidence.map((e) => ({
      microSkillId: e.microSkillId,
      evidenceKind: e.evidenceKind,
      weight: e.weight,
      topicId: e.topicId,
      competencyFamilyId: e.competencyFamilyId,
      contextModifierIds: e.contextModifierIds,
      assistanceLevel: e.assistanceLevel,
      evidencePolicyVersion: e.evidencePolicyVersion,
    })),
    microSkillStates: run.debug.microSkillStates,
    retentionChecks: run.db.revisionItems.map((r) => ({
      microSkillId: r.microSkillId,
      conceptId: r.conceptId,
      type: r.type,
      status: r.status,
    })),
    itemsSeen: run.db.attempts.map((a) => ({ itemKey: a.itemKey, status: a.status })),
    perStep: run.responses.map((r) => ({
      outcome: r.outcome,
      stepIndex: r.outcome === "SUBMITTED" ? r.stepIndex : undefined,
      validity: r.outcome === "SUBMITTED" ? r.validity : undefined,
      verificationSource: r.outcome === "SUBMITTED" ? r.verificationSource : undefined,
      itemComplete: r.itemComplete,
      assistanceOffered: r.assistanceOffered,
      // Deterministic by construction, so it must also be identical either way.
      assistanceMessage: r.assistanceMessage,
      sessionStatus: r.sessionStatus,
      nextItemKey: r.nextAttempt?.itemKey,
    })),
  };
}

describe("Arun scenario — AI on and AI off produce identical evidence and route", () => {
  it("is byte-identical on every deterministic fact", async () => {
    const withAi = await runScenario(true);
    const withoutAi = await runScenario(false);

    assert.ok(withAi.aiCallCount > 0, "the AI-on run must actually have called the model");
    assert.equal(withoutAi.aiCallCount, 0, "the AI-off run must not call the model at all");

    assert.deepEqual(deterministicFacts(withAi), deterministicFacts(withoutAi));
  });

  it("differs only in who authored the narration", async () => {
    const withAi = await runScenario(true);
    const withoutAi = await runScenario(false);

    assert.ok(
      withAi.debug.stageHistory.some((s) => s.source === "AI"),
      "at least one routing decision should be AI-sourced when AI is on",
    );
    assert.ok(
      withoutAi.debug.stageHistory.every((s) => s.source === "RULE"),
      "every routing decision must be rule-sourced when AI is off",
    );

    assert.ok(withAi.debug.hypotheses.every((h) => h.source === "AI"));
    assert.ok(withoutAi.debug.hypotheses.every((h) => h.source === "RULE"));
    assert.equal(withAi.debug.hypotheses.length, withoutAi.debug.hypotheses.length);
    assert.deepEqual(
      withAi.debug.hypotheses.map((h) => [h.microSkillId, h.hypothesisLabel]),
      withoutAi.debug.hypotheses.map((h) => [h.microSkillId, h.hypothesisLabel]),
      "the conclusion is the same; only the wording and confidence differ",
    );
  });
});

describe("Arun scenario — the route", () => {
  it("walks entry, target, contrast, teaching moment, transfer, complete", async () => {
    const run = await runScenario(true);
    assert.deepEqual(run.debug.stageHistory.map((s) => s.stageId), [
      "ENTRY_TWO_STEP",
      "ENTRY_VARIABLE_BOTH",
      "NEG_DIST_MAIN",
      "NEG_DIST_CONTRAST",
      "RULE_PROMPT",
      "TRANSFER_NEG_DIST",
      "COMPLETE",
    ]);
    assert.equal(run.debug.status, "COMPLETED");
    assert.equal(run.debug.currentStageId, "COMPLETE");
  });

  it("numbers every step server-side, in order", async () => {
    const run = await runScenario(true);
    const perAttempt = new Map<string, number[]>();
    for (const attempt of run.db.attempts) perAttempt.set(attempt.id as string, []);
    for (const step of run.db.steps) {
      perAttempt.get(step.attemptId as string)!.push(step.stepIndex as number);
    }
    for (const [, indexes] of perAttempt) {
      assert.deepEqual(indexes, indexes.map((_, i) => i));
    }
    assert.deepEqual(
      run.responses.map((r) => submitted(r).stepIndex),
      [0, 1, 0, 1, 2, 0, 0, 0, 1, 2],
    );
  });

  it("offers the teaching moment only after the same error repeats on a different problem", async () => {
    const run = await runScenario(false);
    const offered = run.responses.map((r) => r.assistanceOffered);
    // The first negative-distribution error moves quietly to the contrast probe;
    // the teaching moment fires on the second one, not the first.
    assert.equal(offered.filter((a) => a === "RULE_PROMPT").length, 1);
    const ruleFirePosition = offered.indexOf("RULE_PROMPT");
    const firstDistributionError = run.debug.steps.findIndex((s) => s.validity === "INVALID");
    assert.ok(ruleFirePosition > firstDistributionError);
  });

  it("marks each attempt with why it ended", async () => {
    const run = await runScenario(true);
    assert.deepEqual(
      run.db.attempts.map((a) => [a.itemKey, a.status]),
      [
        ["ENTRY_TWO_STEP", "SOLVED"],
        ["ENTRY_VARIABLE_BOTH", "SOLVED"],
        ["NEG_DIST_MAIN", "TARGET_ERROR_OBSERVED"],
        ["NEG_DIST_CONTRAST", "TARGET_ERROR_OBSERVED"],
        ["TRANSFER_NEG_DIST", "SOLVED"],
      ],
    );
  });
});

describe("Arun scenario — the evidence", () => {
  it("pins both distribution errors on the distribution skill, not on the whole question", async () => {
    const run = await runScenario(true);
    const distribution = run.db.evidence.filter((e) => e.microSkillId === "LIN_DISTRIBUTE_NEG");
    assert.deepEqual(distribution.map((e) => e.evidenceKind), [
      "INDEPENDENT_INCORRECT",
      "INDEPENDENT_INCORRECT",
      "TRANSFER_SUCCESS",
    ]);

    // The prerequisite the error implicates is recorded on the step but is never
    // itself scored — a wrong answer must not poison every skill it touches.
    assert.equal(run.db.evidence.some((e) => e.microSkillId === "FND_SIGN_MUL_DIV"), false);
    assert.ok(run.db.steps.some((s) => (s.supportingMicroSkillIds as string[]).includes("FND_SIGN_MUL_DIV")));
  });

  it("keeps every step before and after the error clean", async () => {
    const run = await runScenario(true);
    const negative = run.db.evidence.filter((e) =>
      ["INDEPENDENT_INCORRECT", "ASSISTED_INCORRECT", "TRANSFER_FAILURE"].includes(e.evidenceKind as string),
    );
    assert.deepEqual(new Set(negative.map((e) => e.microSkillId)), new Set(["LIN_DISTRIBUTE_NEG"]));
  });

  it("reaches LIKELY_GAP only on the second failure, and does not clear it on one later success", async () => {
    const run = await runScenario(true);
    const state = run.debug.microSkillStates.find((s) => s.microSkillId === "LIN_DISTRIBUTE_NEG")!;
    assert.equal(state.independentFailureCount, 2);
    assert.equal(state.independentSuccessCount, 1);
    assert.equal(state.status, "LIKELY_GAP", "one sitting cannot prove a gap is closed");
    assert.deepEqual(state.observedContextGaps, ["INDEPENDENT"]);
    assert.deepEqual(state.observedContextStrengths, ["INDEPENDENT", "NEAR_TRANSFER"]);
  });

  it("credits the skills the student actually demonstrated", async () => {
    const run = await runScenario(true);
    const byId = new Map(run.debug.microSkillStates.map((s) => [s.microSkillId, s]));
    assert.equal(byId.get("LIN_REMOVE_CONSTANT")!.status, "RELIABLE");
    assert.equal(byId.get("LIN_REMOVE_COEFFICIENT")!.status, "RELIABLE");
    assert.equal(byId.get("LIN_SOLVE_TWO_STEP")!.status, "DEVELOPING");
    assert.equal(byId.get("LIN_SOLVE_VARIABLE_BOTH")!.status, "DEVELOPING");
    assert.equal(byId.get("LIN_COMBINE_LIKE")!.status, "DEVELOPING");
  });

  it("tags the transfer item's work as near transfer, and nothing else", async () => {
    const run = await runScenario(true);
    const nearTransfer = run.debug.steps.filter((s) => s.contextModifierIds.includes("NEAR_TRANSFER"));
    assert.equal(nearTransfer.length, 3);
    assert.ok(nearTransfer.every((s) => s.validity === "VALID"));
    assert.ok(
      run.debug.steps
        .filter((s) => !s.contextModifierIds.includes("NEAR_TRANSFER"))
        .every((s) => s.contextModifierIds.includes("INDEPENDENT")),
    );
  });

  it("grades every line deterministically — no AI-graded evidence in a fully parseable session", async () => {
    const run = await runScenario(true);
    assert.ok(run.debug.steps.every((s) => s.verificationSource === "DETERMINISTIC"));
    assert.equal(run.graderCallCount, 0);
  });

  it("attaches the deterministic guiding question to the teaching moment", async () => {
    for (const aiEnabled of [true, false]) {
      const run = await runScenario(aiEnabled);
      const taught = run.responses.find((r) => r.assistanceOffered === "RULE_PROMPT")!;
      // Drawn from the contrast probe the student just got wrong, -3(y - 4).
      assert.equal(
        taught.assistanceMessage,
        "The number outside the bracket multiplies every term inside it — including its sign. " +
          "What is (-3) x (-4)? Two negatives multiplied together give a positive, so it is 12, not -12.",
      );
      assert.equal(containsForbiddenTerm(taught.assistanceMessage!), false);
    }
  });

  it("denormalizes the topic and competency family onto every evidence row", async () => {
    const run = await runScenario(true);
    for (const event of run.db.evidence) {
      assert.ok(event.topicId, `${String(event.microSkillId)} is missing its topic`);
      assert.ok(event.competencyFamilyId, `${String(event.microSkillId)} is missing its competency family`);
    }
    const distribution = run.db.evidence.find((e) => e.microSkillId === "LIN_DISTRIBUTE_NEG")!;
    assert.equal(distribution.topicId, "BRACKETS_SIGNS_FRACTIONS");
    assert.equal(distribution.competencyFamilyId, "DISTRIBUTING_AND_CLEARING");
  });
});

describe("Arun scenario — what happens at the end", () => {
  it("schedules a micro-skill retention check without running it", async () => {
    const run = await runScenario(true);
    assert.equal(run.db.revisionItems.length, 1);
    const scheduled = run.db.revisionItems[0]!;
    assert.equal(scheduled.microSkillId, "LIN_DISTRIBUTE_NEG");
    assert.equal(scheduled.type, "MICRO_SKILL_RETENTION_CHECK");
    assert.equal(scheduled.status, "PENDING");
    // Points at a real concept so the existing concept-level revision loop
    // degrades sensibly if it ever picks this row up.
    assert.equal(scheduled.conceptId, "P2_NEGATIVE_OPS");
    assert.ok((scheduled.dueAt as Date).getTime() > Date.now(), "due later, not now — nothing runs in this phase");
  });

  it("gives the student a plain summary with no scores and no forbidden terms", async () => {
    for (const aiEnabled of [true, false]) {
      const run = await runScenario(aiEnabled);
      assert.equal(run.summary.status, "COMPLETED");
      assert.equal(containsForbiddenTerm(run.summary.childFacingSummary), false, run.summary.childFacingSummary);
      assert.doesNotMatch(run.summary.childFacingSummary, /\d+%/);
      assert.doesNotMatch(run.summary.childFacingSummary, /LIN_|FND_/);
      // Says what it means in words a 13-year-old uses, not the catalogue's
      // wording ("distribute a negative multiplier and preserve sign products").
      assert.match(run.summary.childFacingSummary, /bracket/);
      assert.doesNotMatch(run.summary.childFacingSummary, /multiplier|coefficient|additive inverse/);
    }
  });

  it("exposes enough for the debug panel: source per decision, AI reasoning, verification source per step", async () => {
    const run = await runScenario(true);
    assert.ok(run.debug.stageHistory.every((s) => s.source === "RULE" || s.source === "AI"));
    assert.ok(run.debug.stageHistory.some((s) => s.source === "AI" && !!s.reasoning));
    assert.ok(run.debug.steps.every((s) => !!s.verificationSource));
    assert.ok(run.debug.hypotheses.every((h) => !!h.reasoning));
  });
});

// ─── "I don't know" ─────────────────────────────────────────────────────────

function offlineService(prisma: ReturnType<typeof createFakePrisma>["prisma"]) {
  const selector = mockOrchestrator({ generate: false });
  const interpreter = mockOrchestrator({ generate: false });
  const grader = mockOrchestrator({ generate: false });
  return {
    service: new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(selector.service),
      new DiagnosticV2AiInterpreterService(interpreter.service),
      new DiagnosticV2AiGraderService(grader.service),
    ),
    selector,
    interpreter,
    grader,
  };
}

/** Walks the two entry items so the session is sitting on the negative-distribution item. */
async function reachNegativeDistribution(service: DiagnosticV2SessionService) {
  const start = await service.startSession(STUDENT_ID);
  let attemptId = start.attemptId;
  let itemKey = start.itemKey;
  for (const block of SCRIPT.slice(0, 2)) {
    for (const [previousLine, submittedLine] of block.lines) {
      const r = await service.submitStep(start.sessionId, { attemptId, previousLine, submittedLine });
      if (r.nextAttempt) {
        attemptId = r.nextAttempt.attemptId;
        itemKey = r.nextAttempt.itemKey;
      }
    }
  }
  assert.equal(itemKey, "NEG_DIST_MAIN");
  return { sessionId: start.sessionId, attemptId, openingLine: "-2(x - 5) + 3 = 11" };
}

describe("\"I don't know\" is an action, not a wrong answer", () => {
  it("is never parsed, never graded by AI, and never written as a step", async () => {
    const { prisma, db } = createFakePrisma([STUDENT_ID]);
    const { service, grader, interpreter } = offlineService(prisma);
    const at = await reachNegativeDistribution(service);
    const stepsBefore = db.steps.length;

    const response = await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "",
      dontKnow: true,
    });

    assert.equal(response.outcome, "DECLINED");
    assert.equal(db.steps.length, stepsBefore, "a decline writes no DiagnosticV2Step row");
    assert.equal(grader.calls.length, 0, "the AI grader must never see a line that does not exist");
    assert.equal(interpreter.calls.length, 0, "an admission of not knowing is not a diagnosis");
    // Nothing anywhere in the session may claim the checker tried and failed.
    assert.equal(db.steps.some((s) => s.validity === "PARSE_FAILED"), false);
  });

  it("makes no AI grader call even with every capability switched on", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const grader = mockOrchestrator({
      raw: JSON.stringify({ validity: "INVALID", confidence: 0.9, reasoning: "blank" }),
    });
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(mockOrchestrator({
          raw: (call) =>
            JSON.stringify({
              choice: "EXISTING",
              index: (call.ruleOutput as { index: number }).index,
              confidence: 0.8,
              reasoning: "LIN_DISTRIBUTE_NEG status and the recent error make this the most informative next question.",
            }),
        }).service,
      ),
      new DiagnosticV2AiInterpreterService(
        mockOrchestrator({
          raw: (call) =>
            JSON.stringify({
              hypothesisLabel: (call.ruleOutput as { hypothesisLabel: string }).hypothesisLabel,
              confidence: 0.9,
              reasoning: "r",
              childFacingSummary: "s",
            }),
        }).service,
      ),
      new DiagnosticV2AiGraderService(grader.service),
    );
    const at = await reachNegativeDistribution(service);

    await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "",
      dontKnow: true,
    });

    assert.equal(grader.calls.length, 0);
  });

  it("records zero-weight SKIPPED evidence against the item's target skill", async () => {
    const { prisma, db } = createFakePrisma([STUDENT_ID]);
    const { service } = offlineService(prisma);
    const at = await reachNegativeDistribution(service);

    await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "",
      dontKnow: true,
    });

    const skipped = db.evidence.filter((e) => e.evidenceKind === "SKIPPED");
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0]!.microSkillId, "LIN_DISTRIBUTE_NEG");
    assert.equal(skipped[0]!.weight, 0);
    assert.equal(skipped[0]!.stepId, null, "the evidence cites no step, because there is no step");
    assert.equal(skipped[0]!.topicId, "BRACKETS_SIGNS_FRACTIONS");
  });

  it("leaves the skill UNKNOWN — declining is not the same as getting it wrong", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const { service } = offlineService(prisma);
    const at = await reachNegativeDistribution(service);

    for (let i = 0; i < 2; i++) {
      await service.submitStep(at.sessionId, {
        attemptId: at.attemptId,
        previousLine: at.openingLine,
        submittedLine: "",
        dontKnow: true,
      });
    }

    const debug = await service.getDebugView(at.sessionId);
    const state = debug.microSkillStates.find((s) => s.microSkillId === "LIN_DISTRIBUTE_NEG")!;
    assert.equal(state.evidenceCount, 2, "both declines are recorded");
    assert.equal(state.independentFailureCount, 0, "neither counts as getting the maths wrong");
    assert.equal(state.independentSuccessCount, 0);
    assert.equal(state.status, "UNKNOWN");
    assert.deepEqual(state.observedContextGaps, []);
    assert.equal(debug.hypotheses.length, 0, "no gap was diagnosed, so no hypothesis was written");
  });

  it("climbs the assistance ladder: hand over the rule, then explain and move on", async () => {
    const { prisma, db } = createFakePrisma([STUDENT_ID]);
    const { service } = offlineService(prisma);
    const at = await reachNegativeDistribution(service);

    const first = await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "",
      dontKnow: true,
    });
    assert.equal(first.assistanceOffered, "RULE_PROMPT");
    assert.equal(first.itemComplete, false, "the point of the rule is to let them try it");
    assert.match(first.assistanceMessage!, /What is \(-2\) x \(-5\)\?/);
    assert.match(first.assistanceMessage!, /it is 10, not -10/);
    assert.equal(containsForbiddenTerm(first.assistanceMessage!), false);

    const second = await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "",
      dontKnow: true,
    });
    assert.equal(second.assistanceOffered, "FULL_EXPLANATION");
    assert.equal(second.itemComplete, true, "twice is enough — explain it and move on");
    assert.equal(second.nextAttempt?.itemKey, "TRANSFER_NEG_DIST");
    assert.equal(
      db.attempts.find((a) => a.itemKey === "NEG_DIST_MAIN")!.status,
      "DECLINED",
      "the attempt records why it ended",
    );
  });

  it("scores a correct line written after the rule prompt as assisted, not independent", async () => {
    const { prisma, db } = createFakePrisma([STUDENT_ID]);
    const { service } = offlineService(prisma);
    const at = await reachNegativeDistribution(service);

    await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "",
      dontKnow: true,
    });
    const retry = await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "-2x + 10 + 3 = 11",
    });

    assert.equal(submitted(retry).validity, "VALID");
    const evidence = db.evidence.filter((e) => e.microSkillId === "LIN_DISTRIBUTE_NEG");
    assert.deepEqual(evidence.map((e) => e.evidenceKind), ["SKIPPED", "ASSISTED_CORRECT"]);
    assert.deepEqual(submitted(retry).stepIndex, 0, "the first actual line of this attempt");

    const debug = await service.getDebugView(at.sessionId);
    const state = debug.microSkillStates.find((s) => s.microSkillId === "LIN_DISTRIBUTE_NEG")!;
    assert.equal(state.assistedSuccessCount, 1);
    assert.equal(state.independentSuccessCount, 0, "being told the rule is not doing it alone");
    assert.equal(state.status, "EMERGING");
    assert.ok(
      debug.steps.every((s) => s.contextModifierIds.includes("ASSISTED") || s.assistanceLevel === "NONE"),
    );
  });

  it("shows up in the debug view, so a reviewer never sees an unexplained gap", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const { service } = offlineService(prisma);
    const at = await reachNegativeDistribution(service);

    await service.submitStep(at.sessionId, {
      attemptId: at.attemptId,
      previousLine: at.openingLine,
      submittedLine: "",
      dontKnow: true,
    });

    const debug = await service.getDebugView(at.sessionId);
    assert.equal(debug.declines.length, 1);
    assert.equal(debug.declines[0]!.itemKey, "NEG_DIST_MAIN");
    assert.equal(debug.declines[0]!.microSkillId, "LIN_DISTRIBUTE_NEG");
    assert.equal(debug.declines[0]!.assistanceLevel, "NONE", "no help was in force when they said it");
  });

  it("still rejects a blank submission that does not say it is an 'I don't know'", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const { service } = offlineService(prisma);
    const at = await reachNegativeDistribution(service);

    await assert.rejects(
      service.submitStep(at.sessionId, {
        attemptId: at.attemptId,
        previousLine: at.openingLine,
        submittedLine: "   ",
      }),
      /submittedLine is required/,
    );
  });
});

describe("Arun scenario — guardrails on the API surface", () => {
  it("hands the client the bare opening line, not just the prompt wording", async () => {
    // The prompt reads "Solve for x:  3x + 5 = 20" — sending that back as
    // previousLine is rejected, so the client needs the equation on its own.
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const { service } = offlineService(prisma);
    const start = await service.startSession(STUDENT_ID);

    assert.equal(start.equationPrompt, "Solve for x:  3x + 5 = 20");
    assert.equal(start.openingLine, "3x + 5 = 20");
    await assert.rejects(
      service.submitStep(start.sessionId, {
        attemptId: start.attemptId,
        previousLine: start.equationPrompt,
        submittedLine: "3x = 15",
      }),
      /does not match this attempt's current line/,
    );

    const accepted = await service.submitStep(start.sessionId, {
      attemptId: start.attemptId,
      previousLine: start.openingLine,
      submittedLine: "3x = 15",
    });
    assert.equal(submitted(accepted).validity, "VALID");

    const done = await service.submitStep(start.sessionId, {
      attemptId: start.attemptId,
      previousLine: "3x = 15",
      submittedLine: "x = 5",
    });
    assert.equal(done.nextAttempt?.openingLine, "4x - 7 = 2x + 9");
    assert.equal(done.nextAttempt?.equationPrompt, "Solve for x:  4x - 7 = 2x + 9");
  });

  it("refuses a step graded against a line the student never reached", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const off = () => mockOrchestrator({ generate: false }).service;
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(off()),
      new DiagnosticV2AiInterpreterService(off()),
      new DiagnosticV2AiGraderService(off()),
    );
    const start = await service.startSession(STUDENT_ID);

    await assert.rejects(
      service.submitStep(start.sessionId, {
        attemptId: start.attemptId,
        previousLine: "x = 5",
        submittedLine: "x = 5",
      }),
      /does not match this attempt's current line/,
    );
  });

  it("refuses to reopen a finished session", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const off = () => mockOrchestrator({ generate: false }).service;
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(off()),
      new DiagnosticV2AiInterpreterService(off()),
      new DiagnosticV2AiGraderService(off()),
    );
    const start = await service.startSession(STUDENT_ID);
    let attemptId = start.attemptId;
    let lastResponse;
    for (const block of SCRIPT) {
      for (const [previousLine, submittedLine] of block.lines) {
        lastResponse = await service.submitStep(start.sessionId, { attemptId, previousLine, submittedLine });
        if (lastResponse.nextAttempt) attemptId = lastResponse.nextAttempt.attemptId;
      }
    }
    assert.equal(lastResponse!.sessionStatus, "COMPLETED");

    await assert.rejects(
      service.submitStep(start.sessionId, {
        attemptId,
        previousLine: "z = -2",
        submittedLine: "z = -2",
      }),
      /already ended/,
    );
  });

  it("rejects an unknown student rather than creating an orphan session", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const off = () => mockOrchestrator({ generate: false }).service;
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(off()),
      new DiagnosticV2AiInterpreterService(off()),
      new DiagnosticV2AiGraderService(off()),
    );
    await assert.rejects(service.startSession("nobody"), /Student not found/);
  });
});
