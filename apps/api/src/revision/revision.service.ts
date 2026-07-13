import { Injectable, NotFoundException } from "@nestjs/common";
import { RECOMMENDATION_RULES_V2 } from "@cogna/shared";
import { RevisionItemStatus } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import { RecommendationEngineService } from "../engines/recommendation-engine/recommendation-engine.service";

export interface RevisionProposal {
  conceptId: string;
  type: string;
  targetMisconception?: string;
  priority: number;
  dueAt: Date;
  questionCount: number;
  reasoning: string;
  confidence: number;
  recommendationVersion?: string;
}

@Injectable()
export class RevisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendationEngine: RecommendationEngineService,
  ) {}

  buildDedupeKey(type: string, conceptId: string, targetMisconception?: string): string {
    return `${type}:${conceptId}:${targetMisconception ?? "none"}`;
  }

  async applyProposals(studentId: string, proposals: RevisionProposal[]) {
    const applied = [];

    for (const proposal of proposals) {
      const dedupeKey = this.buildDedupeKey(
        proposal.type,
        proposal.conceptId,
        proposal.targetMisconception,
      );

      const existing = await this.prisma.revisionQueueItem.findUnique({
        where: { studentId_dedupeKey: { studentId, dedupeKey } },
      });

      if (
        existing &&
        (existing.status === RevisionItemStatus.COMPLETED ||
          existing.status === RevisionItemStatus.CANCELLED ||
          existing.status === RevisionItemStatus.EXPIRED)
      ) {
        continue;
      }

      const item = await this.prisma.revisionQueueItem.upsert({
        where: { studentId_dedupeKey: { studentId, dedupeKey } },
        create: {
          studentId,
          conceptId: proposal.conceptId,
          type: proposal.type,
          targetMisconception: proposal.targetMisconception,
          priority: proposal.priority,
          dueAt: proposal.dueAt,
          questionCount: proposal.questionCount,
          status: RevisionItemStatus.PENDING,
          reasoning: proposal.reasoning,
          confidence: proposal.confidence,
          recommendationVersion: proposal.recommendationVersion ?? RECOMMENDATION_RULES_V2,
          dedupeKey,
        },
        update: {
          priority: proposal.priority,
          dueAt: proposal.dueAt,
          questionCount: proposal.questionCount,
          reasoning: proposal.reasoning,
          confidence: proposal.confidence,
          recommendationVersion: proposal.recommendationVersion ?? RECOMMENDATION_RULES_V2,
          status: RevisionItemStatus.PENDING,
        },
      });

      applied.push(item);
    }

    return applied;
  }

  async listQueue(studentId: string) {
    return this.prisma.revisionQueueItem.findMany({
      where: {
        studentId,
        status: { in: [RevisionItemStatus.PENDING, RevisionItemStatus.IN_PROGRESS] },
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    });
  }

  async findDue(studentId: string) {
    return this.prisma.revisionQueueItem.findFirst({
      where: {
        studentId,
        status: RevisionItemStatus.PENDING,
        dueAt: { lte: new Date() },
      },
      orderBy: { priority: "desc" },
    });
  }

  async getRevisionPlan(studentId: string) {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });

    const queue = await this.listQueue(studentId);
    const today = new Date().toISOString().slice(0, 10);
    const dailyItems = queue.slice(0, 10).map((item) => ({
      revisionItemId: item.id,
      type: item.type,
      conceptId: item.conceptId,
      priority: item.priority,
      dueAt: item.dueAt.toISOString(),
      questionCount: item.questionCount,
    }));

    const weekly = await this.recommendationEngine.buildWeeklyPlan(studentId);
    const weekStart = startOfIsoWeek(new Date()).toISOString();

    return {
      studentId,
      daily: {
        date: today,
        items: dailyItems,
        cappedAt: 10,
      },
      weekly: {
        weekStart,
        ...weekly,
        transferEligible: (weekly.transferCheckConceptIds?.length ?? 0) > 0,
      },
    };
  }

  async markInProgress(itemId: string) {
    const item = await this.prisma.revisionQueueItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Revision item not found.");

    return this.prisma.revisionQueueItem.update({
      where: { id: itemId },
      data: { status: RevisionItemStatus.IN_PROGRESS },
    });
  }

  async markCompleted(itemId: string) {
    const item = await this.prisma.revisionQueueItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Revision item not found.");

    return this.prisma.revisionQueueItem.update({
      where: { id: itemId },
      data: { status: RevisionItemStatus.COMPLETED },
    });
  }
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
