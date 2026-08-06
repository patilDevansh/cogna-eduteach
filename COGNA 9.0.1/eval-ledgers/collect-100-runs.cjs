#!/usr/bin/env node
/**
 * Collect 100 varied diagnostic-v2 eval ledgers (store only — no evaluation).
 * Appends to runs/ and writes index-100.json (+ updates index.json).
 *
 * Usage: node "COGNA 9.0.1/eval-ledgers/collect-100-runs.cjs"
 */
const fs = require("fs");
const path = require("path");

const API = process.env.API_URL || "http://localhost:3001";
const STUDENT_ID = process.env.STUDENT_ID || "cmriwinvg00d9y2c1v0sq9wkv";
const OUT_DIR = path.join(__dirname, "runs");
const TARGET = Number(process.env.EVAL_COUNT || 100);

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
    throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startSession() {
  return api("POST", "/diagnostic-v2/sessions", { studentId: STUDENT_ID });
}
async function submitStep(sessionId, payload) {
  return api("POST", `/diagnostic-v2/sessions/${sessionId}/steps`, payload);
}
async function getDebug(sessionId) {
  return api("GET", `/diagnostic-v2/sessions/${sessionId}`);
}

function isEntry(key) {
  return key === "ENTRY_TWO_STEP" || key?.startsWith("GEN_TWO_STEP");
}
function isVarBoth(key) {
  return key === "ENTRY_VARIABLE_BOTH" || key?.startsWith("GEN_VAR_BOTH");
}
function isNegMain(key) {
  return (
    key === "NEG_DIST_MAIN" ||
    (key?.startsWith("GEN_NEG_DIST_") &&
      !key?.startsWith("GEN_NEG_DIST_BARE") &&
      !key?.includes("TRANSFER"))
  );
}
function isContrast(key) {
  return key === "NEG_DIST_CONTRAST" || key?.startsWith("GEN_NEG_DIST_BARE");
}
function isTransfer(key) {
  return key === "TRANSFER_NEG_DIST" || key?.startsWith("GEN_TRANSFER_NEG_DIST");
}

// Fixed-item scripted lines
const NEG_MAIN_CORRECT = ["-2x + 10 + 3 = 11", "-2x + 13 = 11", "-2x = -2", "x = 1"];
const TRANSFER_CORRECT = ["-4z + 8 + 3 = 19", "-4z + 11 = 19", "-4z = 8", "z = -2"];

const ENTRY_BEHAVIOURS = ["correct", "wrong_then_correct", "decline_twice"];
const VAR_BEHAVIOURS = ["correct", "wrong_then_correct", "decline_twice"];
const MAIN_BEHAVIOURS = [
  "correct",
  "arun_sign_twice",
  "incomplete_dist_twice",
  "outer_sign_twice",
  "dropped_constant_recover",
  "bare_final",
  "gibberish_then_decline",
  "decline_twice",
  "arun_then_correct",
  "jump_to_answer_wrong",
];
const CONTRAST_BEHAVIOURS = ["correct", "wrong_then_correct", "decline_twice", "wrong_twice"];
const TRANSFER_BEHAVIOURS = ["correct", "arun_sign_twice", "decline_twice", "bare_final_z"];

function buildScenarios(n) {
  const out = [];
  let i = 0;
  // Exhaust combinations in nested loops until we have n
  outer: for (const entry of ENTRY_BEHAVIOURS) {
    for (const varBoth of VAR_BEHAVIOURS) {
      for (const main of MAIN_BEHAVIOURS) {
        for (const contrast of CONTRAST_BEHAVIOURS) {
          for (const transfer of TRANSFER_BEHAVIOURS) {
            if (out.length >= n) break outer;
            i += 1;
            out.push({
              id: `mix_${String(i).padStart(3, "0")}_${entry}_${varBoth}_${main}_${contrast}_${transfer}`.slice(
                0,
                120,
              ),
              label: `E=${entry} V=${varBoth} M=${main} C=${contrast} T=${transfer}`,
              intent: { entry, varBoth, main, contrast, transfer },
            });
          }
        }
      }
    }
  }
  // If somehow short, pad with shuffled mains
  while (out.length < n) {
    const main = MAIN_BEHAVIOURS[out.length % MAIN_BEHAVIOURS.length];
    out.push({
      id: `mix_pad_${out.length + 1}_${main}`,
      label: `pad main=${main}`,
      intent: {
        entry: "correct",
        varBoth: "correct",
        main,
        contrast: "correct",
        transfer: "correct",
      },
    });
  }
  return out.slice(0, n);
}

function stepFromBehaviour(kind, itemKind, stepIndex, lastValidity) {
  // Returns { intent, submittedLine?, dontKnow? } | null if should stop item early (caller decides done)

  if (itemKind === "entry") {
    if (kind === "correct") {
      if (stepIndex === 0) return { intent: "correct", submittedLine: "3x = 15" };
      if (stepIndex === 1) return { intent: "correct", submittedLine: "x = 5" };
      return null;
    }
    if (kind === "wrong_then_correct") {
      if (stepIndex === 0) return { intent: "wrong", submittedLine: "3x = 20" };
      if (stepIndex === 1) return { intent: "correct", submittedLine: "3x = 15" };
      if (stepIndex === 2) return { intent: "correct", submittedLine: "x = 5" };
      return null;
    }
    if (kind === "decline_twice") {
      if (stepIndex === 0) return { intent: "dont_know", dontKnow: true };
      if (stepIndex === 1) return { intent: "dont_know", dontKnow: true };
      return null;
    }
  }

  if (itemKind === "varBoth") {
    if (kind === "correct") {
      if (stepIndex === 0) return { intent: "correct", submittedLine: "2x = 16" };
      if (stepIndex === 1) return { intent: "correct", submittedLine: "x = 8" };
      return null;
    }
    if (kind === "wrong_then_correct") {
      if (stepIndex === 0) return { intent: "wrong", submittedLine: "4x = 16" };
      if (stepIndex === 1) return { intent: "correct", submittedLine: "2x = 16" };
      if (stepIndex === 2) return { intent: "correct", submittedLine: "x = 8" };
      return null;
    }
    if (kind === "decline_twice") {
      if (stepIndex === 0) return { intent: "dont_know", dontKnow: true };
      if (stepIndex === 1) return { intent: "dont_know", dontKnow: true };
      return null;
    }
  }

  if (itemKind === "negMain") {
    if (kind === "correct") {
      if (stepIndex < NEG_MAIN_CORRECT.length)
        return { intent: "correct", submittedLine: NEG_MAIN_CORRECT[stepIndex] };
      return null;
    }
    if (kind === "arun_sign_twice") {
      if (stepIndex === 0)
        return { intent: "wrong_sign_product", submittedLine: "-2x - 10 + 3 = 11" };
      if (stepIndex === 1)
        return { intent: "wrong_sign_product_retry", submittedLine: "-2x - 10 + 3 = 11" };
      return null;
    }
    if (kind === "incomplete_dist_twice") {
      if (stepIndex === 0)
        return { intent: "wrong_incomplete_distribution", submittedLine: "-2x - 5 + 3 = 11" };
      if (stepIndex === 1)
        return { intent: "wrong_incomplete_retry", submittedLine: "-2x - 5 + 3 = 11" };
      return null;
    }
    if (kind === "outer_sign_twice") {
      if (stepIndex === 0)
        return { intent: "wrong_outer_sign", submittedLine: "2x - 10 + 3 = 11" };
      if (stepIndex === 1)
        return { intent: "wrong_outer_sign_retry", submittedLine: "2x - 10 + 3 = 11" };
      return null;
    }
    if (kind === "dropped_constant_recover") {
      if (stepIndex === 0)
        return { intent: "wrong_dropped_constant", submittedLine: "-2x + 10 = 11" };
      if (stepIndex === 1)
        return { intent: "self_correct", submittedLine: "-2x + 10 + 3 = 11" };
      if (stepIndex >= 2 && stepIndex < 2 + 3)
        return { intent: "correct", submittedLine: NEG_MAIN_CORRECT[stepIndex - 1] };
      // stepIndex 2 → NEG_MAIN_CORRECT[1], etc. Better explicit:
      return null;
    }
    if (kind === "dropped_constant_recover") {
      /* unreachable duplicate - fixed below */
    }
    if (kind === "bare_final") {
      if (stepIndex < 3) return { intent: "correct", submittedLine: NEG_MAIN_CORRECT[stepIndex] };
      if (stepIndex === 3) return { intent: "bare_number_final", submittedLine: "1" };
      if (stepIndex === 4) return { intent: "correct_after_bare", submittedLine: "x = 1" };
      return null;
    }
    if (kind === "gibberish_then_decline") {
      if (stepIndex === 0) return { intent: "gibberish", submittedLine: "um i think ?? x" };
      if (stepIndex === 1) return { intent: "dont_know", dontKnow: true };
      if (stepIndex === 2) return { intent: "dont_know", dontKnow: true };
      return null;
    }
    if (kind === "decline_twice") {
      if (stepIndex === 0) return { intent: "dont_know", dontKnow: true };
      if (stepIndex === 1) return { intent: "dont_know", dontKnow: true };
      return null;
    }
    if (kind === "arun_then_correct") {
      if (stepIndex === 0)
        return { intent: "wrong_sign_product", submittedLine: "-2x - 10 + 3 = 11" };
      if (stepIndex === 1)
        return { intent: "self_correct_expand", submittedLine: "-2x + 10 + 3 = 11" };
      if (stepIndex === 2) return { intent: "correct", submittedLine: "-2x + 13 = 11" };
      if (stepIndex === 3) return { intent: "correct", submittedLine: "-2x = -2" };
      if (stepIndex === 4) return { intent: "correct", submittedLine: "x = 1" };
      return null;
    }
    if (kind === "jump_to_answer_wrong") {
      if (stepIndex === 0) return { intent: "jump_wrong_answer", submittedLine: "x = -2" };
      if (stepIndex === 1) return { intent: "jump_wrong_retry", submittedLine: "x = 0" };
      return null;
    }
  }

  if (itemKind === "contrast") {
    if (kind === "correct") {
      if (stepIndex === 0) return { intent: "correct", submittedLine: "-3y + 12" };
      return null;
    }
    if (kind === "wrong_then_correct") {
      if (stepIndex === 0) return { intent: "wrong", submittedLine: "-3y - 12" };
      if (stepIndex === 1) return { intent: "correct", submittedLine: "-3y + 12" };
      return null;
    }
    if (kind === "decline_twice") {
      if (stepIndex === 0) return { intent: "dont_know", dontKnow: true };
      if (stepIndex === 1) return { intent: "dont_know", dontKnow: true };
      return null;
    }
    if (kind === "wrong_twice") {
      if (stepIndex === 0) return { intent: "wrong", submittedLine: "-3y - 12" };
      if (stepIndex === 1) return { intent: "wrong_retry", submittedLine: "3y + 12" };
      return null;
    }
  }

  if (itemKind === "transfer") {
    if (kind === "correct") {
      if (stepIndex < TRANSFER_CORRECT.length)
        return { intent: "correct", submittedLine: TRANSFER_CORRECT[stepIndex] };
      return null;
    }
    if (kind === "arun_sign_twice") {
      if (stepIndex === 0)
        return { intent: "wrong_sign_product", submittedLine: "-4z - 8 + 3 = 19" };
      if (stepIndex === 1)
        return { intent: "wrong_sign_product_retry", submittedLine: "-4z - 8 + 3 = 19" };
      return null;
    }
    if (kind === "decline_twice") {
      if (stepIndex === 0) return { intent: "dont_know", dontKnow: true };
      if (stepIndex === 1) return { intent: "dont_know", dontKnow: true };
      return null;
    }
    if (kind === "bare_final_z") {
      if (stepIndex < 3) return { intent: "correct", submittedLine: TRANSFER_CORRECT[stepIndex] };
      if (stepIndex === 3) return { intent: "bare_number_final", submittedLine: "-2" };
      if (stepIndex === 4) return { intent: "correct_after_bare", submittedLine: "z = -2" };
      return null;
    }
  }

  // Generated / unknown: decline out
  if (stepIndex < 2) return { intent: "dont_know_generated", dontKnow: true };
  return null;
}

// Fix dropped_constant_recover properly in a dedicated branch override
function stepNegMainDroppedRecover(stepIndex) {
  if (stepIndex === 0) return { intent: "wrong_dropped_constant", submittedLine: "-2x + 10 = 11" };
  if (stepIndex === 1) return { intent: "self_correct", submittedLine: "-2x + 10 + 3 = 11" };
  if (stepIndex === 2) return { intent: "correct", submittedLine: "-2x + 13 = 11" };
  if (stepIndex === 3) return { intent: "correct", submittedLine: "-2x = -2" };
  if (stepIndex === 4) return { intent: "correct", submittedLine: "x = 1" };
  return null;
}

function makePlanner(intent) {
  return function planner(ctx) {
    const key = ctx.itemKey || ctx.attempt?.itemKey;
    let itemKind = null;
    let kind = null;

    if (isEntry(key)) {
      itemKind = "entry";
      kind = intent.entry;
    } else if (isVarBoth(key)) {
      itemKind = "varBoth";
      kind = intent.varBoth;
    } else if (isNegMain(key)) {
      if (key !== "NEG_DIST_MAIN") {
        // generated — decline
        if (ctx.stepIndexOnItem < 2) return { intent: "dont_know_generated_main", dontKnow: true };
        return { done: true };
      }
      itemKind = "negMain";
      kind = intent.main;
      if (kind === "dropped_constant_recover") {
        const s = stepNegMainDroppedRecover(ctx.stepIndexOnItem);
        return s || { done: true };
      }
    } else if (isContrast(key)) {
      if (key !== "NEG_DIST_CONTRAST") {
        if (ctx.stepIndexOnItem < 2) return { intent: "dont_know_generated_contrast", dontKnow: true };
        return { done: true };
      }
      itemKind = "contrast";
      kind = intent.contrast;
    } else if (isTransfer(key)) {
      if (key !== "TRANSFER_NEG_DIST") {
        if (ctx.stepIndexOnItem < 2) return { intent: "dont_know_generated_transfer", dontKnow: true };
        return { done: true };
      }
      itemKind = "transfer";
      kind = intent.transfer;
    } else {
      if (ctx.stepIndexOnItem < 2) return { intent: "dont_know_unknown", dontKnow: true };
      return { done: true };
    }

    const s = stepFromBehaviour(kind, itemKind, ctx.stepIndexOnItem, ctx.lastStepResult?.validity);
    return s || { done: true };
  };
}

async function runScenario(scenario) {
  const planner = makePlanner(scenario.intent);
  const startedAt = new Date().toISOString();
  const start = await startSession();
  const runId = `run100_${startedAt.replace(/[:.]/g, "-")}_${scenario.id}`.slice(0, 180);
  const ledger = {
    runId,
    batch: "100-varied",
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

  while (guard++ < 50) {
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
      ledger.notes.push(`submit failed: ${e.message}`);
      break;
    }

    currentItem.steps.push({
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
    });
    lastStepResult = result;
    stepIndexOnItem += 1;

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

      if (result.sessionStatus === "COMPLETE" || result.sessionStatus === "COMPLETED" || !result.nextAttempt) {
        break;
      }

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
      await sleep(200);
      continue;
    }
  }

  if (currentItem.steps.length && !ledger.items.find((i) => i.ord === currentItem.ord)) {
    ledger.items.push(currentItem);
  }

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
    for (const item of ledger.items) {
      const match = ledger.debugSnapshot.items.find((d) => d.itemKey === item.question.itemKey);
      if (match) {
        item.question.origin = match.origin;
        item.question.templateId = match.templateId;
        item.question.stageId = match.stageId;
      }
      if (item.nextQuestionWhy?.nextItemKey) {
        const nm = ledger.debugSnapshot.items.find(
          (d) => d.itemKey === item.nextQuestionWhy.nextItemKey,
        );
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

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API health failed: ${health.status}`);

  const scenarios = buildScenarios(TARGET);
  console.log(`Collecting ${scenarios.length} varied runs → ${OUT_DIR}`);

  const manifest = {
    collectedAt: new Date().toISOString(),
    batch: "100-varied",
    target: TARGET,
    api: API,
    studentId: STUDENT_ID,
    runs: [],
    failed: [],
  };

  const progressPath = path.join(__dirname, "progress-100.json");

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const n = i + 1;
    process.stdout.write(`[${n}/${scenarios.length}] ${s.id.slice(0, 70)}… `);
    try {
      const { file, ledger } = await runScenario(s);
      const entry = {
        runId: ledger.runId,
        scenarioId: s.id,
        file: path.relative(__dirname, file),
        sessionId: ledger.sessionId,
        itemCount: ledger.items.length,
        sessionStatus: ledger.sessionStatus,
        intent: s.intent,
        notes: ledger.notes,
      };
      manifest.runs.push(entry);
      console.log(`ok items=${ledger.items.length}`);
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      manifest.failed.push({ scenarioId: s.id, error: String(e.message || e) });
    }
    fs.writeFileSync(progressPath, JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2));
    await sleep(300);
  }

  manifest.finishedAt = new Date().toISOString();
  const index100 = path.join(__dirname, "index-100.json");
  fs.writeFileSync(index100, JSON.stringify(manifest, null, 2));

  // Merge into index.json for discoverability
  const indexPath = path.join(__dirname, "index.json");
  let prior = { runs: [] };
  try {
    prior = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch {
    /* empty */
  }
  const merged = {
    ...prior,
    lastBatch: "100-varied",
    lastBatchAt: manifest.finishedAt,
    batch100: {
      file: "index-100.json",
      collected: manifest.runs.length,
      failed: manifest.failed.length,
      target: TARGET,
    },
    runs: [...(prior.runs || []), ...manifest.runs],
  };
  fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2));

  console.log(`\nDone. ${manifest.runs.length} stored, ${manifest.failed.length} failed.`);
  console.log(`Manifest → ${index100}`);
  console.log("Store only — no evaluation written.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
