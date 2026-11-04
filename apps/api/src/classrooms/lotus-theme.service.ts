import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { isLotusTheme, resolveLotusTheme, type LotusTheme, type LotusThemeSettings } from "@cogna/shared";
import type { AccessActor } from "../access/cogna-access";
import { PrismaService } from "../prisma/prisma.service";
import { ClassroomsService } from "./classrooms.service";

/**
 * Which look a student takes Lotus in.
 *
 * The student picks one; a teacher can lock a whole class to one (including
 * the neutral Studio look). A lock wins. The theme is stored only as a label:
 * it never reaches the marking or the diagnosis.
 */
@Injectable()
export class LotusThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classrooms: ClassroomsService,
  ) {}

  async settingsFor(studentId: string): Promise<LotusThemeSettings> {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { lotusTheme: true } });
    if (!student) throw new NotFoundException("Student not found.");
    const classes = await this.prisma.classroomEnrollment.findMany({
      where: { studentId, leftAt: null, classroom: { archivedAt: null, lockedTheme: { not: null } } },
      orderBy: { joinedAt: "asc" },
      select: { classroom: { select: { lockedTheme: true } } },
    });
    return resolveLotusTheme(student.lotusTheme, classes.map((row) => row.classroom.lockedTheme));
  }

  async studentSettings(actor: AccessActor): Promise<LotusThemeSettings> {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    return this.settingsFor(actor.studentId);
  }

  async choose(actor: AccessActor, theme: LotusTheme): Promise<LotusThemeSettings> {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    if (!isLotusTheme(theme)) throw new NotFoundException("That theme does not exist.");
    await this.prisma.student.update({ where: { id: actor.studentId }, data: { lotusTheme: theme } });
    return this.settingsFor(actor.studentId);
  }

  /** A teacher locks their own class to one theme, or passes null to let students choose again. */
  async lockClass(actor: AccessActor, classroomId: string, theme: LotusTheme | null): Promise<{ classroomId: string; lockedTheme: LotusTheme | null }> {
    await this.classrooms.ownedClassroom(actor, classroomId);
    if (theme !== null && !isLotusTheme(theme)) throw new NotFoundException("That theme does not exist.");
    await this.prisma.classroom.update({ where: { id: classroomId }, data: { lockedTheme: theme } });
    return { classroomId, lockedTheme: theme };
  }
}
