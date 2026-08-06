import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContentVerifierService } from "../../src/engines/live-teaching/content-verifier.service";
import {
  LINEAR_ONE_STEP_TEMPLATE_ID,
  LINEAR_WORD_PROBLEM_TEMPLATE_ID,
  TemplateRenderService,
} from "../../src/engines/live-teaching/template-render.service";
import type { RenderedQuestion } from "../../src/engines/live-teaching/template-render.types";

describe("ContentVerifier — live agentic C-lite", () => {
  const verifier = new ContentVerifierService();
  const templates = new TemplateRenderService();

  it("happy template passes all layers", () => {
    const rendered = templates.renderLinearOneStep({
      conceptId: "C1_BASIC_SOLVING",
      a: 3,
      b: 5,
      x: 4,
    });
    const result = verifier.verify(rendered);
    assert.equal(result.passed, true);
    assert.deepEqual(result.layers, {
      answer: true,
      steps: true,
      pedagogy: true,
      voice: true,
      hints: true,
    });
    assert.equal(result.failures.length, 0);
    assert.equal(rendered.templateId, LINEAR_ONE_STEP_TEMPLATE_ID);
  });

  it("hint leak fails hints layer", () => {
    const rendered = templates.renderLinearOneStep({
      conceptId: "C1_BASIC_SOLVING",
      a: 2,
      b: 3,
      x: 7,
    });
    const leaked: RenderedQuestion = {
      ...rendered,
      hints: [...rendered.hints, "Try x = 7 as your answer."],
    };
    const result = verifier.verify(leaked);
    assert.equal(result.passed, false);
    assert.equal(result.layers.hints, false);
    assert.ok(result.failures.some((f) => f.startsWith("hints:")));
  });

  it("forbidden word fails voice layer", () => {
    const rendered = templates.renderLinearOneStep({
      conceptId: "C1_BASIC_SOLVING",
      a: 2,
      b: 1,
      x: 5,
    });
    const contaminated: RenderedQuestion = {
      ...rendered,
      stem: `${rendered.stem} Check your mastery.`,
    };
    const result = verifier.verify(contaminated);
    assert.equal(result.passed, false);
    assert.equal(result.layers.voice, false);
    assert.ok(result.failures.some((f) => f.startsWith("voice:")));
  });

  it("wrong accepted answer fails answer layer", () => {
    const rendered = templates.renderLinearOneStep({
      conceptId: "C1_BASIC_SOLVING",
      a: 4,
      b: 2,
      x: 3,
    });
    const bad: RenderedQuestion = {
      ...rendered,
      params: { ...rendered.params, x: 99 },
      acceptedAnswers: ["99", "x=99"],
    };
    const result = verifier.verify(bad);
    assert.equal(result.passed, false);
    assert.equal(result.layers.answer, false);
  });
});

describe("ContentVerifier — word-problem template (dynamic per-student generation)", () => {
  const verifier = new ContentVerifierService();
  const templates = new TemplateRenderService();

  it("every context, every valid param combination, passes all layers", () => {
    let checked = 0;
    for (let a = 2; a <= 9; a++) {
      for (let bRaw = -9; bRaw <= 9; bRaw++) {
        const b = bRaw === 0 ? 1 : bRaw;
        for (let x = 1; x <= 12; x += 3) {
          if (x === a) continue;
          for (let ctx = 0; ctx < 4; ctx++) {
            checked++;
            const rendered = templates.renderLinearWordProblem(
              { conceptId: "C6_SIMPLE_WORD_PROBLEMS", a, b, x },
              ctx,
            );
            const result = verifier.verify(rendered);
            assert.equal(
              result.passed,
              true,
              `a=${a} b=${b} x=${x} ctx=${ctx} failed: ${result.failures.join(", ")}`,
            );
            assert.equal(rendered.templateId, LINEAR_WORD_PROBLEM_TEMPLATE_ID);
          }
        }
      }
    }
    assert.ok(checked > 100, "expected a meaningful sample to be checked");
  });

  it("stems never use the literal letter x (natural language only)", () => {
    for (let ctx = 0; ctx < 4; ctx++) {
      const rendered = templates.renderLinearWordProblem(
        { conceptId: "C6_SIMPLE_WORD_PROBLEMS", a: 4, b: 7, x: 6 },
        ctx,
      );
      assert.equal(/\bx\b/i.test(rendered.stem), false, rendered.stem);
    }
  });

  it("hints never leak the numeric answer", () => {
    const rendered = templates.renderLinearWordProblem(
      { conceptId: "C6_SIMPLE_WORD_PROBLEMS", a: 5, b: -3, x: 9 },
      1,
    );
    const result = verifier.verify(rendered);
    assert.equal(result.layers.hints, true);
    assert.equal(result.passed, true);
  });

  it("wrong accepted answer still fails the answer layer for this template", () => {
    const rendered = templates.renderLinearWordProblem(
      { conceptId: "C6_SIMPLE_WORD_PROBLEMS", a: 3, b: 2, x: 5 },
      2,
    );
    const bad: RenderedQuestion = {
      ...rendered,
      params: { ...rendered.params, x: 999 },
      acceptedAnswers: ["999", "x=999"],
    };
    const result = verifier.verify(bad);
    assert.equal(result.passed, false);
    assert.equal(result.layers.answer, false);
  });
});
