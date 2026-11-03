import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@cogna/database";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessActor } from "../access/cogna-access";
import { assertStudentOwner, assertTeacher } from "../access/cogna-access";
import { FACTORISATION_TEACHING_V1, verifyFactorisationTeachingPackage } from "../personalized-videos/reference-teaching-package";
import { FACTORISATION_REFERENCE_PACK_V1 } from "../lotus/packs/factorisation-reference-pack";
import { MODULE_FLOW, REFERENCE_MODULE_ID, advanceModule, initialModuleState, newRunId, publicModuleState, type ModuleAction, type ModuleRunIdentity, type ModuleSource, type ModuleState } from "./module-learning.state";

function requestId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw new BadRequestException("A stable requestId of 8–80 letters, digits, underscores or hyphens is required.");
  return value;
}

function moduleId(value: unknown): typeof REFERENCE_MODULE_ID {
  if (value !== REFERENCE_MODULE_ID) throw new BadRequestException("This module is not available in the reference release.");
  return value;
}

function safeAction(value: unknown): ModuleAction {
  if (!value || typeof value !== "object") throw new BadRequestException("An action is required.");
  const raw = value as Record<string, unknown>;
  if (raw.kind === "PRESENTED") {
    if (typeof raw.segmentId !== "string" || !["SLIDES", "STATIC_TEXT"].includes(String(raw.representation))) throw new BadRequestException("A valid presented segment and representation are required.");
    return { kind: "PRESENTED", segmentId: raw.segmentId, representation: raw.representation as "SLIDES" | "STATIC_TEXT", elapsedMs: safeElapsed(raw.elapsedMs) };
  }
  if (raw.kind === "ANSWER") {
    if (typeof raw.itemId !== "string" || typeof raw.answer !== "string") throw new BadRequestException("A question ID and typed answer are required.");
    return { kind: "ANSWER", itemId: raw.itemId, answer: raw.answer, elapsedMs: safeElapsed(raw.elapsedMs) };
  }
  if (["REQUEST_HELP", "PAUSE", "RESUME", "TEACHER_PAUSE", "TEACHER_RESUME"].includes(String(raw.kind))) return { kind: raw.kind } as ModuleAction;
  throw new BadRequestException("Unsupported module action.");
}

function safeElapsed(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 24 * 60 * 60 * 1000) throw new BadRequestException("elapsedMs is invalid.");
  return Number(value);
}

/** PostgreSQL JSONB does not preserve object key order; idempotency compares values. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

@Injectable()
export class ModuleLearningService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private ensureCreationEnabled() {
    if (process.env.MODULE_LEARNING_ENABLED !== "true") throw new ServiceUnavailableException("The module learning pilot is not enabled yet.");
    if (verifyFactorisationTeachingPackage().length) throw new ServiceUnavailableException("Reviewed module content is unavailable.");
  }

  private async assertStudentExists(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { deletedAt: true } });
    if (!student || student.deletedAt) throw new NotFoundException("Student account is unavailable.");
  }

  private async createStartInTransaction(tx: Prisma.TransactionClient, input: { studentId: string; source: ModuleSource; moduleId: typeof REFERENCE_MODULE_ID; requestId: string; classroomId: string | null; teacherId: string | null }) {
    const eventId = `MODULE_START_${input.requestId}${input.source === "TEACHER_ASSIGNED" ? `_${input.studentId}` : ""}`;
    const sameLaunch = (identity: ModuleRunIdentity | undefined) => !!identity && identity.studentId === input.studentId && identity.source === input.source && identity.moduleId === input.moduleId && identity.classroomId === input.classroomId && identity.teacherId === input.teacherId;
    // Lock ordering is by student ID in a classroom launch, preventing concurrent launches
    // from handing the same independent item to the same learner.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`module-exit:${input.studentId}`}, 0))::text AS locked`;
    const existing = await tx.rawEvent.findUnique({ where: { eventId } });
    if (existing) {
      const identity = (existing.payload as unknown as { identity?: ModuleRunIdentity }).identity;
      if (!sameLaunch(identity)) throw new ConflictException("The requestId belongs to another module launch.");
      return { identity: identity!, state: null as ModuleState | null };
    }
    const starts = await tx.rawEvent.findMany({ where: { studentId: input.studentId, eventType: "MODULE_RUN_CREATED_V1" }, orderBy: [{ createdAt: "desc" }, { eventId: "desc" }] });
    const identities = starts.map(row => (row.payload as unknown as { identity?: ModuleRunIdentity }).identity).filter((identity): identity is ModuleRunIdentity => !!identity);
    const reserved = new Set(starts.map(row => (row.payload as unknown as { state?: ModuleState }).state?.exitItemId ?? "EXIT_FACT_01"));
    const exitItem = FACTORISATION_REFERENCE_PACK_V1.exitChecks.find(item => !reserved.has(item.id));
    if (!exitItem) throw new ServiceUnavailableException("No unused independent check remains for this learner. Earlier work is preserved; a reviewed new item is needed before repeating this module.");
    const repeatOfRunId = identities.find(identity => identity.source === input.source && identity.moduleId === input.moduleId && identity.classroomId === input.classroomId)?.runId ?? null;
    const identity: ModuleRunIdentity = { runId: newRunId(), flow: MODULE_FLOW, studentId: input.studentId, source: input.source, moduleId: input.moduleId, packageId: FACTORISATION_TEACHING_V1.id, packageVersion: FACTORISATION_TEACHING_V1.version, classroomId: input.classroomId, teacherId: input.teacherId, repeatOfRunId };
    const state = initialModuleState(exitItem.id);
    await tx.rawEvent.create({ data: { eventId, eventType: "MODULE_RUN_CREATED_V1", studentId: input.studentId, sessionId: identity.runId, payload: { identity, state, receivedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue } });
    return { identity, state };
  }

  private async createStart(input: { studentId: string; source: ModuleSource; moduleId: typeof REFERENCE_MODULE_ID; requestId: string; classroomId: string | null; teacherId: string | null }) {
    try {
      const result = await this.prisma.$transaction(tx => this.createStartInTransaction(tx, input));
      return result.state ? publicModuleState(result.identity, result.state) : this.getRun({ role: "student", studentId: input.studentId }, result.identity.runId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("The requestId belongs to another module launch.");
      throw error;
    }
  }

  async startSelf(actor: AccessActor, body: { flow?: string; moduleId?: string; requestId?: string }) {
    this.ensureCreationEnabled();
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    await this.assertStudentExists(actor.studentId);
    if (body?.flow !== MODULE_FLOW) throw new BadRequestException("An explicit MODULE_LEARNING_V1 flow is required.");
    return this.createStart({ studentId: actor.studentId, source: "SELF_DIRECTED", moduleId: moduleId(body.moduleId), requestId: requestId(body.requestId), classroomId: null, teacherId: null });
  }

  async assignClass(actor: AccessActor, body: { flow?: string; classroomId?: string; moduleId?: string; requestId?: string; studentIds?: string[] }) {
    this.ensureCreationEnabled();
    assertTeacher(actor);
    if (actor.role !== "teacher") throw new ForbiddenException("A verified teacher is required.");
    if (body?.flow !== MODULE_FLOW) throw new BadRequestException("An explicit MODULE_LEARNING_V1 flow is required.");
    const selectedModule = moduleId(body.moduleId);
    const launchId = requestId(body.requestId);
    if (typeof body.classroomId !== "string") throw new BadRequestException("classroomId is required.");
    const teacher = await this.prisma.teacher.findUnique({ where: { identityKey: `${actor.schoolId}:${actor.teacherEmail.toLowerCase()}` }, select: { id: true } });
    if (!teacher) throw new ForbiddenException("Teacher account is unavailable.");
    const classroom = await this.prisma.classroom.findFirst({ where: { id: body.classroomId, teacherId: teacher.id, schoolId: actor.schoolId, archivedAt: null }, select: { id: true, grade: true } });
    if (!classroom || classroom.grade !== 8) throw new ForbiddenException("This Grade 8 classroom is unavailable.");
    const enrollments = await this.prisma.classroomEnrollment.findMany({ where: { classroomId: classroom.id, leftAt: null, student: { deletedAt: null } }, select: { studentId: true } });
    const eligible = new Set(enrollments.map(enrollment => enrollment.studentId));
    const targets = body.studentIds === undefined ? [...eligible] : body.studentIds;
    if (!Array.isArray(targets) || !targets.length || new Set(targets).size !== targets.length || targets.some(id => typeof id !== "string" || !eligible.has(id))) throw new BadRequestException("Choose eligible enrolled students without duplicates.");
    // All eligible students receive the assignment or none do. In particular, one
    // exhausted learner must not leave a teacher with a silently partial class launch.
    let started;
    try {
      started = await this.prisma.$transaction(async tx => {
        const rows = [];
        for (const studentId of [...targets].sort()) rows.push(await this.createStartInTransaction(tx, { studentId, source: "TEACHER_ASSIGNED", moduleId: selectedModule, requestId: launchId, classroomId: classroom.id, teacherId: teacher.id }));
        return rows;
      }, { timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("The requestId belongs to another module launch.");
      throw error;
    }
    const runs = await Promise.all(started.map(result => result.state ? publicModuleState(result.identity, result.state) : this.getRun({ role: "student", studentId: result.identity.studentId }, result.identity.runId)));
    return { flow: MODULE_FLOW, classroomId: classroom.id, runs };
  }

  private async record(runId: string, client: Pick<Prisma.TransactionClient, "rawEvent"> = this.prisma) {
    const rows = await client.rawEvent.findMany({ where: { sessionId: runId, eventType: { startsWith: "MODULE_" } }, orderBy: [{ createdAt: "asc" }, { eventId: "asc" }] });
    const start = rows.find(row => row.eventType === "MODULE_RUN_CREATED_V1");
    if (!start) throw new NotFoundException("Module run not found.");
    const startPayload = start.payload as unknown as { identity?: ModuleRunIdentity; state?: ModuleState };
    const identity = startPayload.identity;
    if (!identity || identity.flow !== MODULE_FLOW || identity.runId !== runId) throw new NotFoundException("Module run not found.");
    if (identity.packageId !== FACTORISATION_TEACHING_V1.id || identity.packageVersion !== FACTORISATION_TEACHING_V1.version) throw new ServiceUnavailableException("This saved module needs its original reviewed content version. Progress is preserved; try again after content is restored.");
    const states = rows.map(row => (row.payload as unknown as { state?: ModuleState }).state).filter((state): state is ModuleState => !!state && Number.isInteger(state.revision));
    const state = states.sort((a, b) => b.revision - a.revision)[0];
    if (!state) throw new NotFoundException("Module state is unavailable.");
    return { identity, state, startEventId: start.eventId };
  }

  private async authorizeRead(actor: AccessActor, identity: ModuleRunIdentity) {
    if (actor.role === "student") return assertStudentOwner(actor, identity.studentId);
    if (actor.role !== "teacher" || identity.source !== "TEACHER_ASSIGNED" || !identity.classroomId) throw new ForbiddenException("This module is private to its learner.");
    const teacher = await this.prisma.teacher.findUnique({ where: { identityKey: `${actor.schoolId}:${actor.teacherEmail.toLowerCase()}` }, select: { id: true } });
    if (!teacher || teacher.id !== identity.teacherId) throw new ForbiddenException("This classroom belongs to another teacher.");
    const classroom = await this.prisma.classroom.findFirst({ where: { id: identity.classroomId, teacherId: teacher.id, schoolId: actor.schoolId }, select: { id: true } });
    if (!classroom) throw new ForbiddenException("This classroom is no longer owned by this teacher.");
  }

  async getRun(actor: AccessActor, runId: string) {
    const { identity, state } = await this.record(runId);
    await this.authorizeRead(actor, identity);
    return publicModuleState(identity, state);
  }

  async listForStudent(actor: AccessActor) {
    if (actor.role !== "student") throw new ForbiddenException("A signed-in student is required.");
    const starts = await this.prisma.rawEvent.findMany({ where: { studentId: actor.studentId, eventType: "MODULE_RUN_CREATED_V1" }, orderBy: { createdAt: "desc" }, take: 30 });
    const runs = [];
    for (const start of starts) {
      const identity = (start.payload as unknown as { identity?: ModuleRunIdentity }).identity;
      if (identity?.flow !== MODULE_FLOW || identity.studentId !== actor.studentId) continue;
      runs.push(await this.getRun(actor, identity.runId));
    }
    return runs;
  }

  async act(actor: AccessActor, runId: string, body: { eventId?: string; expectedRevision?: number; action?: unknown }) {
    const id = requestId(body?.eventId);
    const action = safeAction(body?.action);
    if (!Number.isInteger(body?.expectedRevision) || Number(body.expectedRevision) < 0) throw new BadRequestException("expectedRevision is required.");
    return this.prisma.$transaction(async tx => {
      const first = await tx.rawEvent.findFirst({ where: { sessionId: runId, eventType: "MODULE_RUN_CREATED_V1" }, select: { eventId: true } });
      if (!first) throw new NotFoundException("Module run not found.");
      await tx.$queryRaw`SELECT "eventId" FROM "RawEvent" WHERE "eventId" = ${first.eventId} FOR UPDATE`;
      const { identity, state } = await this.record(runId, tx);
      if (action.kind === "TEACHER_PAUSE" || action.kind === "TEACHER_RESUME") {
        await this.authorizeRead(actor, identity);
        if (actor.role !== "teacher" || identity.source !== "TEACHER_ASSIGNED") throw new ForbiddenException("Only the assigning teacher can pause this work.");
      } else {
        assertStudentOwner(actor, identity.studentId);
        if (identity.source === "TEACHER_ASSIGNED") {
          const active = await tx.classroomEnrollment.count({ where: { classroomId: identity.classroomId!, studentId: identity.studentId, leftAt: null, classroom: { archivedAt: null } } });
          if (!active) throw new ForbiddenException("This classroom assignment is no longer available.");
        }
      }
      const prior = await tx.rawEvent.findUnique({ where: { eventId: id } });
      if (prior) {
        if (prior.sessionId !== runId || prior.studentId !== identity.studentId || prior.eventType !== `MODULE_${action.kind}_V1`) throw new ConflictException("eventId was already used for another action.");
        const previous = prior.payload as unknown as { action?: ModuleAction; state?: ModuleState };
        if (stableJson(previous.action) !== stableJson(action) || !previous.state) throw new ConflictException("eventId was reused with different content.");
        return publicModuleState(identity, state);
      }
      if (state.revision !== body.expectedRevision) throw new ConflictException("Module state changed. Reload the current step and retry.");
      let transition;
      try { transition = advanceModule(state, action); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "Invalid module action."); }
      await tx.rawEvent.create({ data: { eventId: id, eventType: `MODULE_${action.kind}_V1`, studentId: identity.studentId, sessionId: runId, payload: { flow: MODULE_FLOW, packageVersion: identity.packageVersion, action, observation: { ...transition.observation, reportedBy: action.kind === "PRESENTED" ? "CLIENT" : "SERVER" }, state: transition.state, receivedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue } });
      return publicModuleState(identity, transition.state);
    });
  }
}
