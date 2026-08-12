import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  bufferSize,
  clearNextItemBufferForTests,
  likelyPrefetchTemplates,
  peekBufferedItem,
  putBufferedItem,
  SESSION_BUFFER_CAP,
  sessionBufferCount,
  takeBufferedItem,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-next-item-buffer";
import {
  FIXED_ITEMS,
  renderFreshInstance,
  type DiagnosticV2Item,
  type DiagnosticV2TemplateId,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import { makeSelectorService, mockOrchestrator } from "./helpers/diagnostic-v2-fakes";
import type { SelectorContext } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-selector.service";

function verifiedItem(templateId: DiagnosticV2TemplateId, seed: string): DiagnosticV2Item {
  const fresh = renderFreshInstance({
    templateId,
    seedBase: seed,
    alreadyServed: new Set(),
  });
  assert.ok(fresh.item, fresh.failure);
  return fresh.item!;
}

function baseCtx(overrides: Partial<SelectorContext> = {}): SelectorContext {
  const ruleItem = FIXED_ITEMS[0]!;
  return {
    studentId: "student-1",
    sessionId: "sess-buf-1",
    candidates: [{ item: ruleItem, legalityReason: "next planned question in the rule sequence" }],
    ruleSelectedIndex: 0,
    ruleStageId: "ENTRY_TWO_STEP",
    skillLines: [],
    alreadyServed: [],
    serveOrdinal: 1,
    ...overrides,
  };
}

const gapSkillLine = {
  microSkillId: "LIN_DISTRIBUTE_NEG",
  status: "LIKELY_GAP",
  independentSuccessCount: 0,
  independentFailureCount: 2,
  assistedSuccessCount: 0,
  observedContextStrengths: [] as string[],
  observedContextGaps: ["INDEPENDENT"],
  scope: "this session" as const,
  prerequisites: [] as Array<{ microSkillId: string; status: string }>,
};

beforeEach(() => {
  clearNextItemBufferForTests();
});

describe("Phase C verified next-item buffer — unit", () => {
  it("hit: take returns the buffered item and removes it", () => {
    const item = verifiedItem("TPL_NEG_DISTRIBUTION", "unit-hit");
    putBufferedItem({
      sessionId: "sess-a",
      templateId: "TPL_NEG_DISTRIBUTION",
      skillId: item.primaryMicroSkillId,
      item,
    });
    assert.equal(peekBufferedItem("sess-a", "TPL_NEG_DISTRIBUTION")?.itemKey, item.itemKey);
    const taken = takeBufferedItem("sess-a", "TPL_NEG_DISTRIBUTION");
    assert.equal(taken?.itemKey, item.itemKey);
    assert.equal(takeBufferedItem("sess-a", "TPL_NEG_DISTRIBUTION"), null);
  });

  it("miss: empty slot returns null", () => {
    assert.equal(takeBufferedItem("sess-missing", "TPL_TWO_STEP"), null);
  });

  it("evict: per-session cap drops the oldest entry", async () => {
    const templates: DiagnosticV2TemplateId[] = [
      "TPL_TWO_STEP",
      "TPL_VARIABLE_BOTH",
      "TPL_NEG_DISTRIBUTION",
    ];
    for (let i = 0; i < templates.length; i++) {
      const item = verifiedItem(templates[i]!, `evict-${i}`);
      putBufferedItem({
        sessionId: "sess-cap",
        templateId: templates[i]!,
        skillId: item.primaryMicroSkillId,
        item,
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.equal(sessionBufferCount("sess-cap"), SESSION_BUFFER_CAP);

    const sign = verifiedItem("TPL_SIGN_MUL_DIV", "evict-sign");
    putBufferedItem({
      sessionId: "sess-cap",
      templateId: "TPL_SIGN_MUL_DIV",
      skillId: sign.primaryMicroSkillId,
      item: sign,
    });
    assert.equal(sessionBufferCount("sess-cap"), SESSION_BUFFER_CAP);
    assert.equal(peekBufferedItem("sess-cap", "TPL_TWO_STEP"), null);
    assert.ok(peekBufferedItem("sess-cap", "TPL_SIGN_MUL_DIV"));
  });

  it("likelyPrefetchTemplates includes current, prereq with template, and next backbone", () => {
    const targets = likelyPrefetchTemplates({
      currentTemplateId: "TPL_NEG_DISTRIBUTION",
      currentSkillId: "LIN_DISTRIBUTE_NEG",
      nextBackboneTemplateId: "TPL_NEG_DISTRIBUTION_BARE",
    });
    assert.ok(targets.includes("TPL_NEG_DISTRIBUTION"));
    assert.ok(targets.includes("TPL_SIGN_MUL_DIV"));
    assert.ok(targets.includes("TPL_NEG_DISTRIBUTION_BARE"));
    assert.ok(targets.length <= SESSION_BUFFER_CAP);
  });
});

describe("Phase C — consume-before-sync race safety", () => {
  it("two selects do not get the same buffered equation", async () => {
    const item = verifiedItem("TPL_NEG_DISTRIBUTION", "race-1");
    putBufferedItem({
      sessionId: "sess-race",
      templateId: "TPL_NEG_DISTRIBUTION",
      skillId: item.primaryMicroSkillId,
      item,
    });

    const orch = mockOrchestrator({
      raw: JSON.stringify({
        choice: "GENERATE",
        templateId: "TPL_NEG_DISTRIBUTION",
        confidence: 0.85,
        reasoning: "LIKELY_GAP on LIN_DISTRIBUTE_NEG needs another negative-distribution instance.",
      }),
    });
    const selector = makeSelectorService(orch.service);
    const ctx = baseCtx({
      sessionId: "sess-race",
      skillLines: [gapSkillLine],
      lastStepSummary: "INVALID on LIN_DISTRIBUTE_NEG",
    });

    const [a, b] = await Promise.all([selector.selectNext(ctx), selector.selectNext(ctx)]);
    const bufferHits = [a, b].filter((r) => r.fromBuffer);
    assert.equal(bufferHits.length, 1);
    assert.equal(bufferHits[0]!.item.itemKey, item.itemKey);
    assert.equal(bufferSize(), 0);
  });

  it("selectNext does not call author when buffer has a matching verified item", async () => {
    const item = verifiedItem("TPL_NEG_DISTRIBUTION", "no-author");
    putBufferedItem({
      sessionId: "sess-no-author",
      templateId: "TPL_NEG_DISTRIBUTION",
      skillId: item.primaryMicroSkillId,
      item,
    });

    const selectorOrch = mockOrchestrator({
      raw: JSON.stringify({
        choice: "GENERATE",
        templateId: "TPL_NEG_DISTRIBUTION",
        confidence: 0.85,
        reasoning: "LIKELY_GAP on LIN_DISTRIBUTE_NEG — serve a verified buffer instance.",
      }),
    });
    const authorOrch = mockOrchestrator({
      raw: JSON.stringify({
        equation: "-9(x-1)+2=20",
        claimedSolution: "x=3",
        targetMicroSkillId: "LIN_DISTRIBUTE_NEG",
        whyNoTemplateFits: "should not be called",
      }),
    });
    const selector = makeSelectorService(selectorOrch.service, authorOrch.service);
    const result = await selector.selectNext(
      baseCtx({
        sessionId: "sess-no-author",
        skillLines: [gapSkillLine],
        lastStepSummary: "INVALID on sign product",
      }),
    );

    assert.equal(result.fromBuffer, true);
    assert.equal(result.item.itemKey, item.itemKey);
    assert.equal(authorOrch.calls.length, 0);
  });
});
