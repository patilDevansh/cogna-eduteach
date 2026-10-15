import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APPROVED_VIDEO_TEMPLATES, themedLesson } from "../../src/personalized-videos/approved-templates";
import { collectSceneClaims, validateMathClaims } from "../../src/personalized-videos/video-math";
import { validateVideoLanguage } from "../../src/personalized-videos/video-language";

describe("magic theme for divya", () => {
  const template = APPROVED_VIDEO_TEMPLATES.divya;

  it("changes text only: equations and claims are identical, and still verify", () => {
    const themed = themedLesson(template);
    assert.equal(themed.theme, "magic");
    assert.notEqual(themed.scenes[1]!.narration, template.lesson.scenes[1]!.narration);
    assert.deepEqual(
      themed.scenes.map((s) => [s.equation, s.claims, s.accent, s.durationSeconds]),
      template.lesson.scenes.map((s) => [s.equation, s.claims, s.accent, s.durationSeconds]),
    );
    assert.equal(validateMathClaims(collectSceneClaims(themed.scenes)).valid, true);
    const texts = themed.scenes.flatMap((s) => [s.eyebrow, s.headline, s.narration]);
    assert.equal(validateVideoLanguage(texts).valid, true);
  });

  it("COGNA_THEMES_ENABLED=false restores the plain lesson", () => {
    process.env.COGNA_THEMES_ENABLED = "false";
    try {
      assert.equal(themedLesson(template), template.lesson);
    } finally {
      delete process.env.COGNA_THEMES_ENABLED;
    }
  });

  it("other students are untouched", () => {
    assert.equal(themedLesson(APPROVED_VIDEO_TEMPLATES.rohan), APPROVED_VIDEO_TEMPLATES.rohan.lesson);
  });
});
