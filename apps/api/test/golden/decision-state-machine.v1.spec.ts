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

describe("G10 — Targeting then explanation", () => {
  const engine = new DecisionEngineService();

  it("returns SHOW_EXPLANATION when remediation state is EXPLANATION_REQUIRED", async () => {
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 2,
      activeMisconceptionId: "SIGN_HANDLING",
      misconceptionConfidence: 0.65,
      remediationState: "EXPLANATION_REQUIRED",
    });

    assert.equal(decision.uiAction, "SHOW_EXPLANATION");
    assert.equal(decision.learningIntent, "TARGET_MISCONCEPTION");
    assert.equal(decision.parameters.targetMisconception, "SIGN_HANDLING");
  });
});

describe("G11 — Explanation then successful re-test", () => {
  const engine = new DecisionEngineService();

  it("returns RETEST_AFTER_EXPLANATION when remediation state is RETESTING", async () => {
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      activeMisconceptionId: "SIGN_HANDLING",
      remediationState: "RETESTING",
    });

    assert.equal(decision.uiAction, "SHOW_QUESTION");
    assert.equal(decision.learningIntent, "RETEST_AFTER_EXPLANATION");
    assert.equal(decision.parameters.targetMisconception, "SIGN_HANDLING");
    assert.ok(decision.confidence > 0);
  });

  it("prefers RETESTING over EXPLANATION_REQUIRED when both signals present", async () => {
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      activeMisconceptionId: "SIGN_HANDLING",
      remediationState: "RETESTING",
      lastWasExplanation: true,
    });

    assert.equal(decision.learningIntent, "RETEST_AFTER_EXPLANATION");
  });
});
