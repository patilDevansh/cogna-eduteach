import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containsForbiddenTerm,
  toStudentSafeText,
  assertLearningDecisionShape,
} from "@cogna/shared";

describe("voice forbidden terms", () => {
  it("flags mastery / diagnosis / concept ids", () => {
    assert.equal(containsForbiddenTerm("Your mastery is low"), true);
    assert.equal(containsForbiddenTerm("we diagnosed a pattern"), true);
    assert.equal(containsForbiddenTerm("C2_ONE_STEP_SUBTRACTION"), true);
    assert.equal(containsForbiddenTerm("Let's look at this together"), false);
  });

  it("toStudentSafeText replaces forbidden copy", () => {
    const safe = toStudentSafeText("your mastery is weak");
    assert.equal(containsForbiddenTerm(String(safe)), false);
  });
});

describe("payload shapes", () => {
  it("accepts valid LearningDecision", () => {
    const d = assertLearningDecisionShape({
      uiAction: "SHOW_QUESTION",
      learningIntent: "SAME_DIFFICULTY",
      contentStyle: { questionFormat: "numeric" },
      parameters: { conceptId: "C1_ONE_STEP_ADDITION" },
      decisionVersion: "decision-rules-v2",
    });
    assert.equal(d.uiAction, "SHOW_QUESTION");
  });

  it("rejects legacy flat action", () => {
    assert.throws(() =>
      assertLearningDecisionShape({
        uiAction: "EASIER_QUESTION",
        learningIntent: "X",
        contentStyle: {},
      }),
    );
  });
});
