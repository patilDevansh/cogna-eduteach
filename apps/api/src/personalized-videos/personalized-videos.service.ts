import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import {
  JobStatus,
  PersonalizedVideoAssignmentStatus,
  PersonalizedVideoEvidenceKind,
  ReviewStatus,
  type PrismaClient,
} from "@cogna/database";
import {
  PERSONALIZED_VIDEO_LIMITATIONS,
  type LotusSessionView,
  type PersonalizedVideoAssignmentView,
  type PersonalizedVideoDelivery,
  type PersonalizedVideoEvidenceSnapshot,
  type PersonalizedVideoExitItem,
  type PersonalizedVideoJobView,
  type PersonalizedVideoLesson,
  type PersonalizedVideoScriptSource,
  type PersonalizedVideoTeacherReport,
  type PilotStudentKey,
} from "@cogna/shared";
import { randomUUID } from "crypto";
import {
  DEMO_SCHOOL_ID,
  assertCanReadStudent,
  assertStudentOwner,
  assertTeacher,
  attachMediaAccess,
  demoSeedsAllowed,
  isDemoStudentId,
  schoolIdForStudent,
  type AccessActor,
} from "../access/cogna-access";
import {
  APPROVED_VIDEO_TEMPLATES,
  PILOT_TEMPLATE_KEYS,
  selectTemplateFromEvidence,
  templateForKey,
} from "./approved-templates";
import { snapshotFromLotusSession } from "./lotus-evidence";
import { evaluateRemediationEligibility } from "./video-evidence";
import { validateVideoLanguage } from "./video-language";
import { collectSceneClaims, validateMathClaims } from "./video-math";
import {
  RendererUnavailableError,
  VideoRendererAdapter,
} from "./video-renderer.adapter";

const JOB_TYPE = "PERSONALIZED_VIDEO_RENDER";
const WORKER_ID = `personalized-video-${process.pid}`;

type JobPayload = {
  assignmentId?: string;
  studentId?: string;
  forcePendingReview?: boolean;
  scriptSource?: string;
  providerJobId?: string;
};

export function normalizeAlgebraAnswer(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replace(/\s+/g, "");
}

export interface CreateAssignmentInput {
  studentId?: string;
  studentKey?: string;
  lotusSessionId?: string;
  evidence?: PersonalizedVideoEvidenceSnapshot;
  scriptOverride?: PersonalizedVideoLesson;
  exitOverride?: PersonalizedVideoExitItem;
  scriptSource?: PersonalizedVideoScriptSource;
  forcePendingReview?: boolean;
  name?: string;
  roll?: string;
}

export interface AssignmentAccessOptions {
  actor: AccessActor;
  allowDemoSeeds?: boolean;
  allowTestHooks?: boolean;
}

type StoredScript = {
  name: string;
  roll?: string;
  learnerDecision: string;
  teacherDecision: string;
  uncertainty: "Low" | "Moderate" | "High";
  statusLabel: string;
  lesson: PersonalizedVideoLesson;
  exit: PersonalizedVideoExitItem | null;
};

function studentKeyFromId(studentId: string): PilotStudentKey | undefined {
  const match = studentId.match(/^demo_(aarav|meena|rohan|divya|kabir)$/);
  return (match?.[1] as PilotStudentKey | undefined) ?? undefined;
}

function targetStudentId(actor: AccessActor, requested?: string): string {
  if (actor.role === "student") return actor.studentId;
  if (!requested?.trim()) {
    throw new BadRequestException("studentId is required.");
  }
  return requested.trim();
}

export class PersonalizedVideosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly renderer: VideoRendererAdapter,
  ) {}

  async getForStudent(
    actor: AccessActor,
    input: { studentId?: string; studentKey?: string },
  ): Promise<PersonalizedVideoAssignmentView> {
    const studentId = targetStudentId(actor, input.studentId);
    if (actor.role === "student" && input.studentId && input.studentId !== actor.studentId) {
      throw new ForbiddenException("This record belongs to a different student.");
    }
    assertCanReadStudent(actor, studentId, schoolIdForStudent(studentId));
    const existing = await this.prisma.personalizedVideoAssignment.findFirst({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      assertCanReadStudent(actor, existing.studentId, existing.schoolId ?? schoolIdForStudent(existing.studentId));
      return this.toView(existing);
    }

    const studentKey = studentKeyFromId(studentId) ?? input.studentKey;
    const canSeed = demoSeedsAllowed() && isDemoStudentId(studentId) && Boolean(studentKey);
    if (!canSeed) {
      throw new NotFoundException("No personalized lesson is assigned yet.");
    }
    const created = await this.createAssignment(
      { studentId, studentKey },
      { actor, allowDemoSeeds: true },
    );
    return this.getAssignment(created.id, actor);
  }

  async getAssignment(id: string, actor: AccessActor): Promise<PersonalizedVideoAssignmentView> {
    const row = await this.requireAssignment(id);
    assertCanReadStudent(actor, row.studentId, row.schoolId ?? schoolIdForStudent(row.studentId));
    return this.toView(row);
  }

  async createAssignment(
    input: CreateAssignmentInput,
    options: AssignmentAccessOptions,
  ): Promise<PersonalizedVideoAssignmentView> {
    const studentId = targetStudentId(options.actor, input.studentId);
    const schoolId = schoolIdForStudent(studentId);
    if (options.actor.role === "student") {
      assertStudentOwner(options.actor, studentId);
    } else if (options.actor.role === "teacher") {
      assertCanReadStudent(options.actor, studentId, schoolId);
    } else {
      assertStudentOwner(options.actor, studentId);
    }

    const allowDemoSeeds = options.allowDemoSeeds ?? demoSeedsAllowed();
    const trusted = await this.resolveTrustedEvidence(input, studentId, {
      allowDemoSeeds,
      allowTestHooks: options.allowTestHooks === true,
    });
    const snapshot = trusted.snapshot;
    const template = trusted.template;
    const lotusRecordId = trusted.lotusRecordId;
    const gate = evaluateRemediationEligibility(snapshot);
    const scriptSource: PersonalizedVideoScriptSource =
      options.allowTestHooks && input.scriptOverride
        ? (input.scriptSource ?? "CONSTRAINED_AI")
        : "APPROVED_TEMPLATE";
    const lesson = (options.allowTestHooks ? input.scriptOverride : undefined) ?? template?.lesson ?? null;
    const exit = (options.allowTestHooks ? input.exitOverride : undefined) ?? template?.exit ?? null;
    const stored: StoredScript = {
      name: input.name ?? template?.name ?? "Student",
      roll: input.roll ?? template?.roll,
      learnerDecision: template?.learnerDecision ?? "Use only the supported evidence.",
      teacherDecision: template?.teacherDecision ?? "Inspect the exact question-and-step evidence before acting.",
      uncertainty: template?.uncertainty ?? "High",
      statusLabel: template?.statusLabel ?? (gate.eligible ? "Targeted bridge" : "Evidence check"),
      lesson: lesson as PersonalizedVideoLesson,
      exit,
    };

    if (!gate.eligible || !lesson) {
      const row = await this.prisma.personalizedVideoAssignment.create({
        data: {
          studentId,
          studentKey: template?.studentKey ?? (input.lotusSessionId ? undefined : input.studentKey),
          schoolId,
          lotusSessionId: lotusRecordId,
          status: PersonalizedVideoAssignmentStatus.ABSTAINED,
          diagnosticState: gate.eligible ? snapshot.diagnosticState : gate.diagnosticState,
          conceptId: template?.conceptId ?? "C1_BASIC_SOLVING",
          learningObjective: "Do not prescribe remediation; gather clearer independent evidence.",
          evidenceSnapshot: snapshot as object,
          script: stored as object,
          scriptSource,
          abstainReason: gate.eligible
            ? "No approved lesson is mapped to this evidence yet."
            : gate.reason,
        },
      });
      return this.toView(row);
    }

    const math = validateMathClaims(collectSceneClaims(lesson.scenes));
    if (!math.valid) {
      throw new BadRequestException(`Script mathematics rejected: ${math.errors.join(" ")}`);
    }

    const languageTexts = [
      lesson.title,
      lesson.objective,
      lesson.generationReason,
      ...lesson.scenes.flatMap((scene) => [scene.headline, scene.narration, scene.equation]),
    ];
    const language = validateVideoLanguage(languageTexts);
    if (!language.valid) {
      throw new BadRequestException(
        `Script language rejected: ${(language.errors ?? []).join(" ")}`,
      );
    }

    const assignmentId = randomUUID();
    const job = await this.prisma.job.create({
      data: {
        jobType: JOB_TYPE,
        idempotencyKey: `${JOB_TYPE}:${assignmentId}`,
        payload: {
          assignmentId,
          studentId,
          forcePendingReview: options.allowTestHooks ? Boolean(input.forcePendingReview) : false,
          scriptSource,
        },
        status: JobStatus.PENDING,
      },
    });

    await this.prisma.personalizedVideoAssignment.create({
      data: {
        id: assignmentId,
        studentId,
        studentKey: template?.studentKey ?? (input.lotusSessionId ? undefined : input.studentKey),
        schoolId,
        lotusSessionId: lotusRecordId,
        status: PersonalizedVideoAssignmentStatus.PREPARING,
        diagnosticState: gate.diagnosticState,
        conceptId: template?.conceptId ?? "C3_DISTRIBUTIVE_PROPERTY",
        learningObjective: lesson.objective,
        evidenceSnapshot: snapshot as object,
        script: stored as object,
        scriptSource,
        mathValidation: math as object,
        languageValidation: { valid: true } as object,
        renderJobId: job.id,
      },
    });

    return this.toView(await this.requireAssignment(assignmentId));
  }

  async processPendingRenderJobs(): Promise<{ processed: number }> {
    const jobs = await this.prisma.job.findMany({
      where: {
        jobType: JOB_TYPE,
        status: { in: [JobStatus.PENDING, JobStatus.FAILED_RETRYABLE, JobStatus.RUNNING] },
      },
    });
    const now = Date.now();
    let processed = 0;
    for (const job of jobs) {
      if (job.runAfter && job.runAfter.getTime() > now) continue;
      await this.processRenderJob(job.id);
      processed += 1;
    }
    return { processed };
  }

  async handleRenderCallback(input: {
    providerJobId: string;
    status?: string;
    storageRef?: string;
    transcriptRef?: string;
    durationMs?: number;
    integrity?: Record<string, unknown>;
    message?: string;
  }): Promise<{ status: string }> {
    const jobs = await this.prisma.job.findMany({
      where: {
        jobType: JOB_TYPE,
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.FAILED_RETRYABLE] },
      },
    });
    const job = jobs.find((candidate) => {
      const payload = candidate.payload as JobPayload;
      return payload.providerJobId === input.providerJobId;
    });
    if (!job) throw new NotFoundException("No render job matches this provider id.");
    const status = (input.status ?? "COMPLETED").toUpperCase();
    if (["FAILED", "ERROR", "CANCELLED"].includes(status)) {
      return this.failRenderFromProvider(job.id, input.message || "Renderer callback reported failure.");
    }
    if (!input.storageRef || !/^https?:\/\/|^s3:\/\//.test(input.storageRef)) {
      return this.failRenderFromProvider(job.id, "Renderer callback did not include a permanent storageRef.");
    }
    return this.completeRender(job.id, {
      storageRef: input.storageRef,
      transcriptRef: input.transcriptRef || `${input.storageRef}.vtt`,
      durationMs: input.durationMs ?? 0,
      integrity: {
        ...input.integrity,
        provider: "external-adapter",
        providerJobId: input.providerJobId,
        sceneCount: 0,
      },
    });
  }

  async processRenderJob(jobId: string): Promise<{ status: string }> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return { status: "MISSING" };
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED_PERMANENT) {
      return { status: job.status };
    }

    const payload = (job.payload ?? {}) as JobPayload;
    const assignmentId = payload.assignmentId;
    if (!assignmentId) {
      await this.failJob(jobId, "Render job payload is missing assignmentId.", true);
      return { status: JobStatus.FAILED_PERMANENT };
    }
    const assignment = await this.prisma.personalizedVideoAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      await this.failJob(jobId, "Assignment not found for render job.", true);
      return { status: JobStatus.FAILED_PERMANENT };
    }

    const script = assignment.script as StoredScript | null;
    const lesson = script?.lesson;
    if (!lesson) {
      await this.applyUnavailable(assignmentId, jobId, "No lesson script to render.", true);
      return { status: JobStatus.FAILED_PERMANENT };
    }

    if (!this.renderer.isConfigured()) {
      await this.applyUnavailable(
        assignmentId,
        jobId,
        "No video renderer provider is configured.",
        false,
      );
      return { status: JobStatus.FAILED_RETRYABLE };
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        lockedAt: new Date(),
        lockedBy: WORKER_ID,
        attemptCount: { increment: 1 },
      },
    });

    try {
      let providerJobId = payload.providerJobId;
      if (!providerJobId || job.status !== JobStatus.RUNNING) {
        const submitted = await this.renderer.submit({
          assignmentId,
          title: lesson.title,
          captions: lesson.scenes.map((scene) => scene.narration),
          scenes: lesson.scenes.map((scene) => ({
            eyebrow: scene.eyebrow,
            headline: scene.headline,
            equation: scene.equation,
            narration: scene.narration,
            durationSeconds: scene.durationSeconds,
            accent: scene.accent,
          })),
        });
        providerJobId = submitted.providerJobId;
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: JobStatus.RUNNING,
            payload: { ...payload, providerJobId } as object,
          },
        });
      }

      const polled = await this.renderer.poll(providerJobId);
      if (polled.status === "RUNNING") {
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: JobStatus.RUNNING,
            runAfter: new Date(),
            payload: { ...payload, providerJobId } as object,
            lastError: null,
          },
        });
        return { status: JobStatus.RUNNING };
      }
      if (polled.status === "FAILED") {
        await this.applyUnavailable(assignmentId, jobId, polled.message, !polled.retryable);
        return { status: polled.retryable ? JobStatus.FAILED_RETRYABLE : JobStatus.FAILED_PERMANENT };
      }
      return this.completeRender(jobId, {
        ...polled.result,
        integrity: {
          ...polled.result.integrity,
          sceneCount: lesson.scenes.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof RendererUnavailableError || error instanceof TypeError;
      await this.applyUnavailable(assignmentId, jobId, message, !retryable);
      return { status: retryable ? JobStatus.FAILED_RETRYABLE : JobStatus.FAILED_PERMANENT };
    }
  }

  async recordWatched(
    assignmentId: string,
    dwellMs: number,
    actor: AccessActor,
  ): Promise<PersonalizedVideoAssignmentView> {
    const assignment = await this.requireAssignableLesson(assignmentId);
    assertStudentOwner(actor, assignment.studentId);
    await this.prisma.personalizedVideoEvent.create({
      data: {
        assignmentId,
        studentId: assignment.studentId,
        kind: PersonalizedVideoEvidenceKind.WATCHED,
        dwellMs,
      },
    });
    if (assignment.assetId) {
      await this.prisma.modalityOutcome.create({
        data: {
          studentId: assignment.studentId,
          assetId: assignment.assetId,
          sessionId: assignment.id,
          completed: false,
          dwellMs,
          modelVersion: "personalized-video-v1",
        },
      });
    }
    return this.toView(await this.requireAssignment(assignmentId));
  }

  async recordCompleted(
    assignmentId: string,
    dwellMs: number,
    actor: AccessActor,
  ): Promise<PersonalizedVideoAssignmentView> {
    const assignment = await this.requireAssignableLesson(assignmentId);
    assertStudentOwner(actor, assignment.studentId);
    await this.prisma.personalizedVideoEvent.create({
      data: {
        assignmentId,
        studentId: assignment.studentId,
        kind: PersonalizedVideoEvidenceKind.COMPLETED,
        dwellMs,
      },
    });
    if (assignment.assetId) {
      await this.prisma.modalityOutcome.create({
        data: {
          studentId: assignment.studentId,
          assetId: assignment.assetId,
          sessionId: assignment.id,
          completed: true,
          dwellMs,
          modelVersion: "personalized-video-v1",
        },
      });
    }
    return this.toView(await this.requireAssignment(assignmentId));
  }

  async recordExit(
    assignmentId: string,
    input: { answer: string; working: string },
    actor: AccessActor,
  ): Promise<PersonalizedVideoAssignmentView> {
    const assignment = await this.requireAssignableLesson(assignmentId);
    assertStudentOwner(actor, assignment.studentId);
    const script = assignment.script as StoredScript | null;
    const expected = script?.exit?.expected ?? "";
    const correct =
      Boolean(expected) &&
      normalizeAlgebraAnswer(input.answer) === normalizeAlgebraAnswer(expected);
    await this.prisma.personalizedVideoEvent.create({
      data: {
        assignmentId,
        studentId: assignment.studentId,
        kind: PersonalizedVideoEvidenceKind.INDEPENDENT_EXIT,
        exitPrompt: script?.exit?.prompt,
        exitAnswer: input.answer,
        exitWorking: input.working,
        exitCorrect: correct,
      },
    });
    if (assignment.assetId) {
      await this.prisma.modalityOutcome.create({
        data: {
          studentId: assignment.studentId,
          assetId: assignment.assetId,
          sessionId: assignment.id,
          completed: false,
          dwellMs: 0,
          retestCorrect: correct,
          modelVersion: "personalized-video-v1",
        },
      });
    }
    return this.toView(await this.requireAssignment(assignmentId));
  }

  async teacherReport(actor: AccessActor, demo = false): Promise<PersonalizedVideoTeacherReport> {
    assertTeacher(actor);
    const schoolId = actor.role === "teacher" ? actor.schoolId : undefined;
    const rows = await this.prisma.personalizedVideoAssignment.findMany({
      where: schoolId ? { schoolId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = row.studentKey ?? row.studentId;
      if (!byKey.has(key)) byKey.set(key, row);
    }

    const canSeedDemo = demo && (!schoolId || schoolId === DEMO_SCHOOL_ID);
    const students = canSeedDemo
      ? await Promise.all(
          PILOT_TEMPLATE_KEYS.map(async (key) => {
            const row = byKey.get(key);
            if (row) return this.toTeacherRow(row);
            return this.seedTeacherRow(key);
          }),
        )
      : await Promise.all(rows.map(async (row) => this.toTeacherRow(row)));

    const exitAttempted = students.filter((student) => student.exitAttempt).length;
    const exitVerified = students.filter((student) => student.exitAttempt?.correct).length;
    return {
      generatedAt: new Date().toISOString(),
      demo,
      students,
      totals: {
        assignments: students.length,
        readyOrFallback: students.filter((student) =>
          ["READY", "FALLBACK"].includes(student.assignmentStatus),
        ).length,
        abstained: students.filter((student) => student.assignmentStatus === "ABSTAINED").length,
        exitAttempted,
        exitVerified,
      },
    };
  }

  private async resolveTrustedEvidence(
    input: CreateAssignmentInput,
    studentId: string,
    options: { allowDemoSeeds: boolean; allowTestHooks: boolean },
  ): Promise<{
    snapshot: PersonalizedVideoEvidenceSnapshot;
    template: ReturnType<typeof templateForKey>;
    lotusRecordId?: string;
  }> {
    if (input.lotusSessionId) {
      const record = await this.prisma.lotusSessionRecord.findUnique({
        where: { sessionId: input.lotusSessionId },
      });
      if (!record) {
        throw new BadRequestException("No persisted Lotus session matches this id.");
      }
      const session = record.payload as unknown as LotusSessionView;
      if (session.studentId !== studentId) {
        throw new BadRequestException("This Lotus session belongs to a different student.");
      }
      const snapshot = snapshotFromLotusSession(session);
      const template = selectTemplateFromEvidence(snapshot);
      return { snapshot, template, lotusRecordId: String(record.id) };
    }

    const studentKey = input.studentKey ?? studentKeyFromId(studentId);
    const template = studentKey ? templateForKey(studentKey) : undefined;
    if (options.allowTestHooks && template) {
      return {
        snapshot: {
          ...template.evidence,
          evidenceSource: "DEMO_SEED",
        },
        template,
      };
    }
    if (options.allowDemoSeeds && isDemoStudentId(studentId) && template) {
      return {
        snapshot: {
          ...template.evidence,
          evidenceSource: "DEMO_SEED",
        },
        template,
      };
    }

    throw new BadRequestException(
      "A persisted Lotus session is required to create this assignment.",
    );
  }

  private async requireAssignment(id: string) {
    const row = await this.prisma.personalizedVideoAssignment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Personalized video assignment not found.");
    return row;
  }

  private async requireAssignableLesson(id: string) {
    const row = await this.requireAssignment(id);
    if (row.status === PersonalizedVideoAssignmentStatus.READY) return row;
    if (row.status === PersonalizedVideoAssignmentStatus.FALLBACK) return row;
    if (row.status === PersonalizedVideoAssignmentStatus.PREPARING) {
      throw new BadRequestException("This lesson is still preparing.");
    }
    if (row.status === PersonalizedVideoAssignmentStatus.UNDER_REVIEW) {
      throw new BadRequestException("This lesson is waiting for review.");
    }
    if (row.status === PersonalizedVideoAssignmentStatus.TEMPORARILY_UNAVAILABLE) {
      throw new BadRequestException("This lesson is temporarily unavailable.");
    }
    throw new BadRequestException("This lesson is not ready for student evidence events.");
  }

  private async failJob(jobId: string, lastError: string, permanent: boolean): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: permanent ? JobStatus.FAILED_PERMANENT : JobStatus.FAILED_RETRYABLE,
        lastError,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  private async applyUnavailable(
    assignmentId: string,
    jobId: string,
    message: string,
    permanent: boolean,
  ): Promise<void> {
    const assignment = await this.requireAssignment(assignmentId);
    await this.failJob(jobId, message, permanent);
    const fallbackStatus =
      assignment.scriptSource === "APPROVED_TEMPLATE"
        ? PersonalizedVideoAssignmentStatus.FALLBACK
        : PersonalizedVideoAssignmentStatus.TEMPORARILY_UNAVAILABLE;
    await this.prisma.personalizedVideoAssignment.update({
      where: { id: assignmentId },
      data: {
        status: fallbackStatus,
        fallbackReason: permanent ? message : `Renderer unavailable: ${message}`,
      },
    });
  }

  private async failRenderFromProvider(jobId: string, message: string): Promise<{ status: string }> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    const assignmentId = (job?.payload as JobPayload | undefined)?.assignmentId;
    if (!assignmentId) {
      await this.failJob(jobId, message, false);
      return { status: JobStatus.FAILED_RETRYABLE };
    }
    await this.applyUnavailable(assignmentId, jobId, message, false);
    return { status: JobStatus.FAILED_RETRYABLE };
  }

  private async completeRender(
    jobId: string,
    rendered: {
      storageRef: string;
      transcriptRef: string;
      durationMs: number;
      integrity: Record<string, unknown>;
    },
  ): Promise<{ status: string }> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return { status: "MISSING" };
    const payload = (job.payload ?? {}) as JobPayload;
    const assignmentId = payload.assignmentId;
    if (!assignmentId) {
      await this.failJob(jobId, "Render job payload is missing assignmentId.", true);
      return { status: JobStatus.FAILED_PERMANENT };
    }
    const assignment = await this.requireAssignment(assignmentId);
    const script = assignment.script as StoredScript | null;
    const lesson = script?.lesson;
    if (!lesson) {
      await this.applyUnavailable(assignmentId, jobId, "No lesson script to render.", true);
      return { status: JobStatus.FAILED_PERMANENT };
    }
    const pending =
      Boolean(payload.forcePendingReview) ||
      (payload.scriptSource ?? assignment.scriptSource) === "CONSTRAINED_AI";
    const reviewStatus = pending ? ReviewStatus.PENDING_REVIEW : ReviewStatus.APPROVED;
    const asset = await this.createAsset({
      assignmentId,
      conceptId: assignment.conceptId,
      lesson,
      rendered: {
        storageRef: rendered.storageRef,
        transcriptRef: rendered.transcriptRef,
        durationMs: rendered.durationMs,
        integrity: rendered.integrity,
      },
      reviewStatus,
    });
    await this.prisma.personalizedVideoAssignment.update({
      where: { id: assignmentId },
      data: {
        assetId: asset.assetId,
        renderResult: rendered as object,
        status: pending
          ? PersonalizedVideoAssignmentStatus.UNDER_REVIEW
          : PersonalizedVideoAssignmentStatus.READY,
      },
    });
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        resultRef: rendered.storageRef,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return { status: JobStatus.COMPLETED };
  }

  private async createAsset(input: {
    assignmentId: string;
    conceptId: string;
    lesson: PersonalizedVideoLesson;
    rendered: {
      storageRef: string;
      transcriptRef: string;
      durationMs: number;
      integrity: Record<string, unknown>;
    };
    reviewStatus: ReviewStatus;
  }) {
    const assetId = `PV_${input.assignmentId}`;
    try {
      return await this.prisma.modalityAsset.create({
        data: {
          assetId,
          modality: "VIDEO",
          conceptId: input.conceptId,
          unitId: "linear-equations-one-variable",
          subjectId: "mathematics",
          storageRef: input.rendered.storageRef,
          transcriptRef: input.rendered.transcriptRef,
          durationMs: input.rendered.durationMs,
          reviewStatus: input.reviewStatus,
        },
      });
    } catch {
      return {
        assetId,
        reviewStatus: input.reviewStatus,
        storageRef: input.rendered.storageRef,
        transcriptRef: input.rendered.transcriptRef,
        durationMs: input.rendered.durationMs,
      };
    }
  }

  private isPlayableVideo(storageRef?: string | null): boolean {
    return Boolean(storageRef && /^(https?:\/\/|s3:\/\/)/.test(storageRef));
  }

  private async toView(row: {
    id: string;
    studentId: string;
    studentKey: string | null;
    schoolId?: string | null;
    status: PersonalizedVideoAssignmentStatus;
    diagnosticState: string;
    conceptId: string;
    learningObjective: string;
    evidenceSnapshot: unknown;
    script: unknown;
    assetId: string | null;
    renderJobId: string | null;
    fallbackReason: string | null;
    abstainReason: string | null;
  }): Promise<PersonalizedVideoAssignmentView> {
    const script = (row.script ?? {}) as StoredScript;
    const events = await this.prisma.personalizedVideoEvent.findMany({
      where: { assignmentId: row.id },
      orderBy: { createdAt: "asc" },
    });
    const watched = events.filter((event) => event.kind === "WATCHED");
    const completed = events.some((event) => event.kind === "COMPLETED");
    const exitEvent = [...events].reverse().find((event) => event.kind === "INDEPENDENT_EXIT");
    const asset = row.assetId
      ? await this.prisma.modalityAsset.findUnique({ where: { assetId: row.assetId } })
      : null;
    const job = row.renderJobId
      ? await this.prisma.job.findUnique({ where: { id: row.renderJobId } })
      : null;
    const delivery = this.deliveryOf(row.status, asset?.reviewStatus, asset?.storageRef, script.lesson);
    const mediaClaims = {
      assignmentId: row.id,
      studentId: row.studentId,
      schoolId: row.schoolId ?? schoolIdForStudent(row.studentId),
    };
    return {
      id: row.id,
      studentId: row.studentId,
      studentKey: (row.studentKey as PilotStudentKey | null) ?? null,
      name: script.name ?? "Student",
      roll: script.roll,
      status: row.status,
      delivery,
      diagnosticState: row.diagnosticState,
      conceptId: row.conceptId,
      learningObjective: row.learningObjective,
      learnerDecision: script.learnerDecision ?? "",
      teacherDecision: script.teacherDecision ?? "",
      uncertainty: script.uncertainty ?? "Moderate",
      statusLabel: script.statusLabel ?? row.status,
      evidenceSnapshot: row.evidenceSnapshot as PersonalizedVideoEvidenceSnapshot,
      lesson: script.lesson ?? null,
      exit: script.exit ?? null,
      asset:
        asset && asset.reviewStatus === "APPROVED" && this.isPlayableVideo(asset.storageRef)
          ? {
              assetId: asset.assetId,
              reviewStatus: asset.reviewStatus,
              storageRef: attachMediaAccess(asset.storageRef, mediaClaims) ?? asset.storageRef,
              transcriptRef: attachMediaAccess(asset.transcriptRef ?? undefined, mediaClaims),
              durationMs: asset.durationMs ?? undefined,
            }
          : null,
      job: job
        ? {
            id: job.id,
            status: job.status as PersonalizedVideoJobView["status"],
            lastError: job.lastError,
          }
        : null,
      fallbackReason: row.fallbackReason,
      abstainReason: row.abstainReason,
      watched: watched.length > 0,
      completed,
      dwellMs: watched.reduce((sum, event) => sum + (event.dwellMs ?? 0), 0),
      exitAttempt: exitEvent
        ? {
            prompt: exitEvent.exitPrompt ?? script.exit?.prompt ?? "",
            answer: exitEvent.exitAnswer ?? undefined,
            working: exitEvent.exitWorking ?? undefined,
            correct: exitEvent.exitCorrect ?? undefined,
            createdAt: exitEvent.createdAt.toISOString(),
          }
        : null,
      limitations: [...PERSONALIZED_VIDEO_LIMITATIONS],
    };
  }

  private deliveryOf(
    status: PersonalizedVideoAssignmentStatus,
    reviewStatus?: string | null,
    storageRef?: string | null,
    lesson?: PersonalizedVideoLesson,
  ): PersonalizedVideoDelivery {
    if (status === "ABSTAINED") return "ABSTAINED";
    if (status === "PREPARING") return "PREPARING";
    if (status === "TEMPORARILY_UNAVAILABLE") return "UNAVAILABLE";
    if (reviewStatus === "PENDING_REVIEW") return "UNDER_REVIEW";
    if (status === "UNDER_REVIEW") return "UNDER_REVIEW";
    if (status === "READY" && reviewStatus === "APPROVED" && this.isPlayableVideo(storageRef)) {
      return "VIDEO";
    }
    if (status === "FALLBACK" || lesson) return "HTML_FALLBACK";
    if (status === "READY") return "HTML_FALLBACK";
    return "UNAVAILABLE";
  }

  private async toTeacherRow(row: {
    id: string;
    studentId: string;
    studentKey: string | null;
    schoolId?: string | null;
    status: PersonalizedVideoAssignmentStatus;
    diagnosticState: string;
    conceptId: string;
    learningObjective: string;
    evidenceSnapshot: unknown;
    script: unknown;
    assetId: string | null;
    renderJobId: string | null;
    fallbackReason: string | null;
    abstainReason: string | null;
  }) {
    const view = await this.toView(row);
    return {
      studentId: view.studentId,
      studentKey: view.studentKey,
      name: view.name,
      roll: view.roll,
      diagnosticState: view.diagnosticState,
      statusLabel: view.statusLabel,
      learnerDecision: view.learnerDecision,
      teacherDecision: view.teacherDecision,
      uncertainty: view.uncertainty,
      observedEvidence: view.evidenceSnapshot.observedEvidence ?? [],
      assignmentStatus: view.status,
      delivery: view.delivery,
      videoTitle: view.lesson?.title,
      watched: view.watched,
      completed: view.completed,
      exitAttempt: view.exitAttempt,
      limitations: view.limitations,
    };
  }

  private seedTeacherRow(key: PilotStudentKey) {
    const template = APPROVED_VIDEO_TEMPLATES[key];
    return {
      studentId: `demo_${key}`,
      studentKey: key,
      name: template.name,
      roll: template.roll,
      diagnosticState: template.diagnosticState,
      statusLabel: template.statusLabel,
      learnerDecision: template.learnerDecision,
      teacherDecision: template.teacherDecision,
      uncertainty: template.uncertainty,
      observedEvidence: template.evidence.observedEvidence,
      assignmentStatus: template.remediation
        ? PersonalizedVideoAssignmentStatus.FALLBACK
        : PersonalizedVideoAssignmentStatus.ABSTAINED,
      delivery: template.remediation ? "HTML_FALLBACK" : "ABSTAINED",
      videoTitle: template.lesson.title,
      watched: false,
      completed: false,
      exitAttempt: null,
      limitations: [...PERSONALIZED_VIDEO_LIMITATIONS],
    } as PersonalizedVideoTeacherReport["students"][number];
  }
}
