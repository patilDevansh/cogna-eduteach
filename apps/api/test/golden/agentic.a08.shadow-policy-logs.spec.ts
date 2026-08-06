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
 * A08 — Shadow policy logs PolicyChoiceRecord (MVP 5.0)
 *
 * When a learned policy runs in shadow mode, the system should:
 * - Use baseline for the actual decision
 * - Log the learned decision that would have been used
 * - Mark shadow=true in the choice record
 */
describe("A08 — Shadow policy logs PolicyChoiceRecord", { concurrency: false }, () => {
  const prisma = new PrismaClient();
  const policyEngine = new PolicyEngineService(prisma);
  const safetyEval = new SafetyEvalService(prisma);

  const TEST_NAMESPACE = "a08-shadow";
  const POLICY_ID = `${TEST_NAMESPACE}-policy-v1`;
  const SHADOW_STUDENT = `${TEST_NAMESPACE}-shadow-student`;

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
    await prisma.experimentAssignment.deleteMany({
      where: { studentId: { startsWith: TEST_NAMESPACE } },
    });
  });

  after(async () => {
    await prisma.policyVersion.deleteMany({
      where: { policyVersion: { startsWith: TEST_NAMESPACE } },
    });
    await prisma.experimentAssignment.deleteMany({
      where: { studentId: { startsWith: TEST_NAMESPACE } },
    });
    await rollbackAllPromotedPolicies(prisma);
    releasePolicySuiteLock();
    await prisma.$disconnect();
  });

  it("logs shadow mode with learned decision", async () => {
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_ID,
      artifactRef: "s3://test/shadow-model.bin",
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
        artifactRef: "s3://test/shadow-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    await prisma.experimentAssignment.create({
      data: {
        id: `${TEST_NAMESPACE}-assignment`,
        studentId: SHADOW_STUDENT,
        experimentKey: "learned-policy-v1",
        arm: "shadow",
        assignedAt: new Date(),
      },
    });

    const result = await policyEngine.inferDecision({
      studentId: SHADOW_STUDENT,
      sessionId: `${TEST_NAMESPACE}-session`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision, "Should return baseline decision");
    assert.equal(result.choiceRecord.selected, "baseline", "Should select baseline");
    assert.equal(result.choiceRecord.shadow, true, "Should mark as shadow mode");
    assert.equal(result.choiceRecord.safetyGatePassed, true, "Safety gate should pass");
    assert.ok(result.choiceRecord.learnedDecision, "Should log learned decision for analysis");
    assert.equal(result.choiceRecord.policyVersion, POLICY_ID, "Should log policy version");
  });

  it("uses baseline (not shadow) when student not in experiment", async () => {
    const result = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-control-student`,
      sessionId: `${TEST_NAMESPACE}-control-session`,
      baselineDecision,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision, baselineDecision);
    assert.equal(result.choiceRecord.selected, "baseline");
    assert.equal(result.choiceRecord.shadow, false, "Should not be shadow mode");
  });
});
