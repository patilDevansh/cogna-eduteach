/**
 * Phase B3 — wrong-answer matrix: first-invalid codes + evidence containment.
 */
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
} from "./helpers/diagnostic-v2-fakes";

const STUDENT_ID = "student-1";

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
}

async function atFacMonicMain(): Promise<Harness> {
  const { prisma, db } = createFakePrisma([STUDENT_ID]);
  const selector = mockOrchestrator({ generate: false });
  const interpreter = mockOrchestrator({ generate: false });
  const grader = mockOrchestrator({ generate: false });
  const service = new DiagnosticV2SessionService(
    prisma,
    makeSelectorService(selector.service),
    new DiagnosticV2AiInterpreterService(interpreter.service),
    new DiagnosticV2AiGraderService(grader.service),
  );
  const start = await service.startSession(STUDENT_ID, "FACTOR_MONIC_TRINOMIAL");
  const entry = await service.submitStep(start.sessionId, {
    attemptId: start.attemptId,
    previousLine: "(x + 2)(x + 3)",
    submittedLine: "x^2 + 5x + 6",
  });
  const done = submitted(entry);
  assert.ok(done.nextAttempt, "expected to reach FAC_MONIC_MAIN");
  assert.equal(done.nextAttempt.itemKey, "FAC_MONIC_MAIN");
  return {
    service,
    db,
    sessionId: start.sessionId,
    attemptId: done.nextAttempt.attemptId,
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
  };
}

describe("B3 factor wrong-answer matrix", () => {
  it("WRONG_FACTOR_PAIR_SUM implicates FAC_MONIC_TRINOMIAL only", async () => {
    const h = await atFacMonicMain();
    const before = snapshotAllSkills(h.db);
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: "x^2 + 5x + 6",
        submittedLine: "(x + 1)(x + 6)",
      }),
    );
    assert.equal(response.validity, "INVALID");
    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "WRONG_FACTOR_PAIR_SUM");
    assert.equal(step.primaryMicroSkillId, "FAC_MONIC_TRINOMIAL");
    const after = snapshotAllSkills(h.db);
    assertOnlySkillChanged(before, after, ["FAC_MONIC_TRINOMIAL"]);
  });

  it("SIGN_ERROR_MIDDLE_SPLIT on flipped constants", async () => {
    const h = await atFacMonicMain();
    const before = snapshotAllSkills(h.db);
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: "x^2 + 5x + 6",
        submittedLine: "(x - 2)(x - 3)",
      }),
    );
    assert.equal(response.validity, "INVALID");
    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "SIGN_ERROR_MIDDLE_SPLIT");
    const after = snapshotAllSkills(h.db);
    assertOnlySkillChanged(before, after, ["FAC_MONIC_TRINOMIAL"]);
  });

  it("INCOMPLETE_FACTORISATION does not invent a pair code", async () => {
    const h = await atFacMonicMain();
    const response = submitted(
      await h.service.submitStep(h.sessionId, {
        attemptId: h.attemptId,
        previousLine: "x^2 + 5x + 6",
        submittedLine: "1(x^2 + 5x + 6)",
      }),
    );
    assert.equal(response.validity, "INVALID");
    const step = lastStep(h.db);
    assert.equal(step.firstInvalidActionCode, "INCOMPLETE_FACTORISATION");
  });
});
