/**
 * T1 — Question-uniqueness ledger + D3 session-scope labelling.
 *
 * The D2 defect (same seed → same question) was invisible because no test
 * looked across a whole run. This harness drives a full session, records every
 * question served, and asserts zero duplicate prompts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DiagnosticV2SessionService } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import { buildSelectorPrompts } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-selector.service";
import {
  createFakePrisma,
  makeSelectorService,
  mockOrchestrator,
} from "./helpers/diagnostic-v2-fakes";
import { findFixedItem } from "../../src/engines/diagnostic-v2/diagnostic-v2-template-render";
import { EVIDENCE_POLICY_MICROSKILL_V1 } from "@cogna/shared";

interface LedgerEntry {
  prompt: string;
  openingLine: string;
  templateId: string | null;
  itemKey: string;
  origin: string;
}

function formatLedger(ledger: LedgerEntry[]): string {
  return ledger
    .map(
      (e, i) =>
        `${i}: origin=${e.origin} template=${e.templateId ?? "none"} key=${e.itemKey} prompt="${e.prompt}"`,
    )
    .join("\n");
}

const STUDENT = "student-ledger";

async function driveSession(sessionLabel: string): Promise<LedgerEntry[]> {
  const { prisma, db } = createFakePrisma([STUDENT]);

  // Always GENERATE the stage's template so D2 uniqueness is under pressure.
  const selector = mockOrchestrator({
    raw: (call) => {
      const rule = call.ruleOutput as { index: number };
      const candidateLine =
        call.userPrompt.split("\n").find((l) => l.startsWith(`[${rule.index}]`)) ?? "";
      const fromCandidate = /template=(TPL_\w+)/.exec(candidateLine)?.[1] ?? "TPL_NEG_DISTRIBUTION";
      // Cite a skill id that actually appears in this prompt (G1.4), falling back to
      // a generic citation of the last-step summary when no skill lines exist yet.
      const skillCite =
        /([A-Z]{3}_[A-Z0-9_]+) \[/.exec(call.userPrompt)?.[1] ??
        /working on ([A-Z]{3}_[A-Z0-9_]+)/.exec(call.userPrompt)?.[1] ??
        "the last line";
      return JSON.stringify({
        choice: "GENERATE",
        templateId: fromCandidate,
        confidence: 0.7,
        reasoning: `${skillCite} warrants a fresh ${fromCandidate} instance (${sessionLabel}).`,
      });
    },
  });

  const service = new DiagnosticV2SessionService(
    prisma,
    makeSelectorService(selector.service),
    new DiagnosticV2AiInterpreterService(mockOrchestrator({ generate: false }).service),
    new DiagnosticV2AiGraderService(mockOrchestrator({ generate: false }).service),
  );

  const start = await service.startSession(STUDENT);
  const ledger: LedgerEntry[] = [
    {
      prompt: start.equationPrompt,
      openingLine: start.openingLine,
      templateId: "TPL_TWO_STEP",
      itemKey: start.itemKey,
      origin: "PRE_WRITTEN",
    },
  ];

  let attemptId = start.attemptId;
  let openingLine = start.openingLine;
  let itemKey = start.itemKey;

  // Walk each item to completion with correct (or correctly-wrong) lines.
  // For generated equations we solve / err adaptively from the opening line.
  for (let guard = 0; guard < 20; guard++) {
    const debug = await service.getDebugView(start.sessionId);
    if (debug.status !== "ACTIVE") break;

    const lines = scriptFor(openingLine, itemKey);
    for (const [prev, next] of lines) {
      const response = await service.submitStep(start.sessionId, {
        attemptId,
        previousLine: prev,
        submittedLine: next,
      });
      if (response.nextAttempt) {
        attemptId = response.nextAttempt.attemptId;
        openingLine = response.nextAttempt.openingLine;
        itemKey = response.nextAttempt.itemKey;
        const originRow = db.attempts.find((a) => a.id === attemptId);
        ledger.push({
          prompt: response.nextAttempt.equationPrompt,
          openingLine: response.nextAttempt.openingLine,
          templateId: (originRow?.templateId as string | null) ?? null,
          itemKey: response.nextAttempt.itemKey,
          origin: (originRow?.origin as string) ?? "UNKNOWN",
        });
        break;
      }
      if (response.sessionStatus === "COMPLETED") break;
    }
  }

  return ledger;
}

function scriptFor(openingLine: string, itemKey: string): Array<[string, string]> {
  // Fixed bank paths we know.
  if (itemKey === "ENTRY_TWO_STEP" || openingLine === "3x + 5 = 20") {
    return [
      ["3x + 5 = 20", "3x = 15"],
      ["3x = 15", "x = 5"],
    ];
  }
  if (itemKey === "ENTRY_VARIABLE_BOTH" || openingLine === "4x - 7 = 2x + 9") {
    return [
      ["4x - 7 = 2x + 9", "2x - 7 = 9"],
      ["2x - 7 = 9", "2x = 16"],
      ["2x = 16", "x = 8"],
    ];
  }
  if (itemKey === "NEG_DIST_MAIN" || openingLine === "-2(x - 5) + 3 = 11") {
    return [["-2(x - 5) + 3 = 11", "-2x - 10 + 3 = 11"]];
  }
  if (itemKey === "NEG_DIST_CONTRAST" || openingLine === "-3(y - 4)") {
    return [["-3(y - 4)", "-3y - 12"]];
  }
  if (itemKey === "TRANSFER_NEG_DIST" || openingLine === "-4(z - 2) + 3 = 19") {
    return [
      ["-4(z - 2) + 3 = 19", "-4z + 8 + 3 = 19"],
      ["-4z + 8 + 3 = 19", "-4z = 8"],
      ["-4z = 8", "z = -2"],
    ];
  }

  // Generated / authored: for bare expand, produce the sign-error expansion;
  // for equations, produce the canonical sign error then stop (item completes).
  if (!openingLine.includes("=")) {
    // -m(v - b) → wrong: -m*v - m*b  (sign error) vs correct -m*v + m*b
    const m = /^(-?\d+)\(([a-z])\s*-\s*(\d+)\)$/i.exec(openingLine.replace(/\s+/g, ""));
    if (m) {
      const mult = Number(m[1]);
      const v = m[2]!;
      const b = Number(m[3]);
      // Wrong expansion matching the canonical pattern (lose the inner sign)
      const wrong = `${mult}${v} - ${Math.abs(mult * b)}`.replace(/--/g, "+");
      return [[openingLine, wrong]];
    }
  }

  // Equation with bracket: submit the sign-error distribution to complete via TARGET_ERROR.
  const eq = /^(-?\d+)\(([a-z])\s*-\s*(\d+)\)\s*([+-])\s*(\d+)\s*=\s*(-?\d+)$/i.exec(
    openingLine.replace(/\s+/g, " ").trim(),
  );
  if (eq) {
    const mult = Number(eq[1]);
    const v = eq[2]!;
    const inner = Number(eq[3]);
    const outerSign = eq[4]!;
    const outer = Number(eq[5]);
    const rhs = eq[6]!;
    // Wrong: m(v-b) → m*v - |m|*b  (sign lost on second term when m<0)
    const second = mult * -inner; // correct would be this; wrong flips sign of product
    // Canonical wrong for negative m: (-2)(x-5) → -2x - 10 instead of -2x + 10
    const wrongSecond = -Math.abs(mult * inner);
    const outerPart = `${outerSign} ${outer}`;
    const wrongLine = `${mult}${v} ${wrongSecond < 0 ? "-" : "+"} ${Math.abs(wrongSecond)} ${outerPart} = ${rhs}`;
    void second;
    return [[openingLine, wrongLine.replace(/\s+/g, " ").trim()]];
  }

  // Two-step generated: finish correctly in one jump to solved form when possible.
  return [[openingLine, openingLine.includes("x") ? "x = 1" : "y = 1"]];
}

describe("T1 — question-uniqueness ledger", () => {
  it("records zero duplicate prompt strings within a session", async () => {
    const ledger = await driveSession("run-a");
    const prompts = ledger.map((e) => e.prompt.replace(/\s+/g, " ").trim().toLowerCase());
    const dupes = prompts.filter((p, i) => prompts.indexOf(p) !== i);
    assert.equal(
      dupes.length,
      0,
      `duplicate prompts in session:\n${formatLedger(ledger)}\ndupes=${JSON.stringify(dupes)}`,
    );
    assert.ok(ledger.length >= 3, `expected a full-ish run, got ${ledger.length}\n${formatLedger(ledger)}`);
  });

  it("never serves the same template twice in a row with identical numbers", async () => {
    const ledger = await driveSession("run-b");
    for (let i = 1; i < ledger.length; i++) {
      const prev = ledger[i - 1]!;
      const cur = ledger[i]!;
      if (prev.templateId && prev.templateId === cur.templateId) {
        assert.notEqual(
          prev.openingLine.replace(/\s+/g, ""),
          cur.openingLine.replace(/\s+/g, ""),
          `same template ${cur.templateId} repeated with identical numbers:\n${formatLedger(ledger)}`,
        );
      }
    }
  });

  it("produces different ledgers across sessions (seed is not globally fixed)", async () => {
    // One fake DB so session ids advance (sess-001 vs sess-002) — two fresh
    // createFakePrisma() calls both restart at sess-001 and would mask a fixed seed.
    const { prisma, db } = createFakePrisma(["student-alpha", "student-beta"]);

    async function runFor(studentId: string, label: string): Promise<LedgerEntry[]> {
      const selector = mockOrchestrator({
        raw: (call) => {
          const rule = call.ruleOutput as { index: number };
          const candidateLine =
            call.userPrompt.split("\n").find((l) => l.startsWith(`[${rule.index}]`)) ?? "";
          const fromCandidate = /template=(TPL_\w+)/.exec(candidateLine)?.[1] ?? "TPL_NEG_DISTRIBUTION";
          const skillCite =
            /([A-Z]{3}_[A-Z0-9_]+) \[/.exec(call.userPrompt)?.[1] ??
            /working on ([A-Z]{3}_[A-Z0-9_]+)/.exec(call.userPrompt)?.[1] ??
            "the last line";
          return JSON.stringify({
            choice: "GENERATE",
            templateId: fromCandidate,
            confidence: 0.7,
            reasoning: `${skillCite} warrants a fresh ${fromCandidate} instance (${label}).`,
          });
        },
      });
      const service = new DiagnosticV2SessionService(
        prisma,
        makeSelectorService(selector.service),
        new DiagnosticV2AiInterpreterService(mockOrchestrator({ generate: false }).service),
        new DiagnosticV2AiGraderService(mockOrchestrator({ generate: false }).service),
      );
      const start = await service.startSession(studentId);
      const ledger: LedgerEntry[] = [
        {
          prompt: start.equationPrompt,
          openingLine: start.openingLine,
          templateId: "TPL_TWO_STEP",
          itemKey: start.itemKey,
          origin: "PRE_WRITTEN",
        },
      ];
      let attemptId = start.attemptId;
      let openingLine = start.openingLine;
      let itemKey = start.itemKey;
      for (let guard = 0; guard < 20; guard++) {
        const debug = await service.getDebugView(start.sessionId);
        if (debug.status !== "ACTIVE") break;
        const lines = scriptFor(openingLine, itemKey);
        for (const [prev, next] of lines) {
          const response = await service.submitStep(start.sessionId, {
            attemptId,
            previousLine: prev,
            submittedLine: next,
          });
          if (response.nextAttempt) {
            attemptId = response.nextAttempt.attemptId;
            openingLine = response.nextAttempt.openingLine;
            itemKey = response.nextAttempt.itemKey;
            const originRow = db.attempts.find((a) => a.id === attemptId);
            ledger.push({
              prompt: response.nextAttempt.equationPrompt,
              openingLine: response.nextAttempt.openingLine,
              templateId: (originRow?.templateId as string | null) ?? null,
              itemKey: response.nextAttempt.itemKey,
              origin: (originRow?.origin as string) ?? "UNKNOWN",
            });
            break;
          }
          if (response.sessionStatus === "COMPLETED") break;
        }
      }
      return ledger;
    }

    const a = await runFor("student-alpha", "session-alpha");
    const b = await runFor("student-beta", "session-beta");
    const genA = a.filter((e) => e.origin === "TEMPLATE_RENDERED").map((e) => e.openingLine);
    const genB = b.filter((e) => e.origin === "TEMPLATE_RENDERED").map((e) => e.openingLine);
    assert.ok(
      genA.length > 0 && genB.length > 0,
      `expected generated items in both runs\n--- A ---\n${formatLedger(a)}\n--- B ---\n${formatLedger(b)}`,
    );
    assert.notDeepEqual(
      genA,
      genB,
      `generated openings identical across sessions:\n--- A ---\n${formatLedger(a)}\n--- B ---\n${formatLedger(b)}`,
    );
  });
});

describe("D3 — this session vs earlier labelling", () => {
  it("labels prior-session state as earlier and this-session evidence as this session", async () => {
    const { prisma, db } = createFakePrisma(["student-d3"]);

    // Seed earlier state for a skill this session will not touch yet.
    db.states.push({
      studentId: "student-d3",
      microSkillId: "LIN_DISTRIBUTE_NEG",
      status: "LIKELY_GAP",
      evidenceCount: 2,
      independentSuccessCount: 0,
      independentFailureCount: 2,
      assistedSuccessCount: 0,
      observedContextStrengths: [],
      observedContextGaps: ["INDEPENDENT"],
      lastEvidenceAt: new Date(),
      stateVersion: 1,
      policyVersion: EVIDENCE_POLICY_MICROSKILL_V1,
    });

    const captured: string[] = [];
    const selector = mockOrchestrator({
      raw: (call) => {
        captured.push(call.userPrompt);
        return JSON.stringify({
          choice: "EXISTING",
          index: (call.ruleOutput as { index: number }).index,
          confidence: 0.8,
          reasoning: "LIN_DISTRIBUTE_NEG is LIKELY_GAP from earlier; continue the fixed sequence.",
        });
      },
    });

    const service = new DiagnosticV2SessionService(
      prisma,
      makeSelectorService(selector.service),
      new DiagnosticV2AiInterpreterService(mockOrchestrator({ generate: false }).service),
      new DiagnosticV2AiGraderService(mockOrchestrator({ generate: false }).service),
    );

    const start = await service.startSession("student-d3");
    await service.submitStep(start.sessionId, {
      attemptId: start.attemptId,
      previousLine: "3x + 5 = 20",
      submittedLine: "3x = 15",
    });
    await service.submitStep(start.sessionId, {
      attemptId: start.attemptId,
      previousLine: "3x = 15",
      submittedLine: "x = 5",
    });

    assert.ok(captured.length >= 1, "selector must have been called after the entry item");
    const prompt = captured[0]!;
    assert.match(
      prompt,
      /LIN_DISTRIBUTE_NEG \[earlier\]/,
      "prior-session state must be labelled earlier — would fail if earlier history were dropped or unlabelled",
    );
    assert.match(
      prompt,
      /\[this session\]/,
      "evidence produced in the current session must be labelled this session — would fail if labels were merged or dropped",
    );
    // After the two-step entry, at least one of the skills touched this session is labelled.
    assert.match(prompt, /LIN_(REMOVE_CONSTANT|REMOVE_COEFFICIENT|SOLVE_TWO_STEP) \[this session\]/);
    assert.ok(prompt.includes("[this session]") && prompt.includes("[earlier]"));
  });

  it("buildSelectorPrompts would fail a silent scope merge", () => {
    const { user } = buildSelectorPrompts({
      studentId: "s",
      sessionId: "sess",
      candidates: [
        { item: findFixedItem("NEG_DIST_MAIN")!, legalityReason: "next" },
      ],
      ruleSelectedIndex: 0,
      ruleStageId: "NEG_DIST_MAIN",
      skillLines: [
        {
          microSkillId: "LIN_DISTRIBUTE_NEG",
          status: "EMERGING",
          independentSuccessCount: 0,
          independentFailureCount: 1,
          assistedSuccessCount: 0,
          observedContextStrengths: [],
          observedContextGaps: [],
          scope: "this session",
        },
        {
          microSkillId: "LIN_SOLVE_TWO_STEP",
          status: "RELIABLE",
          independentSuccessCount: 2,
          independentFailureCount: 0,
          assistedSuccessCount: 0,
          observedContextStrengths: ["INDEPENDENT"],
          observedContextGaps: [],
          scope: "earlier",
        },
      ],
      alreadyServed: [],
      serveOrdinal: 1,
    });
    assert.match(user, /\[this session\]/);
    assert.match(user, /\[earlier\]/);
    assert.match(user, /this session vs earlier/);
  });
});
