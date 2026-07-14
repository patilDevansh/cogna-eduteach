import { Injectable, Logger } from "@nestjs/common";
import {
  MODALITY_RULES_V1,
  type ModalityAsset,
  type ModalityKind,
  type LearningIntent,
} from "@cogna/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface ModalitySelectionInput {
  conceptId: string;
  misconceptionId?: string;
  learningIntent: LearningIntent;
  studentId: string;
  sessionId: string;
}

export interface ModalitySelectionResult {
  asset?: ModalityAsset;
  modality: ModalityKind;
  reason: string;
  rulesVersion: string;
}

/**
 * ModalityDirectorService (MVP 5.0)
 * 
 * Selects APPROVED modality assets (animation/video/voice) when appropriate.
 * Never generates unchecked media; only returns pre-approved reviewed assets.
 * 
 * Rules (modality-rules-v1):
 * - Only select if learningIntent is teaching-eligible
 * - Only APPROVED assets
 * - Concept + optional misconception match
 * - Check modality fatigue (not implemented in MVP 5.0 pilot)
 * - Default to TEXT if no suitable asset or conditions not met
 */
@Injectable()
export class ModalityDirectorService {
  private readonly logger = new Logger(ModalityDirectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async selectModality(
    input: ModalitySelectionInput
  ): Promise<ModalitySelectionResult> {
    const { conceptId, misconceptionId, learningIntent, studentId, sessionId } =
      input;

    // Check if intent is eligible for teaching module
    const teachingEligibleIntents: LearningIntent[] = [
      "SHOW_TEACHING_MODULE",
      "TARGET_MISCONCEPTION",
      "REVIEW_PREREQUISITE",
    ];

    if (!teachingEligibleIntents.includes(learningIntent)) {
      return {
        modality: "TEXT",
        reason: "Intent not eligible for modality asset",
        rulesVersion: MODALITY_RULES_V1,
      };
    }

    // Find APPROVED modality assets for this concept/misconception
    const whereClause: any = {
      conceptId,
      reviewStatus: "APPROVED",
    };

    if (misconceptionId) {
      whereClause.misconceptionId = misconceptionId;
    }

    const assets = await this.prisma.modalityAsset.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    if (assets.length === 0) {
      return {
        modality: "TEXT",
        reason: "No APPROVED modality assets found for concept/misconception",
        rulesVersion: MODALITY_RULES_V1,
      };
    }

    // TODO MVP 5.0: Check modality fatigue (student has seen too many videos recently)
    // For now, select the first (most recent) asset
    const selectedAsset = assets[0];

    // Verify retest question exists if required
    if (selectedAsset.retestQuestionId) {
      const retestQuestion = await this.prisma.question.findFirst({
        where: {
          id: selectedAsset.retestQuestionId,
          reviewStatus: "APPROVED",
        },
      });

      if (!retestQuestion) {
        this.logger.warn(
          `Modality asset ${selectedAsset.assetId} has invalid retestQuestionId ${selectedAsset.retestQuestionId}`
        );
        return {
          modality: "TEXT",
          reason: "Modality asset retest question not found",
          rulesVersion: MODALITY_RULES_V1,
        };
      }
    }

    return {
      asset: selectedAsset as ModalityAsset,
      modality: selectedAsset.modality as ModalityKind,
      reason: `Selected ${selectedAsset.modality} asset for ${conceptId}${misconceptionId ? `/${misconceptionId}` : ""}`,
      rulesVersion: MODALITY_RULES_V1,
    };
  }

  /**
   * Record modality outcome after student completes/views asset
   */
  async recordOutcome(input: {
    studentId: string;
    assetId: string;
    sessionId: string;
    completed: boolean;
    dwellMs: number;
    retestCorrect?: boolean;
    modelVersion: string;
  }): Promise<void> {
    await this.prisma.modalityOutcome.create({
      data: {
        studentId: input.studentId,
        assetId: input.assetId,
        sessionId: input.sessionId,
        completed: input.completed,
        dwellMs: input.dwellMs,
        retestCorrect: input.retestCorrect,
        modelVersion: input.modelVersion,
      },
    });

    this.logger.log(
      `Recorded modality outcome for student ${input.studentId}, asset ${input.assetId}, completed=${input.completed}`
    );
  }
}
