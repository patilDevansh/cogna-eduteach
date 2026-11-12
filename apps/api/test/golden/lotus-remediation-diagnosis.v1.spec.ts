import { it } from "node:test";
import assert from "node:assert/strict";
import { calculateSkillRating, RETROACTIVE_CLEARANCE_RULES, insertElasticProbe, keepSpineIntact, type FactorisationState, type PlanAction } from "../../src/lotus/lotus-factorisation";
import { CANONICAL_15_SPINE } from "../../src/lotus/lotus-factorisation-catalogue";

it("rejects duplicate pending inserts and refuses a fifth session follow-up", () => {
  const state = { paper: "SPINE_15", planTurn: 2, turns: [1, 2, 3].map((turn) => ({ turn, slot: turn, version: 0, status: "PLANNED" })) } as FactorisationState;
  const action: PlanAction = { kind: "INSERT_ELASTIC_PROBE", turn: 3, afterTurn: 2, parentSlot: 2, probeSlot: 2.5, spec: CANONICAL_15_SPINE[0]!, purpose: "CHECK", forSkill: "FAC_DIVIDE_TERMS", reason: "test" };
  assert.equal(keepSpineIntact(state, [action, action, action], 2).length, 1);
  insertElasticProbe(state, { afterTurn: 1, parentSlot: 1, spec: CANONICAL_15_SPINE[0]! });
  insertElasticProbe(state, { afterTurn: 3, parentSlot: 2, spec: CANONICAL_15_SPINE[0]! });
  insertElasticProbe(state, { afterTurn: 3, parentSlot: 4, spec: CANONICAL_15_SPINE[0]! });
  insertElasticProbe(state, { afterTurn: 3, parentSlot: 5, spec: CANONICAL_15_SPINE[0]! });
  assert.deepEqual(keepSpineIntact(state, [{ ...action, parentSlot: 3 }], 3), []);
});

it("insertion invalidates every shifted in-flight version", () => {
  const state = { turns: [1, 2, 3].map((turn) => ({ turn, slot: turn, version: 0, status: "PLANNED" })) } as FactorisationState;
  insertElasticProbe(state, { afterTurn: 1, parentSlot: 1, spec: CANONICAL_15_SPINE[0]! });
  assert.equal(state.turns[0]!.version, 0);
  assert.ok(state.turns.slice(1).every((t) => t.version > 0));
  const firstGeneration = state.turns[1]!.version;
  insertElasticProbe(state, { afterTurn: 3, parentSlot: 2, spec: CANONICAL_15_SPINE[0]! });
  assert.ok(state.turns.filter((t) => t.turn > 3).every((t) => t.version > firstGeneration));
});

it("does not rate a skill from support notes without an answered question", () => {
  const entry = { skillId: "FAC_PAIR_PRODUCT_SUM", state: "CONFIRMED", notes: ["asked for support"], mistakes: [], supportCount: 2 } as Parameters<typeof calculateSkillRating>[0];
  assert.equal(calculateSkillRating(entry, []), undefined);
});

it("Sarah pair clearance requires a signed monic trinomial, not an unrelated minus", () => {
  const rule = RETROACTIVE_CLEARANCE_RULES.find((r) => r.prerequisiteSkillId === "FAC_PAIR_PRODUCT_SUM")!;
  assert.equal(rule.expressionValidator("x^2 - 11x + 24"), true);
  assert.equal(rule.expressionValidator("x² + 5x − 24"), true);
  assert.equal(rule.expressionValidator("x^2 + 5x + 6 - 0"), false);
  assert.equal(rule.expressionValidator("x^2 + 5x + 6"), false);
});

it("signed multiplication clearance requires a negative constant", () => {
  const rule = RETROACTIVE_CLEARANCE_RULES.find((r) => r.compositeSkillId === "FAC_MONIC_TRINOMIAL" && r.prerequisiteSkillId === "FND_SIGN_MUL_DIV")!;
  assert.equal(rule.expressionValidator("x^2 - 5x + 6"), false);
  assert.equal(rule.expressionValidator("x^2 + 5x - 6"), true);
});
