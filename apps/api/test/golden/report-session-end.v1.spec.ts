import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import type { LearningSession, RevisionQueueItem } from "@cogna/database";

function mockSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: "sess_test",
    studentId: "dev_student_001",
    sessionMode: "ADAPTIVE_PRACTICE",
    status: "ACTIVE",
    startedAt: new Date(),
    endedAt: null,
    questionCount: 3,
    baselineSlotIndex: 0,
    activeConceptId: "C2_ONE_STEP_SUBTRACTION",
    activeDifficulty: 2,
    ...overrides,
  } as LearningSession;
}

function mockDueRevision(): RevisionQueueItem {
  return {
    id: "rev_due_1",
    studentId: "dev_student_001",
    conceptId: "C2_ONE_STEP_SUBTRACTION",
    type: "REINFORCEMENT",
    targetMisconception: null,
    priority: 0.9,
    dueAt: new Date(Date.now() - 60_000),
    questionCount: 3,
    status: "PENDING",
    reasoning: "Due revision item",
    confidence: 0.8,
    recommendationVersion: "recommendation-rules-v1",
    dedupeKey: "REINFORCEMENT:C2_ONE_STEP_SUBTRACTION:none",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as RevisionQueueItem;
}

describe("G40 — Due revision priority", () => {
  const engine = new DecisionEngineService();

  it("prefers EXECUTE_DUE_REVISION over TARGET_MISCONCEPTION when item is due", () => {
    const decision = engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 1,
      activeMisconceptionId: "SIGN_HANDLING",
      misconceptionConfidence: 0.7,
      remediationState: "TARGETING",
      dueRevision: mockDueRevision(),
    });

    assert.equal(decision.uiAction, "SHOW_QUESTION");
    assert.equal(decision.learningIntent, "EXECUTE_DUE_REVISION");
    assert.equal(decision.parameters.revisionItemId, "rev_due_1");
    assert.notEqual(decision.learningIntent, "TARGET_MISCONCEPTION");
  });
});

describe("G41 — Session timeout", () => {
  const engine = new DecisionEngineService();

  it("returns END_SESSION at question limit", () => {
    const decision = engine.decide({
      session: mockSession({ questionCount: 12 }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
    });

    assert.equal(decision.uiAction, "END_SESSION");
  });

  it("returns END_SESSION after 15 minutes", () => {
    const decision = engine.decide({
      session: mockSession({
        startedAt: new Date(Date.now() - 16 * 60 * 1000),
      }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
    });

    assert.equal(decision.uiAction, "END_SESSION");
  });
});

describe("G42 — Report not on hot path", () => {
  it("LearningLoopService does not invoke ReportGeneratorService", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, "../../src/learning-loop/learning-loop.service.ts"),
      "utf8",
    );

    assert.ok(!source.includes("ReportGeneratorService"));
    assert.ok(!source.includes("reportGenerator"));
    assert.ok(!source.includes("generateSessionSummary"));
  });
});
