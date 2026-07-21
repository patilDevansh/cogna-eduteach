#!/usr/bin/env node
/**
 * Validate the live MVP 1.0 question bank against the MVP 2.0 content manifest.
 *
 * Usage:
 *   node scripts/validate-content-manifest.mjs
 *   pnpm test:content
 *
 * Hard failures (exit 1): duplicate IDs, missing required fields, unknown/rejected concept IDs.
 * Soft warning (exit 0): JSON APPROVED count < manifest.targetApproved.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUESTIONS_PATH = join(ROOT, "docs/mvp-1.0/content/question-bank/questions.json");
const GENERATED_PATH = join(ROOT, "docs/mvp-2.0/content/question-bank/generated-questions.json");
const HANDCRAFTED_PATH = join(ROOT, "docs/mvp-2.0/content/question-bank/handcrafted-100.json");
const IDENTITIES_PATH = join(ROOT, "docs/mvp-6.0/content/question-bank/questions.json");
const IDENTITIES_GENERATED_PATH = join(ROOT, "docs/mvp-6.0/content/question-bank/generated-questions.json");
const FACTORISATION_PATH = join(ROOT, "docs/mvp-7.0/content/question-bank/questions.json");
const FACTORISATION_GENERATED_PATH = join(ROOT, "docs/mvp-7.0/content/question-bank/generated-questions.json");
const EXPONENTS_PATH = join(ROOT, "docs/mvp-8.0/content/question-bank/questions.json");
const EXPONENTS_GENERATED_PATH = join(ROOT, "docs/mvp-8.0/content/question-bank/generated-questions.json");
const RATIONAL_PATH = join(ROOT, "docs/mvp-9.0/content/question-bank/questions.json");
const RATIONAL_GENERATED_PATH = join(ROOT, "docs/mvp-9.0/content/question-bank/generated-questions.json");
const MANIFEST_PATH = join(ROOT, "docs/mvp-2.0/content/question-bank/manifest.json");

/** Canonical concept IDs (MVP 1.0 IDs kept for MVP 2.0, plus the MVP 6.0-9.0 units). */
const KNOWN_CONCEPT_IDS = new Set([
  "P1_INTEGER_ADD_SUB",
  "P2_NEGATIVE_OPS",
  "P3_VARIABLES_CONSTANTS",
  "P4_SIMPLE_EXPRESSIONS",
  "P5_EQUALITY_BALANCE",
  "C1_ONE_STEP_ADDITION",
  "C2_ONE_STEP_SUBTRACTION",
  "C3_ONE_STEP_MULTIPLICATION",
  "C4_ONE_STEP_DIVISION",
  "C5_TWO_STEP_EQUATIONS",
  "C6_SIMPLE_WORD_PROBLEMS",
  "C7_VARIABLE_BOTH_SIDES",
  "C8_FRACTIONAL_COEFFICIENTS",
  "ID_P1_TERM_BASICS",
  "ID_P2_BINOMIAL_MULTIPLICATION",
  "ID_C1_SQUARE_OF_SUM",
  "ID_C2_SQUARE_OF_DIFFERENCE",
  "ID_C3_DIFFERENCE_OF_SQUARES",
  "ID_C4_TWO_BINOMIAL_IDENTITY",
  "ID_C5_MENTAL_MATH_APPLICATION",
  "FAC_P1_MONOMIAL_FACTORS",
  "FAC_C1_COMMON_FACTOR",
  "FAC_C2_REGROUPING",
  "FAC_C3_IDENTITY_BASED",
  "FAC_C4_TRINOMIAL",
  "FAC_C5_DIVISION_CHECK",
  "EXP_P1_LAWS_OF_EXPONENTS",
  "EXP_C1_NEGATIVE_EXPONENTS",
  "EXP_C2_EXPONENTS_IN_SIMPLIFICATION",
  "RAT_P1_VARIABLES_IN_FRACTIONS",
  "RAT_C1_SIMPLIFYING_ALGEBRAIC_FRACTIONS",
]);

/** Rejected aliases — must never appear in the bank. */
const REJECTED_CONCEPT_IDS = new Set(["P2_INTEGER_MUL_DIV", "C6_WORD_PROBLEMS"]);

/**
 * Mirror of packages/database/prisma/seed.ts MILESTONE_APPROVED_QUESTION_IDS.
 * Seed forces these to APPROVED even when JSON says PENDING_REVIEW.
 */
const SEED_APPROVED_OVERRIDE_IDS = new Set([
  "Q_C2_D1_001",
  "Q_C2_D2_001",
  "Q_C2_D2_002",
  "Q_C2_D3_001",
  "Q_C2_D4_001",
  "Q_C2_D2_003",
  "Q_C2_D2_R01",
  "Q_P1_D1_001",
  "Q_P1_D2_002",
  "Q_P3_D1_001",
  "Q_P4_D1_001",
  "Q_P5_D1_001",
  "Q_P5_D2_001",
  "Q_C1_D1_001",
  "Q_C3_D1_001",
  "Q_C5_D1_001",
  "Q_C5_D2_001",
]);

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && v.trim().length > 0);
}

function validateQuestion(q, index) {
  const errors = [];
  const label = q?.id ?? `index=${index}`;

  if (!q || typeof q !== "object") {
    return [`question[${index}]: not an object`];
  }
  if (typeof q.id !== "string" || !q.id.trim()) {
    errors.push(`${label}: missing id`);
  }
  if (typeof q.conceptId !== "string" || !q.conceptId.trim()) {
    errors.push(`${label}: missing conceptId`);
  } else if (REJECTED_CONCEPT_IDS.has(q.conceptId)) {
    errors.push(`${label}: rejected conceptId ${q.conceptId} (use P2_NEGATIVE_OPS / C6_SIMPLE_WORD_PROBLEMS)`);
  } else if (!KNOWN_CONCEPT_IDS.has(q.conceptId)) {
    errors.push(`${label}: unknown conceptId ${q.conceptId}`);
  }
  if (!isNonEmptyStringArray(q.acceptedAnswers)) {
    errors.push(`${label}: acceptedAnswers must be a non-empty string array`);
  }
  if (!isNonEmptyStringArray(q.solutionSteps)) {
    errors.push(`${label}: solutionSteps must be a non-empty string array`);
  }
  if (!isNonEmptyStringArray(q.hintLadder)) {
    errors.push(`${label}: hintLadder must be a non-empty string array`);
  }
  if (typeof q.stem !== "string" || !q.stem.trim()) {
    errors.push(`${label}: missing stem`);
  }
  if (typeof q.version !== "number") {
    errors.push(`${label}: missing numeric version`);
  }
  if (q.reviewStatus !== "APPROVED" && q.reviewStatus !== "PENDING_REVIEW") {
    errors.push(`${label}: reviewStatus must be APPROVED or PENDING_REVIEW (got ${q.reviewStatus})`);
  }

  return errors;
}

function main() {
  const hardErrors = [];
  const softWarnings = [];

  let questionsFile;
  let manifest;
  try {
    questionsFile = loadJson(QUESTIONS_PATH);
    try {
      const generated = loadJson(GENERATED_PATH);
      if (Array.isArray(generated?.questions)) {
        questionsFile.questions = [
          ...(questionsFile.questions ?? []),
          ...generated.questions,
        ];
      }
    } catch {
      // generated bank optional
    }
    try {
      const handcrafted = loadJson(HANDCRAFTED_PATH);
      if (Array.isArray(handcrafted?.questions)) {
        questionsFile.questions = [
          ...(questionsFile.questions ?? []),
          ...handcrafted.questions,
        ];
      }
    } catch {
      // handcrafted bank optional
    }
    try {
      const identities = loadJson(IDENTITIES_PATH);
      if (Array.isArray(identities?.questions)) {
        questionsFile.questions = [
          ...(questionsFile.questions ?? []),
          ...identities.questions,
        ];
      }
    } catch {
      // mvp-6.0 algebraic identities bank optional
    }
    try {
      const identitiesGenerated = loadJson(IDENTITIES_GENERATED_PATH);
      if (Array.isArray(identitiesGenerated?.questions)) {
        questionsFile.questions = [
          ...(questionsFile.questions ?? []),
          ...identitiesGenerated.questions,
        ];
      }
    } catch {
      // mvp-6.0 bulk-generated bank optional until scripts/generate-algebra-bank-v2.mjs runs
    }
    try {
      const factorisation = loadJson(FACTORISATION_PATH);
      if (Array.isArray(factorisation?.questions)) {
        questionsFile.questions = [
          ...(questionsFile.questions ?? []),
          ...factorisation.questions,
        ];
      }
    } catch {
      // mvp-7.0 factorisation bank optional
    }
    try {
      const factorisationGenerated = loadJson(FACTORISATION_GENERATED_PATH);
      if (Array.isArray(factorisationGenerated?.questions)) {
        questionsFile.questions = [
          ...(questionsFile.questions ?? []),
          ...factorisationGenerated.questions,
        ];
      }
    } catch {
      // mvp-7.0 bulk-generated bank optional until scripts/generate-factorisation-bank.mjs runs
    }
    try {
      const exponents = loadJson(EXPONENTS_PATH);
      if (Array.isArray(exponents?.questions)) {
        questionsFile.questions = [...(questionsFile.questions ?? []), ...exponents.questions];
      }
    } catch {
      // mvp-8.0 exponents bank optional
    }
    try {
      const exponentsGenerated = loadJson(EXPONENTS_GENERATED_PATH);
      if (Array.isArray(exponentsGenerated?.questions)) {
        questionsFile.questions = [...(questionsFile.questions ?? []), ...exponentsGenerated.questions];
      }
    } catch {
      // mvp-8.0 bulk-generated bank optional until scripts/generate-exponents-bank.mjs runs
    }
    try {
      const rational = loadJson(RATIONAL_PATH);
      if (Array.isArray(rational?.questions)) {
        questionsFile.questions = [...(questionsFile.questions ?? []), ...rational.questions];
      }
    } catch {
      // mvp-9.0 rational expressions bank optional
    }
    try {
      const rationalGenerated = loadJson(RATIONAL_GENERATED_PATH);
      if (Array.isArray(rationalGenerated?.questions)) {
        questionsFile.questions = [...(questionsFile.questions ?? []), ...rationalGenerated.questions];
      }
    } catch {
      // mvp-9.0 bulk-generated bank optional until scripts/generate-rational-bank.mjs runs
    }
    manifest = loadJson(MANIFEST_PATH);
  } catch (err) {
    console.error("Failed to read content files:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const questions = questionsFile?.questions;
  if (!Array.isArray(questions)) {
    console.error("questions.json: missing questions array");
    process.exit(1);
  }

  const seenIds = new Map();
  let approvedJson = 0;
  let pendingJson = 0;
  let otherStatus = 0;
  const coverageJson = Object.fromEntries([...KNOWN_CONCEPT_IDS].map((id) => [id, { approved: 0, pending: 0, total: 0 }]));
  const coverageSeed = Object.fromEntries([...KNOWN_CONCEPT_IDS].map((id) => [id, { approved: 0, pending: 0, total: 0 }]));

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    hardErrors.push(...validateQuestion(q, i));

    if (typeof q?.id === "string" && q.id) {
      if (seenIds.has(q.id)) {
        hardErrors.push(`duplicate question id ${q.id} (also at index ${seenIds.get(q.id)})`);
      } else {
        seenIds.set(q.id, i);
      }
    }

    const conceptId = q?.conceptId;
    if (KNOWN_CONCEPT_IDS.has(conceptId)) {
      coverageJson[conceptId].total++;
      coverageSeed[conceptId].total++;
    }

    if (q?.reviewStatus === "APPROVED") {
      approvedJson++;
      if (KNOWN_CONCEPT_IDS.has(conceptId)) coverageJson[conceptId].approved++;
    } else if (q?.reviewStatus === "PENDING_REVIEW") {
      pendingJson++;
      if (KNOWN_CONCEPT_IDS.has(conceptId)) coverageJson[conceptId].pending++;
    } else {
      otherStatus++;
    }

    const seedApproved = SEED_APPROVED_OVERRIDE_IDS.has(q?.id) || q?.reviewStatus === "APPROVED";
    if (KNOWN_CONCEPT_IDS.has(conceptId)) {
      if (seedApproved) coverageSeed[conceptId].approved++;
      else coverageSeed[conceptId].pending++;
    }
  }

  const seedOverrideHits = [...SEED_APPROVED_OVERRIDE_IDS].filter((id) => seenIds.has(id));
  const seedMissing = [...SEED_APPROVED_OVERRIDE_IDS].filter((id) => !seenIds.has(id));
  const approvedAfterSeed = questions.filter(
    (q) => SEED_APPROVED_OVERRIDE_IDS.has(q.id) || q.reviewStatus === "APPROVED",
  ).length;
  const pendingAfterSeed = questions.length - approvedAfterSeed;

  const targetApproved = typeof manifest.targetApproved === "number" ? manifest.targetApproved : null;
  if (targetApproved != null && approvedJson < targetApproved) {
    softWarnings.push(
      `JSON APPROVED (${approvedJson}) < targetApproved (${targetApproved}) — pilot freeze not met`,
    );
  }

  // Manifest coverage keys should match known set
  const manifestCoverage = manifest.coverage ?? {};
  for (const id of Object.keys(manifestCoverage)) {
    if (REJECTED_CONCEPT_IDS.has(id)) {
      hardErrors.push(`manifest coverage uses rejected conceptId ${id}`);
    } else if (!KNOWN_CONCEPT_IDS.has(id)) {
      hardErrors.push(`manifest coverage has unknown conceptId ${id}`);
    }
  }
  for (const id of KNOWN_CONCEPT_IDS) {
    if (!(id in manifestCoverage)) {
      softWarnings.push(`manifest coverage missing concept ${id}`);
    }
  }
  if (seedMissing.length) {
    softWarnings.push(
      `seed override IDs missing from bank: ${seedMissing.join(", ")}`,
    );
  }

  console.log("=== Cogna content manifest validation ===");
  console.log(`Questions file: ${QUESTIONS_PATH}`);
  console.log(`Manifest:       ${MANIFEST_PATH}`);
  console.log(`Total questions: ${questions.length}`);
  console.log("");
  console.log("--- Review status (JSON file) ---");
  console.log(`  APPROVED:        ${approvedJson}`);
  console.log(`  PENDING_REVIEW:  ${pendingJson}`);
  if (otherStatus) console.log(`  OTHER:           ${otherStatus}`);
  console.log("");
  console.log("--- Seed override note ---");
  console.log(
    `  Seed MILESTONE_APPROVED_QUESTION_IDS forces ${seedOverrideHits.length} questions to APPROVED at seed time`,
  );
  console.log(`  Effective after seed: APPROVED=${approvedAfterSeed}, PENDING=${pendingAfterSeed}`);
  console.log("");
  console.log("--- Coverage (JSON approved / seed-effective approved / total) ---");
  for (const id of KNOWN_CONCEPT_IDS) {
    const j = coverageJson[id];
    const s = coverageSeed[id];
    const target = manifestCoverage[id]?.target ?? "?";
    console.log(
      `  ${id}: jsonApproved=${j.approved} seedApproved=${s.approved} total=${j.total} target=${target}`,
    );
  }
  console.log("");

  if (hardErrors.length) {
    console.error(`HARD FAILURES (${hardErrors.length}):`);
    for (const e of hardErrors.slice(0, 50)) {
      console.error(`  ✗ ${e}`);
    }
    if (hardErrors.length > 50) {
      console.error(`  … and ${hardErrors.length - 50} more`);
    }
    process.exit(1);
  }

  if (softWarnings.length) {
    console.warn(`SOFT WARNINGS (${softWarnings.length}):`);
    for (const w of softWarnings) {
      console.warn(`  ⚠ ${w}`);
    }
  } else {
    console.log("No soft warnings.");
  }

  console.log("");
  console.log("✓ Content validation passed (hard checks)");
  process.exit(0);
}

main();
