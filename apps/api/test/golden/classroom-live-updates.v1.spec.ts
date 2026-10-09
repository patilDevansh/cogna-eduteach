import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ClassroomEventsService, openEventStream, type ClassEvent } from "../../src/classrooms/classroom-events";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";
// The browser's reader, so the wire format is checked from both ends.
import { openEventStream as readEventStream } from "../../../web/src/lib/event-stream";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("live class updates — the event hub", () => {
  it("a burst of changes reaches an open page once, with the latest answer per student", async () => {
    const events = new ClassroomEventsService();
    const seen: ClassEvent[] = [];
    const stop = events.subscribeClass("class-1", (e) => seen.push(e));
    events.classChanged("class-1", { type: "progress", runId: "run-1" });
    events.classChanged("class-1", { type: "progress", runId: "run-1" });
    events.classChanged("class-1", { type: "activity", runId: "run-1", studentId: "s1", answeredSoFar: 3, lastActiveAt: "2026-10-08T10:00:00Z", testFinished: false });
    events.classChanged("class-1", { type: "activity", runId: "run-1", studentId: "s1", answeredSoFar: 4, lastActiveAt: "2026-10-08T10:00:30Z", testFinished: false });
    events.classChanged("class-2", { type: "roster" });
    await wait(600);
    assert.deepEqual(seen, [
      { type: "progress", runId: "run-1" },
      { type: "activity", runId: "run-1", studentId: "s1", answeredSoFar: 4, lastActiveAt: "2026-10-08T10:00:30Z", testFinished: false },
    ]);
    stop();
  });

  it("a closed page hears nothing more", async () => {
    const events = new ClassroomEventsService();
    const seen: unknown[] = [];
    const stop = events.subscribeStudent("s1", (e) => seen.push(e));
    stop();
    events.studentsChanged(["s1"]);
    await wait(600);
    assert.equal(seen.length, 0);
  });

  it("a Lotus save for a class step reaches that class's page, looking the step up once", async () => {
    let lookups = 0;
    const prisma = { classroomAssignment: { findUnique: async () => { lookups += 1; return { runId: "run-1", run: { classroomId: "class-1" } }; } } };
    const events = new ClassroomEventsService(prisma as never);
    const seen: ClassEvent[] = [];
    events.subscribeClass("class-1", (e) => seen.push(e));
    const save = { classroomAssignmentId: "a1", studentId: "s1", answeredSoFar: 2, lastActiveAt: "2026-10-08T10:00:00Z", finished: false };
    await events.lotusSaved(save);
    await events.lotusSaved({ ...save, answeredSoFar: 3 });
    await wait(600);
    assert.equal(lookups, 1);
    assert.deepEqual(seen, [{ type: "activity", runId: "run-1", studentId: "s1", answeredSoFar: 3, lastActiveAt: "2026-10-08T10:00:00Z", testFinished: false }]);
  });

  it("with no page open anywhere, a Lotus save costs no database read", async () => {
    let lookups = 0;
    const events = new ClassroomEventsService({ classroomAssignment: { findUnique: async () => { lookups += 1; return null; } } } as never);
    await events.lotusSaved({ classroomAssignmentId: "a1", studentId: "s1", answeredSoFar: 1, lastActiveAt: "2026-10-08T10:00:00Z", finished: false });
    assert.equal(lookups, 0);
  });
});

describe("live class updates — what triggers them", () => {
  it("launching a check tells the class page and every student sent work", async () => {
    const changed: Array<{ classroomId: string; event: ClassEvent }> = [];
    const students: string[] = [];
    const events = { classChanged: (classroomId: string, event: ClassEvent) => changed.push({ classroomId, event }), studentsChanged: (ids: string[]) => students.push(...ids) };
    const prisma = {
      teacher: { findUnique: async () => ({ id: "teacher-1", schoolId: "school-1" }) },
      classroomRun: { findFirst: async () => ({ id: "run-1", classroomId: "class-1", status: "DRAFT", config: {}, startedAt: null, classroom: { id: "class-1" } }), update: async (a: unknown) => a },
      classroomEnrollment: { findMany: async () => [{ id: "e1", studentId: "s1" }, { id: "e2", studentId: "s2" }] },
      classroomAssignment: { findMany: async () => [], createMany: async (a: unknown) => a },
      $transaction: async (actions: Array<Promise<unknown>>) => Promise.all(actions),
    };
    const service = new ClassroomsService(prisma as never, undefined, events as never);
    (service as unknown as { report: () => Promise<null> }).report = async () => null;
    await service.launchPhase({ role: "teacher", teacherEmail: "t@school.test", schoolId: "school-1" } as never, "run-1", "DIAGNOSTIC");
    assert.deepEqual(changed, [{ classroomId: "class-1", event: { type: "progress", runId: "run-1" } }]);
    assert.deepEqual(students, ["s1", "s2"]);
  });
});

describe("live class updates — over the wire", () => {
  const servers: Server[] = [];
  after(() => servers.forEach((s) => s.close()));

  it("the browser's reader receives what the API streams, and the API lets go when the page closes", async () => {
    const events = new ClassroomEventsService();
    let headerSeen = "";
    const server = createServer((req, res) => {
      headerSeen = String(req.headers["x-cogna-teacher-token"] ?? "");
      openEventStream(req, res, (send) => events.subscribeClass("class-1", send));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const received: Array<{ type: string }> = [];
    const connected: boolean[] = [];
    const close = readEventStream(`http://127.0.0.1:${port}/classrooms/class-1/events`, () => ({ "X-Cogna-Teacher-Token": "signed-token" }), (e) => received.push(e), (c) => connected.push(c));
    for (let i = 0; i < 50 && !connected.includes(true); i++) await wait(20);
    events.classChanged("class-1", { type: "progress", runId: "run-1" });
    await wait(700);
    close();
    await wait(100);

    assert.equal(headerSeen, "signed-token", "sign-in travels as a header, never in the URL");
    assert.deepEqual(received.map((e) => e.type), ["ready", "progress"]);
    assert.deepEqual(connected, [true]);
    events.classChanged("class-1", { type: "roster" });
    await wait(600);
    assert.equal(received.length, 2, "a closed page is unsubscribed");
  });
});
