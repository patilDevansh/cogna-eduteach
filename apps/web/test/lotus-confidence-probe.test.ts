import { test } from "node:test";
import { strict as assert } from "node:assert";
import { shouldAskLotusConfidence } from "../src/lib/lotus-confidence-probe";

test("confidence probes require a reason and never duplicate an explicit don't-know", () => {
  assert.equal(shouldAskLotusConfidence(false, false, []), false);
  assert.equal(shouldAskLotusConfidence(true, true, []), false);
  assert.equal(shouldAskLotusConfidence(true, false, []), true);
});
test("recent reported and skipped prompts suppress repetition, but old prompts don't", () => {
  assert.equal(shouldAskLotusConfidence(true, false, ["REPORTED_BEFORE_ANSWER", "NOT_ASKED"]), false);
  assert.equal(shouldAskLotusConfidence(true, false, ["SKIPPED"]), false);
  assert.equal(shouldAskLotusConfidence(true, false, ["SKIPPED", "NOT_ASKED", "NOT_ASKED"]), true);
});
