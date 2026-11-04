/**
 * Held-out scorecard v2: 24 simulated students (test/fixtures/lotus-heldout-students-v2.ts),
 * written before the two fixes it measures. Each is played REPEATS times and scored against the
 * truth written for it. The "before" figures were taken once from the code before the fixes
 * were written (see BEFORE below). Criteria A-D are declared in the fixture's header.
 *
 * Simulation performance only: scripted students and a pretend AI.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { PersonaFakeModels } from "../fixtures/lotus-factorisation-personas";
import type { HeldOutStudent } from "../fixtures/lotus-heldout-students";
import { HELDOUT_STUDENTS_V2, respondV2, scoreStudentV2, type StudentScoreV2 } from "../fixtures/lotus-heldout-students-v2";

// 20 plays per student for the published scorecard (about a minute); 5 is enough for the guard-rails in the normal suite.
const REPEATS = Number(process.env.LOTUS_HELDOUT_REPEATS ?? 5);
const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, sessionId: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(sessionId);
let submissions = 0;

async function play(student: HeldOutStudent, repeat: number): Promise<StudentScoreV2> {
  const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
  services.push(service);
  const studentId = `heldout2_${student.id}_${repeat}`;
  const started = await service.start(studentId, "FACTORISATION");
  let view: LotusSessionView = started;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flush();
    view = await service.get(started.sessionId);
    if (view.currentQuestion && view.preparation?.ready) break;
  }
  assert.ok(view.currentQuestion, `${student.id}: the diagnostic prepared`);
  let answered = 0;
  while (view.status === "ACTIVE" && answered < 26) {
    await flush();
    view = await service.get(view.sessionId);
    const staged = view.upcomingQuestions?.[0];
    const question = internal(service, view.sessionId).currentQuestion;
    answered += 1;
    const plan = respondV2(student, question, answered);
    const band = student.behaviour.confidenceBand;
    view = await service.answer(view.sessionId, studentId, {
      answer: plan.answer,
      working: plan.working,
      confidence: band[0] + Math.floor((band[1] - band[0]) / 2),
      responseTimeMs: student.behaviour.messy?.tiredFromTurn !== undefined && answered >= student.behaviour.messy.tiredFromTurn ? 3_000 : student.behaviour.paceMsBand[0],
      didNotKnow: plan.didNotKnow,
      submissionId: `heldout2-sub-${(submissions += 1)}`,
      questionId: view.currentQuestion?.id,
      nextQuestionId: staged?.id,
    });
  }
  await flush();
  view = await service.get(view.sessionId);
  assert.ok(view.finalReport, `${student.id}: finished with a report`);
  return scoreStudentV2(student, view as never, answered);
}

const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2) : 0; };
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);

function totals(all: StudentScoreV2[][]) {
  const runs = all.flat();
  const gap = runs.filter((s) => s.result !== "NO_GAP");
  const falseRuns = runs.filter((s) => s.falseGaps.length);
  return {
    runs: runs.length,
    runsWithGap: gap.length,
    foundRoot: pct(gap.filter((s) => s.result === "FOUND_ROOT").length, gap.length),
    foundAbove: pct(gap.filter((s) => s.result === "FOUND_ABOVE").length, gap.length),
    missed: pct(gap.filter((s) => s.result === "MISSED").length, gap.length),
    foundAnyRuns: gap.filter((s) => s.result !== "MISSED").length,
    silentMisses: runs.filter((s) => s.silentMiss).length,
    falseGapRuns: falseRuns.length,
    falseGapRunsExcludingTired: falseRuns.filter((s) => !/TIRED/.test(s.id)).length,
    capableRunsWithFalseGap: runs.filter((s) => s.group === "CAPABLE" && s.falseGaps.length).length,
    capableRuns: runs.filter((s) => s.group === "CAPABLE").length,
    unclearWhenDeterminable: runs.filter((s) => s.unclear).length,
    medianQuestionsWithGap: median(gap.map((s) => s.answered)),
    medianMinutesWithGap: median(gap.map((s) => s.minutes)),
  };
}

describe("held-out scorecard v2", () => {
  it("scores the 24 held-out v2 students", async () => {
    const all: StudentScoreV2[][] = [];
    for (const student of HELDOUT_STUDENTS_V2) {
      const runs: StudentScoreV2[] = [];
      for (let r = 0; r < REPEATS; r += 1) runs.push(await play(student, r));
      all.push(runs);
    }
    console.log(`SCORECARD2|plays per student: ${REPEATS}`);
    HELDOUT_STUDENTS_V2.forEach((s, i) => {
      const runs = all[i]!;
      const f = (r: StudentScoreV2["result"]) => pct(runs.filter((x) => x.result === r).length, runs.length);
      console.log(`SCORECARD2|STUDENT|${s.id}|${s.group}|roots=[${runs[0]!.roots.join(",")}]|root ${f("FOUND_ROOT")}% above ${f("FOUND_ABOVE")}% missed ${f("MISSED")}% silentMiss ${runs.filter((x) => x.silentMiss).length}/${runs.length} falseGapRuns ${runs.filter((x) => x.falseGaps.length).length}/${runs.length} q ${Math.min(...runs.map((x) => x.answered))}-${median(runs.map((x) => x.answered))}-${Math.max(...runs.map((x) => x.answered))} out ${[...new Set(runs.map((x) => x.outcome))].join("/")} fg=[${[...new Set(runs.flatMap((x) => x.falseGaps))].sort().join(",")}]`);
    });
    const t = totals(all);
    console.log(`SCORECARD2|TOTAL ${JSON.stringify(t)}`);
    assert.equal(t.runs, HELDOUT_STUDENTS_V2.length * REPEATS);

    // Criteria B and C against the figures from the code before the fixes (20 plays each: found at the root
    // 52.2%, gap found at all 72.2%, silent misses 27.8% of plays with a gap, false-gap plays 4.2%).
    const rate = (n: number, d: number) => (100 * n) / d;
    assert.ok(rate(t.foundAnyRuns, t.runsWithGap) >= 72, "B: a gap is found (at the root or above) at least as often as before");
    // 2 points of room: with 5 plays a student whose result varies (V10, V13) moves the figure by about a point.
    assert.ok(t.foundRoot >= 50, "B: the root cause is found at least as often as before");
    assert.ok(rate(t.silentMisses, t.runsWithGap) <= 20, "A (partly): silent misses fell from 27.8% to at most 20% of plays with a gap");
    assert.ok(rate(t.falseGapRuns, t.runs) <= 4.3, "C: false-gap plays are not higher than before");
    const byId = (id: string) => all[HELDOUT_STUDENTS_V2.findIndex((s) => s.id === id)]!;
    for (const id of ["V18_CANCELS_ONE_TERM", "V23_GUESSES_ON_GROUPING"]) {
      assert.ok(byId(id).every((s) => !s.silentMiss), `${id}: a gap on a late skill is no longer a silent miss`);
    }
  });

  // Not met in the first run of v2 (docs/mvp-10.0/HELDOUT_SCORECARD.md). Kept visible, not weakened.
  it.todo("A: no silent miss. A foundation gap (V08 powers, V11 square roots, V14 which identity) is never asked about when the wrong answers above it are unexplained, and the report is silent");
  it.todo("C: no capable child is given a gap. V04, solid but tired from question 20, is reported SOLID_GAP in every play");
  it.todo("D: median questions for children with a gap no more than 2 above before (22): now 25");
});
