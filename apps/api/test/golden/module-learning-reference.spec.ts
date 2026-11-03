import assert from "node:assert/strict";
import { it } from "node:test";
import { advanceModule, initialModuleState, publicModuleState, type ModuleRunIdentity } from "../../src/module-learning/module-learning.state";

const identity: ModuleRunIdentity = { runId: "test-run", flow: "MODULE_LEARNING_V1", studentId: "student-test", source: "SELF_DIRECTED", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", packageId: "TEACH_MATH_8_FACT_MONIC_TRINOMIAL", packageVersion: "1.0.0", classroomId: null, teacherId: null, repeatOfRunId: null };

it("starts with reviewed teaching and separates lesson answers from fresh independent evidence", () => {
  let state = initialModuleState();
  assert.equal(publicModuleState(identity, state).asset?.purpose, "DEFAULT_TEACHING");
  assert.equal(publicModuleState(identity, state).question, null);
  state = advanceModule(state, { kind: "PRESENTED", segmentId: "DEFAULT_PAIR_PRODUCT_SUM", representation: "STATIC_TEXT" }).state;
  assert.equal(state.stage, "CHECKPOINT");
  state = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_01", answer: "(x+2)(x+5)" }).state;
  assert.equal(state.lastResult?.assistance, "LESSON_CONTEXT");
  state = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_02", answer: "(x+4)(x+5)" }).state;
  assert.equal(state.stage, "INDEPENDENT_EXIT");
  const publicView = publicModuleState(identity, state);
  assert.equal(publicView.question?.id, "EXIT_FACT_01");
  assert.equal(publicView.question?.independent, true);
  assert.equal(JSON.stringify(publicView).includes("canonicalAnswer"), false);
  state = advanceModule(state, { kind: "ANSWER", itemId: "EXIT_FACT_01", answer: "(x+3)(x+4)" }).state;
  assert.equal(state.workflow, "COMPLETE");
  assert.equal(state.independentResult?.verdict, "INCORRECT");
  assert.equal(state.lastResult?.assistance, "NONE");
});

it("uses the exit item reserved for this run after supported practice", () => {
  let state = initialModuleState("EXIT_FACT_02");
  state = advanceModule(state, { kind: "PRESENTED", segmentId: "DEFAULT_PAIR_PRODUCT_SUM", representation: "STATIC_TEXT" }).state;
  state = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_01", answer: "(x+2)(x+5)" }).state;
  state = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_02", answer: "(x+4)(x+5)" }).state;
  assert.equal(state.stage, "INDEPENDENT_EXIT");
  assert.equal(state.itemId, "EXIT_FACT_02");
  assert.equal(publicModuleState(identity, state).question?.id, "EXIT_FACT_02");
});

it("uses a discriminating sign probe, records uncertainty, repairs once and returns to the parent module", () => {
  let state = advanceModule(initialModuleState(), { kind: "PRESENTED", segmentId: "DEFAULT_PAIR_PRODUCT_SUM", representation: "SLIDES" }).state;
  const checkpoint = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_01", answer: "(x-2)(x-5)" });
  assert.equal(checkpoint.state.stage, "PREREQUISITE_CHECK");
  assert.equal(checkpoint.observation.confirmedGap, false);
  state = checkpoint.state;
  state = advanceModule(state, { kind: "ANSWER", itemId: "PREREQ_PROBE_01_SIGN_PRODUCT", answer: "-24" }).state;
  assert.equal(state.stage, "REPAIR");
  assert.equal(state.supportTarget, "FND_SIGN_MUL_DIV");
  state = advanceModule(state, { kind: "PRESENTED", segmentId: "REPAIR_SIGN_PAIR", representation: "STATIC_TEXT" }).state;
  assert.equal(state.itemId, "PRAC_FACT_03");
  state = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_03", answer: "(x-3)(x-5)" }).state;
  assert.equal(state.stage, "RETURN");
  assert.equal(state.supportTarget, null);
  assert.equal(state.itemId, "PRAC_FACT_04");
  state = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_04", answer: "(x-2)(x-7)" }).state;
  assert.equal(state.stage, "INDEPENDENT_EXIT");
});

it("offers an alternate when a wrong answer is ambiguous and preserves pause state", () => {
  let state = advanceModule(initialModuleState(), { kind: "PRESENTED", segmentId: "DEFAULT_PAIR_PRODUCT_SUM", representation: "SLIDES" }).state;
  state = advanceModule(state, { kind: "ANSWER", itemId: "PRAC_FACT_01", answer: "hello" }).state;
  assert.equal(state.stage, "ALTERNATE");
  assert.equal(state.supportTarget, null);
  state = advanceModule(state, { kind: "PAUSE" }).state;
  assert.equal(state.paused, true);
  assert.throws(() => advanceModule(state, { kind: "PRESENTED", segmentId: "ALTERNATE_EXPANSION_CHECK", representation: "SLIDES" }), /STUDENT_PAUSED/);
  state = advanceModule(state, { kind: "RESUME" }).state;
  state = advanceModule(state, { kind: "TEACHER_PAUSE" }).state;
  assert.throws(() => advanceModule(state, { kind: "PRESENTED", segmentId: "ALTERNATE_EXPANSION_CHECK", representation: "SLIDES" }), /TEACHER_PAUSED/);
  state = advanceModule(state, { kind: "TEACHER_RESUME" }).state;
  state = advanceModule(state, { kind: "PRESENTED", segmentId: "ALTERNATE_EXPANSION_CHECK", representation: "SLIDES" }).state;
  assert.equal(state.itemId, "PRAC_FACT_04");
});
