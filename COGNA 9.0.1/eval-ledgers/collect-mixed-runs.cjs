#!/usr/bin/env node
/**
 * Collect diagnostic-v2 eval ledgers (store only — no evaluation).
 * Usage: node COGNA\ 9.0.1/eval-ledgers/collect-mixed-runs.mjs
 */
const fs = require("fs");
const path = require("path");

const API = process.env.API_URL || "http://localhost:3001";
const STUDENT_ID = process.env.STUDENT_ID || "cmriwinvg00d9y2c1v0sq9wkv";
const OUT_DIR = path.join(__dirname, "runs");

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function startSession() {
  return api("POST", "/diagnostic-v2/sessions", { studentId: STUDENT_ID });
}

async function submitStep(sessionId, payload) {
  return api("POST", `/diagnostic-v2/sessions/${sessionId}/steps`, payload);
}

async function getDebug(sessionId) {
  return api("GET", `/diagnostic-v2/sessions/${sessionId}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Drive one session with a step planner.
 * planner(ctx) → { intent, submittedLine?, dontKnow? } | { done: true }
 * ctx: { attempt, previousLine, stepIndexOnItem, itemOrdinal, lastStepResult }
 */
async function runScenario(scenario, planner) {
  const startedAt = new Date().toISOString();
  const start = await startSession();
  const runId = `run_${startedAt.replace(/[:.]/g, "-")}_${scenario.id}`;
  const ledger = {
    runId,
    scenario: { id: scenario.id, label: scenario.label, intent: scenario.intent },
    startedAt,
    sessionId: start.sessionId,
    studentId: STUDENT_ID,
    items: [],
    notes: [],
  };

  let attempt = {
    attemptId: start.attemptId,
    itemKey: start.itemKey,
    equationPrompt: start.equationPrompt,
    openingLine: start.openingLine,
    stageId: start.stageId,
  };
  let previousLine = start.openingLine;
  let stepIndexOnItem = 0;
  let itemOrdinal = 1;
  let currentItem = {
    ord: itemOrdinal,
    question: { ...attempt },
    steps: [],
    nextQuestionWhy: null,
  };
  let lastStepResult = null;
  let guard = 0;

  while (guard++ < 40) {
    const plan = planner({
      attempt,
      previousLine,
      stepIndexOnItem,
      itemOrdinal,
      lastStepResult,
      itemKey: attempt.itemKey,
    });

    if (plan.done) break;

    const payload = {
      attemptId: attempt.attemptId,
      previousLine,
      submittedLine: plan.dontKnow ? "" : plan.submittedLine ?? "",
      ...(plan.dontKnow ? { dontKnow: true } : {}),
    };

    let result;
    try {
      result = await submitStep(start.sessionId, payload);
    } catch (e) {
      currentItem.steps.push({
        previousLine,
        submittedLine: payload.submittedLine,
        intent: plan.intent,
        error: String(e.message || e),
      });
      ledger.notes.push(`submit failed at item ${itemOrdinal} step ${stepIndexOnItem}: ${e.message}`);
      break;
    }

    const stepRec = {
      previousLine,
      submittedLine: payload.submittedLine,
      intent: plan.intent,
      outcome: result.outcome,
      validity: result.validity ?? null,
      verificationSource: result.verificationSource ?? null,
      firstInvalidActionDescription: result.firstInvalidActionDescription ?? null,
      assistanceOffered: result.assistanceOffered ?? null,
      assistanceMessage: result.assistanceMessage ?? null,
      stepIndex: result.stepIndex ?? null,
      itemComplete: result.itemComplete,
      sessionStatus: result.sessionStatus,
    };
    currentItem.steps.push(stepRec);
    lastStepResult = result;
    stepIndexOnItem += 1;

    // Accepted lines become the new previousLine
    if (result.outcome === "SUBMITTED" && result.validity === "VALID") {
      previousLine = payload.submittedLine;
    }

    if (result.itemComplete || result.nextAttempt) {
      if (result.selectorDecision || result.nextAttempt) {
        currentItem.nextQuestionWhy = {
          source: result.selectorDecision?.source ?? null,
          reasoning: result.selectorDecision?.reasoning ?? null,
          nextItemKey: result.nextAttempt?.itemKey ?? null,
          nextEquationPrompt: result.nextAttempt?.equationPrompt ?? null,
          nextOpeningLine: result.nextAttempt?.openingLine ?? null,
          nextAttemptId: result.nextAttempt?.attemptId ?? null,
        };
      }
      ledger.items.push(currentItem);

      if (result.sessionStatus === "COMPLETE" || !result.nextAttempt) {
        break;
      }

      // Advance to next item
      attempt = {
        attemptId: result.nextAttempt.attemptId,
        itemKey: result.nextAttempt.itemKey,
        equationPrompt: result.nextAttempt.equationPrompt,
        openingLine: result.nextAttempt.openingLine,
        stageId: null,
      };
      previousLine = result.nextAttempt.openingLine;
      stepIndexOnItem = 0;
      itemOrdinal += 1;
      currentItem = {
        ord: itemOrdinal,
        question: { ...attempt },
        steps: [],
        nextQuestionWhy: null,
      };
      // Brief pause so AI selector/interpreter can settle between items
      await sleep(400);
      continue;
    }
  }

  if (currentItem.steps.length && !ledger.items.find((i) => i.ord === currentItem.ord)) {
    ledger.items.push(currentItem);
  }

  // Enrich with debug view origins / stage history
  try {
    const debug = await getDebug(start.sessionId);
    ledger.debugSnapshot = {
      status: debug.status,
      currentStageId: debug.currentStageId,
      stageHistory: debug.stageHistory ?? [],
      items: (debug.items ?? []).map((it) => ({
        itemKey: it.itemKey,
        equationPrompt: it.equationPrompt,
        origin: it.origin,
        templateId: it.templateId,
        stageId: it.stageId,
      })),
      hypotheses: (debug.hypotheses ?? []).map((h) => ({
        microSkillId: h.microSkillId,
        hypothesisLabel: h.hypothesisLabel,
        confidence: h.confidence,
        source: h.source,
        reasoning: h.reasoning,
        childFacingSummary: h.childFacingSummary,
      })),
    };
    // Backfill origin onto nextQuestionWhy / questions
    for (const item of ledger.items) {
      const match = ledger.debugSnapshot.items.find((d) => d.itemKey === item.question.itemKey);
      if (match) {
        item.question.origin = match.origin;
        item.question.templateId = match.templateId;
        item.question.stageId = match.stageId;
      }
      if (item.nextQuestionWhy?.nextItemKey) {
        const nm = ledger.debugSnapshot.items.find((d) => d.itemKey === item.nextQuestionWhy.nextItemKey);
        if (nm) {
          item.nextQuestionWhy.origin = nm.origin;
          item.nextQuestionWhy.templateId = nm.templateId;
          item.nextQuestionWhy.stageId = nm.stageId;
        }
      }
    }
  } catch (e) {
    ledger.notes.push(`debug fetch failed: ${e.message}`);
  }

  ledger.endedAt = new Date().toISOString();
  ledger.sessionStatus = lastStepResult?.sessionStatus ?? null;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${runId}.json`);
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2));
  return { file, ledger };
}

// ─── Scenario planners ─────────────────────────────────────────────────────

function isEntry(key) {
  return key === "ENTRY_TWO_STEP" || key?.startsWith("GEN_TWO_STEP");
}
function isVarBoth(key) {
  return key === "ENTRY_VARIABLE_BOTH" || key?.startsWith("GEN_VAR_BOTH");
}
function isNegMain(key) {
  return (
    key === "NEG_DIST_MAIN" ||
    (key?.startsWith("GEN_NEG_DIST_") && !key?.startsWith("GEN_NEG_DIST_BARE") && !key?.startsWith("GEN_TRANSFER"))
  );
}
function isContrast(key) {
  return key === "NEG_DIST_CONTRAST" || key?.startsWith("GEN_NEG_DIST_BARE");
}
function isTransfer(key) {
  return key === "TRANSFER_NEG_DIST" || key?.startsWith("GEN_TRANSFER_NEG_DIST");
}

/** Solve entry two-step correctly. */
function correctTwoStep(ctx) {
  if (ctx.stepIndexOnItem === 0) return { intent: "correct", submittedLine: "3x = 15" };
  if (ctx.stepIndexOnItem === 1) return { intent: "correct", submittedLine: "x = 5" };
  return { done: true };
}

/** Solve var-both correctly. */
function correctVarBoth(ctx) {
  if (ctx.stepIndexOnItem === 0) return { intent: "correct", submittedLine: "2x = 16" };
  if (ctx.stepIndexOnItem === 1) return { intent: "correct", submittedLine: "x = 8" };
  return { done: true };
}

/** Canonical Arun sign error then review then maybe finish or leave. */
function arunSignErrorThenStuck(ctx) {
  if (ctx.stepIndexOnItem === 0) {
    return { intent: "wrong_sign_product", submittedLine: "-2x - 10 + 3 = 11" };
  }
  // After invalid, try same wrong again or give up — trigger assistance ladder
  if (ctx.stepIndexOnItem === 1) {
    return { intent: "wrong_sign_product_retry", submittedLine: "-2x - 10 + 3 = 11" };
  }
  return { done: true };
}

/** Correct neg-dist main path for fixed item -2(x-5)+3=11 → x=1 */
function correctNegMain(ctx) {
  const lines = ["-2x + 10 + 3 = 11", "-2x + 13 = 11", "-2x = -2", "x = 1"];
  if (ctx.stepIndexOnItem < lines.length) {
    return { intent: "correct", submittedLine: lines[ctx.stepIndexOnItem] };
  }
  return { done: true };
}

/** Correct until last step, then bare number. */
function bareFinalAnswer(ctx) {
  const lines = ["-2x + 10 + 3 = 11", "-2x + 13 = 11", "-2x = -2"];
  if (ctx.stepIndexOnItem < lines.length) {
    return { intent: "correct", submittedLine: lines[ctx.stepIndexOnItem] };
  }
  if (ctx.stepIndexOnItem === lines.length) {
    return { intent: "bare_number_final", submittedLine: "1" };
  }
  // If still not complete, try proper form
  if (ctx.stepIndexOnItem === lines.length + 1) {
    return { intent: "correct_after_bare", submittedLine: "x = 1" };
  }
  return { done: true };
}

function correctBareContrast(ctx) {
  // Fixed contrast -3(y-4) → -3y + 12
  if (ctx.stepIndexOnItem === 0) return { intent: "correct", submittedLine: "-3y + 12" };
  return { done: true };
}

function gibberishThenDontKnow(ctx) {
  if (ctx.stepIndexOnItem === 0) {
    return { intent: "gibberish", submittedLine: "um i think ?? x" };
  }
  if (ctx.stepIndexOnItem === 1) {
    return { intent: "dont_know", dontKnow: true };
  }
  if (ctx.stepIndexOnItem === 2) {
    return { intent: "dont_know_again", dontKnow: true };
  }
  return { done: true };
}

function wrongPartialDistribute(ctx) {
  // multiplier on first term only
  if (ctx.stepIndexOnItem === 0) {
    return { intent: "wrong_incomplete_distribution", submittedLine: "-2x - 5 + 3 = 11" };
  }
  if (ctx.stepIndexOnItem === 1) {
    return { intent: "wrong_incomplete_retry", submittedLine: "-2x - 5 + 3 = 11" };
  }
  return { done: true };
}

function droppedConstant(ctx) {
  if (ctx.stepIndexOnItem === 0) {
    return { intent: "wrong_dropped_outer_constant", submittedLine: "-2x + 10 = 11" };
  }
  if (ctx.stepIndexOnItem === 1) {
    // recover with correct expansion
    return { intent: "self_correct_expand", submittedLine: "-2x + 10 + 3 = 11" };
  }
  if (ctx.stepIndexOnItem === 2) return { intent: "correct", submittedLine: "-2x + 13 = 11" };
  if (ctx.stepIndexOnItem === 3) return { intent: "correct", submittedLine: "-2x = -2" };
  if (ctx.stepIndexOnItem === 4) return { intent: "correct", submittedLine: "x = 1" };
  return { done: true };
}

/**
 * Generic dispatcher: handle entry items correctly, then apply a neg-main behaviour.
 */
function makePlanner(negMainBehaviour, options = {}) {
  const { contrastBehaviour = correctBareContrast, afterContrast = "correct_transfer" } = options;
  let transferSteps = 0;

  return function planner(ctx) {
    const key = ctx.itemKey || ctx.attempt?.itemKey;

    if (isEntry(key)) return correctTwoStep(ctx);
    if (isVarBoth(key)) return correctVarBoth(ctx);

    if (isNegMain(key)) {
      // For generated neg-dist items, numbers differ — only drive fixed MAIN with scripted lines.
      if (key !== "NEG_DIST_MAIN" && !key?.startsWith("GEN_NEG_DIST_")) {
        return { done: true };
      }
      if (key.startsWith("GEN_") && key !== "NEG_DIST_MAIN") {
        // Generated: try dont_know twice to end item without hardcoding algebra
        if (ctx.stepIndexOnItem === 0) return { intent: "dont_know_on_generated", dontKnow: true };
        if (ctx.stepIndexOnItem === 1) return { intent: "dont_know_on_generated_2", dontKnow: true };
        return { done: true };
      }
      return negMainBehaviour(ctx);
    }

    if (isContrast(key)) {
      if (key === "NEG_DIST_CONTRAST") return contrastBehaviour(ctx);
      // generated bare
      if (ctx.stepIndexOnItem === 0) return { intent: "dont_know_generated_bare", dontKnow: true };
      if (ctx.stepIndexOnItem === 1) return { intent: "dont_know_generated_bare_2", dontKnow: true };
      return { done: true };
    }

    if (isTransfer(key)) {
      if (key === "TRANSFER_NEG_DIST") {
        // Fixed transfer -4(z-2)+3=19 → solution z=3? Let's compute: -4z+8+3=19 → -4z+11=19 → -4z=8 → z=-2
        // -4(z-2)+3=19 → -4z + 8 + 3 = 19 → -4z + 11 = 19 → -4z = 8 → z = -2
        const lines = ["-4z + 8 + 3 = 19", "-4z + 11 = 19", "-4z = 8", "z = -2"];
        if (afterContrast === "wrong_transfer_sign") {
          if (transferSteps === 0) {
            transferSteps++;
            return { intent: "wrong_sign_on_transfer", submittedLine: "-4z - 8 + 3 = 19" };
          }
          if (transferSteps === 1) {
            transferSteps++;
            return { intent: "wrong_sign_on_transfer_retry", submittedLine: "-4z - 8 + 3 = 19" };
          }
          return { done: true };
        }
        if (ctx.stepIndexOnItem < lines.length) {
          return { intent: "correct", submittedLine: lines[ctx.stepIndexOnItem] };
        }
        return { done: true };
      }
      if (ctx.stepIndexOnItem === 0) return { intent: "dont_know_generated_transfer", dontKnow: true };
      if (ctx.stepIndexOnItem === 1) return { intent: "dont_know_generated_transfer_2", dontKnow: true };
      return { done: true };
    }

    // Unknown item — decline out
    if (ctx.stepIndexOnItem < 2) return { intent: "dont_know_unknown_item", dontKnow: true };
    return { done: true };
  };
}

const SCENARIOS = [
  {
    id: "arun_sign_error",
    label: "Canonical Arun sign error on main, then contrast+transfer",
    intent: "wrong_sign → contrast → transfer",
    planner: makePlanner(arunSignErrorThenStuck, { afterContrast: "correct_transfer" }),
  },
  {
    id: "bare_final_answer",
    label: "Correct until last line, submit bare 1 instead of x=1",
    intent: "format slip on final answer",
    planner: makePlanner(bareFinalAnswer),
  },
  {
    id: "gibberish_and_decline",
    label: "Gibberish then I don't know twice on main",
    intent: "unparseable + decline ladder",
    planner: makePlanner(gibberishThenDontKnow),
  },
  {
    id: "incomplete_distribution",
    label: "Multiplier on first term only (not sign product)",
    intent: "INCOMPLETE_DISTRIBUTION path",
    planner: makePlanner(wrongPartialDistribute),
  },
  {
    id: "dropped_constant_then_recover",
    label: "Drop +3, then self-correct and finish",
    intent: "OUTER_CONSTANT_DROPPED + recovery",
    planner: makePlanner(droppedConstant),
  },
  {
    id: "all_correct_path",
    label: "All correct through main (may skip contrast)",
    intent: "happy path",
    planner: makePlanner(correctNegMain),
  },
  {
    id: "arun_then_wrong_transfer",
    label: "Arun error, correct contrast, wrong sign on transfer",
    intent: "gap persists into transfer",
    planner: makePlanner(arunSignErrorThenStuck, { afterContrast: "wrong_transfer_sign" }),
  },
];

async function main() {
  // health check
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API health failed: ${health.status}`);

  const manifest = {
    collectedAt: new Date().toISOString(),
    api: API,
    studentId: STUDENT_ID,
    runs: [],
  };

  for (const s of SCENARIOS) {
    process.stdout.write(`Collecting ${s.id}… `);
    try {
      const { file, ledger } = await runScenario(s, s.planner);
      manifest.runs.push({
        runId: ledger.runId,
        scenarioId: s.id,
        file: path.relative(path.join(__dirname), file),
        sessionId: ledger.sessionId,
        itemCount: ledger.items.length,
        sessionStatus: ledger.sessionStatus,
        notes: ledger.notes,
      });
      console.log(`ok (${ledger.items.length} items) → ${path.basename(file)}`);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      manifest.runs.push({ scenarioId: s.id, error: String(e.message || e) });
    }
    await sleep(800);
  }

  const indexPath = path.join(__dirname, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest → ${indexPath}`);
  console.log(`Runs dir → ${OUT_DIR}`);
  console.log("Store only — no evaluation written.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
