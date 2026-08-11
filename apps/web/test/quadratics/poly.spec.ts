import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  parseExpression,
  collectTerms,
  polyEquals,
  areEquivalent,
  equivalentToPoly,
  hasUncombinedLikeTerms,
  formatPoly,
  evaluateAt,
  checkFactorPair,
} from "../../src/lib/quadratics/poly";

describe("parseExpression — the constrained grammar", () => {
  it("parses a simple distribution", () => {
    const r = parseExpression("3(x+4)");
    assert.ok(r.ok);
    assert.deepEqual(collectTerms(r.terms), [12, 3]);
  });

  it("parses x*x as x^2 via juxtaposition", () => {
    const r = parseExpression("x(x+3)");
    assert.ok(r.ok);
    assert.deepEqual(collectTerms(r.terms), [0, 3, 1]);
  });

  it("parses two adjacent parenthesized factors (implicit multiplication)", () => {
    const r = parseExpression("(x+3)(x+5)");
    assert.ok(r.ok);
    assert.deepEqual(collectTerms(r.terms), [15, 8, 1]);
  });

  it("produces exactly four partial products for a binomial product", () => {
    const r = parseExpression("(x+3)(x+5)");
    assert.ok(r.ok);
    assert.equal(r.terms.length, 4);
  });

  it("handles negative factors and signed subtraction", () => {
    const r = parseExpression("(x-2)(x+5)");
    assert.ok(r.ok);
    assert.deepEqual(collectTerms(r.terms), [-10, 3, 1]);
  });

  it("handles a distributive intermediate step", () => {
    const r = parseExpression("x(x+5)+3(x+5)");
    assert.ok(r.ok);
    assert.deepEqual(collectTerms(r.terms), [15, 8, 1]);
  });

  it("abstains on decimals", () => {
    assert.equal(parseExpression("3.5x").ok, false);
  });

  it("abstains on unsupported characters", () => {
    assert.equal(parseExpression("x^2 = 16").ok, false);
    assert.equal(parseExpression("y+3").ok, false);
  });

  it("abstains on empty input", () => {
    assert.equal(parseExpression("").ok, false);
    assert.equal(parseExpression("   ").ok, false);
  });

  it("abstains on unbalanced parentheses", () => {
    assert.equal(parseExpression("(x+3").ok, false);
    assert.equal(parseExpression("x+3)").ok, false);
  });

  it("tolerates whitespace and unicode minus/times", () => {
    const r = parseExpression("x × (x − 2)");
    assert.ok(r.ok);
    assert.deepEqual(collectTerms(r.terms), [0, -2, 1]);
  });
});

describe("areEquivalent — accepts any valid route", () => {
  it("treats every staged form of (x+3)(x+5) as equivalent", () => {
    assert.ok(areEquivalent("(x+3)(x+5)", "x^2+8x+15"));
    assert.ok(areEquivalent("x(x+5)+3(x+5)", "x^2+8x+15"));
    assert.ok(areEquivalent("x^2+5x+3x+15", "x^2+8x+15"));
    assert.ok(areEquivalent("15+8x+x^2", "x^2+8x+15")); // reordered
  });

  it("rejects a transformation that changes the value", () => {
    assert.equal(areEquivalent("x^2+15", "x^2+8x+15"), false);
    assert.equal(areEquivalent("2x+8x+15", "x^2+8x+15"), false);
  });

  it("returns false when either side fails to parse", () => {
    assert.equal(areEquivalent("garbage!!", "x^2+8x+15"), false);
    assert.equal(areEquivalent("x^2+8x+15", "garbage!!"), false);
  });
});

describe("hasUncombinedLikeTerms — correct value vs finished simplification", () => {
  it("is false for a fully combined answer", () => {
    const r = parseExpression("x^2+8x+15");
    assert.ok(r.ok);
    assert.equal(hasUncombinedLikeTerms(r.terms), false);
  });

  it("is true when two same-degree terms are both still present", () => {
    const r = parseExpression("x^2+3x+5x+15");
    assert.ok(r.ok);
    assert.equal(hasUncombinedLikeTerms(r.terms), true);
    // ...even though the collected value is correct
    assert.deepEqual(collectTerms(r.terms), [15, 8, 1]);
  });
});

describe("formatPoly", () => {
  it("renders descending degree with correct signs", () => {
    assert.equal(formatPoly([15, 8, 1]), "x^2 + 8x + 15");
    assert.equal(formatPoly([-10, 3, 1]), "x^2 + 3x - 10");
    assert.equal(formatPoly([0]), "0");
    assert.equal(formatPoly([0, 1, 1]), "x^2 + x");
  });
});

describe("evaluateAt — independent numeric cross-check", () => {
  it("agrees with the symbolic engine at several sample points", () => {
    const a = normalize("(x+3)(x+5)");
    const b = normalize("x^2+8x+15");
    assert.ok(a.ok && b.ok);
    for (const x of [-3, 0, 1, 4, 10]) {
      assert.equal(evaluateAt(a.poly, x), evaluateAt(b.poly, x));
    }
  });
});

describe("checkFactorPair", () => {
  it("validates product and sum independently of written form", () => {
    const target = [15, 8, 1];
    assert.deepEqual(checkFactorPair(target, 3, 5), {
      productOk: true,
      sumOk: true,
      product: 15,
      sum: 8,
      requiredProduct: 15,
      requiredSum: 8,
    });
    const wrongSum = checkFactorPair(target, 1, 15);
    assert.equal(wrongSum.productOk, true);
    assert.equal(wrongSum.sumOk, false);
  });
});

describe("equivalentToPoly / polyEquals", () => {
  it("compares a raw factored form against a target poly", () => {
    assert.ok(equivalentToPoly("(x+3)(x+5)", [15, 8, 1]));
    assert.equal(equivalentToPoly("(x+1)(x+15)", [15, 8, 1]), false);
  });
  it("treats differing-length arrays as equal when trailing coefficients are zero", () => {
    assert.ok(polyEquals([15, 8, 1], [15, 8, 1, 0]));
  });
});
