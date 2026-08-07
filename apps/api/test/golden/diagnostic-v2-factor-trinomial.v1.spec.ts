/**
 * Phase B3 — factor-trinomial verifier + thin track smoke.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  factorQuadraticInteger,
  parseLinearFactorPair,
  parseQuadraticPoly,
  verifyFactorStepValidity,
} from "../../src/engines/diagnostic-v2/factor-trinomial-verifier";
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

describe("factor-trinomial-verifier", () => {
  it("parses monic and non-monic quadratics and factor pairs", () => {
    assert.deepEqual(parseQuadraticPoly("x^2 + 5x + 6"), {
      a: 1,
      b: 5,
      c: 6,
      variable: "x",
    });
    assert.deepEqual(parseQuadraticPoly("x^2 - x - 6"), {
      a: 1,
      b: -1,
      c: -6,
      variable: "x",
    });
    assert.deepEqual(parseQuadraticPoly("2x^2 - 5x - 3"), {
      a: 2,
      b: -5,
      c: -3,
      variable: "x",
    });
    assert.deepEqual(parseLinearFactorPair("(2x + 1)(x - 3)"), {
      variable: "x",
      p: 2,
      q: 1,
      r: 1,
      s: -3,
    });
  });

  it("independently factors the owner non-monic example", () => {
    const f = factorQuadraticInteger({ a: 2, b: -5, c: -3, variable: "x" });
    assert.ok(f);
    // Canonical form prefers positive leading coeffs; either order is fine.
    const ok =
      (f!.p === 2 && f!.q === 1 && f!.r === 1 && f!.s === -3) ||
      (f!.p === 1 && f!.q === -3 && f!.r === 2 && f!.s === 1);
    assert.equal(ok, true, `got (${f!.p}x+${f!.q})(${f!.r}x+${f!.s})`);
  });

  it("accepts correct monic factorisation (either order)", () => {
    const v = verifyFactorStepValidity("x^2 + 5x + 6", "(x + 2)(x + 3)");
    assert.equal(v.validity, "VALID");
    const swapped = verifyFactorStepValidity("x^2 + 5x + 6", "(x + 3)(x + 2)");
    assert.equal(swapped.validity, "VALID");
  });

  it("accepts correct non-monic factorisation", () => {
    const v = verifyFactorStepValidity("2x^2 - 5x - 3", "(2x + 1)(x - 3)");
    assert.equal(v.validity, "VALID");
  });

  it("flags right product / wrong sum", () => {
    const v = verifyFactorStepValidity("x^2 + 5x + 6", "(x + 1)(x + 6)");
    assert.equal(v.validity, "INVALID");
    assert.equal(v.firstInvalidActionCode, "WRONG_FACTOR_PAIR_SUM");
  });

  it("flags right sum / wrong product", () => {
    const v = verifyFactorStepValidity("x^2 + 5x + 6", "(x + 0)(x + 5)");
    // (x+0)(x+5) may parse; product 0 ≠ 6, sum 5
    assert.equal(v.validity, "INVALID");
    assert.ok(
      v.firstInvalidActionCode === "WRONG_FACTOR_PAIR_PRODUCT" ||
        v.firstInvalidActionCode === "EXPAND_CHECK_FAIL",
    );
  });

  it("flags sign error on otherwise-correct pair", () => {
    const v = verifyFactorStepValidity("x^2 + 5x + 6", "(x - 2)(x - 3)");
    assert.equal(v.validity, "INVALID");
    assert.equal(v.firstInvalidActionCode, "SIGN_ERROR_MIDDLE_SPLIT");
  });

  it("flags incomplete factorisation", () => {
    const v = verifyFactorStepValidity("2x^2 - 5x - 3", "2(x^2 - 2.5x - 1.5)");
    assert.equal(v.validity, "INVALID");
    assert.equal(v.firstInvalidActionCode, "INCOMPLETE_FACTORISATION");
  });

  it("accepts expand of a product into a quadratic", () => {
    const v = verifyFactorStepValidity("(x + 2)(x + 3)", "x^2 + 5x + 6");
    assert.equal(v.validity, "VALID");
  });
});

describe("B3 factor track wiring", () => {
  it("fixed items verify and track order is locked", () => {
    for (const key of [
      "ENTRY_FACTOR_EXPAND",
      "FAC_MONIC_MAIN",
      "FAC_MONIC_CONTRAST",
      "TRANSFER_FAC_NONMONIC",
    ]) {
      const item = findFixedItem(key);
      assert.ok(item, key);
      assert.equal(verifyRendered(item!).passed, true, key);
    }
    assert.equal(firstStageForTrack("FACTOR_MONIC_TRINOMIAL"), "ENTRY_FACTOR_EXPAND");
    assert.deepEqual(itemStageOrderForTrack("FACTOR_MONIC_TRINOMIAL"), [
      "ENTRY_FACTOR_EXPAND",
      "FAC_MONIC_MAIN",
      "FAC_MONIC_CONTRAST",
      "TRANSFER_FAC_NONMONIC",
    ]);
    assert.deepEqual(
      nextStagesAfter("FAC_MONIC_MAIN", {
        targetSkillFailed: false,
        patternConfirmed: false,
      }),
      ["TRANSFER_FAC_NONMONIC"],
    );
    assert.deepEqual(
      nextStagesAfter("FAC_MONIC_MAIN", {
        targetSkillFailed: true,
        patternConfirmed: false,
      }),
      ["FAC_MONIC_CONTRAST"],
    );
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

    const start = await service.startSession("student-id", "FACTOR_MONIC_TRINOMIAL");
    assert.equal(start.itemKey, "ENTRY_FACTOR_EXPAND");

    const step = await service.submitStep(start.sessionId, {
      attemptId: start.attemptId,
      previousLine: "(x + 2)(x + 3)",
      submittedLine: "x^2 + 5x + 6",
    });
    assert.equal(step.outcome, "SUBMITTED");
    if (step.outcome !== "SUBMITTED") return;
    assert.equal(step.validity, "VALID");
    assert.equal(step.itemComplete, true);
    assert.equal(step.nextAttempt?.itemKey, "FAC_MONIC_MAIN");
  });
});
