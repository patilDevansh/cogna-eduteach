/**
 * Minus lookalikes — U+2212 (the real minus sign, which LLMs emit routinely
 * when formatting maths) and U+2013 (en-dash, which word processors
 * autocorrect hyphens into).
 *
 * These are regression tests for a bug the rest of the suite could not see:
 * the tokenizer folded both characters, but `matchSingleBracket` ran its regex
 * on the un-normalized string and `normalizedQuestionKey` did not fold at all.
 * A unicode-minus equation therefore parsed and solved correctly while
 *   - the first-invalid-action analysis silently lost its bracket, degrading a
 *     precise diagnosis into a generic "these lines don't match", and
 *   - a duplicate slipped past the "already shown this session" check.
 *
 * Nothing failed loudly. The verdicts stayed correct; only the diagnostic
 * value — the entire point of this engine — quietly drained away. That is why
 * these assert on the *description* and on skill attribution, not just on
 * VALID/INVALID.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  foldMinusLookalikes,
  matchSingleBracket,
  verifyStepValidity,
} from "../../src/engines/diagnostic-v2/linear-bracket-verifier";
import { normalizedQuestionKey } from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import { gateAuthoredItem } from "../../src/engines/diagnostic-v2/diagnostic-v2-authoring";

const U_MINUS = "−";
const EN_DASH = "–";

/** `-2(x - 5) + 3 = 11` written three ways that must behave identically. */
const ASCII_LINE = "-2(x - 5) + 3 = 11";
const UNICODE_LINE = `${U_MINUS}2(x ${U_MINUS} 5) + 3 = 11`;
const ENDASH_LINE = `${EN_DASH}2(x ${EN_DASH} 5) + 3 = 11`;

describe("foldMinusLookalikes", () => {
  it("folds U+2212 and U+2013 to ASCII hyphen", () => {
    assert.equal(foldMinusLookalikes(UNICODE_LINE), ASCII_LINE);
    assert.equal(foldMinusLookalikes(ENDASH_LINE), ASCII_LINE);
  });

  it("leaves ASCII text untouched", () => {
    assert.equal(foldMinusLookalikes(ASCII_LINE), ASCII_LINE);
  });

  it("does not touch other characters", () => {
    assert.equal(foldMinusLookalikes("x = 5 + 3"), "x = 5 + 3");
  });
});

describe("matchSingleBracket — reads the bracket regardless of which minus was typed", () => {
  it("finds the same multiplier and inner term in all three spellings", () => {
    const ascii = matchSingleBracket(ASCII_LINE);
    assert.deepEqual(ascii, { multiplier: -2, inner: { a: 1, b: -5 } });
    assert.deepEqual(matchSingleBracket(UNICODE_LINE), ascii);
    assert.deepEqual(matchSingleBracket(ENDASH_LINE), ascii);
  });
});

describe("first-invalid-action survives a unicode minus", () => {
  // The canonical Arun error: (-2)(-5) evaluated as -10 instead of +10.
  const wrongAscii = "-2x - 10 + 3 = 11";
  const wrongUnicode = `${U_MINUS}2x ${U_MINUS} 10 + 3 = 11`;

  it("names the sign product when the question uses ASCII", () => {
    const r = verifyStepValidity(ASCII_LINE, wrongAscii);
    assert.equal(r.validity, "INVALID");
    assert.match(r.firstInvalidActionDescription ?? "", /signs give/);
  });

  it("names the same sign product when the question uses U+2212", () => {
    const r = verifyStepValidity(UNICODE_LINE, wrongUnicode);
    assert.equal(r.validity, "INVALID");
    // The regression: this used to fall back to the generic
    // "does not have the same solution" message.
    assert.match(r.firstInvalidActionDescription ?? "", /signs give/);
    assert.equal(
      r.firstInvalidActionDescription,
      verifyStepValidity(ASCII_LINE, wrongAscii).firstInvalidActionDescription,
      "a unicode minus must not change the diagnosis text",
    );
  });

  it("blames the same micro-skill either way", () => {
    assert.equal(
      verifyStepValidity(UNICODE_LINE, wrongUnicode).firstInvalidActionCode,
      verifyStepValidity(ASCII_LINE, wrongAscii).firstInvalidActionCode,
    );
  });

  it("still accepts a correct expansion in either spelling", () => {
    assert.equal(verifyStepValidity(ASCII_LINE, "-2x + 10 + 3 = 11").validity, "VALID");
    assert.equal(
      verifyStepValidity(UNICODE_LINE, `${U_MINUS}2x + 10 + 3 = 11`).validity,
      "VALID",
    );
  });
});

describe("normalizedQuestionKey — a unicode twin is the same question", () => {
  it("collapses all three spellings to one key", () => {
    const key = normalizedQuestionKey(ASCII_LINE);
    assert.equal(normalizedQuestionKey(UNICODE_LINE), key);
    assert.equal(normalizedQuestionKey(ENDASH_LINE), key);
  });

  it("still distinguishes genuinely different questions", () => {
    assert.notEqual(
      normalizedQuestionKey(ASCII_LINE),
      normalizedQuestionKey("-3(x - 5) + 3 = 11"),
    );
  });
});

describe("authoring gate — unicode minus neither sneaks past nor is wrongly refused", () => {
  const authored = (equation: string, claimedSolution: string) => ({
    authored: {
      equation,
      claimedSolution,
      targetMicroSkillId: "LIN_DISTRIBUTE_NEG" as const,
      whyNoTemplateFits: "test",
      reasoning: "test",
    },
    stageId: "NEG_DIST_MAIN" as const,
    isTransferCheck: false,
    alreadyServed: new Set<string>(),
  });

  it("accepts a valid authored item written with U+2212", () => {
    // Was rejected SKILL_NOT_EXERCISED: it parsed and solved, but the skill
    // check could not see the negative multiplier.
    const result = gateAuthoredItem(
      authored(`${U_MINUS}3(x ${U_MINUS} 4) + 5 = 17`, "x = 0"),
    );
    assert.equal(
      result.passed,
      true,
      result.passed ? "" : `unexpectedly rejected: ${result.rejection.code} — ${result.rejection.detail}`,
    );
  });

  it("accepts the ASCII equivalent identically", () => {
    assert.equal(gateAuthoredItem(authored("-3(x - 4) + 5 = 17", "x = 0")).passed, true);
  });

  it("reads a claimed solution written with a unicode minus", () => {
    assert.equal(
      gateAuthoredItem(authored(`${U_MINUS}4(y ${U_MINUS} 3) + 2 = 22`, `y = ${U_MINUS}2`)).passed,
      true,
    );
  });

  it("catches a unicode-spelled duplicate of an ASCII question already served", () => {
    const result = gateAuthoredItem({
      ...authored(UNICODE_LINE, "x = 1"),
      alreadyServed: new Set([normalizedQuestionKey(ASCII_LINE)]),
    });
    assert.equal(result.passed, false);
    assert.equal(
      result.passed ? "" : result.rejection.code,
      "DUPLICATE",
      "a unicode twin of an already-served question must not be treated as new",
    );
  });

  it("still rejects wrong maths written with a unicode minus", () => {
    const result = gateAuthoredItem(
      authored(`${U_MINUS}3(x ${U_MINUS} 4) + 5 = 17`, "x = 99"),
    );
    assert.equal(result.passed, false);
    assert.equal(result.passed ? "" : result.rejection.code, "CLAIMED_ANSWER_MISMATCH");
  });
});
