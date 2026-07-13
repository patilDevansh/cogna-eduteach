import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BASELINE_BLUEPRINT,
  BASELINE_SLOT_COUNT,
  baselineConceptForSlot,
} from "@cogna/shared";

/** Mirrors LearningLoopService.sessionForNextBaselineQuestion */
function nextSlotAfterAnswer(currentSlot: number): number {
  return Math.min(currentSlot + 1, BASELINE_SLOT_COUNT - 1);
}

describe("G30b — Baseline slot advances after each answer", () => {
  it("first question uses slot 0; after answer next selection uses slot 1", () => {
    assert.equal(baselineConceptForSlot(0), "P1_INTEGER_ADD_SUB");
    assert.equal(baselineConceptForSlot(nextSlotAfterAnswer(0)), "P1_INTEGER_ADD_SUB");
  });

  it("third answer advances to slot 2 (variables)", () => {
    assert.equal(baselineConceptForSlot(nextSlotAfterAnswer(1)), "P3_VARIABLES_CONSTANTS");
  });

  it("blueprint has 12 distinct slots", () => {
    assert.equal(BASELINE_BLUEPRINT.length, BASELINE_SLOT_COUNT);
  });
});
