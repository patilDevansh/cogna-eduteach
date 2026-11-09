/**
 * Golden Test Suite: Ceiling Escalation, Slot Mutation, and Floor Exit Guardrails
 *
 * Verifies:
 * 1. evaluateCeilingEscalation detects blitzers on Q1–Q5 (100% correct, latency <= 15s, no slips/skips),
 *    sets state.ceilingEscalated = true, and mutates slots 6–15 to FACTORISATION_STRETCH_SLOTS.
 * 2. Blitzers never exit early under STARTING_POINT_FOUND in factorisationStopReason, guaranteeing
 *    the full 15-question stretch diagnostic paper.
 * 3. Normal pacing on Q1–Q5 (average latency > 15s) stays on canonical baseline spine.
 * 4. A single slip or mistake on Q1–Q5 prevents ceiling escalation.
 * 5. Floor Exit (Mercy Stop) at Q4/Q5 triggers FLOOR_EXIT_PARALYSIS for acute foundational paralysis
 *    (0% accuracy, foundational skills, and >=3 "don't know" or >=45s freezing latency).
 * 6. Floor exit does NOT trigger if student answers even one question correctly.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import {
  type FactorisationState,
  evaluateCeilingEscalation,
  factorisationStopReason,
} from "../../src/lotus/lotus-factorisation";
import {
  CANONICAL_15_SPINE,
  FACTORISATION_STRETCH_SLOTS,
} from "../../src/lotus/lotus-factorisation-catalogue";

function makeAudit(args: {
  turn: number;
  skillId: string;
  expression: string;
  responseTimeMs: number;
  kind?: "SECURE" | "MISTAKE";
  didNotKnow?: boolean;
}): LotusQuestionAudit {
  return {
    question: {
      id: `q${args.turn}`,
      phase: "DIAGNOSTIC",
      subtopic: args.skillId,
      prompt: `Factorise: ${args.expression}`,
      type: "CONSTRUCTED_RESPONSE",
      asksForWorking: false,
      purpose: "EVIDENCE",
      answerKey: {
        kind: "OPEN_RESPONSE",
        canonicalAnswer: "ans",
        workedSolution: ["ans"],
        diagnostics: {
          slot: args.turn,
          itemKind: "FACTORISE",
          expression: args.expression,
          skillId: args.skillId,
          level: "medium",
          origin: "CODE",
        },
      },
    },
    response: {
      answer: args.didNotKnow ? "I don't know" : "ans",
      didNotKnow: args.didNotKnow ?? false,
      responseTimeMs: args.responseTimeMs,
    },
    verification: {
      status: args.kind === "MISTAKE" || args.didNotKnow ? "VERIFIED_INCORRECT" : "VERIFIED_CORRECT",
      score: args.kind === "MISTAKE" || args.didNotKnow ? 0 : 1,
    },
    skillEvidence: [
      {
        skillId: args.skillId,
        kind: args.kind ?? (args.didNotKnow ? "MISTAKE" : "SECURE"),
      },
    ],
  };
}

function makeInitialState(): FactorisationState {
  return {
    topic: "FACTORISATION",
    planTurn: 5,
    turns: CANONICAL_15_SPINE.map((spec, i) => ({
      turn: i + 1,
      slot: spec.slot,
      status: "PLANNED" as const,
      purpose: "CHECK" as const,
      forSkill: spec.skillId,
      version: 0,
    })),
    answeredTurns: [1, 2, 3, 4, 5],
    handledConfirmed: [],
    handledBroadened: [],
    fastSkips: 0,
  };
}

describe("Lotus Ceiling Escalation and Floor Exit Guardrails", () => {
  it("detects blitzer on Q1–Q5 and triggers ceiling escalation to FACTORISATION_STRETCH_SLOTS", () => {
    const state = makeInitialState();

    // 5 clean, unhedged, correct answers with fast latency (avg 8.4s)
    const audits: LotusQuestionAudit[] = [
      makeAudit({ turn: 1, skillId: "FAC_DIVIDE_TERMS", expression: "6x + 9", responseTimeMs: 7_500 }),
      makeAudit({ turn: 2, skillId: "FAC_GCF_VARIABLE", expression: "x^2 + 5x", responseTimeMs: 8_000 }),
      makeAudit({ turn: 3, skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 8_500 }),
      makeAudit({ turn: 4, skillId: "FAC_COMMON_MONOMIAL", expression: "10x^2 - 18x^3 + 14x^4", responseTimeMs: 9_000 }),
      makeAudit({ turn: 5, skillId: "FAC_GCF_NEGATIVE", expression: "-4x - 8", responseTimeMs: 9_000 }),
    ];

    const escalated = evaluateCeilingEscalation(audits, state, "CBSE");
    assert.equal(escalated, true, "evaluateCeilingEscalation should return true for blitzer");
    assert.equal(state.ceilingEscalated, true, "state.ceilingEscalated must be set to true");

    // Verify slots 6 to 15 are mutated to stretch specs
    const turn6 = state.turns.find((t) => t.turn === 6);
    assert.ok(turn6);
    assert.equal(turn6?.forSkill, "FAC_SPLIT_MIDDLE");
    assert.ok(turn6?.reason?.includes("Ceiling Escalation"));

    const turn7 = state.turns.find((t) => t.turn === 7);
    assert.ok(turn7);
    assert.equal(turn7?.forSkill, "FAC_FACTOR_FULLY");

    const turn15 = state.turns.find((t) => t.turn === 15);
    assert.ok(turn15);
    assert.equal(turn15?.forSkill, "FAC_FACTOR_FULLY");
  });

  it("blitzers never exit early under STARTING_POINT_FOUND and complete the full stretch diagnostic", () => {
    const state = makeInitialState();
    state.ceilingEscalated = true;

    // Simulate 9 completed audits (normally >=8 answers can trigger STARTING_POINT_FOUND if a gap is found)
    const audits: LotusQuestionAudit[] = [
      makeAudit({ turn: 1, skillId: "FAC_DIVIDE_TERMS", expression: "6x + 9", responseTimeMs: 8_000 }),
      makeAudit({ turn: 2, skillId: "FAC_GCF_VARIABLE", expression: "x^2 + 5x", responseTimeMs: 8_000 }),
      makeAudit({ turn: 3, skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 8_000 }),
      makeAudit({ turn: 4, skillId: "FAC_COMMON_MONOMIAL", expression: "10x^2 - 18x^3 + 14x^4", responseTimeMs: 9_000 }),
      makeAudit({ turn: 5, skillId: "FAC_GCF_NEGATIVE", expression: "-4x - 8", responseTimeMs: 9_000 }),
      makeAudit({ turn: 6, skillId: "FAC_SPLIT_MIDDLE", expression: "6x^2 - 11x - 10", responseTimeMs: 14_000 }),
      makeAudit({ turn: 7, skillId: "FAC_FACTOR_FULLY", expression: "x^4 - 81", responseTimeMs: 15_000 }),
      makeAudit({ turn: 8, skillId: "FAC_CANCEL_COMMON_FACTOR", expression: "(x^2 - 9)/(x^2 - 5x + 6)", responseTimeMs: 16_000 }),
      makeAudit({ turn: 9, skillId: "FAC_FACTOR_FULLY", expression: "a^3 - 4a", responseTimeMs: 15_000, kind: "MISTAKE" }),
    ];

    // Under normal conditions, a gap might end the test at turn 9, but ceilingEscalated must bypass it
    const stopReason = factorisationStopReason(audits, 120, 900, [], state);
    assert.equal(stopReason, null, "Blitzers must never be stopped by STARTING_POINT_FOUND");
  });

  it("normal pacing on Q1–Q5 (average latency > 15s) stays on canonical baseline spine", () => {
    const state = makeInitialState();

    // 5 correct answers, but normal/slow pacing (avg 24s)
    const audits: LotusQuestionAudit[] = [
      makeAudit({ turn: 1, skillId: "FAC_DIVIDE_TERMS", expression: "6x + 9", responseTimeMs: 22_000 }),
      makeAudit({ turn: 2, skillId: "FAC_GCF_VARIABLE", expression: "x^2 + 5x", responseTimeMs: 25_000 }),
      makeAudit({ turn: 3, skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 24_000 }),
      makeAudit({ turn: 4, skillId: "FAC_COMMON_MONOMIAL", expression: "10x^2 - 18x^3 + 14x^4", responseTimeMs: 26_000 }),
      makeAudit({ turn: 5, skillId: "FAC_GCF_NEGATIVE", expression: "-4x - 8", responseTimeMs: 23_000 }),
    ];

    const escalated = evaluateCeilingEscalation(audits, state, "CBSE");
    assert.equal(escalated, false, "Should not escalate when average latency > 15s");
    assert.equal(state.ceilingEscalated, undefined, "state.ceilingEscalated must not be true");

    // Slot 6 remains baseline FAC_MEANING
    const turn6 = state.turns.find((t) => t.turn === 6);
    assert.equal(turn6?.forSkill, "FAC_MEANING");
  });

  it("single slip on Q1–Q5 prevents ceiling escalation", () => {
    const state = makeInitialState();

    // Fast answers, but Q5 has a mistake
    const audits: LotusQuestionAudit[] = [
      makeAudit({ turn: 1, skillId: "FAC_DIVIDE_TERMS", expression: "6x + 9", responseTimeMs: 7_000 }),
      makeAudit({ turn: 2, skillId: "FAC_GCF_VARIABLE", expression: "x^2 + 5x", responseTimeMs: 7_500 }),
      makeAudit({ turn: 3, skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 8_000 }),
      makeAudit({ turn: 4, skillId: "FAC_COMMON_MONOMIAL", expression: "10x^2 - 18x^3 + 14x^4", responseTimeMs: 8_500 }),
      makeAudit({ turn: 5, skillId: "FAC_GCF_NEGATIVE", expression: "-4x - 8", responseTimeMs: 8_000, kind: "MISTAKE" }),
    ];

    const escalated = evaluateCeilingEscalation(audits, state, "CBSE");
    assert.equal(escalated, false, "Single slip on Q5 must prevent ceiling escalation");
    assert.equal(state.ceilingEscalated, undefined);
  });

  describe("Floor Exit (Mercy Stop) Guardrails", () => {
    it("triggers FLOOR_EXIT_PARALYSIS at Q4 gateway when acute paralysis occurs with >=3 'don't know'", () => {
      // 4 consecutive "don't know" responses on foundational items
      const audits: LotusQuestionAudit[] = [
        makeAudit({ turn: 1, skillId: "FAC_DIVIDE_TERMS", expression: "6x + 9", responseTimeMs: 20_000, didNotKnow: true }),
        makeAudit({ turn: 2, skillId: "FAC_GCF_VARIABLE", expression: "x^2 + 5x", responseTimeMs: 25_000, didNotKnow: true }),
        makeAudit({ turn: 3, skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 22_000, didNotKnow: true }),
        makeAudit({ turn: 4, skillId: "FAC_COMMON_MONOMIAL", expression: "10x^2 - 18x^3 + 14x^4", responseTimeMs: 18_000, didNotKnow: true }),
      ];

      const stop = factorisationStopReason(audits, 85, 900);
      assert.ok(stop, "Should trigger stop at Q4");
      assert.equal(stop?.reason, "FLOOR_EXIT_PARALYSIS");
      assert.ok(stop?.note?.includes("Acute foundational arithmetic paralysis"));
    });

    it("triggers FLOOR_EXIT_PARALYSIS at Q4 gateway when acute paralysis occurs with freezing latency (>=45s)", () => {
      // 4 wrong answers with freezing latency (avg 50s)
      const audits: LotusQuestionAudit[] = [
        makeAudit({ turn: 1, skillId: "FAC_DIVIDE_TERMS", expression: "6x + 9", responseTimeMs: 50_000, kind: "MISTAKE" }),
        makeAudit({ turn: 2, skillId: "FAC_GCF_VARIABLE", expression: "x^2 + 5x", responseTimeMs: 48_000, kind: "MISTAKE" }),
        makeAudit({ turn: 3, skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 52_000, kind: "MISTAKE" }),
        makeAudit({ turn: 4, skillId: "FAC_COMMON_MONOMIAL", expression: "10x^2 - 18x^3 + 14x^4", responseTimeMs: 55_000, kind: "MISTAKE" }),
      ];

      const stop = factorisationStopReason(audits, 205, 900);
      assert.ok(stop, "Should trigger stop at Q4");
      assert.equal(stop?.reason, "FLOOR_EXIT_PARALYSIS");
    });

    it("does NOT trigger floor exit if the student gets even one question correct", () => {
      const audits: LotusQuestionAudit[] = [
        makeAudit({ turn: 1, skillId: "FAC_DIVIDE_TERMS", expression: "6x + 9", responseTimeMs: 30_000, didNotKnow: true }),
        makeAudit({ turn: 2, skillId: "FAC_GCF_VARIABLE", expression: "x^2 + 5x", responseTimeMs: 15_000 }), // Correct!
        makeAudit({ turn: 3, skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 35_000, didNotKnow: true }),
        makeAudit({ turn: 4, skillId: "FAC_COMMON_MONOMIAL", expression: "10x^2 - 18x^3 + 14x^4", responseTimeMs: 32_000, didNotKnow: true }),
      ];

      const stop = factorisationStopReason(audits, 112, 900);
      assert.equal(stop, null, "Must not trigger floor exit when student has a correct answer");
    });
  });
});
