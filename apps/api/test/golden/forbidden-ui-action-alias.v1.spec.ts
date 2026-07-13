import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import type { LearningDecision } from "@cogna/shared";
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

function assertCanonicalDecision(decision: LearningDecision) {
  assert.ok("uiAction" in decision);
  assert.ok("learningIntent" in decision);
  assert.equal((decision as LearningDecision & { action?: string }).action, undefined);
}

describe("G62 — Forbidden uiAction alias", () => {
  const engine = new DecisionEngineService();

  it("uses SHOW_QUESTION + DECREASE_DIFFICULTY instead of legacy EASIER_QUESTION alias", () => {
    const decision = engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 2,
    });

    assertCanonicalDecision(decision);
    assert.equal(decision.uiAction, "SHOW_QUESTION");
    assert.equal(decision.learningIntent, "DECREASE_DIFFICULTY");
    assert.notEqual((decision as { action?: string }).action, "EASIER_QUESTION");
    assert.notEqual((decision as { action?: string }).action, "HARDER_QUESTION");
  });

  it("never emits flat legacy action fields on any priority path", () => {
    const paths = [
      engine.decide({
        session: mockSession({ questionCount: 12 }),
        recentCorrectStreak: 0,
        recentIncorrectStreak: 0,
      }),
      engine.decide({
        session: mockSession(),
        recentCorrectStreak: 2,
        recentIncorrectStreak: 0,
      }),
      engine.decide({
        session: mockSession(),
        recentCorrectStreak: 0,
        recentIncorrectStreak: 0,
        remediationState: "EXPLANATION_REQUIRED",
        activeMisconceptionId: "SIGN_HANDLING",
      }),
    ];

    for (const decision of paths) {
      assertCanonicalDecision(decision);
      assert.ok(
        ["SHOW_QUESTION", "SHOW_EXPLANATION", "SHOW_HINT", "END_SESSION", "SUGGEST_BREAK"].includes(
          decision.uiAction,
        ),
      );
    }
  });
});
