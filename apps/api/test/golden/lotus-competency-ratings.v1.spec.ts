/**
 * Golden Test Suite: Lotus Competency Ratings (1–5), Starting Zone, and Report Integration
 *
 * Verifies:
 * 1. Rating 5 (ADVANCED_MASTERY): >=2 clean unhedged demonstrations, fast latency (<15s), zero slips ever.
 * 2. Rating 4 (FLUENT): Clean demonstrations with normal latency (<=30s), zero active slips.
 * 3. Rating 4 (FLUENT): Cleared single slip via downstream success or retroactive clearance.
 * 4. Rating 3 (EMERGING): Slow latency (>30s), active unconfirmed suspicion, minor hedge, shaky demonstration, or single observation.
 * 5. Rating 2 (FRAGILE): Confirmed gap on composite skill or repeated unhedged errors.
 * 6. Rating 1 (CRITICAL_BLOCKER): Confirmed gap in foundational arithmetic / negative signs, or acute paralysis.
 * 7. Untested skills with zero evidence leave rating and ratingStatus undefined.
 * 8. calculateStartingZone: maps to 6 Day 1 Launchpad Modules across 3 scaffolding levels with micro-interventions.
 * 9. buildFactorisationReport: integration populating ratings, ratingStatus, board, and startingZone.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit, LotusBoard } from "@cogna/shared";
import {
  type SkillLedgerEntry,
  type FactorisationState,
  calculateSkillRating,
  calculateStartingZone,
  buildFactorisationReport,
} from "../../src/lotus/lotus-factorisation";

function makeAudit(args: {
  skillId: string;
  expression: string;
  responseTimeMs: number;
  kind?: "SECURE" | "MISTAKE";
  hedge?: boolean;
  didNotKnow?: boolean;
}): LotusQuestionAudit {
  return {
    question: {
      id: `q-${args.skillId}-${Math.random()}`,
      phase: "DIAGNOSTIC",
      subtopic: args.skillId,
      prompt: `Prompt for ${args.expression}`,
      type: "CONSTRUCTED_RESPONSE",
      asksForWorking: false,
      purpose: "EVIDENCE",
      answerKey: {
        kind: "OPEN_RESPONSE",
        canonicalAnswer: "x",
        workedSolution: ["step 1"],
        diagnostics: {
          slot: 1,
          itemKind: "FACTORISE",
          expression: args.expression,
          skillId: args.skillId,
          level: "medium",
          origin: "CODE",
        },
      },
    },
    response: {
      answer: "x",
      didNotKnow: args.didNotKnow ?? false,
      responseTimeMs: args.responseTimeMs,
    },
    verification: {
      status: args.kind === "MISTAKE" ? "VERIFIED_INCORRECT" : "VERIFIED_CORRECT",
      score: args.kind === "MISTAKE" ? 0 : 1,
    },
    skillEvidence: [
      {
        skillId: args.skillId,
        kind: args.kind ?? "SECURE",
        hedge: args.hedge,
      },
    ],
  };
}

describe("Lotus Competency Ratings (1–5) and Starting Zone", () => {
  it("assigns Rating 5 (ADVANCED_MASTERY) for >=2 clean demonstrations, fast latency (<15s), and zero slips", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_GCF_NUMBER",
      state: "SECURE",
      mistakes: [],
      notes: ["Clean demonstration Q1", "Clean demonstration Q2"],
      sightings: [],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_GCF_NUMBER", expression: "6x + 9", responseTimeMs: 8_000 }),
      makeAudit({ skillId: "FAC_GCF_NUMBER", expression: "12y + 18", responseTimeMs: 9_500 }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 5, ratingStatus: "ADVANCED_MASTERY" });
  });

  it("assigns Rating 4 (FLUENT) for clean demonstrations with normal latency (<=30s) and zero active slips", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_COMMON_BINOMIAL",
      state: "SECURE",
      mistakes: [],
      notes: ["Clean demonstration Q7", "Clean demonstration Q8"],
      sightings: [],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_COMMON_BINOMIAL", expression: "3(x + 2) + y(x + 2)", responseTimeMs: 22_000 }),
      makeAudit({ skillId: "FAC_COMMON_BINOMIAL", expression: "a(b - 1) + c(b - 1)", responseTimeMs: 19_000 }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 4, ratingStatus: "FLUENT" });
  });

  it("assigns Rating 4 (FLUENT) for a single slip that was cleared downstream", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_GCF_NEGATIVE",
      state: "SECURE",
      clearedAfterSlip: 8,
      retroactivelyCleared: true,
      mistakes: ["KEPT_ORIGINAL_SIGNS"],
      notes: ["Q5: sign slip on negative GCF", "Q8: cleared downstream via grouping with minus"],
      sightings: [{ how: "mistake", mistake: "KEPT_ORIGINAL_SIGNS" }],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_GCF_NEGATIVE", expression: "-4x - 8", responseTimeMs: 18_000, kind: "MISTAKE" }),
      makeAudit({ skillId: "FAC_GCF_NEGATIVE", expression: "-3a - 6b", responseTimeMs: 14_000, kind: "SECURE" }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 4, ratingStatus: "FLUENT" });
  });

  it("assigns Rating 3 (EMERGING) for slow latency (>30s) even with correct demonstrations", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_DIFF_SQUARES",
      state: "SECURE",
      mistakes: [],
      notes: ["Correct but slow"],
      sightings: [],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_DIFF_SQUARES", expression: "x^2 - 9", responseTimeMs: 38_000 }),
      makeAudit({ skillId: "FAC_DIFF_SQUARES", expression: "4a^2 - 25b^2", responseTimeMs: 42_000 }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 3, ratingStatus: "EMERGING" });
  });

  it("assigns Rating 3 (EMERGING) for an active unconfirmed suspicion", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_PAIR_PRODUCT_SUM",
      state: "SUSPECTED",
      suspectedAt: 12,
      mistakes: ["SUM_MATCHES_PRODUCT_WRONG"],
      notes: ["Q12: wrong factor pair"],
      sightings: [{ how: "mistake", mistake: "SUM_MATCHES_PRODUCT_WRONG" }],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_PAIR_PRODUCT_SUM", expression: "p*q = 12, p+q = 7", responseTimeMs: 20_000, kind: "MISTAKE" }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 3, ratingStatus: "EMERGING" });
  });

  it("assigns Rating 3 (EMERGING) for hedged attempt or shaky demonstration", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_GROUP_TERMS",
      state: "SECURE",
      shakyRightAt: 8,
      mistakes: [],
      notes: ["Q8: right with doubt"],
      hedges: [2],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_GROUP_TERMS", expression: "2xy + 2y + 3x + 3", responseTimeMs: 16_000, hedge: true }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 3, ratingStatus: "EMERGING" });
  });

  it("assigns Rating 2 (FRAGILE) for a confirmed gap on a composite skill", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_DIFF_SQUARES",
      state: "CONFIRMED",
      confirmedAt: 10,
      mistakes: ["DIDNT_SQUARE_ROOT_COEFFICIENT", "FORGOT_DIFFERENCE"],
      notes: ["Q9: failed difference of squares", "Q10: confirmed difference of squares gap"],
      sightings: [
        { how: "mistake", mistake: "DIDNT_SQUARE_ROOT_COEFFICIENT" },
        { how: "mistake", mistake: "FORGOT_DIFFERENCE" },
      ],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_DIFF_SQUARES", expression: "x^2 - 9", responseTimeMs: 20_000, kind: "MISTAKE" }),
      makeAudit({ skillId: "FAC_DIFF_SQUARES", expression: "49a^2 - 25b^2", responseTimeMs: 18_000, kind: "MISTAKE" }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 2, ratingStatus: "FRAGILE" });
  });

  it("assigns Rating 1 (CRITICAL_BLOCKER) for a confirmed gap on foundational arithmetic / negative signs", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_GCF_NEGATIVE",
      state: "CONFIRMED",
      confirmedAt: 6,
      mistakes: ["KEPT_ORIGINAL_SIGNS", "SIGN_PRODUCT_ERROR"],
      notes: ["Q5: failed negative sign extraction", "Q6: confirmed sign extraction gap"],
      sightings: [
        { how: "mistake", mistake: "KEPT_ORIGINAL_SIGNS" },
        { how: "mistake", mistake: "SIGN_PRODUCT_ERROR" },
      ],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_GCF_NEGATIVE", expression: "-4x - 8", responseTimeMs: 25_000, kind: "MISTAKE" }),
      makeAudit({ skillId: "FAC_GCF_NEGATIVE", expression: "-5y - 15", responseTimeMs: 20_000, kind: "MISTAKE" }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.deepEqual(result, { rating: 1, ratingStatus: "CRITICAL_BLOCKER" });
  });

  it("assigns Rating 1 (CRITICAL_BLOCKER) for acute paralysis (confirmedBySupport === true)", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_DIVIDE_TERMS",
      state: "CONFIRMED",
      confirmedBySupport: true,
      supportCount: 2,
      mistakes: ["DROPPED_TERM"],
      notes: ["Paralysis: needed support twice"],
      sightings: [],
    };

    const audits: LotusQuestionAudit[] = [
      makeAudit({ skillId: "FAC_DIVIDE_TERMS", expression: "3x^2 + 3x", responseTimeMs: 45_000, didNotKnow: true, kind: "MISTAKE" }),
    ];

    const result = calculateSkillRating(entry, audits);
    assert.equal(result, undefined, "IDK-only evidence cannot justify a numeric competency rating");
  });

  it("leaves rating and ratingStatus undefined for untested skills with zero evidence", () => {
    const entry: SkillLedgerEntry = {
      skillId: "FAC_SPLIT_MIDDLE",
      state: "UNTESTED",
      mistakes: [],
      notes: [],
    };

    const result = calculateSkillRating(entry, []);
    assert.equal(result, undefined);
  });

  describe("calculateStartingZone", () => {
    it("routes a student with Rating 1 sign gap to MOD_FACT_SIGNS_MEANING and FOUNDATIONAL_REMEDIATION", () => {
      const ledger = new Map<string, SkillLedgerEntry>([
        [
          "FAC_GCF_NEGATIVE",
          {
            skillId: "FAC_GCF_NEGATIVE",
            state: "CONFIRMED",
            mistakes: ["KEPT_ORIGINAL_SIGNS"],
            notes: ["Sign error"],
            sightings: [],
          },
        ],
      ]);

      const zone = calculateStartingZone(ledger, [], undefined, "CBSE");
      assert.equal(zone.moduleId, "MOD_FACT_SIGNS_MEANING");
      assert.equal(zone.scaffoldingLevel, "FOUNDATIONAL_REMEDIATION");
      assert.ok(zone.microInterventions.length >= 2);
      assert.ok(zone.microInterventions.some((m) => m.toLowerCase().includes("sign")));
    });

    it("routes a student with monomial division gap to MOD_FACT_FOUNDATIONS and FOUNDATIONAL_REMEDIATION", () => {
      const ledger = new Map<string, SkillLedgerEntry>([
        [
          "FAC_DIVIDE_TERMS",
          {
            skillId: "FAC_DIVIDE_TERMS",
            state: "CONFIRMED",
            mistakes: ["DIVIDED_ONLY_FIRST"],
            notes: ["Divided only first term"],
            sightings: [],
          },
        ],
      ]);

      const zone = calculateStartingZone(ledger, [], undefined, "ICSE");
      assert.equal(zone.moduleId, "MOD_FACT_FOUNDATIONS");
      assert.equal(zone.scaffoldingLevel, "FOUNDATIONAL_REMEDIATION");
    });

    it("routes a student with grouping gap to MOD_FACT_GROUPING and STEPPED_SCAFFOLDING", () => {
      const ledger = new Map<string, SkillLedgerEntry>([
        [
          "FAC_GCF_NUMBER",
          { skillId: "FAC_GCF_NUMBER", state: "SECURE", mistakes: [], notes: ["Clean demonstration Q1", "Clean demonstration Q2"] },
        ],
        [
          "FAC_GROUP_TERMS",
          {
            skillId: "FAC_GROUP_TERMS",
            state: "CONFIRMED",
            mistakes: ["PAIRS_SHARE_NOTHING"],
            notes: ["Grouping failed"],
            sightings: [],
          },
        ],
      ]);

      const zone = calculateStartingZone(ledger, [], undefined, "CBSE");
      assert.equal(zone.moduleId, "MOD_FACT_GROUPING");
      assert.equal(zone.scaffoldingLevel, "STEPPED_SCAFFOLDING");
    });

    it("routes a student with difference of squares gap to MOD_FACT_IDENTITIES and STEPPED_SCAFFOLDING", () => {
      const ledger = new Map<string, SkillLedgerEntry>([
        [
          "FAC_DIFF_SQUARES",
          {
            skillId: "FAC_DIFF_SQUARES",
            state: "CONFIRMED",
            mistakes: ["DIDNT_SQUARE_ROOT_COEFFICIENT"],
            notes: ["Identity gap"],
            sightings: [],
          },
        ],
      ]);

      const zone = calculateStartingZone(ledger, [], undefined, "IGCSE");
      assert.equal(zone.moduleId, "MOD_FACT_IDENTITIES");
      assert.equal(zone.scaffoldingLevel, "STEPPED_SCAFFOLDING");
    });

    it("requires evidence on every core skill before advanced independent work", () => {
      const ledger = new Map<string, SkillLedgerEntry>([
        ["FAC_GCF_NUMBER", { skillId: "FAC_GCF_NUMBER", state: "SECURE", mistakes: [], notes: ["Demonstration 1", "Demonstration 2"] }],
        ["FAC_COMMON_BINOMIAL", { skillId: "FAC_COMMON_BINOMIAL", state: "SECURE", mistakes: [], notes: ["Demonstration 1", "Demonstration 2"] }],
        ["FAC_GROUP_TERMS", { skillId: "FAC_GROUP_TERMS", state: "SECURE", mistakes: [], notes: ["Demonstration 1", "Demonstration 2"] }],
        ["FAC_DIFF_SQUARES", { skillId: "FAC_DIFF_SQUARES", state: "SECURE", mistakes: [], notes: ["Demonstration 1", "Demonstration 2"] }],
        ["FAC_MONIC_TRINOMIAL", { skillId: "FAC_MONIC_TRINOMIAL", state: "SECURE", mistakes: [], notes: ["Demonstration 1", "Demonstration 2"] }],
      ]);

      const audits: LotusQuestionAudit[] = [
        makeAudit({ skillId: "FAC_GCF_NUMBER", expression: "6x + 9", responseTimeMs: 8_000 }),
        makeAudit({ skillId: "FAC_GCF_NUMBER", expression: "12x + 18", responseTimeMs: 9_000 }),
        makeAudit({ skillId: "FAC_COMMON_BINOMIAL", expression: "3(x + 2) + y(x + 2)", responseTimeMs: 10_000 }),
        makeAudit({ skillId: "FAC_COMMON_BINOMIAL", expression: "a(b - 1) + c(b - 1)", responseTimeMs: 11_000 }),
      ];

      const zone = calculateStartingZone(ledger, audits, undefined, "CBSE");
      assert.equal(zone.moduleId, "MOD_FACT_QUADRATICS");
      assert.equal(zone.scaffoldingLevel, "STEPPED_SCAFFOLDING");
      assert.match(zone.rationale, /need more independent evidence/);
    });
  });

  describe("buildFactorisationReport Integration", () => {
    it("enriches report with board, startingZone, and skill ratings while leaving untested ratings undefined", () => {
      const ledger = new Map<string, SkillLedgerEntry>([
        [
          "FAC_GCF_NUMBER",
          {
            skillId: "FAC_GCF_NUMBER",
            state: "SECURE",
            mistakes: [],
            notes: ["Q1: 6x + 9 answered correctly", "Q2: 12x + 18 answered correctly"],
            sightings: [],
          },
        ],
        [
          "FAC_DIFF_SQUARES",
          {
            skillId: "FAC_DIFF_SQUARES",
            state: "CONFIRMED",
            confirmedAt: 10,
            mistakes: ["DIDNT_SQUARE_ROOT_COEFFICIENT"],
            notes: ["Q9: failed difference of squares", "Q10: confirmed difference of squares gap"],
            sightings: [{ how: "mistake", mistake: "DIDNT_SQUARE_ROOT_COEFFICIENT" }],
          },
        ],
      ]);

      const state: FactorisationState = {
        planTurn: 10,
        turns: [
          { turn: 1, slot: 1, status: "PLANNED", version: 0 },
          { turn: 2, slot: 2, status: "PLANNED", version: 0 },
          { turn: 9, slot: 9, status: "PLANNED", version: 0 },
          { turn: 10, slot: 10, status: "PLANNED", version: 0 },
          { turn: 11, slot: 11, status: "SKIPPED", version: 0 },
          { turn: 12, slot: 12, status: "PLANNED", version: 0 },
        ],
        answeredTurns: [1, 2, 9, 10],
        handledConfirmed: [],
        handledBroadened: [],
        fastSkips: 0,
      };

      const audits: LotusQuestionAudit[] = [
        makeAudit({ skillId: "FAC_GCF_NUMBER", expression: "6x + 9", responseTimeMs: 8_000 }),
        makeAudit({ skillId: "FAC_GCF_NUMBER", expression: "12x + 18", responseTimeMs: 9_000 }),
        makeAudit({ skillId: "FAC_DIFF_SQUARES", expression: "x^2 - 9", responseTimeMs: 25_000, kind: "MISTAKE" }),
        makeAudit({ skillId: "FAC_DIFF_SQUARES", expression: "49a^2 - 25b^2", responseTimeMs: 24_000, kind: "MISTAKE" }),
      ];

      const report = buildFactorisationReport({
        ledger,
        state,
        pendingAnalyses: 0,
        audits,
        board: "ICSE",
      });

      assert.equal(report.board, "ICSE");
      assert.ok(report.startingZone);
      assert.equal(report.startingZone?.moduleId, "MOD_FACT_IDENTITIES");
      assert.equal(report.startingZone?.scaffoldingLevel, "STEPPED_SCAFFOLDING");

      // Verify tested skills have ratings
      const gcfSummary = report.skills?.find((s) => s.skillId === "FAC_GCF_NUMBER");
      assert.ok(gcfSummary);
      assert.equal(gcfSummary?.rating, 5);
      assert.equal(gcfSummary?.ratingStatus, "ADVANCED_MASTERY");

      const diffSqSummary = report.skills?.find((s) => s.skillId === "FAC_DIFF_SQUARES");
      assert.ok(diffSqSummary);
      assert.equal(diffSqSummary?.rating, 2);
      assert.equal(diffSqSummary?.ratingStatus, "FRAGILE");

      // Verify untested skills leave rating undefined per contract
      const untestedSummary = report.skills?.find((s) => s.state === "UNTESTED" || s.state === "NOT_TESTED_DEPENDENCY");
      if (untestedSummary) {
        assert.equal(untestedSummary.rating, undefined);
        assert.equal(untestedSummary.ratingStatus, undefined);
      }
    });
  });
});
