import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mistakeLabInputs } from "../../src/personalized-videos/mistake-lab";

describe("mistake lab: the child's (v + n)² answer as lab inputs", () => {
  it("draws x² + 36 for (x + 6)² as the no-middle mistake, together", () => {
    const got = mistakeLabInputs("(x + 6)^2", "x^2+36");
    assert.deepEqual(got && { v: got.mineV, n: got.mineN, said: got.mineSaid, m: got.mineMistake, help: got.help },
      { v: "x", n: 6, said: "x² + 36", m: "SQUARE_DISTRIBUTES", help: 2 });
  });

  it("accepts the child's own order and symbols", () => {
    assert.equal(mistakeLabInputs("(y + 3)²", "9 + y²")?.mineSaid, "9 + y²");
  });

  it("draws one strip for x² + 3x + 9, solo, and one level more help after a failed lesson", () => {
    assert.equal(mistakeLabInputs("(x + 3)^2", "x^2 + 3x + 9")?.help, 3);
    assert.equal(mistakeLabInputs("(x + 3)^2", "x^2 + 3x + 9", { lessonFailedBefore: true })?.help, 2);
    assert.equal(mistakeLabInputs("(x + 3)^2", "x^2 + 9", { lessonFailedBefore: true })?.help, 1);
  });

  it("offers nothing for a right answer, another mistake, an unreadable answer or an item it cannot draw", () => {
    assert.equal(mistakeLabInputs("(x + 6)^2", "x^2 + 12x + 36"), null);
    assert.equal(mistakeLabInputs("(x + 6)^2", "x^2 + 6x + 6"), null);
    assert.equal(mistakeLabInputs("(x + 6)^2", "x^2 +"), null);
    assert.equal(mistakeLabInputs("(y - 5)^2", "y^2 + 25"), null);
    assert.equal(mistakeLabInputs("(3a + 2b)^2", "9a^2 + 4b^2"), null);
    assert.equal(mistakeLabInputs("(x + 9)^2", "x^2 + 81"), null);
  });
});
