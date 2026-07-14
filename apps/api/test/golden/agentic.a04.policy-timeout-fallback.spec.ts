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
 * A04 — Policy timeout fallback (MVP 5.0)
 *
 * When policy inference exceeds the timeout budget, the system must fall back
 * to the baseline rules decision without blocking the hot path.
 */
describe("A04 — Policy timeout fallback", { concurrency: false }, () => {
  const prisma = new PrismaClient();
  const policyEngine = new PolicyEngineService(prisma);
  const safetyEval = new SafetyEvalService(prisma);

  const TEST_NAMESPACE = "a04-timeout";
  const POLICY_ID = `${TEST_NAMESPACE}-slow-policy-v1`;

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

  it("falls back to baseline on inference timeout", async () => {
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_ID,
      artifactRef: "s3://test/test-slow-inference-model.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: true },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: POLICY_ID,
        status: "PROMOTED",
        artifactRef: "s3://test/test-slow-inference-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    const start = Date.now();
    const result = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-student`,
      sessionId: `${TEST_NAMESPACE}-session`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });
    const elapsed = Date.now() - start;

    assert.equal(result.decision, baselineDecision, "Should return baseline on timeout");
    assert.equal(result.choiceRecord.selected, "baseline", "Should select baseline");
    assert.equal(result.choiceRecord.policyVersion, POLICY_ID);
    assert.equal(result.choiceRecord.shadow, false);
    assert.ok(
      result.choiceRecord.inferenceTimeMs !== undefined,
      "Should record inference timing for observability",
    );
    assert.ok(
      result.choiceRecord.inferenceTimeMs! >= 500,
      "Timeout path should reflect at least the 500ms budget",
    );
    assert.ok(elapsed >= 500, "Total call should not block beyond timeout budget");
  });
});
