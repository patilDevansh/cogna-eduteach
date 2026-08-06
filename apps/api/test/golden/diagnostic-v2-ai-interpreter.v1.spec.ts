import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildInterpreterPrompts,
  DiagnosticV2AiInterpreterService,
  type InterpreterContext,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { rowAgreement } from "../../src/ai/shadow-gate-evaluator.formulas";
import { containsForbiddenTerm } from "@cogna/shared";
import { mockOrchestrator } from "./helpers/diagnostic-v2-fakes";

function context(overrides: Partial<InterpreterContext> = {}): InterpreterContext {
  return {
    studentId: "student-1",
    sessionId: "session-1",
    microSkillId: "LIN_DISTRIBUTE_NEG",
    microSkillName: "Distribute a negative multiplier and preserve sign products",
    counts: {
      evidenceCount: 2,
      independentSuccessCount: 0,
      independentFailureCount: 2,
      assistedSuccessCount: 0,
    },
    observedContextStrengths: [],
    observedContextGaps: ["INDEPENDENT"],
    firstInvalidActionDescription: "(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10",
    ...overrides,
  };
}

const json = (v: unknown) => JSON.stringify(v);

const goodResponse = {
  hypothesisLabel: "REPEATED_PATTERN",
  confidence: 0.85,
  reasoning: "The same sign slip appeared on two structurally different bracket problems.",
  childFacingSummary: "Let's look at what happens to a minus sign just outside a bracket.",
};

describe("DiagnosticV2AiInterpreterService — always returns a hypothesis", () => {
  it("serves the AI reading when the call succeeds", async () => {
    const orchestrator = mockOrchestrator({ raw: json(goodResponse) });
    const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(context());

    assert.equal(result.source, "AI");
    assert.equal(result.hypothesisLabel, "REPEATED_PATTERN");
    assert.equal(result.childFacingSummary, goodResponse.childFacingSummary);
  });

  it("falls back to the deterministic hypothesis on timeout — a skill is never left uninterpreted", async () => {
    const orchestrator = mockOrchestrator({ failWith: new Error("timeout after 3000ms") });
    const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(context());

    assert.equal(result.source, "RULE");
    assert.equal(result.hypothesisLabel, "REPEATED_PATTERN");
    assert.ok(result.childFacingSummary.length > 0);
  });

  it("falls back when the capability is off, without making a call", async () => {
    const orchestrator = mockOrchestrator({ generate: false });
    const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(context());
    assert.equal(result.source, "RULE");
    assert.equal(orchestrator.calls.length, 0);
  });

  it("keeps the rule reading in shadow mode even though the call ran", async () => {
    const orchestrator = mockOrchestrator({ serve: false, raw: json(goodResponse) });
    const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(context());
    assert.equal(result.source, "RULE");
    assert.equal(orchestrator.calls.length, 1);
  });

  it("reaches the same conclusion as the rules on a single error, only in different words", async () => {
    const oneError = context({
      counts: { evidenceCount: 1, independentSuccessCount: 0, independentFailureCount: 1, assistedSuccessCount: 0 },
    });
    const orchestrator = mockOrchestrator({ generate: false });
    const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(oneError);
    assert.equal(result.hypothesisLabel, "POSSIBLE_SLIP");
  });
});

describe("DiagnosticV2AiInterpreterService — forbidden terms fail the whole call", () => {
  const leaks = [
    ["a clinical label in the reasoning", { ...goodResponse, reasoning: "This looks like a clinical processing issue." }],
    ["a judgement about the child in the summary", { ...goodResponse, childFacingSummary: "You are weak at brackets." }],
    ["an internal concept id leaking to the child", { ...goodResponse, childFacingSummary: "Practise C5_TWO_STEP_EQUATIONS next." }],
  ] as const;

  for (const [label, payload] of leaks) {
    it(`rejects ${label} and serves the deterministic hypothesis instead`, async () => {
      const orchestrator = mockOrchestrator({ raw: json(payload) });
      const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(context());

      assert.equal(result.source, "RULE");
      assert.match(orchestrator.rejections[0]!, /forbidden term/);
      assert.equal(containsForbiddenTerm(result.childFacingSummary), false);
    });
  }

  it("rejects a malformed response the same way as an unsafe one", async () => {
    const orchestrator = mockOrchestrator({ raw: json({ hypothesisLabel: "", confidence: 9 }) });
    const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(context());
    assert.equal(result.source, "RULE");
    assert.equal(orchestrator.rejections.length, 1);
  });

  it("pins the micro-skill id server-side, so the model cannot reassign its verdict to another skill", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({ ...goodResponse, microSkillId: "LIN_SOLVE_TWO_STEP" }),
    });
    const result = await new DiagnosticV2AiInterpreterService(orchestrator.service).interpret(context());
    // The service ignores any microSkillId in the payload and re-stamps its own,
    // so a served hypothesis can only ever be about the skill it was asked about.
    assert.equal(result.source, "AI");
    assert.equal(orchestrator.rejections.length, 0);
  });
});

describe("buildInterpreterPrompts", () => {
  it("hands over counts as facts, plus the rule reading to argue against", () => {
    const { system, user } = buildInterpreterPrompts(context(), "REPEATED_PATTERN");
    assert.match(user, /Got it wrong on their own: 2 time\(s\)/);
    assert.match(user, /The rule-based reading of this is: REPEATED_PATTERN/);
    assert.match(system, /treat those as facts/);
    assert.match(system, /Never state that an untested skill is weak/);
    assert.match(system, /Never infer attention, mood, effort, intelligence, or any clinical trait/);
  });

  it("mentions the observed conditions when there are any", () => {
    const { user } = buildInterpreterPrompts(
      context({ observedContextStrengths: ["INDEPENDENT"], observedContextGaps: ["NEAR_TRANSFER"] }),
      "POSSIBLE_SLIP",
    );
    assert.match(user, /Held up under: INDEPENDENT/);
    assert.match(user, /Struggled under: NEAR_TRANSFER/);
  });
});

describe("shadow gate agreement for this capability", () => {
  it("compares the conclusion only — differing confidence and wording are not disagreement", () => {
    assert.deepEqual(
      rowAgreement(
        "DIAGNOSTIC_V2_INTERPRETER",
        { hypothesisLabel: "REPEATED_PATTERN", confidence: 0.7, microSkillId: "LIN_DISTRIBUTE_NEG" },
        { hypothesisLabel: "REPEATED_PATTERN", confidence: 0.95, reasoning: "different words entirely" },
      ),
      { agreedCount: 1, comparedCount: 1 },
    );
  });

  it("counts a different conclusion as a real disagreement", () => {
    assert.deepEqual(
      rowAgreement(
        "DIAGNOSTIC_V2_INTERPRETER",
        { hypothesisLabel: "REPEATED_PATTERN" },
        { hypothesisLabel: "WORKING_WELL" },
      ),
      { agreedCount: 0, comparedCount: 1 },
    );
  });

  it("excludes a malformed row rather than counting it against the agent", () => {
    assert.deepEqual(rowAgreement("DIAGNOSTIC_V2_INTERPRETER", { hypothesisLabel: 3 }, { hypothesisLabel: "X" }), {
      agreedCount: 0,
      comparedCount: 0,
    });
  });
});
