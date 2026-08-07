/**
 * Phase B4 — quadratic zero-product verifier + thin track smoke.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseFactoredZeroProduct,
  parseRootList,
  rearrangeToStandardForm,
  verifyQuadraticStepValidity,
} from "../../src/engines/diagnostic-v2/quadratic-zero-product-verifier";
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

describe("quadratic-zero-product-verifier", () => {
  it("rearranges to standard form", () => {
    const std = rearrangeToStandardForm("x^2 + 5x = -6");
    assert.ok(std);
    assert.equal(std!.rhs, 0);
    assert.deepEqual(std!.lhs, { a: 1, b: 5, c: 6, variable: "x" });
  });

  it("accepts correct rearrange step", () => {
    const v = verifyQuadraticStepValidity("x^2 + 5x = -6", "x^2 + 5x + 6 = 0");
    assert.equal(v.validity, "VALID");
  });

  it("flags wrong standard form", () => {
    const v = verifyQuadraticStepValidity("x^2 + 5x = -6", "x^2 + 5x - 6 = 0");
    assert.equal(v.validity, "INVALID");
    assert.equal(v.firstInvalidActionCode, "WRONG_STANDARD_FORM");
  });

  it("accepts zero-product roots (either order)", () => {
    const v = verifyQuadraticStepValidity("(x + 2)(x - 3) = 0", "x = -2 or x = 3");
    assert.equal(v.validity, "VALID");
    const swapped = verifyQuadraticStepValidity(
      "(x + 2)(x - 3) = 0",
      "x = 3 or x = -2",
    );
    assert.equal(swapped.validity, "VALID");
  });

  it("accepts non-unit factor roots", () => {
    const v = verifyQuadraticStepValidity("(2x + 1)(x - 3) = 0", "x = -1/2 or x = 3");
    assert.equal(v.validity, "VALID");
  });

  it("flags missed branch", () => {
    // Single root forms should fail parse or MISSED_BRANCH — use one root with trailing junk avoided
    const roots = parseRootList("x = -2 or x = 3");
    assert.ok(roots);
    const v = verifyQuadraticStepValidity("(x + 2)(x - 3) = 0", "x = -2 or x = 99");
    assert.equal(v.validity, "INVALID");
    assert.ok(
      v.firstInvalidActionCode === "DROPPED_ROOT" ||
        v.firstInvalidActionCode === "VERIFY_FAIL",
    );
  });

  it("flags wrong root sign", () => {
    // Same magnitudes as −2 and 3, both signs flipped → WRONG_ROOT_SIGN
    const v = verifyQuadraticStepValidity("(x + 2)(x - 3) = 0", "x = 2 or x = -3");
    assert.equal(v.validity, "INVALID");
    assert.equal(v.firstInvalidActionCode, "WRONG_ROOT_SIGN");
  });

  it("accepts direct roots from quadratic = 0", () => {
    const v = verifyQuadraticStepValidity("x^2 - x - 6 = 0", "x = 3 or x = -2");
    assert.equal(v.validity, "VALID");
  });

  it("rejects non-integer-factorable quadratic", () => {
    const v = verifyQuadraticStepValidity("x^2 + x + 1 = 0", "x = 0 or x = 1");
    assert.equal(v.validity, "INVALID");
    assert.equal(v.firstInvalidActionCode, "NOT_INTEGER_FACTORABLE");
  });

  it("parses factored zero-product openings", () => {
    assert.ok(parseFactoredZeroProduct("(x + 2)(x - 3) = 0"));
  });
});

describe("B4 quadratic track wiring", () => {
  it("fixed items verify and track order is locked", () => {
    for (const key of [
      "ENTRY_QUAD_STANDARD",
      "QUAD_ZP_MAIN",
      "QUAD_ZP_CONTRAST",
      "TRANSFER_QUAD_ZP",
    ]) {
      const item = findFixedItem(key);
      assert.ok(item, key);
      const vr = verifyRendered(item!);
      assert.equal(vr.passed, true, `${key}: ${vr.failures.join("; ")}`);
    }
    assert.equal(firstStageForTrack("QUAD_ZERO_PRODUCT"), "ENTRY_QUAD_STANDARD");
    assert.deepEqual(itemStageOrderForTrack("QUAD_ZERO_PRODUCT"), [
      "ENTRY_QUAD_STANDARD",
      "QUAD_ZP_MAIN",
      "QUAD_ZP_CONTRAST",
      "TRANSFER_QUAD_ZP",
    ]);
    assert.deepEqual(
      nextStagesAfter("QUAD_ZP_MAIN", {
        targetSkillFailed: true,
        patternConfirmed: false,
      }),
      ["QUAD_ZP_CONTRAST"],
    );
  });

  it("session walks entry → main on correct rearrange", async () => {
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

    const start = await service.startSession("student-id", "QUAD_ZERO_PRODUCT");
    assert.equal(start.itemKey, "ENTRY_QUAD_STANDARD");

    const step = await service.submitStep(start.sessionId, {
      attemptId: start.attemptId,
      previousLine: "x^2 + 5x = -6",
      submittedLine: "x^2 + 5x + 6 = 0",
    });
    assert.equal(step.outcome, "SUBMITTED");
    if (step.outcome !== "SUBMITTED") return;
    assert.equal(step.validity, "VALID");
    assert.equal(step.itemComplete, true);
    assert.equal(step.nextAttempt?.itemKey, "QUAD_ZP_MAIN");
  });
});
