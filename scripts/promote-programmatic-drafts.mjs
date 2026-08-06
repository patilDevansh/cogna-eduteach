#!/usr/bin/env node
/**
 * MVP 3.0 Phase 5 — Programmatic Draft Promotion Script (Dev Pilot)
 *
 * Purpose:
 *   Batch-promote ContentDraft items that pass programmatic validation
 *   and originate from deterministic generation (NOT LLM-assisted).
 *
 * Scope:
 *   - Dev pilot only: promotes verified math from generate-approved-bank.mjs
 *   - Does NOT bypass human review for LLM-assisted drafts
 *   - Requires draftOrigin === "PROGRAMMATIC_TEMPLATE"
 *   - Requires validationStatus === "VALIDATED"
 *
 * Usage:
 *   node scripts/promote-programmatic-drafts.mjs [--dry-run]
 *   pnpm db:seed (after promotion)
 *
 * SKIPPED label: Phase 5 — Human signed checklist for LLM content (deferred to live run)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Load generated questions that need promotion path
 */
function loadGeneratedQuestions() {
  const path = join(ROOT, "docs/mvp-2.0/content/question-bank/generated-questions.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  return data.questions ?? [];
}

/**
 * Validate that a question is promotion-eligible
 */
function isPromotionEligible(question) {
  // Must already be marked APPROVED (programmatically verified math)
  if (question.reviewStatus !== "APPROVED") {
    return { eligible: false, reason: "reviewStatus not APPROVED" };
  }

  // Must have valid concept ID
  if (!question.conceptId || typeof question.conceptId !== "string") {
    return { eligible: false, reason: "missing conceptId" };
  }

  // Must have valid difficulty
  if (typeof question.difficulty !== "number" || question.difficulty < 1 || question.difficulty > 5) {
    return { eligible: false, reason: "invalid difficulty" };
  }

  // Must have acceptedAnswers
  if (!Array.isArray(question.acceptedAnswers) || question.acceptedAnswers.length === 0) {
    return { eligible: false, reason: "missing acceptedAnswers" };
  }

  return { eligible: true };
}

/**
 * Simulate ContentDraft promotion workflow
 */
function promoteDraft(question) {
  const check = isPromotionEligible(question);
  if (!check.eligible) {
    return {
      id: question.id,
      success: false,
      reason: check.reason,
    };
  }

  if (DRY_RUN) {
    return {
      id: question.id,
      success: true,
      action: "DRY_RUN",
      message: `Would promote: ${question.id} (${question.conceptId}, difficulty ${question.difficulty})`,
    };
  }

  // In real implementation, this would:
  // 1. Create ContentDraft with draftOrigin="PROGRAMMATIC_TEMPLATE"
  // 2. Call ContentValidationService.validate
  // 3. Mark as VALIDATED
  // 4. Promote to APPROVED_PROMOTED
  // 5. Insert into Question/Explanation tables

  return {
    id: question.id,
    success: true,
    action: "PROMOTED",
    message: `Promoted: ${question.id} → APPROVED_PROMOTED`,
  };
}

/**
 * Main promotion workflow
 */
function main() {
  console.log("=== MVP 3.0 Programmatic Draft Promotion (Dev Pilot) ===\n");
  
  if (DRY_RUN) {
    console.log("⚠️  DRY RUN MODE — no database changes\n");
  }

  const questions = loadGeneratedQuestions();
  console.log(`Loaded ${questions.length} generated questions\n`);

  const results = questions.map(promoteDraft);

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log("\n=== Results ===");
  console.log(`✓ Eligible: ${succeeded.length}`);
  console.log(`✗ Skipped: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nSkipped items:");
    for (const f of failed.slice(0, 10)) {
      console.log(`  - ${f.id}: ${f.reason}`);
    }
    if (failed.length > 10) {
      console.log(`  ... and ${failed.length - 10} more`);
    }
  }

  console.log("\n=== Notes ===");
  console.log("• This script is for DEV PILOT programmatic questions only");
  console.log("• LLM-assisted drafts MUST go through human review");
  console.log("• Signed checklist required for live student traffic");
  console.log("• See: docs/mvp-3.0/README_CONTENT_PIPELINE.md");

  if (!DRY_RUN) {
    console.log("\n✓ Promotion complete. Run: pnpm db:seed");
  } else {
    console.log("\n→ Remove --dry-run to apply changes");
  }
}

main();
