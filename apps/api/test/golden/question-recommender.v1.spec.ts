import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidCandidateIndex,
  agreesWithRule,
  buildRecommenderPrompts,
  resolveServedSelection,
} from "../../src/engines/question-recommender/question-recommender.formulas";
import { assertQuestionRecommendationShape } from "@cogna/shared";
import type { ScoredCandidate } from "@cogna/shared";

function candidate(overrides: Partial<ScoredCandidate["candidate"]> = {}, score = 0.5): ScoredCandidate {
  return {
    candidate: {
      uiAction: "SHOW_QUESTION",
      learningIntent: "SAME_DIFFICULTY",
      parameters: { conceptId: "C5_TWO_STEP_EQUATIONS", difficulty: 2 },
      legalityReason: "rule-6-same-difficulty",
      ...overrides,
    },
    score,
    scoreVersion: "candidate-score-rules-v1",
    features: {},
  };
}

describe("isValidCandidateIndex", () => {
  it("accepts an in-range integer index", () => {
    assert.equal(isValidCandidateIndex(0, 3), true);
    assert.equal(isValidCandidateIndex(2, 3), true);
  });

  it("rejects an out-of-range index — this is the entire bounds guarantee", () => {
    assert.equal(isValidCandidateIndex(3, 3), false);
    assert.equal(isValidCandidateIndex(-1, 3), false);
    assert.equal(isValidCandidateIndex(99, 3), false);
  });

  it("rejects a non-integer index", () => {
    assert.equal(isValidCandidateIndex(1.5, 3), false);
    assert.equal(isValidCandidateIndex(NaN, 3), false);
  });

  it("rejects any index into an empty candidate list", () => {
    assert.equal(isValidCandidateIndex(0, 0), false);
  });
});

describe("agreesWithRule", () => {
  it("agrees when the indexes match, disagrees otherwise", () => {
    assert.equal(agreesWithRule(1, 1), true);
    assert.equal(agreesWithRule(1, 2), false);
  });
});

describe("resolveServedSelection", () => {
  it("keeps the rule pick when serve is off even if AI differs", () => {
    assert.deepEqual(resolveServedSelection(0, 2, false, 3), {
      selectedIndex: 0,
      source: "rule",
    });
  });

  it("uses the AI pick when serve is on and the index is in-bounds", () => {
    assert.deepEqual(resolveServedSelection(0, 2, true, 3), {
      selectedIndex: 2,
      source: "ai",
    });
  });

  it("falls back to rules when serve is on but AI index is out of bounds", () => {
    assert.deepEqual(resolveServedSelection(1, 99, true, 3), {
      selectedIndex: 1,
      source: "rule",
    });
  });

  it("falls back to rules when serve is on but AI returned null", () => {
    assert.deepEqual(resolveServedSelection(1, null, true, 3), {
      selectedIndex: 1,
      source: "rule",
    });
  });
});

describe("buildRecommenderPrompts", () => {
  it("lists every candidate with its index, concept, and rule score", () => {
    const candidates = [
      candidate({ learningIntent: "SAME_DIFFICULTY" }, 0.6),
      candidate({ learningIntent: "EASIER_DIFFICULTY", parameters: { conceptId: "C2_ONE_STEP_SUBTRACTION", difficulty: 1 } }, 0.4),
    ];
    const { system, user } = buildRecommenderPrompts(candidates);
    assert.match(user, /\[0\].*SAME_DIFFICULTY/);
    assert.match(user, /\[1\].*EASIER_DIFFICULTY/);
    assert.match(user, /C2_ONE_STEP_SUBTRACTION/);
    assert.match(system, /may only choose one of the listed options by its index/);
    assert.match(system, /never invent a new action/);
  });
});

describe("QuestionRecommendation contract", () => {
  it("accepts a valid recommendation", () => {
    const rec = assertQuestionRecommendationShape({
      selectedIndex: 1,
      confidence: 0.7,
      reasoning: "Highest rule score and matches recent performance.",
    });
    assert.equal(rec.selectedIndex, 1);
  });

  it("rejects a negative index at the shape layer", () => {
    assert.throws(() =>
      assertQuestionRecommendationShape({ selectedIndex: -1, confidence: 0.5, reasoning: "x" }),
    );
  });

  it("rejects a non-integer index at the shape layer", () => {
    assert.throws(() =>
      assertQuestionRecommendationShape({ selectedIndex: 1.5, confidence: 0.5, reasoning: "x" }),
    );
  });

  it("shape validity alone does not imply boundedness — isValidCandidateIndex is still required", () => {
    // A shape-valid recommendation can still name an index that doesn't exist
    // in a *particular* candidate list — that's exactly what
    // question-recommender-agent.service.ts's parseAndValidate rejects.
    const rec = assertQuestionRecommendationShape({ selectedIndex: 5, confidence: 0.9, reasoning: "x" });
    assert.equal(isValidCandidateIndex(rec.selectedIndex, 3), false);
  });
});
