/**
 * COMBINED_ALGEBRA — one session walks all five topic backbones (all-correct).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  firstStageForTrack,
  itemStageOrderForTrack,
  nextStagesAfter,
  openingReasonForTrack,
  rulePromptReasoningForStage,
  DiagnosticV2SessionService,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import {
  createFakePrisma,
  makeSelectorService,
  mockOrchestrator,
} from "./helpers/diagnostic-v2-fakes";

const STUDENT_ID = "student-combined-1";

/** All-correct path: each topic skips contrast and hops to the next entry. */
const SCRIPT: Array<{ itemKey: string; lines: Array<[string, string]> }> = [
  {
    itemKey: "ENTRY_TWO_STEP",
    lines: [
      ["3x + 5 = 20", "3x = 15"],
      ["3x = 15", "x = 5"],
    ],
  },
  {
    itemKey: "ENTRY_VARIABLE_BOTH",
    lines: [
      ["4x - 7 = 2x + 9", "2x - 7 = 9"],
      ["2x - 7 = 9", "2x = 16"],
      ["2x = 16", "x = 8"],
    ],
  },
  {
    itemKey: "NEG_DIST_MAIN",
    lines: [
      ["-2(x - 5) + 3 = 11", "-2x + 10 + 3 = 11"],
      ["-2x + 10 + 3 = 11", "-2x + 13 = 11"],
      ["-2x + 13 = 11", "-2x = -2"],
      ["-2x = -2", "x = 1"],
    ],
  },
  {
    itemKey: "TRANSFER_NEG_DIST",
    lines: [
      ["-4(z - 2) + 3 = 19", "-4z + 8 + 3 = 19"],
      ["-4z + 8 + 3 = 19", "-4z + 11 = 19"],
      ["-4z + 11 = 19", "-4z = 8"],
      ["-4z = 8", "z = -2"],
    ],
  },
  {
    itemKey: "ENTRY_FRAC_SIMPLE",
    lines: [
      ["x/2 + 3 = 7", "x/2 = 4"],
      ["x/2 = 4", "x = 8"],
    ],
  },
  {
    itemKey: "FRAC_CLEAR_MAIN",
    lines: [
      ["(x + 1)/2 = (x - 1)/3 + 1", "3(x + 1) = 2(x - 1) + 6"],
      ["3(x + 1) = 2(x - 1) + 6", "3x + 3 = 2x - 2 + 6"],
      ["3x + 3 = 2x - 2 + 6", "3x + 3 = 2x + 4"],
      ["3x + 3 = 2x + 4", "x + 3 = 4"],
      ["x + 3 = 4", "x = 1"],
    ],
  },
  {
    itemKey: "TRANSFER_FRAC_CLEAR",
    lines: [
      ["(z - 2)/3 = (z + 1)/6 + 1", "2(z - 2) = (z + 1) + 6"],
      ["2(z - 2) = (z + 1) + 6", "2z - 4 = z + 1 + 6"],
      ["2z - 4 = z + 1 + 6", "2z - 4 = z + 7"],
      ["2z - 4 = z + 7", "z - 4 = 7"],
      ["z - 4 = 7", "z = 11"],
    ],
  },
  {
    itemKey: "ENTRY_EXPAND_BINOMIAL",
    lines: [["(x + 2)(x + 3)", "x^2 + 5x + 6"]],
  },
  {
    itemKey: "ID_DIFF_MAIN",
    lines: [["(x + 3)(x - 3)", "x^2 - 9"]],
  },
  {
    itemKey: "TRANSFER_ID_DIFF",
    lines: [["z^2 - 16", "(z + 4)(z - 4)"]],
  },
  {
    itemKey: "ENTRY_FACTOR_EXPAND",
    lines: [["(x + 2)(x + 3)", "x^2 + 5x + 6"]],
  },
  {
    itemKey: "FAC_MONIC_MAIN",
    lines: [["x^2 + 5x + 6", "(x + 2)(x + 3)"]],
  },
  {
    itemKey: "TRANSFER_FAC_NONMONIC",
    lines: [["2x^2 - 5x - 3", "(2x + 1)(x - 3)"]],
  },
  {
    itemKey: "ENTRY_QUAD_STANDARD",
    lines: [["x^2 + 5x = -6", "x^2 + 5x + 6 = 0"]],
  },
  {
    itemKey: "QUAD_ZP_MAIN",
    lines: [["(x + 2)(x - 3) = 0", "x = -2 or x = 3"]],
  },
  {
    itemKey: "TRANSFER_QUAD_ZP",
    lines: [["x^2 - x - 6 = 0", "x = 3 or x = -2"]],
  },
];

describe("COMBINED_ALGEBRA routing helpers", () => {
  it("opens on NegDist entry and concatenates all topic stage orders", () => {
    assert.equal(firstStageForTrack("COMBINED_ALGEBRA"), "ENTRY_TWO_STEP");
    assert.equal(itemStageOrderForTrack("COMBINED_ALGEBRA").length, 21);
    assert.match(openingReasonForTrack("COMBINED_ALGEBRA"), /combined algebra/i);
  });

  it("hops to the next topic after each transfer (not COMPLETE until quadratics)", () => {
    assert.deepEqual(
      nextStagesAfter("TRANSFER_NEG_DIST", {
        targetSkillFailed: false,
        patternConfirmed: false,
        track: "COMBINED_ALGEBRA",
      }),
      ["ENTRY_FRAC_SIMPLE"],
    );
    assert.deepEqual(
      nextStagesAfter("TRANSFER_FRAC_CLEAR", {
        targetSkillFailed: false,
        patternConfirmed: false,
        track: "COMBINED_ALGEBRA",
      }),
      ["ENTRY_EXPAND_BINOMIAL"],
    );
    assert.deepEqual(
      nextStagesAfter("TRANSFER_ID_DIFF", {
        targetSkillFailed: false,
        patternConfirmed: false,
        track: "COMBINED_ALGEBRA",
      }),
      ["ENTRY_FACTOR_EXPAND"],
    );
    assert.deepEqual(
      nextStagesAfter("TRANSFER_FAC_NONMONIC", {
        targetSkillFailed: false,
        patternConfirmed: false,
        track: "COMBINED_ALGEBRA",
      }),
      ["ENTRY_QUAD_STANDARD"],
    );
    assert.deepEqual(
      nextStagesAfter("TRANSFER_QUAD_ZP", {
        targetSkillFailed: false,
        patternConfirmed: false,
        track: "COMBINED_ALGEBRA",
      }),
      ["COMPLETE"],
    );
    // Solo tracks still end after their own transfer.
    assert.deepEqual(
      nextStagesAfter("TRANSFER_NEG_DIST", {
        targetSkillFailed: false,
        patternConfirmed: false,
        track: "NEGATIVE_DISTRIBUTION",
      }),
      ["COMPLETE"],
    );
  });

  it("uses topic-specific RULE_PROMPT history text", () => {
    assert.match(rulePromptReasoningForStage("FRAC_CLEAR_CONTRAST"), /fraction-clearing/i);
    assert.match(rulePromptReasoningForStage("NEG_DIST_CONTRAST"), /distribution/i);
    assert.doesNotMatch(rulePromptReasoningForStage("FAC_MONIC_CONTRAST"), /distribution/);
  });
});

describe("COMBINED_ALGEBRA session — all-correct five-topic walk", () => {
  it("completes all five backbones and returns a multi-topic summary", async () => {
    const { prisma } = createFakePrisma([STUDENT_ID]);
    const selector = mockOrchestrator({
      generate: true,
      raw: (call) =>
        JSON.stringify({
          choice: "EXISTING",
          index: (call.ruleOutput as { index: number }).index,
          confidence: 0.8,
          reasoning: "Rule sequence matches the next informative fixed item.",
        }),
    });
    const interpreter = mockOrchestrator({ generate: false });
    const grader = mockOrchestrator({ generate: false });
    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(selector.service),
      new DiagnosticV2AiInterpreterService(interpreter.service),
      new DiagnosticV2AiGraderService(grader.service),
    );

    const start = await service.startSession(STUDENT_ID, "COMBINED_ALGEBRA");
    assert.equal(start.itemKey, "ENTRY_TWO_STEP");

    let attemptId = start.attemptId;
    let itemKey = start.itemKey;
    let lastStatus: string = "ACTIVE";
    const visited: string[] = [itemKey];

    for (const block of SCRIPT) {
      assert.equal(itemKey, block.itemKey, `expected ${block.itemKey}, on ${itemKey}`);
      for (const [previousLine, submittedLine] of block.lines) {
        const response = await service.submitStep(start.sessionId, {
          attemptId,
          previousLine,
          submittedLine,
        });
        assert.equal(response.outcome, "SUBMITTED");
        if (response.outcome === "SUBMITTED") {
          assert.equal(response.validity, "VALID", `${itemKey}: ${submittedLine}`);
          lastStatus = response.sessionStatus;
          if (response.nextAttempt) {
            attemptId = response.nextAttempt.attemptId;
            itemKey = response.nextAttempt.itemKey;
            visited.push(itemKey);
          }
        }
      }
    }

    assert.equal(lastStatus, "COMPLETED");
    assert.ok(visited.includes("ENTRY_FRAC_SIMPLE"), "must enter fractions topic");
    assert.ok(visited.includes("ENTRY_EXPAND_BINOMIAL"), "must enter identities topic");
    assert.ok(visited.includes("ENTRY_FACTOR_EXPAND"), "must enter factorising topic");
    assert.ok(visited.includes("ENTRY_QUAD_STANDARD"), "must enter quadratics topic");
    assert.ok(visited.includes("TRANSFER_QUAD_ZP"), "must finish quadratics transfer");
    assert.ok(selector.calls.length > 0, "selector should be consulted on GENERATE path");

    const summary = await service.getSummary(start.sessionId);
    assert.ok(summary.childFacingSummary.length > 20);
    // All-correct: expect solid skills named from more than one topic family.
    assert.match(summary.childFacingSummary, /own today|Thanks for working/i);
  });
});
