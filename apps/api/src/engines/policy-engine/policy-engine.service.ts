import { Injectable, Logger } from "@nestjs/common";
import {
  LEARNED_POLICY_V1,
  POLICY_RULES_V5,
  type LearningDecision,
  type PolicyChoiceRecord,
} from "@cogna/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface PolicyInferenceInput {
  studentId: string;
  sessionId: string;
  baselineDecision: LearningDecision;
  featureVector: Record<string, unknown>; // diagnostic features for learned model
}

export interface PolicyInferenceResult {
  decision: LearningDecision;
  choiceRecord: PolicyChoiceRecord;
}

/**
 * PolicyEngineService (MVP 5.0)
 * 
 * Manages learned policy inference with safety gates.
 * 
 * Rules (policy-rules-v5):
 * - Only use PROMOTED policy versions
 * - Check safety gate before using learned policy
 * - Fall back to baseline on timeout/error
 * - Log all policy choices for analysis
 * - Shadow mode: run learned but select baseline
 * - Hard gates must be respected (END_SESSION, SUGGEST_BREAK, due revision)
 */
@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger(PolicyEngineService.name);
  private readonly INFERENCE_TIMEOUT_MS = 500; // 500ms max for policy inference

  constructor(private readonly prisma: PrismaService) {}

  async inferDecision(
    input: PolicyInferenceInput
  ): Promise<PolicyInferenceResult> {
    const { studentId, sessionId, baselineDecision, featureVector } = input;

    // Find PROMOTED policy version
    const promotedPolicy = await this.prisma.policyVersion.findFirst({
      where: { status: "PROMOTED" },
      orderBy: { promotedAt: "desc" },
      include: { safetyEval: true },
    });

    if (!promotedPolicy) {
      // No promoted policy; use baseline
      return {
        decision: baselineDecision,
        choiceRecord: {
          policyVersion: POLICY_RULES_V5,
          baselineDecision,
          selected: "baseline",
          safetyGatePassed: true,
          shadow: false,
        },
      };
    }

    // Check safety gate
    if (
      !promotedPolicy.safetyEval ||
      !promotedPolicy.safetyEval.passed
    ) {
      this.logger.warn(
        `Policy ${promotedPolicy.policyVersion} safety gate failed`
      );
      return {
        decision: baselineDecision,
        choiceRecord: {
          policyVersion: promotedPolicy.policyVersion,
          baselineDecision,
          selected: "baseline",
          safetyGatePassed: false,
          shadow: false,
        },
      };
    }

    // TODO MVP 5.0: Implement actual learned policy inference
    // For now, this is a stub that returns baseline
    // In production, this would:
    // 1. Load the policy model from artifactRef
    // 2. Run inference with featureVector
    // 3. Apply hard gates (END_SESSION, due revision, etc.)
    // 4. Return learned decision if valid

    // Stub: check if we're in shadow mode
    const isExperiment = await this.checkExperimentMode(studentId);

    if (isExperiment === "shadow") {
      // Shadow mode: run learned but select baseline
      return {
        decision: baselineDecision,
        choiceRecord: {
          policyVersion: promotedPolicy.policyVersion,
          baselineDecision,
          learnedDecision: baselineDecision, // TODO: actual learned decision
          selected: "baseline",
          safetyGatePassed: true,
          shadow: true,
        },
      };
    }

    // For MVP 5.0 pilot: always use baseline (learned policy training is offline)
    // This service is the infrastructure for when learned policies are ready
    return {
      decision: baselineDecision,
      choiceRecord: {
        policyVersion: promotedPolicy.policyVersion,
        baselineDecision,
        selected: "baseline",
        safetyGatePassed: true,
        shadow: false,
      },
    };
  }

  private async checkExperimentMode(
    studentId: string
  ): Promise<"control" | "shadow" | "learned"> {
    // Check if student is in a learned-policy experiment
    const assignment = await this.prisma.experimentAssignment.findFirst({
      where: {
        studentId,
        experimentKey: "learned-policy-v1",
      },
    });

    if (!assignment) {
      return "control";
    }

    return assignment.arm as "control" | "shadow" | "learned";
  }

  /**
   * Promote a policy version after safety eval passes
   * Requires dual-control in production (checked at API layer)
   */
  async promotePolicy(input: {
    policyVersion: string;
    safetyEvalId: string;
    requestedBy: string;
  }): Promise<void> {
    // Roll back any currently promoted policies
    await this.prisma.policyVersion.updateMany({
      where: { status: "PROMOTED" },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });

    // Promote the new policy
    await this.prisma.policyVersion.update({
      where: { policyVersion: input.policyVersion },
      data: {
        status: "PROMOTED",
        promotedAt: new Date(),
        safetyEvalId: input.safetyEvalId,
      },
    });

    this.logger.log(
      `Promoted policy ${input.policyVersion} by ${input.requestedBy}`
    );
  }

  /**
   * Rollback a promoted policy (emergency or planned)
   */
  async rollbackPolicy(input: {
    policyVersion: string;
    reason: string;
    requestedBy: string;
  }): Promise<void> {
    await this.prisma.policyVersion.update({
      where: { policyVersion: input.policyVersion },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });

    this.logger.warn(
      `Rolled back policy ${input.policyVersion}: ${input.reason} (by ${input.requestedBy})`
    );
  }
}
