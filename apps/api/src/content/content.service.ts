import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ContentReviewStatus,
  ContentReviewType,
  ReviewStatus,
} from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";

export interface ContentReviewInput {
  contentVersion: number;
  status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  checklist: {
    mathCorrect: boolean;
    wordingClear: boolean;
    tagsAccurate: boolean;
  };
  notes?: string;
  reviewer: string;
}

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async reviewQuestion(questionId: string, input: ContentReviewInput) {
    const question = await this.prisma.question.findFirst({
      where: { id: questionId },
      orderBy: { version: "desc" },
    });
    if (!question) {
      throw new NotFoundException(`Question ${questionId} not found`);
    }

    if (input.contentVersion !== question.version) {
      throw new BadRequestException(
        `contentVersion mismatch: expected ${question.version}, got ${input.contentVersion}`,
      );
    }

    const { mathCorrect, wordingClear, tagsAccurate } = input.checklist;
    if (!mathCorrect || !wordingClear || !tagsAccurate) {
      if (input.status === "APPROVED") {
        throw new BadRequestException(
          "Cannot APPROVE when checklist items are false",
        );
      }
    }

    const reviewedAt = new Date();
    const review = await this.prisma.contentReview.create({
      data: {
        contentType: ContentReviewType.QUESTION,
        contentId: questionId,
        contentVersion: input.contentVersion,
        reviewer: input.reviewer,
        status: input.status as ContentReviewStatus,
        checklist: input.checklist,
        notes: input.notes ?? null,
        reviewedAt,
      },
    });

    let reviewStatus: ReviewStatus = question.reviewStatus;
    if (input.status === "APPROVED") {
      reviewStatus = ReviewStatus.APPROVED;
    } else if (input.status === "REJECTED") {
      reviewStatus = ReviewStatus.RETIRED;
    } else {
      reviewStatus = ReviewStatus.PENDING_REVIEW;
    }

    await this.prisma.question.update({
      where: { id_version: { id: questionId, version: question.version } },
      data: { reviewStatus },
    });

    return {
      reviewId: review.id,
      contentId: questionId,
      contentVersion: input.contentVersion,
      status: input.status,
      reviewedAt: reviewedAt.toISOString(),
    };
  }
}
