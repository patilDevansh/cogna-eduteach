/**
 * Held-out scorecard v1: 24 simulated students (test/fixtures/lotus-heldout-students.ts) played
 * through the factorisation diagnostic with and without the short foundation checks
 * (LOTUS_DISABLE_SKILL_CHECKS), and scored against the truth written for each student.
 *
 * Each student is played REPEATS times per mode: the question variants depend on a random
 * session id, so a single run is not stable (two single runs of the first version of this file
 * differed for four students). The repeats were added for that reason, after those two runs and
 * before any other change; the students, scoring and criteria are unchanged.
 *
 * Simulation performance only: scripted students and a pretend AI. It shows the rules behave
 * as designed on students they were not tuned on; it is not accuracy with real children.
 * The criteria asserted below were declared in the fixture's header before the first run.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { PersonaFakeModels } from "../fixtures/lotus-factorisation-personas";
import { HELDOUT_STUDENTS, respond, scoreStudent, type HeldOutStudent, type StudentScore } from "../fixtures/lotus-heldout-students";

// 20 plays per student per mode for the published scorecard (about a minute); 5 is enough for the guard-rails in the normal suite.
const REPEATS = Number(process.env.LOTUS_HELDOUT_REPEATS ?? 5);
const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, sessionId: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(sessionId);
let submissions = 0;

async function play(student: HeldOutStudent, mode: string, repeat: number): Promise<StudentScore> {
  const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
  services.push(service);
  const studentId = `heldout_${student.id}_${mode}_${repeat}`;
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
    const plan = respond(student, question, answered);
    const band = student.behaviour.confidenceBand;
    view = await service.answer(view.sessionId, studentId, {
      answer: plan.answer,
      working: plan.working,
      confidence: band[0] + Math.floor((band[1] - band[0]) / 2),
      responseTimeMs: student.behaviour.paceMsBand[0],
      didNotKnow: plan.didNotKnow,
      submissionId: `heldout-sub-${(submissions += 1)}`,
      questionId: view.currentQuestion?.id,
      nextQuestionId: staged?.id,
    });
  }
  await flush();
  view = await service.get(view.sessionId);
  assert.ok(view.finalReport, `${student.id}: finished with a report`);
  return scoreStudent(student, view as never, answered);
}

async function playAll(mode: string): Promise<StudentScore[][]> {
  // [student][repeat]
  const all: StudentScore[][] = [];
  for (const student of HELDOUT_STUDENTS) {
    const runs: StudentScore[] = [];
    for (let r = 0; r < REPEATS; r += 1) runs.push(await play(student, mode, r));
    all.push(runs);
  }
  return all;
}

const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2) : 0; };
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);

function perStudent(runs: StudentScore[]) {
  const n = runs.length;
  return {
    root: pct(runs.filter((s) => s.result === "FOUND_ROOT").length, n),
    above: pct(runs.filter((s) => s.result === "FOUND_ABOVE").length, n),
    missed: pct(runs.filter((s) => s.result === "MISSED").length, n),
    falseGapRuns: runs.filter((s) => s.falseGaps.length).length,
    falseGapSkills: [...new Set(runs.flatMap((s) => s.falseGaps))].sort(),
    outcomes: [...new Set(runs.map((s) => s.outcome))].join("/"),
    medianQuestions: median(runs.map((s) => s.answered)),
    minQuestions: Math.min(...runs.map((s) => s.answered)),
    maxQuestions: Math.max(...runs.map((s) => s.answered)),
    medianMinutes: median(runs.map((s) => s.minutes)),
  };
}

function totals(all: StudentScore[][]) {
  const runs = all.flat();
  const gap = runs.filter((s) => s.result !== "NO_GAP");
  const noGap = runs.filter((s) => s.result === "NO_GAP" && s.group !== "MESSY" || (s.result === "NO_GAP" && !s.unclear && s.outcome !== "INSUFFICIENT_OR_CONFLICTING"));
  const notTrying = runs.filter((s) => s.id === "H24_NOT_TRYING");
  const falseGapRuns = runs.filter((s) => s.falseGaps.length);
  return {
    runs: runs.length,
    runsWithGap: gap.length,
    foundRoot: pct(gap.filter((s) => s.result === "FOUND_ROOT").length, gap.length),
    foundAbove: pct(gap.filter((s) => s.result === "FOUND_ABOVE").length, gap.length),
    missed: pct(gap.filter((s) => s.result === "MISSED").length, gap.length),
    foundAny: gap.filter((s) => s.result !== "MISSED").length,
    falseGapRuns: falseGapRuns.length,
    falseGapRunsExcludingNotTrying: falseGapRuns.filter((s) => s.id !== "H24_NOT_TRYING").length,
    capableChildrenWithFalseGap: runs.filter((s) => s.group === "CAPABLE" && s.falseGaps.length).length,
    capableRuns: runs.filter((s) => s.group === "CAPABLE").length,
    notTryingReportedUnclear: pct(notTrying.filter((s) => s.outcome === "INSUFFICIENT_OR_CONFLICTING").length, notTrying.length),
    unclearWhenDeterminable: runs.filter((s) => s.unclear).length,
    medianQuestionsWithGap: median(gap.map((s) => s.answered)),
    medianMinutesWithGap: median(gap.map((s) => s.minutes)),
    medianQuestionsCapable: median(runs.filter((s) => s.group === "CAPABLE").map((s) => s.answered)),
    _unused: noGap.length,
  };
}

describe("held-out scorecard v1", () => {
  it("scores the 24 held-out students, with and without the short foundation checks", async () => {
    const withChecks = await playAll("with");
    process.env.LOTUS_DISABLE_SKILL_CHECKS = "true";
    let withoutChecks: StudentScore[][];
    try { withoutChecks = await playAll("without"); } finally { delete process.env.LOTUS_DISABLE_SKILL_CHECKS; }

    console.log(`SCORECARD|plays per student per mode: ${REPEATS}`);
    HELDOUT_STUDENTS.forEach((s, i) => {
      const a = perStudent(withChecks[i]!), b = perStudent(withoutChecks[i]!);
      console.log(`SCORECARD|STUDENT|${s.id}|${s.group}|roots=[${withChecks[i]![0]!.roots.join(",")}]|WITH root ${a.root}% above ${a.above}% missed ${a.missed}% falseGapRuns ${a.falseGapRuns}/${REPEATS} q ${a.minQuestions}-${a.medianQuestions}-${a.maxQuestions} out ${a.outcomes} fg=[${a.falseGapSkills.join(",")}]|WITHOUT root ${b.root}% above ${b.above}% missed ${b.missed}% falseGapRuns ${b.falseGapRuns}/${REPEATS} q ${b.minQuestions}-${b.medianQuestions}-${b.maxQuestions} out ${b.outcomes} fg=[${b.falseGapSkills.join(",")}]`);
    });
    const a = totals(withChecks), b = totals(withoutChecks);
    const { _unused: _a, ...ta } = a; const { _unused: _b, ...tb } = b;
    console.log(`SCORECARD|TOTAL with    ${JSON.stringify(ta)}`);
    console.log(`SCORECARD|TOTAL without ${JSON.stringify(tb)}`);

    // Pre-declared criteria (see the fixture header): non-inferiority.
    assert.equal(a.runs, HELDOUT_STUDENTS.length * REPEATS);
    assert.ok(a.foundAny >= b.foundAny, "found (root or above) with the checks is not lower than without");
    assert.ok(a.falseGapRuns <= b.falseGapRuns, "false-gap runs with the checks are not higher than without");
    // Guard-rails the first scorecard met (see docs/mvp-10.0/HELDOUT_SCORECARD.md).
    assert.equal(a.capableChildrenWithFalseGap, 0, "a capable child, slips and odd methods included, never gets a confirmed gap");
    assert.equal(a.unclearWhenDeterminable, 0, "a determinable child is never reported as unclear");
    assert.equal(a.notTryingReportedUnclear, 100, "a child who isn't trying is always reported as unclear");
    assert.ok(a.medianQuestionsWithGap <= b.medianQuestionsWithGap, "the checks do not make the test longer for children with a gap");
  });

  // Pre-declared targets not met in the first scorecard (docs/mvp-10.0/HELDOUT_SCORECARD.md). Kept visible, not weakened.
  it.todo("no false gap with the checks (target: 0): evidence from a question lands on its headline skill when the cause is under a tagged skill");
  it.todo("a gap on the last skill is found, or the report says the skill was not tested (H18: cancelling terms is never asked, and the report says no gap found)");
});
