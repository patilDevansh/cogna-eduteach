/**
 * B1.5 — AUTHOR gate for fraction-linear grammar.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gateAuthoredItem } from "../../src/engines/diagnostic-v2/diagnostic-v2-authoring";
import type { DiagnosticV2AuthoredItem } from "@cogna/shared";

function authored(overrides: Partial<DiagnosticV2AuthoredItem> = {}): DiagnosticV2AuthoredItem {
  return {
    equation: "(x + 1)/2 = (x - 1)/3 + 1",
    claimedSolution: "x = 1",
    targetMicroSkillId: "LIN_CLEAR_FRACTIONS",
    whyNoTemplateFits: "need a clear-fractions item with dens 2 and 5 which the template pool does not offer",
    ...overrides,
  };
}

describe("B1.5 gateAuthoredItem — fraction accept", () => {
  it("accepts a well-formed clear-fractions equation with matching claimed solution", () => {
    const result = gateAuthoredItem({
      authored: authored(),
      stageId: "FRAC_CLEAR_MAIN",
      isTransferCheck: false,
      alreadyServed: new Set(),
    });
    assert.equal(result.passed, true);
    if (!result.passed) return;
    assert.equal(result.item.origin, "AI_AUTHORED");
    assert.equal(result.item.primaryMicroSkillId, "LIN_CLEAR_FRACTIONS");
    assert.equal(result.solution, "x = 1");
  });

  it("accepts a simple fraction solve tagged LIN_SOLVE_FRACTIONS", () => {
    const result = gateAuthoredItem({
      authored: authored({
        equation: "x/2 + 3 = 7",
        claimedSolution: "x = 8",
        targetMicroSkillId: "LIN_SOLVE_FRACTIONS",
      }),
      stageId: "ENTRY_FRAC_SIMPLE",
      isTransferCheck: false,
      alreadyServed: new Set(),
    });
    assert.equal(result.passed, true);
    if (!result.passed) return;
    assert.equal(result.item.primaryMicroSkillId, "LIN_SOLVE_FRACTIONS");
  });
});

describe("B1.5 gateAuthoredItem — fraction reject", () => {
  it("rejects claimed answer mismatch", () => {
    const result = gateAuthoredItem({
      authored: authored({ claimedSolution: "x = 99" }),
      stageId: "FRAC_CLEAR_MAIN",
      isTransferCheck: false,
      alreadyServed: new Set(),
    });
    assert.equal(result.passed, false);
    if (result.passed) return;
    assert.equal(result.rejection.code, "CLAIMED_ANSWER_MISMATCH");
  });

  it("rejects LIN_CLEAR_FRACTIONS on an equation with no fraction syntax", () => {
    const result = gateAuthoredItem({
      authored: authored({
        equation: "2x + 3 = 11",
        claimedSolution: "x = 4",
        targetMicroSkillId: "LIN_CLEAR_FRACTIONS",
      }),
      stageId: "FRAC_CLEAR_MAIN",
      isTransferCheck: false,
      alreadyServed: new Set(),
    });
    assert.equal(result.passed, false);
    if (result.passed) return;
    assert.equal(result.rejection.code, "SKILL_NOT_EXERCISED");
  });
});
