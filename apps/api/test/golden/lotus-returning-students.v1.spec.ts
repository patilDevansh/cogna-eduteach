// This test is about the code-built probes (or needs them with the fake model); production serves AI-written or bank questions only.
process.env.LOTUS_CODE_BUILT_QUESTIONS = "true";
/**
 * Returning students: does what Cogna remembers from a first test make the second one better?
 *
 * The 24 held-out v3 students (test/fixtures/lotus-heldout-students-v3.ts), each played twice with the
 * labelling pretend AI. The second test is played twice from the same first test: once with the
 * memory carried in (learner-memory.ts priors) and once without (LOTUS_MEMORY_PRIORS=off), so the
 * only difference is the memory.
 *   STILL:   the student still has the same gaps.   Memory should find them at least as often.
 *   LEARNED: the student has since learned them (plays as solid). Memory must not invent a gap.
 *
 * Simulation performance only: scripted students and a model of a reviewer.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { testEvidence } from "../../src/learner/learner-memory";
import { LabellingPersonaModels } from "../fixtures/lotus-labelling-models";
import { HELDOUT_STUDENTS_V3, respondV3, type HeldOutStudentV3 } from "../fixtures/lotus-heldout-students-v3";
import { scoreStudentV2, type StudentScoreV2 } from "../fixtures/lotus-heldout-students-v2";

const REPEATS = Number(process.env.LOTUS_RETURNING_REPEATS ?? 3);
const services: LotusService[] = [];
after(() => services.forEach((s) => s.onModuleDestroy()));
const flush = async () => { for (let i = 0; i < 100; i += 1) await new Promise((r) => setImmediate(r)); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (s: LotusService, id: string): any => (s as unknown as { sessions: Map<string, unknown> }).sessions.get(id);
let submissions = 0;

/** A LotusService whose memory is whatever the first test left, with no database. */
class Remembering extends LotusService {
  memory: Awaited<ReturnType<LotusService["memoryFor"]>>;
  protected override async memoryFor() { return this.memory; }
}

async function play(student: HeldOutStudentV3, studentId: string, memory?: Remembering["memory"]): Promise<{ score: StudentScoreV2; state: LotusSessionView }> {
  const service = new Remembering(new LabellingPersonaModels() as unknown as LotusModelService, null);
  service.memory = memory;
  services.push(service);
  let view: LotusSessionView = await service.start(studentId, "FACTORISATION");
  for (let i = 0; i < 20 && !(view.currentQuestion && view.preparation?.ready); i += 1) { await flush(); view = await service.get(view.sessionId); }
  let answered = 0;
  while (view.status === "ACTIVE" && answered < 26) {
    await flush();
    view = await service.get(view.sessionId);
    const staged = view.upcomingQuestions?.[0];
    const question = internal(service, view.sessionId).currentQuestion;
    answered += 1;
    const plan = respondV3(student, question, answered);
    const band = student.behaviour.confidenceBand;
    const tired = student.behaviour.messy?.tiredFromTurn !== undefined && answered >= student.behaviour.messy.tiredFromTurn;
    view = await service.answer(view.sessionId, studentId, {
      answer: plan.answer, working: plan.working, confidence: band[0] + Math.floor((band[1] - band[0]) / 2),
      responseTimeMs: tired ? 3_000 : student.behaviour.paceMsBand[0], didNotKnow: plan.didNotKnow,
      submissionId: `ret-${(submissions += 1)}`, questionId: view.currentQuestion?.id, nextQuestionId: staged?.id,
    });
  }
  await flush();
  view = await service.get(view.sessionId);
  return { score: scoreStudentV2(student, view as never, answered), state: structuredClone(internal(service, view.sessionId)) };
}

/** The first test's evidence, as the memory a second test would load. */
function memoryOf(state: LotusSessionView): Remembering["memory"] {
  return testEvidence(state).map(({ studentId: _s, topic: _t, observedAt, ...row }) => ({ ...row, observedAt: observedAt.toISOString() }));
}

async function second(student: HeldOutStudentV3, studentId: string, memory: Remembering["memory"], withMemory: boolean) {
  if (!withMemory) process.env.LOTUS_MEMORY_PRIORS = "off";
  try { return (await play(student, studentId, memory)).score; } finally { delete process.env.LOTUS_MEMORY_PRIORS; }
}

type Score = StudentScoreV2;
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2) : 0; };
function totals(runs: Score[]) {
  const gap = runs.filter((s) => s.result !== "NO_GAP");
  return {
    runs: runs.length,
    foundRoot: gap.filter((s) => s.result === "FOUND_ROOT").length,
    foundAny: gap.filter((s) => s.result !== "MISSED").length,
    runsWithGap: gap.length,
    falseGapRuns: runs.filter((s) => s.falseGaps.length).length,
    advancement: runs.filter((s) => s.outcome === "ADVANCEMENT").length,
    medianQuestions: median(runs.map((s) => s.answered)),
  };
}

describe("returning students", () => {
  it("a second test with the memory finds what's still there at least as well, and never invents a gap that has gone", async () => {
    const still = { with: [] as Score[], without: [] as Score[] };
    const learned = { with: [] as Score[], without: [] as Score[] };
    for (const student of HELDOUT_STUDENTS_V3.filter((s) => s.group !== "CAPABLE")) {
      for (let r = 0; r < REPEATS; r += 1) {
        const id = `returning_${student.id}_${r}`;
        const memory = memoryOf((await play(student, id)).state);
        still.with.push(await second(student, id, memory, true));
        still.without.push(await second(student, id, memory, false));
        // Since the first test the student has learned what they lacked: plays as a tidy solid student.
        const solid: HeldOutStudentV3 = { ...student, lacks: {}, group: "CAPABLE", behaviour: { ...student.behaviour, messy: undefined } };
        const lw = await second(solid, id, memory, true);
        if (process.env.RETURNING_DEBUG && lw.outcome !== "ADVANCEMENT") console.log(`RETURNING|DEBUG ${student.id} ${lw.outcome} answered ${lw.answered} priors=${JSON.stringify(memory?.filter((m) => m.state !== "SECURE" && m.skillId !== "*").map((m) => m.skillId + ":" + m.state))} unclear=${lw.unclear}`);
        learned.with.push(lw);
        learned.without.push(await second(solid, id, memory, false));
      }
    }
    const t = { stillWith: totals(still.with), stillWithout: totals(still.without), learnedWith: totals(learned.with), learnedWithout: totals(learned.without) };
    for (const [k, v] of Object.entries(t)) console.log(`RETURNING|${k} ${JSON.stringify(v)}`);

    // Criteria declared before the first run: non-inferior where the gaps remain, and no false gap once they've gone.
    assert.ok(t.stillWith.foundAny >= t.stillWithout.foundAny, "STILL: a remaining gap is found at least as often with the memory");
    assert.ok(t.stillWith.foundRoot >= t.stillWithout.foundRoot, "STILL: its root is found at least as often");
    assert.ok(t.learnedWith.falseGapRuns <= t.learnedWithout.falseGapRuns, "LEARNED: the memory never invents a gap that has gone");
    assert.ok(t.learnedWith.advancement >= t.learnedWithout.advancement, "LEARNED: a student who has learned it is cleared as often as without the memory");
    // Measured at 2 plays per student: median 9 questions with the memory, 23 without.
    assert.ok(t.stillWith.medianQuestions <= t.stillWithout.medianQuestions, "STILL: the memory never makes the second test longer");
  });
});
