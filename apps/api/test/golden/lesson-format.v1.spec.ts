import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chooseLessonFormat } from "../../src/personalized-videos/lesson-format";

// FND_GCD_NUMERIC (HCF of whole numbers) builds on FND_FACTOR_PAIRS.
const base = {
  targetSkillId: "FND_GCD_NUMERIC",
  skills: [{ skillId: "FND_GCD_NUMERIC", state: "CONFIRMED" }, { skillId: "FND_FACTOR_PAIRS", state: "SECURE" }],
  studentItems: [{ mistake: "GAVE_LCM" }, { mistake: "GAVE_LCM" }],
  shortLessonAvailable: true,
};

describe("short lesson or video: picked from the size of the gap", () => {
  it("a recognised mistake on one skill, foundations secure: the short lesson", () => {
    assert.equal(chooseLessonFormat(base).format, "SHORT");
  });

  it("a skill underneath also needs work: a video", () => {
    const r = chooseLessonFormat({ ...base, skills: [...base.skills.slice(0, 1), { skillId: "FND_FACTOR_PAIRS", state: "SUSPECTED" }] });
    assert.equal(r.format, "VIDEO");
    assert.match(r.reason, /underneath/);
  });

  it("more than one confirmed gap: a video", () => {
    assert.equal(chooseLessonFormat({ ...base, skills: [...base.skills, { skillId: "FND_SIGN_MUL_DIV", state: "CONFIRMED" }] }).format, "VIDEO");
  });

  it("a mistake code couldn't name: a video that explains it", () => {
    assert.equal(chooseLessonFormat({ ...base, studentItems: [{ mistake: "GAVE_LCM" }, {}] }).format, "VIDEO");
  });

  it("no short lesson fits the answer: a video", () => {
    assert.equal(chooseLessonFormat({ ...base, shortLessonAvailable: false }).format, "VIDEO");
  });
});
