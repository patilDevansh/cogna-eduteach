import { Injectable, Logger } from "@nestjs/common";
import {
  BASELINE_SLOT_COUNT,
  DECISION_RULES_V2,
  DECISION_RULES_V3,
  baselineConceptForSlot,
  type LearningDecision,
  type LearningIntent,
  type RemediationState,
} from "@cogna/shared";
import type {
  LearningSession,
  RevisionQueueItem,
} from "@cogna/database";
import {
  DEFAULT_BREAK_MINUTES,
  HARD_STOP_SESSION_MINUTES,
  computeFatigueRisk,
} from "../diagnostic-engine/diagnostic-formulas";
import { ExperimentsService } from "../../experiments/experiments.service";

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
  /** Override computed minutes (tests / clock injection). */
  sessionMinutes?: number;
  /** Explicit fatigue override; otherwise derived from signals. */
  fatigueRisk?: boolean;
  breakSuggestedThisSession?: boolean;
  idleSpikeCount?: number;
  averageTimeIncreasing50Pct?: boolean;
  /** Transfer-check gates (decision-rules-v2 §12.8). */
  masteryValue?: number;
  evidenceCount?: number;
  masteryThreshold?: number;
  minimumEvidence?: number;
  hasTransferCheckItem?: boolean;
  hasActiveMisconceptionHighConfidence?: boolean;
  /** Error recovery for explanation style preference. */
  errorRecoveryRate?: number | null;
  retentionEstimateId?: string;
  /** Confidence calibration → difficulty caution (personalization). */
  confidenceCalibration?:
    | "possibly_overconfident"
    | "possibly_underconfident"
    | "reasonably_calibrated"
    | "unknown";
  /** R14 — block TARGET_MISCONCEPTION when alternative explanation dominates. */
  alternativeExplanationDominant?: boolean;
  /** MVP 3.0 — experiment context. */
  experimentKey?: string;
  experimentArm?: string;
}

const SESSION_QUESTION_LIMIT = 12;
const EXPERIMENT_VARIANT = process.env.EXPERIMENT_VARIANT ?? "targeted";
const EXPERIMENTS_ENABLED =
  process.env.EXPERIMENTS_ENABLED === "true" ? true : false;

@Injectable()
export class DecisionEngineService {
  private readonly logger = new Logger(DecisionEngineService.name);

  constructor(private readonly experimentsService?: ExperimentsService) {}

  async decide(input: DecisionInput): Promise<LearningDecision> {
    // MVP 3.0: Check for experiment assignment if enabled
    let experimentKey: string | undefined;
    let experimentArm: string | undefined;

    if (EXPERIMENTS_ENABLED && this.experimentsService && !input.experimentKey) {
      // Try to resolve experiment assignment for linear equations
      const assignment = await this.experimentsService.resolveAssignment({
        studentId: input.session.studentId,
        experimentKey: "policy_score_linear_eq_2026q3",
      });

      if (assignment) {
        experimentKey = assignment.experimentKey;
        experimentArm = assignment.arm;
        this.logger.debug(
          `Student ${input.session.studentId} assigned to ${experimentArm}`,
        );
      }
    } else if (input.experimentKey && input.experimentArm) {
      experimentKey = input.experimentKey;
      experimentArm = input.experimentArm;
    }

    return this.decideInternal(input, experimentKey, experimentArm);
  }

  decideInternal(
    input: DecisionInput,
    experimentKey?: string,
    experimentArm?: string,
  ): LearningDecision {
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
      idleSpikeCount = 0,
      averageTimeIncreasing50Pct = false,
      errorRecoveryRate = null,
      retentionEstimateId,
    } = input;

    const sessionMinutes =
      input.sessionMinutes ??
      (Date.now() - session.startedAt.getTime()) / (1000 * 60);

    const breakSuggestedThisSession =
      input.breakSuggestedThisSession ??
      Boolean(
        (session as LearningSession & { breakSuggestedAt?: Date | null })
          .breakSuggestedAt,
      );

    // Helper to create decisions with experiment context
    const makeDecision = (
      uiAction: LearningDecision["uiAction"],
      learningIntent: LearningIntent,
      parameters: LearningDecision["parameters"],
      confidence: number,
      reasoning: string,
      options?: {
        fallbackGenerated?: boolean;
        explanationStyle?: "STEP_BY_STEP" | "HINT" | "ANALOGY";
        questionFormat?: "NUMERIC" | "MCQ" | "WORD_PROBLEM";
      },
    ): LearningDecision => {
      return this.decision(
        uiAction,
        learningIntent,
        parameters,
        confidence,
        reasoning,
        options,
        experimentKey,
        experimentArm,
      );
    };

    // 1. Safety / session end — always wins over soft break
    if (
      sessionMinutes >= HARD_STOP_SESSION_MINUTES ||
      session.questionCount >= SESSION_QUESTION_LIMIT
    ) {
      return makeDecision(
        "END_SESSION",
        session.sessionMode === "BASELINE" ? "BASELINE_ASSESSMENT" : "STANDARD_PRACTICE",
        {
          conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
          difficulty: session.activeDifficulty ?? 2,
        },
        0.9,
        sessionMinutes >= HARD_STOP_SESSION_MINUTES
          ? "Session time limit reached."
          : "Session question limit reached.",
      );
    }

    const fatigueRisk =
      input.fatigueRisk ??
      computeFatigueRisk({
        sessionMinutes,
        recentIncorrectStreak,
        averageTimeIncreasing50Pct,
        idleSpikeCount,
      });

    // 2. Fatigue break (soft) — never after hard stop
    if (
      fatigueRisk &&
      !breakSuggestedThisSession &&
      sessionMinutes < HARD_STOP_SESSION_MINUTES
    ) {
      return makeDecision(
        "SUGGEST_BREAK",
        "BREAK_FOR_FATIGUE",
        {
          conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
          difficulty: session.activeDifficulty ?? 2,
          breakMinutes: DEFAULT_BREAK_MINUTES,
        },
        0.75,
        "Fatigue risk detected; suggesting a short break.",
      );
    }

    // Baseline mode: fixed blueprint, no adaptive difficulty
    if (session.sessionMode === "BASELINE") {
      const conceptId = baselineConceptForSlot(session.baselineSlotIndex);
      return makeDecision(
        "SHOW_QUESTION",
        "BASELINE_ASSESSMENT",
        { conceptId, difficulty: 2, baselineSlotIndex: session.baselineSlotIndex },
        0.7,
        `Baseline slot ${session.baselineSlotIndex + 1}/${BASELINE_SLOT_COUNT}: ${conceptId}.`,
      );
    }

    const conceptId = session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION";
    let difficulty = session.activeDifficulty ?? 2;
    // Calibration-aware difficulty caution (README_PERSONALIZATION)
    if (input.confidenceCalibration === "possibly_overconfident") {
      difficulty = Math.max(1, difficulty - 1);
    }

    // 3. Post-explanation re-test
    if (lastWasExplanation || remediationState === "RETESTING") {
      return makeDecision(
        "SHOW_QUESTION",
        "RETEST_AFTER_EXPLANATION",
        { conceptId, difficulty, targetMisconception: activeMisconceptionId },
        0.85,
        "Re-test after explanation.",
      );
    }

    // 4. Explanation required — high recovery prefers shorter hint first
    if (remediationState === "EXPLANATION_REQUIRED") {
      if (errorRecoveryRate !== null && errorRecoveryRate >= 0.65) {
        return makeDecision(
          "SHOW_HINT",
          "TARGET_MISCONCEPTION",
          {
            conceptId,
            difficulty,
            targetMisconception: activeMisconceptionId,
            hintLevel: 1,
          },
          0.8,
          "Strong error recovery; shorter hint before full explanation.",
          { explanationStyle: "HINT" },
        );
      }
      return makeDecision(
        "SHOW_EXPLANATION",
        "TARGET_MISCONCEPTION",
        {
          conceptId,
          difficulty,
          targetMisconception: activeMisconceptionId,
        },
        0.8,
        errorRecoveryRate !== null && errorRecoveryRate < 0.35
          ? "Low error recovery; step-by-step explanation required."
          : "Targeted attempts failed; explanation required.",
        { explanationStyle: "STEP_BY_STEP" },
      );
    }

    // 5. Due revision / retention review
    if (dueRevision) {
      const isRetention =
        dueRevision.type === "RETENTION_REVIEW" ||
        dueRevision.type === "SPACED_REVIEW_RETENTION";
      return makeDecision(
        "SHOW_QUESTION",
        isRetention ? "RETENTION_REVIEW" : "EXECUTE_DUE_REVISION",
        {
          conceptId: dueRevision.conceptId,
          difficulty,
          revisionItemId: dueRevision.id,
          targetMisconception: dueRevision.targetMisconception ?? undefined,
          retentionEstimateId: isRetention ? retentionEstimateId : undefined,
        },
        0.75,
        isRetention
          ? `Retention review: ${dueRevision.reasoning}`
          : `Due revision: ${dueRevision.reasoning}`,
      );
    }

    // STILL_ACTIVE — no infinite targeting (G13)
    if (remediationState === "STILL_ACTIVE") {
      if (
        recentIncorrectStreak >= 2 &&
        (prerequisiteMastery ?? 1) < 0.5 &&
        hasPrereqQuestions
      ) {
        return makeDecision(
          "SHOW_QUESTION",
          "REVIEW_PREREQUISITE",
          { conceptId, difficulty: Math.max(1, difficulty - 1) },
          0.65,
          "Still active misconception; reviewing prerequisite.",
        );
      }
      return makeDecision(
        "SHOW_QUESTION",
        "DECREASE_DIFFICULTY",
        { conceptId, difficulty: Math.max(1, difficulty - 1) },
        0.65,
        "Still active misconception; decreasing difficulty.",
      );
    }

    // 6. Misconception targeting (weak evidence + R14 alt-explanation gates)
    if (
      remediationState === "TARGETING" ||
      (misconceptionConfidence >= 0.6 && activeMisconceptionId)
    ) {
      if (misconceptionConfidence < 0.5) {
        return makeDecision(
          "SHOW_QUESTION",
          "STANDARD_PRACTICE",
          { conceptId, difficulty },
          0.55,
          "Weak misconception evidence; standard practice.",
        );
      }
      if (input.alternativeExplanationDominant) {
        return makeDecision(
          "SHOW_QUESTION",
          "STANDARD_PRACTICE",
          { conceptId, difficulty },
          0.5,
          "Alternative explanation dominant; abstain from targeting.",
        );
      }
      return makeDecision(
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

    // 7. Prerequisite review
    if (
      recentIncorrectStreak >= 2 &&
      (prerequisiteMastery ?? 1) < 0.3 &&
      hasPrereqQuestions
    ) {
      return makeDecision(
        "SHOW_QUESTION",
        "REVIEW_PREREQUISITE",
        { conceptId, difficulty: Math.max(1, difficulty - 1) },
        0.6,
        "Repeated errors with weak prerequisite mastery.",
      );
    }

    // 8. Transfer check
    const masteryThreshold = input.masteryThreshold ?? 0.75;
    const minimumEvidence = input.minimumEvidence ?? 5;
    const masteryValue = input.masteryValue;
    const evidenceCount = input.evidenceCount ?? 0;
    const hasActiveHigh =
      input.hasActiveMisconceptionHighConfidence ??
      (misconceptionConfidence > 0.6 && Boolean(activeMisconceptionId));

    if (
      masteryValue !== undefined &&
      masteryValue >= masteryThreshold &&
      evidenceCount >= minimumEvidence &&
      !hasActiveHigh &&
      input.hasTransferCheckItem
    ) {
      return makeDecision(
        "SHOW_QUESTION",
        "TRANSFER_CHECK",
        {
          conceptId,
          difficulty,
          transferConceptId: conceptId,
        },
        0.71,
        "Mastery stable above threshold; no active misconception >0.6; transfer item available.",
        { questionFormat: "WORD_PROBLEM" },
      );
    }

    // 9. Difficulty adaptation (overconfident learners stay cautious on increase)
    if (recentCorrectStreak >= 2) {
      const nextDifficulty =
        input.confidenceCalibration === "possibly_overconfident"
          ? difficulty
          : Math.min(5, difficulty + 1);
      return makeDecision(
        "SHOW_QUESTION",
        nextDifficulty > difficulty ? "INCREASE_DIFFICULTY" : "STANDARD_PRACTICE",
        { conceptId, difficulty: nextDifficulty },
        0.7,
        input.confidenceCalibration === "possibly_overconfident"
          ? "Repeated success but overconfident calibration; hold difficulty."
          : "Repeated success; increase difficulty.",
      );
    }

    if (recentIncorrectStreak >= 2) {
      return makeDecision(
        "SHOW_QUESTION",
        "DECREASE_DIFFICULTY",
        { conceptId, difficulty: Math.max(1, difficulty - 1) },
        0.7,
        "Repeated errors; decrease difficulty.",
      );
    }

    // 10. Standard practice
    const experimentNote =
      EXPERIMENT_VARIANT === "random"
        ? " (A/B stub: random sequencing variant)"
        : "";

    return makeDecision(
      "SHOW_QUESTION",
      "STANDARD_PRACTICE",
      { conceptId, difficulty },
      0.6,
      `Continue practice at current level.${experimentNote}`,
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
    options?: {
      fallbackGenerated?: boolean;
      explanationStyle?: "STEP_BY_STEP" | "HINT" | "ANALOGY";
      questionFormat?: "NUMERIC" | "MCQ" | "WORD_PROBLEM";
    },
    experimentKey?: string,
    experimentArm?: string,
  ): LearningDecision {
    const contentStyle =
      options?.explanationStyle || options?.questionFormat
        ? {
            ...(options.explanationStyle
              ? { explanationStyle: options.explanationStyle }
              : {}),
            ...(options.questionFormat
              ? { questionFormat: options.questionFormat }
              : {}),
          }
        : undefined;

    const decisionVersion =
      experimentKey && experimentArm ? DECISION_RULES_V3 : DECISION_RULES_V2;

    const decision: LearningDecision = {
      uiAction,
      learningIntent,
      parameters: {
        ...parameters,
        ...(experimentKey ? { experimentId: experimentKey } : {}),
        ...(experimentArm ? { experimentArmId: experimentArm } : {}),
      },
      contentStyle,
      confidence,
      reasoning,
      decisionVersion,
      fallbackGenerated: options?.fallbackGenerated,
    };

    return decision;
  }
}
