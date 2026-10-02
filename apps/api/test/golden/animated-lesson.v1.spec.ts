import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PersonalizedVideoEvidenceSnapshot } from "@cogna/shared";
import { buildDistributionLesson, matchDistributionMistake, MEENA_EXAMPLE } from "@cogna/lesson-video";
import { planAnimatedLesson } from "../../src/personalized-videos/animated-lessons";
import { collectSceneClaims, validateMathClaims } from "../../src/personalized-videos/video-math";
import { validateVideoLanguage } from "../../src/personalized-videos/video-language";

const obs = (questionText: string, submittedText: string, correct = false) => ({
  questionText,
  submittedText,
  verificationStatus: correct ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT",
  independent: true,
});

// Aarav: multiplies signed numbers correctly on their own, loses the sign when distributing.
const AARAV = [
  obs("Evaluate −2(5 − 8). Show your steps.", "−2 × 5 = −10\n−2 × −8 = −16\n−10 − 16 = −26"),
  obs("Evaluate 7 − (−3) × 2. Show your steps.", "−3 × 2 = −6\n7 + 6 = 13", true),
  obs("Evaluate −4(2 − 7) + 3. Show your steps.", "−8 − 28 + 3\n= −33"),
];

const snapshot = (
  lotusOutcome: PersonalizedVideoEvidenceSnapshot["lotusOutcome"],
  verifiedObservations = AARAV,
): PersonalizedVideoEvidenceSnapshot => ({
  diagnosticState: "supported-gap",
  observedEvidence: ["recorded"],
  verifiedObservations,
  lotusOutcome,
  evidenceSource: "LOTUS_SESSION",
});

describe("distribution mistake matching", () => {
  it("recomputes the mistake from the question, not from the student's words", () => {
    const m = matchDistributionMistake("Evaluate −2(5 − 8). Show your steps.", "−26");
    assert.equal(m?.mistake, "sign-lost");
    assert.deepEqual([m?.groupIndex, m?.termIndex], [0, 1]);
  });

  it("returns nothing for a right answer, an unexplained answer, or an unsupported form", () => {
    assert.equal(matchDistributionMistake("Evaluate −2(5 − 8). Show your steps.", "6"), null);
    assert.equal(matchDistributionMistake("Evaluate −2(5 − 8). Show your steps.", "−7"), null);
    assert.equal(matchDistributionMistake("Evaluate (6 − 9) × (2 − 5). Show your steps.", "−9"), null);
  });

  it("abstains when two locations explain the answer and the working does not say which", () => {
    assert.equal(matchDistributionMistake("Expand 2(x + 3) + ½(4x − 6).", "4x"), null);
    const m = matchDistributionMistake("Expand 2(x + 3) + ½(4x − 6).", "2x + 6 + 2x − 6\n= 4x");
    assert.deepEqual([m?.mistake, m?.groupIndex, m?.termIndex], ["untouched", 1, 1]);
  });
});

describe("animated lesson planning", () => {
  it("builds Aarav's sign lesson from two matching answers under a Lotus SOLID_GAP", () => {
    const plan = planAnimatedLesson(snapshot("SOLID_GAP"), "Aarav");
    assert.ok(plan);
    assert.equal(plan.mistake, "sign-lost");
    assert.equal(plan.matchedPrompts.length, 2);
    assert.equal(plan.animation.display.check.left.lines.at(-1), "−2 × (−3) = 6");
    assert.deepEqual([plan.exit.prompt, plan.exit.expected], ["Evaluate −3(6 − 9). Show your steps.", "9"]);
    assert.equal(validateMathClaims(collectSceneClaims(plan.lesson.scenes)).valid, true);
    const texts = plan.animation.scenes.flatMap((s) => [s.title, ...s.beats.map((b) => b.text)]);
    assert.equal(validateVideoLanguage(texts).valid, true);
  });

  it("does not teach without a confirmed gap, or from a single matching answer", () => {
    assert.equal(planAnimatedLesson(snapshot("INSUFFICIENT_OR_CONFLICTING"), "Aarav"), null);
    assert.equal(planAnimatedLesson(snapshot("ADVANCEMENT"), "Aarav"), null);
    assert.equal(planAnimatedLesson(snapshot("SOLID_GAP", AARAV.slice(0, 2)), "Aarav"), null);
  });
});

describe("lesson verification gate", () => {
  it("refuses working that contains a mistake the template does not teach", () => {
    const bad = { ...MEENA_EXAMPLE, studentProducts: [MEENA_EXAMPLE.studentProducts[0]!, [{ coef: { n: 3, d: 1 }, x: true }, { coef: { n: -6, d: 1 }, x: false }]] };
    assert.throws(() => buildDistributionLesson(bad), /exactly one untouched or sign-lost term/);
  });
});
