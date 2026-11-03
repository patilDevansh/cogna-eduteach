import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOTUS_THEME, isLotusTheme, LOTUS_OFFERED_THEMES, LOTUS_THEMES, resolveLotusTheme } from "@cogna/shared";

describe("Lotus themes: which look a student gets", () => {
  it("offers Seven Ways alone, and keeps the other looks parked in the code", () => {
    assert.deepEqual([...LOTUS_OFFERED_THEMES], ["sevenways"]);
    assert.equal(DEFAULT_LOTUS_THEME, "sevenways");
    assert.deepEqual([...LOTUS_THEMES], ["sevenways", "studio", "drafting", "cabinet", "soundlab"]);
  });

  it("every student gets Seven Ways before they have chosen anything", () => {
    assert.deepEqual(resolveLotusTheme(null, []), { chosen: null, lockedTheme: null, effective: "sevenways" });
  });

  it("a saved choice of a parked look doesn't bring it back", () => {
    assert.deepEqual(resolveLotusTheme("cabinet", [null, null]), { chosen: null, lockedTheme: null, effective: "sevenways" });
  });

  it("a teacher's lock to a parked look doesn't bring it back either", () => {
    assert.deepEqual(resolveLotusTheme("soundlab", ["drafting"]), { chosen: null, lockedTheme: null, effective: "sevenways" });
  });

  it("an offered look can be chosen and locked", () => {
    assert.equal(resolveLotusTheme("sevenways", []).chosen, "sevenways");
    assert.equal(resolveLotusTheme(null, ["sevenways"]).lockedTheme, "sevenways");
  });

  it("ignores unknown values instead of trusting them", () => {
    assert.equal(isLotusTheme("neon"), false);
    assert.deepEqual(resolveLotusTheme("neon", ["neon", null]), { chosen: null, lockedTheme: null, effective: "sevenways" });
  });
});
