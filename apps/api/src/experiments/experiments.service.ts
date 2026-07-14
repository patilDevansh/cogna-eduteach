import { Prisma } from "@cogna/database";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ExperimentDefinition,
  ExperimentAssignment,
  ExperimentArm,
  ExperimentEligibility,
  EXPERIMENT_RULES_V1,
} from "@cogna/shared";
import { createHash } from "crypto";

export interface ExperimentAssignmentInput {
  studentId: string;
  experimentKey: string;
}

@Injectable()
export class ExperimentsService {
  private readonly logger = new Logger(ExperimentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get experiment definition by key.
   */
  async getExperimentDefinition(
    experimentKey: string,
  ): Promise<ExperimentDefinition | null> {
    const row = await this.prisma.experimentDefinition.findUnique({
      where: { experimentKey },
    });

    if (!row) {
      return null;
    }

    const armsJson = row.armsJson as {
      arms: ExperimentArm[];
      allocation: Record<ExperimentArm, number>;
    };

    return {
      experimentKey: row.experimentKey,
      status: row.status as ExperimentDefinition["status"],
      arms: armsJson.arms,
      allocation: armsJson.allocation,
      eligibility: row.eligibilityJson as ExperimentEligibility,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt?.toISOString(),
      rulesVersion: row.rulesVersion,
    };
  }

  /**
   * List all experiment definitions.
   */
  async listExperimentDefinitions(): Promise<ExperimentDefinition[]> {
    const rows = await this.prisma.experimentDefinition.findMany({
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => {
      const armsJson = row.armsJson as {
        arms: ExperimentArm[];
        allocation: Record<ExperimentArm, number>;
      };

      return {
        experimentKey: row.experimentKey,
        status: row.status as ExperimentDefinition["status"],
        arms: armsJson.arms,
        allocation: armsJson.allocation,
        eligibility: row.eligibilityJson as ExperimentEligibility,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt?.toISOString(),
        rulesVersion: row.rulesVersion,
      };
    });
  }

  /**
   * Create or update an experiment definition.
   */
  async upsertExperimentDefinition(
    definition: ExperimentDefinition,
  ): Promise<void> {
    const armsJson = {
      arms: definition.arms,
      allocation: definition.allocation,
    };

    await this.prisma.experimentDefinition.upsert({
      where: { experimentKey: definition.experimentKey },
      create: {
        experimentKey: definition.experimentKey,
        status: definition.status,
        armsJson,
        eligibilityJson: definition.eligibility as unknown as Prisma.InputJsonValue,
        rulesVersion: definition.rulesVersion,
        startAt: new Date(definition.startAt),
        endAt: definition.endAt ? new Date(definition.endAt) : null,
      },
      update: {
        status: definition.status,
        armsJson,
        eligibilityJson: definition.eligibility as unknown as Prisma.InputJsonValue,
        rulesVersion: definition.rulesVersion,
        startAt: new Date(definition.startAt),
        endAt: definition.endAt ? new Date(definition.endAt) : null,
      },
    });

    this.logger.log(
      `Experiment definition upserted: ${definition.experimentKey}`,
    );
  }

  /**
   * Sticky assignment: resolve or create an experiment assignment.
   * Returns the assigned arm (sticky for the student + experiment lifetime).
   */
  async resolveAssignment(
    input: ExperimentAssignmentInput,
  ): Promise<ExperimentAssignment | null> {
    const { studentId, experimentKey } = input;

    // Check for existing assignment (sticky)
    const existing = await this.prisma.experimentAssignment.findUnique({
      where: {
        studentId_experimentKey: { studentId, experimentKey },
      },
    });

    if (existing) {
      return {
        id: existing.id,
        studentId: existing.studentId,
        experimentKey: existing.experimentKey,
        arm: existing.arm,
        assignedAt: existing.assignedAt.toISOString(),
        sticky: true,
        metadata: existing.metadata as Record<string, string> | undefined,
      };
    }

    // No existing assignment — check eligibility + assign
    const definition = await this.getExperimentDefinition(experimentKey);

    if (!definition || definition.status !== "RUNNING") {
      this.logger.debug(
        `Experiment ${experimentKey} not RUNNING; no assignment.`,
      );
      return null;
    }

    const eligible = await this.checkEligibility(
      studentId,
      definition.eligibility,
    );

    if (!eligible) {
      this.logger.debug(
        `Student ${studentId} not eligible for ${experimentKey}.`,
      );
      return null;
    }

    // Hash-based sticky allocation (experiment-rules-v1 §9)
    const arm = this.computeArmAssignment(
      studentId,
      experimentKey,
      definition.arms,
      definition.allocation,
    );

    // Write assignment
    const created = await this.prisma.experimentAssignment.create({
      data: {
        studentId,
        experimentKey,
        arm,
        sticky: true,
      },
    });

    this.logger.log(
      `New assignment: student=${studentId}, experiment=${experimentKey}, arm=${arm}`,
    );

    return {
      id: created.id,
      studentId: created.studentId,
      experimentKey: created.experimentKey,
      arm: created.arm,
      assignedAt: created.assignedAt.toISOString(),
      sticky: true,
      metadata: created.metadata as Record<string, string> | undefined,
    };
  }

  /**
   * Force assignment (admin override).
   */
  async forceAssignment(
    studentId: string,
    experimentKey: string,
    arm: ExperimentArm,
  ): Promise<ExperimentAssignment> {
    const created = await this.prisma.experimentAssignment.upsert({
      where: {
        studentId_experimentKey: { studentId, experimentKey },
      },
      create: {
        studentId,
        experimentKey,
        arm,
        sticky: true,
        metadata: { forced: "true" },
      },
      update: {
        arm,
        metadata: { forced: "true" },
      },
    });

    this.logger.warn(
      `Forced assignment: student=${studentId}, experiment=${experimentKey}, arm=${arm}`,
    );

    return {
      id: created.id,
      studentId: created.studentId,
      experimentKey: created.experimentKey,
      arm: created.arm,
      assignedAt: created.assignedAt.toISOString(),
      sticky: true,
      metadata: created.metadata as Record<string, string> | undefined,
    };
  }

  /**
   * Get assignment for a student.
   */
  async getAssignment(
    studentId: string,
    experimentKey: string,
  ): Promise<ExperimentAssignment | null> {
    const row = await this.prisma.experimentAssignment.findUnique({
      where: {
        studentId_experimentKey: { studentId, experimentKey },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      studentId: row.studentId,
      experimentKey: row.experimentKey,
      arm: row.arm,
      assignedAt: row.assignedAt.toISOString(),
      sticky: true,
      metadata: row.metadata as Record<string, string> | undefined,
    };
  }

  /**
   * List all assignments for an experiment.
   */
  async listAssignments(
    experimentKey: string,
  ): Promise<ExperimentAssignment[]> {
    const rows = await this.prisma.experimentAssignment.findMany({
      where: { experimentKey },
      orderBy: { assignedAt: "asc" },
    });

    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      experimentKey: row.experimentKey,
      arm: row.arm,
      assignedAt: row.assignedAt.toISOString(),
      sticky: true,
      metadata: row.metadata as Record<string, string> | undefined,
    }));
  }

  /**
   * Check eligibility per experiment-rules-v1 §9.
   */
  private async checkEligibility(
    studentId: string,
    eligibility: ExperimentEligibility,
  ): Promise<boolean> {
    // Check minimum sessions completed
    if (eligibility.minSessionsCompleted !== undefined) {
      const completedCount = await this.prisma.learningSession.count({
        where: {
          studentId,
          status: "ENDED",
        },
      });

      if (completedCount < eligibility.minSessionsCompleted) {
        return false;
      }
    }

    // Check excludeBaselineOnly
    if (eligibility.excludeBaselineOnly) {
      const hasAdaptive = await this.prisma.learningSession.findFirst({
        where: {
          studentId,
          sessionMode: "ADAPTIVE_PRACTICE",
          status: "ENDED",
        },
      });

      if (!hasAdaptive) {
        return false;
      }
    }

    // Check unitId (concept filter)
    // For MVP 3.0, we assume eligibility.unitId is implicit (linear-equations-one-variable)
    // In production, this would check against a unit/concept enrollment table

    return true;
  }

  /**
   * Compute sticky arm assignment via hash (experiment-rules-v1 §9).
   */
  private computeArmAssignment(
    studentId: string,
    experimentKey: string,
    arms: ExperimentArm[],
    allocation: Record<ExperimentArm, number>,
  ): ExperimentArm {
    const hashInput = `${studentId}:${experimentKey}`;
    const hashBuffer = createHash("sha256").update(hashInput).digest();

    // Use first 4 bytes as uint32
    const hashValue =
      hashBuffer.readUInt32BE(0) + (hashBuffer.readUInt32BE(4) % 10000);
    const armIndex = hashValue % 10000;

    let cumulative = 0;
    for (const arm of arms) {
      cumulative += Math.floor(allocation[arm] * 10000);
      if (armIndex < cumulative) {
        return arm;
      }
    }

    // Fallback to last arm (should not happen if allocation sums to 1.0)
    return arms[arms.length - 1];
  }

  /**
   * Seed default experiment definition (policy_score_linear_eq).
   */
  async seedDefaultExperiment(): Promise<void> {
    const experimentKey = "policy_score_linear_eq_2026q3";

    const existing = await this.getExperimentDefinition(experimentKey);
    if (existing) {
      this.logger.log(`Experiment ${experimentKey} already exists; skipping seed.`);
      return;
    }

    const definition: ExperimentDefinition = {
      experimentKey,
      status: "DRAFT",
      arms: ["control", "scored_v1"],
      allocation: {
        control: 0.5,
        scored_v1: 0.5,
      },
      eligibility: {
        unitId: "linear-equations-one-variable",
        minSessionsCompleted: 1,
        excludeBaselineOnly: true,
      },
      startAt: new Date("2026-07-15T00:00:00Z").toISOString(),
      endAt: undefined,
      rulesVersion: EXPERIMENT_RULES_V1,
    };

    await this.upsertExperimentDefinition(definition);
    this.logger.log(`Seeded default experiment: ${experimentKey}`);
  }
}
