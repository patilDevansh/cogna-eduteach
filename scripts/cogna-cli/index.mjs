#!/usr/bin/env node
/**
 * Cogna CLI scenario runner — HTTP integration tests against a running API.
 *
 * Usage:
 *   node scripts/cogna-cli/index.mjs list
 *   node scripts/cogna-cli/index.mjs run baseline-12-slot
 */
import { createClient } from "./lib/client.mjs";
import { assertLearningDecision } from "./lib/assert-decision.mjs";
import { uuid } from "./lib/uuid.mjs";
import * as baseline12Slot from "./scenarios/baseline-12-slot.mjs";
import * as sessionEndSummary from "./scenarios/session-end-summary.mjs";
import * as revisionQueueProposal from "./scenarios/revision-queue-proposal.mjs";
import * as idempotentRetry from "./scenarios/idempotent-retry.mjs";
import * as targetingExplanationRetest from "./scenarios/targeting-explanation-retest.mjs";
import * as skipQuestion from "./scenarios/skip-question.mjs";
import * as retentionReviewDue from "./scenarios/retention-review-due.mjs";
import * as weeklyReport from "./scenarios/weekly-report.mjs";
import * as fatigueBreak from "./scenarios/fatigue-break.mjs";
import * as explanationEffectiveness from "./scenarios/explanation-effectiveness.mjs";
import * as emailReportDelivery from "./scenarios/email-report-delivery.mjs";
import * as contentApprovalGate from "./scenarios/content-approval-gate.mjs";

const SCENARIOS = {
  [baseline12Slot.name]: baseline12Slot,
  [sessionEndSummary.name]: sessionEndSummary,
  [revisionQueueProposal.name]: revisionQueueProposal,
  [idempotentRetry.name]: idempotentRetry,
  [targetingExplanationRetest.name]: targetingExplanationRetest,
  [skipQuestion.name]: skipQuestion,
  [retentionReviewDue.name]: retentionReviewDue,
  [weeklyReport.name]: weeklyReport,
  [fatigueBreak.name]: fatigueBreak,
  [explanationEffectiveness.name]: explanationEffectiveness,
  [emailReportDelivery.name]: emailReportDelivery,
  [contentApprovalGate.name]: contentApprovalGate,
};

const log = (step, msg) => console.log(`[${step}] ${msg}`);

function printUsage() {
  console.log("Cogna CLI scenario runner\n");
  console.log("Usage:");
  console.log("  node scripts/cogna-cli/index.mjs list");
  console.log("  node scripts/cogna-cli/index.mjs run <scenarioName>\n");
  console.log("Environment:");
  console.log("  API_URL  (default http://localhost:3001)\n");
  console.log("Available scenarios:");
  for (const mod of Object.values(SCENARIOS)) {
    const tags = mod.mapsTo?.length ? ` [${mod.mapsTo.join(", ")}]` : "";
    console.log(`  ${mod.name}${tags}`);
    if (mod.description) console.log(`    ${mod.description}`);
  }
}

async function runScenario(name) {
  const mod = SCENARIOS[name];
  if (!mod) {
    console.error(`Unknown scenario: ${name}`);
    printUsage();
    process.exit(1);
  }

  const client = createClient();
  const started = Date.now();
  console.log(`\n▶ Running scenario: ${name}`);
  console.log(`  API: ${client.apiUrl}\n`);

  try {
    const result = await mod.run({
      client,
      assert: assertLearningDecision,
      uuid,
      log,
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n✓ ${name} passed (${elapsed}s)`);
    if (result.steps?.length) {
      console.log("\n--- STEPS ---");
      for (const s of result.steps) {
        console.log(`${s.status} ${s.step}: ${s.detail}`);
      }
    }
    process.exit(0);
  } catch (err) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`\n✗ ${name} failed (${elapsed}s)`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function main() {
  const [, , command, arg] = process.argv;

  if (!command || command === "list" || command === "--help" || command === "-h") {
    printUsage();
    process.exit(command === "list" || !command ? 0 : 0);
  }

  if (command === "run") {
    if (!arg) {
      console.error("Missing scenario name. Example: run baseline-12-slot");
      printUsage();
      process.exit(1);
    }
    await runScenario(arg);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
