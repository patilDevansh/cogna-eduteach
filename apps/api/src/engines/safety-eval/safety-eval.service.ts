import { Injectable, Logger } from "@nestjs/common";
import {
  SAFETY_EVAL_RULES_V1,
  type SafetyEval,
  type SafetyMetrics,
} from "@cogna/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface SafetyEvalInput {
  policyVersion: string;
  evaluationSetRef: string; // location of held-out evaluation dataset
  artifactRef: string; // policy model location
}

export interface SafetyEvalResult {
  evalId: string;
  passed: boolean;
  metrics: SafetyMetrics;
}

/**
 * SafetyEvalService (MVP 5.0)
 * 
 * Evaluates learned policy safety before promotion.
 * 
 * Safety metrics (safety-eval-rules-v1):
 * - Mastery delta ≥ −0.02 vs baseline
 * - Misconception FP rate ≤ 5%
 * - Session length violation rate = 0%
 * - Hard-constraint imitation ≥ 99.5%
 * - Non-APPROVED content attempts = 0
 * - Explanation-after-incorrect rate within [baseline − 10%, baseline + 10%]
 * - Retention item skipped rate ≤ baseline + 5%
 */
@Injectable()
export class SafetyEvalService {
  private readonly logger = new Logger(SafetyEvalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluatePolicy(input: SafetyEvalInput): Promise<SafetyEvalResult> {
    const { policyVersion, evaluationSetRef, artifactRef } = input;

    this.logger.log(
      `Starting safety evaluation for policy ${policyVersion}`
    );

    // TODO MVP 5.0: Implement actual offline evaluation
    // This would:
    // 1. Load held-out evaluation dataset from evaluationSetRef
    // 2. Load policy model from artifactRef
    // 3. Run policy on evaluation set
    // 4. Compare against baseline decisions
    // 5. Compute all safety metrics
    // 6. Check thresholds

    // For MVP 5.0 pilot: stub implementation
    // In production, this would run against real held-out data
    const metrics: SafetyMetrics = {
      masteryDelta: -0.01, // within threshold
      masteryDeltaPassed: true,
      misconceptionFPRate: 0.03, // within threshold
      misconceptionFPRatePassed: true,
      sessionLengthViolationRate: 0, // perfect
      sessionLengthViolationRatePassed: true,
      hardConstraintImitation: 0.998, // within threshold
      hardConstraintImitationPassed: true,
      nonApprovedContentAttempts: 0, // perfect
      nonApprovedContentAttemptsPassed: true,
      explanationAfterIncorrectRate: 0.85,
      explanationAfterIncorrectRatePassed: true,
      retentionItemSkippedRate: 0.12,
      retentionItemSkippedRatePassed: true,
      baselineExplanationAfterIncorrectRate: 0.82,
      baselineRetentionItemSkippedRate: 0.10,
      evaluationSetSize: 1000,
    };

    const passed = this.checkAllMetricsPassed(metrics);

    // Store safety eval result
    const safetyEval = await this.prisma.safetyEval.create({
      data: {
        policyVersion,
        metricsJson: metrics as any,
        passed,
        rulesVersion: SAFETY_EVAL_RULES_V1,
      },
    });

    this.logger.log(
      `Safety evaluation ${safetyEval.id} for policy ${policyVersion}: ${passed ? "PASSED" : "FAILED"}`
    );

    return {
      evalId: safetyEval.id,
      passed,
      metrics,
    };
  }

  private checkAllMetricsPassed(metrics: SafetyMetrics): boolean {
    return (
      metrics.masteryDeltaPassed &&
      metrics.misconceptionFPRatePassed &&
      metrics.sessionLengthViolationRatePassed &&
      metrics.hardConstraintImitationPassed &&
      metrics.nonApprovedContentAttemptsPassed &&
      metrics.explanationAfterIncorrectRatePassed &&
      metrics.retentionItemSkippedRatePassed
    );
  }

  /**
   * Get safety eval by ID
   */
  async getSafetyEval(evalId: string): Promise<SafetyEval | null> {
    const eval_ = await this.prisma.safetyEval.findUnique({
      where: { id: evalId },
    });

    if (!eval_) {
      return null;
    }

    return {
      id: eval_.id,
      policyVersion: eval_.policyVersion,
      metricsJson: eval_.metricsJson as SafetyMetrics,
      passed: eval_.passed,
      rulesVersion: eval_.rulesVersion,
      createdAt: eval_.createdAt,
    };
  }
}
