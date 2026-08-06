import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSelectorPrompts,
  formatSkillLine,
  DiagnosticV2AiSelectorService,
  type SelectorContext,
  type SelectorSkillLine,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-selector.service";
import { DiagnosticV2AiAuthorService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-author.service";
import { FIXED_ITEMS, findFixedItem } from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import { evaluateGate } from "../../src/ai/shadow-gate-evaluator.formulas";
import { KNOWN_CAPABILITIES } from "../../src/ai/shadow-gate-evaluator.service";
import { assertDiagnosticV2SelectorChoiceShape } from "@cogna/shared";
import { makeSelectorService, mockOrchestrator } from "./helpers/diagnostic-v2-fakes";

const skillLine = (overrides: Partial<SelectorSkillLine> = {}): SelectorSkillLine => ({
  microSkillId: "LIN_DISTRIBUTE_NEG",
  status: "EMERGING",
  independentSuccessCount: 0,
  independentFailureCount: 1,
  assistedSuccessCount: 0,
  observedContextStrengths: [],
  observedContextGaps: ["INDEPENDENT"],
  scope: "this session",
  recentErrorDescription: "(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10",
  ...overrides,
});

function context(overrides: Partial<SelectorContext> = {}): SelectorContext {
  return {
    studentId: "student-1",
    sessionId: "session-1",
    candidates: [
      { item: findFixedItem("NEG_DIST_CONTRAST")!, legalityReason: "next item in the fixed diagnostic sequence" },
      { item: findFixedItem("TRANSFER_NEG_DIST")!, legalityReason: "a planned item that has not been shown yet" },
    ],
    ruleSelectedIndex: 0,
    ruleStageId: "NEG_DIST_CONTRAST",
    skillLines: [skillLine()],
    alreadyServed: [
      {
        prompt: findFixedItem("NEG_DIST_MAIN")!.prompt,
        templateId: "TPL_NEG_DISTRIBUTION",
        origin: "PRE_WRITTEN",
      },
    ],
    serveOrdinal: 3,
    lastStepSummary: "the last line was incorrect on LIN_DISTRIBUTE_NEG",
    ...overrides,
  };
}

const REASON = "LIN_DISTRIBUTE_NEG is EMERGING after the sign-product error, so probe it again.";
const json = (v: unknown) => JSON.stringify(v);

describe("DiagnosticV2AiSelectorService — serving a valid choice", () => {
  it("serves an in-bounds index and reports the AI as the source", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({ choice: "EXISTING", index: 1, confidence: 0.8, reasoning: REASON }),
    });
    const result = await makeSelectorService(orchestrator.service).selectNext(context());

    assert.equal(result.source, "AI");
    assert.equal(result.item.itemKey, "TRANSFER_NEG_DIST");
    assert.equal(result.reasoning, REASON);
  });

  it("passes the rule's own pick as the audit baseline on every call", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({ choice: "EXISTING", index: 0, confidence: 0.6, reasoning: REASON }),
    });
    await makeSelectorService(orchestrator.service).selectNext(context({ ruleSelectedIndex: 0 }));

    assert.equal(orchestrator.calls.length, 1);
    assert.deepEqual(orchestrator.calls[0]!.ruleOutput, {
      choice: "EXISTING",
      index: 0,
      candidateCount: 2,
    });
    assert.equal(orchestrator.calls[0]!.capability, "DIAGNOSTIC_V2_SELECTOR");
  });
});

describe("DiagnosticV2AiSelectorService — bounds are rejected, never clamped", () => {
  const outOfBounds = [
    ["an index past the end of the candidate list", { choice: "EXISTING", index: 5, confidence: 0.9, reasoning: REASON }],
    ["a negative index", { choice: "EXISTING", index: -1, confidence: 0.9, reasoning: REASON }],
    ["a non-integer index", { choice: "EXISTING", index: 1.5, confidence: 0.9, reasoning: REASON }],
    ["an unknown template id", { choice: "GENERATE", templateId: "TPL_INVENTED", confidence: 0.9, reasoning: REASON }],
    ["a made-up choice type", { choice: "SKIP", confidence: 0.9, reasoning: REASON }],
    ["confidence outside 0..1", { choice: "EXISTING", index: 0, confidence: 4, reasoning: REASON }],
    ["missing reasoning", { choice: "EXISTING", index: 0, confidence: 0.5 }],
    ["reasoning that cites nothing observed", { choice: "EXISTING", index: 0, confidence: 0.5, reasoning: "This seems like a good next question." }],
  ] as const;

  for (const [label, payload] of outOfBounds) {
    it(`falls back to the rule pick on ${label}`, async () => {
      const orchestrator = mockOrchestrator({ raw: json(payload) });
      const result = await makeSelectorService(orchestrator.service).selectNext(
        context({ ruleSelectedIndex: 0 }),
      );

      assert.equal(result.source, "RULE");
      assert.equal(result.item.itemKey, "NEG_DIST_CONTRAST");
      assert.equal(orchestrator.rejections.length, 1);
    });
  }

  it("names the legal range in the rejection reason, so the gate can count it as a bounds violation", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({ choice: "EXISTING", index: 9, confidence: 0.9, reasoning: REASON }),
    });
    await makeSelectorService(orchestrator.service).selectNext(context());
    assert.match(orchestrator.rejections[0]!, /not a legal candidate/);
  });
});

describe("DiagnosticV2AiSelectorService — failing closed", () => {
  it("keeps the rule pick when the call times out", async () => {
    const orchestrator = mockOrchestrator({ failWith: new Error("timeout after 2000ms") });
    const result = await makeSelectorService(orchestrator.service).selectNext(context());
    assert.equal(result.source, "RULE");
    assert.equal(result.item.itemKey, "NEG_DIST_CONTRAST");
  });

  it("keeps the rule pick when the capability flag is off — no call is made at all", async () => {
    const orchestrator = mockOrchestrator({ generate: false });
    const result = await makeSelectorService(orchestrator.service).selectNext(context());
    assert.equal(result.source, "RULE");
    assert.equal(orchestrator.calls.length, 0);
  });

  it("keeps the rule pick in shadow mode, even when the AI answered perfectly well", async () => {
    const orchestrator = mockOrchestrator({
      serve: false,
      raw: json({ choice: "EXISTING", index: 1, confidence: 0.95, reasoning: REASON }),
    });
    const result = await makeSelectorService(orchestrator.service).selectNext(context());
    assert.equal(result.source, "RULE");
    assert.equal(result.item.itemKey, "NEG_DIST_CONTRAST");
    assert.equal(orchestrator.calls.length, 1, "the call still happens and is still logged");
  });

  it("configures a bounded timeout rather than waiting indefinitely", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({ choice: "EXISTING", index: 0, confidence: 0.5, reasoning: REASON }),
    });
    await makeSelectorService(orchestrator.service).selectNext(context());
    assert.equal(orchestrator.calls[0]!.timeoutMs, 3000);
  });
});

describe("DiagnosticV2AiSelectorService — generation is re-verified before it can be shown", () => {
  it("serves a generated instance only after it passes independent re-verification", async () => {
    const orchestrator = mockOrchestrator({
      raw: json({
        choice: "GENERATE",
        templateId: "TPL_NEG_DISTRIBUTION",
        confidence: 0.7,
        reasoning: REASON,
      }),
    });
    const result = await makeSelectorService(orchestrator.service).selectNext(context());

    assert.equal(result.source, "AI");
    assert.equal(result.discardedGeneration, undefined);
    assert.ok(result.item.itemKey.startsWith("GEN_NEG_DIST_"));
    assert.equal(result.item.origin, "TEMPLATE_RENDERED");
    assert.equal(result.item.primaryMicroSkillId, "LIN_DISTRIBUTE_NEG");
    assert.ok(result.item.prompt.includes(result.item.openingLine));
  });

  it("renders a different instance when the same template is requested again with a higher serveOrdinal", async () => {
    const raw = json({ choice: "GENERATE", templateId: "TPL_NEG_DISTRIBUTION", confidence: 0.7, reasoning: REASON });
    const service = makeSelectorService(mockOrchestrator({ raw }).service);
    const first = await service.selectNext(context({ serveOrdinal: 1, alreadyServed: [] }));
    const second = await service.selectNext(
      context({
        serveOrdinal: 2,
        alreadyServed: [
          { prompt: first.item.prompt, templateId: first.item.templateId, origin: first.item.origin },
        ],
      }),
    );
    assert.notEqual(first.item.openingLine, second.item.openingLine);
  });

  it("falls back when every rendered instance collides with already-served questions", async () => {
    const { renderTemplate, MAX_RENDER_ATTEMPTS } = await import(
      "../../src/engines/diagnostic-v2/diagnostic-v2-template-render"
    );
    const collisions = [];
    for (let i = 0; i < MAX_RENDER_ATTEMPTS; i++) {
      const item = renderTemplate("TPL_NEG_DISTRIBUTION", `session-1:TPL_NEG_DISTRIBUTION:3#${i}`);
      collisions.push({ prompt: item.prompt, templateId: item.templateId, origin: item.origin });
    }
    const orchestrator = mockOrchestrator({
      raw: json({ choice: "GENERATE", templateId: "TPL_NEG_DISTRIBUTION", confidence: 0.7, reasoning: REASON }),
    });
    const result = await makeSelectorService(orchestrator.service).selectNext(
      context({ alreadyServed: collisions, serveOrdinal: 3 }),
    );
    assert.equal(result.source, "RULE");
    assert.ok(result.discardedGeneration);
  });
});

describe("buildSelectorPrompts — Goal 1 payload", () => {
  it("lists every legal option by index and never offers anything else", () => {
    const { system, user } = buildSelectorPrompts(context());
    assert.match(user, /\[0\].*NEG_DIST_CONTRAST/);
    assert.match(user, /\[1\].*TRANSFER_NEG_DIST/);
    assert.match(system, /never invent an index, a template id, or a micro-skill id/);
    assert.match(system, /Never infer attention, mood, effort/);
  });

  it("includes skill status, recent error, context gaps, and this-session vs earlier labels", () => {
    const { user } = buildSelectorPrompts(
      context({
        skillLines: [
          skillLine({ scope: "this session" }),
          skillLine({
            microSkillId: "LIN_SOLVE_TWO_STEP",
            status: "RELIABLE",
            independentSuccessCount: 2,
            independentFailureCount: 0,
            scope: "earlier",
            recentErrorDescription: undefined,
            observedContextGaps: [],
            observedContextStrengths: ["INDEPENDENT"],
          }),
        ],
      }),
    );
    assert.match(user, /LIN_DISTRIBUTE_NEG \[this session\] status=EMERGING/);
    assert.match(user, /LIN_SOLVE_TWO_STEP \[earlier\] status=RELIABLE/);
    assert.match(user, /recent error: \(\-2\)\(\-5\) was evaluated as \-10/);
    assert.match(user, /gaps=INDEPENDENT/);
    assert.match(user, /strengths=INDEPENDENT/);
  });

  it("lists already-seen questions and template descriptions", () => {
    const { system, user } = buildSelectorPrompts(context());
    assert.match(user, /ALREADY SEEN this session/);
    assert.match(user, /TPL_NEG_DISTRIBUTION: m\(v/);
    assert.match(system, /Prefer a listed EXISTING option or a GENERATE/);
    assert.match(system, /AUTHOR only when/);
  });

  it("formatSkillLine keeps the D3 scope label explicit", () => {
    const line = formatSkillLine(skillLine({ scope: "earlier" }));
    assert.match(line, /\[earlier\]/);
    assert.doesNotMatch(line, /\[this session\]/);
  });
});

describe("DiagnosticV2SelectorChoice contract", () => {
  it("accepts EXISTING, GENERATE, and AUTHOR shapes", () => {
    assert.equal(
      assertDiagnosticV2SelectorChoiceShape({ choice: "EXISTING", index: 2, confidence: 0.5, reasoning: "x" }).choice,
      "EXISTING",
    );
    assert.equal(
      assertDiagnosticV2SelectorChoiceShape({ choice: "GENERATE", templateId: "T", confidence: 0.5, reasoning: "x" }).choice,
      "GENERATE",
    );
    assert.equal(
      assertDiagnosticV2SelectorChoiceShape({
        choice: "AUTHOR",
        targetMicroSkillId: "LIN_DISTRIBUTE_NEG",
        whyNoTemplateFits: "need a positive outer constant with a fraction inside",
        confidence: 0.5,
        reasoning: "x",
      }).choice,
      "AUTHOR",
    );
  });

  it("shape validity alone is not boundedness — the service still checks the candidate list", () => {
    const shaped = assertDiagnosticV2SelectorChoiceShape({
      choice: "EXISTING",
      index: 99,
      confidence: 0.9,
      reasoning: "x",
    });
    assert.equal(shaped.choice === "EXISTING" && shaped.index >= FIXED_ITEMS.length, true);
  });
});

describe("shadow gate wiring", () => {
  it("evaluates all four diagnostic-v2 capabilities rather than letting them go unwatched", () => {
    for (const capability of [
      "DIAGNOSTIC_V2_SELECTOR",
      "DIAGNOSTIC_V2_INTERPRETER",
      "DIAGNOSTIC_V2_GRADER",
      "DIAGNOSTIC_V2_AUTHOR",
    ]) {
      assert.ok((KNOWN_CAPABILITIES as readonly string[]).includes(capability), capability);
    }
  });

  it("reports INSUFFICIENT_DATA on an empty audit log instead of throwing — the expected pre-launch state", () => {
    for (const capability of [
      "DIAGNOSTIC_V2_SELECTOR",
      "DIAGNOSTIC_V2_INTERPRETER",
      "DIAGNOSTIC_V2_GRADER",
      "DIAGNOSTIC_V2_AUTHOR",
    ]) {
      const report = evaluateGate(capability, []);
      assert.equal(report.verdict, "INSUFFICIENT_DATA");
      assert.equal(report.sampleSize, 0);
      assert.equal(report.agreementRate, null);
      assert.equal(report.latencyP95Ms, null);
      assert.ok(report.latencyBudgetMs > 0, "a real budget, not the generic default");
    }
  });
});

describe("DiagnosticV2AiAuthorService prompts", () => {
  it("is constructible beside the selector", () => {
    const orch = mockOrchestrator({ generate: false });
    const author = new DiagnosticV2AiAuthorService(orch.service);
    const selector = new DiagnosticV2AiSelectorService(orch.service, author);
    assert.ok(selector);
  });
});
