#!/usr/bin/env node
/**
 * Lotus full evaluation runner: one learner, one condition, one repeat.
 *
 *   node --import tsx scripts/lotus-eval/run.ts <LEARNER_ID> <CONDITION> <REPEAT> <OUT_DIR>
 *
 * CONDITION is set by the caller's environment and named here for the record:
 *   LOTUS     – Lotus as it is.
 *   FIXED     – LOTUS_FIXED_PLAN=true: the opening plan asked as written. Also runs the "one AI reads the fixed
 *               test" comparison on the same answers.
 *   AI_ONLY   – LOTUS_AI_ONLY_ANALYSIS=true: code marking off, the AI review judges every answer.
 *
 * Uses the same start/answer path as a student. The simulator sees only the served question.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@cogna/database";
import { LotusService } from "../../src/lotus/lotus.service";
import { LotusModelService } from "../../src/lotus/lotus-model.service";
import { OpenAIService } from "../../src/ai/openai.service";
import { setSpendStore } from "../../src/ai/spend-cap";
import { PrismaSpendStore } from "../../src/ai/prisma-spend-store";
import { FACTORISATION_SKILLS } from "../../src/lotus/lotus-factorisation-catalogue";
import { loadEnvFiles } from "../lotus-env";
import { LEARNERS_E1 } from "./learners";
import { decide, respond, rng } from "./simulate";

const [learnerId, condition, repeatText, outDir] = process.argv.slice(2);
const learner = LEARNERS_E1.find((l) => l.id === learnerId);
if (!learner || !condition || !repeatText || !outDir) throw new Error("usage: run.ts <LEARNER_ID> <LOTUS|FIXED|AI_ONLY> <REPEAT> <OUT_DIR>");
const repeat = Number(repeatText);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function checkCondition() {
  const fixed = process.env.LOTUS_FIXED_PLAN === "true";
  const aiOnly = process.env.LOTUS_AI_ONLY_ANALYSIS === "true";
  const ok = condition === "LOTUS" ? !fixed && !aiOnly : condition === "FIXED" ? fixed && !aiOnly : condition === "AI_ONLY" ? aiOnly && !fixed : false;
  if (!ok) throw new Error(`Environment does not match condition ${condition} (fixed=${fixed}, aiOnly=${aiOnly}).`);
}

/** The comparison: one AI reads the whole fixed test at the end and writes the profile. */
async function aiReadsTheTest(models: LotusModelService, ledger: Array<Record<string, unknown>>) {
  const skills = FACTORISATION_SKILLS.map((s) => ({ id: s.id, name: s.name, dependsOn: s.dependsOn }));
  const prompt = [
    "You are an experienced maths teacher reading a Grade 8 student's factorisation test. Each question shows the right answer, what the student did (final answer, chips placed, drafts typed) and how sure they said they were.",
    "Using only these answers and the skill list (each skill names the skills it depends on), say for EVERY skill whether it is GAP (the student can't do it), SHAKY (sometimes right, sometimes wrong, or right with doubt), SECURE (shown right more than once with no doubt), or NOT_SEEN (no question needed it). Then name the ONE skill to teach first (the deepest gap).",
    "Distinguish a careless slip, a rushed answer, and a real gap. Return JSON only: {\"skills\": {\"SKILL_ID\": \"GAP|SHAKY|SECURE|NOT_SEEN\"}, \"startWith\": \"SKILL_ID or null\", \"summary\": \"two sentences\"}.",
    JSON.stringify({ skills }),
    JSON.stringify({ answers: ledger }),
  ].join("\n\n");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await new OpenAIService().getClient().responses.create({ model: models.primaryModel, input: prompt, max_output_tokens: 4_000, reasoning: { effort: "medium" } });
      const text = res.output_text.trim().replace(/^```(json)?/, "").replace(/```$/, "");
      return { model: models.primaryModel, attempts: attempt, ...JSON.parse(text) };
    } catch (error) {
      if (attempt === 3) return { error: error instanceof Error ? error.message : String(error) };
      await wait(1_000 * attempt);
    }
  }
}

async function main() {
  loadEnvFiles(["../../.env", "../../packages/database/.env"]);
  checkCondition();
  if (process.env.LOTUS_E2E_FAKE_MODEL === "true") throw new Error("Refusing fake model for a live evaluation.");
  const prisma = new PrismaClient();
  setSpendStore(new PrismaSpendStore(prisma));
  const models = new LotusModelService(new OpenAIService(), new ConfigService());
  if (!models.status.ready) throw new Error(`Live model not ready: ${models.status.missingConfiguration.join(", ")}`);
  const service = new LotusService(models, prisma);
  const studentId = `eval_e1_${learner!.id.toLowerCase()}_${condition!.toLowerCase()}_r${repeat}_${Date.now()}`;
  const parent = await prisma.student.findFirst({ select: { primaryParentId: true } });
  if (!parent) throw new Error("No seed student to supply the parent relation.");
  await prisma.student.create({ data: { id: studentId, primaryParentId: parent.primaryParentId, name: `Eval ${learner!.id}`, accessCodeHash: "evaluation-only" } });
  const started = await service.start(studentId, "FACTORISATION");
  const r = rng(`${learner!.id}:${condition}:${repeat}`);
  const turns: Array<Record<string, unknown>> = [];
  const ledger: Array<Record<string, unknown>> = [];
  const t0 = Date.now();
  try {
    for (let i = 0; i < 300; i++) { const v = await service.get(started.sessionId); if (v.preparation?.ready) break; if (v.preparation?.blockedReason) throw new Error(v.preparation.blockedReason); await wait(1_000); }
    for (let turn = 1; turn <= 25; turn++) {
      let q = null;
      for (let i = 0; i < 180 && !q; i++) { q = await service.getEvaluationQuestion(started.sessionId); if (!q) await wait(1_000); }
      if (!q) break;
      const intent = decide(learner!, q, turn, r);
      const { response, played } = respond(q, intent, `eval-${learner!.id}-${condition}-${repeat}-${turn}`);
      let after;
      try { after = await service.answer(started.sessionId, studentId, response); }
      catch (error) {
        // A game the simulator built wrongly must not end the run: fall back to the plain answer once.
        const { game: _g, typing: _t, ...plain } = response;
        after = await service.answer(started.sessionId, studentId, { ...plain, submissionId: `${response.submissionId}-plain` });
        turns.push({ turn, fallback: error instanceof Error ? error.message : String(error) });
      }
      const d = q.answerKey.diagnostics;
      turns.push({ turn, questionId: q.id, prompt: q.prompt, skillId: d?.skillId, taggedSkills: d?.taggedSkills, stepSkills: d?.stepSkills, game: q.game?.kind ?? (q.options ? "OPTIONS" : "TYPED"), played, intent });
      ledger.push({ q: turn, prompt: q.prompt, rightAnswer: q.answerKey.canonicalAnswer, options: (q.game as { options?: string[] })?.options ?? q.options,
        studentAnswer: intent.kind === "DONT_KNOW" ? "I don't know" : intent.answer, chips: (response.game as { counts?: number[] })?.counts,
        drafts: ((response.game as { history?: Array<{ v: string }> })?.history ?? response.typing)?.map((h) => h.v), confidence: intent.confidence, seconds: intent.seconds });
      if (after.status !== "ACTIVE") break;
      await wait(4_000);
    }
    // Let the last reviews and the report settle.
    let view = await service.get(started.sessionId);
    for (let i = 0; i < 180; i++) {
      view = await service.get(started.sessionId);
      if (view.status === "COMPLETE" && !view.audits.some((a) => a.analysisStatus === "PENDING") && view.finalReport?.overallReview) break;
      await wait(1_000);
    }
    const aiRead = condition === "FIXED" ? await aiReadsTheTest(models, ledger) : undefined;
    await mkdir(outDir!, { recursive: true });
    const file = join(outDir!, `${learner!.id}-${condition}-r${repeat}.json`);
    await writeFile(file, JSON.stringify({
      protocol: "lotus-eval-e1", fullTest: process.env.LOTUS_FULL_TEST === "true", learner, condition, repeat, sessionId: started.sessionId, studentId, seconds: Math.round((Date.now() - t0) / 1000),
      liveModel: { primary: models.primaryModel, challenger: models.challengerModel }, turns, ledger,
      cogna: { status: view.status, finalReport: view.finalReport, audits: view.audits }, aiRead,
    }, null, 2));
    console.log(`EVAL_DONE ${file} answered=${ledger.length} outcome=${view.finalReport?.outcome}`);
  } finally {
    service.onModuleDestroy();
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
