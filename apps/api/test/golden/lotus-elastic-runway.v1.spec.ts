/**
 * Golden Test Suite: Elastic Runway Insertion — Expansion Without Cannibalization
 *
 * Verifies:
 * 1. planAdjustments generates an INSERT_ELASTIC_PROBE action when an ambiguous slip occurs on Q8
 *    without pruning or skipping downstream slots 9–15.
 * 2. insertElasticProbe splices in the surgical probe (e.g. Q8.5) at afterTurn + 1, shifting subsequent turns,
 *    and setting isElasticProbe = true and parentSlot.
 * 3. Total turns expand cleanly from 15 to 16 (or 17) without deleting downstream topics.
 * 4. Elastic probe ceiling: enforces maximum of 2 probes (ceiling at 17 turns).
 * 5. Downstream curriculum slots (Difference of Squares, Quadratics) remain intact with status: "PLANNED".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type FactorisationState,
  type SkillLedgerEntry,
  planAdjustments,
  insertElasticProbe,
} from "../../src/lotus/lotus-factorisation";
import {
  CANONICAL_15_SPINE,
  FACTORISATION_SLOTS,
} from "../../src/lotus/lotus-factorisation-catalogue";

function make15TurnSpine(): FactorisationState {
  return {
    topic: "FACTORISATION",
    planTurn: 8,
    turns: CANONICAL_15_SPINE.map((spec, i) => ({
      turn: i + 1,
      slot: spec.slot,
      status: "PLANNED" as const,
      version: 0,
    })),
    answeredTurns: [1, 2, 3, 4, 5, 6, 7, 8],
    handledConfirmed: [],
    handledBroadened: [],
    fastSkips: 0,
  };
}

describe("Elastic Runway Insertion — Expansion Without Cannibalization", () => {
  it("generates an INSERT_ELASTIC_PROBE action on ambiguous slip at Q8 without pruning downstream slots 9 to 15", () => {
    const state = make15TurnSpine();

    // Ambiguous grouping slip on Q8 (FAC_GROUP_SIGN or FAC_GROUP_TERMS)
    const ledger = new Map<string, SkillLedgerEntry>([
      [
        "FAC_GROUP_TERMS",
        {
          skillId: "FAC_GROUP_TERMS",
          state: "SUSPECTED",
          suspectedAt: 8,
          mistakes: ["PAIRS_SHARE_NOTHING"],
          notes: ["Q8: ambiguous grouping mistake"],
          sightings: [{ how: "mistake", mistake: "PAIRS_SHARE_NOTHING" }],
        },
      ],
    ]);

    const actions = planAdjustments({
      state,
      ledger,
      itemAt: (t) => {
        const turnObj = state.turns.find((cand) => cand.turn === t);
        if (!turnObj) return undefined;
        const spec = CANONICAL_15_SPINE.find((s) => s.slot === turnObj.slot);
        if (!spec) return undefined;
        return {
          id: `item-${t}`,
          phase: "DIAGNOSTIC",
          subtopic: spec.skillId,
          prompt: `Factorise: ${spec.shape}`,
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "ans",
            workedSolution: ["ans"],
            diagnostics: {
              slot: spec.slot,
              itemKind: "FACTORISE",
              expression: spec.shape,
              skillId: spec.skillId,
              taggedSkills: [],
              stepSkills: [],
              predictedMistakes: [],
              level: "medium",
              origin: "CODE",
            },
          },
        };
      },
      askedItems: [],
    });

    const insertAction = actions.find((a) => a.kind === "INSERT_ELASTIC_PROBE");
    assert.ok(insertAction, "planAdjustments must generate an INSERT_ELASTIC_PROBE action");
    assert.equal(insertAction?.afterTurn, 8);
    assert.equal(insertAction?.parentSlot, 8);
    assert.equal(insertAction?.probeSlot, 8.5);
    assert.equal(insertAction?.forSkill, "FAC_GROUP_TERMS");

    // Downstream slots 9 to 15 must NOT have SKIP actions
    const skipActions = actions.filter((a) => a.kind === "SKIP");
    assert.equal(skipActions.length, 0, "No downstream slots should be skipped or deleted");
  });

  it("insertElasticProbe splices in the surgical probe, shifts subsequent turns, and sets probe metadata", () => {
    const state = make15TurnSpine();
    assert.equal(state.turns.length, 15);

    const probeSpec = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_GROUP_TERMS") ?? {
      slot: 8.5,
      skillId: "FAC_GROUP_TERMS",
      kind: "FACTORISE" as const,
      level: "medium" as const,
      phase: "DIAGNOSTIC" as const,
      shape: "2xy + 3x + 4y + 6",
    };

    const probeTurn = insertElasticProbe(state, {
      afterTurn: 8,
      spec: probeSpec,
      parentSlot: 8,
      probeSlot: 8.5,
      purpose: "CHECK",
      targetMistake: "PAIRS_SHARE_NOTHING",
    });

    // 1. Turns length must expand from 15 to 16
    assert.equal(state.turns.length, 16);

    // 2. Probe turn metadata
    assert.equal(probeTurn.turn, 9);
    assert.equal(probeTurn.slot, 8.5);
    assert.equal(probeTurn.isElasticProbe, true);
    assert.equal(probeTurn.parentSlot, 8);
    assert.equal(probeTurn.probeLabel, "Q8.5");
    assert.equal(probeTurn.status, "PLANNED");

    // 3. Shift of subsequent turns: what was Turn 9 (slot 9) is now Turn 10
    const turn10 = state.turns.find((t) => t.turn === 10);
    assert.ok(turn10);
    assert.equal(turn10?.slot, 9, "Original slot 9 must now be turn 10");

    // 4. Downstream slots 9 to 15 remain completely intact
    for (let s = 9; s <= 15; s++) {
      const found = state.turns.find((t) => t.slot === s);
      assert.ok(found, `Slot ${s} must remain in state.turns`);
      assert.equal(found?.status, "PLANNED", `Slot ${s} must be PLANNED`);
    }
  });

  it("allows a second elastic probe but respects the 2-probe ceiling (turns.length <= 17)", () => {
    const state = make15TurnSpine();

    const probeSpec = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_GROUP_TERMS") ?? {
      slot: 8.5,
      skillId: "FAC_GROUP_TERMS",
      kind: "FACTORISE" as const,
      level: "medium" as const,
      phase: "DIAGNOSTIC" as const,
      shape: "2xy + 3x + 4y + 6",
    };

    // First probe at Turn 8
    insertElasticProbe(state, {
      afterTurn: 8,
      spec: probeSpec,
      parentSlot: 8,
      probeSlot: 8.5,
    });
    assert.equal(state.turns.length, 16);

    // Second probe at Turn 11 (e.g. Q10.5 for difference of squares)
    const diffSqSpec = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_DIFF_SQUARES") ?? {
      slot: 10.5,
      skillId: "FAC_DIFF_SQUARES",
      kind: "FACTORISE" as const,
      level: "medium" as const,
      phase: "DIAGNOSTIC" as const,
      shape: "16x^2 - 25",
    };

    insertElasticProbe(state, {
      afterTurn: 11,
      spec: diffSqSpec,
      parentSlot: 10,
      probeSlot: 10.5,
    });
    assert.equal(state.turns.length, 17);

    // Now 2 elastic probes exist: elasticCount === 2
    const elasticCount = state.turns.filter((t) => t.isElasticProbe).length;
    assert.equal(elasticCount, 2);

    // Verify planAdjustments will NOT generate a 3rd elastic probe
    state.planTurn = 13;
    const ledger = new Map<string, SkillLedgerEntry>([
      [
        "FAC_MONIC_TRINOMIAL",
        {
          skillId: "FAC_MONIC_TRINOMIAL",
          state: "SUSPECTED",
          suspectedAt: 13,
          mistakes: ["WRONG_FACTOR_PAIR_SUM"],
          notes: ["Q13 mistake"],
          sightings: [{ how: "mistake", mistake: "WRONG_FACTOR_PAIR_SUM" }],
        },
      ],
    ]);

    const actions = planAdjustments({
      state,
      ledger,
      itemAt: () => undefined,
      askedItems: [],
    });

    const thirdProbeAction = actions.find((a) => a.kind === "INSERT_ELASTIC_PROBE");
    assert.equal(thirdProbeAction, undefined, "Must enforce 2-probe ceiling and not insert a 3rd elastic probe");
  });

  it("is idempotent: after probe is inserted, subsequent planAdjustments does not insert duplicate probes", () => {
    const state = make15TurnSpine();
    const ledger = new Map<string, SkillLedgerEntry>([
      [
        "FAC_GROUP_TERMS",
        {
          skillId: "FAC_GROUP_TERMS",
          state: "SUSPECTED",
          suspectedAt: 8,
          mistakes: ["PAIRS_SHARE_NOTHING"],
          notes: ["Q8: ambiguous grouping mistake"],
          sightings: [{ how: "mistake", mistake: "PAIRS_SHARE_NOTHING" }],
        },
      ],
    ]);

    const probeSpec = FACTORISATION_SLOTS.find((s) => s.skillId === "FAC_GROUP_TERMS")!;
    insertElasticProbe(state, {
      afterTurn: 8,
      spec: probeSpec,
      parentSlot: 8,
      probeSlot: 8.5,
      purpose: "CHECK",
    });

    // Run planAdjustments again
    const actions = planAdjustments({
      state,
      ledger,
      itemAt: () => undefined,
      askedItems: [],
    });

    const dupAction = actions.find((a) => a.kind === "INSERT_ELASTIC_PROBE");
    assert.equal(dupAction, undefined, "Should not insert duplicate elastic probe when one is already scheduled");
  });
});
