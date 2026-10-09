import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildClassReport, QUIET_MINUTES, type StudentEvidence } from "../../src/classrooms/class-report";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";
import { ClassroomSettleWorker } from "../../src/classrooms/classroom-settle.worker";

const NOW = new Date("2026-10-08T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function row(evidence: Partial<StudentEvidence> & Pick<StudentEvidence, "assignments">) {
  return buildClassReport([{ studentId: "s1", name: "Asha", diagnostic: null, ...evidence }], NOW).students[0]!;
}

describe("class report — what the teacher sees about a student mid-step", () => {
  it("a student answering now reads as working, with answers so far", () => {
    const r = row({ assignments: [{ kind: "DIAGNOSTIC", status: "IN_PROGRESS" }], lastActiveAt: minutesAgo(0.5), answeredSoFar: 4, testFinished: false });
    assert.deepEqual(r.activity, { state: "WORKING", lastActiveAt: minutesAgo(0.5).toISOString(), quietMinutes: 0, quietAfterMinutes: QUIET_MINUTES.DIAGNOSTIC, answeredSoFar: 4 });
  });

  it("a diagnostic with no answer for a few minutes reads as gone quiet", () => {
    const r = row({ assignments: [{ kind: "DIAGNOSTIC", status: "IN_PROGRESS" }], lastActiveAt: minutesAgo(QUIET_MINUTES.DIAGNOSTIC + 2) });
    assert.equal(r.activity?.state, "IDLE");
    assert.equal(r.activity?.quietMinutes, QUIET_MINUTES.DIAGNOSTIC + 2);
  });

  it("a lesson gets longer before it reads as quiet, since there is a video to watch", () => {
    const steps = [{ kind: "DIAGNOSTIC", status: "COMPLETE" }, { kind: "TEACHING", status: "IN_PROGRESS" }] as StudentEvidence["assignments"];
    assert.equal(row({ assignments: steps, lastActiveAt: minutesAgo(QUIET_MINUTES.DIAGNOSTIC + 1) }).activity?.state, "WORKING");
    assert.equal(row({ assignments: steps, lastActiveAt: minutesAgo(QUIET_MINUTES.LESSON) }).activity?.state, "IDLE");
  });

  it("a finished test whose step is not filed yet says so, instead of looking stuck", () => {
    const r = row({ assignments: [{ kind: "DIAGNOSTIC", status: "IN_PROGRESS" }], lastActiveAt: minutesAgo(20), testFinished: true, answeredSoFar: 12 });
    assert.equal(r.activity?.state, "FILING");
  });

  it("no activity line for a step not opened yet, or once everything is done", () => {
    assert.equal(row({ assignments: [{ kind: "DIAGNOSTIC", status: "READY" }], lastActiveAt: null }).activity, undefined);
    const done = row({ assignments: [{ kind: "DIAGNOSTIC", status: "COMPLETE" }, { kind: "TEACHING", status: "SKIPPED" }, { kind: "INDEPENDENT_EXIT", status: "SKIPPED" }], lastActiveAt: minutesAgo(30) });
    assert.equal(done.activity, undefined);
  });
});

/** A finished class diagnostic in each of two live checks, nothing reported by the student's page. */
function settleService(createDelayMs = 0) {
  const calls = { runsSettled: [] as string[], lessonsCreated: 0, completed: [] as string[] };
  const prisma = {
    classroomRun: { findMany: async () => [{ id: "run-1" }, { id: "run-2" }] },
    classroomAssignment: {
      findMany: async (args: { where: { runId?: string; kind?: unknown } }) => {
        if (args.where.kind !== "DIAGNOSTIC") return [];
        calls.runsSettled.push(args.where.runId!);
        // A step marked complete is no longer open.
        const id = `diag-${args.where.runId}`;
        return calls.completed.includes(id) ? [] : [{ id, enrollment: { studentId: `student-${args.where.runId}` } }];
      },
    },
    lotusSessionRecord: { findFirst: async () => ({ sessionId: "lotus-1" }) },
  };
  const videos = {
    createAssignment: async () => {
      calls.lessonsCreated += 1;
      await new Promise((resolve) => setTimeout(resolve, createDelayMs));
      return { id: "video-1" };
    },
  };
  const service = new ClassroomsService(prisma as never, videos as never);
  (service as unknown as { completeAssignment: (actor: unknown, id: string) => Promise<void> }).completeAssignment = async (_actor, id) => {
    calls.completed.push(id);
  };
  return { service, calls };
}

describe("background settling of finished class steps", () => {
  it("files a closed tab's finished diagnostic in every live check, check by check", async () => {
    const { service, calls } = settleService();
    await service.settleLiveChecks();
    assert.deepEqual(calls.runsSettled, ["run-1", "run-2"]);
    assert.equal(calls.lessonsCreated, 2);
    assert.deepEqual(calls.completed.sort(), ["diag-run-1", "diag-run-2"]);
  });

  it("a background pass and a page load reaching the same step at once make one lesson, not two", async () => {
    const { service, calls } = settleService(30);
    await Promise.all([service.settleLiveChecks(), service.settleLiveChecks()]);
    assert.equal(calls.lessonsCreated, 2, "one lesson per finished diagnostic (two checks), never a duplicate");
  });

  it("the worker never runs two passes at once", async () => {
    let passes = 0;
    let release!: () => void;
    const classrooms = { settleLiveChecks: () => { passes += 1; return new Promise<void>((resolve) => { release = resolve; }); } };
    const worker = new ClassroomSettleWorker(classrooms as never);
    const first = worker.tick();
    await worker.tick();
    release();
    await first;
    assert.equal(passes, 1);
  });
});
