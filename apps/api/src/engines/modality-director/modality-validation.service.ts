import { Injectable, Logger } from "@nestjs/common";
import type { ModalityKind, ReviewStatus } from "@cogna/shared";
import { PrismaService } from "../../prisma/prisma.service";

export const MODALITY_VALIDATION_RULES_V1 = "modality-validation-rules-v1";

export interface ModalityValidationInput {
  assetId: string;
  modality: ModalityKind;
  conceptId: string;
  misconceptionId?: string;
  unitId: string;
  subjectId: string;
  storageRef: string;
  transcriptRef?: string;
  retestQuestionId?: string;
  durationMs?: number;
  targetReviewStatus: ReviewStatus;
}

export interface ModalityValidationResult {
  valid: boolean;
  errors?: string[];
  version: string;
}

/**
 * Modality Validation Service — modality-validation-rules-v1
 *
 * Validation rules for modality assets before approval:
 * 1. Retest question mapping required and must be APPROVED
 * 2. Transcript required for VIDEO/VOICE with math claims
 * 3. Duration present for VIDEO/ANIMATION
 * 4. Storage ref valid format
 * 5. Cannot transition to APPROVED without passing all checks
 */
@Injectable()
export class ModalityValidationService {
  private readonly logger = new Logger(ModalityValidationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateAsset(
    input: ModalityValidationInput
  ): Promise<ModalityValidationResult> {
    const errors: string[] = [];

    // Rule 1: Retest question mapping required for APPROVED status
    if (input.targetReviewStatus === "APPROVED") {
      if (!input.retestQuestionId) {
        errors.push(
          "Retest question mapping is required for APPROVED modality assets"
        );
      } else {
        // Verify retest question exists and is APPROVED
        const retestQuestion = await this.prisma.question.findFirst({
          where: {
            id: input.retestQuestionId,
          },
        });

        if (!retestQuestion) {
          errors.push(
            `Retest question ${input.retestQuestionId} does not exist`
          );
        } else if (retestQuestion.reviewStatus !== "APPROVED") {
          errors.push(
            `Retest question ${input.retestQuestionId} must be APPROVED (current status: ${retestQuestion.reviewStatus})`
          );
        }
      }
    }

    // Rule 2: Transcript required for VIDEO/VOICE modality
    if (
      (input.modality === "VIDEO" || input.modality === "VOICE") &&
      input.targetReviewStatus === "APPROVED"
    ) {
      if (!input.transcriptRef) {
        errors.push(
          `Transcript reference is required for ${input.modality} modality assets`
        );
      } else {
        // Basic format check - transcript should be a valid storage ref
        if (!this.isValidStorageRef(input.transcriptRef)) {
          errors.push(
            `Transcript reference has invalid format: ${input.transcriptRef}`
          );
        }

        // In production, this would:
        // - Fetch transcript content
        // - Parse math claims
        // - Validate against APPROVED solution for the concept
        // For MVP 5.0 pilot, we check presence only
      }
    }

    // Rule 3: Duration required for VIDEO/ANIMATION
    if (
      (input.modality === "VIDEO" || input.modality === "ANIMATION") &&
      input.targetReviewStatus === "APPROVED"
    ) {
      if (!input.durationMs || input.durationMs <= 0) {
        errors.push(
          `Duration in milliseconds is required for ${input.modality} modality`
        );
      } else if (input.durationMs > 600000) {
        // 10 minutes max
        errors.push(
          `Duration exceeds maximum (600000ms / 10 minutes): ${input.durationMs}ms`
        );
      }
    }

    // Rule 4: Storage ref format check
    if (!this.isValidStorageRef(input.storageRef)) {
      errors.push(`Storage reference has invalid format: ${input.storageRef}`);
    }

    // Rule 5: Subject and unit must exist
    const subject = await this.prisma.subject.findFirst({
      where: { subjectId: input.subjectId },
    });

    if (!subject) {
      errors.push(`Subject ${input.subjectId} does not exist`);
    }

    const unit = await this.prisma.curriculumUnit.findFirst({
      where: { unitId: input.unitId },
    });

    if (!unit) {
      errors.push(`Curriculum unit ${input.unitId} does not exist`);
    }

    const valid = errors.length === 0;

    if (!valid) {
      this.logger.warn(
        `Modality validation failed for asset ${input.assetId}: ${errors.join("; ")}`
      );
    }

    return {
      valid,
      errors: errors.length > 0 ? errors : undefined,
      version: MODALITY_VALIDATION_RULES_V1,
    };
  }

  /**
   * Validate that an asset can transition to a new review status
   */
  async canTransitionToStatus(
    assetId: string,
    targetStatus: ReviewStatus
  ): Promise<ModalityValidationResult> {
    const asset = await this.prisma.modalityAsset.findFirst({
      where: { assetId },
    });

    if (!asset) {
      return {
        valid: false,
        errors: [`Asset ${assetId} not found`],
        version: MODALITY_VALIDATION_RULES_V1,
      };
    }

    // Only validate when transitioning TO APPROVED
    if (targetStatus !== "APPROVED") {
      return {
        valid: true,
        version: MODALITY_VALIDATION_RULES_V1,
      };
    }

    return this.validateAsset({
      assetId: asset.assetId,
      modality: asset.modality as ModalityKind,
      conceptId: asset.conceptId,
      misconceptionId: asset.misconceptionId ?? undefined,
      unitId: asset.unitId,
      subjectId: asset.subjectId,
      storageRef: asset.storageRef,
      transcriptRef: asset.transcriptRef ?? undefined,
      retestQuestionId: asset.retestQuestionId ?? undefined,
      durationMs: asset.durationMs ?? undefined,
      targetReviewStatus: targetStatus,
    });
  }

  private isValidStorageRef(ref: string): boolean {
    // Basic format check: should look like a storage path
    // Examples: s3://bucket/path, /storage/path, https://cdn.example.com/asset
    return (
      ref.length > 0 &&
      (ref.startsWith("s3://") ||
        ref.startsWith("http://") ||
        ref.startsWith("https://") ||
        ref.startsWith("/storage/") ||
        ref.startsWith("file://"))
    );
  }
}
