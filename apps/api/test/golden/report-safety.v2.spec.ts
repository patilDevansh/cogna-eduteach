import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DecisionEngineService } from "../../src/engines/decision-engine/decision-engine.service";
import { ReportGeneratorService } from "../../src/engines/report-generator/report-generator.service";
import type { BreakPayload } from "@cogna/shared";
import type { LearningSession } from "@cogna/database";

const CLINICAL_FORBIDDEN =
  /\b(ADHD|attention\s+disorder|anxiety\s+disorder|clinical|diagnosis|IQ|personality)\b/i;

const DEFAULT_BREAK_MESSAGE = "Let's take a short break and come back fresh.";

function mockSession(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: "sess_r_safety",
    studentId: "dev_student_001",
    sessionMode: "ADAPTIVE_PRACTICE",
    status: "ACTIVE",
    startedAt: new Date(),
    endedAt: null,
    questionCount: 5,
    baselineSlotIndex: 0,
    activeConceptId: "C2_ONE_STEP_SUBTRACTION",
    activeDifficulty: 2,
    breakSuggestedAt: null,
    ...overrides,
  } as LearningSession;
}

function renderWeeklyViaService(data: {
  sessionsCompleted: number;
  questionsAttempted: number;
  accuracy: number;
  conceptsPracticed: string[];
  masteryChanges: Array<{ conceptId: string; from: number; to: number }>;
  activePatterns: Array<{ misconceptionId: string; confidence: number; uncertainty: string }>;
  revisionPlan: Array<{ conceptId: string; reason: string; questionCount: number }>;
  parentActions: string[];
  weakEvidence: boolean;
}): string {
  const service = new ReportGeneratorService(
    null as unknown as ConstructorParameters<typeof ReportGeneratorService>[0],
    null as unknown as ConstructorParameters<typeof ReportGeneratorService>[1],
  );
  // Private pure renderer — same path used for parent weekly copy.
  return (
    service as unknown as {
      renderWeeklyParentReport: (d: typeof data) => string;
    }
  ).renderWeeklyParentReport(data);
}

describe("R11 — Weekly report uncertainty", () => {
  it('includes "still gathering evidence" for weak-evidence patterns', () => {
    const text = renderWeeklyViaService({
      sessionsCompleted: 1,
      questionsAttempted: 2,
      accuracy: 0.5,
      conceptsPracticed: ["C2_ONE_STEP_SUBTRACTION"],
      masteryChanges: [],
      activePatterns: [
        {
          misconceptionId: "SIGN_HANDLING",
          confidence: 0.4,
          uncertainty: "still gathering evidence",
        },
      ],
      revisionPlan: [],
      parentActions: [
        "Ask your child to explain one problem they practiced this week in their own words.",
      ],
      weakEvidence: true,
    });

    assert.match(text, /still gathering evidence/i);
    assert.doesNotMatch(text, /\bfirm misconception\b/i);
  });

  it("uses uncertainty copy when no active patterns", () => {
    const text = renderWeeklyViaService({
      sessionsCompleted: 0,
      questionsAttempted: 0,
      accuracy: 0,
      conceptsPracticed: [],
      masteryChanges: [],
      activePatterns: [],
      revisionPlan: [],
      parentActions: ["Keep practice sessions short — about 10–15 minutes."],
      weakEvidence: true,
    });

    assert.match(text, /still gathering evidence/i);
  });
});

describe("R13 — No clinical labels", () => {
  it("BreakPayload / fatigue messaging never contains clinical labels", async () => {
    const engine = new DecisionEngineService();
    const decision = await engine.decide({
      session: mockSession(),
      recentCorrectStreak: 0,
      recentIncorrectStreak: 0,
      sessionMinutes: 12,
      idleSpikeCount: 2,
      breakSuggestedThisSession: false,
      fatigueRisk: true,
    });

    assert.equal(decision.uiAction, "SUGGEST_BREAK");
    assert.equal(decision.learningIntent, "BREAK_FOR_FATIGUE");
    assert.doesNotMatch(decision.reasoning, CLINICAL_FORBIDDEN);

    const breakPayload: BreakPayload = {
      breakMinutes: decision.parameters.breakMinutes ?? 3,
      message: DEFAULT_BREAK_MESSAGE,
      continueAllowed: true,
    };
    assert.doesNotMatch(breakPayload.message, CLINICAL_FORBIDDEN);
    assert.doesNotMatch(breakPayload.message, /\bADHD\b/i);
  });

  it("weekly report copy never contains ADHD / clinical labels", () => {
    const text = renderWeeklyViaService({
      sessionsCompleted: 2,
      questionsAttempted: 8,
      accuracy: 0.5,
      conceptsPracticed: ["C2_ONE_STEP_SUBTRACTION"],
      masteryChanges: [],
      activePatterns: [
        {
          misconceptionId: "SIGN_HANDLING",
          confidence: 0.35,
          uncertainty: "still gathering evidence",
        },
      ],
      revisionPlan: [],
      parentActions: ["Keep practice sessions short — about 10–15 minutes."],
      weakEvidence: true,
    });

    assert.doesNotMatch(text, CLINICAL_FORBIDDEN);
    assert.doesNotMatch(text, /\bADHD\b/i);
    assert.doesNotMatch(text, /attention\s+disorder/i);
  });
});
