import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PolicyEngineService } from "../../src/engines/policy-engine/policy-engine.service";
import { SafetyEvalService } from "../../src/engines/safety-eval/safety-eval.service";
import { POLICY_RULES_V5 } from "@cogna/shared";
import type { LearningDecision } from "@cogna/shared";

/**
 * A08 — Shadow policy logs PolicyChoiceRecord (MVP 5.0)
 * 
 * When a learned policy runs in shadow mode, the system should:
 * - Use baseline for the actual decision
 * - Log the learned decision that would have been used
 * - Mark shadow=true in the choice record
 * 
 * This allows offline analysis of learned policy without affecting students.
 */
describe("A08 — Shadow policy logs PolicyChoiceRecord", () => {
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
    await prisma.policyVersion.deleteMany({ where: { policyVersion: "test-shadow-policy-v1" } });
    await prisma.experimentAssignment.deleteMany({ where: { studentId: "test_shadow_student" } });
  });

  after(async () => {
    // Clean up test data and rollback any promoted policies
    await prisma.policyVersion.deleteMany({ where: { policyVersion: "test-shadow-policy-v1" } });
    await prisma.experimentAssignment.deleteMany({ where: { studentId: "test_shadow_student" } });
    await prisma.policyVersion.updateMany({
      where: { status: "PROMOTED", policyVersion: { startsWith: "test-" } },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });
    await prisma.$disconnect();
  });

  it("logs shadow mode with learned decision", async () => {
    // Roll back any existing promoted policies from other tests to ensure clean state
    await prisma.policyVersion.updateMany({
      where: { status: "PROMOTED" },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });

    // Create a passing safety eval
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: "test-shadow-policy-v1",
      artifactRef: "s3://test/shadow-model.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    // Mark it as passed
    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: true },
    });

    // Create and promote a policy version
    await prisma.policyVersion.create({
      data: {
        policyVersion: "test-shadow-policy-v1",
        status: "PROMOTED",
        artifactRef: "s3://test/shadow-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    // Assign student to shadow experiment arm
    await prisma.experimentAssignment.create({
      data: {
        id: "test_shadow_assignment",
        studentId: "test_shadow_student",
        experimentKey: "learned-policy-v1",
        arm: "shadow",
        assignedAt: new Date(),
      },
    });

    // Call inference for a student in shadow mode
    const result = await policyEngine.inferDecision({
      studentId: "test_shadow_student",
      sessionId: "test_shadow_session",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    // Verify shadow mode behavior
    assert.equal(result.decision, baselineDecision, "Should return baseline decision");
    assert.equal(result.choiceRecord.selected, "baseline", "Should select baseline");
    assert.equal(result.choiceRecord.shadow, true, "Should mark as shadow mode");
    assert.equal(result.choiceRecord.safetyGatePassed, true, "Safety gate should pass");
    assert.ok(result.choiceRecord.learnedDecision, "Should log learned decision for analysis");
    assert.equal(result.choiceRecord.policyVersion, "test-shadow-policy-v1", "Should log policy version");
  });

  it("uses baseline (not shadow) when student not in experiment", async () => {
    const result = await policyEngine.inferDecision({
      studentId: "test_control_student",
      sessionId: "test_control_session",
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision);
    assert.equal(result.choiceRecord.selected, "baseline");
    assert.equal(result.choiceRecord.shadow, false, "Should not be shadow mode");
  });
});
