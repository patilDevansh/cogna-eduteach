import { Injectable, NotFoundException } from "@nestjs/common";
import type { ExplanationPayload, LearningDecision } from "@cogna/shared";
import { ReviewStatus } from "@cogna/database";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ExplanationEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async getExplanation(decision: LearningDecision): Promise<ExplanationPayload> {
    const { conceptId, targetMisconception } = decision.parameters;

    const template = await this.prisma.explanation.findFirst({
      where: {
        conceptId,
        misconceptionId: targetMisconception ?? undefined,
        reviewStatus: {
          in: [ReviewStatus.APPROVED, ReviewStatus.PENDING_REVIEW],
        },
      },
      orderBy: { version: "desc" },
    });

    if (!template) {
      throw new NotFoundException("No approved explanation template found.");
    }

    return {
      content: template.content,
      checkForUnderstanding: template.checkForUnderstanding ?? undefined,
      style: template.style,
      templateId: template.id,
    };
  }

  async getNextHint(
    questionId: string,
    questionVersion: number,
    currentLevel: number,
  ): Promise<{ level: number; content: string }> {
    const question = await this.prisma.question.findUniqueOrThrow({
      where: { id_version: { id: questionId, version: questionVersion } },
    });

    const ladder = question.hintLadder as string[];
    const nextLevel = Math.min(currentLevel + 1, ladder.length);
    const content = ladder[nextLevel - 1];

    if (!content) {
      throw new NotFoundException("No more hints available.");
    }

    return { level: nextLevel, content };
  }
}
