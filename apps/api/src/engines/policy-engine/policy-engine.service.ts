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

    // Stub: check if we're in shadow mode
    const isExperiment = await this.checkExperimentMode(studentId);

    // Run learned policy inference with timeout
    const startTime = Date.now();
    let learnedDecision: LearningDecision;
    let inferenceTimedOut = false;

    try {
      learnedDecision = await Promise.race([
        this.runPolicyInference(baselineDecision, featureVector, promotedPolicy.artifactRef),
        this.timeoutPromise(this.INFERENCE_TIMEOUT_MS),
      ]);
    } catch (error) {
      if ((error as Error).message === 'Policy inference timeout') {
        inferenceTimedOut = true;
        this.logger.warn(
          `Policy inference timeout for ${promotedPolicy.policyVersion} (${Date.now() - startTime}ms)`
        );
        learnedDecision = baselineDecision;
      } else {
        this.logger.error(
          `Policy inference error for ${promotedPolicy.policyVersion}:`,
          error
        );
        learnedDecision = baselineDecision;
      }
    }

    const inferenceTimeMs = Date.now() - startTime;

    if (isExperiment === "shadow") {
      // Shadow mode: run learned but select baseline
      return {
        decision: baselineDecision,
        choiceRecord: {
          policyVersion: promotedPolicy.policyVersion,
          baselineDecision,
          learnedDecision,
          selected: "baseline",
          safetyGatePassed: true,
          shadow: true,
          inferenceTimeMs,
        },
      };
    }

    // Use learned decision if not shadow mode and no timeout
    if (inferenceTimedOut) {
      return {
        decision: baselineDecision,
        choiceRecord: {
          policyVersion: promotedPolicy.policyVersion,
          baselineDecision,
          learnedDecision,
          selected: "baseline",
          safetyGatePassed: true,
          shadow: false,
          inferenceTimeMs,
        },
      };
    }

    // For MVP 5.0 pilot: always use baseline (learned policy training is offline)
    // When a real trained model exists, this would return learnedDecision
    return {
      decision: baselineDecision,
      choiceRecord: {
        policyVersion: promotedPolicy.policyVersion,
        baselineDecision,
        learnedDecision,
        selected: "baseline",
        safetyGatePassed: true,
        shadow: false,
        inferenceTimeMs,
      },
    };
  }

  /**
   * Run policy inference (deterministic stub for testing)
   * 
   * In production, this would:
   * - Load model artifact from S3
   * - Run neural network inference
   * - Return scored candidate actions
   * 
   * For testing, this implements a simple rule-based model that:
   * - Respects hard gates (END_SESSION, SUGGEST_BREAK)
   * - Can simulate various learned behaviors
   */
  private async runPolicyInference(
    baselineDecision: LearningDecision,
    featureVector: Record<string, unknown>,
    artifactRef: string
  ): Promise<LearningDecision> {
    // HARD GATE IMITATION: If baseline says END_SESSION or SUGGEST_BREAK, respect it
    if (
      baselineDecision.uiAction === "END_SESSION" ||
      baselineDecision.uiAction === "SUGGEST_BREAK"
    ) {
      // Learned policy MUST imitate hard gates
      return baselineDecision;
    }

    // Deterministic test model: modify decision based on feature vector
    // In reality, this would be a neural network forward pass
    const testBehavior = artifactRef.includes('test-slow-inference')
      ? 'slow'
      : artifactRef.includes('test-different-intent')
      ? 'different-intent'
      : 'baseline-like';

    if (testBehavior === 'slow') {
      // Simulate slow inference for timeout testing
      await new Promise(resolve => setTimeout(resolve, 600));
      return baselineDecision;
    }

    if (testBehavior === 'different-intent') {
      // Return a slightly different decision to test learned vs baseline
      return {
        ...baselineDecision,
        learningIntent: "CONCEPT_REINFORCEMENT",
        reasoning: "Learned policy: reinforcement recommended",
        decisionVersion: LEARNED_POLICY_V1,
      };
    }

    // Default: return baseline-like decision
    return {
      ...baselineDecision,
      reasoning: "Learned policy (baseline-like)",
      decisionVersion: LEARNED_POLICY_V1,
    };
  }

  private async timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Policy inference timeout')), ms);
    });
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
   * Request promotion of a policy version (step 1 of dual-control)
   * Requires safety eval to have passed
   */
  async requestPromotion(input: {
    policyVersion: string;
    safetyEvalId: string;
    requestedBy: string;
  }): Promise<void> {
    const safetyEval = await this.prisma.safetyEval.findUnique({
      where: { id: input.safetyEvalId },
    });

    if (!safetyEval || !safetyEval.passed) {
      throw new Error(
        `Cannot request promotion: safety eval ${input.safetyEvalId} did not pass`
      );
    }

    await this.prisma.policyVersion.update({
      where: { policyVersion: input.policyVersion },
      data: {
        status: "PROMOTION_REQUESTED",
        promotionRequestedBy: input.requestedBy,
        promotionRequestedAt: new Date(),
        safetyEvalId: input.safetyEvalId,
      },
    });

    this.logger.log(
      `Promotion requested for policy ${input.policyVersion} by ${input.requestedBy}`
    );
  }

  /**
   * Approve promotion of a policy version (step 2 of dual-control)
   * Requires a different actor than the requester
   */
  async approvePromotion(input: {
    policyVersion: string;
    approvedBy: string;
  }): Promise<void> {
    const policy = await this.prisma.policyVersion.findUnique({
      where: { policyVersion: input.policyVersion },
    });

    if (!policy || policy.status !== "PROMOTION_REQUESTED") {
      throw new Error(
        `Cannot approve promotion: policy ${input.policyVersion} is not in PROMOTION_REQUESTED status`
      );
    }

    if (policy.promotionRequestedBy === input.approvedBy) {
      throw new Error(
        `Cannot approve promotion: approver must be different from requester`
      );
    }

    // Roll back any currently promoted policies
    await this.prisma.policyVersion.updateMany({
      where: { status: "PROMOTED" },
      data: {
        status: "ROLLED_BACK",
        rolledBackAt: new Date(),
        rolledBackBy: input.approvedBy,
        rolledBackReason: "Replaced by new policy promotion",
      },
    });

    // Promote the new policy
    await this.prisma.policyVersion.update({
      where: { policyVersion: input.policyVersion },
      data: {
        status: "PROMOTED",
        promotedAt: new Date(),
        promotionApprovedBy: input.approvedBy,
        promotionApprovedAt: new Date(),
      },
    });

    this.logger.log(
      `Promoted policy ${input.policyVersion} - requested by ${policy.promotionRequestedBy}, approved by ${input.approvedBy}`
    );
  }

  /**
   * Reject a promotion request
   */
  async rejectPromotion(input: {
    policyVersion: string;
    rejectedBy: string;
    reason: string;
  }): Promise<void> {
    await this.prisma.policyVersion.update({
      where: { policyVersion: input.policyVersion },
      data: {
        status: "REJECTED",
        promotionRejectedBy: input.rejectedBy,
        promotionRejectedAt: new Date(),
        promotionRejectedReason: input.reason,
      },
    });

    this.logger.log(
      `Promotion rejected for policy ${input.policyVersion}: ${input.reason} (by ${input.rejectedBy})`
    );
  }

  /**
   * Promote a policy version after safety eval passes
   * @deprecated Use requestPromotion + approvePromotion for dual-control
   * Kept for backward compatibility with tests
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
      data: {
        status: "ROLLED_BACK",
        rolledBackAt: new Date(),
        rolledBackBy: input.requestedBy,
        rolledBackReason: input.reason,
      },
    });

    this.logger.warn(
      `Rolled back policy ${input.policyVersion}: ${input.reason} (by ${input.requestedBy})`
    );
  }
}
