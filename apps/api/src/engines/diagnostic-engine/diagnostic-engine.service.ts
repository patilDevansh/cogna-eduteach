import { Injectable } from "@nestjs/common";
import {
  DIAGNOSTIC_RULES_V2,
  MASTERY_FORMULA_V2,
  RETENTION_RULES_V2,
  type DiagnosticOutput,
  type Grade,
} from "@cogna/shared";
import type { Attempt, Question, RemediationState } from "@cogna/database";
import { PrismaService } from "../../prisma/prisma.service";
import type { DiagnosticInference } from "@cogna/shared";
import {
  clamp,
  computeConfidenceCalibration,
  computeErrorRecoveryRate,
  computeFatigueRisk,
  computeHintDependence,
  computeLearningVelocity,
  computeMasteryUpdate,
  computeMisconceptionConfidence,
  computeRetentionEstimate,
  decayMisconceptionConfidence,
  DEFAULT_ALTERNATIVE_EXPLANATIONS,
  evidenceAgeWeight,
  hasSufficientRetentionEvidence,
  isAlternativeExplanationDominant,
  isIdleSpike,
  isIndependentCorrect,
  isRetentionReviewEligible,
  resolveConfidenceForCalibration,
} from "./diagnostic-formulas";

type MisconceptionPattern = {
  misconceptionId: string;
  answers: string[];
};

@Injectable()
export class DiagnosticEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async diagnose(input: {
    studentId: string;
    attemptId: string;
    question: Question;
    grade: Grade;
    submittedAnswer: string;
    highestHintLevel: number;
    selfRatedConfidence: number | null;
  }): Promise<DiagnosticOutput> {
    const { studentId, attemptId, question, grade, submittedAnswer, highestHintLevel } =
      input;

    const prior = await this.prisma.masteryScore.findUnique({
      where: {
        studentId_conceptId: {
          studentId,
          conceptId: question.conceptId,
        },
      },
    });

    const previousValue = prior?.value ?? 0.5;
    const previousConfidence = prior?.confidence ?? 0.1;
    const evidenceCount = prior?.evidenceCount ?? 0;

    const countsTowardEvidence =
      grade !== "INVALID_FORMAT" && grade !== "REQUIRES_REVIEW";

    const { newValue, signedEvidence } = computeMasteryUpdate({
      previousValue,
      grade,
      difficulty: question.difficulty,
      highestHintLevel,
      itemQualityWeight: question.itemQualityWeight,
    });

    const newEvidenceCount = countsTowardEvidence ? evidenceCount + 1 : evidenceCount;
    const concept = await this.prisma.concept.findUniqueOrThrow({
      where: { id: question.conceptId },
    });
    const newConfidence = clamp(
      previousConfidence +
        0.05 * Math.min(1, newEvidenceCount / concept.minimumEvidence),
      0.1,
      0.95,
    );

    await this.prisma.masteryScore.upsert({
      where: {
        studentId_conceptId: { studentId, conceptId: question.conceptId },
      },
      create: {
        studentId,
        conceptId: question.conceptId,
        value: newValue,
        confidence: newConfidence,
        evidenceCount: newEvidenceCount,
        modelVersion: MASTERY_FORMULA_V2,
      },
      update: {
        value: newValue,
        confidence: newConfidence,
        evidenceCount: newEvidenceCount,
        modelVersion: MASTERY_FORMULA_V2,
      },
    });

    await this.prisma.masteryHistory.create({
      data: {
        studentId,
        conceptId: question.conceptId,
        previousValue,
        newValue,
        attemptId,
        formulaVersion: MASTERY_FORMULA_V2,
      },
    });

    const diagnosticFactors: DiagnosticInference[] = [];
    const matchedMisconception = this.matchMisconception(
      question,
      submittedAnswer,
      grade,
    );

    if (matchedMisconception && grade === "INCORRECT") {
      const recent = await this.recentMatchingAttempts(
        studentId,
        matchedMisconception,
        question.conceptId,
      );
      const matchingCount = recent.length + 1;
      const misconceptionConfidence = computeMisconceptionConfidence(matchingCount);

      const factor = {
        factorType: "MISCONCEPTION",
        conceptId: question.conceptId,
        factorKey: matchedMisconception,
        value: matchingCount >= 2 ? "likely_present" : "possible",
        confidence: misconceptionConfidence,
        reasoning: `${matchingCount} matching error pattern(s) for ${matchedMisconception}.`,
        evidenceAttemptIds: [...recent.map((a) => a.id), attemptId],
        alternativeExplanations: ["ARITHMETIC_SLIP", "question_misread"],
      };
      diagnosticFactors.push(factor);

      await this.prisma.diagnosticFactor.create({
        data: {
          studentId,
          conceptId: question.conceptId,
          factorType: factor.factorType,
          factorKey: matchedMisconception,
          value: factor.value,
          confidence: misconceptionConfidence,
          reasoning: factor.reasoning,
          evidenceAttemptIds: factor.evidenceAttemptIds,
          alternativeExplanations: factor.alternativeExplanations,
          modelVersion: DIAGNOSTIC_RULES_V2,
        },
      });

      await this.updateRemediationState(
        studentId,
        matchedMisconception,
        question.conceptId,
        matchingCount,
        misconceptionConfidence,
      );
    } else if (
      grade === "CORRECT" &&
      question.questionIntent === "TARGET_MISCONCEPTION"
    ) {
      await this.decayActiveMisconceptions(studentId, question.conceptId);
    }

    // MVP 2.0: retention / velocity / error recovery / engagement (post-baseline evidence)
    // Parallel execution — these computations are independent and can run concurrently
    const [retentionFactor, velocityFactor, errorRecoveryFactor] = await Promise.all([
      this.computeAndStoreRetention(studentId, question.conceptId, attemptId),
      this.computeAndStoreVelocity(studentId, question.conceptId, attemptId),
      this.computeAndStoreErrorRecovery(studentId, question.conceptId, attemptId),
    ]);

    if (retentionFactor) {
      diagnosticFactors.push(retentionFactor as unknown as DiagnosticInference);
    }
    if (velocityFactor) {
      diagnosticFactors.push(velocityFactor as unknown as DiagnosticInference);
    }
    if (errorRecoveryFactor) {
      diagnosticFactors.push(errorRecoveryFactor as unknown as DiagnosticInference);
    }

    const profilePatch = await this.buildProfilePatch(studentId, question);

    await this.prisma.learnerProfile.upsert({
      where: { studentId },
      create: {
        studentId,
        confidenceCalibration: profilePatch.confidenceCalibration as string | undefined,
        hintDependence: profilePatch.hintDependence as number | undefined,
        revisionNeedSignals: profilePatch.revisionNeedSignals as object[] | undefined,
        masterySummary: profilePatch.masterySummary as object | undefined,
      },
      update: {
        confidenceCalibration: profilePatch.confidenceCalibration as string | undefined,
        hintDependence: profilePatch.hintDependence as number | undefined,
        revisionNeedSignals: profilePatch.revisionNeedSignals as object[] | undefined,
        masterySummary: profilePatch.masterySummary as object | undefined,
        profileVersion: { increment: 1 },
      },
    });

    return {
      masteryUpdates: [
        {
          conceptId: question.conceptId,
          previousValue,
          newValue,
          confidence: newConfidence,
          formulaVersion: MASTERY_FORMULA_V2,
        },
      ],
      diagnosticFactors,
      profilePatch,
      diagnosticVersion: DIAGNOSTIC_RULES_V2,
    };
  }

  private async buildProfilePatch(
    studentId: string,
    question: Question,
  ): Promise<Record<string, unknown>> {
    const recentAttempts = await this.prisma.attempt.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        question: { select: { hintLadder: true } },
      },
    });

    const calibrationAttempts = recentAttempts.slice(0, 8).map((a) => ({
      grade: a.grade as Grade,
      selfRatedConfidence: resolveConfidenceForCalibration(a),
    }));

    const hintDependence = computeHintDependence(
      recentAttempts.map((a) => ({
        highestHintLevel: a.highestHintLevel,
        hintsAvailable: ((a.question?.hintLadder as string[]) ?? []).length > 0,
      })),
    );

    const revisionNeedSignals = await this.computeRevisionSignals(studentId, question.conceptId);

    const sessionAttempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        session: { status: "ACTIVE" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const activeSession = await this.prisma.learningSession.findFirst({
      where: { studentId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    const sessionMinutes = activeSession
      ? (Date.now() - activeSession.startedAt.getTime()) / (1000 * 60)
      : 0;
    const idleSpikeCount = sessionAttempts.filter((a) => isIdleSpike(a.idleTimeMs)).length;
    const fatigueRisk = computeFatigueRisk({
      sessionMinutes,
      recentIncorrectStreak: this.streak(sessionAttempts, false),
      idleSpikeCount,
    });

    return {
      confidenceCalibration: computeConfidenceCalibration(calibrationAttempts),
      hintDependence,
      revisionNeedSignals,
      masterySummary: {
        engagement: {
          fatigueRisk,
          idleSpikeCount,
          sessionMinutes,
        },
      },
    };
  }

  private streak(
    attempts: Array<{ isCorrect: boolean }>,
    wantCorrect: boolean,
  ): number {
    let n = 0;
    for (const a of attempts) {
      if (a.isCorrect === wantCorrect) n += 1;
      else break;
    }
    return n;
  }

  private async computeRevisionSignals(
    studentId: string,
    conceptId: string,
  ): Promise<object[]> {
    const signals: object[] = [];
    const mastery = await this.prisma.masteryScore.findUnique({
      where: { studentId_conceptId: { studentId, conceptId } },
    });

    if (!mastery) return signals;

    if (mastery.value < 0.4 && mastery.evidenceCount >= 3) {
      signals.push({
        type: "LOW_MASTERY",
        conceptId,
        mastery: mastery.value,
        evidenceCount: mastery.evidenceCount,
      });
    }

    const lastSessionDrop = await this.prisma.masteryHistory.findFirst({
      where: { studentId, conceptId },
      orderBy: { createdAt: "desc" },
      skip: 1,
    });

    if (lastSessionDrop && mastery.value - lastSessionDrop.newValue <= -0.15) {
      signals.push({
        type: "MASTERY_DROP",
        conceptId,
        drop: lastSessionDrop.newValue - mastery.value,
      });
    }

    const lastCorrect = await this.prisma.attempt.findFirst({
      where: { studentId, grade: "CORRECT", question: { conceptId } },
      orderBy: { createdAt: "desc" },
    });

    if (lastCorrect) {
      const daysSince =
        (Date.now() - lastCorrect.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince >= 5 && mastery.value < 0.8) {
        signals.push({
          type: "SPACED_REVIEW",
          conceptId,
          daysSincePractice: Math.floor(daysSince),
        });
      }
    }

    const retention = await this.latestRetentionEstimate(studentId, conceptId);
    if (
      retention &&
      isRetentionReviewEligible(retention.estimate) &&
      retention.evidenceSufficient
    ) {
      signals.push({
        type: "LOW_RETENTION",
        conceptId,
        retentionEstimate: retention.estimate,
      });
    }

    return signals;
  }

  /**
   * retention-rules-v2: write factor + RetentionEstimate row when evidence sufficient.
   * Abstains with RETENTION_ESTIMATE_INSUFFICIENT when below minimum evidence.
   */
  async computeAndStoreRetention(
    studentId: string,
    conceptId: string,
    attemptId: string,
  ): Promise<Record<string, unknown> | null> {
    const conceptAttempts = await this.prisma.attempt.findMany({
      where: { studentId, question: { conceptId } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const independent = conceptAttempts.filter((a) =>
      isIndependentCorrect(a.grade as Grade, a.highestHintLevel),
    );
    // Independent attempts = CORRECT with hint<=1; also count independent-eligible tries
    // Spec: at least 2 independent attempts AND at least 1 CORRECT independent.
    // "Independent attempt" here means an attempt that qualifies as independent success
    // OR we count attempts that were answered independently (hint<=1) regardless of grade?
    // Spec: "at least 2 independent attempts on the concept AND at least 1 CORRECT independent"
    // Independent = CORRECT AND highestHintLevel <= 1 — so both must be independent corrects.
    // That would mean independentAttemptCount === independentCorrectCount always.
    // Re-read: "independent = CORRECT AND highestHintLevel <= 1" for daysSinceSuccess.
    // For evidence: "at least 2 independent attempts" — likely means 2 attempts with hint<=1
    // that count toward independence evidence, with ≥1 correct.
    const independentEligible = conceptAttempts.filter((a) => a.highestHintLevel <= 1);
    const independentCorrect = independentEligible.filter((a) => a.grade === "CORRECT");

    if (
      !hasSufficientRetentionEvidence({
        independentAttemptCount: independentEligible.length,
        independentCorrectCount: independentCorrect.length,
      })
    ) {
      await this.prisma.diagnosticFactor.create({
        data: {
          studentId,
          conceptId,
          factorType: "RETENTION",
          factorKey: "RETENTION_ESTIMATE_INSUFFICIENT",
          value: { abstained: true },
          confidence: 0,
          reasoning: "Insufficient independent evidence for retention estimate.",
          evidenceAttemptIds: [attemptId],
          alternativeExplanations: [],
          modelVersion: RETENTION_RULES_V2,
        },
      });
      return {
        factorType: "RETENTION",
        conceptId,
        factorKey: "RETENTION_ESTIMATE_INSUFFICIENT",
        value: { abstained: true },
        confidence: 0,
        reasoning: "Insufficient independent evidence for retention estimate.",
        evidenceAttemptIds: [attemptId],
      };
    }

    const mastery = await this.prisma.masteryScore.findUnique({
      where: { studentId_conceptId: { studentId, conceptId } },
    });
    const masteryValue = mastery?.value ?? 0.5;

    const lastSuccess = independentCorrect[0];
    const daysSinceSuccess = lastSuccess
      ? (Date.now() - lastSuccess.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    const completedRevisionsLast14Days = await this.prisma.revisionQueueItem.count({
      where: {
        studentId,
        conceptId,
        status: "COMPLETED",
        updatedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
    });

    const estimate = computeRetentionEstimate({
      mastery: masteryValue,
      daysSinceSuccess: Math.floor(daysSinceSuccess),
      completedRevisionsLast14Days,
    });

    const evidenceIds = independentEligible.slice(0, 10).map((a) => a.id);
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const row = await this.prisma.retentionEstimate.create({
      data: {
        studentId,
        conceptId,
        estimate,
        confidence: Math.min(0.9, 0.4 + 0.1 * independentCorrect.length),
        daysSinceSuccess: Math.floor(daysSinceSuccess),
        evidenceAttemptIds: evidenceIds,
        modelVersion: RETENTION_RULES_V2,
        validUntil,
      },
    });

    const factor = {
      factorType: "RETENTION",
      conceptId,
      factorKey: "retentionEstimate",
      value: estimate,
      confidence: row.confidence,
      reasoning: `retentionEstimate=${estimate.toFixed(2)} (mastery=${masteryValue.toFixed(2)}, daysSinceSuccess=${Math.floor(daysSinceSuccess)}).`,
      evidenceAttemptIds: evidenceIds,
      alternativeExplanations: [] as string[],
    };

    await this.prisma.diagnosticFactor.create({
      data: {
        studentId,
        conceptId,
        factorType: factor.factorType,
        factorKey: factor.factorKey,
        value: factor.value,
        confidence: factor.confidence,
        reasoning: factor.reasoning,
        evidenceAttemptIds: factor.evidenceAttemptIds,
        alternativeExplanations: factor.alternativeExplanations,
        modelVersion: RETENTION_RULES_V2,
        validUntil,
      },
    });

    void independent;
    return { ...factor, retentionEstimateId: row.id };
  }

  private async latestRetentionEstimate(
    studentId: string,
    conceptId: string,
  ): Promise<{ estimate: number; evidenceSufficient: boolean } | null> {
    const row = await this.prisma.retentionEstimate.findFirst({
      where: {
        studentId,
        conceptId,
        modelVersion: RETENTION_RULES_V2,
        validUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return { estimate: row.estimate, evidenceSufficient: true };
  }

  async computeAndStoreVelocity(
    studentId: string,
    conceptId: string,
    attemptId: string,
  ): Promise<Record<string, unknown> | null> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const history = await this.prisma.masteryHistory.findMany({
      where: { studentId, conceptId, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "asc" },
    });
    const mastery = await this.prisma.masteryScore.findUnique({
      where: { studentId_conceptId: { studentId, conceptId } },
    });
    if (!mastery) return null;

    const masterySevenDaysAgo =
      history.length > 0 ? history[0].previousValue : mastery.value;
    const eligibleAttempts = history.length;
    const { velocity, interpretation } = computeLearningVelocity({
      masteryNow: mastery.value,
      masterySevenDaysAgo,
      eligibleAttempts,
    });

    if (interpretation === "unknown") return null;

    const factor = {
      factorType: "LEARNING_VELOCITY",
      conceptId,
      factorKey: interpretation,
      value: velocity,
      confidence: eligibleAttempts >= 5 ? 0.8 : 0.6,
      reasoning: `velocity=${velocity.toFixed(4)} over ${eligibleAttempts} attempts → ${interpretation}.`,
      evidenceAttemptIds: [attemptId],
    };

    await this.prisma.diagnosticFactor.create({
      data: {
        studentId,
        conceptId,
        factorType: factor.factorType,
        factorKey: factor.factorKey,
        value: factor.value,
        confidence: factor.confidence,
        reasoning: factor.reasoning,
        evidenceAttemptIds: factor.evidenceAttemptIds,
        alternativeExplanations: [],
        modelVersion: DIAGNOSTIC_RULES_V2,
      },
    });

    return factor;
  }

  async computeAndStoreErrorRecovery(
    studentId: string,
    conceptId: string,
    attemptId: string,
  ): Promise<Record<string, unknown> | null> {
    const attempts = await this.prisma.attempt.findMany({
      where: {
        studentId,
        question: { conceptId },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "asc" },
    });

    let feedbackOpportunities = 0;
    let correctAfterFeedbackAttempts = 0;

    for (let i = 0; i < attempts.length - 1; i++) {
      const curr = attempts[i];
      const next = attempts[i + 1];
      if (curr.grade !== "INCORRECT") continue;
      // Feedback opportunity: incorrect followed by hint use, explanation path, or retest
      // Feedback opportunity: hint used, explanation/retest path, or next attempt on same concept
      const hadFeedback =
        curr.hintCount > 0 ||
        next.questionId !== curr.questionId ||
        next.highestHintLevel > curr.highestHintLevel;
      if (!hadFeedback) continue;
      feedbackOpportunities += 1;
      if (next.grade === "CORRECT") correctAfterFeedbackAttempts += 1;
    }

    const rate = computeErrorRecoveryRate({
      correctAfterFeedbackAttempts,
      feedbackOpportunities,
    });
    if (rate === null) return null;

    const factor = {
      factorType: "ERROR_RECOVERY",
      conceptId,
      factorKey: "errorRecoveryRate",
      value: rate,
      confidence: feedbackOpportunities >= 5 ? 0.8 : 0.55,
      reasoning: `errorRecoveryRate=${rate.toFixed(2)} (${correctAfterFeedbackAttempts}/${feedbackOpportunities}).`,
      evidenceAttemptIds: [attemptId],
    };

    await this.prisma.diagnosticFactor.create({
      data: {
        studentId,
        conceptId,
        factorType: factor.factorType,
        factorKey: factor.factorKey,
        value: factor.value,
        confidence: factor.confidence,
        reasoning: factor.reasoning,
        evidenceAttemptIds: factor.evidenceAttemptIds,
        alternativeExplanations: [],
        modelVersion: DIAGNOSTIC_RULES_V2,
      },
    });

    return factor;
  }

  private async decayActiveMisconceptions(studentId: string, conceptId: string) {
    const factors = await this.prisma.diagnosticFactor.findMany({
      where: {
        studentId,
        conceptId,
        factorType: "MISCONCEPTION",
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    for (const factor of factors) {
      const decayed = decayMisconceptionConfidence(factor.confidence);
      if (decayed < factor.confidence) {
        await this.prisma.diagnosticFactor.create({
          data: {
            studentId,
            conceptId,
            factorType: "MISCONCEPTION",
            factorKey: factor.factorKey,
            value: (decayed < 0.4 ? "unlikely" : factor.value) as object,
            confidence: decayed,
            reasoning: "Non-matching correct on targeted item; confidence decayed.",
            evidenceAttemptIds: factor.evidenceAttemptIds,
            alternativeExplanations: factor.alternativeExplanations,
            modelVersion: DIAGNOSTIC_RULES_V2,
          },
        });
      }
    }
  }

  private matchMisconception(
    question: Question,
    submittedAnswer: string,
    grade: Grade,
  ): string | null {
    if (grade !== "INCORRECT") return null;

    const patterns = (question.misconceptionPatterns as MisconceptionPattern[] | null) ?? [];
    const normalized = submittedAnswer.trim().toLowerCase().replace(/\s+/g, "");

    for (const pattern of patterns) {
      for (const ans of pattern.answers) {
        const normAns = ans.trim().toLowerCase().replace(/\s+/g, "");
        if (normAns === normalized || normalized === `x=${normAns}`) {
          return pattern.misconceptionId;
        }
      }
    }

    return null;
  }

  /**
   * R14 — compare primary misconception weighted evidence to taxonomy alternatives
   * and competing MISCONCEPTION factors on the same concept (last 45 days).
   */
  private async computeAltExplanationDominant(
    studentId: string,
    conceptId: string,
    primaryId: string,
    primaryMatchingCount: number,
    primaryConfidence: number,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const recentFactors = await this.prisma.diagnosticFactor.findMany({
      where: {
        studentId,
        conceptId,
        factorType: "MISCONCEPTION",
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });

    const byKey = new Map<string, { weightedMatchingCount: number; confidence: number }>();
    for (const f of recentFactors) {
      if (!f.factorKey || byKey.has(f.factorKey)) continue;
      const ageDays =
        (Date.now() - f.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const weight = evidenceAgeWeight(ageDays);
      if (weight === 0) continue;
      const rawCount =
        typeof f.value === "object" &&
        f.value !== null &&
        "matchingCount" in (f.value as object)
          ? Number((f.value as { matchingCount?: number }).matchingCount)
          : typeof f.value === "number"
            ? f.value
            : primaryMatchingCount;
      byKey.set(f.factorKey, {
        weightedMatchingCount: rawCount * weight,
        confidence: f.confidence,
      });
    }

    // Ensure primary reflects the latest match count
    byKey.set(primaryId, {
      weightedMatchingCount: primaryMatchingCount,
      confidence: primaryConfidence,
    });

    const altIds = [
      ...(DEFAULT_ALTERNATIVE_EXPLANATIONS[primaryId] ?? []),
      ...[...byKey.keys()].filter((k) => k !== primaryId),
    ];
    const uniqueAlts = [...new Set(altIds)].filter((id) => id !== "question_misread");

    const alternatives = uniqueAlts.map((id) => {
      const row = byKey.get(id);
      return {
        misconceptionId: id,
        weightedMatchingCount: row?.weightedMatchingCount ?? 0,
        confidence: row?.confidence ?? 0,
      };
    });

    return isAlternativeExplanationDominant({
      primary: {
        misconceptionId: primaryId,
        weightedMatchingCount: primaryMatchingCount,
        confidence: primaryConfidence,
      },
      alternatives,
    });
  }

  private async recentMatchingAttempts(
    studentId: string,
    misconceptionId: string,
    conceptId: string,
  ): Promise<Attempt[]> {
    const recent = await this.prisma.attempt.findMany({
      where: { studentId, grade: "INCORRECT" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const matches: Attempt[] = [];
    for (const attempt of recent) {
      const q = await this.prisma.question.findFirst({
        where: { id: attempt.questionId, version: attempt.questionVersion },
      });
      if (!q || q.conceptId !== conceptId) continue;
      if (q.misconceptionsTested.includes(misconceptionId)) {
        matches.push(attempt);
      }
    }
    return matches;
  }

  private async updateRemediationState(
    studentId: string,
    misconceptionId: string,
    conceptId: string,
    matchingCount: number,
    confidence: number,
  ) {
    const existing = await this.prisma.misconceptionRemediationState.findUnique({
      where: {
        studentId_misconceptionId_conceptId: {
          studentId,
          misconceptionId,
          conceptId,
        },
      },
    });

    const altDominant = await this.computeAltExplanationDominant(
      studentId,
      conceptId,
      misconceptionId,
      matchingCount,
      confidence,
    );

    const previousState = existing?.state ?? "UNCONFIRMED";
    let state = previousState;
    // R14: remain UNCONFIRMED when alternative explanation dominates
    if (
      matchingCount >= 2 &&
      confidence >= 0.6 &&
      state === "UNCONFIRMED" &&
      !altDominant
    ) {
      state = "TARGETING";
    }

    await this.prisma.misconceptionRemediationState.upsert({
      where: {
        studentId_misconceptionId_conceptId: {
          studentId,
          misconceptionId,
          conceptId,
        },
      },
      create: {
        studentId,
        misconceptionId,
        conceptId,
        state,
        targetedAttemptCount: state === "TARGETING" ? 1 : 0,
      },
      update: {
        state,
        targetedAttemptCount:
          state === "TARGETING"
            ? (existing?.targetedAttemptCount ?? 0) + 1
            : existing?.targetedAttemptCount ?? 0,
      },
    });

    await this.recordRemediationTransition(
      studentId,
      misconceptionId,
      conceptId,
      previousState,
      state,
    );
  }

  /** Insert-only transition log powering the parent "pattern history" view. No-op when the state didn't actually change. */
  private async recordRemediationTransition(
    studentId: string,
    misconceptionId: string,
    conceptId: string,
    fromState: RemediationState,
    toState: RemediationState,
  ): Promise<void> {
    if (fromState === toState) return;
    await this.prisma.misconceptionRemediationStateHistory.create({
      data: { studentId, misconceptionId, conceptId, fromState, toState },
    });
  }
}
