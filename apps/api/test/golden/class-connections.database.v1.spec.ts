/**
 * Parent ↔ school connections and the teacher's controls during a check,
 * against the real local Postgres (same local-only gate as the other
 * database specs): a parent links a school-made student through the phone on
 * the school's record (or the teacher's approval), hears when a check finishes
 * or catch-up is set, and the teacher can
 * restart one student, pause, set a time limit, and remind latecomers.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient, UserRole } from "@cogna/database";
import { ClassroomsService } from "../../src/classrooms/classrooms.service";
import { ClassroomEventsService, type StudentEvent } from "../../src/classrooms/classroom-events";
import { ParentsService } from "../../src/parents/parents.service";
import { LotusService } from "../../src/lotus/lotus.service";
import type { LotusModelService } from "../../src/lotus/lotus-model.service";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";

function configuredLocalDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return localOnly(process.env.DATABASE_URL.trim());
  const path = [resolve(process.cwd(), "packages/database/.env"), resolve(process.cwd(), "../../packages/database/.env")].find((candidate) => {
    try {
      return readFileSync(candidate, "utf8").includes("DATABASE_URL=");
    } catch {
      return false;
    }
  });
  if (!path) throw new Error("No local database configuration was found for the class-connections gate.");
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((value) => value.startsWith("DATABASE_URL="));
  const value = line?.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error("DATABASE_URL is blank in the local configuration.");
  return localOnly(value);
}

function localOnly(value: string): string {
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") throw new Error("The class-connections gate only runs against a local development database.");
  return value;
}

const prisma = new PrismaClient({ datasourceUrl: configuredLocalDatabaseUrl() });
const tag = `classconn_${Date.now()}`;
const teacherEmail = `${tag}@school.test`;
const teacher = { role: "teacher", teacherEmail, schoolId: tag } as never;
const events = new ClassroomEventsService(prisma as never);
const classrooms = new ClassroomsService(prisma as never, undefined, events);
const parents = new ParentsService(prisma as never, {} as never, classrooms, {} as never);
const lotusServices: LotusService[] = [];
let classroomId = "";
let parentId = "";

before(async () => {
  const teacherUser = await prisma.user.create({ data: { clerkId: `${tag}_teacher`, role: UserRole.TEACHER, teacher: { create: { identityKey: `${tag}:${teacherEmail}`, schoolId: tag, name: "Ms Rao" } } }, include: { teacher: true } });
  classroomId = (await prisma.classroom.create({ data: { teacherId: teacherUser.teacher!.id, schoolId: tag, name: "8A", grade: 8, subjectId: "math", joinCode: tag.slice(-10).toUpperCase() } })).id;
  parentId = (await prisma.user.create({ data: { clerkId: `${tag}_parent`, role: UserRole.PARENT, parent: { create: { name: "Asha's parent" } } }, include: { parent: true } })).parent!.id;
});

after(async () => {
  lotusServices.forEach((s) => s.onModuleDestroy());
  const students = await prisma.classroomEnrollment.findMany({ where: { classroomId }, select: { studentId: true } });
  // Children the test parents added at home, plus everyone in the class.
  const homeMade = await prisma.student.findMany({ where: { primaryParentId: { in: (await prisma.parent.findMany({ where: { user: { clerkId: { startsWith: tag } } }, select: { id: true } })).map((p) => p.id) } }, select: { id: true } });
  const ids = [...students.map((s) => s.studentId), ...homeMade.map((s) => s.id)];
  await prisma.lotusSessionRecord.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.consent.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.student.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { OR: [{ clerkId: { startsWith: tag } }, { clerkId: `school_roster:${tag}` }] } });
  await prisma.$disconnect();
});

async function importOne(name: string, phones: string[] = []) {
  const { students } = await classrooms.importStudents(teacher, classroomId, [{ name, phones }], true);
  return students[0]!;
}

/** A finished Lotus diagnostic for this step, as the student's own session would leave it. */
async function finishedDiagnostic(studentId: string, classroomAssignmentId: string, outcome: string) {
  const sessionId = `${tag}_${classroomAssignmentId}`;
  await prisma.lotusSessionRecord.create({
    data: { sessionId, studentId, status: "COMPLETE", phase: "REPORT", startedAt: new Date(), endedAt: new Date(), payload: { classroomAssignmentId, topic: "BRACKETS", audits: [], finalReport: { outcome, skills: [] } } },
  });
  return sessionId;
}

async function liveCheck(config: Record<string, unknown> = {}) {
  const run = await classrooms.createRun(teacher, classroomId, { title: "Linear equations in one variable · Diagnostic", topicId: "linear-equations", config });
  await classrooms.launchPhase(teacher, run.id, "DIAGNOSTIC");
  return run.id;
}

async function stepFor(runId: string, studentId: string) {
  return prisma.classroomAssignment.findFirstOrThrow({ where: { runId, kind: "DIAGNOSTIC", enrollment: { studentId } } });
}

let phoneSeq = 0;
/** A fresh Indian mobile per call, unique to this run. */
const newPhone = () => `98${String(Date.now()).slice(-6)}${String(phoneSeq++).padStart(2, "0")}`;

async function newParent(label: string) {
  return (await prisma.user.create({ data: { clerkId: `${tag}_${label}_${phoneSeq++}`, role: UserRole.PARENT, parent: { create: { name: label } } }, include: { parent: true } })).parent!.id;
}

/** The parent proves they hold the phone with the texted code (handed back outside production). */
async function verify(parent: string, phone: string) {
  const sent = await parents.sendPhoneCode(parent, phone);
  assert.match(sent.devCode ?? "", /^\d{6}$/);
  return parents.verifyPhone(parent, phone, sent.devCode!);
}

/** A school-made student listed with this phone, linked by a parent who verified it and said yes. */
async function linkedByPhone(parent: string, name: string) {
  const phone = newPhone();
  const issued = await importOne(name, [phone]);
  await verify(parent, phone);
  await parents.answerSchoolChild(parent, issued.studentId, true);
  return issued;
}

describe("a parent links a school-made student through the phone on the school's record", () => {
  it("the school lists the number; the parent proves it, says yes, and the school still runs sign-in", async () => {
    const parent = await newParent("Asha's mother");
    const phone = newPhone();
    await assert.rejects(classrooms.importStudents(teacher, classroomId, [{ name: "No Consent" }]), /consent/, "the school confirms its own consent first");
    const issued = await importOne("Asha Verma", [`${phone.slice(0, 5)} ${phone.slice(5)}`]);
    assert.equal(await prisma.consent.count({ where: { studentId: issued.studentId, consentType: "SCHOOL_CONSENT" } }), 1);

    assert.deepEqual(await parents.schoolChildren(parent), [], "nothing shows before the phone is proved");
    const sent = await parents.sendPhoneCode(parent, `0${phone}`);
    assert.equal(sent.phone, `+91${phone}`);
    await assert.rejects(parents.verifyPhone(parent, phone, sent.devCode === "000000" ? "111111" : "000000"), /didn't match/);
    const { children } = await parents.verifyPhone(parent, `+91 ${phone}`, sent.devCode!);
    assert.deepEqual(children.map((c) => [c.name, c.status, c.className, c.teacherName]), [["Asha Verma", "WAITING", "8A", "Ms Rao"]]);

    const answered = await parents.answerSchoolChild(parent, issued.studentId, true);
    assert.equal(answered[0]!.status, "LINKED");
    assert.equal((await prisma.parentStudentLink.findUniqueOrThrow({ where: { parentId_studentId: { parentId: parent, studentId: issued.studentId } } })).source, "PHONE");
    assert.equal(await prisma.consent.count({ where: { parentId: parent, studentId: issued.studentId, consentType: "PRACTICE_CONSENT", revokedAt: null } }), 1);
    assert.deepEqual((await parents.listStudents(parent)).map((s) => [s.id, s.fromSchool]), [[issued.studentId, true]]);

    // The school keeps the student: the teacher can still issue a code, the parent can't take over sign-in.
    assert.ok((await classrooms.resetAccessCode(teacher, classroomId, issued.studentId)).accessCode);
    await assert.rejects(parents.regenerateAccessCode(parent, issued.studentId), ForbiddenException);
    const row = (await classrooms.roster(teacher, classroomId)).find((r) => r.studentId === issued.studentId)!;
    assert.deepEqual(row.guardians.map((g) => g.status), ["LINKED"]);
    assert.deepEqual(row.parents.map((p) => [p.parentId, p.source]), [[parent, "PHONE"]]);
  });

  it("both parents link with their own numbers; whoever proves a number later takes it over", async () => {
    const [mother, father, newAccount] = [await newParent("mother"), await newParent("father"), await newParent("new account")];
    const [a, b] = [newPhone(), newPhone()];
    const issued = await importOne("Ben Thomas", [a, b]);
    await verify(mother, a);
    await verify(father, b);
    await parents.answerSchoolChild(mother, issued.studentId, true);
    await parents.answerSchoolChild(father, issued.studentId, true);
    assert.equal((await classrooms.roster(teacher, classroomId)).find((r) => r.studentId === issued.studentId)!.parents.length, 2);

    await verify(newAccount, a);
    assert.deepEqual(await parents.listStudents(mother), [], "the old account lost the number and the child it found");
    assert.equal((await parents.getPhone(mother)).phone, null);
    assert.equal((await parents.schoolChildren(newAccount))[0]!.status, "WAITING", "the new holder still answers for themselves");
  });

  it("the teacher fixes the record: removing a number unlinks; unlinking takes the number off", async () => {
    const parent = await newParent("wrong link");
    const issued = await linkedByPhone(parent, "Chitra Rao");
    await classrooms.setGuardianPhones(teacher, classroomId, issued.studentId, []);
    assert.deepEqual(await parents.listStudents(parent), []);
    assert.equal(await prisma.consent.count({ where: { parentId: parent, studentId: issued.studentId, revokedAt: null } }), 0);

    const other = await newParent("unlinked");
    const second = await linkedByPhone(other, "Divya Rao");
    const row = await classrooms.unlinkParent(teacher, classroomId, second.studentId, other);
    assert.deepEqual(row?.parents, []);
    assert.deepEqual(row?.guardians, [], "they can't link straight back");
    await assert.rejects(classrooms.setGuardianPhones(teacher, classroomId, second.studentId, [{ phone: "12345" }]), /isn't a mobile number/);
  });

  it("a parent who says no is recorded, and the teacher sees it", async () => {
    const parent = await newParent("declines");
    const phone = newPhone();
    const issued = await importOne("Esha Pillai", [phone]);
    await verify(parent, phone);
    assert.equal((await parents.answerSchoolChild(parent, issued.studentId, false))[0]!.status, "DECLINED");
    assert.deepEqual((await classrooms.roster(teacher, classroomId)).find((r) => r.studentId === issued.studentId)!.guardians.map((g) => g.status), ["DECLINED"]);
    assert.equal((await parents.answerSchoolChild(parent, issued.studentId, true))[0]!.status, "LINKED", "they can change their mind");
    assert.equal(await prisma.consent.count({ where: { parentId: parent, studentId: issued.studentId, revokedAt: null } }), 1);
  });

  it("a parent the school has no number for asks; the teacher picks the student and approves", async () => {
    const parent = await newParent("not on record");
    const phone = newPhone();
    await verify(parent, phone);
    const issued = await importOne("Farhan Ali");
    const joinCode = (await prisma.classroom.findUniqueOrThrow({ where: { id: classroomId } })).joinCode;
    await assert.rejects(parents.requestLink(parent, { joinCode: "NOPE-000", childName: "Farhan Ali" }), NotFoundException);
    await parents.requestLink(parent, { joinCode: joinCode.toLowerCase(), childName: "farhan ali" });
    assert.equal((await parents.requestLink(parent, { joinCode, childName: "Farhan Ali" })).length, 1, "asking twice is one request");

    const [request] = await classrooms.linkRequests(teacher, classroomId);
    assert.equal(request!.suggestions[0]!.studentId, issued.studentId);
    assert.deepEqual(await classrooms.approveLinkRequest(teacher, classroomId, request!.id, issued.studentId), []);
    assert.equal((await prisma.parentStudentLink.findUniqueOrThrow({ where: { parentId_studentId: { parentId: parent, studentId: issued.studentId } } })).source, "TEACHER_APPROVED");
    assert.equal(await prisma.consent.count({ where: { parentId: parent, studentId: issued.studentId, consentType: "PRACTICE_CONSENT" } }), 1);
    assert.deepEqual((await classrooms.roster(teacher, classroomId)).find((r) => r.studentId === issued.studentId)!.guardians.map((g) => [g.phone, g.status]), [[`+91${phone}`, "LINKED"]], "their number joins the record");
    assert.equal((await parents.listLinkRequests(parent))[0]!.status, "APPROVED");
  });

  it("codes are limited: a few per window, a few tries each, and only the latest one counts", async () => {
    const parent = await newParent("rate limited");
    const phone = newPhone();
    await parents.sendPhoneCode(parent, phone);
    await parents.sendPhoneCode(parent, phone);
    const last = await parents.sendPhoneCode(parent, phone);
    await assert.rejects(parents.sendPhoneCode(parent, phone), /Too many codes/);
    const wrong = last.devCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await assert.rejects(parents.verifyPhone(parent, phone, wrong), /didn't match/);
    await assert.rejects(parents.verifyPhone(parent, phone, last.devCode!), /Too many tries/);
    await assert.rejects(parents.sendPhoneCode(parent, "12345"), /doesn't look like a mobile/);
  });
});

describe("after linking: texts, leaving, a changed number, and a child added twice", () => {
  it("texts each update once to parents with a verified phone, never to those who turned texts off", async () => {
    const [on, off] = [await newParent("texts on"), await newParent("texts off")];
    const [a, b] = [newPhone(), newPhone()];
    const issued = await importOne("Gita Bose", [a, b]);
    await verify(on, a);
    await verify(off, b);
    await parents.answerSchoolChild(on, issued.studentId, true);
    await parents.answerSchoolChild(off, issued.studentId, true);
    assert.equal((await parents.setTextUpdates(off, false)).textUpdates, false);

    await liveCheck({ kind: "CATCH_UP", studentIds: [issued.studentId] });
    const notes = await prisma.parentNotification.findMany({ where: { studentId: issued.studentId, kind: "CATCH_UP_SET" } });
    assert.equal(notes.length, 2, "both still see it in the app");
    assert.ok(notes.find((n) => n.parentId === on)!.textedAt, "texted (logged here, as Twilio isn't set up)");
    assert.equal(notes.find((n) => n.parentId === off)!.textedAt, null);
  });

  it("a parent the teacher approves hears about it", async () => {
    const parent = await newParent("approved");
    await verify(parent, newPhone());
    const issued = await importOne("Hari Das");
    const joinCode = (await prisma.classroom.findUniqueOrThrow({ where: { id: classroomId } })).joinCode;
    const seen: string[] = [];
    const original = events.classChanged.bind(events);
    events.classChanged = (id: string, e: Parameters<typeof original>[1]) => { seen.push(`${id}:${e.type}`); original(id, e); };
    await parents.requestLink(parent, { joinCode, childName: "Hari Das" });
    events.classChanged = original;
    assert.ok(seen.includes(`${classroomId}:roster`), "the teacher's page hears about the request at once");

    const request = (await classrooms.linkRequests(teacher, classroomId)).find((r) => r.childName === "Hari Das")!;
    await classrooms.approveLinkRequest(teacher, classroomId, request.id, issued.studentId);
    const note = await prisma.parentNotification.findFirstOrThrow({ where: { parentId: parent, kind: "LINK_APPROVED" } });
    assert.match(note.body, /Ms Rao linked Hari to your account/);
    assert.ok(note.textedAt);
  });

  it("a parent can stop following a school child, and agree again later", async () => {
    const parent = await newParent("leaves");
    const issued = await linkedByPhone(parent, "Indu Rao");
    await assert.rejects(parents.leaveSchoolChild(parent, "nobody"), NotFoundException);
    assert.deepEqual(await parents.leaveSchoolChild(parent, issued.studentId), []);
    assert.equal(await prisma.consent.count({ where: { parentId: parent, studentId: issued.studentId, consentType: "PRACTICE_DECLINED", revokedAt: null } }), 1);
    assert.equal((await parents.schoolChildren(parent))[0]!.status, "DECLINED");
    assert.equal((await parents.answerSchoolChild(parent, issued.studentId, true))[0]!.status, "LINKED");
  });

  it("changing number unlinks the children found through the old one", async () => {
    const parent = await newParent("new number");
    const issued = await linkedByPhone(parent, "Jai Sen");
    await verify(parent, newPhone());
    assert.deepEqual(await parents.listStudents(parent), []);
    assert.deepEqual(await parents.schoolChildren(parent), []);
    assert.equal(await prisma.parentStudentLink.count({ where: { studentId: issued.studentId, parentId: parent } }), 0);
  });

  it("a child added at home with the same first name as one from school is flagged once", async () => {
    const parent = await newParent("twice");
    const issued = await linkedByPhone(parent, "Kavya Iyer");
    const home = await parents.createStudent(parent, { name: "Kavya" });
    const flagged = (await parents.listStudents(parent)).find((s) => s.id === home.studentId)!;
    assert.deepEqual(flagged.sameAsSchoolChild, { id: issued.studentId, name: "Kavya Iyer" });

    const kept = await parents.resolveDuplicate(parent, home.studentId, { same: true, schoolChildId: issued.studentId });
    assert.deepEqual(kept.map((s) => s.id), [issued.studentId], "only the school record is shown");
    assert.ok((await prisma.student.findUniqueOrThrow({ where: { id: home.studentId } })).deletedAt, "the home copy is hidden, not erased");

    const other = await parents.createStudent(parent, { name: "Kavya" });
    const after = await parents.resolveDuplicate(parent, other.studentId, { same: false });
    assert.equal(after.find((s) => s.id === other.studentId)!.sameAsSchoolChild, undefined, "different children stop being flagged");
    await assert.rejects(parents.resolveDuplicate(parent, issued.studentId, { same: true }), NotFoundException, "only a child they added can be hidden");
  });
});

describe("parents hear from school", () => {
  it("when their child finishes a check, once, and never the school's placeholder account", async () => {
    const issued = await linkedByPhone(parentId, "Chitra Nair");
    const runId = await liveCheck();
    const step = await stepFor(runId, issued.studentId);
    const sessionId = await finishedDiagnostic(issued.studentId, step.id, "ADVANCEMENT");
    await classrooms.completeAssignment({ role: "student", studentId: issued.studentId } as never, step.id, { diagnosticSessionId: sessionId, result: {} });

    const notes = await prisma.parentNotification.findMany({ where: { studentId: issued.studentId } });
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.parentId, parentId);
    assert.equal(notes[0]!.kind, "CHECK_FINISHED");
    assert.match(notes[0]!.body, /^Chitra finished the diagnostic on linear equations in one variable: nothing to fix right now\.$/);

    const feed = await parents.listNotifications(parentId);
    assert.ok(feed.unread >= 1);
    assert.ok(feed.items.some((n) => n.studentName === "Chitra Nair"));
    await parents.markNotificationsRead(parentId);
    assert.equal((await parents.listNotifications(parentId)).unread, 0);
  });

  it("when the teacher sets their child a catch-up", async () => {
    const issued = await linkedByPhone(parentId, "Dev Shah");
    await liveCheck({ kind: "CATCH_UP", studentIds: [issued.studentId] });
    const note = await prisma.parentNotification.findFirstOrThrow({ where: { studentId: issued.studentId, kind: "CATCH_UP_SET" } });
    assert.match(note.body, /Ms Rao set Dev a short catch-up on linear equations in one variable/);
  });
});

describe("the teacher's controls during a check", () => {
  it("restart one student: their test starts again, and the old session is neither resumed nor counted", async () => {
    const issued = await importOne("Esha Rao");
    const runId = await liveCheck();
    const step = await stepFor(runId, issued.studentId);
    const oldSession = await finishedDiagnostic(issued.studentId, step.id, "ADVANCEMENT");
    await classrooms.completeAssignment({ role: "student", studentId: issued.studentId } as never, step.id, { diagnosticSessionId: oldSession, result: {} });
    await new Promise((r) => setTimeout(r, 5));

    await classrooms.restartStudent(teacher, runId, issued.studentId);
    const steps = await prisma.classroomAssignment.findMany({ where: { runId, enrollment: { studentId: issued.studentId } } });
    assert.deepEqual(steps.map((s) => [s.kind, s.status]), [["DIAGNOSTIC", "READY"]], "lesson and final question cleared");

    const lotus = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma);
    lotusServices.push(lotus);
    const fresh = await lotus.start(issued.studentId, "BRACKETS", step.id);
    assert.notEqual(fresh.sessionId, oldSession, "a restarted student is not handed their old test");
    await assert.rejects(
      classrooms.completeAssignment({ role: "student", studentId: issued.studentId } as never, step.id, { diagnosticSessionId: oldSession, result: {} }),
      /restarted/,
    );
  });

  it("pause stops starting steps and Lotus answers; resume lets them carry on", async () => {
    const issued = await importOne("Farah Ali");
    const runId = await liveCheck();
    const step = await stepFor(runId, issued.studentId);
    const lotus = new LotusService(new FakeLotusModelService() as unknown as LotusModelService, prisma);
    lotusServices.push(lotus);
    const session = await lotus.start(issued.studentId, "BRACKETS", step.id);

    const report = await classrooms.setPaused(teacher, runId, true);
    assert.ok(report.controls.pausedAt);
    await assert.rejects(classrooms.startAssignment({ role: "student", studentId: issued.studentId } as never, step.id), ConflictException);
    await assert.rejects(
      lotus.answer(session.sessionId, issued.studentId, { answer: "1", working: "", confidence: 50, responseTimeMs: 3000, didNotKnow: false, questionId: session.currentQuestion!.id, submissionId: `${tag}_paused` }),
      /paused/,
    );

    assert.equal((await classrooms.setPaused(teacher, runId, false)).controls.pausedAt, null);
    const started = await classrooms.startAssignment({ role: "student", studentId: issued.studentId } as never, step.id);
    assert.equal(started.status, "IN_PROGRESS");
  });

  it("a time limit ends the check when it runs out, closing unfinished steps", async () => {
    const issued = await importOne("Gita Menon");
    const runId = await liveCheck();
    const report = await classrooms.setTimeLimit(teacher, runId, 15);
    assert.ok(Date.parse(report.controls.endsAt!) > Date.now() + 14 * 60_000);
    const run = await prisma.classroomRun.findUniqueOrThrow({ where: { id: runId } });
    await prisma.classroomRun.update({ where: { id: runId }, data: { config: { ...(run.config as object), endsAt: new Date(Date.now() - 1000).toISOString() } } });

    await classrooms.settleLiveChecks();
    assert.equal((await prisma.classroomRun.findUniqueOrThrow({ where: { id: runId } })).status, "COMPLETE");
    assert.equal((await stepFor(runId, issued.studentId)).status, "SKIPPED");
  });

  it("reminds students who haven't started, at most once a minute", async () => {
    const issued = await importOne("Hari Iyer");
    const runId = await liveCheck();
    const heard: StudentEvent[] = [];
    const stop = events.subscribeStudent(issued.studentId, (e) => heard.push(e));
    const first = await classrooms.nudgeNotStarted(teacher, runId);
    assert.ok(first.nudged >= 1);
    const again = await classrooms.nudgeNotStarted(teacher, runId);
    assert.equal(again.nudged, 0);
    assert.ok(again.alreadyReminded >= 1);
    await new Promise((r) => setTimeout(r, 600));
    stop();
    assert.deepEqual(heard.filter((e) => e.type === "nudge"), [{ type: "nudge", runId, title: "Linear equations in one variable · Diagnostic" }]);
    assert.ok((await stepFor(runId, issued.studentId)).payload && (((await stepFor(runId, issued.studentId)).payload as { nudgedAt?: string }).nudgedAt));
  });

  it("a late joiner gets the diagnostic in a teacher-advanced check too", async () => {
    const runId = await liveCheck({ autoAdvance: false });
    const late = await importOne("Isha Pillai");
    assert.equal((await stepFor(runId, late.studentId)).status, "READY");
  });
});
