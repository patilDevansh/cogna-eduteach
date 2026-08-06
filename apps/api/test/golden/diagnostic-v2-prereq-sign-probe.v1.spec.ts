/**
 * The FND_SIGN_MUL_DIV prerequisite probe.
 *
 * Before this, the selector's prompt could correctly identify that a
 * repeated LIN_DISTRIBUTE_NEG failure traced back to an untested
 * FND_SIGN_MUL_DIV prerequisite (see diagnostic-v2-selector-root-cause.v1),
 * but no template or fixed item existed that actually tested it — confirmed
 * live: the selector kept re-serving bracket questions because there was
 * nothing else to serve. This is the "hands" for those "eyes": a bare
 * signed-multiplication item the selector can GENERATE, plus the routing
 * that resumes the normal sequence afterward without serving a duplicate.
 *
 * AUTHOR is deliberately not extended to this skill: the authoring gate
 * requires an equation with a variable (see gateAuthoredItem's NOT_AN_EQUATION
 * / DEGENERATE checks), and a bare numeric fact has neither. Supporting it
 * would mean a second, differently-shaped safety gate — out of scope here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderTemplate,
  verifyRendered,
  findFixedItem,
  isKnownTemplateId,
  TEMPLATE_DESCRIPTIONS,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import { nextStagesAfter } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { verifyStepValidity } from "../../src/engines/diagnostic-v2/linear-bracket-verifier";

describe("the prerequisite probe is a legal template", () => {
  it("TPL_SIGN_MUL_DIV is known to the selector's bounds check", () => {
    assert.equal(isKnownTemplateId("TPL_SIGN_MUL_DIV"), true);
  });

  it("has a shape description so the selector can tell it apart from the other four", () => {
    assert.match(TEMPLATE_DESCRIPTIONS.TPL_SIGN_MUL_DIV, /prerequisite/i);
    assert.match(TEMPLATE_DESCRIPTIONS.TPL_SIGN_MUL_DIV, /\(m\)\(n\)/);
  });

  it("the fixed item targets FND_SIGN_MUL_DIV, not the bracket skill", () => {
    const item = findFixedItem("PREREQ_SIGN_PROBE");
    assert.equal(item?.primaryMicroSkillId, "FND_SIGN_MUL_DIV");
    assert.equal(item?.isBareExpression, true);
    assert.equal(item?.stageId, "PREREQ_SIGN_PROBE");
  });
});

describe("generated instances are always two negatives — the sign is the point", () => {
  for (let i = 0; i < 12; i++) {
    it(`instance ${i}: both factors negative, and re-verification passes`, () => {
      const item = renderTemplate("TPL_SIGN_MUL_DIV" as never, `probe-${i}`);
      const m = item.openingLine.match(/\((-?\d+)\)\((-?\d+)\)/);
      assert.ok(m, `openingLine "${item.openingLine}" should be (m)(n)`);
      const [, left, right] = m!;
      assert.ok(Number(left) < 0, `left factor ${left} should be negative`);
      assert.ok(Number(right) < 0, `right factor ${right} should be negative`);

      const v = verifyRendered(item);
      assert.equal(v.passed, true, v.passed ? "" : JSON.stringify(v.failures));
    });
  }

  it("the product is genuinely positive, and the verifier agrees", () => {
    const item = renderTemplate("TPL_SIGN_MUL_DIV" as never, "seed-fixed");
    const m = item.openingLine.match(/\((-?\d+)\)\((-?\d+)\)/)!;
    const product = Number(m[1]) * Number(m[2]);
    assert.ok(product > 0);
    assert.equal(verifyStepValidity(item.openingLine, String(product)).validity, "VALID");
  });

  it("the canonical sign error is rejected", () => {
    // Same misconception the fixed item is written to catch.
    const item = renderTemplate("TPL_SIGN_MUL_DIV" as never, "seed-fixed");
    const m = item.openingLine.match(/\((-?\d+)\)\((-?\d+)\)/)!;
    const correctProduct = Number(m[1]) * Number(m[2]);
    const wrongAsIfNegative = -Math.abs(correctProduct);
    assert.equal(
      verifyStepValidity(item.openingLine, String(wrongAsIfNegative)).validity,
      "INVALID",
    );
  });
});

describe("routing: resumes the sequence rather than ending it", () => {
  it("does not fall through to COMPLETE", () => {
    const next = nextStagesAfter("PREREQ_SIGN_PROBE", { targetSkillFailed: true, patternConfirmed: false });
    assert.ok(!next.includes("COMPLETE"), "a prerequisite probe must not silently end the session");
  });

  it("resumes into the discriminating contrast check", () => {
    assert.deepEqual(
      nextStagesAfter("PREREQ_SIGN_PROBE", { targetSkillFailed: true, patternConfirmed: false }),
      ["NEG_DIST_CONTRAST"],
    );
  });

  it("is unaffected by ctx flags meant for other stages", () => {
    // PREREQ_SIGN_PROBE's routing does not depend on targetSkillFailed /
    // patternConfirmed the way NEG_DIST_MAIN / NEG_DIST_CONTRAST do.
    const a = nextStagesAfter("PREREQ_SIGN_PROBE", { targetSkillFailed: false, patternConfirmed: true });
    const b = nextStagesAfter("PREREQ_SIGN_PROBE", { targetSkillFailed: true, patternConfirmed: false });
    assert.deepEqual(a, b);
  });
});
