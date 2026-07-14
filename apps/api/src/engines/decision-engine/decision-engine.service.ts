import { Injectable, Logger } from "@nestjs/common";
import {
  BASELINE_SLOT_COUNT,
  DECISION_RULES_V2,
  DECISION_RULES_V3,
  DECISION_RULES_V4,
  baselineConceptForSlot,
  type LearningDecision,
  type LearningIntent,
  type RemediationState,
  type CandidateAction,
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
import { CandidateScorerService } from "../candidate-scorer/candidate-scorer.service";

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
  retentionEstimate?: number;
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
  /** MVP 3.0 — shadow mode: score but don't apply. */
  shadow?: boolean;
  /** MVP 3.0 — seen difficulties for exploration term. */
  seenDifficulties?: number[];
  /** MVP 3.0 — explanation effectiveness for scoring. */
  explanationEffectiveness?: number;
  /** MVP 4.0 — curriculum plan context. */
  curriculumPlanId?: string;
  activePlanWeekIndex?: number;
  primaryUnitId?: string;
  /** MVP 4.0 — unit bridge concepts that block unlock. */
  unitBridgeConcepts?: string[];
  /** MVP 4.0 — horizon focus concepts for current week. */
  horizonFocusConcepts?: string[];
  /** MVP 4.0 — enable decision-rules-v4. */
  useDecisionRulesV4?: boolean;
}

const SESSION_QUESTION_LIMIT = 12;
const EXPERIMENT_VARIANT = process.env.EXPERIMENT_VARIANT ?? "targeted";
const EXPERIMENTS_ENABLED =
  process.env.EXPERIMENTS_ENABLED === "true" ? true : false;

@Injectable()
export class DecisionEngineService {
  private readonly logger = new Logger(DecisionEngineService.name);

  constructor(
    private readonly experimentsService?: ExperimentsService,
    private readonly candidateScorer?: CandidateScorerService,
  ) {}

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

    // Check if we should use candidate scoring
    const useScoring =
      EXPERIMENTS_ENABLED &&
      experimentArm === "scored_v1" &&
      this.candidateScorer &&
      !input.shadow;

    if (useScoring) {
      return this.decideWithScoring(input, experimentKey, experimentArm);
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
        input.useDecisionRulesV4,
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
          unitId: input.primaryUnitId,
        },
        0.75,
        isRetention
          ? `Retention review: ${dueRevision.reasoning}`
          : `Due revision: ${dueRevision.reasoning}`,
      );
    }

    // 6. MVP 4.0 — Unit bridge review (decision-rules-v4 priority 4)
    if (
      input.useDecisionRulesV4 &&
      input.unitBridgeConcepts &&
      input.unitBridgeConcepts.length > 0
    ) {
      const bridgeConceptId = input.unitBridgeConcepts[0];
      return makeDecision(
        "SHOW_QUESTION",
        "UNIT_BRIDGE_REVIEW",
        {
          conceptId: bridgeConceptId,
          difficulty,
          bridgeConceptId,
          unitId: input.primaryUnitId,
        },
        0.75,
        "Bridge concept review required to unlock next unit",
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
          { conceptId, difficulty: Math.max(1, difficulty - 1), unitId: input.primaryUnitId },
          0.65,
          "Still active misconception; reviewing prerequisite.",
        );
      }
      return makeDecision(
        "SHOW_QUESTION",
        "DECREASE_DIFFICULTY",
        { conceptId, difficulty: Math.max(1, difficulty - 1), unitId: input.primaryUnitId },
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
          { conceptId, difficulty, unitId: input.primaryUnitId },
          0.55,
          "Weak misconception evidence; standard practice.",
        );
      }
      if (input.alternativeExplanationDominant) {
        return makeDecision(
          "SHOW_QUESTION",
          "STANDARD_PRACTICE",
          { conceptId, difficulty, unitId: input.primaryUnitId },
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
          unitId: input.primaryUnitId,
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
        { conceptId, difficulty: Math.max(1, difficulty - 1), unitId: input.primaryUnitId },
        0.6,
        "Repeated errors with weak prerequisite mastery.",
      );
    }

    // 8. MVP 4.0 — Horizon focus practice (decision-rules-v4 priority 7)
    if (
      input.useDecisionRulesV4 &&
      input.horizonFocusConcepts &&
      input.horizonFocusConcepts.length > 0
    ) {
      // Select a focus concept from the current week's plan
      const focusConceptId =
        input.horizonFocusConcepts.find((c) => c !== conceptId) ??
        input.horizonFocusConcepts[0];
      return makeDecision(
        "SHOW_QUESTION",
        "HORIZON_FOCUS_PRACTICE",
        {
          conceptId: focusConceptId,
          difficulty,
          unitId: input.primaryUnitId,
          curriculumPlanId: input.curriculumPlanId,
          horizonWeekIndex: input.activePlanWeekIndex,
        },
        0.7,
        "Practicing curriculum horizon focus concept",
      );
    }

    // 9. Transfer check
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
          unitId: input.primaryUnitId,
        },
        0.71,
        "Mastery stable above threshold; no active misconception >0.6; transfer item available.",
        { questionFormat: "WORD_PROBLEM" },
      );
    }

    // 10. Difficulty adaptation (overconfident learners stay cautious on increase)
    if (recentCorrectStreak >= 2) {
      const nextDifficulty =
        input.confidenceCalibration === "possibly_overconfident"
          ? difficulty
          : Math.min(5, difficulty + 1);
      return makeDecision(
        "SHOW_QUESTION",
        nextDifficulty > difficulty ? "INCREASE_DIFFICULTY" : "STANDARD_PRACTICE",
        { conceptId, difficulty: nextDifficulty, unitId: input.primaryUnitId },
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
        { conceptId, difficulty: Math.max(1, difficulty - 1), unitId: input.primaryUnitId },
        0.7,
        "Repeated errors; decrease difficulty.",
      );
    }

    // 11. Standard practice
    const experimentNote =
      EXPERIMENT_VARIANT === "random"
        ? " (A/B stub: random sequencing variant)"
        : "";

    return makeDecision(
      "SHOW_QUESTION",
      "STANDARD_PRACTICE",
      { conceptId, difficulty, unitId: input.primaryUnitId },
      0.6,
      `Continue practice at current level.${experimentNote}`,
    );
  }

  fallbackDecision(session: LearningSession, unitId?: string, useDecisionRulesV4?: boolean): LearningDecision {
    return this.decision(
      "SHOW_QUESTION",
      "STANDARD_PRACTICE",
      {
        conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
        difficulty: session.activeDifficulty ?? 2,
        unitId,
      },
      0.4,
      "Safe fallback decision.",
      { fallbackGenerated: true },
      undefined,
      undefined,
      useDecisionRulesV4,
    );
  }

  /**
   * MVP 3.0 — Candidate scoring decision path.
   * Used when EXPERIMENTS_ENABLED && scored_v1 arm && not shadow.
   */
  private decideWithScoring(
    input: DecisionInput,
    experimentKey?: string,
    experimentArm?: string,
  ): LearningDecision {
    const { session } = input;

    // Hard gates 1-2: always win, never scored
    const hardGate = this.checkHardGates(input);
    if (hardGate) {
      return this.decision(
        hardGate.uiAction,
        hardGate.learningIntent,
        hardGate.parameters,
        hardGate.confidence,
        hardGate.reasoning,
        hardGate.options,
        experimentKey,
        experimentArm,
        input.useDecisionRulesV4,
      );
    }

    // Generate legal candidates from rules 3-10
    const candidates = this.generateLegalCandidates(input);

    if (candidates.length === 0) {
      this.logger.warn("No legal candidates generated; falling back");
      return this.fallbackDecision(session);
    }

    // Score and rank candidates
    const scoringContext = {
      studentId: session.studentId,
      sessionId: session.id,
      eventId: `decision_${Date.now()}`,
      experimentId: experimentKey,
      experimentArmId: experimentArm,
      shadow: input.shadow ?? false,
      masteryValue: input.masteryValue,
      masteryThreshold: input.masteryThreshold,
      retentionEstimate: input.retentionEstimate,
      misconceptionConfidence: input.misconceptionConfidence,
      explanationEffectiveness: input.explanationEffectiveness,
      seenDifficulties: input.seenDifficulties,
      targetConceptId: session.activeConceptId ?? undefined,
      targetDifficulty: session.activeDifficulty ?? undefined,
    };

    const scoredCandidates = this.candidateScorer!.scoreAndRank(
      candidates,
      scoringContext,
    );

    const selectedIndex = this.candidateScorer!.selectBest(scoredCandidates);
    const selected = scoredCandidates[selectedIndex];

    this.logger.log(
      `Scored ${candidates.length} candidates; selected: ${selected.candidate.learningIntent} (score: ${selected.score.toFixed(3)})`,
    );

    // Convert selected candidate to LearningDecision
    return this.decision(
      selected.candidate.uiAction,
      selected.candidate.learningIntent,
      selected.candidate.parameters,
      selected.score,
      `Scored selection: ${selected.candidate.legalityReason}`,
      {
        explanationStyle: selected.candidate.contentStyle?.explanationStyle,
        questionFormat: selected.candidate.contentStyle?.questionFormat,
      },
      experimentKey,
      experimentArm,
      input.useDecisionRulesV4,
    );
  }

  /**
   * Check hard gates (END_SESSION, SUGGEST_BREAK) that always win.
   * Returns the decision if a hard gate is triggered, null otherwise.
   */
  private checkHardGates(input: DecisionInput): {
    uiAction: LearningDecision["uiAction"];
    learningIntent: LearningIntent;
    parameters: LearningDecision["parameters"];
    confidence: number;
    reasoning: string;
    options?: {
      fallbackGenerated?: boolean;
      explanationStyle?: "STEP_BY_STEP" | "HINT" | "ANALOGY";
      questionFormat?: "NUMERIC" | "MCQ" | "WORD_PROBLEM";
    };
  } | null {
    const { session } = input;
    const sessionMinutes =
      input.sessionMinutes ??
      (Date.now() - session.startedAt.getTime()) / (1000 * 60);

    // 1. Safety / session end
    if (
      sessionMinutes >= HARD_STOP_SESSION_MINUTES ||
      session.questionCount >= SESSION_QUESTION_LIMIT
    ) {
      return {
        uiAction: "END_SESSION",
        learningIntent:
          session.sessionMode === "BASELINE"
            ? "BASELINE_ASSESSMENT"
            : "STANDARD_PRACTICE",
        parameters: {
          conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
          difficulty: session.activeDifficulty ?? 2,
        },
        confidence: 0.9,
        reasoning:
          sessionMinutes >= HARD_STOP_SESSION_MINUTES
            ? "Session time limit reached."
            : "Session question limit reached.",
      };
    }

    const breakSuggestedThisSession =
      input.breakSuggestedThisSession ??
      Boolean(
        (session as LearningSession & { breakSuggestedAt?: Date | null })
          .breakSuggestedAt,
      );

    const fatigueRisk =
      input.fatigueRisk ??
      computeFatigueRisk({
        sessionMinutes,
        recentIncorrectStreak: input.recentIncorrectStreak,
        averageTimeIncreasing50Pct: input.averageTimeIncreasing50Pct ?? false,
        idleSpikeCount: input.idleSpikeCount ?? 0,
      });

    // 2. Fatigue break
    if (
      fatigueRisk &&
      !breakSuggestedThisSession &&
      sessionMinutes < HARD_STOP_SESSION_MINUTES
    ) {
      return {
        uiAction: "SUGGEST_BREAK",
        learningIntent: "BREAK_FOR_FATIGUE",
        parameters: {
          conceptId: session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION",
          difficulty: session.activeDifficulty ?? 2,
          breakMinutes: DEFAULT_BREAK_MINUTES,
        },
        confidence: 0.75,
        reasoning: "Fatigue risk detected; suggesting a short break.",
      };
    }

    return null;
  }

  /**
   * Generate legal candidates from decision rules 3-10.
   * Returns a list of valid CandidateAction objects.
   */
  private generateLegalCandidates(input: DecisionInput): CandidateAction[] {
    const candidates: CandidateAction[] = [];
    const { session } = input;
    const conceptId = session.activeConceptId ?? "C2_ONE_STEP_SUBTRACTION";
    let difficulty = session.activeDifficulty ?? 2;

    // Calibration-aware difficulty caution
    if (input.confidenceCalibration === "possibly_overconfident") {
      difficulty = Math.max(1, difficulty - 1);
    }

    // Baseline mode
    if (session.sessionMode === "BASELINE") {
      const baselineConceptId = baselineConceptForSlot(session.baselineSlotIndex);
      candidates.push({
        uiAction: "SHOW_QUESTION",
        learningIntent: "BASELINE_ASSESSMENT",
        parameters: {
          conceptId: baselineConceptId,
          difficulty: 2,
          baselineSlotIndex: session.baselineSlotIndex,
        },
        legalityReason: "Baseline mode active",
      });
      return candidates;
    }

    // Rule 3: Post-explanation re-test
    if (
      input.lastWasExplanation ||
      input.remediationState === "RETESTING"
    ) {
      candidates.push({
        uiAction: "SHOW_QUESTION",
        learningIntent: "RETEST_AFTER_EXPLANATION",
        parameters: {
          conceptId,
          difficulty,
          targetMisconception: input.activeMisconceptionId,
        },
        legalityReason: "Post-explanation re-test required",
      });
      return candidates; // Only legal option
    }

    // Rule 4: Explanation required
    if (input.remediationState === "EXPLANATION_REQUIRED") {
      if (
        input.errorRecoveryRate !== null &&
        input.errorRecoveryRate !== undefined &&
        input.errorRecoveryRate >= 0.65
      ) {
        candidates.push({
          uiAction: "SHOW_HINT",
          learningIntent: "TARGET_MISCONCEPTION",
          contentStyle: { explanationStyle: "HINT" },
          parameters: {
            conceptId,
            difficulty,
            targetMisconception: input.activeMisconceptionId,
            hintLevel: 1,
          },
          legalityReason: "High error recovery; hint preferred",
        });
      } else {
        candidates.push({
          uiAction: "SHOW_EXPLANATION",
          learningIntent: "TARGET_MISCONCEPTION",
          contentStyle: { explanationStyle: "STEP_BY_STEP" },
          parameters: {
            conceptId,
            difficulty,
            targetMisconception: input.activeMisconceptionId,
          },
          legalityReason: "Low error recovery; explanation required",
        });
      }
      return candidates; // Only legal option
    }

    // Rule 5: Due revision / retention
    if (input.dueRevision) {
      const isRetention =
        input.dueRevision.type === "RETENTION_REVIEW" ||
        input.dueRevision.type === "SPACED_REVIEW_RETENTION";
      candidates.push({
        uiAction: "SHOW_QUESTION",
        learningIntent: isRetention ? "RETENTION_REVIEW" : "EXECUTE_DUE_REVISION",
        parameters: {
          conceptId: input.dueRevision.conceptId,
          difficulty,
          revisionItemId: input.dueRevision.id,
          targetMisconception: input.dueRevision.targetMisconception ?? undefined,
          retentionEstimateId: isRetention ? input.retentionEstimateId : undefined,
        },
        legalityReason: isRetention ? "Retention review due" : "Revision due",
      });
    }

    // Rules 6-10: Standard practice paths (may generate multiple candidates)

    // STILL_ACTIVE remediation
    if (input.remediationState === "STILL_ACTIVE") {
      if (
        input.recentIncorrectStreak >= 2 &&
        (input.prerequisiteMastery ?? 1) < 0.5 &&
        input.hasPrereqQuestions
      ) {
        candidates.push({
          uiAction: "SHOW_QUESTION",
          learningIntent: "REVIEW_PREREQUISITE",
          parameters: {
            conceptId,
            difficulty: Math.max(1, difficulty - 1),
          },
          legalityReason: "Still active; weak prerequisite",
        });
      } else {
        candidates.push({
          uiAction: "SHOW_QUESTION",
          learningIntent: "DECREASE_DIFFICULTY",
          parameters: {
            conceptId,
            difficulty: Math.max(1, difficulty - 1),
          },
          legalityReason: "Still active; decrease difficulty",
        });
      }
    }

    // Misconception targeting
    if (
      input.remediationState === "TARGETING" ||
      ((input.misconceptionConfidence ?? 0) >= 0.6 &&
        input.activeMisconceptionId)
    ) {
      if ((input.misconceptionConfidence ?? 0) >= 0.5) {
        if (!input.alternativeExplanationDominant) {
          candidates.push({
            uiAction: "SHOW_QUESTION",
            learningIntent: "TARGET_MISCONCEPTION",
            parameters: {
              conceptId,
              difficulty: Math.max(
                1,
                difficulty - (input.recentIncorrectStreak >= 2 ? 1 : 0),
              ),
              targetMisconception: input.activeMisconceptionId,
            },
            legalityReason: "Targeting suspected misconception",
          });
        }
      }
    }

    // Transfer check
    const masteryThreshold = input.masteryThreshold ?? 0.75;
    const minimumEvidence = input.minimumEvidence ?? 5;
    const masteryValue = input.masteryValue;
    const evidenceCount = input.evidenceCount ?? 0;
    const hasActiveHigh =
      input.hasActiveMisconceptionHighConfidence ??
      ((input.misconceptionConfidence ?? 0) > 0.6 &&
        Boolean(input.activeMisconceptionId));

    if (
      masteryValue !== undefined &&
      masteryValue >= masteryThreshold &&
      evidenceCount >= minimumEvidence &&
      !hasActiveHigh &&
      input.hasTransferCheckItem
    ) {
      candidates.push({
        uiAction: "SHOW_QUESTION",
        learningIntent: "TRANSFER_CHECK",
        contentStyle: { questionFormat: "WORD_PROBLEM" },
        parameters: {
          conceptId,
          difficulty,
          transferConceptId: conceptId,
        },
        legalityReason: "Mastery stable; transfer check available",
      });
    }

    // Difficulty adaptation
    if (input.recentCorrectStreak >= 2) {
      const nextDifficulty =
        input.confidenceCalibration === "possibly_overconfident"
          ? difficulty
          : Math.min(5, difficulty + 1);
      candidates.push({
        uiAction: "SHOW_QUESTION",
        learningIntent:
          nextDifficulty > difficulty
            ? "INCREASE_DIFFICULTY"
            : "STANDARD_PRACTICE",
        parameters: { conceptId, difficulty: nextDifficulty },
        legalityReason:
          input.confidenceCalibration === "possibly_overconfident"
            ? "Overconfident; hold difficulty"
            : "Repeated success; increase difficulty",
      });
    }

    if (input.recentIncorrectStreak >= 2) {
      candidates.push({
        uiAction: "SHOW_QUESTION",
        learningIntent: "DECREASE_DIFFICULTY",
        parameters: {
          conceptId,
          difficulty: Math.max(1, difficulty - 1),
        },
        legalityReason: "Repeated errors; decrease difficulty",
      });
    }

    // Always include standard practice as a candidate
    candidates.push({
      uiAction: "SHOW_QUESTION",
      learningIntent: "STANDARD_PRACTICE",
      parameters: { conceptId, difficulty },
      legalityReason: "Standard practice always legal",
    });

    return candidates;
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
    useDecisionRulesV4?: boolean,
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
      useDecisionRulesV4
        ? DECISION_RULES_V4
        : experimentKey && experimentArm
          ? DECISION_RULES_V3
          : DECISION_RULES_V2;

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
