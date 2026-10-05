import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ClerkAuthService } from "../parents/clerk-auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { type AccessActor, assertCanReadStudent, assertStudentOwner, isProductionLike, resolveActor } from "./cogna-access";

type Headers = Record<string, string | string[] | undefined>;

const header = (headers: Headers, name: string) => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Who may touch a student's records, for the older per-student routes (/students, /sessions,
 * /practice, /curriculum, /diagnostic-v2):
 * - read: the student, a teacher in their school, or the worker; optionally a linked parent;
 * - write: only the student themself (or the worker). Teachers read, they don't answer for students.
 */
@Injectable()
export class StudentAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkAuthService,
  ) {}

  async read(headers: Headers, studentId: string, options: { allowParent?: boolean } = {}): Promise<void> {
    const actor = this.actorOrNull(headers);
    if (actor) return assertCanReadStudent(actor, studentId);
    const parentHeader = header(headers, "x-parent-id");
    const authorization = header(headers, "authorization");
    if (options.allowParent && (parentHeader || authorization?.startsWith("Bearer "))) {
      const parentId = await this.clerk.resolveParentId(authorization, parentHeader);
      const linked = await this.prisma.student.count({
        where: { id: studentId, OR: [{ primaryParentId: parentId }, { parentLinks: { some: { parentId, canViewReports: true } } }] },
      });
      if (linked) return;
      throw new ForbiddenException("This student is not linked to your parent account.");
    }
    throw new UnauthorizedException("Sign in as the student or teacher to continue.");
  }

  write(headers: Headers, studentId: string): void {
    assertStudentOwner(resolveActor(headers), studentId);
  }

  /** The learning session must exist, belong to `claimedStudentId` (when given), and the caller must own it. */
  async writeLearningSession(headers: Headers, sessionId: string, claimedStudentId?: string): Promise<string> {
    const session = await this.prisma.learningSession.findUnique({ where: { id: sessionId }, select: { studentId: true } });
    if (!session) throw new NotFoundException("Session not found.");
    if (claimedStudentId && claimedStudentId !== session.studentId) throw new ForbiddenException("This session belongs to a different student.");
    this.write(headers, session.studentId);
    return session.studentId;
  }

  async readLearningSession(headers: Headers, sessionId: string): Promise<void> {
    const session = await this.prisma.learningSession.findUnique({ where: { id: sessionId }, select: { studentId: true } });
    if (!session) throw new NotFoundException("Session not found.");
    await this.read(headers, session.studentId);
  }

  async diagnosticSession(headers: Headers, sessionId: string, mode: "read" | "write"): Promise<void> {
    const session = await this.prisma.diagnosticV2Session.findUnique({ where: { id: sessionId }, select: { studentId: true } });
    if (!session) throw new NotFoundException("Session not found.");
    if (mode === "write") this.write(headers, session.studentId);
    else await this.read(headers, session.studentId);
  }

  /** Dev-only helpers (fixtures, simulated time) do not exist in production. */
  devOnly(): void {
    if (isProductionLike()) throw new NotFoundException();
  }

  private actorOrNull(headers: Headers): AccessActor | null {
    try {
      return resolveActor(headers);
    } catch (error) {
      if (error instanceof UnauthorizedException && !header(headers, "x-cogna-teacher-token") && !header(headers, "x-cogna-student-token")) return null;
      throw error; // a present-but-invalid student/teacher session is an error, not "try the parent path"
    }
  }
}
