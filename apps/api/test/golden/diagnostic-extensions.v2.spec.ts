import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeErrorRecoveryRate,
  computeLearningVelocity,
  isExplanationEffective,
  preferStepByStepExplanation,
} from "../../src/engines/diagnostic-engine/diagnostic-formulas";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import { DECISION_RULES_V2 } from "@cogna/shared";
import type { LearningSession } from "@cogna/database";

function mockSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: "sess_r_diag",
    studentId: "dev_student_001",
    sessionMode: "ADAPTIVE_PRACTICE",
    status: "ACTIVE",
    startedAt: new Date(),
    endedAt: null,
    questionCount: 3,
    baselineSlotIndex: 0,
    activeConceptId: "C2_ONE_STEP_SUBTRACTION",
    activeDifficulty: 2,
    breakSuggestedAt: null,
    ...overrides,
  } as LearningSession;
}

describe("R04 — Learning velocity improving", () => {
  it("computes velocity = 0.03 exactly → improving", () => {
    const { velocity, interpretation } = computeLearningVelocity({
      masterySevenDaysAgo: 0.5,
      masteryNow: 0.62,
      eligibleAttempts: 4,
    });

    assert.equal(velocity, 0.03);
    assert.equal(interpretation, "improving");
  });
});

describe("R05 — Error recovery low → prefer STEP_BY_STEP", () => {
  it("computes errorRecoveryRate = 0.25 exactly", () => {
    const rate = computeErrorRecoveryRate({
      correctAfterFeedbackAttempts: 1,
      feedbackOpportunities: 4,
    });
    assert.equal(rate, 0.25);
    assert.equal(preferStepByStepExplanation(rate, true), true);
  });

  it("emits SHOW_EXPLANATION + TARGET_MISCONCEPTION + STEP_BY_STEP", async () => {
    const engine = new DecisionEngineService();
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 2,
      activeMisconceptionId: "SIGN_HANDLING",
      misconceptionConfidence: 0.65,
      remediationState: "EXPLANATION_REQUIRED",
      errorRecoveryRate: 0.25,
      fatigueRisk: false,
    });

    assert.equal(decision.uiAction, "SHOW_EXPLANATION");
    assert.equal(decision.learningIntent, "TARGET_MISCONCEPTION");
    assert.equal(decision.contentStyle?.explanationStyle, "STEP_BY_STEP");
    assert.equal(decision.decisionVersion, DECISION_RULES_V2);
  });
});

describe("R06 — Explanation effective", () => {
  it("marks explanation_outcomes.effective = true on successful independent retest", () => {
    const effective = isExplanationEffective({
      explanationViewed: true,
      nextAttemptCorrect: true,
      highestHintLevel: 1,
    });
    assert.equal(effective, true);
  });

  it("is not effective when retest uses high hints", () => {
    assert.equal(
      isExplanationEffective({
        explanationViewed: true,
        nextAttemptCorrect: true,
        highestHintLevel: 3,
      }),
      false,
    );
  });
});
