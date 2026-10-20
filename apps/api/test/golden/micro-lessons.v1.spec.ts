import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LessonBrief } from "../../src/personalized-videos/ai-authoring/lesson-brief";
import { buildMicroLesson } from "../../src/personalized-videos/micro-lessons";
import { taskVerdict } from "../../src/personalized-videos/ai-authoring/lesson-verifier";
import { normalizeMathText } from "../../src/lotus/lotus-algebra";

const brief = (name: string, item: LessonBrief["studentItems"][number]): LessonBrief => ({
  studentFirstName: name, grade: 8, topic: "Factorisation", targetSkill: { id: "x", name: "x" }, buildsOn: [], mistakes: [], strengths: [], studentItems: [item],
});
const item = (expression: string, task: "factorise" | "simplify", studentAnswer: string, correctAnswer: string) => ({ questionNumber: 1, prompt: "", expression, task, studentAnswer, correctAnswer });

const CASES = [
  { name: "Rohan", item: item("x^2 - 7x + 12", "factorise", "(x + 3)(x + 4)", "(x - 3)(x - 4)"), template: "SIGNS_IN_PAIR" },
  { name: "Kabir", item: item("5x^2 - 20", "factorise", "5(x^2 - 4)", "5(x - 2)(x + 2)"), template: "EQUAL_NOT_FINISHED" },
  { name: "Meena", item: item("2y(x + 1) + 3(x + 1)", "factorise", "6y(x + 1)", "(x + 1)(2y + 3)"), template: "COMMON_BRACKET" },
  { name: "Aarav", item: item("-2(3x - 5)", "simplify", "-6x - 10", "-6x + 10"), template: "NEGATIVE_TIMES_BRACKET" },
  { name: "Diya", item: item("x^2 - 9", "factorise", "(x - 3)^2", "(x - 3)(x + 3)"), template: "YOUR_ANSWER_VS_RIGHT" },
] as const;

describe("targeted micro-lessons", () => {
  for (const c of CASES) {
    it(`${c.name}: ${c.template}, uses the student's name and own answer, and the quick check has exactly one right option`, () => {
      const plan = buildMicroLesson(brief(c.name, c.item))!;
      assert.ok(plan, "a micro-lesson is built");
      assert.equal(plan.view.template, c.template);
      assert.match(plan.view.steps[0]!.say, new RegExp(`^${c.name},`));
      assert.ok(plan.view.steps.length >= 4 && plan.view.steps.length <= 7, "15–25 seconds of narration");
      const options = plan.view.check.options;
      assert.ok(options.length >= 2 && plan.check.answerIndex >= 0 && plan.check.answerIndex < options.length);
      assert.equal(plan.check.feedback.length, options.length);
      assert.equal(JSON.stringify(plan.view).includes("answerIndex"), false, "the browser view never carries the answer");
      // Every token id an action points at exists.
      const ids = new Set(plan.view.rows.flatMap((row) => row.filter((t) => typeof t !== "string").map((t) => (t as [string, string])[0])));
      for (const step of plan.view.steps) for (const action of step.actions) {
        const refs = "id" in action ? [action.id] : "ids" in action ? action.ids : "from" in action ? [action.from, action.to] : [];
        for (const ref of refs) assert.ok(ids.has(ref), `${c.name}: action points at a real token (${ref})`);
      }
    });
  }

  it("the quick check's right option is right by the algebra engine", () => {
    const plan = buildMicroLesson(brief("Aarav", CASES[3].item))!;
    const right = plan.view.check.options[plan.check.answerIndex]!.replace(/−/g, "-");
    assert.equal(taskVerdict("expand", right, "-3(x - 4)"), "CORRECT");
    assert.equal(normalizeMathText(right), normalizeMathText("-3x + 12"));
  });

  it("a number pair picked in the firefly game gets the signs lesson, quoted as a pick", () => {
    const plan = buildMicroLesson(brief("Aarav", item("x^2 + 10x + 24", "factorise", "-6 and -4", "(x + 6)(x + 4)")))!;
    assert.equal(plan.view.template, "SIGNS_IN_PAIR");
    assert.match(plan.view.steps[0]!.say, /^Aarav, you picked -6 and -4\./);
    assert.equal(buildMicroLesson(brief("Aarav", item("x^2 - 9", "factorise", "3 and 3", "(x - 3)(x + 3)"))), null, "a pair never feeds the written-answer templates");
  });

  it("builds nothing for an answer that is already right", () => {
    assert.equal(buildMicroLesson(brief("Asha", item("x^2 - 9", "factorise", "(x - 3)(x + 3)", "(x - 3)(x + 3)"))), null);
  });
});

describe("new lesson visuals: algebra tiles and number line", async () => {
  const { verifyAuthoredLesson } = await import("../../src/personalized-videos/ai-authoring/lesson-verifier");
  const { fakeDraft } = await import("../../src/personalized-videos/ai-authoring/author-models");
  const B = brief("Aarav", item("x^2 - 7x + 12", "factorise", "(x + 3)(x + 4)", "(x - 3)(x - 4)"));
  const withVisual = (visual: unknown) => {
    const draft = fakeDraft(B);
    draft.scenes[0]!.beats[0]!.visual = visual as never;
    return verifyAuthoredLesson(draft, B).errors.filter((e) => e.startsWith("scenes[0].beats[0]"));
  };
  it("accepts tiles whose sides add to b and multiply to c, and rejects ones that don't", () => {
    assert.deepEqual(withVisual({ type: "tiles", b: 5, c: 6, sides: [3, 2] }), []);
    assert.ok(withVisual({ type: "tiles", b: 5, c: 6, sides: [4, 1] }).length > 0);
  });
  it("accepts a number line whose caption names where it lands, and rejects a wrong landing", () => {
    assert.deepEqual(withVisual({ type: "number-line", start: -3, moves: [-4], caption: "−3 + (−4) lands on −7" }), []);
    assert.ok(withVisual({ type: "number-line", start: -3, moves: [-4], caption: "−3 + (−4) lands on 1" }).length > 0);
  });
});

describe("slide lessons show each scene's maths", async () => {
  const { sceneEquationLines } = await import("../../src/personalized-videos/ai-authoring/authoring-pipeline");
  it("takes the lines from the scene's verified visuals, skipping words-only ones", () => {
    const lines = sceneEquationLines({
      title: "What happened",
      beats: [
        { say: "", visual: { type: "title", text: "Look" } },
        { say: "", visual: { type: "mistake", expr: "x^2 - 5x + 6", task: "factorise", wrong: "(x + 2)(x + 3)", wrongKind: "incorrect", right: "(x - 2)(x - 3)", note: "" } },
        { say: "", visual: { type: "steps", steps: ["(x - 2)(x - 3)", "x^2 - 5x + 6"] } },
      ],
    }).map((l) => l.text);
    assert.deepEqual(lines, ["x² − 5x + 6", "✗ (x + 2)(x + 3)", "✓ (x − 2)(x − 3)", "(x − 2)(x − 3)"]);
    assert.deepEqual(sceneEquationLines({ title: "", beats: [{ say: "", visual: { type: "pair-search", product: 6, sum: -5, pairs: [[-2, -3]], answer: [-2, -3] } }] }).map((l) => l.text),
      ["−2 × −3 = 6", "−2 + −3 = −5"]);
  });
});
