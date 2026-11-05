import { test } from "node:test";
import { strict as assert } from "node:assert";
import { confidenceForPrompt, evidenceLogForPrompt } from "../../src/lotus/lotus-prompts";
import type { LotusQuestionAudit, LotusStudentResponse } from "@cogna/shared";

function response(status?: "REPORTED_BEFORE_ANSWER" | "NOT_ASKED" | "SKIPPED"): LotusStudentResponse {
  return { answer: "x", working: "", confidence: 60, responseTimeMs: 1000, didNotKnow: false,
    ...(status ? { interactionContext: { confidence: { status, value: status === "REPORTED_BEFORE_ANSWER" ? 60 : null } } as LotusStudentResponse["interactionContext"] } : {}) };
}
test("prompt confidence excludes skipped, unasked and unverified legacy defaults", () => {
  assert.equal(confidenceForPrompt(response("SKIPPED")), null);
  assert.equal(confidenceForPrompt(response("NOT_ASKED")), null);
  assert.equal(confidenceForPrompt(response()), null);
  assert.equal(confidenceForPrompt(response("REPORTED_BEFORE_ANSWER")), 60);
  const split = response("NOT_ASKED");
  split.gameReading = { kind: "SPLIT_CONFIDENCE" } as LotusStudentResponse["gameReading"];
  assert.equal(confidenceForPrompt(split), 60);
});
test("prior evidence to the model sanitizes a numeric skipped default", () => {
  const audit = { question: {}, response: response("SKIPPED"), verification: {} } as LotusQuestionAudit;
  assert.equal(JSON.parse(evidenceLogForPrompt([audit])).response.confidence, null);
});
