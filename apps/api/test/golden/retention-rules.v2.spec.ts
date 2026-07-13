import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeRetentionEstimate,
  hasSufficientRetentionEvidence,
  isHighPriorityRetention,
  isRetentionReviewEligible,
} from "../../src/engines/diagnostic-engine/diagnostic-formulas";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import { DECISION_RULES_V2 } from "@cogna/shared";
import type { LearningSession, RevisionQueueItem } from "@cogna/database";

function mockSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: "sess_r_retention",
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

describe("R01 — Retention due (exact formula)", () => {
  it("computes retentionEstimate = 0.42 exactly", () => {
    const retentionEstimate = computeRetentionEstimate({
      mastery: 0.7,
      daysSinceSuccess: 7,
      completedRevisionsLast14Days: 0,
    });

    assert.equal(retentionEstimate, 0.42);
    assert.equal(isRetentionReviewEligible(retentionEstimate), true);
    assert.equal(isHighPriorityRetention(retentionEstimate), false);
  });

  it("emits SHOW_QUESTION + RETENTION_REVIEW when retention item is due", async () => {
    const engine = new DecisionEngineService();
    const dueRevision = {
      id: "rev_ret_1",
      studentId: "dev_student_001",
      conceptId: "C2_ONE_STEP_SUBTRACTION",
      type: "RETENTION_REVIEW",
      targetMisconception: null,
      priority: 0.9,
      dueAt: new Date(Date.now() - 60_000),
      questionCount: 2,
      status: "PENDING",
      reasoning: "retentionEstimate=0.42 (<0.55)",
      confidence: 0.78,
      recommendationVersion: "recommendation-rules-v2",
      dedupeKey: "RETENTION_REVIEW:C2_ONE_STEP_SUBTRACTION",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as RevisionQueueItem;

    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      dueRevision,
      retentionEstimateId: "ret_r01",
      fatigueRisk: false,
    });

    assert.equal(decision.uiAction, "SHOW_QUESTION");
    assert.equal(decision.learningIntent, "RETENTION_REVIEW");
    assert.equal(decision.parameters.conceptId, "C2_ONE_STEP_SUBTRACTION");
    assert.equal(decision.decisionVersion, DECISION_RULES_V2);
  });
});

describe("R02 — Weak retention evidence abstains", () => {
  it("abstains when only 1 independent attempt", () => {
    assert.equal(
      hasSufficientRetentionEvidence({
        independentAttemptCount: 1,
        independentCorrectCount: 1,
      }),
      false,
    );
  });

  it("must NOT emit RETENTION_REVIEW from retention factor alone without due item", async () => {
    const engine = new DecisionEngineService();
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      fatigueRisk: false,
    });

    assert.notEqual(decision.learningIntent, "RETENTION_REVIEW");
    assert.equal(decision.learningIntent, "STANDARD_PRACTICE");
  });
});

describe("R03 — High-priority retention band", () => {
  it("computes retentionEstimate = 0.15 exactly and retentionRisk = 0.85", () => {
    const retentionEstimate = computeRetentionEstimate({
      mastery: 0.55,
      daysSinceSuccess: 10,
      completedRevisionsLast14Days: 0,
    });

    assert.equal(retentionEstimate, 0.15);
    assert.equal(isHighPriorityRetention(retentionEstimate), true);
    assert.equal(1 - retentionEstimate, 0.85);
  });
});
