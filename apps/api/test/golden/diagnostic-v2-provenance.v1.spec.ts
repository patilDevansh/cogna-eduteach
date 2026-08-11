/**
 * Debug provenance for diagnostic-v2 — additive observability only.
 * Grading / evidence / route must be unchanged; these specs assert the trail
 * is populated correctly for ?debug=1 consumers.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DiagnosticV2SessionService } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import { buildStepProvenance } from "../../src/engines/diagnostic-v2/diagnostic-v2-provenance";
import { solveLineForDisplay } from "../../src/engines/diagnostic-v2/linear-bracket-verifier";
import {
  createFakePrisma,
  makeSelectorService,
  mockOrchestrator,
} from "./helpers/diagnostic-v2-fakes";

describe("solveLineForDisplay — exported verifier solution helper", () => {
  it("reuses the verifier's solution arithmetic for a linear equation", () => {
    assert.equal(solveLineForDisplay("3x + 5 = 20"), "x = 5");
    assert.equal(solveLineForDisplay("2x = 16"), "x = 8");
    assert.equal(solveLineForDisplay("umm?"), null);
  });
});

describe("buildStepProvenance — deterministic step", () => {
  it("marks ruleAnalysis DECIDED and leaves aiGraderFallback null", () => {
    const provenance = buildStepProvenance({
      previousLine: "3x + 5 = 20",
      submittedLine: "3x = 15",
      track: "NEGATIVE_DISTRIBUTION",
      stageId: "ENTRY_TWO_STEP",
      storedValidity: "VALID",
      verificationSource: "DETERMINISTIC",
      aiGraderConfidence: null,
      handedToAi: null,
    });
    assert.equal(provenance.ruleAnalysis.outcome, "DECIDED");
    assert.equal(provenance.ruleAnalysis.validity, "VALID");
    assert.equal(provenance.aiGraderFallback, null);
    assert.equal(provenance.input.verifierVersion, "linear-bracket-verifier-v1");
    assert.equal(provenance.input.resolvedGrammar, "NEGATIVE_DISTRIBUTION");
    assert.ok(provenance.ruleAnalysis.normalizedPreviousLine);
    assert.ok(provenance.ruleAnalysis.previousSolution);
  });

  it("carries parseError on abstention and records aiGraderFallback when the grader ran", () => {
    const provenance = buildStepProvenance({
      previousLine: "3x + 5 = 20",
      submittedLine: "umm i think ?? x",
      track: "NEGATIVE_DISTRIBUTION",
      stageId: "ENTRY_TWO_STEP",
      storedValidity: "INVALID",
      verificationSource: "AI_FALLBACK",
      aiGraderConfidence: 0.55,
      storedFirstInvalidActionDescription: "could not make sense of the line",
      handedToAi: null,
    });
    assert.equal(provenance.ruleAnalysis.outcome, "ABSTAINED");
    assert.ok(provenance.ruleAnalysis.parseError);
    assert.ok(provenance.aiGraderFallback);
    assert.match(provenance.aiGraderFallback!.whyItRan, /verifier PARSE_FAILED|AMBIGUOUS/);
    assert.equal(provenance.aiGraderFallback!.validity, "INVALID");
    assert.equal(provenance.aiGraderFallback!.confidence, 0.55);
  });
});

describe("getDebugView selection + step provenance (AI off)", () => {
  it("records the candidate list, flags the rule pick, and sets aiDecision null / servedSource RULE", async () => {
    const { prisma } = createFakePrisma(["student-prov"]);
    const orch = mockOrchestrator({ generate: false });
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(orch.service),
      new DiagnosticV2AiInterpreterService(orch.service),
      new DiagnosticV2AiGraderService(orch.service),
    );

    const start = await service.startSession("student-prov");
    // Complete ENTRY_TWO_STEP so selectNextItem runs for the next backbone item.
    let attemptId = start.attemptId;
    let previousLine = start.openingLine;
    for (const [prev, next] of [
      ["3x + 5 = 20", "3x = 15"],
      ["3x = 15", "x = 5"],
    ] as const) {
      const res = await service.submitStep(start.sessionId, {
        attemptId,
        previousLine: prev,
        submittedLine: next,
      });
      assert.equal(res.outcome, "SUBMITTED");
      if (res.outcome === "SUBMITTED" && res.nextAttempt) {
        attemptId = res.nextAttempt.attemptId;
        previousLine = res.nextAttempt.openingLine;
      }
    }
    void previousLine;

    const debug = await service.getDebugView(start.sessionId);
    assert.ok(debug.selections && debug.selections.length >= 1);
    const sel = debug.selections![0]!;
    assert.ok(sel.candidates.length >= 1);
    assert.ok(sel.candidates.some((c) => c.isRulePick));
    assert.equal(sel.aiDecision, null);
    assert.equal(sel.servedSource, "RULE");
    assert.ok(sel.rulePick.routeReason.length > 0);
    assert.equal(sel.servedItemKey, sel.rulePick.itemKey);

    const decided = debug.steps.find((s) => s.validity === "VALID");
    assert.ok(decided?.provenance);
    assert.equal(decided!.provenance!.aiGraderFallback, null);
    assert.equal(decided!.provenance!.ruleAnalysis.outcome, "DECIDED");
  });
});
