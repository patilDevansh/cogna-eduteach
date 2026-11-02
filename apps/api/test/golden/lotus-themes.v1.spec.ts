import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOTUS_THEME, isLotusTheme, LOTUS_THEMES, resolveLotusTheme } from "@cogna/shared";

describe("Lotus themes: which look a student gets", () => {
  it("offers four themes and the neutral one is the default", () => {
    assert.deepEqual([...LOTUS_THEMES], ["studio", "drafting", "cabinet", "soundlab"]);
    assert.equal(DEFAULT_LOTUS_THEME, "studio");
  });

  it("uses the neutral look until the student picks one", () => {
    assert.deepEqual(resolveLotusTheme(null, []), { chosen: null, lockedTheme: null, effective: "studio" });
  });

  it("uses the student's own choice when no class is locked", () => {
    assert.deepEqual(resolveLotusTheme("cabinet", [null, null]), { chosen: "cabinet", lockedTheme: null, effective: "cabinet" });
  });

  it("a teacher's lock beats the student's choice, and the neutral look can be the lock", () => {
    assert.equal(resolveLotusTheme("soundlab", ["drafting"]).effective, "drafting");
    const neutral = resolveLotusTheme("soundlab", ["studio"]);
    assert.equal(neutral.effective, "studio");
    assert.equal(neutral.lockedTheme, "studio");
    assert.equal(neutral.chosen, "soundlab");
  });

  it("ignores unknown values instead of trusting them", () => {
    assert.equal(isLotusTheme("neon"), false);
    assert.deepEqual(resolveLotusTheme("neon", ["neon", null]), { chosen: null, lockedTheme: null, effective: "studio" });
  });

  it("with locks in two classes the first valid one wins", () => {
    assert.equal(resolveLotusTheme(null, [null, "cabinet", "drafting"]).effective, "cabinet");
  });
});
