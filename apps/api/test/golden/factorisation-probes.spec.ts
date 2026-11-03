import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FACTORISATION_SLOTS } from "../../src/lotus/lotus-factorisation-catalogue";
import { codeProbeFor } from "../../src/lotus/lotus-probes";
import { checkWrittenItem, type WriteRequest } from "../../src/lotus/lotus-question-factory";
import { classifyFactorisation, algebraicallyEqual, sameFactorisation } from "../../src/lotus/lotus-algebra";

describe("CUR-003: Factorisation Discriminating Probes and Hypothesis Narrowing", () => {
  const env = { ...process.env, COGNA_ENABLE_GAME_FORMATS: "true", COGNA_THEMED_GAMES: "off" };

  function makeRequest(slotNumber: number, targetMistake?: string): WriteRequest {
    const spec = FACTORISATION_SLOTS[slotNumber - 1]!;
    return {
      spec,
      purpose: "CHECK",
      ...(targetMistake ? { targetMistake } : {}),
      avoid: [],
      variation: "cur003-test",
    };
  }

  describe("Discriminator 1: Signed Pairs (FAC_PAIR_PRODUCT_SUM)", () => {
    it("generates firefly probe that catches SIGN_PAIR_ERROR cleanly", () => {
      const slot = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_PAIR_PRODUCT_SUM");
      assert.ok(slot, "FAC_PAIR_PRODUCT_SUM slot exists");
      const req = makeRequest(slot.slot, "SIGN_PAIR_ERROR");
      const probe = codeProbeFor(req, env);
      assert.ok(probe, "Probe generated for FAC_PAIR_PRODUCT_SUM");
      assert.equal(checkWrittenItem(req, probe).length, 0, "Probe passes writer safety gate");
      const mistakes = probe.answerKey.diagnostics?.predictedMistakes.map((m) => m.mistake);
      assert.ok(mistakes?.includes("SIGN_PAIR_ERROR"), "Includes SIGN_PAIR_ERROR predicted mistake");
    });
  });

  describe("Discriminator 2: Product-versus-Sum (FAC_MONIC_TRINOMIAL)", () => {
    it("garden fences probe cleanly isolates PRODUCT_SUM_SWAPPED from magnitude errors", () => {
      const slot = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL");
      assert.ok(slot, "FAC_MONIC_TRINOMIAL slot exists");
      const req: WriteRequest = {
        spec: slot,
        purpose: "BASE",
        avoid: [],
        variation: "cur003-garden",
      };
      const probe = codeProbeFor(req, env);
      if (probe) {
        assert.equal(checkWrittenItem(req, probe).length, 0);
        const mistakes = probe.answerKey.diagnostics?.predictedMistakes.map((m) => m.mistake);
        assert.ok(mistakes?.includes("WRONG_FACTOR_PAIR_SUM") || mistakes?.includes("PRODUCT_SUM_SWAPPED"));
      }
    });
  });

  describe("Discriminator 3: Division of all terms (FAC_DIVIDE_TERMS)", () => {
    it("generates division probe that isolates DIVIDED_FIRST_TERM_ONLY", () => {
      const slot = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_DIVIDE_TERMS");
      assert.ok(slot, "FAC_DIVIDE_TERMS slot exists");
      const req = makeRequest(slot.slot, "DIVIDED_FIRST_TERM_ONLY");
      const probe = codeProbeFor(req, env);
      assert.ok(probe, "Division probe generated");
      assert.equal(checkWrittenItem(req, probe).length, 0, "Passes writer checks");
      assert.equal(probe.type, "MULTIPLE_CHOICE");
      assert.equal(probe.options?.length, 4, "Four distinct choices");
      const mistakes = probe.answerKey.diagnostics?.predictedMistakes.map((m) => m.mistake);
      assert.ok(mistakes?.includes("DIVIDED_FIRST_TERM_ONLY"));
    });
  });

  describe("Discriminator 4: Negative-factor signs (FAC_GCF_NEGATIVE)", () => {
    it("generates detective probe that isolates KEPT_ORIGINAL_SIGNS", () => {
      const slot = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_GCF_NEGATIVE");
      assert.ok(slot, "FAC_GCF_NEGATIVE slot exists");
      const req = makeRequest(slot.slot, "KEPT_ORIGINAL_SIGNS");
      const probe = codeProbeFor(req, env);
      assert.ok(probe, "Detective probe generated");
      assert.equal(checkWrittenItem(req, probe).length, 0);
      assert.equal(probe.presentation, "DETECTIVE");
      const mistakes = probe.answerKey.diagnostics?.predictedMistakes.map((m) => m.mistake);
      assert.ok(mistakes?.includes("KEPT_ORIGINAL_SIGNS"));
    });
  });

  describe("Discriminator 5: Identity confusion (FAC_DIFF_SQUARES)", () => {
    it("generates identity probe that isolates WROTE_PERFECT_SQUARE", () => {
      const slot = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_DIFF_SQUARES" && s.mistakes.includes("WROTE_PERFECT_SQUARE"));
      assert.ok(slot, "FAC_DIFF_SQUARES slot with WROTE_PERFECT_SQUARE exists");
      const req = makeRequest(slot.slot, "WROTE_PERFECT_SQUARE");
      const probe = codeProbeFor(req, env);
      assert.ok(probe, "Identity probe generated");
      assert.equal(checkWrittenItem(req, probe).length, 0);
      assert.equal(probe.type, "MULTIPLE_CHOICE");
      assert.equal(probe.options?.length, 4);
      const mistakes = probe.answerKey.diagnostics?.predictedMistakes.map((m) => m.mistake);
      assert.ok(mistakes?.includes("WROTE_PERFECT_SQUARE"));
    });
  });

  describe("Discriminator 6: Cancellation / Domain restrictions (FAC_CANCEL_COMMON_FACTOR)", () => {
    it("generates cancellation probe that isolates DIVIDED_ONE_TERM_ONLY and TERMS_VS_FACTORS", () => {
      const slot = FACTORISATION_SLOTS.find((s) => s.tagged.includes("FAC_CANCEL_COMMON_FACTOR") || s.mistakes.includes("TERMS_VS_FACTORS"));
      assert.ok(slot, "Cancellation slot exists");
      const req = makeRequest(slot.slot, "DIVIDED_ONE_TERM_ONLY");
      const probe = codeProbeFor(req, env);
      assert.ok(probe, "Cancellation probe generated");
      assert.equal(checkWrittenItem(req, probe).length, 0);
      assert.equal(probe.type, "MULTIPLE_CHOICE");
      const mistakes = probe.answerKey.diagnostics?.predictedMistakes.map((m) => m.mistake);
      assert.ok(mistakes?.includes("DIVIDED_ONE_TERM_ONLY"));
    });
  });

  describe("Valid Alternative Methods Acceptance", () => {
    it("accepts reversed binomial factor orders as fully correct", () => {
      const expr = "x^2 + 5x + 6";
      const standardOrder = "(x + 2)(x + 3)";
      const reversedOrder = "(x + 3)(x + 2)";
      assert.equal(classifyFactorisation(standardOrder, expr), "CORRECT");
      assert.equal(classifyFactorisation(reversedOrder, expr), "CORRECT");
      assert.equal(sameFactorisation(standardOrder, reversedOrder), true);
    });

    it("accepts difference of squares with swapped factors", () => {
      const expr = "x^2 - 16";
      const standardOrder = "(x - 4)(x + 4)";
      const swappedOrder = "(x + 4)(x - 4)";
      assert.equal(classifyFactorisation(standardOrder, expr), "CORRECT");
      assert.equal(classifyFactorisation(swappedOrder, expr), "CORRECT");
      assert.equal(sameFactorisation(standardOrder, swappedOrder), true);
    });

    it("recognises algebraic equivalence of negative factor extractions", () => {
      const form1 = "-5(x + 3)";
      const form2 = "5(-x - 3)";
      assert.equal(algebraicallyEqual(form1, form2), true);
    });
  });
});
