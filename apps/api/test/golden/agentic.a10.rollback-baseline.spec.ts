import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PolicyEngineService } from "../../src/engines/policy-engine/policy-engine.service";
import { SafetyEvalService } from "../../src/engines/safety-eval/safety-eval.service";
import { POLICY_RULES_V5 } from "@cogna/shared";
import type { LearningDecision } from "@cogna/shared";

/**
 * A10 — Rollback restores baseline (MVP 5.0)
 * 
 * When a promoted policy is rolled back, the system should:
 * - Mark the policy as ROLLED_BACK
 * - Use baseline decisions for all subsequent inference calls
 * - No longer consider the rolled-back policy
 * 
 * This provides the instant rollback mechanism for emergency policy issues.
 */
describe("A10 — Rollback restores baseline", () => {
  const prisma = new PrismaClient();
  const policyEngine = new PolicyEngineService(prisma);
  const safetyEval = new SafetyEvalService(prisma);

  const baselineDecision: LearningDecision = {
    uiAction: "SHOW_QUESTION",
    learningIntent: "STANDARD_PRACTICE",
    parameters: { conceptId: "C2_ONE_STEP_SUBTRACTION" },
    confidence: 0.9,
    reasoning: "Baseline decision",
    decisionVersion: POLICY_RULES_V5,
  };

  before(async () => {
    // Clean up any existing test data (including from other tests)
    await prisma.policyVersion.deleteMany({
      where: {
        policyVersion: {
          in: ["test-rollback-policy-v1", "test-rollback-policy-v2"],
        },
      },
    });
  });

  after(async () => {
    // Clean up test data and rollback any promoted policies
    await prisma.policyVersion.deleteMany({
      where: {
        policyVersion: {
          in: ["test-rollback-policy-v1", "test-rollback-policy-v2"],
        },
      },
    });
    await prisma.policyVersion.updateMany({
      where: { status: "PROMOTED", policyVersion: { startsWith: "test-" } },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });
    await prisma.$disconnect();
  });

  it("restores baseline after rollback", async () => {
    // Roll back any existing promoted policies from other tests
    await prisma.policyVersion.updateMany({
      where: { status: "PROMOTED" },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });

    // Create a passing safety eval
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: "test-rollback-policy-v1",
      artifactRef: "s3://test/rollback-model.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: true },
    });

    // Create and promote a policy
    await prisma.policyVersion.create({
      data: {
        policyVersion: "test-rollback-policy-v1",
        status: "PROMOTED",
        artifactRef: "s3://test/rollback-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    // Verify policy is promoted
    const promotedPolicy = await prisma.policyVersion.findFirst({
      where: { status: "PROMOTED" },
      orderBy: { promotedAt: "desc" },
    });

    assert.equal(promotedPolicy?.policyVersion, "test-rollback-policy-v1", "Should find promoted policy");

    // Verify it would be considered in inference
    const beforeRollback = await policyEngine.inferDecision({
      studentId: "test_rollback_student",
      sessionId: "test_rollback_session",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(beforeRollback.choiceRecord.policyVersion, "test-rollback-policy-v1");

    // Rollback the policy
    await policyEngine.rollbackPolicy({
      policyVersion: "test-rollback-policy-v1",
      reason: "Test rollback scenario",
      requestedBy: "test_operator",
    });

    // Verify policy status changed
    const rolledBackPolicy = await prisma.policyVersion.findUnique({
      where: { policyVersion: "test-rollback-policy-v1" },
    });

    assert.equal(rolledBackPolicy?.status, "ROLLED_BACK");
    assert.ok(rolledBackPolicy?.rolledBackAt, "Should have rolledBackAt timestamp");

    // Verify inference now uses baseline
    const afterRollback = await policyEngine.inferDecision({
      studentId: "test_rollback_student",
      sessionId: "test_rollback_session_2",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(afterRollback.decision, baselineDecision, "Should return baseline decision");
    assert.equal(afterRollback.choiceRecord.selected, "baseline", "Should select baseline");
    assert.equal(afterRollback.choiceRecord.policyVersion, POLICY_RULES_V5, "Should use baseline version");
    assert.equal(afterRollback.choiceRecord.shadow, false, "Should not be shadow mode");
  });

  it("can promote a new policy after rollback", async () => {
    // Create new policy version after rollback
    const evalResult2 = await safetyEval.evaluatePolicy({
      policyVersion: "test-rollback-policy-v2",
      artifactRef: "s3://test/rollback-model-v2.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult2.evalId },
      data: { passed: true },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: "test-rollback-policy-v2",
        status: "CANDIDATE",
        artifactRef: "s3://test/rollback-model-v2.bin",
        safetyEvalId: evalResult2.evalId,
      },
    });

    // Promote the new policy
    await policyEngine.promotePolicy({
      policyVersion: "test-rollback-policy-v2",
      safetyEvalId: evalResult2.evalId,
      requestedBy: "test_operator",
    });

    // Verify new policy is used
    const result = await policyEngine.inferDecision({
      studentId: "test_new_student",
      sessionId: "test_new_session",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.choiceRecord.policyVersion, "test-rollback-policy-v2");

    // Clean up
    await prisma.policyVersion.deleteMany({ where: { policyVersion: "test-rollback-policy-v2" } });
  });
});
