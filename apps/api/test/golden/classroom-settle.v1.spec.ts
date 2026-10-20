import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";

/**
 * The teacher's view must not depend on the student's browser reporting back:
 * any read settles finished steps straight away.
 */
type Opts = {
  kind?: "DIAGNOSTIC" | "TEACHING";
  lotusStatus?: "COMPLETE" | "ACTIVE";
  endedMinutesAgo?: number;
  outcome?: string;
  lesson?: "ok" | "fails";
};

function harness({ kind = "DIAGNOSTIC", lotusStatus = "COMPLETE", endedMinutesAgo = 0, outcome = "SOLID_GAP", lesson = "ok" }: Opts) {
  const completed: Array<{ id: string; input: { diagnosticSessionId?: string; videoAssignmentId?: string } }> = [];
  const started: unknown[] = [];
  const open = [{ id: "a1", kind, status: "READY", videoAssignmentId: kind === "TEACHING" ? "video-1" : null, enrollment: { studentId: "s1" } }];
  const prisma = {
    // No startedAt on the step: the student's "started" call never arrived.
    classroomAssignment: {
      findMany: async ({ where }: { where: { kind: unknown } }) => (where.kind === "DIAGNOSTIC" ? (kind === "DIAGNOSTIC" ? open : []) : kind === "TEACHING" ? open : []),
      updateMany: async (args: unknown) => { started.push(args); return { count: 1 }; },
    },
    lotusSessionRecord: {
      findFirst: async () => ({ sessionId: "lotus-1", status: lotusStatus, startedAt: new Date(0), endedAt: new Date(Date.now() - endedMinutesAgo * 60_000) }),
      findUnique: async () => ({ payload: { finalReport: { outcome } } }),
    },
    personalizedVideoAssignment: { findFirst: async () => ({ id: "video-1", script: {} }) },
    // A lesson finished seconds ago.
    personalizedVideoEvent: { findMany: async () => [{ exitItem: null }] },
  };
  const videos = {
    createAssignment: async () => {
      if (lesson === "fails") throw new Error("no lesson");
      return { id: "video-1" };
    },
  };
  const svc = new ClassroomsService(prisma as never, videos as never);
  (svc as unknown as { completeAssignment: unknown }).completeAssignment = async (_actor: unknown, id: string, input: Opts) => {
    completed.push({ id, input: input as never });
    return {};
  };
  const settle = () => (svc as unknown as { settleFinishedDiagnostics(w: unknown): Promise<void> }).settleFinishedDiagnostics({ runId: "run-1" });
  return { settle, completed, started };
}

describe("class steps settle on the next read, not on the student's browser", () => {
  it("completes a finished diagnostic straight away, with its lesson, even if the start call never arrived", async () => {
    const h = harness({});
    await h.settle();
    assert.deepEqual(h.completed, [{ id: "a1", input: { diagnosticSessionId: "lotus-1", videoAssignmentId: "video-1", result: {} } }]);
  });

  it("marks a check as started as soon as its Lotus session exists, without the browser's start call", async () => {
    const h = harness({ lotusStatus: "ACTIVE" });
    await h.settle();
    assert.equal(h.completed.length, 0);
    assert.deepEqual(h.started, [{ where: { id: "a1", status: "READY" }, data: { status: "IN_PROGRESS", startedAt: new Date(0) } }]);
  });

  it("waits and retries when the lesson can't be made yet, so the student's lesson isn't skipped", async () => {
    const h = harness({ lesson: "fails" });
    await h.settle();
    assert.equal(h.completed.length, 0);
  });

  it("completes a no-gap check at once even without a lesson: there's nothing to teach", async () => {
    const h = harness({ lesson: "fails", outcome: "ADVANCEMENT" });
    await h.settle();
    assert.equal(h.completed[0]?.input.videoAssignmentId, undefined);
  });

  it("stops waiting for a lesson after the grace period, so the teacher is never stuck", async () => {
    const h = harness({ lesson: "fails", endedMinutesAgo: 3 });
    await h.settle();
    assert.equal(h.completed.length, 1);
  });

  it("completes a lesson step the moment the lesson is finished (no 30-minute wait)", async () => {
    const h = harness({ kind: "TEACHING" });
    await h.settle();
    assert.deepEqual(h.completed.map((c) => c.id), ["a1"]);
  });
});
