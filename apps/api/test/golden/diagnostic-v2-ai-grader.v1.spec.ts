import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraderPrompts,
  DiagnosticV2AiGraderService,
  type GraderContext,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import { verifyStepValidity } from "../../src/engines/diagnostic-v2/linear-bracket-verifier";
import { rowAgreement } from "../../src/ai/shadow-gate-evaluator.formulas";
import { assertDiagnosticV2GraderResultShape } from "@cogna/shared";
import { mockOrchestrator } from "./helpers/diagnostic-v2-fakes";

function context(overrides: Partial<GraderContext> = {}): GraderContext {
  return {
    studentId: "student-1",
    sessionId: "session-1",
    previousLine: "-2(x - 5) + 3 = 11",
    submittedLine: "take 3 off both sides first",
    parseError: 'submitted line: unexpected character "t"',
    ...overrides,
  };
}

const json = (v: unknown) => JSON.stringify(v);

describe("DiagnosticV2AiGraderService — resolving what the rules could not read", () => {
  it("returns a committed verdict with its confidence when the call succeeds", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({ validity: "VALID", confidence: 0.72, reasoning: "Subtracting 3 from both sides is a valid move." }),
    });
    const outcome = await new DiagnosticV2AiGraderService(orchestrator.service).grade(context());

    assert.equal(outcome.validity, "VALID");
    assert.equal(outcome.confidence, 0.72);
    assert.match(outcome.reasoning!, /valid move/);
  });

  it("logs the rules' abstention as the audit baseline", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({ validity: "INVALID", confidence: 0.6, reasoning: "x" }),
    });
    await new DiagnosticV2AiGraderService(orchestrator.service).grade(context());

    assert.equal(orchestrator.calls[0]!.capability, "DIAGNOSTIC_V2_GRADER");
    assert.deepEqual(orchestrator.calls[0]!.ruleOutput, {
      validity: "AMBIGUOUS",
      parseError: 'submitted line: unexpected character "t"',
    });
  });
});

describe("DiagnosticV2AiGraderService — failing closed", () => {
  // validity === null is the only way this service says "still unresolved".
  // Silence is never read as "correct" and never as "wrong".
  it("stays unresolved on timeout", async () => {
    const orchestrator = mockOrchestrator({ failWith: new Error("timeout after 2000ms") });
    const outcome = await new DiagnosticV2AiGraderService(orchestrator.service).grade(context());
    assert.equal(outcome.validity, null);
    assert.equal(outcome.confidence, undefined);
  });

  it("stays unresolved when the capability flag is off, with no call made", async () => {
    const orchestrator = mockOrchestrator({ generate: false });
    const outcome = await new DiagnosticV2AiGraderService(orchestrator.service).grade(context());
    assert.equal(outcome.validity, null);
    assert.equal(orchestrator.calls.length, 0);
  });

  it("stays unresolved in shadow mode, even on a well-formed answer", async () => {
    const orchestrator = mockOrchestrator({
      serve: false,
      raw: json({ validity: "VALID", confidence: 0.9, reasoning: "x" }),
    });
    const outcome = await new DiagnosticV2AiGraderService(orchestrator.service).grade(context());
    assert.equal(outcome.validity, null);
    assert.equal(orchestrator.calls.length, 1);
  });

  it("bounds the wait — this runs on a student-facing path", async () => {
    const orchestrator = mockOrchestrator({ raw: json({ validity: "VALID", confidence: 0.5, reasoning: "x" }) });
    await new DiagnosticV2AiGraderService(orchestrator.service).grade(context());
    assert.equal(orchestrator.calls[0]!.timeoutMs, 2000);
  });
});

describe("DiagnosticV2AiGraderService — the model must commit, in the allowed vocabulary", () => {
  const refused = [
    ["hedging back to AMBIGUOUS", { validity: "AMBIGUOUS", confidence: 0.5, reasoning: "x" }],
    ["claiming the rules' own PARSE_FAILED outcome", { validity: "PARSE_FAILED", confidence: 0.5, reasoning: "x" }],
    ["an invented verdict", { validity: "PROBABLY_FINE", confidence: 0.5, reasoning: "x" }],
    ["confidence outside 0..1", { validity: "VALID", confidence: 1.4, reasoning: "x" }],
    ["no reasoning at all", { validity: "VALID", confidence: 0.5, reasoning: "" }],
    ["a non-JSON reply", "I think it is probably fine"],
  ] as const;

  for (const [label, payload] of refused) {
    it(`stays unresolved on ${label}`, async () => {
      const raw = typeof payload === "string" ? payload : json(payload);
      const orchestrator = mockOrchestrator({ raw });
      const outcome = await new DiagnosticV2AiGraderService(orchestrator.service).grade(context());

      assert.equal(outcome.validity, null);
      assert.equal(orchestrator.rejections.length, 1);
    });
  }
});

describe("the grader only ever sees lines the rules refused", () => {
  it("every line routed here is PARSE_FAILED or AMBIGUOUS, never one the rules decided", () => {
    const routed = ["take 3 off both sides first", "x^2 = 4", "3x"];
    for (const line of routed) {
      const validity = verifyStepValidity("-2(x - 5) + 3 = 11", line).validity;
      assert.ok(validity === "PARSE_FAILED" || validity === "AMBIGUOUS", `${line} -> ${validity}`);
    }

    // A line the rules can read is decided deterministically and never reaches this service.
    assert.equal(verifyStepValidity("-2(x - 5) + 3 = 11", "-2x - 10 + 3 = 11").validity, "INVALID");
    assert.equal(verifyStepValidity("-2(x - 5) + 3 = 11", "-2x + 13 = 11").validity, "VALID");
  });
});

describe("buildGraderPrompts", () => {
  it("gives the model both lines and the reason the checker gave up", () => {
    const { system, user } = buildGraderPrompts(context());
    assert.match(user, /Previous line: -2\(x - 5\) \+ 3 = 11/);
    assert.match(user, /Student's new line: take 3 off both sides first/);
    assert.match(user, /Why the automatic checker gave up/);
    assert.match(system, /Judge the mathematics only\. Say nothing about the student themselves\./);
    assert.match(system, /Alternative valid methods are acceptable/);
  });

  it("omits the parse-error line entirely when there was not one", () => {
    const { user } = buildGraderPrompts(context({ parseError: undefined }));
    assert.doesNotMatch(user, /gave up/);
  });
});

describe("DiagnosticV2GraderResult contract", () => {
  it("accepts only VALID or INVALID", () => {
    assert.equal(assertDiagnosticV2GraderResultShape({ validity: "VALID", confidence: 0.5, reasoning: "x" }).validity, "VALID");
    assert.throws(() => assertDiagnosticV2GraderResultShape({ validity: "AMBIGUOUS", confidence: 0.5, reasoning: "x" }));
  });
});

describe("shadow gate agreement for this capability", () => {
  it("is excluded from the comparable set — the rule baseline abstained, so there is nothing to agree with", () => {
    assert.deepEqual(
      rowAgreement(
        "DIAGNOSTIC_V2_GRADER",
        { validity: "AMBIGUOUS", parseError: "x" },
        { validity: "VALID", confidence: 0.8, reasoning: "y" },
      ),
      { agreedCount: 0, comparedCount: 0 },
    );
  });
});
