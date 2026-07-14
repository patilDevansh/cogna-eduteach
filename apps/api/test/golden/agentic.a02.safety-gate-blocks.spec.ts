import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PolicyEngineService } from "../../src/engines/policy-engine/policy-engine.service";
import { SafetyEvalService } from "../../src/engines/safety-eval/safety-eval.service";
import { POLICY_RULES_V5 } from "@cogna/shared";
import type { LearningDecision } from "@cogna/shared";

/**
 * A02 — Safety gate blocks unsafe policy (MVP 5.0)
 * 
 * A learned policy may only apply if its safety eval passes.
 * If safetyEval.passed = false, the system MUST use baseline only.
 */
describe("A02 — Safety gate blocks unsafe policy", () => {
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
    // Clean up any existing test data
    await prisma.policyVersion.deleteMany({ where: { policyVersion: "test-unsafe-policy-v1" } });
  });

  after(async () => {
    // Clean up test data and rollback any promoted policies
    await prisma.policyVersion.deleteMany({ where: { policyVersion: "test-unsafe-policy-v1" } });
    await prisma.policyVersion.updateMany({
      where: { status: "PROMOTED", policyVersion: { startsWith: "test-" } },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });
    await prisma.$disconnect();
  });

  it("rejects policy with failed safety eval", async () => {
    // Roll back any existing promoted policies to ensure clean state
    await prisma.policyVersion.updateMany({
      where: { status: "PROMOTED" },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });

    // Create a safety eval that FAILS
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: "test-unsafe-policy-v1",
      artifactRef: "s3://test/unsafe-model.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    // Force it to fail for this test
    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: false },
    });

    // Create policy version with failed eval and PROMOTE it (to test runtime safety gate)
    // In production, promotePolicy would check the safety eval, but here we force-promote
    // to test that the runtime check in inferDecision catches the failed safety gate
    await prisma.policyVersion.create({
      data: {
        policyVersion: "test-unsafe-policy-v1",
        status: "PROMOTED",
        artifactRef: "s3://test/unsafe-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    // Verify the policy exists and has the failed safety eval
    const verifyPolicy = await prisma.policyVersion.findUnique({
      where: { policyVersion: "test-unsafe-policy-v1" },
      include: { safetyEval: true },
    });

    assert.ok(verifyPolicy, "Policy should exist");
    assert.equal(verifyPolicy.status, "PROMOTED", "Policy should be promoted");
    assert.ok(verifyPolicy.safetyEval, "Policy should have safety eval");
    assert.equal(verifyPolicy.safetyEval.passed, false, "Safety eval should have passed=false");

    // Try to use this policy - should fall back to baseline due to failed safety gate
    const result = await policyEngine.inferDecision({
      studentId: "test_student",
      sessionId: "test_session",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision);
    assert.equal(result.choiceRecord.selected, "baseline");
    assert.equal(result.choiceRecord.safetyGatePassed, false, "Safety gate should fail for policy with passed=false");
  });

  it("uses baseline when no PROMOTED policy exists", async () => {
    const result = await policyEngine.inferDecision({
      studentId: "test_student",
      sessionId: "test_session",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision);
    assert.equal(result.choiceRecord.selected, "baseline");
  });
});
