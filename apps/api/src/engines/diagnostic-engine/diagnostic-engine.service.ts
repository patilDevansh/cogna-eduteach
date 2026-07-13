import { Injectable } from "@nestjs/common";
import {
  DIAGNOSTIC_RULES_V1,
  MASTERY_FORMULA_V1,
  type DiagnosticOutput,
  type Grade,
} from "@cogna/shared";
import type { Attempt, MasteryScore, Question } from "@cogna/database";
import { PrismaService } from "../../prisma/prisma.service";
import {
  clamp,
  computeConfidenceCalibration,
  computeHintDependence,
  computeMasteryUpdate,
  computeMisconceptionConfidence,
  decayMisconceptionConfidence,
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
        modelVersion: MASTERY_FORMULA_V1,
      },
      update: {
        value: newValue,
        confidence: newConfidence,
        evidenceCount: newEvidenceCount,
        modelVersion: MASTERY_FORMULA_V1,
      },
    });

    await this.prisma.masteryHistory.create({
      data: {
        studentId,
        conceptId: question.conceptId,
        previousValue,
        newValue,
        attemptId,
        formulaVersion: MASTERY_FORMULA_V1,
      },
    });

    const diagnosticFactors = [];
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
          modelVersion: DIAGNOSTIC_RULES_V1,
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

    const profilePatch = await this.buildProfilePatch(studentId, question);

    await this.prisma.learnerProfile.upsert({
      where: { studentId },
      create: {
        studentId,
        confidenceCalibration: profilePatch.confidenceCalibration as string | undefined,
        hintDependence: profilePatch.hintDependence as number | undefined,
        revisionNeedSignals: profilePatch.revisionNeedSignals as object[] | undefined,
      },
      update: {
        confidenceCalibration: profilePatch.confidenceCalibration as string | undefined,
        hintDependence: profilePatch.hintDependence as number | undefined,
        revisionNeedSignals: profilePatch.revisionNeedSignals as object[] | undefined,
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
          formulaVersion: MASTERY_FORMULA_V1,
        },
      ],
      diagnosticFactors,
      profilePatch,
      diagnosticVersion: DIAGNOSTIC_RULES_V1,
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
      selfRatedConfidence: a.selfRatedConfidence,
    }));

    const hintDependence = computeHintDependence(
      recentAttempts.map((a) => ({
        highestHintLevel: a.highestHintLevel,
        hintsAvailable: ((a.question?.hintLadder as string[]) ?? []).length > 0,
      })),
    );

    const revisionNeedSignals = await this.computeRevisionSignals(studentId, question.conceptId);

    return {
      confidenceCalibration: computeConfidenceCalibration(calibrationAttempts),
      hintDependence,
      revisionNeedSignals,
    };
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

    return signals;
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
            modelVersion: DIAGNOSTIC_RULES_V1,
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

    let state = existing?.state ?? "UNCONFIRMED";
    if (matchingCount >= 2 && confidence >= 0.6 && state === "UNCONFIRMED") {
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
  }
}
