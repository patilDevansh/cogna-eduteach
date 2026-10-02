import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { buildTrinomialLesson, classifyTrinomialAnswer, parsePair, parseTrinomial } from "@cogna/lesson-video";
import { planFactorisationLesson } from "../../src/personalized-videos/factorisation-lessons";
import { validateVideoLanguage } from "../../src/personalized-videos/video-language";

/** Minimal audit in the shape persisted Lotus factorisation records carry. */
const audit = (skillId: string, expression: string, answer: string, mistake?: string) => ({
  question: { prompt: `Factorise ${expression}.`, answerKey: { canonicalAnswer: "", diagnostics: { itemKind: "FACTORISE", expression, skillId, taggedSkills: [], stepSkills: [], predictedMistakes: [], origin: "AI" } } },
  response: { answer },
  skillEvidence: [{ skillId, kind: mistake ? "MISTAKE" : "SECURE", mistake, source: "INSTANT" }],
});

const session = (audits: unknown[], outcome = "SOLID_GAP") =>
  ({ topic: "FACTORISATION", status: "COMPLETE", finalReport: { outcome }, audits }) as unknown as LotusSessionView;

// Aarav: right numbers, wrong signs, twice — once padded the way AI items sometimes are.
const AARAV = [
  audit("FAC_MONIC_TRINOMIAL", "x^2 + 5x + 6", "(x + 2)(x + 3)"),
  audit("FAC_MONIC_TRINOMIAL", "x^2 - 7x + 12", "(x + 3)(x + 4)", "SIGN_PAIR_ERROR"),
  audit("FAC_MONIC_TRINOMIAL", "(x^2 - x - 12) + 3091 - 3091", "(x - 3)(x + 4)", "SIGNS_SWAPPED"),
];

describe("trinomial parsing and classification", () => {
  it("collects padded sums and refuses non-monic or non-sum input", () => {
    assert.deepEqual(parseTrinomial("(x^2 + 7x + 12) + 3091 - 3091"), { b: 7, c: 12, v: "x" });
    assert.deepEqual(parseTrinomial("y² − y − 12"), { b: -1, c: -12, v: "y" });
    assert.equal(parseTrinomial("2x^2 + 3x + 1"), null);
    assert.equal(parseTrinomial("(x + 3)(x + 4)"), null);
  });

  it("calls only right-numbers, wrong-signs a sign mistake", () => {
    const t = parseTrinomial("x^2 - 7x + 12")!;
    assert.equal(classifyTrinomialAnswer(t, parsePair("(x + 3)(x + 4)", "x")!), "sign");
    assert.equal(classifyTrinomialAnswer(t, parsePair("(x − 4)(x − 3)", "x")!), "correct");
    assert.equal(classifyTrinomialAnswer(t, parsePair("(x - 2)(x - 6)", "x")!), "other");
  });

  it("builds a verified lesson whose exit item is new and correct", () => {
    const lesson = buildTrinomialLesson({ studentName: "Aarav", expression: "x^2 - 7x + 12", answer: "(x + 3)(x + 4)" });
    assert.deepEqual(lesson.correct, [-3, -4]);
    assert.deepEqual(lesson.tiles.map((tile) => tile.sum), [-13, -8, -7]);
    assert.deepEqual(lesson.exit, { prompt: "Factorise x² − 9x + 20.", expected: "(x − 4)(x − 5)" });
    assert.equal(validateVideoLanguage(lesson.scenes.flatMap((s) => s.beats.map((b) => b.text))).valid, true);
    assert.throws(() => buildTrinomialLesson({ studentName: "", expression: "x^2 - 7x + 12", answer: "(x - 3)(x - 4)" }));
  });
});

describe("factorisation lesson planning", () => {
  it("animates Lotus's confirmed trinomial sign gap from the student's own item", () => {
    const plan = planFactorisationLesson(session(AARAV), "Aarav");
    assert.equal(plan?.kind, "trinomial");
    if (plan?.kind !== "trinomial") return;
    assert.equal(plan.skillId, "FAC_MONIC_TRINOMIAL");
    assert.deepEqual([plan.animation.trinomial.b, plan.animation.trinomial.c], [-7, 12]);
    assert.match(plan.lesson.generationReason, /built from 2 of your own answers/);
    assert.doesNotMatch(plan.lesson.generationReason, /[A-Z]{2,}_[A-Z]/);
  });

  it("abstains with a reason when the starting gap has no animation yet", () => {
    const grouping = [
      audit("FAC_GROUP_TERMS", "6xy + 9y + 4x + 6", "x(6y + 4) + 3(3y + 2)", "PAIRS_SHARE_NOTHING"),
      audit("FAC_GROUP_TERMS", "5xy + 10y + 3x + 6", "(5xy + 6)(10y + 3x)", "PAIRS_SHARE_NOTHING"),
    ];
    const plan = planFactorisationLesson(session(grouping), "Aarav");
    assert.deepEqual(plan, { kind: "abstain", reason: "No animated lesson exists yet for the starting gap: Grouping four terms into pairs." });
  });

  it("does nothing without a SOLID_GAP, and ignores Brackets sessions", () => {
    assert.equal(planFactorisationLesson(session(AARAV, "ADVANCEMENT"), "Aarav"), null);
    assert.equal(planFactorisationLesson({ ...session(AARAV), topic: "BRACKETS" } as LotusSessionView, "Aarav"), null);
  });
});
