/**
 * Phase B2 — difference-of-squares verifier + thin track smoke.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBinomialProduct,
  parseExpandedQuadratic,
  verifyIdentityStepValidity,
} from "../../src/engines/diagnostic-v2/identity-expr-verifier";
import {
  findFixedItem,
  verifyRendered,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import {
  firstStageForTrack,
  itemStageOrderForTrack,
  nextStagesAfter,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2SessionService } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import {
  createFakePrisma,
  makeSelectorService,
  mockOrchestrator,
} from "./helpers/diagnostic-v2-fakes";

describe("identity-expr-verifier", () => {
  it("parses binomial products and difference-of-squares quadratics", () => {
    assert.deepEqual(parseBinomialProduct("(x + 3)(x - 3)"), {
      variable: "x",
      leftConst: 3,
      rightConst: -3,
    });
    assert.deepEqual(parseExpandedQuadratic("x^2 - 9"), {
      a: 1,
      b: 0,
      c: -9,
      variable: "x",
    });
    assert.deepEqual(parseExpandedQuadratic("x^2 + 5x + 6"), {
      a: 1,
      b: 5,
      c: 6,
      variable: "x",
    });
  });

  it("accepts correct expand of difference of squares", () => {
    const v = verifyIdentityStepValidity("(x + 3)(x - 3)", "x^2 - 9");
    assert.equal(v.validity, "VALID");
  });

  it("flags a middle term on difference of squares", () => {
    const v = verifyIdentityStepValidity("(x + 3)(x - 3)", "x^2 + 0x - 9");
    // x^2+0x-9 may not parse — use x^2+6x-9 style wrong middle
    const v2 = verifyIdentityStepValidity("(x + 3)(x - 3)", "x^2 + 6x - 9");
    assert.equal(v2.validity, "INVALID");
    assert.equal(v2.firstInvalidActionCode, "WRONG_MIDDLE_SIGN");
    void v;
  });

  it("accepts factoring a perfect-square difference", () => {
    const v = verifyIdentityStepValidity("z^2 - 16", "(z + 4)(z - 4)");
    assert.equal(v.validity, "VALID");
  });

  it("rejects wrong factor pair", () => {
    const v = verifyIdentityStepValidity("z^2 - 16", "(z + 2)(z - 8)");
    assert.equal(v.validity, "INVALID");
    assert.equal(v.firstInvalidActionCode, "FACTOR_PAIR_MISMATCH");
  });
});

describe("B2 identity track wiring", () => {
  it("fixed items verify and track order is locked", () => {
    for (const key of [
      "ENTRY_EXPAND_BINOMIAL",
      "ID_DIFF_MAIN",
      "ID_DIFF_CONTRAST",
      "TRANSFER_ID_DIFF",
    ]) {
      const item = findFixedItem(key);
      assert.ok(item, key);
      assert.equal(verifyRendered(item!).passed, true, key);
    }
    assert.equal(firstStageForTrack("IDENTITY_DIFF_SQUARES"), "ENTRY_EXPAND_BINOMIAL");
    assert.deepEqual(itemStageOrderForTrack("IDENTITY_DIFF_SQUARES"), [
      "ENTRY_EXPAND_BINOMIAL",
      "ID_DIFF_MAIN",
      "ID_DIFF_CONTRAST",
      "TRANSFER_ID_DIFF",
    ]);
    assert.deepEqual(nextStagesAfter("ENTRY_EXPAND_BINOMIAL", {
      targetSkillFailed: false,
      patternConfirmed: false,
    }), ["ID_DIFF_MAIN"]);
    assert.deepEqual(nextStagesAfter("ID_DIFF_MAIN", {
      targetSkillFailed: true,
      patternConfirmed: false,
    }), ["ID_DIFF_CONTRAST"]);
  });

  it("session walks entry → main on correct expand", async () => {
    const { prisma } = createFakePrisma(["student-id"]);
    const selector = mockOrchestrator({ generate: false });
    const interpreter = mockOrchestrator({ generate: false });
    const grader = mockOrchestrator({ generate: false });
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(selector.service),
      new DiagnosticV2AiInterpreterService(interpreter.service),
      new DiagnosticV2AiGraderService(grader.service),
    );

    const start = await service.startSession("student-id", "IDENTITY_DIFF_SQUARES");
    assert.equal(start.itemKey, "ENTRY_EXPAND_BINOMIAL");

    const step = await service.submitStep(start.sessionId, {
      attemptId: start.attemptId,
      previousLine: "(x + 2)(x + 3)",
      submittedLine: "x^2 + 5x + 6",
    });
    assert.equal(step.outcome, "SUBMITTED");
    if (step.outcome !== "SUBMITTED") return;
    assert.equal(step.validity, "VALID");
    assert.equal(step.itemComplete, true);
    assert.equal(step.nextAttempt?.itemKey, "ID_DIFF_MAIN");
  });
});
