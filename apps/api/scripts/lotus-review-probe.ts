#!/usr/bin/env node
/**
 * Step 2 (Cogna Project Hub, "Testing"): send wrong answers straight to
 * Lotus's four-call AI review (two independent assessments, a debate, a
 * closing call) and compare what it says with the expected cause.
 *
 * It uses the product's own review path (LotusService.runFullAnalysis) and
 * the product's own rule for turning the AI's finding into gap evidence
 * (evidenceFromAnalysis), with no session, browser or question writing.
 *
 * Free wiring check (pretend AI):
 *   cd apps/api && node --env-file=../../.env --env-file=../../packages/database/.env --import tsx scripts/lotus-review-probe.ts
 * Real AI (spends money; booked against the app's own spend caps):
 *   ... LOTUS_REVIEW_PROBE_MODE=live node ... (same command)
 * Env: LOTUS_REVIEW_PROBE_CASES=N01,M03 (subset), LOTUS_REVIEW_PROBE_OUT=path.json
 */
import { writeFile } from "node:fs/promises";
import { ConfigService } from "@nestjs/config";
import type { LotusDebateClosure, LotusQuestion, LotusStudentResponse } from "@cogna/shared";
import { PrismaClient } from "@cogna/database";
import { LotusService } from "../src/lotus/lotus.service";
import { LotusModelService } from "../src/lotus/lotus-model.service";
import { OpenAIService } from "../src/ai/openai.service";
import { setSpendStore } from "../src/ai/spend-cap";
import { PrismaSpendStore } from "../src/ai/prisma-spend-store";
import { evidenceFromAnalysis, instantVerdict } from "../src/lotus/lotus-factorisation";
import { REVIEW_CASES, type ReviewCase } from "./lotus-review-cases";

const LIVE = process.env.LOTUS_REVIEW_PROBE_MODE === "live";
const WANTED = new Set((process.env.LOTUS_REVIEW_PROBE_CASES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const OUT = process.env.LOTUS_REVIEW_PROBE_OUT;
const CONCURRENCY = 2;

function questionFor(c: ReviewCase): LotusQuestion {
  return {
    id: `review-probe-${c.id}`,
    phase: "DIAGNOSE",
    subtopic: c.skillId,
    prompt: c.prompt,
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "Step 2 review probe",
    answerKey: {
      kind: "OPEN_RESPONSE",
      canonicalAnswer: c.canonicalAnswer,
      workedSolution: c.workedSolution,
      // No predicted wrong answers: every wrong answer here is one code can't explain.
      diagnostics: { itemKind: c.itemKind, expression: c.expression, skillId: c.skillId, taggedSkills: [], stepSkills: c.stepSkills, predictedMistakes: [], origin: "AI" },
    },
  } as unknown as LotusQuestion;
}

/** Pretend AI for the free wiring check: always blames step 1. */
function fakeModels(): LotusModelService {
  const assessment = { mathJudgment: "INCORRECT", observations: ["fake"], hypotheses: [], phaseRecommendation: "DIAGNOSE", proposedAction: "ASK", conciseRationale: "fake" };
  return {
    primaryModel: "fake", challengerModel: "fake",
    assertReady() {},
    async primaryAssessment() { return assessment; },
    async challengerAssessment() { return assessment; },
    async primaryDebate() { return { agreements: [], disagreements: [], disagreementExample: "None.", acceptedImprovements: [], revisedConclusion: "fake", revisedAction: "ASK", revisedPhase: "DIAGNOSE" }; },
    async challengerClosure(): Promise<LotusDebateClosure> {
      return { verdict: "ACCEPTED", acceptedFromGpt: [], acceptedFromChallenger: [], rejectedClaims: [], conclusion: "fake", evidenceState: "PARTIAL", uncertainty: [], phase: "DIAGNOSE", action: "ASK", selectionReason: "fake", exitDiagnostic: false, firstWrongStep: 1, mistakeDescription: "fake" } as LotusDebateClosure;
    },
  } as unknown as LotusModelService;
}

async function reviewOne(service: LotusService, c: ReviewCase) {
  const question = questionFor(c);
  const response: LotusStudentResponse = { answer: c.answer, working: c.working, confidence: 60, responseTimeMs: 45_000, didNotKnow: false };
  const instant = instantVerdict(question, response);
  const startedAt = Date.now();
  const analysis = await (service as any).runFullAnalysis([], question, response, instant.verification, 300, 6, undefined, "FACTORISATION", undefined);
  const conclusion: LotusDebateClosure = analysis.conclusion;
  const evidence = evidenceFromAnalysis(question, [], conclusion.firstWrongStep, conclusion.mistakeDescription, conclusion.mistakeKind);
  const landedSkill = evidence[0]?.skillId ?? null;
  const shouldBeGap = c.nature === "CONCEPT";
  const lucky = c.nature === "LUCKY_CORRECT";
  // What the gap rules would receive from this answer.
  const skillVerdict = shouldBeGap || lucky
    ? (landedSkill && c.expectedSkills.includes(landedSkill) ? "RIGHT_SKILL" : landedSkill ? "WRONG_SKILL" : "NO_EVIDENCE")
    : (landedSkill ? "SLIP_COUNTED_AS_MISTAKE" : "CORRECTLY_NO_GAP_EVIDENCE");
  return {
    id: c.id, set: c.set, nature: c.nature, source: c.source, prompt: c.prompt, answer: c.answer, working: c.working,
    expectedCause: c.cause, expectedSkills: c.expectedSkills,
    codeVerdict: instant.verification?.status,
    firstWrongStep: conclusion.firstWrongStep ?? null,
    mistakeKind: conclusion.mistakeKind ?? null,
    landedSkill, skillVerdict,
    aiDescription: conclusion.mistakeDescription ?? "",
    aiConclusion: conclusion.conclusion,
    evidenceState: conclusion.evidenceState,
    uncertainty: conclusion.uncertainty,
    assessmentsAgreed: analysis.stageAgreement?.assessmentsAgreed,
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  };
}

async function main(): Promise<void> {
  const prisma = LIVE ? new PrismaClient() : null;
  let models: LotusModelService;
  if (LIVE) {
    setSpendStore(new PrismaSpendStore(prisma!));
    models = new LotusModelService(new OpenAIService(), new ConfigService());
  } else {
    models = fakeModels();
  }
  const service = new LotusService(models, null);
  const cases = REVIEW_CASES.filter((c) => WANTED.size === 0 || WANTED.has(c.id));
  console.log(`[plan] ${cases.length} case(s), ${LIVE ? "REAL AI" : "pretend AI"}`);

  const results: Awaited<ReturnType<typeof reviewOne>>[] = [];
  const failures: Array<{ id: string; error: string }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < cases.length) {
      const c = cases[next++]!;
      try {
        const r = await reviewOne(service, c);
        results.push(r);
        console.log(`[${r.id}] ${r.skillVerdict} · ${r.mistakeKind} · step ${r.firstWrongStep} → ${r.landedSkill} · ${r.evidenceState} · ${r.seconds}s · ${r.aiDescription.slice(0, 140)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ id: c.id, error: message });
        console.log(`[${c.id}] ERROR ${message.slice(0, 200)}`);
        if (/spend cap|cap reached|cap exceeded/i.test(message)) { next = cases.length; }
      }
    }
  }));

  results.sort((a, b) => a.id.localeCompare(b.id));
  const tally: Record<string, number> = {};
  for (const r of results) tally[r.skillVerdict] = (tally[r.skillVerdict] ?? 0) + 1;
  console.log("[tally]", JSON.stringify(tally), failures.length ? `errors=${failures.length}` : "");
  if (OUT) await writeFile(OUT, JSON.stringify({ mode: LIVE ? "live" : "fake", generatedAt: new Date().toISOString(), tally, results, failures }, null, 2));
  await prisma?.$disconnect();
}

main().catch((error) => { console.error(error); process.exit(1); });
