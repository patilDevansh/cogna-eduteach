import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UI_ACTIONS } from "@cogna/shared";

/**
 * A01 — uiAction set unchanged (MVP 5.0)
 * 
 * Verifies that the canonical uiAction set remains exactly 5 actions.
 * Modality is expressed via contentStyle, never as a sixth uiAction.
 * 
 * Hard invariant: Only SHOW_QUESTION | SHOW_EXPLANATION | SHOW_HINT | END_SESSION | SUGGEST_BREAK
 */
describe("A01 — uiAction set unchanged", () => {
  it("exports exactly 5 canonical uiActions", () => {
    assert.equal(UI_ACTIONS.length, 5);
    assert.deepEqual(UI_ACTIONS, [
      "SHOW_QUESTION",
      "SHOW_EXPLANATION",
      "SHOW_HINT",
      "END_SESSION",
      "SUGGEST_BREAK",
    ]);
  });

  it("does not include SHOW_VIDEO or SHOW_ANIMATION as uiActions", () => {
    assert.equal(UI_ACTIONS.includes("SHOW_VIDEO" as any), false);
    assert.equal(UI_ACTIONS.includes("SHOW_ANIMATION" as any), false);
    assert.equal(UI_ACTIONS.includes("SHOW_VOICE" as any), false);
  });
});
