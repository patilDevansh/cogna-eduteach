import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContentVerifierService } from "../../src/engines/live-teaching/content-verifier.service";
import {
  TWO_BINOMIAL_EXPAND_TEMPLATE_ID,
  TWO_BINOMIAL_FACTOR_TEMPLATE_ID,
  TemplateRenderService,
  VARIABLE_BOTH_SIDES_TEMPLATE_ID,
} from "../../src/engines/live-teaching/template-render.service";
import type { RenderedQuestion } from "../../src/engines/live-teaching/template-render.types";

describe("ContentVerifier — variable-both-sides (C7_VARIABLE_BOTH_SIDES)", () => {
  const verifier = new ContentVerifierService();
  const templates = new TemplateRenderService();

  it("happy template passes all layers", () => {
    // 5x - 2x = 12 - 3 -> x = 3
    const rendered = templates.renderVariableBothSides({
      conceptId: "C7_VARIABLE_BOTH_SIDES",
      a: 5,
      b: 3,
      c: 2,
      d: 12,
      x: 3,
    });
    const result = verifier.verify(rendered);
    assert.equal(result.passed, true, result.failures.join(", "));
    assert.equal(rendered.templateId, VARIABLE_BOTH_SIDES_TEMPLATE_ID);
  });

  it("sweeps every valid a,b,c,d,x combination in range — all pass", () => {
    let checked = 0;
    for (let a = 2; a <= 9; a++) {
      for (let c = 1; c <= 9; c++) {
        if (a === c) continue;
        for (let x = -6; x <= 6; x += 3) {
          if (x === 0) continue;
          for (let b = -9; b <= 9; b += 6) {
            const d = b + (a - c) * x; // derived so the equation is consistent by construction
            checked++;
            const rendered = templates.renderVariableBothSides({
              conceptId: "C7_VARIABLE_BOTH_SIDES",
              a,
              b,
              c,
              d,
              x,
            });
            const result = verifier.verify(rendered);
            assert.equal(
              result.passed,
              true,
              `a=${a} b=${b} c=${c} d=${d} x=${x} failed: ${result.failures.join(", ")}`,
            );
          }
        }
      }
    }
    assert.ok(checked > 50, "expected a meaningful sample to be checked");
  });

  it("never renders a bare coefficient of 1 as '1x'", () => {
    const rendered = templates.renderVariableBothSides({
      conceptId: "C7_VARIABLE_BOTH_SIDES",
      a: 5,
      b: 0,
      c: 1,
      d: 8,
      x: 2,
    });
    assert.equal(/(?<![0-9])1x(?![0-9])/.test(rendered.stem), false, rendered.stem);
  });

  it("tampered x fails the answer layer via independent re-solve", () => {
    const rendered = templates.renderVariableBothSides({
      conceptId: "C7_VARIABLE_BOTH_SIDES",
      a: 5,
      b: 3,
      c: 2,
      d: 12,
      x: 3,
    });
    const bad: RenderedQuestion = {
      ...rendered,
      params: { ...rendered.params, x: 999 } as typeof rendered.params,
      acceptedAnswers: ["999", "x=999"],
    };
    const result = verifier.verify(bad);
    assert.equal(result.passed, false);
    assert.equal(result.layers.answer, false);
  });
});

describe("ContentVerifier — two-binomial expand (ID_C4_TWO_BINOMIAL_IDENTITY)", () => {
  const verifier = new ContentVerifierService();
  const templates = new TemplateRenderService();

  it("happy template passes all layers", () => {
    const rendered = templates.renderTwoBinomial({
      conceptId: "ID_C4_TWO_BINOMIAL_IDENTITY",
      a: 3,
      b: 5,
      direction: "expand",
    });
    const result = verifier.verify(rendered);
    assert.equal(result.passed, true, result.failures.join(", "));
    assert.equal(rendered.templateId, TWO_BINOMIAL_EXPAND_TEMPLATE_ID);
    assert.equal(rendered.acceptedAnswers[0], "x^2+8x+15");
  });

  it("sweeps every non-zero a,b in -12..12 — all pass, and no coefficient renders as '1x' or 'x^0'", () => {
    let checked = 0;
    for (let a = -12; a <= 12; a++) {
      if (a === 0) continue;
      for (let b = -12; b <= 12; b += 3) {
        if (b === 0) continue;
        checked++;
        const rendered = templates.renderTwoBinomial({
          conceptId: "ID_C4_TWO_BINOMIAL_IDENTITY",
          a,
          b,
          direction: "expand",
        });
        const result = verifier.verify(rendered);
        assert.equal(result.passed, true, `a=${a} b=${b} failed: ${result.failures.join(", ")}`);
        for (const answer of rendered.acceptedAnswers) {
          assert.equal(/(?<![0-9])1x(?![0-9])/.test(answer), false, `a=${a} b=${b}: ${answer}`);
          assert.equal(/x\^0/.test(answer), false, `a=${a} b=${b}: ${answer}`);
        }
      }
    }
    assert.ok(checked > 100, "expected a meaningful sample to be checked");
  });

  it("hints never state the concrete a or b values", () => {
    const rendered = templates.renderTwoBinomial({
      conceptId: "ID_C4_TWO_BINOMIAL_IDENTITY",
      a: 7,
      b: -4,
      direction: "expand",
    });
    for (const hint of rendered.hints) {
      assert.equal(/\b7\b/.test(hint), false, hint);
      assert.equal(/\b4\b/.test(hint), false, hint);
    }
  });

  it("tampered expansion fails the answer layer via independent re-derivation", () => {
    const rendered = templates.renderTwoBinomial({
      conceptId: "ID_C4_TWO_BINOMIAL_IDENTITY",
      a: 3,
      b: 5,
      direction: "expand",
    });
    const bad: RenderedQuestion = { ...rendered, acceptedAnswers: ["x^2+8x+8", "x^2 + 8x + 8"] };
    const result = verifier.verify(bad);
    assert.equal(result.passed, false);
    assert.equal(result.layers.answer, false);
  });
});

describe("ContentVerifier — two-binomial factor (FAC_C4_TRINOMIAL)", () => {
  const verifier = new ContentVerifierService();
  const templates = new TemplateRenderService();

  it("happy template passes all layers", () => {
    const rendered = templates.renderTwoBinomial({
      conceptId: "FAC_C4_TRINOMIAL",
      a: 3,
      b: 5,
      direction: "factor",
    });
    const result = verifier.verify(rendered);
    assert.equal(result.passed, true, result.failures.join(", "));
    assert.equal(rendered.templateId, TWO_BINOMIAL_FACTOR_TEMPLATE_ID);
    assert.equal(rendered.acceptedAnswers[0], "(x+3)(x+5)");
  });

  it("sweeps every non-zero a,b in -12..12 — all pass", () => {
    let checked = 0;
    for (let a = -12; a <= 12; a++) {
      if (a === 0) continue;
      for (let b = -12; b <= 12; b += 3) {
        if (b === 0) continue;
        checked++;
        const rendered = templates.renderTwoBinomial({
          conceptId: "FAC_C4_TRINOMIAL",
          a,
          b,
          direction: "factor",
        });
        const result = verifier.verify(rendered);
        assert.equal(result.passed, true, `a=${a} b=${b} failed: ${result.failures.join(", ")}`);
      }
    }
    assert.ok(checked > 100, "expected a meaningful sample to be checked");
  });

  it("hints never state the concrete a or b factor values (that's the answer)", () => {
    const rendered = templates.renderTwoBinomial({
      conceptId: "FAC_C4_TRINOMIAL",
      a: 9,
      b: -6,
      direction: "factor",
    });
    for (const hint of rendered.hints) {
      assert.equal(/\b9\b/.test(hint), false, hint);
      assert.equal(/\b6\b/.test(hint), false, hint);
    }
  });

  it("tampered factor pair fails the answer layer via independent re-derivation", () => {
    const rendered = templates.renderTwoBinomial({
      conceptId: "FAC_C4_TRINOMIAL",
      a: 3,
      b: 5,
      direction: "factor",
    });
    const bad: RenderedQuestion = { ...rendered, acceptedAnswers: ["(x+1)(x+15)", "(x + 1)(x + 15)"] };
    const result = verifier.verify(bad);
    assert.equal(result.passed, false);
    assert.equal(result.layers.answer, false);
  });
});
