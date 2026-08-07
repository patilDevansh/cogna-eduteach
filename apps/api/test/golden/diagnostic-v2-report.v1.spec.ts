import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DiagnosticV2ReportService,
  type DiagnosticV2ReportStructuredData,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-report.service";
import { ReportGeneratorAgentService } from "../../src/engines/report-generator/report-generator-agent.service";
import { mockOrchestrator } from "./helpers/diagnostic-v2-fakes";

function sampleData(
  overrides: Partial<DiagnosticV2ReportStructuredData> = {},
): DiagnosticV2ReportStructuredData {
  return {
    kind: "diagnostic_v2_session",
    diagnosticSessionId: "dv2-sess-1",
    track: "FRACTION_LINEAR",
    status: "COMPLETED",
    itemsAttempted: 3,
    itemsCompleted: 3,
    solidSkillCount: 1,
    gapSkillCount: 1,
    solidSkillNames: ["clearing fractions by multiplying both sides"],
    gapSkillNames: ["solving equations that have fractions in them"],
    stageCount: 4,
    retentionScheduled: true,
    skills: [
      {
        microSkillId: "LIN_CLEAR_FRACTIONS",
        childFacingName: "clearing fractions by multiplying both sides",
        status: "RELIABLE",
        evidenceCount: 2,
        independentSuccessCount: 2,
        independentFailureCount: 0,
        assistedSuccessCount: 0,
        childFacingSummary: null,
      },
      {
        microSkillId: "LIN_SOLVE_FRACTIONS",
        childFacingName: "solving equations that have fractions in them",
        status: "LIKELY_GAP",
        evidenceCount: 2,
        independentSuccessCount: 0,
        independentFailureCount: 2,
        assistedSuccessCount: 0,
        confidence: 0.7,
        childFacingSummary:
          "Next time we'll spend a bit of time on solving equations that have fractions in them.",
      },
    ],
    parentActions: [
      "Spend a short practice block revisiting solving equations that have fractions in them.",
      "We'll schedule a short follow-up check in a few days.",
    ],
    ...overrides,
  };
}

const json = (v: unknown) => JSON.stringify(v);

describe("DiagnosticV2ReportService — D.v2 templates", () => {
  const service = new DiagnosticV2ReportService(
    null as unknown as ConstructorParameters<typeof DiagnosticV2ReportService>[0],
    null as unknown as ConstructorParameters<typeof DiagnosticV2ReportService>[1],
  );

  it("student rule summary names solid skills and gap follow-up", () => {
    const text = service.renderStudentSummary(sampleData());
    assert.match(text, /clearing fractions/);
    assert.match(text, /solving equations that have fractions/);
    assert.match(text, /come back to it in a few days/);
  });

  it("parent rule summary states completed counts from structured facts", () => {
    const text = service.renderParentSummary(sampleData());
    assert.match(text, /3 of 3/);
    assert.match(text, /1 skill gap/);
    assert.match(text, /clearing fractions/);
  });

  it("works for every diagnostic track id in structured facts", () => {
    for (const track of [
      "NEGATIVE_DISTRIBUTION",
      "FRACTION_LINEAR",
      "IDENTITY_DIFF_SQUARES",
      "FACTOR_MONIC_TRINOMIAL",
      "QUAD_ZERO_PRODUCT",
    ] as const) {
      const text = service.renderParentSummary(sampleData({ track }));
      assert.match(text, /3 of 3/);
      assert.ok(text.length > 40);
    }
  });
});

describe("DiagnosticV2ReportService — REPORT_GENERATOR polish gates", () => {
  const ruleService = new DiagnosticV2ReportService(
    null as unknown as ConstructorParameters<typeof DiagnosticV2ReportService>[0],
    null as unknown as ConstructorParameters<typeof DiagnosticV2ReportService>[1],
  );
  const data = sampleData();
  const ruleParent = ruleService.renderParentSummary(data);

  it("AI off → polish returns null (caller keeps template)", async () => {
    const orch = mockOrchestrator({ generate: false });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "PARENT",
      studentId: "student-1",
      sessionId: "dv2-sess-1",
      structuredData: data,
      ruleText: ruleParent,
    });
    assert.equal(polished, null);
    assert.equal(orch.calls.length, 0);
  });

  it("invented accuracy % is rejected by numeric gate", async () => {
    const orch = mockOrchestrator({
      raw: json({
        renderedText:
          "Your child finished 3 of 3 questions with a glowing 99% accuracy today.",
      }),
    });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "PARENT",
      studentId: "student-1",
      sessionId: "dv2-sess-1",
      structuredData: data,
      ruleText: ruleParent,
    });
    assert.equal(polished, null);
    assert.match(orch.rejections[0]!, /numeric|invent/i);
  });

  it("happy-path serve when GENERATE+SERVE on (numbers grounded)", async () => {
    const orch = mockOrchestrator({
      raw: json({
        renderedText:
          "Today your child finished 3 of 3 questions. They looked solid on clearing fractions by multiplying both sides. 1 skill gap to revisit: solving equations that have fractions in them.",
      }),
    });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "PARENT",
      studentId: "student-1",
      sessionId: "dv2-sess-1",
      structuredData: data,
      ruleText: ruleParent,
    });
    assert.ok(polished);
    assert.match(polished!, /3 of 3/);
    assert.match(polished!, /1 skill gap/);
  });
});
