import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validInteractionContext } from "@cogna/shared";
import { InteractionObservation, InteractionObservationSlot } from "../src/lib/interaction-observation";
const confidence = { status: "NOT_ASKED", value: null, scale: "ONE_TO_FIVE" } as const;
function fixture(hidden = false, offline = false, reloaded = false) {
  let time = 0;
  const observation = new InteractionObservation({ source: "EXERCISE", questionId: "test-q", questionVersion: 1, format: "TYPED_ANSWER", observationId: "observation-123456789" }, () => time, () => new Date(time).toISOString(), hidden, offline, reloaded);
  return { observation, tick: (ms: number) => { time += ms; } };
}
describe("bounded question interaction observations", () => {
  it("keeps no input unknown; first typing burst is not a revision", () => {
    const { observation: o, tick } = fixture();
    assert.equal(o.snapshot(confidence).timing.firstInputMs, null);
    tick(200); o.input("x"); tick(100); o.input("x+"); tick(100); o.input("x+2");
    assert.equal(o.snapshot(confidence).revisionsAfterFirstInput, 0);
    tick(1200); o.input("x+3");
    const result = o.snapshot(confidence);
    assert.equal(result.revisionsAfterFirstInput, 1); assert.equal(result.timing.firstInputMs, 200);
    assert.equal(validInteractionContext(result), true);
    assert.equal(JSON.stringify(result).includes('x+3'), false);
  });
  it("counts hidden and offline intervals separately without claiming attention", () => {
    const { observation: o, tick } = fixture();
    tick(100); o.visibility(true); tick(300); o.connection(true); tick(200); o.visibility(false); tick(200); o.connection(false);
    const result = o.snapshot(confidence);
    assert.equal(result.timing.hiddenMs, 500); assert.equal(result.timing.visibilityChanges, 2);
    assert.equal(result.technical.offlineMs, 400); assert.equal(result.technical.offlineTransitions, 1);
  });
  it("records initial hidden/offline state and partial reload honestly", () => {
    const { observation: o, tick } = fixture(true, true, true);
    tick(100); const before = o.snapshot(confidence);
    assert.equal(before.presentedAt, null); assert.equal(before.timing.complete, false);
    assert.equal(before.timing.hiddenMs, 100); assert.equal(before.technical.offlineMs, 100);
    o.visibility(false); assert.ok(o.snapshot(confidence).presentedAt);
  });
  it("freezes a snapshot across later edits and preserves real confidence", () => {
    const { observation: o, tick } = fixture();
    tick(200); o.input("A", true);
    const frozen = o.snapshot({ status: "REPORTED_BEFORE_ANSWER", value: 4, scale: "ONE_TO_FIVE" });
    tick(200); o.input("B", true);
    assert.equal(frozen.revisionsAfterFirstInput, 0); assert.equal(frozen.timing.elapsedMs, 200);
    assert.equal(o.snapshot(confidence).revisionsAfterFirstInput, 1);
    assert.equal(frozen.confidence.value, 4);
  });
  it("keeps continuous presentation stable but resets re-shown questions and session identity", () => {
    const slot = new InteractionObservationSlot(); let time = 0;
    const create = (partial: boolean) => new InteractionObservation({ source: "LOTUS", questionId: "q", questionVersion: null, format: "CONSTRUCTED_RESPONSE", observationId: "observation-123456789" }, () => time, () => new Date(time).toISOString(), false, false, false, partial);
    const first = slot.activate("session1:q", create); time = 100; first.input("x");
    assert.equal(slot.activate("session1:q", create), first);
    slot.deactivate(); assert.equal(slot.get("session1:q"), null);
    time = 5000; const shownAgain = slot.activate("session1:q", create);
    assert.notEqual(shownAgain, first); assert.equal(shownAgain.snapshot(confidence).timing.firstInputMs, null);
    assert.equal(shownAgain.snapshot(confidence).timing.elapsedMs, 0); assert.equal(shownAgain.snapshot(confidence).timing.complete, false);
    const nextSession = slot.activate("session2:q", create); assert.equal(nextSession.snapshot(confidence).timing.complete, true);
  });
  it("working is observed without inventing an answer revision; limits long sessions", () => {
    const { observation: o, tick } = fixture(); tick(200); o.workingInput(); tick(90000000);
    const result = o.snapshot(confidence);
    assert.equal(result.timing.firstInputMs, 200); assert.equal(result.revisionsAfterFirstInput, 0);
    assert.equal(result.timing.elapsedMs, 86400000); assert.equal(result.timing.complete, false);
  });
});
