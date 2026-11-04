import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { LotusSessionView } from "@cogna/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessActor } from "../access/cogna-access";
import { isProductionLike } from "../access/cogna-access";
import { isDemoStudent } from "../engines/diagnostic-v2/demo-student";

/** Teacher access to AI Studio follows the current classroom relationship. */
@Injectable()
export class LotusStudioService {
  constructor(private readonly prisma: PrismaService) {}

  private devDemoTeacher(actor: AccessActor): boolean {
    return !isProductionLike() && actor.role === "teacher" && actor.schoolId === "gurukul-pilot" && actor.teacherEmail.toLowerCase() === "ananya@gurukul.edu";
  }

  async assertCanObserve(actor: AccessActor, session: Pick<LotusSessionView, "studentId" | "classroomAssignmentId">, allowDevDemo = true): Promise<void> {
    if (actor.role === "worker") return;
    if (actor.role !== "teacher") throw new ForbiddenException("A verified teacher session is required.");
    const identityKey = `${actor.schoolId}:${actor.teacherEmail.toLowerCase()}`;
    if (!session.classroomAssignmentId) {
      if (allowDevDemo && this.devDemoTeacher(actor) && isDemoStudent(session.studentId)) return;
      throw new ForbiddenException("This diagnostic is not part of your class.");
    }
    const owned = await this.prisma.classroomAssignment.count({
      where: {
        id: session.classroomAssignmentId,
        kind: "DIAGNOSTIC",
        enrollment: { studentId: session.studentId, leftAt: null },
        run: { classroom: { teacher: { identityKey }, schoolId: actor.schoolId, archivedAt: null } },
      },
    });
    if (!owned) throw new ForbiddenException("This diagnostic is not part of your current class.");
  }

  async listDevDemoSessions(actor: AccessActor) {
    if (!this.devDemoTeacher(actor)) throw new NotFoundException("Demo AI Studio is unavailable.");
    const records = await this.prisma.lotusSessionRecord.findMany({
      where: { OR: [{ studentId: "dev_student_001" }, { studentId: { startsWith: "demo_" } }] },
      orderBy: { startedAt: "desc" },
      take: 30,
      select: { sessionId: true, studentId: true, status: true, phase: true, startedAt: true, payload: true },
    });
    return records.filter(record => isDemoStudent(record.studentId)).map(record => {
      const payload = record.payload as unknown as Partial<LotusSessionView>;
      return {
        sessionId: record.sessionId,
        classroomAssignmentId: null,
        studentId: record.studentId,
        studentName: "Demo Student",
        rollNumber: null,
        status: record.status,
        phase: record.phase,
        topic: payload.topic ?? null,
        answered: Array.isArray(payload.audits) ? payload.audits.length : 0,
        startedAt: record.startedAt.toISOString(),
      };
    });
  }

  async listClassSessions(actor: AccessActor, classroomId: string) {
    if (actor.role !== "teacher") throw new ForbiddenException("A verified teacher session is required.");
    const identityKey = `${actor.schoolId}:${actor.teacherEmail.toLowerCase()}`;
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: classroomId, teacher: { identityKey }, schoolId: actor.schoolId, archivedAt: null },
      select: { id: true },
    });
    if (!classroom) throw new NotFoundException("Classroom not found.");

    const assignments = await this.prisma.classroomAssignment.findMany({
      where: { kind: "DIAGNOSTIC", run: { classroomId }, enrollment: { leftAt: null, student: { deletedAt: null } } },
      select: { id: true, diagnosticSessionId: true, enrollment: { select: { studentId: true, rollNumber: true, student: { select: { name: true } } } } },
    });
    if (!assignments.length) return [];

    // Active sessions identify their assignment in the saved payload before
    // ClassroomAssignment.diagnosticSessionId is filled at completion.
    const matches = assignments.flatMap(assignment => [
      { studentId: assignment.enrollment.studentId, payload: { path: ["classroomAssignmentId"], equals: assignment.id } },
      ...(assignment.diagnosticSessionId ? [{ studentId: assignment.enrollment.studentId, sessionId: assignment.diagnosticSessionId }] : []),
    ]);
    const records = await this.prisma.lotusSessionRecord.findMany({
      where: { OR: matches },
      orderBy: { startedAt: "desc" },
      take: 100,
      select: { sessionId: true, studentId: true, status: true, phase: true, startedAt: true, payload: true },
    });
    return records.flatMap(record => {
      const payload = record.payload as unknown as Partial<LotusSessionView>;
      const assignment = assignments.find(candidate => candidate.enrollment.studentId === record.studentId &&
        (candidate.id === payload.classroomAssignmentId || candidate.diagnosticSessionId === record.sessionId));
      if (!assignment) return [];
      return [{
        sessionId: record.sessionId,
        classroomAssignmentId: assignment.id,
        studentId: record.studentId,
        studentName: assignment.enrollment.student.name,
        rollNumber: assignment.enrollment.rollNumber,
        status: record.status,
        phase: record.phase,
        topic: payload.topic ?? null,
        answered: Array.isArray(payload.audits) ? payload.audits.length : 0,
        startedAt: record.startedAt.toISOString(),
      }];
    });
  }
}
