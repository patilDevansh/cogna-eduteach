import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_CAPABILITIES } from "../../src/ai/shadow-gate-evaluator.service";
import { LATENCY_BUDGET_MS, rowAgreement } from "../../src/ai/shadow-gate-evaluator.formulas";
import {
  buildReportPolishPrompts,
  ReportGeneratorAgentService,
} from "../../src/engines/report-generator/report-generator-agent.service";
import { ReportGeneratorService } from "../../src/engines/report-generator/report-generator.service";
import { mockOrchestrator } from "./helpers/diagnostic-v2-fakes";

const sessionStructured = {
  sessionId: "sess-ai-1",
  questionsAttempted: 4,
  correctAnswers: 3,
  accuracy: 0.75,
  conceptId: "C2_ONE_STEP_SUBTRACTION",
  masteryChanges: {
    C2_ONE_STEP_SUBTRACTION: { from: 0.4, to: 0.55 },
  },
  activeMisconception: null as string | null,
  remediationState: null as string | null,
  diagnosticFactors: [] as Array<{ factorKey: string | null; confidence: number; factorType: string }>,
};

const json = (v: unknown) => JSON.stringify(v);

function templateStudent(): string {
  const service = new ReportGeneratorService(
    null as unknown as ConstructorParameters<typeof ReportGeneratorService>[0],
    null as unknown as ConstructorParameters<typeof ReportGeneratorService>[1],
  );
  return (
    service as unknown as {
      renderStudentSummary: (d: typeof sessionStructured) => string;
    }
  ).renderStudentSummary(sessionStructured);
}

describe("REPORT_GENERATOR — infrastructure", () => {
  it("is listed in KNOWN_CAPABILITIES with a latency budget", () => {
    assert.ok((KNOWN_CAPABILITIES as readonly string[]).includes("REPORT_GENERATOR"));
    assert.equal(LATENCY_BUDGET_MS.REPORT_GENERATOR, 5000);
  });

  it("treats successful polish shapes as agreement for the shadow gate", () => {
    assert.deepEqual(
      rowAgreement(
        "REPORT_GENERATOR",
        { renderedText: "template", audience: "STUDENT" },
        { renderedText: "polished prose with the same facts" },
      ),
      { agreedCount: 1, comparedCount: 1 },
    );
  });
});

describe("ReportGeneratorAgentService — flags and gates", () => {
  const ruleText = templateStudent();

  it("AI off → returns null so caller keeps today's template", async () => {
    const orch = mockOrchestrator({ generate: false });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "STUDENT",
      studentId: "student-1",
      sessionId: "sess-ai-1",
      structuredData: sessionStructured,
      ruleText,
    });
    assert.equal(polished, null);
    assert.equal(orch.calls.length, 0);
    // Template itself is unchanged and voice-clean.
    assert.match(ruleText, /3 of 4/);
    assert.match(ruleText, /75%/);
  });

  it("forbidden term reject → null (template fallback)", async () => {
    const orch = mockOrchestrator({
      raw: json({
        renderedText: "Your mastery is low after this clinical assessment of ADHD risk.",
      }),
    });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "STUDENT",
      studentId: "student-1",
      sessionId: "sess-ai-1",
      structuredData: sessionStructured,
      ruleText,
    });
    assert.equal(polished, null);
    assert.match(orch.rejections[0]!, /forbidden term/);
  });

  it("numeric mismatch reject → null (template fallback)", async () => {
    const orch = mockOrchestrator({
      raw: json({
        renderedText: "You answered 3 of 4 correctly — that's a glowing 99% accuracy.",
      }),
    });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "STUDENT",
      studentId: "student-1",
      sessionId: "sess-ai-1",
      structuredData: sessionStructured,
      ruleText,
    });
    assert.equal(polished, null);
    assert.match(orch.rejections[0]!, /numeric cross-check/);
  });

  it("happy-path serve when GENERATE+SERVE on (orchestrator mocked)", async () => {
    const aiText =
      "Nice work — you got 3 of 4 questions right (75% accuracy) on one-step subtraction equations.";
    const orch = mockOrchestrator({ raw: json({ renderedText: aiText }) });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "STUDENT",
      studentId: "student-1",
      sessionId: "sess-ai-1",
      structuredData: sessionStructured,
      ruleText,
    });
    assert.equal(polished, aiText);
    assert.equal(orch.calls[0]!.capability, "REPORT_GENERATOR");
    assert.deepEqual(orch.calls[0]!.ruleOutput, {
      renderedText: ruleText,
      audience: "STUDENT",
    });
  });

  it("shadow mode (SERVE off) keeps template even when the call succeeds", async () => {
    const orch = mockOrchestrator({
      serve: false,
      raw: json({
        renderedText:
          "Nice work — you got 3 of 4 questions right (75% accuracy) on one-step subtraction equations.",
      }),
    });
    const agent = new ReportGeneratorAgentService(orch.service);
    const polished = await agent.polishSummary({
      audience: "PARENT",
      studentId: "student-1",
      sessionId: "sess-ai-1",
      structuredData: sessionStructured,
      ruleText,
    });
    assert.equal(polished, null);
    assert.equal(orch.calls.length, 1);
  });
});

describe("buildReportPolishPrompts", () => {
  it("hands structured facts and the template draft to the model", () => {
    const { system, user } = buildReportPolishPrompts({
      audience: "WEEKLY_PARENT",
      studentId: "student-1",
      structuredData: sessionStructured,
      ruleText: "template draft",
    });
    assert.match(system, /must not invent any numbers/);
    assert.match(user, /Audience: WEEKLY_PARENT/);
    assert.match(user, /template draft/);
    assert.match(user, /questionsAttempted/);
  });
});

describe("ReportGeneratorService renderers — AI-off identical templates", () => {
  it("student/parent/internal/weekly renderers stay deterministic without an agent", () => {
    const service = new ReportGeneratorService(
      null as unknown as ConstructorParameters<typeof ReportGeneratorService>[0],
      null as unknown as ConstructorParameters<typeof ReportGeneratorService>[1],
    );
    const priv = service as unknown as {
      renderStudentSummary: (d: typeof sessionStructured) => string;
      renderParentSummary: (d: typeof sessionStructured) => string;
      renderInternalSummary: (d: typeof sessionStructured) => string;
      renderWeeklyParentReport: (d: {
        sessionsCompleted: number;
        questionsAttempted: number;
        accuracy: number;
        conceptsPracticed: string[];
        masteryChanges: Array<{ conceptId: string; from: number; to: number }>;
        activePatterns: Array<{ misconceptionId: string; confidence: number; uncertainty: string }>;
        revisionPlan: Array<{ conceptId: string; reason: string; questionCount: number }>;
        parentActions: string[];
        weakEvidence: boolean;
      }) => string;
    };

    const student = priv.renderStudentSummary(sessionStructured);
    const parent = priv.renderParentSummary(sessionStructured);
    const internal = priv.renderInternalSummary(sessionStructured);
    assert.match(student, /3 of 4/);
    assert.match(parent, /3 of 4/);
    assert.match(internal, /\[INTERNAL\]/);
    assert.match(internal, /accuracy=0\.75/);

    const weekly = priv.renderWeeklyParentReport({
      sessionsCompleted: 1,
      questionsAttempted: 2,
      accuracy: 0.5,
      conceptsPracticed: ["C2_ONE_STEP_SUBTRACTION"],
      masteryChanges: [],
      activePatterns: [],
      revisionPlan: [],
      parentActions: ["Keep practice sessions short — about 10–15 minutes."],
      weakEvidence: true,
    });
    assert.match(weekly, /still gathering evidence/i);
  });
});
