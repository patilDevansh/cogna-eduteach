/**
 * Core problem C6 (Cogna Project Hub): a possible gap is cleared by one
 * correct answer even when that question could not show the mistake.
 *
 * Probes live outside test/golden on purpose: each one states what the
 * product SHOULD do, so it fails while the core problem is open and passes
 * once it is fixed. Run with:
 *   cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { foldLedger } from "../../src/lotus/lotus-factorisation";
import { FACTORISATION_SLOTS } from "../../src/lotus/lotus-factorisation-catalogue";

/** The fields foldLedger reads: the evidence, and which mistakes the question was built to catch. */
const turn = (skillEvidence: unknown[], predictedMistakes: string[] = []) => ({
  skillEvidence,
  question: { answerKey: { diagnostics: { skillId: "FAC_PAIR_PRODUCT_SUM", predictedMistakes: predictedMistakes.map((mistake) => ({ answer: "?", mistake })) } } },
}) as unknown as LotusQuestionAudit;

describe("C6: clearing a possible gap needs a question that could show the mistake", () => {
  it("the slots behind the Aarav run: Q12 can show a sign-pair mistake, Q13 cannot", () => {
    const q12 = FACTORISATION_SLOTS.find((s) => s.shape === "Which two numbers have a product of 12 and a sum of -7?")!;
    const q13 = FACTORISATION_SLOTS.find((s) => s.shape === "x^2 + 5x + 6")!;
    assert.ok(q12.mistakes.includes("SIGN_PAIR_ERROR"), "Q12 is built to catch sign-pair mistakes");
    assert.ok(!q13.mistakes.includes("SIGN_PAIR_ERROR"), "Q13 has only positive numbers, so it can't catch one");
    assert.ok(q13.tagged.includes("FAC_PAIR_PRODUCT_SUM"), "but Q13 still uses the same skill");
  });

  it("a sign-pair mistake stays a possible gap after a correct all-positive answer", () => {
    const ledger = foldLedger([
      // Q12: picked "3 and 4" for product 12, sum -7.
      turn([{ skillId: "FAC_PAIR_PRODUCT_SUM", kind: "MISTAKE", mistake: "SIGN_PAIR_ERROR", source: "INSTANT" }], ["SIGN_PAIR_ERROR", "WRONG_FACTOR_PAIR_SUM"]),
      // Q13: x² + 5x + 6 answered correctly. Right, but no negative numbers anywhere.
      turn([{ skillId: "FAC_PAIR_PRODUCT_SUM", kind: "SECURE", source: "INSTANT" }], ["WRONG_FACTOR_PAIR_SUM", "PRODUCT_SUM_SWAPPED"]),
    ]);
    const state = ledger.get("FAC_PAIR_PRODUCT_SUM")?.state;
    assert.notEqual(state, "SECURE",
      `the sign-pair suspicion was cleared (state=${state}) by a question with no negative numbers; ` +
      "it should stay SUSPECTED until a question that can show the sign mistake is answered correctly");
  });

  it("a correct answer on a question that can show the sign mistake does clear it", () => {
    const ledger = foldLedger([
      turn([{ skillId: "FAC_PAIR_PRODUCT_SUM", kind: "MISTAKE", mistake: "SIGN_PAIR_ERROR", source: "INSTANT" }], ["SIGN_PAIR_ERROR"]),
      turn([{ skillId: "FAC_PAIR_PRODUCT_SUM", kind: "SECURE", source: "INSTANT" }], ["WRONG_FACTOR_PAIR_SUM", "PRODUCT_SUM_SWAPPED"]),
      turn([{ skillId: "FAC_PAIR_PRODUCT_SUM", kind: "SECURE", source: "INSTANT" }], ["SIGN_PAIR_ERROR", "WRONG_FACTOR_PAIR_SUM"]),
    ]);
    assert.equal(ledger.get("FAC_PAIR_PRODUCT_SUM")?.state, "SECURE");
  });
});
