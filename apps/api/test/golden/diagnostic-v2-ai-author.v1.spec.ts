/**
 * T3 — AI-authoring rejection (safety-critical).
 *
 * Each case stubs the model to return specific bad output and asserts:
 *  (a) the authored item is discarded,
 *  (b) a valid question is still served,
 *  (c) the student sees no error (source falls back cleanly).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gateAuthoredItem } from "../../src/engines/diagnostic-v2/diagnostic-v2-authoring";
import { makeSelectorService, mockOrchestrator } from "./helpers/diagnostic-v2-fakes";
import { findFixedItem } from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import type { DiagnosticV2AuthoredItem } from "@cogna/shared";
import type {
  SelectorContext,
  SelectorSkillLine,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-selector.service";

const skillLine: SelectorSkillLine = {
  microSkillId: "LIN_DISTRIBUTE_NEG",
  status: "LIKELY_GAP",
  independentSuccessCount: 0,
  independentFailureCount: 2,
  assistedSuccessCount: 0,
  observedContextStrengths: [],
  observedContextGaps: ["INDEPENDENT"],
  scope: "this session",
  recentErrorDescription: "(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10",
};

const REASON =
  "LIN_DISTRIBUTE_NEG is LIKELY_GAP after the sign-product error and no template isolates that case further.";

function authored(overrides: Partial<DiagnosticV2AuthoredItem> = {}): DiagnosticV2AuthoredItem {
  return {
    equation: "-3(x - 4) + 2 = 14",
    claimedSolution: "x = 0",
    targetMicroSkillId: "LIN_DISTRIBUTE_NEG",
    whyNoTemplateFits: "need a transfer-shaped item with a different outer constant than the pool offers",
    ...overrides,
  };
}

function selectorContext(overrides: Partial<SelectorContext> = {}): SelectorContext {
  return {
    studentId: "student-1",
    sessionId: "session-author",
    candidates: [
      {
        item: findFixedItem("NEG_DIST_MAIN")!,
        legalityReason: "next planned question in the rule sequence",
      },
    ],
    ruleSelectedIndex: 0,
    ruleStageId: "NEG_DIST_MAIN",
    skillLines: [skillLine],
    alreadyServed: [
      {
        prompt: findFixedItem("ENTRY_TWO_STEP")!.prompt,
        templateId: "TPL_TWO_STEP",
        origin: "PRE_WRITTEN",
      },
    ],
    serveOrdinal: 2,
    lastStepSummary: "the last line was incorrect on LIN_DISTRIBUTE_NEG",
    ...overrides,
  };
}

describe("gateAuthoredItem — accept path", () => {
  it("accepts a well-formed negative-distribution equation whose claimed answer matches the re-solve", () => {
    const result = gateAuthoredItem({
      authored: authored(),
      stageId: "NEG_DIST_MAIN",
      isTransferCheck: false,
      alreadyServed: new Set(),
    });
    assert.equal(result.passed, true);
    if (!result.passed) return;
    assert.equal(result.item.origin, "AI_AUTHORED");
    assert.equal(result.item.templateId, null);
    assert.equal(result.item.primaryMicroSkillId, "LIN_DISTRIBUTE_NEG");
    assert.match(result.item.itemKey, /^AUTH_/);
  });
});

describe("gateAuthoredItem — reject codes", () => {
  const cases: Array<{ label: string; code: string; item: DiagnosticV2AuthoredItem; alreadyServed?: Set<string> }> = [
    {
      label: "claimed answer does not match an independent re-solve",
      code: "CLAIMED_ANSWER_MISMATCH",
      item: authored({ claimedSolution: "x = 99" }),
    },
    {
      label: "equation outside the supported grammar",
      code: "PARSE_FAILED",
      item: authored({ equation: "sin(x) + 1 = 0", claimedSolution: "x = 0" }),
    },
    {
      label: "degenerate identity",
      code: "DEGENERATE",
      item: authored({ equation: "0x + 3 = 3", claimedSolution: "x = 0" }),
    },
    {
      label: "degenerate no-solution",
      code: "DEGENERATE",
      item: authored({ equation: "0x + 3 = 4", claimedSolution: "x = 0" }),
    },
    {
      label: "non-integer solution",
      code: "NON_INTEGER_SOLUTION",
      item: authored({
        equation: "2x + 1 = 4",
        claimedSolution: "x = 3/2",
        targetMicroSkillId: "LIN_SOLVE_TWO_STEP",
      }),
    },
    {
      label: "tagged skill not actually exercised",
      code: "SKILL_NOT_EXERCISED",
      item: authored({
        equation: "3x + 5 = 20",
        claimedSolution: "x = 5",
        targetMicroSkillId: "LIN_DISTRIBUTE_NEG",
      }),
    },
    {
      label: "duplicate of a question already served this session",
      code: "DUPLICATE",
      item: authored({ equation: "-2(x - 5) + 3 = 11", claimedSolution: "x = 1" }),
      alreadyServed: new Set(["-2(x-5)+3=11"]),
    },
    {
      label: "forbidden term in displayed text",
      code: "FORBIDDEN_TERM",
      item: authored({ equation: "the ADHD case -3(x - 4) + 2 = 14", claimedSolution: "x = 0" }),
    },
  ];

  for (const c of cases) {
    it(`rejects: ${c.label}`, () => {
      const result = gateAuthoredItem({
        authored: c.item,
        stageId: "NEG_DIST_MAIN",
        isTransferCheck: false,
        alreadyServed: c.alreadyServed ?? new Set(),
      });
      assert.equal(result.passed, false);
      if (result.passed) return;
      assert.equal(result.rejection.code, c.code);
    });
  }
});

describe("selector AUTHOR path — stubbed-bad-output still serves a valid question", () => {
  async function runAuthorChoice(authorRaw: string, failWith?: Error) {
    const selectorOrch = mockOrchestrator({
      raw: JSON.stringify({
        choice: "AUTHOR",
        targetMicroSkillId: "LIN_DISTRIBUTE_NEG",
        whyNoTemplateFits: "templates never put a +7 outside a negative bracket",
        confidence: 0.7,
        reasoning: REASON,
      }),
    });
    const authorOrch = mockOrchestrator({
      raw: authorRaw,
      ...(failWith ? { failWith } : {}),
    });
    const result = await makeSelectorService(selectorOrch.service, authorOrch.service).selectNext(
      selectorContext(),
    );
    return { result, authorOrch };
  }

  function assertValidFallback(
    result: Awaited<ReturnType<typeof runAuthorChoice>>["result"],
    discardedIncludes?: string,
  ) {
    assert.ok(result.item.openingLine.trim().length > 0);
    assert.ok(result.item.prompt.includes(result.item.openingLine));
    assert.notEqual(result.item.origin, "AI_AUTHORED");
    if (discardedIncludes) {
      assert.ok(
        result.discardedGeneration?.includes(discardedIncludes),
        `expected discardedGeneration to include ${discardedIncludes}, got ${result.discardedGeneration}`,
      );
    }
  }

  it("claimed answer mismatch → discard + valid question, no student error", async () => {
    const { result, authorOrch } = await runAuthorChoice(JSON.stringify(authored({ claimedSolution: "x = 99" })));
    assert.ok(authorOrch.calls.length >= 1);
    assertValidFallback(result, "CLAIMED_ANSWER_MISMATCH");
  });

  it("equation outside grammar → discard + valid fallback", async () => {
    const { result } = await runAuthorChoice(
      JSON.stringify(authored({ equation: "x^2 = 4", claimedSolution: "x = 2" })),
    );
    assertValidFallback(result);
  });

  it("degenerate equation → discard + valid fallback", async () => {
    const { result } = await runAuthorChoice(
      JSON.stringify(authored({ equation: "0x + 3 = 3", claimedSolution: "x = 0" })),
    );
    assertValidFallback(result, "DEGENERATE");
  });

  it("non-integer / skill mismatch on author payload → discard + valid fallback", async () => {
    const { result } = await runAuthorChoice(
      JSON.stringify(
        authored({
          equation: "2x + 1 = 4",
          claimedSolution: "x = 1.5",
          targetMicroSkillId: "LIN_SOLVE_TWO_STEP",
        }),
      ),
    );
    assertValidFallback(result);
  });

  it("skill not exercised → discard + valid fallback", async () => {
    const { result } = await runAuthorChoice(
      JSON.stringify(
        authored({
          equation: "3x + 5 = 20",
          claimedSolution: "x = 5",
          targetMicroSkillId: "LIN_DISTRIBUTE_NEG",
        }),
      ),
    );
    assertValidFallback(result, "SKILL_NOT_EXERCISED");
  });

  it("duplicate of already-served → discard + valid fallback", async () => {
    const eq = "-3(x - 4) + 2 = 14";
    const selectorOrch = mockOrchestrator({
      raw: JSON.stringify({
        choice: "AUTHOR",
        targetMicroSkillId: "LIN_DISTRIBUTE_NEG",
        whyNoTemplateFits: "templates never put a +7 outside a negative bracket",
        confidence: 0.7,
        reasoning: REASON,
      }),
    });
    const authorOrch = mockOrchestrator({
      raw: JSON.stringify(authored({ equation: eq, claimedSolution: "x = 0" })),
    });
    const result = await makeSelectorService(selectorOrch.service, authorOrch.service).selectNext(
      selectorContext({
        alreadyServed: [{ prompt: `Solve for x:  ${eq}`, templateId: null, origin: "AI_AUTHORED" }],
      }),
    );
    assertValidFallback(result, "DUPLICATE");
  });

  it("malformed JSON / missing fields → discard + valid fallback", async () => {
    const { result, authorOrch } = await runAuthorChoice("{not-json");
    assert.equal(authorOrch.rejections.length, 1);
    assertValidFallback(result);
  });

  it("forbidden term in displayed text → discard + valid fallback", async () => {
    const { result } = await runAuthorChoice(
      JSON.stringify(authored({ equation: "the ADHD case -3(x - 4) + 2 = 14", claimedSolution: "x = 0" })),
    );
    assertValidFallback(result);
  });

  it("timeout mid-authoring → discard + valid fallback", async () => {
    const { result, authorOrch } = await runAuthorChoice("{}", new Error("timeout after 2500ms"));
    assert.ok(authorOrch.rejections.some((r) => /timeout/i.test(r)));
    assertValidFallback(result);
  });

  it("accepted authoring serves an AI_AUTHORED item", async () => {
    const { result, authorOrch } = await runAuthorChoice(JSON.stringify(authored()));
    assert.equal(authorOrch.calls.length, 1);
    assert.equal(result.source, "AI");
    assert.equal(result.item.origin, "AI_AUTHORED");
    assert.equal(result.item.templateId, null);
    assert.equal(result.discardedGeneration, undefined);
  });
});
