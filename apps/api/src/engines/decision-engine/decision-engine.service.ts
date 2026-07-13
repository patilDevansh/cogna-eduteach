import { Injectable } from "@nestjs/common";
import {
  BASELINE_SLOT_COUNT,
  DECISION_RULES_V1,
  baselineConceptForSlot,
  type LearningDecision,
  type LearningIntent,
  type RemediationState,
} from "@cogna/shared";
import type {
  LearningSession,
  MisconceptionRemediationState,
  RevisionQueueItem,
} from "@cogna/database";

export interface DecisionInput {
  session: LearningSession;
  recentCorrectStreak: number;
  recentIncorrectStreak: number;
  activeMisconceptionId?: string;
  misconceptionConfidence?: number;
  remediationState?: RemediationState;
  dueRevision?: RevisionQueueItem;
  lastWasExplanation?: boolean;
  prerequisiteMastery?: number;
  hasPrereqQuestions?: boolean;
}

const SESSION_LIMIT_MINUTES = 15;
const SESSION_QUESTION_LIMIT = 12;

@Injectable()
export class DecisionEngineService {
  decide(input: DecisionInput): LearningDecision {
    const {
      session,
      recentCorrectStreak,
      recentIncorrectStreak,
      activeMisconceptionId,
      misconceptionConfidence = 0,
      remediationState,
      dueRevision,
      lastWasExplanation,
      prerequisiteMastery,
      hasPrereqQuestions,
    } = input;

    const sessionMinutes =
      (Date.now() - session.startedAt.getTime()) / (1000 * 60);

    // 1. Safety / session end
    if (
      sessionMinutes >= SESSION_LIMIT_MINUTES ||
      session.questionCount >= SESSION_QUESTION_LIMIT
    ) {
      return this.decision(
        "END_SESSION",
        session.sessionMode === "BASELINE" ? "BASELINE_ASSESSMENT" : "STANDARD_PRACTICE",
        {
          conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
          difficulty: session.activeDifficulty ?? 2,
        },
        0.9,
        sessionMinutes >= SESSION_LIMIT_MINUTES
          ? "Session time limit reached."
          : "Session question limit reached.",
      );
    }

    // Baseline mode: fixed blueprint, no adaptive difficulty
    if (session.sessionMode === "BASELINE") {
      const conceptId = baselineConceptForSlot(session.baselineSlotIndex);
      return this.decision(
        "SHOW_QUESTION",
        "BASELINE_ASSESSMENT",
        { conceptId, difficulty: 2, baselineSlotIndex: session.baselineSlotIndex },
        0.7,
        `Baseline slot ${session.baselineSlotIndex + 1}/${BASELINE_SLOT_COUNT}: ${conceptId}.`,
      );
    }

    const conceptId = session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION";
    const difficulty = session.activeDifficulty ?? 2;

    // 2. Post-explanation re-test
    if (lastWasExplanation || remediationState === "RETESTING") {
      return this.decision(
        "SHOW_QUESTION",
        "RETEST_AFTER_EXPLANATION",
        { conceptId, difficulty, targetMisconception: activeMisconceptionId },
        0.85,
        "Re-test after explanation.",
      );
    }

    // 3. Explanation required
    if (remediationState === "EXPLANATION_REQUIRED") {
      return this.decision(
        "SHOW_EXPLANATION",
        "TARGET_MISCONCEPTION",
        {
          conceptId,
          difficulty,
          targetMisconception: activeMisconceptionId,
        },
        0.8,
        "Targeted attempts failed; explanation required.",
        { explanationStyle: "STEP_BY_STEP" },
      );
    }

    // 4. Due revision
    if (dueRevision) {
      return this.decision(
        "SHOW_QUESTION",
        "EXECUTE_DUE_REVISION",
        {
          conceptId: dueRevision.conceptId,
          difficulty,
          revisionItemId: dueRevision.id,
          targetMisconception: dueRevision.targetMisconception ?? undefined,
        },
        0.75,
        `Due revision: ${dueRevision.reasoning}`,
      );
    }

    // STILL_ACTIVE — no infinite targeting (G13)
    if (remediationState === "STILL_ACTIVE") {
      if (
        recentIncorrectStreak >= 2 &&
        (prerequisiteMastery ?? 1) < 0.5 &&
        hasPrereqQuestions
      ) {
        return this.decision(
          "SHOW_QUESTION",
          "REVIEW_PREREQUISITE",
          { conceptId, difficulty: Math.max(1, difficulty - 1) },
          0.65,
          "Still active misconception; reviewing prerequisite.",
        );
      }
      return this.decision(
        "SHOW_QUESTION",
        "DECREASE_DIFFICULTY",
        { conceptId, difficulty: Math.max(1, difficulty - 1) },
        0.65,
        "Still active misconception; decreasing difficulty.",
      );
    }

    // 5. Misconception targeting (weak evidence gate)
    if (
      remediationState === "TARGETING" ||
      (misconceptionConfidence >= 0.6 && activeMisconceptionId)
    ) {
      if (misconceptionConfidence < 0.5) {
        return this.decision(
          "SHOW_QUESTION",
          "STANDARD_PRACTICE",
          { conceptId, difficulty },
          0.55,
          "Weak misconception evidence; standard practice.",
        );
      }
      return this.decision(
        "SHOW_QUESTION",
        "TARGET_MISCONCEPTION",
        {
          conceptId,
          difficulty: Math.max(1, difficulty - (recentIncorrectStreak >= 2 ? 1 : 0)),
          targetMisconception: activeMisconceptionId,
        },
        misconceptionConfidence,
        "Targeting suspected misconception.",
      );
    }

    // 6. Prerequisite review
    if (
      recentIncorrectStreak >= 2 &&
      (prerequisiteMastery ?? 1) < 0.3 &&
      hasPrereqQuestions
    ) {
      return this.decision(
        "SHOW_QUESTION",
        "REVIEW_PREREQUISITE",
        { conceptId, difficulty: Math.max(1, difficulty - 1) },
        0.6,
        "Repeated errors with weak prerequisite mastery.",
      );
    }

    // 7. Difficulty adaptation
    if (recentCorrectStreak >= 2) {
      return this.decision(
        "SHOW_QUESTION",
        "INCREASE_DIFFICULTY",
        { conceptId, difficulty: Math.min(5, difficulty + 1) },
        0.7,
        "Repeated success; increase difficulty.",
      );
    }

    if (recentIncorrectStreak >= 2) {
      return this.decision(
        "SHOW_QUESTION",
        "DECREASE_DIFFICULTY",
        { conceptId, difficulty: Math.max(1, difficulty - 1) },
        0.7,
        "Repeated errors; decrease difficulty.",
      );
    }

    // 8. Standard practice
    return this.decision(
      "SHOW_QUESTION",
      "STANDARD_PRACTICE",
      { conceptId, difficulty },
      0.6,
      "Continue practice at current level.",
    );
  }

  fallbackDecision(session: LearningSession): LearningDecision {
    return this.decision(
      "SHOW_QUESTION",
      "STANDARD_PRACTICE",
      {
        conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
        difficulty: session.activeDifficulty ?? 2,
      },
      0.4,
      "Safe fallback decision.",
      { fallbackGenerated: true },
    );
  }

  private decision(
    uiAction: LearningDecision["uiAction"],
    learningIntent: LearningIntent,
    parameters: LearningDecision["parameters"],
    confidence: number,
    reasoning: string,
    options?: { fallbackGenerated?: boolean; explanationStyle?: "STEP_BY_STEP" },
  ): LearningDecision {
    return {
      uiAction,
      learningIntent,
      parameters,
      contentStyle: options?.explanationStyle
        ? { explanationStyle: options.explanationStyle }
        : undefined,
      confidence,
      reasoning,
      decisionVersion: DECISION_RULES_V1,
      fallbackGenerated: options?.fallbackGenerated,
    };
  }
}
