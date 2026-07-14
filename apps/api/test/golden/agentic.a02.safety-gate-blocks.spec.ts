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
    await prisma.policyVersion.deleteMany({ where: { policyVersion: "test-unsafe-policy-v1" } });
    await prisma.$disconnect();
  });

  it("rejects policy with failed safety eval", async () => {
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

    // Create policy version with failed eval
    await prisma.policyVersion.create({
      data: {
        policyVersion: "test-unsafe-policy-v1",
        status: "CANDIDATE",
        artifactRef: "s3://test/unsafe-model.bin",
        safetyEvalId: evalResult.evalId,
      },
    });

    // Try to use this policy - should fall back to baseline
    const result = await policyEngine.inferDecision({
      studentId: "test_student",
      sessionId: "test_session",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision);
    assert.equal(result.choiceRecord.selected, "baseline");
    assert.equal(result.choiceRecord.safetyGatePassed, false);
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
