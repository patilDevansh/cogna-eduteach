import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@cogna/database";
import { PolicyEngineService } from "../../src/engines/policy-engine/policy-engine.service";
import { SafetyEvalService } from "../../src/engines/safety-eval/safety-eval.service";
import {
  acquirePolicySuiteLock,
  releasePolicySuiteLock,
  rollbackAllPromotedPolicies,
} from "./helpers/policy-suite-lock";

/**
 * A09 — Promote requires dual control (MVP 5.0)
 * 
 * Policy promotion requires two distinct actors:
 * 1. Policy engineer requests promotion
 * 2. Policy approver (different person) approves
 * 
 * Single actor cannot complete both steps.
 */
describe("A09 — Promote requires dual control", () => {
  const prisma = new PrismaClient();
  const policyEngine = new PolicyEngineService(prisma);
  const safetyEval = new SafetyEvalService(prisma);

  const TEST_NAMESPACE = "a09-dual-control";
  const POLICY_V1 = `${TEST_NAMESPACE}-policy-v1`;
  const POLICY_V2 = `${TEST_NAMESPACE}-policy-v2`;
  const ENGINEER = "policy-engineer-alice";
  const APPROVER = "policy-approver-bob";

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

  it("rejects promotion when approver is same as requester", async () => {
    await prisma.policyVersion.deleteMany({
      where: { policyVersion: POLICY_V1 },
    });

    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_V1,
      artifactRef: "s3://test/dual-control-model.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: true },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: POLICY_V1,
        status: "CANDIDATE",
        artifactRef: "s3://test/dual-control-model.bin",
        safetyEvalId: evalResult.evalId,
      },
    });

    await policyEngine.requestPromotion({
      policyVersion: POLICY_V1,
      safetyEvalId: evalResult.evalId,
      requestedBy: ENGINEER,
    });

    const requested = await prisma.policyVersion.findUnique({
      where: { policyVersion: POLICY_V1 },
    });

    assert.equal(requested?.status, "PROMOTION_REQUESTED");
    assert.equal(requested?.promotionRequestedBy, ENGINEER);

    await assert.rejects(
      async () => {
        await policyEngine.approvePromotion({
          policyVersion: POLICY_V1,
          approvedBy: ENGINEER,
        });
      },
      {
        message: /approver must be different from requester/,
      },
      "Should reject when approver is same as requester"
    );

    await prisma.policyVersion.delete({ where: { policyVersion: POLICY_V1 } });
  });

  it("allows promotion when approver is different from requester", async () => {
    await prisma.policyVersion.deleteMany({
      where: { policyVersion: POLICY_V2 },
    });

    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: POLICY_V2,
      artifactRef: "s3://test/dual-control-model-v2.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: true },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: POLICY_V2,
        status: "CANDIDATE",
        artifactRef: "s3://test/dual-control-model-v2.bin",
        safetyEvalId: evalResult.evalId,
      },
    });

    await policyEngine.requestPromotion({
      policyVersion: POLICY_V2,
      safetyEvalId: evalResult.evalId,
      requestedBy: ENGINEER,
    });

    const requested = await prisma.policyVersion.findUnique({
      where: { policyVersion: POLICY_V2 },
    });

    assert.equal(requested?.status, "PROMOTION_REQUESTED");
    assert.equal(requested?.promotionRequestedBy, ENGINEER);

    await policyEngine.approvePromotion({
      policyVersion: POLICY_V2,
      approvedBy: APPROVER,
    });

    const promoted = await prisma.policyVersion.findUnique({
      where: { policyVersion: POLICY_V2 },
    });

    assert.equal(promoted?.status, "PROMOTED");
    assert.equal(promoted?.promotionRequestedBy, ENGINEER);
    assert.equal(promoted?.promotionApprovedBy, APPROVER);
    assert.ok(promoted?.promotedAt, "Should have promotedAt timestamp");
    assert.ok(promoted?.promotionApprovedAt, "Should have promotionApprovedAt timestamp");

    await prisma.policyVersion.update({
      where: { policyVersion: POLICY_V2 },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });
  });

  it("allows rejection of promotion request", async () => {
    const policyV3 = `${TEST_NAMESPACE}-policy-v3`;

    await prisma.policyVersion.deleteMany({
      where: { policyVersion: policyV3 },
    });

    const evalResult = await safetyEval.evaluatePolicy({
      policyVersion: policyV3,
      artifactRef: "s3://test/dual-control-model-v3.bin",
      evaluationSetRef: "s3://test/eval-set.json",
    });

    await prisma.safetyEval.update({
      where: { id: evalResult.evalId },
      data: { passed: true },
    });

    await prisma.policyVersion.create({
      data: {
        policyVersion: policyV3,
        status: "CANDIDATE",
        artifactRef: "s3://test/dual-control-model-v3.bin",
        safetyEvalId: evalResult.evalId,
      },
    });

    await policyEngine.requestPromotion({
      policyVersion: policyV3,
      safetyEvalId: evalResult.evalId,
      requestedBy: ENGINEER,
    });

    await policyEngine.rejectPromotion({
      policyVersion: policyV3,
      rejectedBy: APPROVER,
      reason: "Safety metrics borderline; need more shadow data",
    });

    const rejected = await prisma.policyVersion.findUnique({
      where: { policyVersion: policyV3 },
    });

    assert.equal(rejected?.status, "REJECTED");
    assert.equal(rejected?.promotionRejectedBy, APPROVER);
    assert.equal(rejected?.promotionRejectedReason, "Safety metrics borderline; need more shadow data");
  });
});
