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
 * A02 — Safety gate blocks unsafe policy (MVP 5.0)
 *
 * A learned policy may only apply if its safety eval passes.
 * If safetyEval.passed = false, the system MUST use baseline only.
 */
describe("A02 — Safety gate blocks unsafe policy", { concurrency: false }, () => {
  const prisma = new PrismaClient();
  const policyEngine = new PolicyEngineService(prisma);
  const safetyEval = new SafetyEvalService(prisma);

  const TEST_NAMESPACE = "a02-safety-gate";
  const POLICY_ID = `${TEST_NAMESPACE}-unsafe-v1`;

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

  it("rejects policy with failed safety eval", async () => {
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_ID,
      artifactRef: "s3://test/unsafe-model.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: false },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: POLICY_ID,
        status: "PROMOTED",
        artifactRef: "s3://test/unsafe-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    const verifyPolicy = await prisma.policyVersion.findUnique({
      where: { policyVersion: POLICY_ID },
      include: { safetyEval: true },
    });

    assert.ok(verifyPolicy, "Policy should exist");
    assert.equal(verifyPolicy.status, "PROMOTED", "Policy should be promoted");
    assert.ok(verifyPolicy.safetyEval, "Policy should have safety eval");
    assert.equal(
      verifyPolicy.safetyEval.passed,
      false,
      "Safety eval should have passed=false",
    );

    const result = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-student`,
      sessionId: `${TEST_NAMESPACE}-session`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision);
    assert.equal(result.choiceRecord.selected, "baseline");
    assert.equal(
      result.choiceRecord.safetyGatePassed,
      false,
      "Safety gate should fail for policy with passed=false",
    );
    assert.equal(result.choiceRecord.policyVersion, POLICY_ID);
  });

  it("uses baseline when no PROMOTED policy exists", async () => {
    await rollbackAllPromotedPolicies(prisma);

    const result = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-student-2`,
      sessionId: `${TEST_NAMESPACE}-session-2`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision);
    assert.equal(result.choiceRecord.selected, "baseline");
    assert.equal(result.choiceRecord.policyVersion, POLICY_RULES_V5);
  });
});
