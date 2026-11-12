import assert from "node:assert/strict";
import { test } from "node:test";
import { assertFixedItemIsValid, dropInvalidPredictions } from "../../src/lotus/lotus-factorisation-catalogue";

const item = (predictedMistakes: Array<{ answer: string; mistake: string }>, canonicalAnswer = "2x^2(5 - 9x + 7x^2)") => ({
  prompt: "Factorise completely: 10x^2 - 18x^3 + 14x^4",
  answerKey: { canonicalAnswer, workedSolution: ["one"], diagnostics: { itemKind: "FACTORISE", skillId: "FAC_COMMON_MONOMIAL", taggedSkills: [], stepSkills: ["FAC_COMMON_MONOMIAL"], expression: "10x^2 - 18x^3 + 14x^4", predictedMistakes } },
});

test("a mislabelled incomplete factorisation is removed and valid guesses are kept", () => {
  const good = { answer: "2x^2(5 + 9x + 7x^2)", mistake: "SIGN_ERROR" };
  const bad = { answer: "x^2(10 - 18x + 14x^2)", mistake: "TOOK_HIGHEST_POWER" };
  const q = item([good, bad]);
  assert.equal(dropInvalidPredictions(q).length, 1);
  assert.deepEqual(q.answerKey.diagnostics.predictedMistakes, [good]);
  assert.doesNotThrow(() => assertFixedItemIsValid(q, "q"));
});

test("a 'wrong' answer that is really the right answer is removed", () => {
  const q = item([{ answer: "2x^2(5 - 9x + 7x^2)", mistake: "PARTIAL_GCF" }]);
  assert.equal(dropInvalidPredictions(q).length, 1);
  assert.equal(q.answerKey.diagnostics.predictedMistakes.length, 0);
});

test("an allowed incomplete-factorisation label stays", () => {
  const q = item([{ answer: "x^2(10 - 18x + 14x^2)", mistake: "PARTIAL_GCF" }]);
  assert.equal(dropInvalidPredictions(q).length, 0);
});

test("a question with a wrong answer key is left for the full check to reject", () => {
  const q = item([{ answer: "x^2(10 - 18x + 14x^2)", mistake: "TOOK_HIGHEST_POWER" }], "2x^2(5 + 9x + 7x^2)");
  assert.equal(dropInvalidPredictions(q).length, 0);
  assert.throws(() => assertFixedItemIsValid(q, "q"));
});
