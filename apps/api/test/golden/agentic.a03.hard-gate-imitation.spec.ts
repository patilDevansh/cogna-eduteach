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
 * A03 — Hard gate imitation (MVP 5.0)
 *
 * When baseline says END_SESSION or SUGGEST_BREAK, the learned policy stub
 * must imitate the hard gate — never override with a softer action.
 */
describe("A03 — Hard gate imitation", { concurrency: false }, () => {
  const prisma = new PrismaClient();
  const policyEngine = new PolicyEngineService(prisma);
  const safetyEval = new SafetyEvalService(prisma);

  const TEST_NAMESPACE = "a03-hard-gate";
  const POLICY_ID = `${TEST_NAMESPACE}-policy-v1`;

  const endSessionBaseline: LearningDecision = {
    uiAction: "END_SESSION",
    learningIntent: "STANDARD_PRACTICE",
    parameters: {},
    confidence: 1.0,
    reasoning: "Session limit reached",
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

  it("learned policy imitates END_SESSION hard gate", async () => {
    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_ID,
      artifactRef: "s3://test/test-different-intent-model.bin",
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
        artifactRef: "s3://test/test-different-intent-model.bin",
        safetyEvalId: evalResult.evalId,
        promotedAt: new Date(),
      },
    });

    const result = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-student`,
      sessionId: `${TEST_NAMESPACE}-session`,
      baselineDecision: endSessionBaseline,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision.uiAction, "END_SESSION");
    assert.equal(result.choiceRecord.selected, "baseline");
    assert.ok(result.choiceRecord.learnedDecision, "Should log learned decision");
    assert.equal(
      result.choiceRecord.learnedDecision?.uiAction,
      "END_SESSION",
      "Learned policy must imitate END_SESSION hard gate",
    );
    assert.notEqual(
      result.choiceRecord.learnedDecision?.learningIntent,
      "CONCEPT_REINFORCEMENT",
      "Learned policy must not soften END_SESSION into practice",
    );
  });

  it("learned policy imitates SUGGEST_BREAK hard gate", async () => {
    const suggestBreakBaseline: LearningDecision = {
      uiAction: "SUGGEST_BREAK",
      learningIntent: "BREAK_FOR_FATIGUE",
      parameters: {},
      confidence: 0.95,
      reasoning: "Extended session detected",
      decisionVersion: POLICY_RULES_V5,
    };

    const result = await policyEngine.inferDecision({
      studentId: `${TEST_NAMESPACE}-student-2`,
      sessionId: `${TEST_NAMESPACE}-session-2`,
      baselineDecision: suggestBreakBaseline,
      featureVector: { mastery: 0.5 },
    });

    assert.equal(result.decision.uiAction, "SUGGEST_BREAK");
    assert.equal(result.choiceRecord.learnedDecision?.uiAction, "SUGGEST_BREAK");
  });
});
