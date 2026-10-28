/**
 * Held-out scorecard v1: 24 simulated students (test/fixtures/lotus-heldout-students.ts) played
 * through the factorisation diagnostic twice, with and without the short foundation checks
 * (LOTUS_DISABLE_SKILL_CHECKS), and scored against the truth written for each student.
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

const services: LotusService[] = [];
after(() => services.forEach((service) => service.onModuleDestroy()));

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internal = (service: LotusService, sessionId: string): any => (service as unknown as { sessions: Map<string, unknown> }).sessions.get(sessionId);
let submissions = 0;

async function play(student: HeldOutStudent, mode: string): Promise<StudentScore> {
  const service = new LotusService(new PersonaFakeModels() as unknown as LotusModelService, null);
  services.push(service);
  const studentId = `heldout_${student.id}_${mode}`;
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

const rows = (scores: StudentScore[]) => scores.map((s) =>
  `SCORECARD|${s.id}|${s.group}|${s.answered}q|${s.minutes}min|${s.result}|${s.outcome}|confirmed=[${s.confirmed.join(",")}]|roots=[${s.roots.join(",")}]|falseGaps=[${s.falseGaps.join(",")}]${s.unclear ? "|UNCLEAR" : ""}`);

function summary(scores: StudentScore[]) {
  const gap = scores.filter((s) => s.result !== "NO_GAP");
  const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2) : 0; };
  return {
    students: scores.length,
    withGap: gap.length,
    foundRoot: gap.filter((s) => s.result === "FOUND_ROOT").length,
    foundAbove: gap.filter((s) => s.result === "FOUND_ABOVE").length,
    missed: gap.filter((s) => s.result === "MISSED").length,
    falseGaps: scores.reduce((n, s) => n + s.falseGaps.length, 0),
    studentsWithFalseGap: scores.filter((s) => s.falseGaps.length).length,
    unclear: scores.filter((s) => s.unclear).length,
    medianQuestions: median(scores.map((s) => s.answered)),
    medianQuestionsWithGap: median(gap.map((s) => s.answered)),
    medianMinutes: median(scores.map((s) => s.minutes)),
  };
}

describe("held-out scorecard v1", () => {
  it("scores the 24 held-out students with and without the short foundation checks", async () => {
    const withChecks: StudentScore[] = [];
    for (const student of HELDOUT_STUDENTS) withChecks.push(await play(student, "with"));
    const withoutChecks: StudentScore[] = [];
    process.env.LOTUS_DISABLE_SKILL_CHECKS = "true";
    try { for (const student of HELDOUT_STUDENTS) withoutChecks.push(await play(student, "without")); } finally { delete process.env.LOTUS_DISABLE_SKILL_CHECKS; }

    console.log("SCORECARD|== WITH short foundation checks");
    for (const line of rows(withChecks)) console.log(line);
    console.log("SCORECARD|== WITHOUT (foundations with no slot passed over)");
    for (const line of rows(withoutChecks)) console.log(line);
    const a = summary(withChecks), b = summary(withoutChecks);
    console.log(`SCORECARD|SUMMARY with    ${JSON.stringify(a)}`);
    console.log(`SCORECARD|SUMMARY without ${JSON.stringify(b)}`);

    // Pre-declared criteria (see the fixture header).
    assert.equal(a.students, 24);
    assert.ok(a.foundRoot + a.foundAbove >= b.foundRoot + b.foundAbove, "found (root or above) with the checks is not lower than without");
    assert.ok(a.falseGaps <= b.falseGaps, "false gaps with the checks are not higher than without");
    assert.equal(a.falseGaps, 0, "no false gap with the checks (target: 0)");
  });
});
