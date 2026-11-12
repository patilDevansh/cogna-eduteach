/**
 * TEST ONLY. Asks: how accurate is the real AI when no rule code takes part?
 * The real model writes each question, marks each answer, chooses what to ask next and writes the
 * final diagnosis. The product's marking, evidence and planning code is not imported or called.
 * Code here only delivers messages, enforces the 15 to 19 question length, plays the scripted student
 * and scores the finished diagnosis against that student's hidden truth.
 *
 * Usage: node --import tsx scripts/lotus-qa/ai-only.ts [maxStudents]
 * Reads OPENAI_API_KEY, OPENAI_BASE_URL, LOTUS_OPENAI_MODEL from the environment. Resumes finished students.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { FACTORISATION_SKILLS, dependsOnTransitively, skillName } from "../../apps/api/src/lotus/lotus-factorisation-catalogue";
import { HELDOUT_STUDENTS, respond, scoreStudent } from "../../apps/api/test/fixtures/lotus-heldout-students";
import { HELDOUT_STUDENTS_V2, respondV2 } from "../../apps/api/test/fixtures/lotus-heldout-students-v2";
import { HELDOUT_STUDENTS_V3, respondV3 } from "../../apps/api/test/fixtures/lotus-heldout-students-v3";
import { HELDOUT_STUDENTS_V4, respondV4 } from "../../apps/api/test/fixtures/lotus-heldout-students-v4";

void dependsOnTransitively; void skillName;
const OUT = "test-results/lotus-qa/ai-only";
mkdirSync(OUT, { recursive: true });
const MAX = Number(process.argv[2] ?? 96);
const GAP_MS = 4500;
const WORKERS = 2;
const base = process.env.OPENAI_BASE_URL!.replace(/\/$/, "");
const model = process.env.LOTUS_OPENAI_MODEL!;
class QuotaOver extends Error {}

let nextSlot = 0, calls = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function paced() { const now = Date.now(); const at = Math.max(now, nextSlot); nextSlot = at + GAP_MS; await sleep(at - now); }

async function askJson(system: string, user: string): Promise<any> {
  let rate = 0, bad = 0;
  for (;;) {
    await paced(); calls += 1;
    let status = 0, text = "";
    try {
      const res = await fetch(`${base}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
      status = res.status; text = await res.text();
    } catch { status = 0; }
    if (status === 429) {
      if (/per.?day|PerDay/i.test(text)) throw new QuotaOver("daily limit");
      if (++rate > 6) throw new QuotaOver("still rate limited after retries");
      await sleep(30_000); continue;
    }
    if (status === 401 || status === 403) throw new QuotaOver(`key refused (${status})`);
    if (status !== 200) { if (++bad > 5) throw new Error(`model call failed (${status})`); await sleep(10_000); continue; }
    try {
      const content: string = JSON.parse(text).choices[0].message.content;
      return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch { if (++bad > 5) throw new Error("model kept returning unreadable JSON"); }
  }
}

const SKILL_MAP = FACTORISATION_SKILLS.map((s) => ({ id: s.id, name: s.name, needs: s.dependsOn, knownMistakes: s.mistakes }));
const SYSTEM = `You are the only examiner of a Grade 8 factorisation diagnostic. No other system marks or analyses anything. You decide everything.
Goal: find exactly which skills this student lacks, the deepest root cause, where teaching should start, and separate careless slips from real misunderstandings. Do not call a slip a gap, and do not miss a real gap.
Skill map (a skill's "needs" are its prerequisites): ${JSON.stringify(SKILL_MAP)}
Rules of the conversation:
- Ask one question at a time. Ask at least 15 and at most 19 questions, then finish. Choose freely what to ask, including following up on foundations.
- You receive only what was asked and what the student wrote. Work out for yourself whether it is right.
Return only JSON:
{"reviewOfLastAnswer": null or {"correct":boolean,"type":"CORRECT"|"SLIP"|"MISUNDERSTANDING"|"DID_NOT_KNOW"|"UNCLEAR","skillsAtFault":[skillId],"note":string},
 "next": null when finished, otherwise {"prompt":string,"itemKind":"FACTORISE"|"SIMPLIFY"|"EXPAND"|"NUMBER"|"CHOICE","options":[strings, for CHOICE only],"canonicalAnswer":string,"workedSolution":[strings],"skillId":main skillId,"taggedSkills":[EVERY other skillId the solution uses],"predictedMistakes":[{"answer":string,"mistake":code from knownMistakes}]},
 "final": null until finished, then {"outcome":"SOLID_GAP"|"ADVANCEMENT"|"INSUFFICIENT_OR_CONFLICTING","skills":[{"skillId":string,"state":"CONFIRMED"|"SUSPECTED"}],"rootCause":[skillId],"startingPoint":string,"slipsSeen":[question numbers],"reasoning":string}}
List under "skills" only skills you believe are lacking. CONFIRMED means you are confident this student lacks it.`;

type Entry = { student: any; set: string; play: (q: any, t: number) => any };
const entries: Entry[] = [
  ...HELDOUT_STUDENTS.map((s): Entry => ({ student: s, set: "1", play: (q, t) => respond(s, q, t) })),
  ...HELDOUT_STUDENTS_V2.map((s): Entry => ({ student: s, set: "2", play: (q, t) => respondV2(s, q, t) })),
  ...HELDOUT_STUDENTS_V3.map((s): Entry => ({ student: s, set: "3", play: (q, t) => respondV3(s, q, t) })),
  ...HELDOUT_STUDENTS_V4.map((s): Entry => ({ student: s, set: "4", play: (q, t) => respondV4(s, q, t) })),
];
// A fixed mix, so that stopping early still leaves a spread of student types and sets.
let seed = 20261110;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
for (let i = entries.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [entries[i], entries[j]] = [entries[j]!, entries[i]!]; }

const norm = (s: string) => String(s).toLowerCase().replace(/\s+/g, "");

async function playOne(e: Entry) {
  const log: any[] = [];
  const transcript: any[] = [];
  let pending: any = null;
  for (let round = 0; round < 24; round += 1) {
    const asked = transcript.length;
    const instruction = asked >= 19 ? "You have asked 19 questions. You must finish now: next must be null and final must be filled."
      : asked >= 15 ? "You may finish now or ask a follow-up." : "You must ask another question; final must be null.";
    const reply = await askJson(SYSTEM, JSON.stringify({ questionsSoFar: transcript, instruction }));
    if (pending) { pending.aiReview = reply.reviewOfLastAnswer ?? null; pending = null; }
    if (reply.final && (asked >= 15 || !reply.next)) {
      if (asked < 15) continue;
      const view = { finalReport: { outcome: reply.final.outcome, skills: (reply.final.skills ?? []).map((s: any) => ({ skillId: s.skillId, state: s.state })) } };
      const score = scoreStudent(e.student, view as never, asked);
      return { id: e.student.id, set: e.set, group: e.student.group, story: e.student.story, truth: e.student.lacks, score, final: reply.final, log };
    }
    const q = reply.next;
    if (!q?.prompt || !q.canonicalAnswer) continue;
    const turn = asked + 1;
    const plan = e.play({ answerKey: { canonicalAnswer: String(q.canonicalAnswer), workedSolution: q.workedSolution ?? [], diagnostics: { itemKind: q.itemKind, skillId: q.skillId, taggedSkills: q.taggedSkills ?? [], predictedMistakes: q.predictedMistakes ?? [] } } }, turn);
    transcript.push({ number: turn, question: q.prompt, ...(q.options ? { options: q.options } : {}), studentAnswer: plan.answer, studentWorking: plan.working, saidDidNotKnow: plan.didNotKnow });
    pending = { turn, prompt: q.prompt, skillId: q.skillId, taggedSkills: q.taggedSkills, aiKey: q.canonicalAnswer, answer: plan.answer, working: plan.working, plannedWrong: plan.isDeliberateMistake, plantedSlip: !!e.student.behaviour?.messy?.copySlipTurns?.includes(turn) };
    log.push(pending);
  }
  throw new Error("AI did not finish within the question limit");
}

function summarise() {
  const done = readdirSync(OUT).filter((f) => f.endsWith(".result.json")).map((f) => JSON.parse(readFileSync(`${OUT}/${f}`, "utf8")));
  const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const block = (rs: any[]) => {
    const gap = rs.filter((r) => r.score.result !== "NO_GAP"), cap = rs.filter((r) => r.score.result === "NO_GAP");
    return { students: rs.length, withGap: gap.length, rootFoundPct: pct(gap.filter((r) => r.score.result === "FOUND_ROOT").length, gap.length),
      foundAbovePct: pct(gap.filter((r) => r.score.result === "FOUND_ABOVE").length, gap.length), missedPct: pct(gap.filter((r) => r.score.result === "MISSED").length, gap.length),
      noGapStudents: cap.length, noGapWithFalseGap: cap.filter((r) => r.score.falseGaps.length).length, anyFalseGap: rs.filter((r) => r.score.falseGaps.length).length };
  };
  const turns = done.flatMap((r) => r.log.filter((t: any) => t.aiReview));
  const truthRight = (t: any) => norm(t.answer) === norm(t.aiKey);
  const slips = turns.filter((t: any) => t.plantedSlip && !truthRight(t));
  const out = { calls, overall: block(done), bySet: Object.fromEntries(["1", "2", "3", "4"].map((s) => [s, block(done.filter((r) => r.set === s))])),
    marking: { answers: turns.length, agreesWithOwnKeyPct: pct(turns.filter((t: any) => t.aiReview.correct === truthRight(t)).length, turns.length) },
    plantedSlips: { total: slips.length, calledSlip: slips.filter((t: any) => t.aiReview.type === "SLIP").length, calledMisunderstanding: slips.filter((t: any) => t.aiReview.type === "MISUNDERSTANDING").length },
    medianQuestions: done.map((r) => r.score.answered).sort((a, b) => a - b)[Math.floor(done.length / 2)] ?? null };
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  const queue = entries.slice(0, MAX).filter((e) => !existsSync(`${OUT}/${e.student.id}.result.json`));
  let stop = "";
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (queue.length && !stop) {
      const e = queue.shift()!;
      try {
        const result = await playOne(e);
        writeFileSync(`${OUT}/${e.student.id}.result.json`, JSON.stringify(result, null, 2));
        console.log(`[done] ${e.student.id} ${result.score.result} q=${result.score.answered} falseGaps=${result.score.falseGaps.length} confirmed=${result.score.confirmed.join(",")}`);
      } catch (err) {
        if (err instanceof QuotaOver) { stop = err.message; console.log(`[stop] ${stop}`); }
        else console.log(`[failed] ${e.student.id}: ${(err as Error).message}`);
      }
    }
  }));
  console.log(`[summary] ${JSON.stringify(summarise())}`);
}
main();
