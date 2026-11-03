import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { it } from "node:test";
import { PrismaClient } from "@cogna/database";
import { ModuleLearningService } from "../../src/module-learning/module-learning.service";

const url = process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL;
const allowed = !!url && new URL(url).hostname === "127.0.0.1" && new URL(url).port === "55439" && new URL(url).pathname === "/cogna_s1";

it("persists a teaching-first run across clients with ownership, replay and revision checks", { skip: !allowed }, async () => {
  const db = new PrismaClient({ datasourceUrl: url! });
  const second = new PrismaClient({ datasourceUrl: url! });
  const prefix = `module_${randomUUID()}`;
  const studentId = `${prefix}_student`;
  const otherId = `${prefix}_other`;
  const schoolId = `${prefix}_school`;
  const teacherEmail = `${prefix}@example.test`;
  const oldFlag = process.env.MODULE_LEARNING_ENABLED;
  process.env.MODULE_LEARNING_ENABLED = "true";
  try {
    await db.student.createMany({ data: [{ id: studentId, primaryParentId: `${prefix}_parent`, name: "Synthetic learner", accessCodeHash: "fixture" }, { id: otherId, primaryParentId: `${prefix}_parent`, name: "Other learner", accessCodeHash: "fixture" }] });
    const service = new ModuleLearningService(db as any);
    const actor = { role: "student" as const, studentId };
    const started = await service.startSelf(actor, { flow: "MODULE_LEARNING_V1", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_self` });
    assert.equal(started.state.stage, "TEACHING");
    assert.equal(started.state.exitItemId, "EXIT_FACT_01");
    assert.equal(started.identity.source, "SELF_DIRECTED");
    assert.equal((await service.startSelf(actor, { flow: "MODULE_LEARNING_V1", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_self` })).identity.runId, started.identity.runId);
    const repeated = await service.startSelf(actor, { flow: "MODULE_LEARNING_V1", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_repeat` });
    assert.equal(repeated.identity.repeatOfRunId, started.identity.runId);
    assert.equal(repeated.state.exitItemId, "EXIT_FACT_02");
    const runId = started.identity.runId;
    await assert.rejects(() => service.getRun({ role: "student", studentId: otherId }, runId));
    const eventId = `${prefix}_present`;
    process.env.MODULE_LEARNING_ENABLED = "false";
    await assert.rejects(() => service.startSelf(actor, { flow: "MODULE_LEARNING_V1", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_disabled` }));
    const body = { eventId, expectedRevision: 0, action: { kind: "PRESENTED", segmentId: "DEFAULT_PAIR_PRODUCT_SUM", representation: "STATIC_TEXT" } };
    const checked = await service.act(actor, runId, body);
    process.env.MODULE_LEARNING_ENABLED = "true";
    assert.equal(checked.state.stage, "CHECKPOINT");
    assert.equal((await service.act(actor, runId, body)).state.revision, 1);
    assert.equal(await db.rawEvent.count({ where: { eventId } }), 1);
    await assert.rejects(() => service.act({ role: "student", studentId: otherId }, runId, body));
    await assert.rejects(() => service.act(actor, runId, { eventId: `${prefix}_stale`, expectedRevision: 0, action: { kind: "ANSWER", itemId: "PRAC_FACT_01", answer: "(x+2)(x+5)" } }));
    const restarted = new ModuleLearningService(second as any);
    assert.equal((await restarted.getRun(actor, runId)).state.revision, 1);
    const answer = await restarted.act(actor, runId, { eventId: `${prefix}_answer`, expectedRevision: 1, action: { kind: "ANSWER", itemId: "PRAC_FACT_01", answer: "(x-2)(x-5)" } });
    assert.equal(answer.state.stage, "PREREQUISITE_CHECK");
    assert.equal(answer.state.supportTarget, null);
    const exposure = await db.rawEvent.findUnique({ where: { eventId } });
    assert.equal((exposure?.payload as any)?.observation?.exposureTag, "TEACH_MATH_8_FACT_MONIC_TRINOMIAL@1.0.0/DEFAULT_PAIR_PRODUCT_SUM");

    const user = await db.user.create({ data: { role: "TEACHER", email: teacherEmail } });
    const teacher = await db.teacher.create({ data: { identityKey: `${schoolId}:${teacherEmail}`, userId: user.id, schoolId, name: "Synthetic teacher" } });
    const classroom = await db.classroom.create({ data: { teacherId: teacher.id, schoolId, name: "Synthetic Grade 8", grade: 8, subjectId: "math", joinCode: `ML${randomUUID().replaceAll("-", "").slice(0, 10)}` } });
    await db.classroomEnrollment.create({ data: { classroomId: classroom.id, studentId } });
    const assigned = await service.assignClass({ role: "teacher", teacherEmail, schoolId }, { flow: "MODULE_LEARNING_V1", classroomId: classroom.id, moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_assigned` });
    assert.equal(assigned.runs.length, 1);
    assert.equal(assigned.runs[0]!.identity.source, "TEACHER_ASSIGNED");
    assert.equal(assigned.runs[0]!.state.exitItemId, "EXIT_FACT_03");
    assert.equal((await service.assignClass({ role: "teacher", teacherEmail, schoolId }, { flow: "MODULE_LEARNING_V1", classroomId: classroom.id, moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_assigned` })).runs[0]!.identity.runId, assigned.runs[0]!.identity.runId);
    await assert.rejects(() => service.getRun({ role: "teacher", teacherEmail: "another@example.test", schoolId }, assigned.runs[0]!.identity.runId));
    await assert.rejects(() => service.getRun({ role: "teacher", teacherEmail, schoolId }, runId));
    const fourth = await service.startSelf(actor, { flow: "MODULE_LEARNING_V1", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_fourth` });
    assert.equal(fourth.state.exitItemId, "EXIT_FACT_04");
    await assert.rejects(() => service.startSelf(actor, { flow: "MODULE_LEARNING_V1", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_fifth` }), /No unused independent check remains/);
    await db.classroomEnrollment.create({ data: { classroomId: classroom.id, studentId: otherId } });
    const classLaunchId = `${prefix}_atomic_failure`;
    await assert.rejects(() => service.assignClass({ role: "teacher", teacherEmail, schoolId }, { flow: "MODULE_LEARNING_V1", classroomId: classroom.id, moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: classLaunchId, studentIds: [otherId, studentId] }), /No unused independent check remains/);
    assert.equal(await db.rawEvent.count({ where: { eventId: `MODULE_START_${classLaunchId}_${otherId}` } }), 0);
    const assignedRunId = assigned.runs[0]!.identity.runId;
    const paused = await service.act({ role: "teacher", teacherEmail, schoolId }, assignedRunId, { eventId: `${prefix}_teacher_pause`, expectedRevision: 0, action: { kind: "TEACHER_PAUSE" } });
    assert.equal(paused.state.teacherPaused, true);
    await assert.rejects(() => service.act(actor, assignedRunId, { eventId: `${prefix}_blocked`, expectedRevision: 1, action: { kind: "PRESENTED", segmentId: "DEFAULT_PAIR_PRODUCT_SUM", representation: "STATIC_TEXT" } }));
    const successorEmail = `${prefix}_successor@example.test`;
    const successorUser = await db.user.create({ data: { role: "TEACHER", email: successorEmail } });
    const successor = await db.teacher.create({ data: { identityKey: `${schoolId}:${successorEmail}`, userId: successorUser.id, schoolId, name: "Successor teacher" } });
    await db.classroom.update({ where: { id: classroom.id }, data: { teacherId: successor.id } });
    await assert.rejects(() => service.getRun({ role: "teacher", teacherEmail, schoolId }, assignedRunId), /no longer owned/);
    await assert.rejects(() => service.act({ role: "teacher", teacherEmail, schoolId }, assignedRunId, { eventId: `${prefix}_old_teacher_resume`, expectedRevision: 1, action: { kind: "TEACHER_RESUME" } }), /no longer owned/);
    await db.classroom.update({ where: { id: classroom.id }, data: { teacherId: teacher.id } });
    const startEventId = `MODULE_START_${prefix}_self`;
    const originalStart = await db.rawEvent.findUniqueOrThrow({ where: { eventId: startEventId } });
    const originalPayload = originalStart.payload as any;
    await db.rawEvent.update({ where: { eventId: startEventId }, data: { payload: { ...originalPayload, identity: { ...originalPayload.identity, packageVersion: "withdrawn-test-version" } } } });
    await assert.rejects(() => service.getRun(actor, runId), /original reviewed content version/);
    await db.rawEvent.update({ where: { eventId: startEventId }, data: { payload: originalStart.payload as any } });
  } finally {
    await db.rawEvent.deleteMany({ where: { studentId: { in: [studentId, otherId] }, eventType: { startsWith: "MODULE_" } } });
    await db.classroomEnrollment.deleteMany({ where: { studentId: { in: [studentId, otherId] } } });
    await db.classroom.deleteMany({ where: { schoolId } });
    await db.teacher.deleteMany({ where: { schoolId } });
    await db.user.deleteMany({ where: { email: { in: [teacherEmail, `${prefix}_successor@example.test`] } } });
    await db.student.deleteMany({ where: { id: { in: [studentId, otherId] } } });
    await Promise.all([db.$disconnect(), second.$disconnect()]);
    if (oldFlag === undefined) delete process.env.MODULE_LEARNING_ENABLED; else process.env.MODULE_LEARNING_ENABLED = oldFlag;
  }
});

it("reserves different independent exit items for simultaneous launches", { skip: !allowed }, async () => {
  const db = new PrismaClient({ datasourceUrl: url! });
  const prefix = `module_race_${randomUUID()}`;
  const studentId = `${prefix}_student`;
  const oldFlag = process.env.MODULE_LEARNING_ENABLED;
  process.env.MODULE_LEARNING_ENABLED = "true";
  try {
    await db.student.create({ data: { id: studentId, primaryParentId: `${prefix}_parent`, name: "Concurrent synthetic learner", accessCodeHash: "fixture" } });
    const service = new ModuleLearningService(db as any);
    const [first, second] = await Promise.all(["first", "second"].map(suffix => service.startSelf({ role: "student", studentId }, { flow: "MODULE_LEARNING_V1", moduleId: "MATH_8_FACT_MONIC_TRINOMIAL", requestId: `${prefix}_${suffix}` })));
    assert.notEqual(first.identity.runId, second.identity.runId);
    assert.deepEqual(new Set([first.state.exitItemId, second.state.exitItemId]), new Set(["EXIT_FACT_01", "EXIT_FACT_02"]));
  } finally {
    await db.rawEvent.deleteMany({ where: { studentId, eventType: { startsWith: "MODULE_" } } });
    await db.student.delete({ where: { id: studentId } }).catch(() => undefined);
    await db.$disconnect();
    if (oldFlag === undefined) delete process.env.MODULE_LEARNING_ENABLED; else process.env.MODULE_LEARNING_ENABLED = oldFlag;
  }
});
