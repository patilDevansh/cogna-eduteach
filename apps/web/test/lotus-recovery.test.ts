import { it } from "node:test";
import assert from "node:assert/strict";
import { lotusRecoveryProblem } from "../src/lib/lotus-recovery";

function cache() {
  return {
    session: { studentId: "demo_a", currentQuestion: { id: "q2" }, audits: [] },
    answer: "1", workingLines: [""], startedAt: Date.now(), confidence: null,
    pending: { submissionId: "s2", questionId: "q2", answer: "1", working: "", responseTimeMs: 1000, didNotKnow: false },
  } as unknown as Parameters<typeof lotusRecoveryProblem>[0];
}

it("restores observer answers without optional interaction observation", () => {
  assert.equal(lotusRecoveryProblem(cache(), "demo_a"), null);
});
it("allows an already saved pending answer when the current question advanced", () => {
  const value = cache();
  value.pending!.questionId = "q1";
  value.session.audits = [{ question: { id: "q1" }, response: { submissionId: "s2" } }] as typeof value.session.audits;
  assert.equal(lotusRecoveryProblem(value, "demo_a"), null);
});
it("rejects another question, another student and malformed supplied observation", () => {
  const value = cache();
  value.pending!.questionId = "unknown";
  assert.match(lotusRecoveryProblem(value, "demo_a")!, /does not match/);
  assert.match(lotusRecoveryProblem(cache(), "other")!, /different student/);
  const broken = cache();
  broken.pending!.interactionContext = {} as never;
  assert.match(lotusRecoveryProblem(broken, "demo_a")!, /interaction context/);
});
