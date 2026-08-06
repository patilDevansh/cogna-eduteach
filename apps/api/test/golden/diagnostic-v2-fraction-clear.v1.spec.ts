import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DiagnosticV2SessionService } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import { createFakePrisma, makeSelectorService, mockOrchestrator, type FakeDb } from "./helpers/diagnostic-v2-fakes";

/**
 * Phase B1 — fraction-linear track end to end, AI on vs AI off.
 *
 * Student: solves the simple fraction entry, fails the clear-fractions main
 * item with the swapped-LCD error, fails the contrast probe the same way,
 * gets RULE_PROMPT, then clears the transfer item correctly.
 *
 * Deterministic facts (validity, evidence, skill counters, route) must be
 * byte-identical with AI fully on or fully off.
 */

const STUDENT_ID = "student-1";

const SCRIPT: Array<{ itemKey: string; lines: Array<[string, string]> }> = [
  {
    itemKey: "ENTRY_FRAC_SIMPLE",
    lines: [
      ["x/2 + 3 = 7", "x/2 = 4"],
      ["x/2 = 4", "x = 8"],
    ],
  },
  {
    itemKey: "FRAC_CLEAR_MAIN",
    lines: [["(x + 1)/2 = (x - 1)/3 + 1", "2(x + 1) = 3(x - 1) + 6"]],
  },
  {
    itemKey: "FRAC_CLEAR_CONTRAST",
    lines: [["(y + 2)/4 = 3", "(y + 2)/2 = 3"]],
  },
  {
    itemKey: "TRANSFER_FRAC_CLEAR",
    lines: [
      ["(z - 2)/3 = (z + 1)/6 + 1", "2(z - 2) = (z + 1) + 6"],
      ["2(z - 2) = (z + 1) + 6", "2z - 4 = z + 1 + 6"],
      ["2z - 4 = z + 1 + 6", "2z - 4 = z + 7"],
      ["2z - 4 = z + 7", "z - 4 = 7"],
      ["z - 4 = 7", "z = 11"],
    ],
  },
];

type StepResponse = Awaited<ReturnType<DiagnosticV2SessionService["submitStep"]>>;

interface RunResult {
  db: FakeDb;
  responses: StepResponse[];
  debug: Awaited<ReturnType<DiagnosticV2SessionService["getDebugView"]>>;
  aiCallCount: number;
}

function submitted(response: StepResponse) {
  assert.equal(response.outcome, "SUBMITTED");
  return response as Extract<StepResponse, { outcome: "SUBMITTED" }>;
}

async function runScenario(aiEnabled: boolean): Promise<RunResult> {
  const { prisma, db } = createFakePrisma([STUDENT_ID]);

  const selector = mockOrchestrator({
    generate: aiEnabled,
    raw: (call) =>
      JSON.stringify({
        choice: "EXISTING",
        index: (call.ruleOutput as { index: number }).index,
        confidence: 0.8,
        reasoning:
          "LIN_CLEAR_FRACTIONS status and the recent clearing error make this the most informative next question.",
      }),
  });
  const interpreter = mockOrchestrator({
    generate: aiEnabled,
    raw: () =>
      JSON.stringify({
        microSkillId: "LIN_CLEAR_FRACTIONS",
        hypothesisLabel: "likely_gap",
        confidence: 0.75,
        reasoning: "Two independent clearing failures on structurally different items.",
        childFacingSummary: "Clearing fractions by multiplying both sides still needs practice.",
      }),
  });
  const grader = mockOrchestrator({ generate: aiEnabled });

  const service = new DiagnosticV2SessionService(
    prisma,
    makeSelectorService(selector.service),
    new DiagnosticV2AiInterpreterService(interpreter.service),
    new DiagnosticV2AiGraderService(grader.service),
  );

  const start = await service.startSession(STUDENT_ID, "FRACTION_LINEAR");
  assert.equal(start.itemKey, "ENTRY_FRAC_SIMPLE");

  const responses: StepResponse[] = [];
  let attemptId = start.attemptId;
  let itemKey = start.itemKey;
  let scriptIndex = 0;

  while (scriptIndex < SCRIPT.length) {
    const block = SCRIPT[scriptIndex]!;
    assert.equal(itemKey, block.itemKey, `expected to be on ${block.itemKey}, on ${itemKey}`);
    for (const [previousLine, submittedLine] of block.lines) {
      const response = await service.submitStep(start.sessionId, {
        attemptId,
        previousLine,
        submittedLine,
      });
      responses.push(response);
      if (response.nextAttempt) {
        attemptId = response.nextAttempt.attemptId;
        itemKey = response.nextAttempt.itemKey;
      }
    }
    scriptIndex++;
  }

  const debug = await service.getDebugView(start.sessionId);
  return {
    db,
    responses,
    debug,
    aiCallCount: selector.calls.length + interpreter.calls.length + grader.calls.length,
  };
}

function deterministicFacts(run: RunResult) {
  return {
    route: run.debug.stageHistory.map((e) => e.stageId),
    steps: run.db.steps.map((s) => ({
      validity: s.validity,
      transformation: s.attemptedTransformation,
      code: s.firstInvalidActionCode ?? null,
      primary: s.primaryMicroSkillId,
      kind: null as string | null,
    })),
    evidence: run.db.evidence.map((e) => ({
      microSkillId: e.microSkillId,
      evidenceKind: e.evidenceKind,
      weight: e.weight,
      assistanceLevel: e.assistanceLevel,
    })),
    states: [...run.db.states]
      .map((s) => ({
        microSkillId: s.microSkillId,
        status: s.status,
        evidenceCount: s.evidenceCount,
        independentSuccessCount: s.independentSuccessCount,
        independentFailureCount: s.independentFailureCount,
        assistedSuccessCount: s.assistedSuccessCount,
      }))
      .sort((a, b) => String(a.microSkillId).localeCompare(String(b.microSkillId))),
    responseValidities: run.responses.map((r) =>
      r.outcome === "SUBMITTED" ? r.validity : r.outcome,
    ),
  };
}

describe("fraction-clear track — AI on vs AI off parity", () => {
  it("produces identical deterministic facts with AI on and AI off", async () => {
    const on = await runScenario(true);
    const off = await runScenario(false);

    assert.ok(on.aiCallCount > 0, "AI-on run must actually call the model");
    assert.equal(off.aiCallCount, 0, "AI-off run must make zero model calls");

    assert.deepEqual(deterministicFacts(on), deterministicFacts(off));

    // Route includes the teaching moment then transfer.
    assert.ok(on.debug.stageHistory.some((e) => e.stageId === "RULE_PROMPT"));
    assert.ok(on.debug.stageHistory.some((e) => e.stageId === "TRANSFER_FRAC_CLEAR"));
    assert.ok(on.debug.stageHistory.some((e) => e.stageId === "COMPLETE"));

    // Main item recorded the swapped-LCD code.
    const mainFail = on.db.steps.find(
      (s) =>
        s.previousLine === "(x + 1)/2 = (x - 1)/3 + 1" &&
        s.submittedLine === "2(x + 1) = 3(x - 1) + 6",
    );
    assert.ok(mainFail);
    assert.equal(mainFail!.firstInvalidActionCode, "WRONG_COMMON_MULTIPLE");
    assert.equal(mainFail!.primaryMicroSkillId, "LIN_CLEAR_FRACTIONS");

    // Default negative-distribution track is not touched.
    assert.equal(
      on.db.attempts.some((a) => a.itemKey === "NEG_DIST_MAIN"),
      false,
    );
  });

  it("default startSession still opens the negative-distribution track", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(mockOrchestrator({ generate: false }).service),
      new DiagnosticV2AiInterpreterService(mockOrchestrator({ generate: false }).service),
      new DiagnosticV2AiGraderService(mockOrchestrator({ generate: false }).service),
    );
    const start = await service.startSession(STUDENT_ID);
    assert.equal(start.itemKey, "ENTRY_TWO_STEP");
    assert.equal(start.stageId, "ENTRY_TWO_STEP");
  });
});
