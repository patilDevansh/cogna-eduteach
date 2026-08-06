import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidPermutation,
  topChoiceAgrees,
  buildPracticeRecommenderPrompts,
} from "../../src/engines/practice-recommender/practice-recommender.formulas";
import { assertPracticeRecommendationShape } from "@cogna/shared";
import type { RevisionProposal } from "../../src/revision/revision.service";

function proposal(overrides: Partial<RevisionProposal> = {}): RevisionProposal {
  return {
    conceptId: "C5_TWO_STEP_EQUATIONS",
    type: "REINFORCEMENT",
    priority: 0.5,
    dueAt: new Date(),
    questionCount: 3,
    reasoning: "Mastery below threshold.",
    confidence: 0.75,
    ...overrides,
  };
}

describe("isValidPermutation", () => {
  it("accepts a reordering of the same set", () => {
    assert.equal(isValidPermutation(["A", "B", "C"], ["C", "A", "B"]), true);
  });

  it("accepts the identity order", () => {
    assert.equal(isValidPermutation(["A", "B"], ["A", "B"]), true);
  });

  it("rejects a different length", () => {
    assert.equal(isValidPermutation(["A", "B", "C"], ["A", "B"]), false);
  });

  it("rejects an invented concept id not in the legal set", () => {
    assert.equal(isValidPermutation(["A", "B"], ["A", "Z"]), false);
  });

  it("rejects a duplicated concept id even if the set otherwise matches", () => {
    assert.equal(isValidPermutation(["A", "B"], ["A", "A"]), false);
  });

  it("rejects an empty proposed order against a non-empty legal set", () => {
    assert.equal(isValidPermutation(["A"], []), false);
  });
});

describe("topChoiceAgrees", () => {
  it("agrees when the first concept matches", () => {
    assert.equal(topChoiceAgrees(["A", "B"], ["A", "C"]), true);
  });
  it("disagrees when the first concept differs", () => {
    assert.equal(topChoiceAgrees(["A", "B"], ["B", "A"]), false);
  });
  it("disagrees on empty input rather than throwing", () => {
    assert.equal(topChoiceAgrees([], []), false);
  });
});

describe("buildPracticeRecommenderPrompts", () => {
  it("lists every proposal with its concept, type, and rule priority", () => {
    const proposals = [
      proposal({ conceptId: "C5_TWO_STEP_EQUATIONS", type: "REINFORCEMENT", priority: 0.6 }),
      proposal({ conceptId: "C2_ONE_STEP_SUBTRACTION", type: "RETENTION_REVIEW", priority: 0.4 }),
    ];
    const { system, user } = buildPracticeRecommenderPrompts(proposals);
    assert.match(user, /\[0\].*C5_TWO_STEP_EQUATIONS.*REINFORCEMENT/);
    assert.match(user, /\[1\].*C2_ONE_STEP_SUBTRACTION.*RETENTION_REVIEW/);
    assert.match(user, /Return all 2 concept ids/);
    assert.match(system, /never add, drop, or duplicate one/);
  });
});

describe("PracticeRecommendation contract", () => {
  it("accepts a valid recommendation", () => {
    const rec = assertPracticeRecommendationShape({
      orderedConceptIds: ["C5_TWO_STEP_EQUATIONS", "C2_ONE_STEP_SUBTRACTION"],
      confidence: 0.6,
      reasoning: "Two-step equations first — it was flagged with higher urgency.",
    });
    assert.equal(rec.orderedConceptIds.length, 2);
  });

  it("rejects a non-array orderedConceptIds", () => {
    assert.throws(() =>
      assertPracticeRecommendationShape({ orderedConceptIds: "C5", confidence: 0.5, reasoning: "x" }),
    );
  });

  it("rejects an array containing a non-string entry", () => {
    assert.throws(() =>
      assertPracticeRecommendationShape({ orderedConceptIds: ["C5", 3], confidence: 0.5, reasoning: "x" }),
    );
  });

  it("shape validity alone does not imply boundedness — isValidPermutation is still required", () => {
    const rec = assertPracticeRecommendationShape({
      orderedConceptIds: ["INVENTED_CONCEPT"],
      confidence: 0.9,
      reasoning: "x",
    });
    assert.equal(isValidPermutation(["C5_TWO_STEP_EQUATIONS"], rec.orderedConceptIds), false);
  });
});
