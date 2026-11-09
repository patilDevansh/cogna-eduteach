/**
 * Golden Test Suite: The Sarah Rule for Retroactive Clearance
 *
 * Verifies:
 * 1. Retroactive clearance of prerequisite sign slips (FAC_GCF_NEGATIVE, FND_SIGN_MUL_DIV, FAC_PAIR_PRODUCT_SUM)
 *    upon unhedged downstream success in composite questions (FAC_GROUP_SIGN, FAC_MONIC_TRINOMIAL).
 * 2. Sets state = "SECURE", retroactivelyCleared = true, slipClassification = "CARELESS_DRILL_SLIP".
 * 3. Does NOT clear sign slip if downstream question is purely positive (negative control).
 * 4. Sarah's cleared sign skill receives Competency Rating 4 (FLUENT) and prevents unwarranted foundational remediation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import {
  foldLedger,
  calculateSkillRating,
  calculateStartingZone,
  applySarahRetroactiveClearance,
} from "../../src/lotus/lotus-factorisation";

describe("The Sarah Rule for Retroactive Clearance", () => {
  it("retroactively clears negative GCF sign slip when student solves composite grouping with minus downstream", () => {
    const audits: LotusQuestionAudit[] = [
      // Q1: GCF number correct
      {
        question: {
          id: "q1",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GCF_NUMBER",
          prompt: "Factorise: 6x + 9",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "3(2x + 3)",
            workedSolution: ["3(2x + 3)"],
            diagnostics: { slot: 1, itemKind: "FACTORISE", expression: "6x + 9", skillId: "FAC_GCF_NUMBER", level: "easy", origin: "CODE" },
          },
        },
        response: { answer: "3(2x + 3)", didNotKnow: false, responseTimeMs: 8_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_GCF_NUMBER", kind: "SECURE" }],
      },
      // Q5: Negative GCF slip: -4x - 8 answered as -4(x - 2) (kept original signs)
      {
        question: {
          id: "q5",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GCF_NEGATIVE",
          prompt: "Factorise completely: -4x - 8",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "-4(x + 2)",
            workedSolution: ["-4(x + 2)"],
            diagnostics: {
              slot: 5,
              itemKind: "FACTORISE",
              expression: "-4x - 8",
              skillId: "FAC_GCF_NEGATIVE",
              level: "medium",
              origin: "CODE",
              predictedMistakes: [{ mistake: "KEPT_ORIGINAL_SIGNS", answer: "-4(x - 2)" }],
            },
          },
        },
        response: { answer: "-4(x - 2)", didNotKnow: false, responseTimeMs: 14_000 },
        verification: { status: "VERIFIED_INCORRECT", score: 0 },
        skillEvidence: [{ skillId: "FAC_GCF_NEGATIVE", kind: "MISTAKE", mistake: "KEPT_ORIGINAL_SIGNS" }],
      },
      // Q6: Meaning correct
      {
        question: {
          id: "q6",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_MEANING",
          prompt: "Is 2y(x + 1) + 3(x + 1) fully factorised? Why?",
          type: "MULTIPLE_CHOICE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "MULTIPLE_CHOICE",
            canonicalAnswer: "No, because the term (x + 1) can be factored out",
            workedSolution: ["Common binomial"],
            diagnostics: { slot: 6, itemKind: "CHOICE", expression: "2y(x+1)+3(x+1)", skillId: "FAC_MEANING", level: "easy", origin: "CODE" },
          },
        },
        response: { answer: "No, because the term (x + 1) can be factored out", didNotKnow: false, responseTimeMs: 9_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_MEANING", kind: "SECURE" }],
      },
      // Q7: Common binomial correct
      {
        question: {
          id: "q7",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_COMMON_BINOMIAL",
          prompt: "Factorise: 3(x - 2) + y(x - 2)",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "(x - 2)(3 + y)",
            workedSolution: ["(x - 2)(3 + y)"],
            diagnostics: { slot: 7, itemKind: "FACTORISE", expression: "3(x - 2) + y(x - 2)", skillId: "FAC_COMMON_BINOMIAL", level: "easy", origin: "CODE" },
          },
        },
        response: { answer: "(x - 2)(3 + y)", didNotKnow: false, responseTimeMs: 11_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_COMMON_BINOMIAL", kind: "SECURE" }],
      },
      // Q8: Grouping with minus sign answered correctly: 6xy - 4y - 9x + 6 = (3x - 2)(2y - 3)
      {
        question: {
          id: "q8",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GROUP_SIGN",
          prompt: "Factorise by regrouping: 6xy - 4y - 9x + 6",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "(3x - 2)(2y - 3)",
            workedSolution: ["2y(3x - 2) - 3(3x - 2) = (3x - 2)(2y - 3)"],
            diagnostics: { slot: 8, itemKind: "FACTORISE", expression: "6xy - 4y - 9x + 6", skillId: "FAC_GROUP_SIGN", level: "medium", origin: "CODE" },
          },
        },
        response: { answer: "(3x - 2)(2y - 3)", didNotKnow: false, responseTimeMs: 16_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_GROUP_SIGN", kind: "SECURE" }],
      },
    ];

    const ledger = foldLedger(audits);
    const gcfNeg = ledger.get("FAC_GCF_NEGATIVE");

    assert.ok(gcfNeg, "FAC_GCF_NEGATIVE should exist in ledger");
    assert.equal(gcfNeg?.state, "SECURE", "Negative GCF must be retroactively cleared to SECURE");
    assert.equal(gcfNeg?.retroactivelyCleared, true, "Must have retroactivelyCleared === true");
    assert.equal(gcfNeg?.slipClassification, "CARELESS_DRILL_SLIP", "Must be reclassified as CARELESS_DRILL_SLIP");
    assert.ok(gcfNeg?.clearedAfterSlip !== undefined, "clearedAfterSlip should be recorded");
    assert.ok(
      gcfNeg?.notes.some((n) => n.includes("CARELESS_DRILL_SLIP")),
      "Notes must document retroactive clearance as CARELESS_DRILL_SLIP",
    );

    // Verify rating is 4 (FLUENT)
    const ratingResult = calculateSkillRating(gcfNeg!, audits);
    assert.equal(ratingResult?.rating, 4);
    assert.equal(ratingResult?.ratingStatus, "FLUENT");

    // Verify Starting Zone does NOT route to foundational remediation for sign errors
    const zone = calculateStartingZone(ledger, audits, undefined, "CBSE");
    assert.notEqual(
      zone.scaffoldingLevel,
      "FOUNDATIONAL_REMEDIATION",
      "Sarah must not be routed to foundational remediation for a cleared sign slip",
    );
  });

  it("retroactively clears factor pair product sum slip when quadratic trinomial is factored correctly downstream", () => {
    const audits: LotusQuestionAudit[] = [
      // Q12: Factor pair product sum slip
      {
        question: {
          id: "q12",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_PAIR_PRODUCT_SUM",
          prompt: "Find two numbers whose product is -12 and sum is -1",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "-4 and 3",
            workedSolution: ["-4 * 3 = -12, -4 + 3 = -1"],
            diagnostics: { slot: 12, itemKind: "PAIR", expression: "p*q = -12, p+q = -1", skillId: "FAC_PAIR_PRODUCT_SUM", level: "medium", origin: "CODE" },
          },
        },
        response: { answer: "-6 and 2", didNotKnow: false, responseTimeMs: 15_000 },
        verification: { status: "VERIFIED_INCORRECT", score: 0 },
        skillEvidence: [{ skillId: "FAC_PAIR_PRODUCT_SUM", kind: "MISTAKE", mistake: "WRONG_FACTOR_PAIR_SUM" }],
      },
      // Q14: Monic trinomial x^2 - x - 12 factored correctly
      {
        question: {
          id: "q14",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_MONIC_TRINOMIAL",
          prompt: "Factorise: x^2 - x - 12",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "(x - 4)(x + 3)",
            workedSolution: ["(x - 4)(x + 3)"],
            diagnostics: { slot: 14, itemKind: "FACTORISE", expression: "x^2 - x - 12", skillId: "FAC_MONIC_TRINOMIAL", level: "medium", origin: "CODE" },
          },
        },
        response: { answer: "(x - 4)(x + 3)", didNotKnow: false, responseTimeMs: 17_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_MONIC_TRINOMIAL", kind: "SECURE" }],
      },
    ];

    const ledger = foldLedger(audits);
    const pairSum = ledger.get("FAC_PAIR_PRODUCT_SUM");

    assert.ok(pairSum, "FAC_PAIR_PRODUCT_SUM must exist in ledger");
    assert.equal(pairSum?.state, "SECURE", "Factor pair slip must be retroactively cleared by trinomial success");
    assert.equal(pairSum?.retroactivelyCleared, true);
    assert.equal(pairSum?.slipClassification, "CARELESS_DRILL_SLIP");
  });

  it("does NOT clear negative sign slip if downstream question is purely positive (negative control)", () => {
    const audits: LotusQuestionAudit[] = [
      // Q5: Negative GCF slip on -4x - 8
      {
        question: {
          id: "q5",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GCF_NEGATIVE",
          prompt: "Factorise: -4x - 8",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "-4(x + 2)",
            workedSolution: ["-4(x + 2)"],
            diagnostics: { slot: 5, itemKind: "FACTORISE", expression: "-4x - 8", skillId: "FAC_GCF_NEGATIVE", level: "medium", origin: "CODE" },
          },
        },
        response: { answer: "-4(x - 2)", didNotKnow: false, responseTimeMs: 12_000 },
        verification: { status: "VERIFIED_INCORRECT", score: 0 },
        skillEvidence: [{ skillId: "FAC_GCF_NEGATIVE", kind: "MISTAKE", mistake: "KEPT_ORIGINAL_SIGNS" }],
      },
      // Q7: All-positive common binomial: 3(x + 2) + y(x + 2)
      {
        question: {
          id: "q7",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_COMMON_BINOMIAL",
          prompt: "Factorise: 3(x + 2) + y(x + 2)",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "(x + 2)(3 + y)",
            workedSolution: ["(x + 2)(3 + y)"],
            diagnostics: { slot: 7, itemKind: "FACTORISE", expression: "3(x + 2) + y(x + 2)", skillId: "FAC_COMMON_BINOMIAL", level: "easy", origin: "CODE" },
          },
        },
        response: { answer: "(x + 2)(3 + y)", didNotKnow: false, responseTimeMs: 10_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_COMMON_BINOMIAL", kind: "SECURE" }],
      },
    ];

    const ledger = foldLedger(audits);
    const gcfNeg = ledger.get("FAC_GCF_NEGATIVE");

    assert.ok(gcfNeg);
    assert.equal(
      gcfNeg?.state,
      "SUSPECTED",
      "Must remain SUSPECTED because the downstream question has no negative signs to test negative sign mastery",
    );
    assert.equal(gcfNeg?.retroactivelyCleared, undefined);
  });

  it("retroactively clears signed multiplication/division error when perfect square with minus is solved", () => {
    const audits: LotusQuestionAudit[] = [
      // Q4: FND_SIGN_MUL_DIV sign slip
      {
        question: {
          id: "q4",
          phase: "DIAGNOSTIC",
          subtopic: "FND_SIGN_MUL_DIV",
          prompt: "Calculate: -4 * 3",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "-12",
            workedSolution: ["-12"],
            diagnostics: { slot: 4, itemKind: "NUMBER", expression: "-4 * 3", skillId: "FND_SIGN_MUL_DIV", level: "easy", origin: "CODE" },
          },
        },
        response: { answer: "12", didNotKnow: false, responseTimeMs: 11_000 },
        verification: { status: "VERIFIED_INCORRECT", score: 0 },
        skillEvidence: [{ skillId: "FND_SIGN_MUL_DIV", kind: "MISTAKE", mistake: "SIGN_PRODUCT_ERROR" }],
      },
      // Q10: Perfect square minus: 4x^2 - 12xy + 9y^2 solved correctly: (2x - 3y)^2
      {
        question: {
          id: "q10",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_PERFECT_SQUARE_MINUS",
          prompt: "Factorise: 4x^2 - 12xy + 9y^2",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "(2x - 3y)^2",
            workedSolution: ["(2x - 3y)^2"],
            diagnostics: { slot: 10, itemKind: "FACTORISE", expression: "4x^2 - 12xy + 9y^2", skillId: "FAC_PERFECT_SQUARE_MINUS", level: "hard", origin: "CODE" },
          },
        },
        response: { answer: "(2x - 3y)^2", didNotKnow: false, responseTimeMs: 14_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_PERFECT_SQUARE_MINUS", kind: "SECURE" }],
      },
    ];

    const ledger = foldLedger(audits);
    const signMulDiv = ledger.get("FND_SIGN_MUL_DIV");

    assert.ok(signMulDiv);
    assert.equal(signMulDiv?.state, "SECURE");
    assert.equal(signMulDiv?.retroactivelyCleared, true);
    assert.equal(signMulDiv?.slipClassification, "CARELESS_DRILL_SLIP");
  });

  it("does NOT falsely clear prerequisite sign slip when subsequent slip occurs after intermediate composite success (Turn 4 slip, Turn 7 composite, Turn 10 slip)", () => {
    function makeCorrectAudit(slot: number, skillId: string = "FAC_GCF_NUMBER"): LotusQuestionAudit {
      return {
        question: {
          id: `q${slot}`,
          phase: "DIAGNOSTIC",
          subtopic: skillId,
          prompt: `Factorise: ${slot}x + ${slot * 2}`,
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: `${slot}(x + 2)`,
            workedSolution: [`${slot}(x + 2)`],
            diagnostics: { slot, itemKind: "FACTORISE", expression: `${slot}x + ${slot * 2}`, skillId, level: "easy", origin: "CODE" },
          },
        },
        response: { answer: `${slot}(x + 2)`, didNotKnow: false, responseTimeMs: 8_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId, kind: "SECURE" }],
      };
    }

    const audits: LotusQuestionAudit[] = [
      // Turns 1–3: Correct on GCF foundations
      makeCorrectAudit(1, "FAC_GCF_NUMBER"),
      makeCorrectAudit(2, "FAC_GCF_VARIABLE"),
      makeCorrectAudit(3, "FAC_GCF_COMPOUND"),

      // Turn 4: First negative GCF slip -> SUSPECTED at Turn 4
      {
        question: {
          id: "q4",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GCF_NEGATIVE",
          prompt: "Factorise completely: -4x - 8",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "-4(x + 2)",
            workedSolution: ["-4(x + 2)"],
            diagnostics: {
              slot: 4,
              itemKind: "FACTORISE",
              expression: "-4x - 8",
              skillId: "FAC_GCF_NEGATIVE",
              level: "medium",
              origin: "CODE",
              predictedMistakes: [{ mistake: "KEPT_ORIGINAL_SIGNS", answer: "-4(x - 2)" }],
            },
          },
        },
        response: { answer: "-4(x - 2)", didNotKnow: false, responseTimeMs: 14_000 },
        verification: { status: "VERIFIED_INCORRECT", score: 0 },
        skillEvidence: [{ skillId: "FAC_GCF_NEGATIVE", kind: "MISTAKE", mistake: "KEPT_ORIGINAL_SIGNS" }],
      },

      // Turns 5–6: Correct on intermediate topics
      makeCorrectAudit(5, "FAC_MEANING"),
      makeCorrectAudit(6, "FAC_COMMON_BINOMIAL"),

      // Turn 7: Intermediate composite grouping with minus solved correctly -> Turn 7
      {
        question: {
          id: "q7",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GROUP_SIGN",
          prompt: "Factorise by regrouping: 6xy - 4y - 9x + 6",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "(3x - 2)(2y - 3)",
            workedSolution: ["2y(3x - 2) - 3(3x - 2) = (3x - 2)(2y - 3)"],
            diagnostics: { slot: 7, itemKind: "FACTORISE", expression: "6xy - 4y - 9x + 6", skillId: "FAC_GROUP_SIGN", level: "medium", origin: "CODE" },
          },
        },
        response: { answer: "(3x - 2)(2y - 3)", didNotKnow: false, responseTimeMs: 16_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_GROUP_SIGN", kind: "SECURE" }],
      },

      // Turns 8–9: Correct on identities
      makeCorrectAudit(8, "FAC_DIFF_SQUARES"),
      makeCorrectAudit(9, "FAC_PERFECT_SQUARE"),

      // Turn 10: Second negative GCF slip -> CONFIRMED at Turn 10
      {
        question: {
          id: "q10",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GCF_NEGATIVE",
          prompt: "Factorise completely: -6x - 18",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "-6(x + 3)",
            workedSolution: ["-6(x + 3)"],
            diagnostics: {
              slot: 10,
              itemKind: "FACTORISE",
              expression: "-6x - 18",
              skillId: "FAC_GCF_NEGATIVE",
              level: "medium",
              origin: "CODE",
              predictedMistakes: [{ mistake: "FLIPPED_ONE_SIGN", answer: "-6(x - 3)" }],
            },
          },
        },
        response: { answer: "-6(x - 3)", didNotKnow: false, responseTimeMs: 15_000 },
        verification: { status: "VERIFIED_INCORRECT", score: 0 },
        skillEvidence: [{ skillId: "FAC_GCF_NEGATIVE", kind: "MISTAKE", mistake: "FLIPPED_ONE_SIGN" }],
      },
    ];

    const ledger = foldLedger(audits);
    const gcfNeg = ledger.get("FAC_GCF_NEGATIVE");

    assert.ok(gcfNeg, "FAC_GCF_NEGATIVE must exist in ledger");
    assert.equal(gcfNeg?.state, "CONFIRMED", "Subsequent slip after intermediate composite success must remain CONFIRMED");
    assert.equal(gcfNeg?.suspectedAt, 4, "suspectedAt must record Turn 4");
    assert.equal(gcfNeg?.confirmedAt, 10, "confirmedAt must record the subsequent slip at Turn 10");
    assert.equal(gcfNeg?.retroactivelyCleared, undefined, "retroactivelyCleared must NOT be set");
    assert.notEqual(gcfNeg?.slipClassification, "CARELESS_DRILL_SLIP", "Subsequent slip cannot be reclassified as CARELESS_DRILL_SLIP");

    // Must be classified as critical blocker requiring remediation
    const ratingResult = calculateSkillRating(gcfNeg!, audits);
    assert.equal(ratingResult?.rating, 1, "Confirmed negative GCF gap must receive Rating 1 (CRITICAL_BLOCKER)");
    assert.equal(ratingResult?.ratingStatus, "CRITICAL_BLOCKER");

    // Starting zone must route to foundational remediation for the active sign gap
    const zone = calculateStartingZone(ledger, audits, undefined, "CBSE");
    assert.equal(zone.scaffoldingLevel, "FOUNDATIONAL_REMEDIATION");
    assert.equal(zone.moduleId, "MOD_FACT_SIGNS_MEANING");
  });

  it("does NOT clear prerequisite slip when slip occurs after composite success (reverse temporal ordering)", () => {
    function makeCorrectAudit(slot: number, skillId: string = "FAC_GCF_NUMBER"): LotusQuestionAudit {
      return {
        question: {
          id: `q${slot}`,
          phase: "DIAGNOSTIC",
          subtopic: skillId,
          prompt: `Factorise: ${slot}x + ${slot * 2}`,
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: `${slot}(x + 2)`,
            workedSolution: [`${slot}(x + 2)`],
            diagnostics: { slot, itemKind: "FACTORISE", expression: `${slot}x + ${slot * 2}`, skillId, level: "easy", origin: "CODE" },
          },
        },
        response: { answer: `${slot}(x + 2)`, didNotKnow: false, responseTimeMs: 8_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId, kind: "SECURE" }],
      };
    }

    const audits: LotusQuestionAudit[] = [
      makeCorrectAudit(1, "FAC_GCF_NUMBER"),
      makeCorrectAudit(2, "FAC_GCF_VARIABLE"),
      makeCorrectAudit(3, "FAC_GCF_COMPOUND"),
      makeCorrectAudit(4, "FAC_MEANING"),
      // Turn 5: Composite grouping with minus correct at Turn 5
      {
        question: {
          id: "q5",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GROUP_SIGN",
          prompt: "Factorise by regrouping: 6xy - 4y - 9x + 6",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "(3x - 2)(2y - 3)",
            workedSolution: ["2y(3x - 2) - 3(3x - 2) = (3x - 2)(2y - 3)"],
            diagnostics: { slot: 5, itemKind: "FACTORISE", expression: "6xy - 4y - 9x + 6", skillId: "FAC_GROUP_SIGN", level: "medium", origin: "CODE" },
          },
        },
        response: { answer: "(3x - 2)(2y - 3)", didNotKnow: false, responseTimeMs: 12_000 },
        verification: { status: "VERIFIED_CORRECT", score: 1 },
        skillEvidence: [{ skillId: "FAC_GROUP_SIGN", kind: "SECURE" }],
      },
      makeCorrectAudit(6, "FAC_COMMON_BINOMIAL"),
      makeCorrectAudit(7, "FAC_DIFF_SQUARES"),
      // Turn 8: Negative GCF first slip occurs downstream at Turn 8
      {
        question: {
          id: "q8",
          phase: "DIAGNOSTIC",
          subtopic: "FAC_GCF_NEGATIVE",
          prompt: "Factorise completely: -4x - 8",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: false,
          purpose: "EVIDENCE",
          answerKey: {
            kind: "OPEN_RESPONSE",
            canonicalAnswer: "-4(x + 2)",
            workedSolution: ["-4(x + 2)"],
            diagnostics: {
              slot: 8,
              itemKind: "FACTORISE",
              expression: "-4x - 8",
              skillId: "FAC_GCF_NEGATIVE",
              level: "medium",
              origin: "CODE",
              predictedMistakes: [{ mistake: "KEPT_ORIGINAL_SIGNS", answer: "-4(x - 2)" }],
            },
          },
        },
        response: { answer: "-4(x - 2)", didNotKnow: false, responseTimeMs: 14_000 },
        verification: { status: "VERIFIED_INCORRECT", score: 0 },
        skillEvidence: [{ skillId: "FAC_GCF_NEGATIVE", kind: "MISTAKE", mistake: "KEPT_ORIGINAL_SIGNS" }],
      },
    ];

    const ledger = foldLedger(audits);
    const gcfNeg = ledger.get("FAC_GCF_NEGATIVE");

    assert.ok(gcfNeg, "FAC_GCF_NEGATIVE must exist in ledger");
    assert.equal(gcfNeg?.state, "SUSPECTED", "Prerequisite slip occurring after composite success must remain SUSPECTED");
    assert.equal(gcfNeg?.suspectedAt, 8, "suspectedAt must be 8");
    assert.equal(gcfNeg?.retroactivelyCleared, undefined, "Earlier composite success cannot retroactively clear subsequent slip");
  });
});


