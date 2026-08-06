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
  type MockOrchestratorBehaviour,
} from "./helpers/diagnostic-v2-fakes";

/**
 * Phase B1 — wrong-answer matrix for the fraction-clear main item
 * `(x + 1)/2 = (x - 1)/3 + 1`.
 */

const STUDENT_ID = "student-1";
const FRAC_CLEAR_MAIN_LINE = "(x + 1)/2 = (x - 1)/3 + 1";

const ENTRY_WALK: Array<[string, string]> = [
  ["x/2 + 3 = 7", "x/2 = 4"],
  ["x/2 = 4", "x = 8"],
];

type StepResponse = Awaited<ReturnType<DiagnosticV2SessionService["submitStep"]>>;

function submitted(response: StepResponse) {
  assert.equal(response.outcome, "SUBMITTED");
  return response as Extract<StepResponse, { outcome: "SUBMITTED" }>;
}

interface Harness {
  service: DiagnosticV2SessionService;
  db: FakeDb;
  sessionId: string;
  attemptId: string;
  openingLine: string;
}

async function atFracClearMain(
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

  const start = await service.startSession(STUDENT_ID, "FRACTION_LINEAR");
  let attemptId = start.attemptId;
  let itemKey = start.itemKey;
  for (const [previousLine, submittedLine] of ENTRY_WALK) {
    const response = await service.submitStep(start.sessionId, {
      attemptId,
      previousLine,
      submittedLine,
    });
    if (response.nextAttempt) {
      attemptId = response.nextAttempt.attemptId;
      itemKey = response.nextAttempt.itemKey;
    }
  }
  assert.equal(itemKey, "FRAC_CLEAR_MAIN", "entry walk must land on FRAC_CLEAR_MAIN");

  return {
    service,
    db,
    sessionId: start.sessionId,
    attemptId,
    openingLine: FRAC_CLEAR_MAIN_LINE,
  };
}

interface SkillRow {
  status: MicroSkillStatus;
  evidenceCount: number;
  independentSuccessCount: number;
  independentFailureCount: number;
  assistedSuccessCount: number;
}

const NEVER_TESTED: SkillRow = {
  status: "UNKNOWN",
  evidenceCount: 0,
  independentSuccessCount: 0,
  independentFailureCount: 0,
  assistedSuccessCount: 0,
};

type SkillSnapshot = Record<string, SkillRow>;

function snapshotAllSkills(db: FakeDb): SkillSnapshot {
  const out: SkillSnapshot = {};
  for (const id of MICRO_SKILL_IDS) {
    const row = db.states.find((s) => s.microSkillId === id && s.studentId === STUDENT_ID);
    out[id] = row
      ? {
          status: row.status as MicroSkillStatus,
          evidenceCount: row.evidenceCount as number,
          independentSuccessCount: row.independentSuccessCount as number,
          independentFailureCount: row.independentFailureCount as number,
          assistedSuccessCount: row.assistedSuccessCount as number,
        }
      : { ...NEVER_TESTED };
  }
  return out;
}

function assertOnlySkillChanged(
  before: SkillSnapshot,
  after: SkillSnapshot,
  implicated: string[],
): void {
  const allowed = new Set(implicated);
  for (const id of MICRO_SKILL_IDS) {
    if (allowed.has(id)) continue;
    assert.deepEqual(
      after[id],
      before[id],
      `skill ${id} must be unchanged (evidence containment)`,
    );
  }
}

function lastStep(db: FakeDb) {
  const row = db.steps[db.steps.length - 1]!;
  return {
    validity: row.validity as string,
    firstInvalidActionCode: (row.firstInvalidActionCode as string | null) ?? null,
    primaryMicroSkillId: (row.primaryMicroSkillId as string | null) ?? null,
    attemptedTransformation: row.attemptedTransformation as string,
    contextModifierIds: row.contextModifierIds as string[],
  };
}

describe("fraction wrong-answer matrix — clear-fractions codes", () => {
  it("correct clear → VALID, LIN_CLEAR_FRACTIONS evidence, HAS_FRACTIONS tag", async () => {
    const h = await atFracClearMain();
    const before = snapshotAllSkills(h.db);
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "3(x + 1) = 2(x - 1) + 6",
      }),
    );
    assert.equal(response.validity, "VALID");
    assert.equal(response.attemptedTransformation, "MULTIPLY_BOTH_SIDES");
    const step = lastStep(h.db);
    assert.equal(step.primaryMicroSkillId, "LIN_CLEAR_FRACTIONS");
    assert.ok(step.contextModifierIds.includes("HAS_FRACTIONS"));
    const after = snapshotAllSkills(h.db);
    assert.ok(after.LIN_CLEAR_FRACTIONS!.independentSuccessCount >= 1);
    assertOnlySkillChanged(before, after, ["LIN_CLEAR_FRACTIONS"]);
  });

  it("swapped LCD → WRONG_COMMON_MULTIPLE on LIN_CLEAR_FRACTIONS only", async () => {
    const h = await atFracClearMain();
    const before = snapshotAllSkills(h.db);
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "2(x + 1) = 3(x - 1) + 6",
      }),
    );
    assert.equal(response.validity, "INVALID");
    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "WRONG_COMMON_MULTIPLE");
    assert.equal(step.primaryMicroSkillId, "LIN_CLEAR_FRACTIONS");
    const after = snapshotAllSkills(h.db);
    assert.equal(after.LIN_CLEAR_FRACTIONS!.independentFailureCount, 1);
    assertOnlySkillChanged(before, after, ["LIN_CLEAR_FRACTIONS"]);
    assert.deepEqual(after.LIN_DISTRIBUTE_NEG, before.LIN_DISTRIBUTE_NEG);
    assert.deepEqual(after.FND_SIGN_MUL_DIV, before.FND_SIGN_MUL_DIV);
  });

  it("dropped term → DROPPED_TERM_WHEN_CLEARING, containment holds", async () => {
    const h = await atFracClearMain();
    const before = snapshotAllSkills(h.db);
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "3(x + 1) = 2(x - 1)",
      }),
    );
    assert.equal(response.validity, "INVALID");
    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "DROPPED_TERM_WHEN_CLEARING");
    assert.equal(step.primaryMicroSkillId, "LIN_CLEAR_FRACTIONS");
    assertOnlySkillChanged(before, snapshotAllSkills(h.db), ["LIN_CLEAR_FRACTIONS"]);
  });

  it("sign flip → SIGN_ERROR_AFTER_CLEARING, containment holds", async () => {
    const h = await atFracClearMain();
    const before = snapshotAllSkills(h.db);
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: h.openingLine,
        submittedLine: "-3(x + 1) = 2(x - 1) + 6",
      }),
    );
    assert.equal(response.validity, "INVALID");
    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "SIGN_ERROR_AFTER_CLEARING");
    assert.equal(step.primaryMicroSkillId, "LIN_CLEAR_FRACTIONS");
    assertOnlySkillChanged(before, snapshotAllSkills(h.db), ["LIN_CLEAR_FRACTIONS"]);
  });
});
