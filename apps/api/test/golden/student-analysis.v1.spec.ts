import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  directionFromDelta,
  buildRuleDirections,
  computeAgreementRate,
  buildAnalysisPrompts,
} from "../../src/engines/student-analysis/student-analysis.formulas";
import { isGenerateEnabled, isServeEnabled, resolveModel } from "../../src/ai/ai-orchestrator.formulas";
import {
  assertStudentAnalysisSnapshotShape,
  assertConceptAssessmentShape,
} from "@cogna/shared";
import type { ConceptAssessment } from "@cogna/shared";

describe("directionFromDelta", () => {
  it("classifies improving/declining/stable around the noise threshold", () => {
    assert.equal(directionFromDelta(0.5, 0.6), "IMPROVING");
    assert.equal(directionFromDelta(0.6, 0.5), "DECLINING");
    assert.equal(directionFromDelta(0.5, 0.505), "STABLE");
    assert.equal(directionFromDelta(0.5, 0.5), "STABLE");
  });
});

describe("buildRuleDirections", () => {
  it("keeps the last update per concept and derives its direction", () => {
    const map = buildRuleDirections([
      { conceptId: "C5", previousValue: 0.3, newValue: 0.5 },
      { conceptId: "C5", previousValue: 0.5, newValue: 0.4 },
      { conceptId: "C2", previousValue: 0.6, newValue: 0.61 },
    ]);
    assert.equal(map.get("C5"), "DECLINING");
    assert.equal(map.get("C2"), "STABLE");
    assert.equal(map.size, 2);
  });

  it("returns an empty map for no updates", () => {
    assert.equal(buildRuleDirections([]).size, 0);
  });
});

describe("computeAgreementRate", () => {
  const rules = buildRuleDirections([
    { conceptId: "C1", previousValue: 0.2, newValue: 0.4 }, // IMPROVING
    { conceptId: "C2", previousValue: 0.5, newValue: 0.3 }, // DECLINING
  ]);

  it("agrees when directions match", () => {
    const ai: ConceptAssessment[] = [
      { conceptId: "C1", direction: "IMPROVING", confidence: 0.8, reasoning: "steady gains" },
      { conceptId: "C2", direction: "DECLINING", confidence: 0.7, reasoning: "slipping back" },
    ];
    const result = computeAgreementRate(rules, ai);
    assert.equal(result.agreementRate, 1);
    assert.equal(result.comparedCount, 2);
    assert.equal(result.agreedCount, 2);
  });

  it("disagrees when directions differ", () => {
    const ai: ConceptAssessment[] = [
      { conceptId: "C1", direction: "STABLE", confidence: 0.5, reasoning: "no clear change" },
    ];
    const result = computeAgreementRate(rules, ai);
    assert.equal(result.agreementRate, 0);
    assert.equal(result.comparedCount, 1);
  });

  it("excludes INSUFFICIENT_EVIDENCE claims from the comparable set", () => {
    const ai: ConceptAssessment[] = [
      { conceptId: "C1", direction: "INSUFFICIENT_EVIDENCE", confidence: 0.2, reasoning: "too little data" },
    ];
    const result = computeAgreementRate(rules, ai);
    assert.equal(result.agreementRate, null);
    assert.equal(result.comparedCount, 0);
  });

  it("returns null agreement when there is no overlap with the rule set", () => {
    const ai: ConceptAssessment[] = [
      { conceptId: "C9_UNSEEN", direction: "IMPROVING", confidence: 0.6, reasoning: "x" },
    ];
    const result = computeAgreementRate(rules, ai);
    assert.equal(result.agreementRate, null);
  });
});

describe("buildAnalysisPrompts", () => {
  it("lists every concept update in the user prompt", () => {
    const { system, user } = buildAnalysisPrompts([
      { conceptId: "C5_TWO_STEP_EQUATIONS", previousValue: 0.3, newValue: 0.45 },
    ]);
    assert.match(user, /C5_TWO_STEP_EQUATIONS/);
    assert.match(system, /Never infer attention, mood, effort/);
  });

  it("handles an empty update list without throwing", () => {
    const { user } = buildAnalysisPrompts([]);
    assert.match(user, /No mastery changes/);
  });
});

describe("StudentAnalysisSnapshot contract", () => {
  it("accepts a valid snapshot", () => {
    const snapshot = assertStudentAnalysisSnapshotShape({
      studentId: "s1",
      sessionId: "sess1",
      conceptAssessments: [
        { conceptId: "C1", direction: "IMPROVING", confidence: 0.7, reasoning: "steady gains" },
      ],
      modelVersion: "student-analysis-agent-v1",
    });
    assert.equal(snapshot.conceptAssessments.length, 1);
  });

  it("rejects an invalid direction", () => {
    assert.throws(() =>
      assertConceptAssessmentShape({
        conceptId: "C1",
        direction: "ACED_IT",
        confidence: 0.7,
        reasoning: "x",
      }),
    );
  });

  it("rejects out-of-range confidence", () => {
    assert.throws(() =>
      assertConceptAssessmentShape({
        conceptId: "C1",
        direction: "STABLE",
        confidence: 1.5,
        reasoning: "x",
      }),
    );
  });
});

describe("AI Orchestrator flag gating (shadow-by-default)", () => {
  it("GENERATE is disabled by default (env unset)", () => {
    const env = {} as NodeJS.ProcessEnv;
    assert.equal(isGenerateEnabled("TEST_CAPABILITY", true, env), false);
  });

  it("GENERATE stays disabled even with the flag on if OpenAI is not configured", () => {
    const env = { AI_TEST_CAPABILITY_GENERATE: "true" } as unknown as NodeJS.ProcessEnv;
    assert.equal(isGenerateEnabled("TEST_CAPABILITY", false, env), false);
  });

  it("GENERATE is enabled only when both the flag is true and OpenAI is configured", () => {
    const env = { AI_TEST_CAPABILITY_GENERATE: "true" } as unknown as NodeJS.ProcessEnv;
    assert.equal(isGenerateEnabled("TEST_CAPABILITY", true, env), true);
  });

  it("SERVE is disabled by default even when the call passed", () => {
    const env = {} as NodeJS.ProcessEnv;
    assert.equal(isServeEnabled("TEST_CAPABILITY", true, env), false);
  });

  it("SERVE never turns on for a failed call, regardless of the flag", () => {
    const env = { AI_TEST_CAPABILITY_SERVE: "true" } as unknown as NodeJS.ProcessEnv;
    assert.equal(isServeEnabled("TEST_CAPABILITY", false, env), false);
  });

  it("SERVE is enabled only when the flag is true and the call passed", () => {
    const env = { AI_TEST_CAPABILITY_SERVE: "true" } as unknown as NodeJS.ProcessEnv;
    assert.equal(isServeEnabled("TEST_CAPABILITY", true, env), true);
  });

  it("resolveModel prefers an explicit request, then the env override, then the default", () => {
    assert.equal(resolveModel("TEST_CAPABILITY", "gpt-explicit", {} as NodeJS.ProcessEnv), "gpt-explicit");
    assert.equal(
      resolveModel("TEST_CAPABILITY", undefined, { AI_TEST_CAPABILITY_MODEL: "gpt-env" } as unknown as NodeJS.ProcessEnv),
      "gpt-env",
    );
    assert.equal(resolveModel("TEST_CAPABILITY", undefined, {} as NodeJS.ProcessEnv), "gpt-4.1-mini");
  });
});
