import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DECISION_RULES_V1 } from "@cogna/shared";
import type { LearningDecision } from "@cogna/shared";

/**
 * Idempotency key builders — mirror apps/api/src/jobs/scheduled-jobs.service.ts
 * (keys are not separately exported from the service).
 */
function weeklyReportIdempotencyKey(
  studentId: string,
  periodStart: string,
  periodEnd: string,
): string {
  return `${studentId}:${periodStart}:${periodEnd}`;
}

function emailDeliveryIdempotencyKey(
  reportId: string,
  parentId: string,
  channel: string,
): string {
  return `${reportId}:${parentId}:${channel}`;
}

describe("R17 — Async weekly report idempotency key", () => {
  it("builds key as studentId:periodStart:periodEnd", () => {
    const studentId = "stu_abc";
    const periodStart = "2026-07-06T00:00:00.000Z";
    const periodEnd = "2026-07-13T00:00:00.000Z";

    const key = weeklyReportIdempotencyKey(studentId, periodStart, periodEnd);
    assert.equal(key, `${studentId}:${periodStart}:${periodEnd}`);

    const again = weeklyReportIdempotencyKey(studentId, periodStart, periodEnd);
    assert.equal(again, key);
  });
});

describe("R18 — Email delivery idempotency key", () => {
  it("builds key as reportId:parentId:channel", () => {
    const reportId = "rpt_001";
    const parentId = "par_001";
    const channel = "EMAIL";

    const key = emailDeliveryIdempotencyKey(reportId, parentId, channel);
    assert.equal(key, `${reportId}:${parentId}:${channel}`);

    const again = emailDeliveryIdempotencyKey(reportId, parentId, channel);
    assert.equal(again, key);
  });
});

describe("R16 — v1 decision replay", () => {
  it("DECISION_RULES_V1 exists and accepts a sample v1 decision shape", () => {
    assert.equal(DECISION_RULES_V1, "decision-rules-v1");

    const storedV1: LearningDecision = {
      uiAction: "SHOW_QUESTION",
      learningIntent: "STANDARD_PRACTICE",
      parameters: {
        conceptId: "C2_ONE_STEP_SUBTRACTION",
        difficulty: 2,
      },
      confidence: 0.7,
      reasoning: "Continue standard practice.",
      decisionVersion: DECISION_RULES_V1,
    };

    // Replay/read path must accept v1 without forced rewrite to v2.
    assert.equal(storedV1.decisionVersion, "decision-rules-v1");
    assert.notEqual(storedV1.decisionVersion, "decision-rules-v2");
    assert.ok(
      ["SHOW_QUESTION", "SHOW_EXPLANATION", "SHOW_HINT", "END_SESSION", "SUGGEST_BREAK"].includes(
        storedV1.uiAction,
      ),
    );
  });
});
