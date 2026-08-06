/**
 * T4 extension — AI on vs AI off when the selector genuinely disagrees.
 *
 * Phase A's Arun equivalence test stubs the model to echo the rule index, so
 * it passes trivially. Here the AI always requests GENERATE for the rule
 * stage's template (disagreeing with EXISTING). Deterministic facts — validity,
 * evidence kind/weight, skill status, stage route — must still match AI-off.
 * Item wording and itemKeys may differ.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DiagnosticV2SessionService } from "../../src/engines/diagnostic-v2/diagnostic-v2-session.service";
import { DiagnosticV2AiInterpreterService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-interpreter.service";
import { DiagnosticV2AiGraderService } from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-grader.service";
import {
  createFakePrisma,
  makeSelectorService,
  mockOrchestrator,
  type FakeDb,
} from "./helpers/diagnostic-v2-fakes";

const STUDENT = "student-t4";

const STAGE_TEMPLATE: Record<string, string> = {
  ENTRY_VARIABLE_BOTH: "TPL_VARIABLE_BOTH",
  NEG_DIST_MAIN: "TPL_NEG_DISTRIBUTION",
  NEG_DIST_CONTRAST: "TPL_NEG_DISTRIBUTION_BARE",
  TRANSFER_NEG_DIST: "TPL_TRANSFER_NEG_DISTRIBUTION",
};

function signErrorLine(openingLine: string): string | null {
  const bare = /^(-?\d+)\(([a-z])\s*-\s*(\d+)\)$/i.exec(openingLine.replace(/\s+/g, ""));
  if (bare) {
    const mult = Number(bare[1]);
    const v = bare[2]!;
    const b = Number(bare[3]);
    return `${mult}${v} - ${Math.abs(mult * b)}`;
  }
  const eq =
    /^(-?\d+)\(([a-z])\s*-\s*(\d+)\)\s*([+-])\s*(\d+)\s*=\s*(-?\d+)$/i.exec(
      openingLine.replace(/\s+/g, " ").trim(),
    );
  if (!eq) return null;
  const mult = Number(eq[1]);
  const v = eq[2]!;
  const inner = Number(eq[3]);
  const outerSign = eq[4]!;
  const outer = Number(eq[5]);
  const rhs = eq[6]!;
  const wrongSecond = -Math.abs(mult * inner);
  return `${mult}${v} ${wrongSecond < 0 ? "-" : "+"} ${Math.abs(wrongSecond)} ${outerSign} ${outer} = ${rhs}`
    .replace(/\s+/g, " ")
    .trim();
}

function correctNegDistSteps(openingLine: string): Array<[string, string]> {
  // Parse m(v - b) + c = d and produce correct expansion → solve.
  const eq =
    /^(-?\d+)\(([a-z])\s*-\s*(\d+)\)\s*([+-])\s*(\d+)\s*=\s*(-?\d+)$/i.exec(
      openingLine.replace(/\s+/g, " ").trim(),
    );
  if (!eq) return [[openingLine, openingLine]];
  const mult = Number(eq[1]);
  const v = eq[2]!;
  const inner = Number(eq[3]);
  const outerSign = eq[4] === "-" ? -1 : 1;
  const outer = Number(eq[5]) * outerSign;
  const rhs = Number(eq[6]);
  const second = mult * -inner; // m * (-inner) wait: m*(v - inner) = m*v - m*inner
  const expandedSecond = -mult * inner; // actually m * (-inner)? Distribution: m*(v-b)=m*v + m*(-b)=m*v - m*b
  const term2 = mult * -inner; // = -m*inner when... m*(-inner) = -m*inner. For m=-2, inner=5: (-2)*(-5)=+10. So term2 = -mult*inner? 
  // m*(v - b) = m*v - m*b. For m=-2, b=5: -2v - (-2)*5 = -2v + 10. So second term coefficient = -m*b = -(-2)*5 = 10.
  const secondCoeff = -mult * inner;
  const line1 = `${mult}${v} ${secondCoeff < 0 ? "-" : "+"} ${Math.abs(secondCoeff)} ${outer < 0 ? "-" : "+"} ${Math.abs(outer)} = ${rhs}`
    .replace(/\s+/g, " ")
    .trim();
  // Combine constants on left: m*v + (secondCoeff+outer) = rhs
  const constSum = secondCoeff + outer;
  const line2 = `${mult}${v} ${constSum < 0 ? "-" : "+"} ${Math.abs(constSum)} = ${rhs}`.replace(/\s+/g, " ").trim();
  // Move const: m*v = rhs - constSum
  const right = rhs - constSum;
  const line3 = `${mult}${v} = ${right}`.replace(/\s+/g, " ").trim();
  const x = right / mult;
  const line4 = `${v} = ${x}`;
  void second;
  void expandedSecond;
  void term2;
  return [
    [openingLine, line1],
    [line1, line2],
    [line2, line3],
    [line3, line4],
  ];
}

async function runPath(aiOn: boolean): Promise<{
  db: FakeDb;
  stages: string[];
  evidence: Array<{ kind: string; weight: number; skill: string }>;
  states: Array<{ skill: string; status: string; indSucc: number; indFail: number }>;
  selectorCalls: number;
  prompts: string[];
}> {
  const { prisma, db } = createFakePrisma([STUDENT]);
  const selector = mockOrchestrator({
    generate: aiOn,
    raw: (call) => {
      // Disagree: always GENERATE the template for the rule-picked candidate.
      const ruleIndex = (call.ruleOutput as { index: number }).index;
      const line =
        call.userPrompt.split("\n").find((l) => l.startsWith(`[${ruleIndex}]`)) ?? "";
      const tmpl = /template=(\w+)/.exec(line)?.[1];
      const templateId =
        tmpl && tmpl !== "none" && STAGE_TEMPLATE[tmpl] === undefined
          ? tmpl
          : tmpl && STAGE_TEMPLATE[tmpl]
            ? STAGE_TEMPLATE[tmpl]
            : tmpl && Object.values(STAGE_TEMPLATE).includes(tmpl)
              ? tmpl
              : "TPL_NEG_DISTRIBUTION";
      // If the candidate line has template=TPL_*, use it; else map stage names.
      const fromCandidate = /template=(TPL_\w+)/.exec(line)?.[1];
      return JSON.stringify({
        choice: "GENERATE",
        templateId: fromCandidate ?? templateId,
        confidence: 0.75,
        reasoning: "LIN_DISTRIBUTE_NEG status warrants a fresh instance rather than the fixed bank item.",
      });
    },
  });
  const interpreter = mockOrchestrator({
    generate: aiOn,
    raw: (call) =>
      JSON.stringify({
        hypothesisLabel: (call.ruleOutput as { hypothesisLabel: string }).hypothesisLabel,
        confidence: 0.9,
        reasoning: "The same sign slip shows up on negative brackets.",
        childFacingSummary: "Let's look at what a minus outside a bracket does.",
      }),
  });
  const grader = mockOrchestrator({ generate: aiOn });

  const service = new DiagnosticV2SessionService(
    prisma,
    makeSelectorService(selector.service),
    new DiagnosticV2AiInterpreterService(interpreter.service),
    new DiagnosticV2AiGraderService(grader.service),
  );

  const start = await service.startSession(STUDENT);
  let attemptId = start.attemptId;
  let opening = start.openingLine;
  let itemKey = start.itemKey;
  const prompts = [start.equationPrompt];

  // Entry two-step (fixed or generated).
  const finishTwoStep = async () => {
    if (opening === "3x + 5 = 20" || itemKey === "ENTRY_TWO_STEP") {
      await service.submitStep(start.sessionId, {
        attemptId,
        previousLine: opening,
        submittedLine: "3x = 15",
      });
      const r = await service.submitStep(start.sessionId, {
        attemptId,
        previousLine: "3x = 15",
        submittedLine: "x = 5",
      });
      if (r.nextAttempt) {
        attemptId = r.nextAttempt.attemptId;
        opening = r.nextAttempt.openingLine;
        itemKey = r.nextAttempt.itemKey;
        prompts.push(r.nextAttempt.equationPrompt);
      }
      return;
    }
    // Generated two-step: jump via correct solve using verifier-friendly lines is hard;
    // submit wrong then full explanation to move on — but that changes evidence.
    // Prefer: use dontKnow twice to complete without skill failure on target.
    await service.submitStep(start.sessionId, {
      attemptId,
      previousLine: opening,
      submittedLine: "",
      dontKnow: true,
    });
    const r = await service.submitStep(start.sessionId, {
      attemptId,
      previousLine: opening,
      submittedLine: "",
      dontKnow: true,
    });
    if (r.nextAttempt) {
      attemptId = r.nextAttempt.attemptId;
      opening = r.nextAttempt.openingLine;
      itemKey = r.nextAttempt.itemKey;
      prompts.push(r.nextAttempt.equationPrompt);
    }
  };

  await finishTwoStep();

  // Variable both — decline twice if generated so we reach NEG_DIST without inventing solutions.
  if (itemKey.includes("VAR") || opening.includes("=") && opening.includes("x") && opening.split("x").length > 2) {
    await service.submitStep(start.sessionId, {
      attemptId,
      previousLine: opening,
      submittedLine: "",
      dontKnow: true,
    });
    const r = await service.submitStep(start.sessionId, {
      attemptId,
      previousLine: opening,
      submittedLine: "",
      dontKnow: true,
    });
    if (r.nextAttempt) {
      attemptId = r.nextAttempt.attemptId;
      opening = r.nextAttempt.openingLine;
      itemKey = r.nextAttempt.itemKey;
      prompts.push(r.nextAttempt.equationPrompt);
    }
  } else if (itemKey === "ENTRY_VARIABLE_BOTH" || opening === "4x - 7 = 2x + 9") {
    for (const [prev, next] of [
      ["4x - 7 = 2x + 9", "2x - 7 = 9"],
      ["2x - 7 = 9", "2x = 16"],
      ["2x = 16", "x = 8"],
    ] as const) {
      const r = await service.submitStep(start.sessionId, { attemptId, previousLine: prev, submittedLine: next });
      if (r.nextAttempt) {
        attemptId = r.nextAttempt.attemptId;
        opening = r.nextAttempt.openingLine;
        itemKey = r.nextAttempt.itemKey;
        prompts.push(r.nextAttempt.equationPrompt);
      }
    }
  }

  // NEG_DIST_MAIN — sign error
  const wrong = signErrorLine(opening);
  assert.ok(wrong, `expected a neg-dist opening, got ${opening} (${itemKey})`);
  let r = await service.submitStep(start.sessionId, {
    attemptId,
    previousLine: opening,
    submittedLine: wrong!,
  });
  if (r.nextAttempt) {
    attemptId = r.nextAttempt.attemptId;
    opening = r.nextAttempt.openingLine;
    itemKey = r.nextAttempt.itemKey;
    prompts.push(r.nextAttempt.equationPrompt);
  }

  // CONTRAST — sign error again
  const wrong2 = signErrorLine(opening) ?? "-3y - 12";
  r = await service.submitStep(start.sessionId, {
    attemptId,
    previousLine: opening,
    submittedLine: wrong2,
  });
  if (r.nextAttempt) {
    attemptId = r.nextAttempt.attemptId;
    opening = r.nextAttempt.openingLine;
    itemKey = r.nextAttempt.itemKey;
    prompts.push(r.nextAttempt.equationPrompt);
  }

  // TRANSFER — solve correctly (adaptive)
  if (opening.includes("(")) {
    for (const [prev, next] of correctNegDistSteps(opening)) {
      r = await service.submitStep(start.sessionId, {
        attemptId,
        previousLine: prev,
        submittedLine: next,
      });
      if (r.itemComplete && r.nextAttempt) {
        attemptId = r.nextAttempt.attemptId;
        opening = r.nextAttempt.openingLine;
        itemKey = r.nextAttempt.itemKey;
        prompts.push(r.nextAttempt.equationPrompt);
        break;
      }
      if (r.sessionStatus === "COMPLETED") break;
    }
  }

  const debug = await service.getDebugView(start.sessionId);
  return {
    db,
    stages: debug.stageHistory.map((s) => s.stageId),
    evidence: db.evidence.map((e) => ({
      kind: e.evidenceKind as string,
      weight: e.weight as number,
      skill: e.microSkillId as string,
    })),
    states: db.states.map((s) => ({
      skill: s.microSkillId as string,
      status: s.status as string,
      indSucc: s.independentSuccessCount as number,
      indFail: s.independentFailureCount as number,
    })),
    selectorCalls: selector.calls.length,
    prompts,
  };
}

describe("T4 — AI on disagrees with rule; deterministic facts stay identical", () => {
  it("AI-on calls the model; AI-off makes zero selector calls", async () => {
    const on = await runPath(true);
    const off = await runPath(false);
    assert.ok(on.selectorCalls > 0, "AI-on must genuinely call the selector");
    assert.equal(off.selectorCalls, 0, "AI-off must make zero selector calls");
  });

  it("evidence kinds, weights, skill statuses, and stage route match despite GENERATE disagreement", async () => {
    const on = await runPath(true);
    const off = await runPath(false);

    // Stage route (item-bearing + RULE_PROMPT + COMPLETE) must match.
    assert.deepEqual(
      on.stages,
      off.stages,
      `stage routes diverge\nAI-on: ${on.stages.join(" > ")}\nAI-off: ${off.stages.join(" > ")}`,
    );

    const normEv = (rows: typeof on.evidence) =>
      [...rows]
        .map((e) => `${e.skill}|${e.kind}|${e.weight}`)
        .sort();
    assert.deepEqual(
      normEv(on.evidence),
      normEv(off.evidence),
      `evidence diverged — a disagreeing selector changed a deterministic fact\nAI-on prompts: ${on.prompts.join(" || ")}\nAI-off prompts: ${off.prompts.join(" || ")}\nAI-on: ${normEv(on.evidence).join("; ")}\nAI-off: ${normEv(off.evidence).join("; ")}`,
    );

    const normSt = (rows: typeof on.states) =>
      [...rows]
        .map((s) => `${s.skill}|${s.status}|${s.indSucc}|${s.indFail}`)
        .sort();
    assert.deepEqual(
      normSt(on.states),
      normSt(off.states),
      `skill states diverged\nAI-on: ${normSt(on.states).join("; ")}\nAI-off: ${normSt(off.states).join("; ")}`,
    );

    // Wording may differ — that is the point of GENERATE disagreement.
    // If they happen to be identical, that is fine; we only require facts match.
  });
});
