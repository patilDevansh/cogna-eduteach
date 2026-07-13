import { Injectable, NotFoundException } from "@nestjs/common";
import {
  BASELINE_FALLBACK_CONCEPTS,
  QUESTION_SELECTOR_V1,
  baselineConceptForSlot,
  type LearningDecision,
  type QuestionPayload,
} from "@cogna/shared";
import { Question, ReviewStatus } from "@cogna/database";
import { PrismaService } from "../../prisma/prisma.service";

const RANK = {
  EXACT_CONCEPT: 40,
  INTENT_MATCH: 25,
  MISCONCEPTION_TAG: 20,
  EXACT_DIFFICULTY: 10,
  PREFERRED_TYPE: 5,
  APPROVED: 5,
  RECENTLY_USED: -100,
  UNAPPROVED: -100,
  MISSING_PREREQ: -50,
} as const;

@Injectable()
export class QuestionGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async selectForDecision(
    decision: LearningDecision,
    recentQuestionIds: string[],
    options?: { baselineSlotIndex?: number },
  ): Promise<{ question: QuestionPayload; reasoning: string; score: number }> {
    const { conceptId, difficulty = 2, targetMisconception } = decision.parameters;
    const preferredType = decision.parameters.preferredQuestionType;

    const primaryConcept =
      decision.learningIntent === "BASELINE_ASSESSMENT" && options?.baselineSlotIndex !== undefined
        ? baselineConceptForSlot(options.baselineSlotIndex)
        : conceptId;

    const result = await this.trySelect(
      decision,
      primaryConcept,
      difficulty,
      targetMisconception,
      preferredType,
      recentQuestionIds,
    );

    if (result) return result;

    // Fallback 1: same concept, nearest difficulty
    for (const delta of [0, 1, -1, 2, -2]) {
      const nearDiff = Math.min(5, Math.max(1, difficulty + delta));
      if (nearDiff === difficulty) continue;
      const fallback = await this.trySelect(
        { ...decision, learningIntent: "STANDARD_PRACTICE" },
        primaryConcept,
        nearDiff,
        undefined,
        preferredType,
        recentQuestionIds,
        { relaxIntent: true },
      );
      if (fallback) {
        return {
          ...fallback,
          reasoning: `Fallback nearest difficulty: ${fallback.reasoning}`,
        };
      }
    }

    // Fallback 2: prerequisite concept
    const prereqs = await this.prisma.conceptPrerequisite.findMany({
      where: { conceptId: primaryConcept },
      take: 1,
    });
    if (prereqs[0]) {
      const prereqResult = await this.trySelect(
        { ...decision, learningIntent: "REVIEW_PREREQUISITE" },
        prereqs[0].prerequisiteId,
        Math.max(1, difficulty - 1),
        undefined,
        preferredType,
        recentQuestionIds,
        { relaxIntent: true },
      );
      if (prereqResult) {
        return {
          ...prereqResult,
          reasoning: `Fallback prerequisite: ${prereqResult.reasoning}`,
        };
      }
    }

    // Fallback 3: baseline alternate concepts
    const alternates = BASELINE_FALLBACK_CONCEPTS[primaryConcept] ?? [];
    for (const altConcept of alternates) {
      const altResult = await this.trySelect(
        { ...decision, learningIntent: "STANDARD_PRACTICE" },
        altConcept,
        difficulty,
        undefined,
        preferredType,
        recentQuestionIds,
        { relaxIntent: true },
      );
      if (altResult) {
        return {
          ...altResult,
          reasoning: `Fallback alternate concept: ${altResult.reasoning}`,
        };
      }
    }

    throw new NotFoundException("NO_ELIGIBLE_QUESTION");
  }

  private async trySelect(
    decision: LearningDecision,
    conceptId: string,
    difficulty: number,
    targetMisconception: string | undefined,
    preferredType: string | undefined,
    recentQuestionIds: string[],
    options?: { relaxIntent?: boolean },
  ): Promise<{ question: QuestionPayload; reasoning: string; score: number } | null> {
    const allowPending = process.env.ALLOW_PENDING_REVIEW_QUESTIONS === "true";
    const reviewFilter = allowPending
      ? { in: [ReviewStatus.APPROVED, ReviewStatus.PENDING_REVIEW] }
      : ReviewStatus.APPROVED;

    const candidates = await this.prisma.question.findMany({
      where: {
        conceptId,
        difficulty: { gte: Math.max(1, difficulty - 1), lte: Math.min(5, difficulty + 1) },
        reviewStatus: reviewFilter,
        id: { notIn: recentQuestionIds },
        ...(decision.learningIntent === "TARGET_MISCONCEPTION" &&
        targetMisconception &&
        !options?.relaxIntent
          ? { misconceptionsTested: { has: targetMisconception } }
          : {}),
        ...(decision.learningIntent === "BASELINE_ASSESSMENT" && !options?.relaxIntent
          ? { questionIntent: "BASELINE_ASSESSMENT" }
          : {}),
        ...(decision.learningIntent === "RETEST_AFTER_EXPLANATION" && !options?.relaxIntent
          ? {
              questionIntent: {
                in: ["RETEST_AFTER_EXPLANATION", "STANDARD_PRACTICE", "TARGET_MISCONCEPTION"],
              },
            }
          : {}),
      },
      take: 30,
    });

    if (candidates.length === 0) return null;

    const ranked = candidates
      .map((q) => ({
        question: q,
        score: this.scoreCandidate(
          q,
          decision,
          conceptId,
          difficulty,
          targetMisconception,
          preferredType,
          recentQuestionIds,
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const selected = ranked[0];
    if (!selected || selected.score < -50) return null;

    return {
      question: this.toPayload(selected.question),
      reasoning: `Selected ${selected.question.id} v${selected.question.version} (score ${selected.score}, ${QUESTION_SELECTOR_V1}).`,
      score: selected.score,
    };
  }

  private scoreCandidate(
    q: Question,
    decision: LearningDecision,
    targetConceptId: string,
    targetDifficulty: number,
    targetMisconception: string | undefined,
    preferredType: string | undefined,
    recentQuestionIds: string[],
  ): number {
    let score = 0;

    if (q.conceptId === targetConceptId) score += RANK.EXACT_CONCEPT;

    if (
      decision.learningIntent === "BASELINE_ASSESSMENT" &&
      q.questionIntent === "BASELINE_ASSESSMENT"
    ) {
      score += RANK.INTENT_MATCH;
    } else if (
      decision.learningIntent === "TARGET_MISCONCEPTION" &&
      q.questionIntent === "TARGET_MISCONCEPTION"
    ) {
      score += RANK.INTENT_MATCH;
    } else if (
      decision.learningIntent === "RETEST_AFTER_EXPLANATION" &&
      q.questionIntent === "RETEST_AFTER_EXPLANATION"
    ) {
      score += RANK.INTENT_MATCH;
    } else if (decision.learningIntent === "STANDARD_PRACTICE") {
      score += RANK.INTENT_MATCH / 2;
    }

    if (
      targetMisconception &&
      q.misconceptionsTested.includes(targetMisconception)
    ) {
      score += RANK.MISCONCEPTION_TAG;
    }

    if (q.difficulty === targetDifficulty) score += RANK.EXACT_DIFFICULTY;
    if (preferredType && q.type === preferredType) score += RANK.PREFERRED_TYPE;
    if (q.reviewStatus === ReviewStatus.APPROVED) score += RANK.APPROVED;
    else score += RANK.UNAPPROVED;

    if (recentQuestionIds.includes(q.id)) score += RANK.RECENTLY_USED;

    return score;
  }

  private toPayload(selected: Question): QuestionPayload {
    return {
      id: selected.id,
      version: selected.version,
      stem: selected.stem,
      type: selected.type,
      difficulty: selected.difficulty,
      conceptId: selected.conceptId,
      hintLadder: selected.hintLadder as string[],
    };
  }
}
