import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MICRO_SKILL_IDS, type MicroSkillStatus } from "@cogna/shared";
import { DiagnosticV2SessionService } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import {
  createFakePrisma,
  makeSelectorService,
  mockOrchestrator,
  type FakeDb,
  type MockOrchestrator,
  type MockOrchestratorBehaviour,
} from "./helpers/diagnostic-v2-fakes";

/**
 * MVP 9.0.1 Phase A2, T2 — the wrong-answer matrix for `-2(x - 5) + 3 = 11`.
 *
 * Phase A's scenario spec walks a mostly-correct path. The diagnostic's whole
 * value, though, sits in the failure branches: which specific action was wrong,
 * which single micro-skill that lands on, and — above all — which micro-skills
 * it must leave completely alone. This file drives one wrong line at a time
 * through the real service and asserts all three.
 *
 * Only the AI orchestrator is faked. The verifier, the attribution rules and
 * the evidence formulas are the subject under test and run for real.
 */

const STUDENT_ID = "student-1";
const NEG_DIST_MAIN_LINE = "-2(x - 5) + 3 = 11";

/** Both entry items, solved cleanly — the deterministic route to NEG_DIST_MAIN. */
const ENTRY_WALK: Array<[string, string]> = [
  ["3x + 5 = 20", "3x = 15"],
  ["3x = 15", "x = 5"],
  ["4x - 7 = 2x + 9", "2x - 7 = 9"],
  ["2x - 7 = 9", "2x = 16"],
  ["2x = 16", "x = 8"],
];

type StepResponse = Awaited<ReturnType<DiagnosticV2SessionService["submitStep"]>>;

function submitted(response: StepResponse) {
  assert.equal(response.outcome, "SUBMITTED");
  return response as Extract<StepResponse, { outcome: "SUBMITTED" }>;
}

interface Harness {
  service: DiagnosticV2SessionService;
  db: FakeDb;
  grader: MockOrchestrator;
  interpreter: MockOrchestrator;
  sessionId: string;
  attemptId: string;
  openingLine: string;
}

/**
 * A session parked on the negative-distribution item, with both entry items
 * already solved. That prior work matters: it leaves five micro-skills holding
 * real, non-empty state, so the containment assertions below have something
 * substantial to prove was left untouched.
 */
async function atNegDistMain(
  graderBehaviour: MockOrchestratorBehaviour = { generate: false },
): Promise<Harness> {
  const { prisma, db } = createFakePrisma([STUDENT_ID]);
  const selector = mockOrchestrator({ generate: false });
  const interpreter = mockOrchestrator({ generate: false });
  const grader = mockOrchestrator(graderBehaviour);

  const service = new DiagnosticV2SessionService(
    prisma,
    makeSelectorService(selector.service),
    new DiagnosticV2AiInterpreterService(interpreter.service),
    new DiagnosticV2AiGraderService(grader.service),
  );

  const start = await service.startSession(STUDENT_ID);
  let attemptId = start.attemptId;
  let itemKey = start.itemKey;
  for (const [previousLine, submittedLine] of ENTRY_WALK) {
    const response = await service.submitStep(start.sessionId, { attemptId, previousLine, submittedLine });
    if (response.nextAttempt) {
      attemptId = response.nextAttempt.attemptId;
      itemKey = response.nextAttempt.itemKey;
    }
  }
  assert.equal(itemKey, "NEG_DIST_MAIN", "the entry walk must land on the negative-distribution item");

  return { service, db, grader, interpreter, sessionId: start.sessionId, attemptId, openingLine: NEG_DIST_MAIN_LINE };
}

// ─── Evidence containment ───────────────────────────────────────────────────

interface SkillRow {
  status: MicroSkillStatus;
  evidenceCount: number;
  independentSuccessCount: number;
  independentFailureCount: number;
  assistedSuccessCount: number;
  observedContextStrengths: string[];
  observedContextGaps: string[];
}

type SkillSnapshot = Record<string, SkillRow>;

/** A skill nobody has evidenced yet. Spelled out rather than left absent, so an accidental row for it shows up as a diff. */
const NEVER_TESTED: SkillRow = {
  status: "UNKNOWN",
  evidenceCount: 0,
  independentSuccessCount: 0,
  independentFailureCount: 0,
  assistedSuccessCount: 0,
  observedContextStrengths: [],
  observedContextGaps: [],
};

/**
 * The full state of all nine micro-skills, including the ones with no row in
 * the store. Snapshotting every skill — rather than spot-checking one or two —
 * is what makes the containment assertion real: any leak anywhere shows up.
 */
async function snapshotSkills(service: DiagnosticV2SessionService, sessionId: string): Promise<SkillSnapshot> {
  const debug = await service.getDebugView(sessionId);
  const byId = new Map(debug.microSkillStates.map((s) => [s.microSkillId, s]));
  const snapshot: SkillSnapshot = {};
  for (const id of MICRO_SKILL_IDS) {
    const row = byId.get(id);
    snapshot[id] = row
      ? {
          status: row.status,
          evidenceCount: row.evidenceCount,
          independentSuccessCount: row.independentSuccessCount,
          independentFailureCount: row.independentFailureCount,
          assistedSuccessCount: row.assistedSuccessCount,
          observedContextStrengths: [...row.observedContextStrengths],
          observedContextGaps: [...row.observedContextGaps],
        }
      : { ...NEVER_TESTED };
  }
  return snapshot;
}

/**
 * The single most important assertion in this file: one mistake must not
 * poison the whole profile. Every skill outside `implicated` has to come out
 * of the step exactly as it went in — same status, same four counters, same
 * context history. The reverse is asserted too, so a step that quietly stopped
 * producing any evidence at all cannot pass by leaving everything unchanged.
 */
function assertEvidenceContained(
  before: SkillSnapshot,
  after: SkillSnapshot,
  implicated: string[],
): void {
  for (const id of MICRO_SKILL_IDS) {
    if (implicated.includes(id)) continue;
    assert.deepEqual(
      after[id],
      before[id],
      `${id} was not involved in this step but its state changed:\n  before ${JSON.stringify(before[id])}\n  after  ${JSON.stringify(after[id])}`,
    );
  }
  for (const id of implicated) {
    assert.notDeepEqual(
      after[id],
      before[id],
      `${id} was expected to carry this step's evidence but came out unchanged — the containment check would pass vacuously`,
    );
  }
}

// ─── Reading what the step actually recorded ────────────────────────────────

interface StepRecord {
  validity: string;
  firstInvalidActionCode: string | null;
  firstInvalidActionDescription: string | null;
  primaryMicroSkillId: string | null;
  verificationSource: string;
  assistanceLevel: string;
  contextModifierIds: string[];
}

function lastStep(db: FakeDb): StepRecord {
  const row = db.steps[db.steps.length - 1]!;
  return {
    validity: row.validity as string,
    firstInvalidActionCode: (row.firstInvalidActionCode as string | null) ?? null,
    firstInvalidActionDescription: (row.firstInvalidActionDescription as string | null) ?? null,
    primaryMicroSkillId: (row.primaryMicroSkillId as string | null) ?? null,
    verificationSource: row.verificationSource as string,
    assistanceLevel: row.assistanceLevel as string,
    contextModifierIds: row.contextModifierIds as string[],
  };
}

interface EvidenceRecord {
  microSkillId: string;
  evidenceKind: string;
  weight: number;
  assistanceLevel: string;
  contextModifierIds: string[];
}

function evidenceSince(db: FakeDb, from: number): EvidenceRecord[] {
  return db.evidence.slice(from).map((e) => ({
    microSkillId: e.microSkillId as string,
    evidenceKind: e.evidenceKind as string,
    weight: e.weight as number,
    assistanceLevel: e.assistanceLevel as string,
    contextModifierIds: e.contextModifierIds as string[],
  }));
}

// ─── The matrix ─────────────────────────────────────────────────────────────

describe("T2 wrong-answer matrix for -2(x - 5) + 3 = 11", () => {
  it("row 1 — the correct expansion is VALID, positively evidenced, and unassisted", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);
    const evidenceFrom = h.db.evidence.length;

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "-2x + 10 + 3 = 11",
      }),
    );

    assert.equal(response.validity, "VALID");
    assert.equal(response.attemptedTransformation, "DISTRIBUTE");
    assert.equal(response.firstInvalidActionDescription, undefined, "nothing went wrong, so nothing is named");
    assert.equal(response.assistanceOffered, undefined, "a correct line is never met with help");
    assert.equal(response.assistanceMessage, undefined);

    assert.deepEqual(evidenceSince(h.db, evidenceFrom), [
      {
        microSkillId: "LIN_DISTRIBUTE_NEG",
        evidenceKind: "INDEPENDENT_CORRECT",
        weight: 1,
        assistanceLevel: "NONE",
        contextModifierIds: ["INDEPENDENT"],
      },
    ]);

    const after = await snapshotSkills(h.service, h.sessionId);
    assert.equal(after.LIN_DISTRIBUTE_NEG!.status, "DEVELOPING", "one clean success is not yet reliable");
    assert.deepEqual(after.LIN_DISTRIBUTE_NEG!.observedContextStrengths, ["INDEPENDENT"]);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 2 — the canonical sign error is INVALID, names the sign product, and lands on LIN_DISTRIBUTE_NEG only", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);
    const evidenceFrom = h.db.evidence.length;

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "-2x - 10 + 3 = 11",
      }),
    );

    assert.equal(response.validity, "INVALID");
    assert.equal(response.verificationSource, "DETERMINISTIC");
    assert.equal(
      response.firstInvalidActionDescription,
      "(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10",
      "the point of the whole diagnostic: name the actual numbers, not 'wrong answer'",
    );

    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "NEGATIVE_SIGN_PRODUCT");
    assert.equal(step.primaryMicroSkillId, "LIN_DISTRIBUTE_NEG");

    // The prerequisite the error implicates is recorded on the step for
    // traceability but is never itself scored.
    assert.deepEqual(evidenceSince(h.db, evidenceFrom), [
      {
        microSkillId: "LIN_DISTRIBUTE_NEG",
        evidenceKind: "INDEPENDENT_INCORRECT",
        weight: -1,
        assistanceLevel: "NONE",
        contextModifierIds: ["INDEPENDENT"],
      },
    ]);

    const after = await snapshotSkills(h.service, h.sessionId);
    assert.equal(after.FND_SIGN_MUL_DIV!.status, "UNKNOWN", "the prerequisite is cited, never scored");
    assert.equal(after.LIN_DISTRIBUTE_NEG!.status, "EMERGING", "one error is a hypothesis, not a gap");
    assert.equal(after.LIN_DISTRIBUTE_NEG!.independentFailureCount, 1);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 3 — the multiplier reaching only the first term is INVALID and is NOT conflated with the sign error", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "-2x - 5 + 3 = 11",
      }),
    );

    assert.equal(response.validity, "INVALID");

    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "INCOMPLETE_DISTRIBUTION");
    assert.notEqual(
      step.firstInvalidActionCode,
      "NEGATIVE_SIGN_PRODUCT",
      "forgetting to multiply the second term is a different mistake from mis-signing the product",
    );
    assert.equal(
      step.firstInvalidActionDescription,
      "the -2 was multiplied by the first term inside the bracket but not by -5",
    );
    assert.doesNotMatch(
      step.firstInvalidActionDescription!,
      /signs give/,
      "this student's sign arithmetic was never tested — do not accuse them of getting it wrong",
    );

    const after = await snapshotSkills(h.service, h.sessionId);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 3 vs row 2 — the two distribution errors produce genuinely different records", async () => {
    const signError = await atNegDistMain();
    await signError.service.submitStep(signError.sessionId, {
      attemptId: signError.attemptId,
      previousLine: signError.openingLine,
      submittedLine: "-2x - 10 + 3 = 11",
    });

    const partialError = await atNegDistMain();
    await partialError.service.submitStep(partialError.sessionId, {
      attemptId: partialError.attemptId,
      previousLine: partialError.openingLine,
      submittedLine: "-2x - 5 + 3 = 11",
    });

    const a = lastStep(signError.db);
    const b = lastStep(partialError.db);
    assert.notEqual(a.firstInvalidActionCode, b.firstInvalidActionCode);
    assert.notEqual(a.firstInvalidActionDescription, b.firstInvalidActionDescription);
  });

  it("row 4 — dropping the + 3 is INVALID and creates no sign-error evidence", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "-2x + 10 = 11",
      }),
    );

    assert.equal(response.validity, "INVALID");

    const step = lastStep(h.db);
    assert.notEqual(
      step.firstInvalidActionCode,
      "NEGATIVE_SIGN_PRODUCT",
      "the sign product here was correct — the term outside the bracket is what went missing",
    );
    assert.doesNotMatch(step.firstInvalidActionDescription!, /signs give/);
    assert.equal(step.firstInvalidActionCode, "OUTER_CONSTANT_DROPPED");

    const after = await snapshotSkills(h.service, h.sessionId);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 5 — dropping the outer sign entirely is INVALID", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "2x - 10 + 3 = 11",
      }),
    );

    assert.equal(response.validity, "INVALID");
    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "OUTER_SIGN_DROPPED");
    assert.notEqual(step.firstInvalidActionCode, "NEGATIVE_SIGN_PRODUCT");

    const after = await snapshotSkills(h.service, h.sessionId);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 6 — the final answer with no working is low-resolution evidence and credits no hidden steps", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);
    const evidenceFrom = h.db.evidence.length;

    // x = 1 is the correct solution, reached in one jump. Everything the
    // student skipped past — removing the constant, dividing by the
    // coefficient, checking the answer — stays exactly as it was.
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "x = 1",
      }),
    );

    assert.equal(response.validity, "VALID");
    assert.equal(response.itemComplete, true);

    const created = evidenceSince(h.db, evidenceFrom);
    assert.equal(created.length, 1, "one line of working earns exactly one piece of evidence");
    assert.equal(created[0]!.microSkillId, "LIN_DISTRIBUTE_NEG");
    assert.equal(created[0]!.evidenceKind, "INDEPENDENT_CORRECT");

    const after = await snapshotSkills(h.service, h.sessionId);
    assert.equal(after.LIN_CHECK_SOLUTION!.status, "UNKNOWN", "never demonstrated, so never credited");
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 6b — a wrong final answer with no working is INVALID, and still credits nothing else", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "x = -2",
      }),
    );

    assert.equal(response.validity, "INVALID");

    const after = await snapshotSkills(h.service, h.sessionId);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 7 — an unreadable line is PARSE_FAILED, never INVALID by default, and produces no evidence", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);
    const evidenceFrom = h.db.evidence.length;

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "um i think ?? x",
      }),
    );

    assert.equal(response.validity, "PARSE_FAILED");
    assert.notEqual(response.validity, "INVALID", "a line the checker cannot read is not a wrong line");
    assert.equal(response.verificationSource, "DETERMINISTIC");
    assert.equal(response.itemComplete, false, "an unreadable line does not end the question");
    assert.deepEqual(evidenceSince(h.db, evidenceFrom), []);

    const after = await snapshotSkills(h.service, h.sessionId);
    assertEvidenceContained(before, after, []);
  });

  it("row 7 — an unreadable line is the one case that reaches the AI grader", async () => {
    const h = await atNegDistMain({
      raw: JSON.stringify({ validity: "INVALID", confidence: 0.6, reasoning: "This line is not algebra." }),
    });
    const before = await snapshotSkills(h.service, h.sessionId);
    const evidenceFrom = h.db.evidence.length;

    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "um i think ?? x",
      }),
    );

    assert.equal(h.grader.calls.length, 1, "the rules abstained, so the fallback runs");
    assert.equal(response.validity, "INVALID");
    assert.equal(response.verificationSource, "AI_FALLBACK");

    // Same observation, read less certainly — an AI-graded line can never
    // outweigh a deterministically graded one.
    const created = evidenceSince(h.db, evidenceFrom);
    assert.equal(created.length, 1);
    assert.equal(created[0]!.evidenceKind, "INDEPENDENT_INCORRECT");
    assert.equal(created[0]!.weight, -0.5);

    const after = await snapshotSkills(h.service, h.sessionId);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });

  it("row 8 — 'I don't know' is a zero-weight SKIPPED, leaves the skill UNKNOWN, and never calls the AI grader", async () => {
    const h = await atNegDistMain({
      raw: JSON.stringify({ validity: "INVALID", confidence: 0.9, reasoning: "blank" }),
    });
    const before = await snapshotSkills(h.service, h.sessionId);
    const evidenceFrom = h.db.evidence.length;
    const stepsBefore = h.db.steps.length;

    const response = await h.service.submitStep(h.sessionId, {
      attemptId: h.attemptId,
      previousLine: h.openingLine,
      submittedLine: "",
      dontKnow: true,
    });

    assert.equal(response.outcome, "DECLINED");
    assert.equal(h.grader.calls.length, 0, "there is no line to grade, so nothing may be asked to grade it");
    assert.equal(h.db.steps.length, stepsBefore, "a decline writes no step row");

    assert.deepEqual(evidenceSince(h.db, evidenceFrom), [
      {
        microSkillId: "LIN_DISTRIBUTE_NEG",
        evidenceKind: "SKIPPED",
        weight: 0,
        assistanceLevel: "NONE",
        contextModifierIds: ["INDEPENDENT"],
      },
    ]);

    const after = await snapshotSkills(h.service, h.sessionId);
    assert.equal(after.LIN_DISTRIBUTE_NEG!.status, "UNKNOWN", "declining is not getting it wrong");
    assert.equal(after.LIN_DISTRIBUTE_NEG!.independentFailureCount, 0);
    assert.equal(after.LIN_DISTRIBUTE_NEG!.evidenceCount, 1, "the decline is still a real, citable observation");
    assert.deepEqual(after.LIN_DISTRIBUTE_NEG!.observedContextGaps, []);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });
});

// ─── Evidence containment, stated once as its own claim ─────────────────────

describe("T2 evidence containment — one mistake never poisons the profile", () => {
  const wrongLines = [
    "-2x - 10 + 3 = 11",
    "-2x - 5 + 3 = 11",
    "-2x + 10 = 11",
    "2x - 10 + 3 = 11",
    "x = -2",
    "um i think ?? x",
  ];

  for (const line of wrongLines) {
    it(`leaves the other eight micro-skills byte-identical after "${line}"`, async () => {
      const h = await atNegDistMain();
      const before = await snapshotSkills(h.service, h.sessionId);
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: line,
      });
      const after = await snapshotSkills(h.service, h.sessionId);

      for (const id of MICRO_SKILL_IDS) {
        if (id === "LIN_DISTRIBUTE_NEG") continue;
        assert.deepEqual(after[id], before[id], `"${line}" changed ${id}, which it never touched`);
      }
    });
  }

  it("keeps the five skills earned on the entry items exactly as they were", async () => {
    const h = await atNegDistMain();
    const before = await snapshotSkills(h.service, h.sessionId);

    // The entry walk is what makes this assertion worth making: without it
    // every untouched skill would be an empty row and equality would be free.
    assert.equal(before.LIN_REMOVE_CONSTANT!.status, "RELIABLE");
    assert.equal(before.LIN_REMOVE_COEFFICIENT!.status, "RELIABLE");
    assert.equal(before.LIN_SOLVE_TWO_STEP!.status, "DEVELOPING");
    assert.equal(before.LIN_SOLVE_VARIABLE_BOTH!.status, "DEVELOPING");
    assert.equal(before.LIN_COMBINE_LIKE!.status, "DEVELOPING");

    await h.service.submitStep(h.sessionId, {
      attemptId: h.attemptId,
      previousLine: h.openingLine,
      submittedLine: "-2x - 10 + 3 = 11",
    });

    const after = await snapshotSkills(h.service, h.sessionId);
    assertEvidenceContained(before, after, ["LIN_DISTRIBUTE_NEG"]);
  });
});

// ─── Right answer, wrong reason ─────────────────────────────────────────────

describe("T2 right answer, wrong reason", () => {
  /**
   * The student distributes correctly, then botches the isolation step, then
   * arrives at the right final answer. The correct answer must not wash out
   * the error underneath it.
   */
  async function rightAnswerWrongReason() {
    const h = await atNegDistMain();
    const evidenceFrom = h.db.evidence.length;

    const distribute = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "-2x + 13 = 11",
      }),
    );
    const botched = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: "-2x + 13 = 11",
        submittedLine: "-2x = 3",
      }),
    );
    const finalAnswer = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: "-2x + 13 = 11",
        submittedLine: "x = 1",
      }),
    );

    return { h, evidenceFrom, distribute, botched, finalAnswer };
  }

  it("ends on the correct answer but still records the failure underneath it", async () => {
    const { h, distribute, botched, finalAnswer } = await rightAnswerWrongReason();

    assert.equal(distribute.validity, "VALID");
    assert.equal(botched.validity, "INVALID");
    assert.equal(finalAnswer.validity, "VALID");
    assert.equal(finalAnswer.itemComplete, true);
    assert.equal(
      h.db.attempts.find((a) => a.itemKey === "NEG_DIST_MAIN")!.status,
      "SOLVED",
      "the student did reach x = 1",
    );

    const state = await snapshotSkills(h.service, h.sessionId);
    assert.equal(state.LIN_REMOVE_CONSTANT!.independentFailureCount, 1);
    assert.equal(
      state.LIN_REMOVE_CONSTANT!.status,
      "EMERGING",
      "a skill that was reliable and then failed is no longer reliable, however the question ended",
    );
    assert.deepEqual(state.LIN_REMOVE_CONSTANT!.observedContextGaps, ["INDEPENDENT"]);
  });

  it("gives the item's headline skill no completion bonus once any line in it was wrong", async () => {
    const { h, evidenceFrom } = await rightAnswerWrongReason();

    const created = evidenceSince(h.db, evidenceFrom);
    assert.deepEqual(
      created.map((e) => [e.microSkillId, e.evidenceKind]),
      [
        ["LIN_DISTRIBUTE_NEG", "INDEPENDENT_CORRECT"],
        ["LIN_REMOVE_CONSTANT", "INDEPENDENT_INCORRECT"],
        ["LIN_REMOVE_COEFFICIENT", "SELF_CORRECTED"],
      ],
      "solving the item does not earn a second, free credit for the skill it was chosen to probe",
    );

    const state = await snapshotSkills(h.service, h.sessionId);
    assert.equal(
      state.LIN_DISTRIBUTE_NEG!.evidenceCount,
      1,
      "exactly the one line that actually distributed, and no more",
    );
  });

  it("does not let the recovery count as a fresh independent success", async () => {
    const { h } = await rightAnswerWrongReason();
    const state = await snapshotSkills(h.service, h.sessionId);
    assert.equal(
      state.LIN_REMOVE_COEFFICIENT!.independentSuccessCount,
      2,
      "still just the two clean successes from the entry items",
    );
    assert.equal(state.LIN_REMOVE_COEFFICIENT!.assistedSuccessCount, 1);
  });
});

// ─── Self-correction ────────────────────────────────────────────────────────

describe("T2 self-correction is not clean independent success", () => {
  it("scores a corrected line as SELF_CORRECTED, at just over half the weight", async () => {
    const h = await atNegDistMain();
    const evidenceFrom = h.db.evidence.length;

    await h.service.submitStep(h.sessionId, {
      attemptId: h.attemptId,
      previousLine: h.openingLine,
      submittedLine: "-2x + 13 = 11",
    });
    const wrong = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: "-2x + 13 = 11",
        submittedLine: "-2x = 3",
      }),
    );
    assert.equal(wrong.assistanceOffered, "REVIEW_OPPORTUNITY", "a first wrong line earns another look, not a rule");

    const corrected = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: "-2x + 13 = 11",
        submittedLine: "-2x = -2",
      }),
    );
    assert.equal(corrected.validity, "VALID");

    const created = evidenceSince(h.db, evidenceFrom);
    const recovery = created[created.length - 1]!;
    assert.equal(recovery.microSkillId, "LIN_REMOVE_CONSTANT");
    assert.equal(recovery.evidenceKind, "SELF_CORRECTED");
    assert.equal(recovery.weight, 0.55);
    assert.notEqual(recovery.evidenceKind, "INDEPENDENT_CORRECT", "getting it right at the second attempt is a different fact");

    // Looking at your own line again is not being told anything, so the step
    // is still tagged independent even though the evidence is discounted.
    assert.deepEqual(recovery.contextModifierIds, ["INDEPENDENT"]);
    assert.equal(lastStep(h.db).assistanceLevel, "REVIEW_OPPORTUNITY");

    const state = await snapshotSkills(h.service, h.sessionId);
    assert.equal(state.LIN_REMOVE_CONSTANT!.assistedSuccessCount, 1);
    assert.equal(
      state.LIN_REMOVE_CONSTANT!.independentSuccessCount,
      2,
      "the correction adds nothing to the independent tally",
    );
  });
});

// ─── Assisted success ───────────────────────────────────────────────────────

describe("T2 assisted success is never recorded as independent", () => {
  it("scores a correct line written after the rule prompt as ASSISTED_CORRECT", async () => {
    const h = await atNegDistMain();
    const evidenceFrom = h.db.evidence.length;

    const declined = await h.service.submitStep(h.sessionId, {
      attemptId: h.attemptId,
      previousLine: h.openingLine,
      submittedLine: "",
      dontKnow: true,
    });
    assert.equal(declined.assistanceOffered, "RULE_PROMPT");
    assert.match(declined.assistanceMessage!, /What is \(-2\) x \(-5\)\?/);

    const afterHelp = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "-2x + 10 + 3 = 11",
      }),
    );
    assert.equal(afterHelp.validity, "VALID");

    assert.deepEqual(
      evidenceSince(h.db, evidenceFrom).map((e) => [e.evidenceKind, e.weight]),
      [
        ["SKIPPED", 0],
        ["ASSISTED_CORRECT", 0.2],
      ],
    );
    assert.deepEqual(lastStep(h.db).contextModifierIds, ["ASSISTED"]);

    const state = await snapshotSkills(h.service, h.sessionId);
    assert.equal(state.LIN_DISTRIBUTE_NEG!.assistedSuccessCount, 1);
    assert.equal(state.LIN_DISTRIBUTE_NEG!.independentSuccessCount, 0, "being handed the rule is not doing it alone");
    assert.equal(state.LIN_DISTRIBUTE_NEG!.status, "EMERGING");
    assert.deepEqual(state.LIN_DISTRIBUTE_NEG!.observedContextStrengths, ["ASSISTED"]);
    assert.notEqual(state.LIN_DISTRIBUTE_NEG!.status, "DEVELOPING");
  });
});

// ─── Error, then recovery ───────────────────────────────────────────────────

describe("T2 error then recovery — a later success does not erase a confirmed gap", () => {
  it("holds LIKELY_GAP through a clean transfer item", async () => {
    const h = await atNegDistMain();

    // Same sign error twice, on structurally different problems.
    const first = await h.service.submitStep(h.sessionId, {
      attemptId: h.attemptId,
      previousLine: h.openingLine,
      submittedLine: "-2x - 10 + 3 = 11",
    });
    assert.equal(first.nextAttempt?.itemKey, "NEG_DIST_CONTRAST");

    const afterOne = await snapshotSkills(h.service, h.sessionId);
    assert.equal(afterOne.LIN_DISTRIBUTE_NEG!.status, "EMERGING", "one error is not yet a gap");

    const second = await h.service.submitStep(h.sessionId, {
      attemptId: first.nextAttempt!.attemptId,
      previousLine: "-3(y - 4)",
      submittedLine: "-3y - 12",
    });
    const afterTwo = await snapshotSkills(h.service, h.sessionId);
    assert.equal(afterTwo.LIN_DISTRIBUTE_NEG!.status, "LIKELY_GAP", "the second failure confirms the pattern");
    assert.equal(second.assistanceOffered, "RULE_PROMPT", "only now is the rule taught");
    assert.equal(second.nextAttempt?.itemKey, "TRANSFER_NEG_DIST");

    // The transfer item, solved cleanly and start to finish.
    let attemptId = second.nextAttempt!.attemptId;
    for (const [previousLine, submittedLine] of [
      ["-4(z - 2) + 3 = 19", "-4z + 8 + 3 = 19"],
      ["-4z + 8 + 3 = 19", "-4z = 8"],
      ["-4z = 8", "z = -2"],
    ] as Array<[string, string]>) {
      const r = await h.service.submitStep(h.sessionId, { attemptId, previousLine, submittedLine });
      assert.equal(submitted(r).validity, "VALID");
      if (r.nextAttempt) attemptId = r.nextAttempt.attemptId;
    }

    const afterRecovery = await snapshotSkills(h.service, h.sessionId);
    assert.equal(
      afterRecovery.LIN_DISTRIBUTE_NEG!.status,
      "LIKELY_GAP",
      "one good day does not close a gap established twice — the retention check decides that",
    );
    assert.equal(afterRecovery.LIN_DISTRIBUTE_NEG!.independentFailureCount, 2, "the failures are not rewritten");
    assert.equal(afterRecovery.LIN_DISTRIBUTE_NEG!.independentSuccessCount, 1);
    assert.deepEqual(
      afterRecovery.LIN_DISTRIBUTE_NEG!.observedContextGaps,
      ["INDEPENDENT"],
      "layer 7 is a history, not a latch that a later success clears",
    );
    assert.deepEqual(afterRecovery.LIN_DISTRIBUTE_NEG!.observedContextStrengths, ["INDEPENDENT", "NEAR_TRANSFER"]);
  });
});

// ─── First-invalid-action: shapes that must not be conflated ────────────────

/**
 * Previously mis-diagnosed: the bracket branch reasoned only about the constant
 * term. Fixed in `findFirstInvalidAction` — outer-sign drop and outer-constant
 * drop must stay distinct from the canonical sign-product error.
 */
describe("T2 first-invalid-action distinguishes outer-sign and outer-constant drops", () => {
  it("does not conflate 'outer sign dropped entirely' with the canonical sign error", async () => {
    // previous `-2(x - 5) + 3 = 11`, submitted `2x - 10 + 3 = 11`.
    // Same constant delta as the sign-product error, but the x coefficient
    // flipped — a distinct misconception from mis-signing one product.
    const h = await atNegDistMain();
    await h.service.submitStep(h.sessionId, {
      attemptId: h.attemptId,
      previousLine: h.openingLine,
      submittedLine: "2x - 10 + 3 = 11",
    });

    const step = lastStep(h.db);
    assert.notEqual(
      step.firstInvalidActionCode,
      "NEGATIVE_SIGN_PRODUCT",
      "dropping the outer minus is a different misconception from mis-signing one product",
    );
    assert.equal(step.firstInvalidActionCode, "OUTER_SIGN_DROPPED");
    assert.match(step.firstInvalidActionDescription!, /outer factor -2/);
  });

  it("does not accuse a correct bracket expansion when a term outside it was dropped", async () => {
    // previous `-2(x - 5) + 3 = 11`, submitted `-2x + 10 = 11`.
    // `-2x + 10` is exactly -2 times each term inside the bracket; the +3
    // outside vanished.
    const h = await atNegDistMain();
    await h.service.submitStep(h.sessionId, {
      attemptId: h.attemptId,
      previousLine: h.openingLine,
      submittedLine: "-2x + 10 = 11",
    });

    const step = lastStep(h.db);
    assert.doesNotMatch(
      step.firstInvalidActionDescription!,
      /expanding the bracket did not give the same value/,
      "the bracket was expanded correctly — say what actually went missing",
    );
    assert.equal(step.firstInvalidActionCode, "OUTER_CONSTANT_DROPPED");
    assert.match(step.firstInvalidActionDescription!, /outside the bracket was dropped/);
  });
});
