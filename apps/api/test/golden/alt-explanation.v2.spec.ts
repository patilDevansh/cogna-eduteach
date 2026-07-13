import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evidenceAgeWeight,
  isAlternativeExplanationDominant,
} from "../../src/engines/diagnostic-engine/diagnostic-formulas";

/**
 * R14 — Alternative explanation not dominant
 * Spec (README_RULES §2): alternativeExplanationDominant = true iff an
 * alternative E has higher weightedMatchingCount than primary P, OR equal
 * count with confidence(E) >= confidence(P).
 *
 * Expected exports from diagnostic-formulas (parent may land in parallel):
 *   isAlternativeExplanationDominant(...)
 *   evidenceAgeWeight(daysOld)
 */
describe("R14 — Alternative explanation not dominant", () => {
  it("SIGN_HANDLING vs ARITHMETIC_SLIP → dominant=true for SIGN_HANDLING primary", () => {
    const dominant = isAlternativeExplanationDominant({
      primary: {
        misconceptionId: "SIGN_HANDLING",
        weightedMatchingCount: 2,
        confidence: 0.65,
      },
      alternatives: [
        {
          misconceptionId: "ARITHMETIC_SLIP",
          weightedMatchingCount: 2,
          confidence: 0.7,
        },
      ],
    });

    assert.equal(dominant, true);
  });

  it("is not dominant when primary outranks alternatives", () => {
    const dominant = isAlternativeExplanationDominant({
      primary: {
        misconceptionId: "SIGN_HANDLING",
        weightedMatchingCount: 3,
        confidence: 0.8,
      },
      alternatives: [
        {
          misconceptionId: "ARITHMETIC_SLIP",
          weightedMatchingCount: 2,
          confidence: 0.7,
        },
      ],
    });

    assert.equal(dominant, false);
  });

  it("evidenceAgeWeight: 1.0 / 0.5 / 0 by age bands", () => {
    assert.equal(evidenceAgeWeight(0), 1.0);
    assert.equal(evidenceAgeWeight(21), 1.0);
    assert.equal(evidenceAgeWeight(22), 0.5);
    assert.equal(evidenceAgeWeight(45), 0.5);
    assert.equal(evidenceAgeWeight(46), 0);
    assert.equal(evidenceAgeWeight(90), 0);
  });
});
