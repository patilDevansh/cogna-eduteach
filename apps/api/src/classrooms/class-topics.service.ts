import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Classroom } from "@cogna/database";
import type { AccessActor } from "../access/cogna-access";
import { PrismaService } from "../prisma/prisma.service";
import { ClassroomsService } from "./classrooms.service";
import { findTopic, topicName, topicsForGrade } from "./topic-catalogue";
import type { StudentRow } from "./class-report";
import { CHECK_KINDS, CHECK_LABEL, checkKindOf, topicGrowth, topicReadiness, type CheckKind, type SkillSnapshot } from "./topic-flow";

type TopicAction = "start" | "confirm" | "done";

/**
 * A class's topic plan and the checks on each topic: the teacher picks up the next
 * syllabus topic, sends a diagnostic, teaches, sends the topic check, sends a
 * catch-up to whoever is still stuck, and moves on. Checks themselves run through
 * ClassroomsService exactly as before; this only decides which check, for whom.
 */
@Injectable()
export class ClassTopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classrooms: ClassroomsService,
  ) {}

  /** First visit: the syllabus for the class's grade, with any topic it already has checks on marked as being taught. */
  private async ensurePlan(classroom: Classroom) {
    const existing = await this.prisma.classroomTopic.findMany({ where: { classroomId: classroom.id }, orderBy: { position: "asc" } });
    if (existing.length) return existing;
    const catalogue = topicsForGrade(classroom.grade);
    const lastRun = await this.prisma.classroomRun.findFirst({ where: { classroomId: classroom.id }, orderBy: { createdAt: "desc" }, select: { topicId: true } });
    await this.prisma.classroomTopic.createMany({
      data: catalogue.map((t) => ({
        classroomId: classroom.id,
        topicId: t.id,
        position: t.chapter,
        status: t.id === lastRun?.topicId ? "TEACHING" : "UPCOMING",
        startedAt: t.id === lastRun?.topicId ? new Date() : null,
      })),
      skipDuplicates: true,
    });
    return this.prisma.classroomTopic.findMany({ where: { classroomId: classroom.id }, orderBy: { position: "asc" } });
  }

  async plan(actor: AccessActor, classroomId: string) {
    const classroom = await this.classrooms.ownedClassroom(actor, classroomId);
    const rows = await this.ensurePlan(classroom);
    const runs = await this.prisma.classroomRun.findMany({ where: { classroomId, status: { in: ["LIVE", "COMPLETE"] } }, orderBy: { createdAt: "asc" }, select: { id: true, topicId: true, title: true, status: true, createdAt: true, config: true } });
    const topics = rows.map((row) => ({
      topicId: row.topicId,
      name: topicName(row.topicId),
      chapter: findTopic(row.topicId)?.chapter ?? row.position,
      status: row.status as "UPCOMING" | "TEACHING" | "DONE",
      available: Boolean(findTopic(row.topicId)?.lotus),
      startedAt: row.startedAt,
      doneAt: row.doneAt,
      confirmedAt: row.confirmedAt,
      checks: runs.filter((r) => r.topicId === row.topicId).map((r) => ({ runId: r.id, kind: checkKindOf(r.config), title: r.title, status: r.status, createdAt: r.createdAt })),
    }));
    const teaching = topics.find((t) => t.status === "TEACHING") ?? null;
    let current = null;
    if (teaching) {
      const checks = await this.classrooms.checkRowsForTopic(classroomId, teaching.topicId);
      const enrolled = (await this.prisma.classroomEnrollment.findMany({ where: { classroomId, leftAt: null }, include: { student: { select: { id: true, name: true } } }, orderBy: { joinedAt: "asc" } }))
        .map((e) => ({ studentId: e.student.id, name: e.student.name }));
      const growths = enrolled
        .map((s) => topicGrowth(checks.flatMap((c) => c.rows.filter((r) => r.studentId === s.studentId && r.outcome).map((r) => ({ date: c.createdAt, kind: c.kind, skills: r.skills ?? [] })))))
        .filter((g): g is NonNullable<typeof g> => Boolean(g && g.checks > 1));
      const readiness = topicReadiness(checks, enrolled, teaching.name);
      if (!teaching.available) {
        readiness.recommendation = { action: "MOVE_ON", text: `Cogna doesn't have checks for ${teaching.name.toLowerCase()} yet. Teach it as usual and move on when the class is ready.` };
      }
      current = {
        topicId: teaching.topicId,
        readiness,
        growth: growths.length
          ? { students: growths.length, before: avg(growths.map((g) => g.firstSecure)), after: avg(growths.map((g) => g.latestSecure)) }
          : null,
      };
    }
    const next = nextTopic(topics)?.topicId ?? null;
    return { classroomId, grade: classroom.grade, topics, current, next };
  }

  private async topicRow(classroom: Classroom, topicId: string) {
    const rows = await this.ensurePlan(classroom);
    const row = rows.find((r) => r.topicId === topicId);
    if (!row) throw new NotFoundException("That topic isn't in this class's plan.");
    return row;
  }

  /** Only one topic is taught at a time: starting one puts any other being taught back in the plan. */
  private async teach(classroomId: string, topicId: string) {
    await this.prisma.$transaction([
      this.prisma.classroomTopic.updateMany({ where: { classroomId, status: "TEACHING", NOT: { topicId } }, data: { status: "UPCOMING" } }),
      this.prisma.classroomTopic.update({ where: { classroomId_topicId: { classroomId, topicId } }, data: { status: "TEACHING", doneAt: null, confirmedAt: new Date() } }),
    ]);
    await this.prisma.classroomTopic.updateMany({ where: { classroomId, topicId, startedAt: null }, data: { startedAt: new Date() } });
  }

  async setStatus(actor: AccessActor, classroomId: string, topicId: string, action: TopicAction) {
    const classroom = await this.classrooms.ownedClassroom(actor, classroomId);
    const row = await this.topicRow(classroom, topicId);
    if (action === "start") await this.teach(classroomId, topicId);
    if (action === "confirm") {
      if (row.status !== "TEACHING") throw new BadRequestException(`${topicName(topicId)} isn't the topic being taught. Start it first.`);
      await this.prisma.classroomTopic.update({ where: { id: row.id }, data: { confirmedAt: new Date() } });
    }
    if (action === "done") {
      const live = await this.prisma.classroomRun.findFirst({ where: { classroomId, topicId, status: "LIVE" } });
      if (live) throw new BadRequestException("A check on this topic is still running. End it or let it finish before moving on.");
      await this.prisma.classroomTopic.update({ where: { id: row.id }, data: { status: "DONE", doneAt: new Date() } });
    }
    return this.plan(actor, classroomId);
  }

  async startCheck(actor: AccessActor, classroomId: string, topicId: string, input: { kind?: string; studentIds?: string[] }) {
    const classroom = await this.classrooms.ownedClassroom(actor, classroomId);
    await this.topicRow(classroom, topicId);
    const kind = input.kind as CheckKind;
    if (!CHECK_KINDS.includes(kind)) throw new BadRequestException("Choose a diagnostic, topic check or catch-up.");
    const topic = findTopic(topicId);
    if (!topic?.lotus) throw new BadRequestException(`Cogna doesn't have questions for ${topicName(topicId).toLowerCase()} yet. Teach it as usual and mark it done.`);
    const live = await this.prisma.classroomRun.findFirst({ where: { classroomId, status: "LIVE" }, select: { title: true } });
    if (live) throw new BadRequestException(`"${live.title}" is still running in this class. End it or let it finish first.`);

    let studentIds: string[] | undefined;
    let focus: Record<string, string[]> | undefined;
    if (kind === "CATCH_UP") {
      studentIds = [...new Set((input.studentIds ?? []).filter((id) => typeof id === "string" && id))];
      if (!studentIds.length) throw new BadRequestException("Choose at least one student for the catch-up.");
      const enrolled = await this.prisma.classroomEnrollment.count({ where: { classroomId, leftAt: null, studentId: { in: studentIds } } });
      if (enrolled !== studentIds.length) throw new BadRequestException("Some of those students aren't in this class.");
      focus = openSkills(await this.classrooms.checkRowsForTopic(classroomId, topicId), studentIds);
    }

    await this.teach(classroomId, topicId);
    const run = await this.classrooms.createRun(actor, classroomId, {
      title: `${topic.name} · ${CHECK_LABEL[kind]}`,
      topicId,
      config: { kind, diagnostic: "LOTUS", teaching: ["AI_VERIFIED_LESSON", "ANIMATED_PRACTICE"], exit: "PERSONALIZED_INDEPENDENT", autoAdvance: true, ...(studentIds ? { studentIds } : {}), ...(focus ? { focus } : {}) },
    });
    await this.classrooms.launchPhase(actor, run.id, "DIAGNOSTIC");
    return this.plan(actor, classroomId);
  }

  /** A student's growth on each topic across their classes: first finished check against the latest. */
  async growthForStudent(studentId: string) {
    const enrollments = await this.prisma.classroomEnrollment.findMany({ where: { studentId, leftAt: null, classroom: { archivedAt: null } }, select: { classroomId: true } });
    const pairs = await this.prisma.classroomRun.findMany({
      where: { classroomId: { in: enrollments.map((e) => e.classroomId) }, status: { in: ["LIVE", "COMPLETE"] } },
      distinct: ["classroomId", "topicId"],
      select: { classroomId: true, topicId: true },
    });
    const byTopic = new Map<string, SkillSnapshot[]>();
    for (const { classroomId, topicId } of pairs) {
      for (const check of await this.classrooms.checkRowsForTopic(classroomId, topicId)) {
        const row = check.rows.find((r) => r.studentId === studentId && r.outcome);
        if (row) byTopic.set(topicId, [...(byTopic.get(topicId) ?? []), { date: check.createdAt, kind: check.kind, skills: row.skills ?? [] }]);
      }
    }
    return [...byTopic.entries()]
      .map(([topicId, snapshots]) => ({ topicId, name: topicName(topicId), growth: topicGrowth(snapshots) }))
      .filter((t): t is { topicId: string; name: string; growth: NonNullable<typeof t.growth> } => Boolean(t.growth));
  }

  async growthForSignedStudent(actor: AccessActor) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    return this.growthForStudent(actor.studentId);
  }
}

/**
 * What a catch-up checks for each student: the skills still a gap or a
 * suspicion in their latest finished check on the topic, else that check's
 * starting point. A student with nothing to target is left out, and takes
 * the full diagnostic instead.
 */
export function openSkills(checks: Array<{ rows: StudentRow[] }>, studentIds: string[]): Record<string, string[]> {
  const focus: Record<string, string[]> = {};
  for (const studentId of studentIds) {
    const latest = checks.flatMap((c) => c.rows).filter((r) => r.studentId === studentId && r.outcome).at(-1);
    if (!latest) continue;
    const open = (latest.skills ?? []).filter((k) => k.state === "CONFIRMED" || k.state === "SUSPECTED").map((k) => k.skillId);
    const skills = open.length ? open : latest.startingPoint ? [latest.startingPoint.skillId] : [];
    if (skills.length) focus[studentId] = skills;
  }
  return focus;
}

/** The next topic to teach: the first upcoming one after where the class is (being taught, else last finished), else the first upcoming at all. */
export function nextTopic<T extends { status: string; chapter: number; doneAt: Date | null }>(topics: T[]): T | undefined {
  const here = topics.find((t) => t.status === "TEACHING")?.chapter
    ?? topics.filter((t) => t.status === "DONE").sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0))[0]?.chapter
    ?? 0;
  const upcoming = topics.filter((t) => t.status === "UPCOMING").sort((a, b) => a.chapter - b.chapter);
  return upcoming.find((t) => t.chapter > here) ?? upcoming[0];
}

function avg(values: number[]): number {
  return Math.round((values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) * 10) / 10;
}
