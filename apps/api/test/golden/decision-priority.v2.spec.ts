import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import { DECISION_RULES_V2, LEARNING_INTENTS } from "@cogna/shared";
import type { LearningSession } from "@cogna/database";

function mockSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: "sess_r_priority",
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

describe("R07 — Fatigue break before hard stop", () => {
  it("emits SUGGEST_BREAK + BREAK_FOR_FATIGUE at 12 min with idle spikes", async () => {
    const engine = new DecisionEngineService();
    const decision = await engine.decide({
      session: mockSession({ questionCount: 5 }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      sessionMinutes: 12,
      idleSpikeCount: 2,
      breakSuggestedThisSession: false,
    });

    assert.equal(decision.uiAction, "SUGGEST_BREAK");
    assert.equal(decision.learningIntent, "BREAK_FOR_FATIGUE");
    assert.equal(decision.parameters.breakMinutes, 3);
    assert.equal(decision.decisionVersion, DECISION_RULES_V2);
  });

  it("does not re-fire break when already suggested this session", async () => {
    const engine = new DecisionEngineService();
    const decision = await engine.decide({
      session: mockSession({
        questionCount: 5,
        breakSuggestedAt: new Date(),
      }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      sessionMinutes: 12,
      idleSpikeCount: 2,
      breakSuggestedThisSession: true,
      fatigueRisk: true,
    });

    assert.notEqual(decision.uiAction, "SUGGEST_BREAK");
    assert.notEqual(decision.learningIntent, "BREAK_FOR_FATIGUE");
  });
});

describe("R08 — END_SESSION beats SUGGEST_BREAK", () => {
  it("emits END_SESSION only at 15 min even with fatigueRisk", async () => {
    const engine = new DecisionEngineService();
    const decision = await engine.decide({
      session: mockSession({ questionCount: 5 }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      sessionMinutes: 15,
      fatigueRisk: true,
      idleSpikeCount: 2,
      breakSuggestedThisSession: false,
    });

    assert.equal(decision.uiAction, "END_SESSION");
    assert.notEqual(decision.uiAction, "SUGGEST_BREAK");
    assert.notEqual(decision.learningIntent, "BREAK_FOR_FATIGUE");
  });
});

describe("R15 — New intent enum migration guard", () => {
  it("includes RETENTION_REVIEW | TRANSFER_CHECK | BREAK_FOR_FATIGUE", () => {
    assert.ok(LEARNING_INTENTS.includes("RETENTION_REVIEW"));
    assert.ok(LEARNING_INTENTS.includes("TRANSFER_CHECK"));
    assert.ok(LEARNING_INTENTS.includes("BREAK_FOR_FATIGUE"));
  });
});

describe("R19 — Transfer check decision", () => {
  it("emits SHOW_QUESTION + TRANSFER_CHECK when gates pass", async () => {
    const engine = new DecisionEngineService();
    const decision = await engine.decide({
      session: mockSession({
        activeConceptId: "C5_TWO_STEP_EQUATIONS",
      }),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      fatigueRisk: false,
      masteryValue: 0.78,
      evidenceCount: 5,
      masteryThreshold: 0.75,
      minimumEvidence: 5,
      hasTransferCheckItem: true,
      hasActiveMisconceptionHighConfidence: false,
    });

    assert.equal(decision.uiAction, "SHOW_QUESTION");
    assert.equal(decision.learningIntent, "TRANSFER_CHECK");
    assert.equal(decision.contentStyle?.questionFormat, "WORD_PROBLEM");
    assert.equal(decision.decisionVersion, DECISION_RULES_V2);
  });
});
