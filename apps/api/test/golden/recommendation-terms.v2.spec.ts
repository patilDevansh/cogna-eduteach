import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CONCEPTS_PER_DAY,
  MAX_QUESTIONS_PER_DAY,
  computeRecommendationPriority,
} from "../../src/engines/diagnostic-engine/diagnostic-formulas";
import { RecommendationEngineService } from "../../src/engines/recommendation-engine/recommendation-engine.service";

describe("R09 — Daily workload cap", () => {
  it("caps plan at maxQuestionsPerDay = 10 and maxConceptsPerDay = 3", () => {
    assert.equal(MAX_QUESTIONS_PER_DAY, 10);
    assert.equal(MAX_CONCEPTS_PER_DAY, 3);

    const engine = new RecommendationEngineService(
      // pure cap helper does not touch prisma
      null as unknown as ConstructorParameters<typeof RecommendationEngineService>[0],
    );

    const proposals = [
      { conceptId: "C1", questionCount: 4 },
      { conceptId: "C2", questionCount: 4 },
      { conceptId: "C3", questionCount: 4 },
      { conceptId: "C4", questionCount: 4 },
      { conceptId: "C5", questionCount: 4 },
    ];

    const { totalQuestions, conceptCount, capped } = engine.applyDailyCaps(proposals);

    assert.equal(conceptCount, 3);
    assert.ok(totalQuestions <= 10);
    assert.equal(totalQuestions, 10);
    assert.equal(capped.length, 3);
    assert.ok(!capped.some((p) => p.conceptId === "C4"));
  });
});

describe("R10 — Recommendation term math (spot check)", () => {
  it("computes priority = 0.436 exactly", () => {
    const priority = computeRecommendationPriority({
      weakness: 0.4,
      misconceptionSeverity: 0.8,
      retentionRisk: 0.58,
      prereqImportance: 0,
      parentGoalBoost: 0,
    });

    // 0.30×0.40 + 0.25×0.80 + 0.20×0.58 + 0.15×0 + 0.10×0 = 0.436
    assert.ok(Math.abs(priority - 0.436) < 1e-9);
    assert.equal(priority, 0.436);
  });
});
