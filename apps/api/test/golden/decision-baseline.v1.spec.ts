import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import type { LearningSession } from "@cogna/database";

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

describe("G30 — Empty profile cold start (baseline)", () => {
  const engine = new DecisionEngineService();

  it("returns BASELINE_ASSESSMENT with blueprint concept for slot 0", async () => {
    const decision = await engine.decide({
      session: mockSession({
        sessionMode: "BASELINE",
        baselineSlotIndex: 0,
        questionCount: 0,
        activeConceptId: null,
      }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
    });

    assert.equal(decision.uiAction, "SHOW_QUESTION");
    assert.equal(decision.learningIntent, "BASELINE_ASSESSMENT");
    assert.equal(decision.parameters.conceptId, "P1_INTEGER_ADD_SUB");
    assert.equal(decision.parameters.difficulty, 2);
  });
});

describe("G13 — No infinite targeting", () => {
  const engine = new DecisionEngineService();

  it("prefers REVIEW_PREREQUISITE when STILL_ACTIVE with weak prereq", async () => {
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 2,
      activeMisconceptionId: "SIGN_HANDLING",
      misconceptionConfidence: 0.7,
      remediationState: "STILL_ACTIVE",
      prerequisiteMastery: 0.3,
      hasPrereqQuestions: true,
    });

    assert.equal(decision.learningIntent, "REVIEW_PREREQUISITE");
    assert.notEqual(decision.learningIntent, "TARGET_MISCONCEPTION");
  });

  it("prefers DECREASE_DIFFICULTY when STILL_ACTIVE without prereq path", async () => {
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      activeMisconceptionId: "SIGN_HANDLING",
      misconceptionConfidence: 0.7,
      remediationState: "STILL_ACTIVE",
      prerequisiteMastery: 0.8,
      hasPrereqQuestions: false,
    });

    assert.equal(decision.learningIntent, "DECREASE_DIFFICULTY");
    assert.notEqual(decision.learningIntent, "TARGET_MISCONCEPTION");
  });
});
