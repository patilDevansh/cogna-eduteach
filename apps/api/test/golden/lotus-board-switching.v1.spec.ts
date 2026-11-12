import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adaptPromptForBoard,
  CANONICAL_15_SPINE,
  FACTORISATION_STRETCH_SLOTS,
} from "../../src/lotus/lotus-factorisation-catalogue";

describe("Lotus board switching — spelling normalization", () => {
  it("normalizes American spelling to British English across all boards", () => {
    assert.equal(
      adaptPromptForBoard("Factorize completely: 6x + 9", "CBSE"),
      "Factorise completely: 6x + 9",
    );
    assert.equal(
      adaptPromptForBoard("Factorize completely: 6x + 9", "ICSE"),
      "Factorise completely: 6x + 9",
    );
    assert.equal(
      adaptPromptForBoard("Factorize completely: 6x + 9", "IGCSE"),
      "Factorise completely: 6x + 9",
    );
    assert.equal(
      adaptPromptForBoard("Factorization by grouping terms", "CBSE"),
      "Factorisation by regrouping",
    );
    assert.equal(
      adaptPromptForBoard("factorize each quadratic expression", "IGCSE"),
      "factorise each quadratic expression",
    );
  });
});

describe("Lotus board switching — GCF vs HCF", () => {
  it("switches GCF to HCF for CBSE and ICSE", () => {
    assert.equal(
      adaptPromptForBoard("Find the GCF of 12x and 18", "CBSE"),
      "Find the HCF of 12x and 18",
    );
    assert.equal(
      adaptPromptForBoard("Find the GCF of 12x and 18", "ICSE"),
      "Find the HCF of 12x and 18",
    );
    assert.equal(
      adaptPromptForBoard("Find the greatest common factor of the terms", "CBSE"),
      "Find the highest common factor of the terms",
    );
  });

  it("switches HCF to GCF for IGCSE", () => {
    assert.equal(
      adaptPromptForBoard("Find the HCF of 12x and 18", "IGCSE"),
      "Find the GCF of 12x and 18",
    );
    assert.equal(
      adaptPromptForBoard("Find the highest common factor of the terms", "IGCSE"),
      "Find the greatest common factor of the terms",
    );
  });
});

describe("Lotus board switching — grouping terminology", () => {
  it("switches to 'regrouping' for CBSE", () => {
    assert.equal(
      adaptPromptForBoard("Factorise by grouping method: 2xy + 2y + 3x + 3", "CBSE"),
      "Factorise by regrouping: 2xy + 2y + 3x + 3",
    );
    assert.equal(
      adaptPromptForBoard("Factorise completely in pairs: 2xy + 2y + 3x + 3", "CBSE"),
      "Factorise by regrouping: 2xy + 2y + 3x + 3",
    );
    assert.equal(
      adaptPromptForBoard("Factorise by grouping of terms", "CBSE"),
      "Factorise by regrouping terms",
    );
  });

  it("switches to 'grouping method' for ICSE", () => {
    assert.equal(
      adaptPromptForBoard("Factorise by regrouping: 2xy + 2y + 3x + 3", "ICSE"),
      "Factorise by grouping method: 2xy + 2y + 3x + 3",
    );
    assert.equal(
      adaptPromptForBoard("Factorise completely in pairs: 2xy + 2y + 3x + 3", "ICSE"),
      "Factorise by grouping method: 2xy + 2y + 3x + 3",
    );
    assert.equal(
      adaptPromptForBoard("Factorise by regrouping terms", "ICSE"),
      "Factorise by grouping of terms",
    );
  });

  it("switches to 'factorising completely in pairs' for IGCSE", () => {
    assert.equal(
      adaptPromptForBoard("Factorise by regrouping: 2xy + 2y + 3x + 3", "IGCSE"),
      "Factorise completely in pairs: 2xy + 2y + 3x + 3",
    );
    assert.equal(
      adaptPromptForBoard("Factorise by grouping method: 2xy + 2y + 3x + 3", "IGCSE"),
      "Factorise completely in pairs: 2xy + 2y + 3x + 3",
    );
  });
});

describe("Lotus board switching — quadratics and splitting middle term", () => {
  it("adapts quadratic factor forms and splitting middle term for CBSE", () => {
    assert.equal(
      adaptPromptForBoard("Factorise into the form (x + p)(x + q)", "CBSE"),
      "Factorise into the form (x + a)(x + b)",
    );
    assert.equal(
      adaptPromptForBoard("Factorise by finding quadratic factors for x^2 + 5x + 6", "CBSE"),
      "Factorise by splitting the middle term for x^2 + 5x + 6",
    );
  });

  it("adapts quadratic factors for ICSE", () => {
    assert.equal(
      adaptPromptForBoard("Factorise into the form (x + p)(x + q)", "ICSE"),
      "Factorise into the form (x + a)(x + b)",
    );
    assert.equal(
      adaptPromptForBoard("Factorise x^2 + 5x + 6 by splitting the middle term", "ICSE"),
      "Factorise x^2 + 5x + 6 into quadratic factors",
    );
  });

  it("adapts double brackets and (x + p)(x + q) for IGCSE", () => {
    assert.equal(
      adaptPromptForBoard("Factorise into the form (x + a)(x + b)", "IGCSE"),
      "Factorise into the form (x + p)(x + q)",
    );
    assert.equal(
      adaptPromptForBoard("Factorise x^2 + 5x + 6 by splitting the middle term", "IGCSE"),
      "Factorise x^2 + 5x + 6 into double brackets",
    );
    assert.equal(
      adaptPromptForBoard("Find the quadratic factors for x^2 + 5x + 6", "IGCSE"),
      "Find the two linear factors (x + p)(x + q) for x^2 + 5x + 6",
    );
  });
});

describe("Lotus board switching — edge cases and idempotency", () => {
  it("is idempotent on already-adapted prompts", () => {
    const cbsePrompt = "Factorise by regrouping: 2xy + 2y + 3x + 3";
    assert.equal(adaptPromptForBoard(cbsePrompt, "CBSE"), cbsePrompt);

    const icsePrompt = "Factorise by grouping method: 2xy + 2y + 3x + 3";
    assert.equal(adaptPromptForBoard(icsePrompt, "ICSE"), icsePrompt);

    const igcsePrompt = "Factorise completely in pairs: 2xy + 2y + 3x + 3";
    assert.equal(adaptPromptForBoard(igcsePrompt, "IGCSE"), igcsePrompt);
  });

  it("handles empty strings and plain mathematical expressions", () => {
    assert.equal(adaptPromptForBoard("", "CBSE"), "");
    assert.equal(adaptPromptForBoard("6x + 9", "IGCSE"), "6x + 9");
    assert.equal(adaptPromptForBoard("x^2 - 9", "ICSE"), "x^2 - 9");
  });

  it("defaults safely to CBSE when board is missing or invalid", () => {
    assert.equal(
      adaptPromptForBoard("Find the GCF of 12x and 18", undefined as any),
      "Find the HCF of 12x and 18",
    );
  });
});

describe("Canonical 15-spine and stretch slots catalogue assertions", () => {
  it("CANONICAL_15_SPINE has exactly 15 slots covering all 5 curriculum tiers", () => {
    assert.equal(CANONICAL_15_SPINE.length, 15);
    for (let i = 0; i < 15; i++) {
      assert.equal(CANONICAL_15_SPINE[i].slot, i + 1);
      assert.ok(CANONICAL_15_SPINE[i].skillId);
      assert.ok(CANONICAL_15_SPINE[i].mistakes.length > 0);
    }

    // Verify 5 tiers
    // Tier 1 (1-3)
    assert.equal(CANONICAL_15_SPINE[0].shape, "6x + 9");
    assert.equal(CANONICAL_15_SPINE[1].shape, "x^2 + 5x");
    assert.equal(CANONICAL_15_SPINE[2].shape, "3x^2 + 3x");
    // Tier 2 (4-6)
    assert.equal(CANONICAL_15_SPINE[3].shape, "10x^2 - 18x^3 + 14x^4");
    assert.equal(CANONICAL_15_SPINE[4].shape, "-4x - 8");
    assert.equal(CANONICAL_15_SPINE[5].kind, "CHOICE");
    // Tier 3 (7-8)
    assert.equal(CANONICAL_15_SPINE[6].shape, "3(x - 2) + y(x - 2)");
    assert.equal(CANONICAL_15_SPINE[7].shape, "6xy - 4y - 9x + 6");
    // Tier 4 (9-11)
    assert.equal(CANONICAL_15_SPINE[8].shape, "x^2 - 9");
    assert.equal(CANONICAL_15_SPINE[9].shape, "49a^2 - 25b^2");
    assert.equal(CANONICAL_15_SPINE[10].shape, "4y^2 - 12y + 9");
    // Tier 5 (12-15)
    assert.equal(CANONICAL_15_SPINE[11].kind, "CHOICE");
    assert.equal(CANONICAL_15_SPINE[12].shape, "(x^2 - 9) / (x^2 - 6x + 9)");
    assert.equal(CANONICAL_15_SPINE[13].shape, "x^2 - x - 12");
    assert.equal(CANONICAL_15_SPINE[14].shape, "2x^2 - 18");
  });

  it("FACTORISATION_STRETCH_SLOTS has 10 high-performance slots", () => {
    assert.equal(FACTORISATION_STRETCH_SLOTS.length, 10);
    assert.equal(FACTORISATION_STRETCH_SLOTS[0].slot, 6);
    assert.equal(FACTORISATION_STRETCH_SLOTS[9].slot, 15);
    // Non-monic splitting at slot 6
    assert.equal(FACTORISATION_STRETCH_SLOTS[0].shape, "6x^2 - 11x - 10");
    // Nested squares at slot 7
    assert.equal(FACTORISATION_STRETCH_SLOTS[1].shape, "x^4 - 81");
    // Algebraic fraction at slot 8
    assert.equal(FACTORISATION_STRETCH_SLOTS[2].kind, "SIMPLIFY");
    // Parameter challenge at slot 11
    assert.equal(FACTORISATION_STRETCH_SLOTS[5].kind, "NUMBER");
    assert.equal(FACTORISATION_STRETCH_SLOTS[5].example?.answer, "14");
    // Olympiad Sophie Germain at slot 15
    assert.equal(FACTORISATION_STRETCH_SLOTS[9].shape, "n^4 + 4");
  });
});
