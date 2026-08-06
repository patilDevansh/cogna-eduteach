import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PolicyEngineService } from "../../src/engines/policy-engine/policy-engine.service";
import { SafetyEvalService } from "../../src/engines/safety-eval/safety-eval.service";
import { POLICY_RULES_V5 } from "@cogna/shared";
import type { LearningDecision } from "@cogna/shared";
import {
  acquirePolicySuiteLock,
  releasePolicySuiteLock,
  rollbackAllPromotedPolicies,
} from "./helpers/policy-suite-lock";

/**
 * A10 — Rollback restores baseline (MVP 5.0)
 *
 * When a promoted policy is rolled back, the system should:
 * - Mark the policy as ROLLED_BACK
 * - Use baseline decisions for all subsequent inference calls
 */
describe("A10 — Rollback restores baseline", { concurrency: false }, () => {
  const prisma = new PrismaClient();
  const policyEngine = new PolicyEngineService(prisma);
  const safetyEval = new SafetyEvalService(prisma);

  const TEST_NAMESPACE = "a10-rollback";
  const POLICY_V1 = `${TEST_NAMESPACE}-policy-v1`;
  const POLICY_V2 = `${TEST_NAMESPACE}-policy-v2`;

  const baselineDecision: LearningDecision = {
    uiAction: "SHOW_QUESTION",
    learningIntent: "STANDARD_PRACTICE",
    parameters: { conceptId: "C2_ONE_STEP_SUBTRACTION" },
    confidence: 0.9,
    reasoning: "Baseline decision",
    decisionVersion: POLICY_RULES_V5,
  };

  before(async () => {
    await acquirePolicySuiteLock();
    await rollbackAllPromotedPolicies(prisma);
    await prisma.policyVersion.deleteMany({
      where: { policyVersion: { startsWith: TEST_NAMESPACE } },
    });
  });

  after(async () => {
    await prisma.policyVersion.deleteMany({
      where: { policyVersion: { startsWith: TEST_NAMESPACE } },
    });
    await rollbackAllPromotedPolicies(prisma);
    releasePolicySuiteLock();
    await prisma.$disconnect();
  });

  it("restores baseline after rollback", async () => {
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_V1,
      artifactRef: "s3://test/rollback-model.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: true },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: POLICY_V1,
        status: "PROMOTED",
        artifactRef: "s3://test/rollback-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    const promotedPolicy = await prisma.policyVersion.findFirst({
      where: { status: "PROMOTED" },
      orderBy: { promotedAt: "desc" },
    });

    assert.equal(promotedPolicy?.policyVersion, POLICY_V1, "Should find promoted policy");

    const beforeRollback = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-student`,
      sessionId: `${TEST_NAMESPACE}-session`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(beforeRollback.choiceRecord.policyVersion, POLICY_V1);

    await policyEngine.rollbackPolicy({
      policyVersion: POLICY_V1,
      reason: "Test rollback scenario",
      requestedBy: "test_operator",
    });

    const rolledBackPolicy = await prisma.policyVersion.findUnique({
      where: { policyVersion: POLICY_V1 },
    });

    assert.equal(rolledBackPolicy?.status, "ROLLED_BACK");
    assert.ok(rolledBackPolicy?.rolledBackAt, "Should have rolledBackAt timestamp");

    const afterRollback = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-student`,
      sessionId: `${TEST_NAMESPACE}-session-2`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(afterRollback.decision, baselineDecision, "Should return baseline decision");
    assert.equal(afterRollback.choiceRecord.selected, "baseline", "Should select baseline");
    assert.equal(afterRollback.choiceRecord.policyVersion, POLICY_RULES_V5, "Should use baseline version");
    assert.equal(afterRollback.choiceRecord.shadow, false, "Should not be shadow mode");
  });

  it("can promote a new policy after rollback", async () => {
    const evalResult2 = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_V2,
      artifactRef: "s3://test/rollback-model-v2.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult2.evalId },
      data: { passed: true },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: POLICY_V2,
        status: "CANDIDATE",
        artifactRef: "s3://test/rollback-model-v2.bin",
        safetyEvalId: evalResult2.evalId,
      },
    });

    await policyEngine.promotePolicy({
      policyVersion: POLICY_V2,
      safetyEvalId: evalResult2.evalId,
      requestedBy: "test_operator",
    });

    const result = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-new-student`,
      sessionId: `${TEST_NAMESPACE}-new-session`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.choiceRecord.policyVersion, POLICY_V2);

    await policyEngine.rollbackPolicy({
      policyVersion: POLICY_V2,
      reason: "Test cleanup",
      requestedBy: "test_operator",
    });
  });
});
