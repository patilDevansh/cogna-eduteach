import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FACTORISATION_REFERENCE_PACK_V1 } from "../../src/lotus/packs/factorisation-reference-pack";
import { classifyFactorisation, algebraicallyEqual } from "../../src/lotus/lotus-algebra";

describe("CUR-009: Factorisation Reference Question Pack Verification", () => {
  const pack = FACTORISATION_REFERENCE_PACK_V1;

  it("records explicit version, subskill, and coverage limit metadata", () => {
    assert.equal(pack.metadata.packId, "PACK_MATH_8_FACT_MONIC_TRINOMIAL");
    assert.equal(pack.metadata.version, "1.0.0");
    assert.equal(pack.metadata.subskillId, "FAC_MONIC_TRINOMIAL");
    assert.ok(pack.metadata.coverageLimitStatement.includes("strictly covers monic quadratic trinomial factorisation"));
    assert.equal(pack.metadata.totalItems, 21);
  });

  describe("1. Worked Examples (Reviewed Walkthroughs)", () => {
    it("has 3 structured worked examples with valid factorisations", () => {
      assert.equal(pack.workedExamples.length, 3);
      for (const ex of pack.workedExamples) {
        assert.ok(ex.steps.length >= 3, `${ex.id} has at least 3 steps`);
        assert.ok(ex.commonTrap.length > 10, `${ex.id} defines a common trap`);
        const expr = ex.problem.replace("Factorise ", "");
        assert.equal(classifyFactorisation(ex.finalAnswer, expr), "CORRECT", `${ex.id} finalAnswer matches problem`);
      }
    });
  });

  describe("2. Supported Practice (Scaffolded Items)", () => {
    it("has 6 practice items with graduated hints and verified factorisations", () => {
      assert.equal(pack.supportedPractice.length, 6);
      for (const item of pack.supportedPractice) {
        assert.equal(classifyFactorisation(item.canonicalAnswer, item.expression), "CORRECT", `${item.id} canonical answer is correct`);
        assert.ok(item.hints.length >= 2, `${item.id} has graduated hints`);
        for (const mistake of item.predictedMistakes) {
          assert.notEqual(classifyFactorisation(mistake.answer, item.expression), "CORRECT", `${item.id} predicted mistake ${mistake.mistake} must be incorrect`);
        }
      }
    });
  });

  describe("3. Fresh Independent Exit Checks (Strict Unscaffolded Mastery)", () => {
    it("has 4 independent exit check items with verified factorisations and predicted mistakes", () => {
      assert.equal(pack.exitChecks.length, 4);
      for (const exit of pack.exitChecks) {
        assert.equal(exit.isIndependentScored, true);
        assert.equal(classifyFactorisation(exit.canonicalAnswer, exit.expression), "CORRECT", `${exit.id} canonical answer is correct`);
        for (const mistake of exit.predictedMistakes) {
          assert.notEqual(classifyFactorisation(mistake.answer, exit.expression), "CORRECT", `${exit.id} mistake ${mistake.mistake} must be incorrect`);
        }
      }
    });
  });

  describe("4. Held-Out Delayed Review (Retention Verification)", () => {
    it("has 4 delayed review items isomorphic to exit checks with altered surface numbers", () => {
      assert.equal(pack.delayedReviews.length, 4);
      const exitIds = pack.exitChecks.map((e) => e.id);
      for (const delayed of pack.delayedReviews) {
        assert.ok(exitIds.includes(delayed.isomorphicToExitId), `${delayed.id} maps to valid exit check`);
        assert.equal(delayed.retentionWindowDays, 7);
        assert.equal(classifyFactorisation(delayed.canonicalAnswer, delayed.expression), "CORRECT", `${delayed.id} canonical answer is correct`);
        for (const mistake of delayed.predictedMistakes) {
          assert.notEqual(classifyFactorisation(mistake.answer, delayed.expression), "CORRECT", `${delayed.id} mistake must be incorrect`);
        }
      }
    });

    it("verifies isomorphic structural sign patterns between exit and delayed items", () => {
      // Exit 1: (+, +) -> Delayed 1: (+, +)
      assert.match(pack.exitChecks[0]!.canonicalAnswer, /\(x \+ \d+\)\(x \+ \d+\)/);
      assert.match(pack.delayedReviews[0]!.canonicalAnswer, /\(x \+ \d+\)\(x \+ \d+\)/);

      // Exit 2: (-, -) -> Delayed 2: (-, -)
      assert.match(pack.exitChecks[1]!.canonicalAnswer, /\(x - \d+\)\(x - \d+\)/);
      assert.match(pack.delayedReviews[1]!.canonicalAnswer, /\(x - \d+\)\(x - \d+\)/);

      // Exit 3: (+, -) with positive middle sum
      assert.match(pack.exitChecks[2]!.canonicalAnswer, /\(x \+ \d+\)\(x - \d+\)/);
      assert.match(pack.delayedReviews[2]!.canonicalAnswer, /\(x \+ \d+\)\(x - \d+\)/);

      // Exit 4: (-, +) with negative middle sum
      assert.match(pack.exitChecks[3]!.canonicalAnswer, /\(x - \d+\)\(x \+ \d+\)/);
      assert.match(pack.delayedReviews[3]!.canonicalAnswer, /\(x - \d+\)\(x \+ \d+\)/);
    });
  });

  describe("5. Discriminating Prerequisite Probes", () => {
    it("has 4 prerequisite probes with 4 distinct options and verified canonical answers", () => {
      assert.equal(pack.prerequisiteProbes.length, 4);
      for (const probe of pack.prerequisiteProbes) {
        assert.equal(probe.options.length, 4, `${probe.id} has 4 distinct options`);
        assert.equal(new Set(probe.options).size, 4, `${probe.id} has unique options`);
        assert.ok(probe.options.includes(probe.canonicalAnswer), `${probe.id} options include canonicalAnswer`);
        assert.ok(probe.discriminatorCode.startsWith("DISCRIM_"), `${probe.id} tags discriminator`);
      }
    });
  });
});
