import assert from "node:assert/strict";
import test from "node:test";
import type { LotusQuestionAudit } from "@cogna/shared";
import { recordedUncertainty, relatedEvidence, reconstructedAssessments } from "../src/lib/lotus-related-evidence";

function audit(skill: string, uncertainty: string[] = []): LotusQuestionAudit {
  return {
    question: { id: skill }, response: { answer: "answer" },
    verification: null, skillEvidence: [{ skillId: skill, kind: "MISTAKE", source: "INSTANT" }],
    conclusion: { uncertainty }, analysisStatus: "COMPLETE", analysisSource: "AI_REVIEW",
  } as unknown as LotusQuestionAudit;
}

test("timeline uses same recorded skill and excludes later or unrelated turns", () => {
  const turns = [audit("opening"), audit("grouping"), audit("other"), audit("grouping"), audit("grouping")];
  turns[0]!.response = null;
  assert.deepEqual(relatedEvidence(turns, 3).map((x) => x.questionNumber), [1, 3]);
});

test("uncertainty reflects saved interpretation and pending state, without a fabricated single-response claim", () => {
  const current = audit("grouping", ["A second error supports concern."]);
  assert.equal(recordedUncertainty(current, []), "A second error supports concern.");
  current.analysisStatus = "PENDING";
  assert.match(recordedUncertainty(current, []), /still running/);
  current.analysisStatus = "COMPLETE";
  current.conclusion.uncertainty = [];
  assert.equal(recordedUncertainty(current, []), "No specific uncertainty was recorded for this response.");
});

test("assessment is shown only when an observer reconstruction is provided", () => {
  const turn = audit("grouping");
  assert.deepEqual(reconstructedAssessments(turn), []);
  const projected = Object.assign(turn, { skillAssessment: { basis: "RECONSTRUCTED_FROM_CURRENT_RECORD", entries: [{ skillId: "grouping", previousState: "SUSPECTED", state: "SUSPECTED", notes: ["simpler check passed"], needsComparableCheck: true }] } });
  assert.equal(reconstructedAssessments(projected)[0]?.needsComparableCheck, true);
});
