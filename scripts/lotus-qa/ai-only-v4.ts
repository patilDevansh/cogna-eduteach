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
const OLD = "test-results/lotus-qa/ai-only";
const OUT = "test-results/lotus-qa/ai-only-v4";
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
      console.log(`[429] ${text.replace(/\s+/g, " ").slice(0, 400)}`);
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
Goal: find exactly which skills this student lacks, the deepest root cause, where teaching should start, and separate careless slips from real misunderstandings.
Skill map (a skill's "needs" are its prerequisites): ${JSON.stringify(SKILL_MAP)}
How to run the test:
1. COVER BOTH LEVELS. Foundation skills have ids starting FND_; every other skill is a chapter skill. Some chapter gaps only show on their own kind of question (checking a factorisation by expanding it, cancelling factors in a fraction, treating a bracket as one quantity, grouping when the second pair starts with a minus, reversed brackets, negative common factors). At least 6 of your questions must be aimed directly at a chapter skill, and at least 4 of them at chapter skills no question has touched yet. Each turn you are told which foundation and chapter skills no question has touched yet. Do not let foundation follow-ups use up the questions reserved for chapter skills. Never ask the same type of question three times in a row.
2. DESCEND. When an answer is wrong and it is not clearly a slip, do not blame the skill the question was about yet. Name its prerequisites and ask a short question on the single most likely prerequisite alone, with nothing else in it. If that is wrong, go down again. If it is right, that prerequisite is cleared and the fault is higher up. Stop when a skill fails while everything it needs is cleared or has no prerequisites.
3. READ THE MISTAKE. Look at what the student actually wrote and worked out, and ask which misunderstanding would produce exactly that answer.
4. SLIPS. Before calling a wrong answer a misunderstanding, check whether the student has shown this same skill correctly elsewhere, on its own question or as a step inside another question. If they have, and the working uses the right method but has a copying, sign-copying or arithmetic error, or the answer is the right form with one wrong digit, call it SLIP. A SLIP never confirms a gap. Only if a fresh question on the same skill is also wrong does it become a misunderstanding.
4b. NOT TRYING. If the answers are wrong in unrelated ways that no single misunderstanding explains, the student is probably not really trying: finish with outcome INSUFFICIENT_OR_CONFLICTING and do not CONFIRM gaps.
5. CONFIRM. Mark a skill CONFIRMED only if a question aimed directly at it was wrong, in a way that is not a slip, at least once (a wrong answer on a step inside another question also counts if it is not a slip), and it is not explained by a deeper failed skill alone. A skill above a failed root is not separately CONFIRMED. Use SUSPECTED for anything else.
5b. YOUR OWN MARKS. Every earlier question carries yourMarking, your verdict when you marked it, plus yourAnswerKey. Mark each answer against the key you wrote; for a yes/no check, "Yes" to a wrong factorisation is wrong. The final report must be built from these marks: a skill you marked MISUNDERSTANDING twice, or once with no later correct answer on a fresh question, must be CONFIRMED. Never write that the student answered everything correctly while any mark says MISUNDERSTANDING. Repeated MISUNDERSTANDING on one skill is never a slip.
6. BEFORE FINISHING check yourself: if any skill is CONFIRMED the outcome cannot be ADVANCEMENT. rootCause must be the deepest failed skills. If repeated wrong answers remain unexplained, use a remaining question to test them.
Ask one question at a time, at least 15 and at most 19. You receive only what was asked and what the student wrote. Work out for yourself whether it is right.
Return only JSON:
{"notes":{"suspected":[skillId],"cleared":[skillId],"nextCheck":string},
 "reviewOfLastAnswer": null or {"correct":boolean,"type":"CORRECT"|"SLIP"|"MISUNDERSTANDING"|"DID_NOT_KNOW"|"UNCLEAR","skillsAtFault":[skillId],"note":string},
 "next": null when finished, otherwise {"prompt":string,"itemKind":"FACTORISE"|"SIMPLIFY"|"EXPAND"|"NUMBER"|"CHOICE","options":[strings, for CHOICE only],"canonicalAnswer":string,"workedSolution":[strings],"skillId":main skillId,"taggedSkills":[EVERY other skillId the solution really uses, including prerequisites],"predictedMistakes":[{"answer":string,"mistake":code from knownMistakes}]},
 "final": null until finished, then {"outcome":"SOLID_GAP"|"ADVANCEMENT"|"INSUFFICIENT_OR_CONFLICTING","skills":[{"skillId":string,"state":"CONFIRMED"|"SUSPECTED"}],"rootCause":[skillId],"startingPoint":string,"slipsSeen":[question numbers],"reasoning":string}}
List under "skills" only skills you believe are lacking.`;

// A real child's wrong answer shows their misunderstanding. The scripted student decides WHEN it goes wrong; this separate
// role-play, which never sees the examiner's reasoning, decides WHAT the child writes.
async function childAnswer(e: Entry, q: any) {
  const lacks = Object.entries(e.student.lacks).map(([id, code]) => ({ skill: FACTORISATION_SKILLS.find((s) => s.id === id)?.name ?? id, mistake: code }));
  const reply = await askJson("You role-play a Grade 8 student for testing a diagnostic. Write what this student would write. Apply only the misunderstanding given, consistently; do everything else correctly. The final answer must be wrong because of that misunderstanding. Working must be one or two short lines in the student's voice, showing the steps they did, not naming the misunderstanding. Return only JSON: {\"answer\":string,\"working\":string}",
    JSON.stringify({ student: e.student.story, misunderstandings: lacks, question: q.prompt, options: q.options, correctAnswerForYourReferenceOnly: q.canonicalAnswer }));
  return reply?.answer && norm(reply.answer) !== norm(q.canonicalAnswer) ? { answer: String(reply.answer), working: String(reply.working ?? "") } : null;
}

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
  let notes: any = null;
  const touched = new Set<string>();
  let chapterDirect = 0;
  for (let round = 0; round < 24; round += 1) {
    const asked = transcript.length;
    const instruction = asked >= 19 ? "You have asked 19 questions. You must finish now: next must be null and final must be filled."
      : asked >= 15 ? "You may finish now or ask a follow-up." : "You must ask another question; final must be null.";
    const reply = await askJson(SYSTEM, JSON.stringify({ questionsSoFar: transcript, yourNotesFromLastTurn: notes, untouchedFoundationSkills: FACTORISATION_SKILLS.map((s) => s.id).filter((id) => id.startsWith("FND_") && !touched.has(id)), untouchedChapterSkills: FACTORISATION_SKILLS.map((s) => s.id).filter((id) => !id.startsWith("FND_") && !touched.has(id)), directChapterQuestionsSoFar: chapterDirect, instruction }));
    notes = reply.notes ?? notes;
    if (pending) {
      pending.aiReview = reply.reviewOfLastAnswer ?? null;
      // The AI's own marking stays attached to the question, so its final report is written from it.
      const last = transcript[transcript.length - 1];
      if (last && pending.aiReview) last.yourMarking = { correct: pending.aiReview.correct, type: pending.aiReview.type, skillsAtFault: pending.aiReview.skillsAtFault ?? [] };
      pending = null;
    }
    if (reply.final && (asked >= 15 || !reply.next)) {
      if (asked < 15) continue;
      const view = { finalReport: { outcome: reply.final.outcome, skills: (reply.final.skills ?? []).map((s: any) => ({ skillId: s.skillId, state: s.state })) } };
      const score = scoreStudent(e.student, view as never, asked);
      return { id: e.student.id, set: e.set, group: e.student.group, story: e.student.story, truth: e.student.lacks, score, final: reply.final, log };
    }
    const q = reply.next;
    if (!q?.prompt || !q.canonicalAnswer) continue;
    const turn = asked + 1;
    let plan = e.play({ answerKey: { canonicalAnswer: String(q.canonicalAnswer), workedSolution: q.workedSolution ?? [], diagnostics: { itemKind: q.itemKind, skillId: q.skillId, taggedSkills: q.taggedSkills ?? [], predictedMistakes: q.predictedMistakes ?? [] } } }, turn);
    let child = false;
    if (/^I used the rule I know/.test(plan.working ?? "")) { const a = await childAnswer(e, q); if (a) { plan = { ...plan, ...a }; child = true; } }
    if (q.skillId && !String(q.skillId).startsWith("FND_")) chapterDirect += 1;
    for (const id of [q.skillId, ...(q.taggedSkills ?? [])]) if (id) touched.add(id);
    transcript.push({ number: turn, question: q.prompt, ...(q.options ? { options: q.options } : {}), yourAnswerKey: String(q.canonicalAnswer), yourTargetSkill: q.skillId, studentAnswer: plan.answer, studentWorking: plan.working, saidDidNotKnow: plan.didNotKnow });
    pending = { turn, child, notes, prompt: q.prompt, skillId: q.skillId, taggedSkills: q.taggedSkills, aiKey: q.canonicalAnswer, answer: plan.answer, working: plan.working, plannedWrong: plan.isDeliberateMistake, plantedSlip: !!e.student.behaviour?.messy?.copySlipTurns?.includes(turn) };
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
  const same = entries.filter((e) => existsSync(`${OLD}/${e.student.id}.result.json`));
  // The students these fixes target go first: chapter gaps, then planted slips, then messy, then the rest.
  const rank = (e: Entry) => e.student.group === "CHAPTER_GAP" ? 0 : e.student.behaviour?.messy?.copySlipTurns?.length ? 1 : e.student.group === "MESSY" ? 2 : 3;
  const gapFirst = [...same].sort((a, b) => rank(a) - rank(b));
  // SHARD=i/n splits the students across n keys run side by side; each key takes every n-th student.
  const [shard, shards] = (process.env.SHARD ?? "0/1").split("/").map(Number) as [number, number];
  const queue = gapFirst.slice(0, MAX).filter((_, i) => i % shards === shard).filter((e) => !existsSync(`${OUT}/${e.student.id}.result.json`));
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
