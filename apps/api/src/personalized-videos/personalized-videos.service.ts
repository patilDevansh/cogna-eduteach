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
  type PersonalizedVideoLessonScene,
  type PersonalizedVideoScriptSource,
  type PersonalizedVideoTeacherReport,
  type PilotStudentKey,
  type LessonThemeChoice,
  type PersonalizedLessonAnimationView,
  type PracticeAnswer,
  type PracticeCheckResult,
  type PracticeItem,
  type PracticeSetView,
} from "@cogna/shared";
import { randomUUID } from "crypto";
import { readFile } from "node:fs/promises";
import type { TtsProvider } from "../ai/tts.service";
import { probeAudioDurationSeconds, readTtsCache, writeTtsCache } from "./tts-cache";
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
  themedLesson,
} from "./approved-templates";
import { snapshotFromLotusSession } from "./lotus-evidence";
import { animatedLessonsEnabled, planAnimatedLesson } from "./animated-lessons";
import { planFactorisationLesson } from "./factorisation-lessons";
import { DEMO_ANIMATIONS, LessonNarrator, buildForTheme, demoLessonRecord, type AnimationInput } from "./lesson-animation";
import { authoredDurationInFrames, type AuthoredLessonProps, type DistributionLessonProps, type TrinomialLessonProps } from "@cogna/lesson-video";
import type { OpenAIService } from "../ai/openai.service";
import { buildLessonBrief, type LessonBrief } from "./ai-authoring/lesson-brief";
import { authorLesson, type AuthoringAttempt } from "./ai-authoring/lesson-author";
import { generatePractice } from "./ai-authoring/practice-generator";
import { taskVerdict } from "./ai-authoring/lesson-verifier";
import {
  aiLessonsEnabled,
  checkPracticeAnswer,
  chooseAuthor,
  placeholderLesson,
  practiceItemView,
  summaryFromDraft,
} from "./ai-authoring/authoring-pipeline";
import { skillName } from "../lotus/lotus-factorisation-catalogue";
import { createMediaStorageFromEnv, defaultPublicBaseUrl, type MediaStorage } from "./media-storage";
import { evaluateRemediationEligibility } from "./video-evidence";
import { validateVideoLanguage } from "./video-language";
import { collectSceneClaims, validateMathClaims } from "./video-math";
import {
  RendererUnavailableError,
  VideoRendererAdapter,
} from "./video-renderer.adapter";
import { verifyStepValidity } from "../engines/diagnostic-v2/linear-bracket-verifier";

const JOB_TYPE = "PERSONALIZED_VIDEO_RENDER";
const MAX_ANIMATED_ATTEMPTS = 3;
/** How long an AI-authoring claim holds before another worker may treat it as crashed and take over. */
const AUTHORING_LOCK_MS = 10 * 60 * 1000;
const WORKER_ID = `personalized-video-${process.pid}`;

/**
 * Cheap revert switch for the slides delivery: flip this off and every
 * lesson falls straight back to the baked-video path with no code changes.
 * Every approved template uses slides by default now, not just the ones
 * with a drag-eligible EQUATION_TRANSFORMATION claim — Rohan/Divya's drag
 * widget is one scene type slides can render, not the reason to use it.
 */
/**
 * Evidence-built animations play live in the browser (themed, narrated,
 * with checkpoints) instead of being rendered to MP4. Set
 * COGNA_ANIMATION_DELIVERY=mp4 to go back to the rendered-video path.
 */
export function interactiveAnimationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COGNA_ANIMATION_DELIVERY?.trim() !== "mp4";
}

export function slidesDeliveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COGNA_SLIDES_DELIVERY_ENABLED?.trim() !== "false";
}

interface InteractiveRenderResult {
  interactive: true;
  scenesAudio: Array<{ index: number; key: string }>;
}

/** renderResult for a lesson delivered as a live, themed animation. */
interface AnimationRenderResult {
  animation: true;
  kind: AnimationKind;
  prewarmedTheme: string;
  silentBeats: number;
}

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
  /** Present when the lesson is an evidence-built animation (animated-lessons.ts / factorisation-lessons.ts / AI-authored). */
  animation?: DistributionLessonProps | TrinomialLessonProps | AuthoredLessonProps;
  /** Which composition renders `animation`; absent means distribution (older rows). */
  animationKind?: AnimationKind;
  /** The planner's builder input, so the interactive player can rebuild the lesson per theme. */
  animationInput?: AnimationInput;
  /**
   * AI authoring: "pending" while the background job writes and verifies the
   * lesson; "done" when a verified draft replaced the placeholder or recipe;
   * "failed" when it never passed (the recipe lesson, if any, is used instead).
   */
  authoring?: {
    status: "pending" | "done" | "failed";
    brief: LessonBrief;
    /** Which author: real sessions use GPT, fake-model sessions the fake author. */
    author: "openai" | "fake";
    model?: string;
    attempts?: AuthoringAttempt[];
    claimsChecked?: number;
    practiceFromCode?: boolean;
    reason?: string;
  };
  /** For exit items built by the AI author or the generator: graded by the algebra engine, so any equivalent finished form counts. */
  exitCheck?: { task: "factorise" | "expand" | "simplify"; expression: string };
  /** Independent practice played after the lesson; answers stay on the server. */
  practice?: { source: "AI_VERIFIED" | "CODE_GENERATED"; skillId: string; items: PracticeItem[] };
  /** Tries per practice item, for the reveal-after-two-misses rule and the teacher view. */
  practiceAttempts?: Record<string, { tries: number; correct: boolean }>;
};

type AnimationKind = "distribution" | "trinomial" | "authored";

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
  private mediaStorage: MediaStorage | null = null;
  private readonly narrator: LessonNarrator;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly renderer: VideoRendererAdapter,
    private readonly tts?: TtsProvider,
    private readonly openai?: OpenAIService,
  ) {
    this.narrator = new LessonNarrator(tts, () => this.getMediaStorage());
  }

  private getMediaStorage(): MediaStorage {
    if (!this.mediaStorage) this.mediaStorage = createMediaStorageFromEnv();
    return this.mediaStorage;
  }

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
    // An animation built from the student's own verified mistakes beats a
    // keyword-matched template. Authored narration + computed numbers only,
    // so it stays APPROVED_TEMPLATE (no model wrote any of it).
    const names = await this.studentNames(studentId, input.name, template?.name);
    const canAnimate =
      gate.eligible &&
      !(options.allowTestHooks && input.scriptOverride) &&
      snapshot.evidenceSource === "LOTUS_SESSION" &&
      animatedLessonsEnabled();
    const factorisation = canAnimate && trusted.session ? planFactorisationLesson(trusted.session, names.first) : null;
    const planned = factorisation?.kind === "trinomial" ? factorisation : null;
    const distribution = canAnimate && !factorisation ? planAnimatedLesson(snapshot, names.first) : null;
    const animated = planned
      ? { ...planned, animationKind: "trinomial" as AnimationKind }
      : distribution
        ? { ...distribution, animationKind: "distribution" as AnimationKind }
        : null;
    // AI authoring: the model writes a lesson from this student's own answers, in the background job,
    // and it is used only if every claim passes the verifier. The recipe lesson (if any) is the fallback.
    const brief = canAnimate && aiLessonsEnabled() && trusted.session ? buildLessonBrief(trusted.session, names.first) : null;
    const author = brief && trusted.session ? chooseAuthor(trusted.session, this.openai) : null;
    const authoring: StoredScript["authoring"] = brief && author
      ? { status: "pending", brief, author: author.label === "fake-lesson-author" ? "fake" : "openai" }
      : undefined;
    const abstainReason = factorisation?.kind === "abstain" ? factorisation.reason : undefined;
    const lesson =
      (options.allowTestHooks ? input.scriptOverride : undefined) ??
      animated?.lesson ??
      (authoring ? placeholderLesson(authoring.brief) : null) ??
      (template && !factorisation ? themedLesson(template) : null);
    const practiceSkill = brief?.targetSkill.id ?? (planned ? planned.skillId : distribution ? "C3_DISTRIBUTIVE_PROPERTY" : null);
    const practice = practiceSkill && (animated || authoring)
      ? generatePractice(practiceSkill, `${studentId}:${trusted.session?.sessionId ?? ""}`, brief?.studentItems.map((i) => i.expression) ?? [])
      : null;
    const exit =
      (options.allowTestHooks ? input.exitOverride : undefined) ?? animated?.exit ?? template?.exit ?? null;
    const stored: StoredScript = {
      name: names.full,
      roll: input.roll ?? template?.roll,
      learnerDecision: animated?.learnerDecision ?? template?.learnerDecision ?? "Use only the supported evidence.",
      teacherDecision:
        animated?.teacherDecision ?? template?.teacherDecision ?? "Inspect the exact question-and-step evidence before acting.",
      uncertainty: animated ? "Moderate" : (template?.uncertainty ?? "High"),
      statusLabel: animated ? "Targeted bridge" : (template?.statusLabel ?? (gate.eligible ? "Targeted bridge" : "Evidence check")),
      lesson: lesson as PersonalizedVideoLesson,
      exit: exit ?? (practice ? { prompt: practice.exit.prompt, expected: practice.exit.answer, evidencePurpose: "A fresh item of the same kind, answered without support." } : null),
      ...(!exit && practice ? { exitCheck: { task: practice.exit.task, expression: practice.exit.expression } } : {}),
      ...(authoring ? { authoring } : {}),
      ...(practice && practiceSkill ? { practice: { source: "CODE_GENERATED" as const, skillId: practiceSkill, items: practice.items } } : {}),
      ...(animated
        ? {
            animation: animated.animation,
            animationKind: animated.animationKind,
            animationInput: { kind: animated.animationKind, input: animated.input } as AnimationInput,
          }
        : {}),
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
            ? (abstainReason ?? "No approved lesson is mapped to this evidence yet.")
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
      ...lesson.scenes.flatMap((scene) => [
        scene.headline,
        scene.narration,
        ...scene.equation.map((step) => step.text),
      ]),
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
        studentKey: template?.studentKey ?? studentKeyFromId(studentId) ?? (input.lotusSessionId ? undefined : input.studentKey),
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

    if (script?.authoring?.status === "pending" && interactiveAnimationEnabled()) {
      return this.processAuthoringJob(jobId, job, assignmentId, script);
    }

    if (script?.animation && script.animationInput && interactiveAnimationEnabled()) {
      return this.processAnimationReadyJob(jobId, job, assignmentId, script.animationInput);
    }

    // MP4 rendering exists for the recipe lessons only; AI-authored lessons always play live.
    if (script?.animation && script.animationKind !== "authored" && script.animationInput?.kind !== "authored") {
      return this.processAnimatedRenderJob(
        jobId, job, assignmentId,
        script.animation as DistributionLessonProps | TrinomialLessonProps,
        (script.animationKind ?? "distribution") as "distribution" | "trinomial",
        payload,
      );
    }

    if (slidesDeliveryEnabled()) {
      return this.processInteractiveRenderJob(jobId, job, assignmentId, assignment, lesson, payload);
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
      if (!providerJobId) {
        if (job.status === JobStatus.RUNNING) {
          // Already claimed by an earlier tick that's still inside
          // synthesis/submit (TTS + render submission can take several
          // seconds — long enough for processPendingRenderJobs's ~2.5s
          // interval to fire again before providerJobId is persisted).
          // That tick owns this job; back off rather than resubmitting.
          return { status: JobStatus.RUNNING };
        }
        // Atomically claim this job before doing any slow work. Only the
        // caller whose compare-and-swap on status actually lands wins;
        // everyone else falls into the RUNNING branch above on their next read.
        const claim = await this.prisma.job.updateMany({
          where: { id: jobId, status: job.status },
          data: { status: JobStatus.RUNNING },
        });
        if (claim.count === 0) {
          return { status: JobStatus.RUNNING };
        }
        // Narration audio only means anything to the local Remotion renderer —
        // a local filesystem path is meaningless to a remote render endpoint.
        const narratedScenes = this.renderer.usesLocalRenderer()
          ? await this.synthesizeNarration(lesson.scenes)
          : lesson.scenes;
        const submitted = await this.renderer.submit({
          assignmentId,
          title: lesson.title,
          captions: lesson.scenes.map((scene) => scene.narration),
          scenes: narratedScenes.map((scene) => ({
            eyebrow: scene.eyebrow,
            headline: scene.headline,
            equation: scene.equation,
            narration: scene.narration,
            durationSeconds: scene.durationSeconds,
            accent: scene.accent,
            audioPath: (scene as { audioPath?: string }).audioPath,
          })),
        });
        providerJobId = submitted.providerJobId;
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
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

  /**
   * Evidence-built animations always render to a real MP4 (there is no
   * slides equivalent of the motion). Same claim → narrate → submit → poll
   * shape as processRenderJob: narration is per beat, and each beat's length
   * is set from its real audio so the motion lands on the words.
   */
  private async processAnimatedRenderJob(
    jobId: string,
    job: { status: JobStatus },
    assignmentId: string,
    animation: DistributionLessonProps | TrinomialLessonProps,
    kind: "distribution" | "trinomial",
    payload: JobPayload,
  ): Promise<{ status: string }> {
    try {
      let providerJobId = payload.providerJobId;
      if (!providerJobId) {
        if (job.status === JobStatus.RUNNING) return { status: JobStatus.RUNNING };
        const claim = await this.prisma.job.updateMany({
          where: { id: jobId, status: job.status },
          data: { status: JobStatus.RUNNING, lockedAt: new Date(), lockedBy: WORKER_ID, attemptCount: { increment: 1 } },
        });
        if (claim.count === 0) return { status: JobStatus.RUNNING };

        // One beat at a time, like synthesizeNarration: firing every beat at
        // once gets most of them rate-limited into silence.
        const scenes: Array<(typeof animation.scenes)[number]> = [];
        for (const scene of animation.scenes) {
          const beats: (typeof animation.scenes)[number]["beats"] = [];
          for (const beat of scene.beats) {
            const voiced = await this.synthesizeBeat(beat.text);
            beats.push(voiced ? { ...beat, audioPath: voiced.audioPath, seconds: voiced.seconds + 0.7 } : beat);
          }
          scenes.push({ ...scene, beats });
        }
        const silentBeats = scenes.flatMap((sc) => sc.beats).filter((b) => !b.audioPath).length;
        if (silentBeats && this.tts?.enabled) {
          console.warn(`[personalized-videos] ${silentBeats} animated beat(s) for ${assignmentId} have no narration; rendering them silent.`);
        }
        const narrated = { ...animation, scenes };
        const submitted = await this.renderer.submitAnimated({ assignmentId, lesson: narrated, kind });
        providerJobId = submitted.providerJobId;
        await this.prisma.job.update({
          where: { id: jobId },
          data: { payload: { ...payload, providerJobId } as object },
        });
      }

      const polled = await this.renderer.poll(providerJobId);
      if (polled.status === "RUNNING") {
        await this.prisma.job.update({
          where: { id: jobId },
          data: { status: JobStatus.RUNNING, runAfter: new Date(), payload: { ...payload, providerJobId } as object, lastError: null },
        });
        return { status: JobStatus.RUNNING };
      }
      if (polled.status === "FAILED") {
        // A failed local render is final for that providerJobId — polling it
        // again can only fail again. Drop it so the next tick re-narrates
        // (cached) and resubmits, up to MAX_ANIMATED_ATTEMPTS.
        const attempts = (await this.prisma.job.findUnique({ where: { id: jobId } }))?.attemptCount ?? 0;
        const retry = polled.retryable && attempts < MAX_ANIMATED_ATTEMPTS;
        await this.prisma.job.update({
          where: { id: jobId },
          data: { payload: { ...payload, providerJobId: undefined } as object },
        });
        await this.applyUnavailable(assignmentId, jobId, polled.message, !retry);
        return { status: retry ? JobStatus.FAILED_RETRYABLE : JobStatus.FAILED_PERMANENT };
      }
      return this.completeRender(jobId, polled.result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof RendererUnavailableError || error instanceof TypeError;
      await this.applyUnavailable(assignmentId, jobId, message, !retryable);
      return { status: retryable ? JobStatus.FAILED_RETRYABLE : JobStatus.FAILED_PERMANENT };
    }
  }

  /**
   * Live-animation delivery: nothing to render. Narrate the classic theme now
   * (so the first open is instant) and mark the lesson ready. Other themes
   * are narrated on first request and cached from then on.
   */
  private async processAnimationReadyJob(
    jobId: string,
    job: { status: JobStatus },
    assignmentId: string,
    source: AnimationInput,
    options: { claimed?: boolean } = {},
  ): Promise<{ status: string }> {
    if (!options.claimed) {
      if (job.status === JobStatus.RUNNING) return { status: JobStatus.RUNNING };
      const claim = await this.prisma.job.updateMany({
        where: { id: jobId, status: job.status },
        data: { status: JobStatus.RUNNING, lockedAt: new Date(), lockedBy: WORKER_ID, attemptCount: { increment: 1 } },
      });
      if (claim.count === 0) return { status: JobStatus.RUNNING };
    }
    try {
      const assignment = await this.requireAssignment(assignmentId);
      const warm = await this.narrator.narrate({
        assignmentId,
        source,
        theme: "classic",
        claims: { assignmentId, studentId: assignment.studentId, schoolId: assignment.schoolId ?? schoolIdForStudent(assignment.studentId) },
      });
      const result: AnimationRenderResult = { animation: true, kind: source.kind, prewarmedTheme: "classic", silentBeats: warm.silentBeats };
      await this.prisma.personalizedVideoAssignment.update({
        where: { id: assignmentId },
        data: { renderResult: result as object, status: PersonalizedVideoAssignmentStatus.READY },
      });
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, completedAt: new Date(), lastError: null, lockedAt: null, lockedBy: null },
      });
      return { status: JobStatus.COMPLETED };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.applyUnavailable(assignmentId, jobId, message, false);
      return { status: JobStatus.FAILED_RETRYABLE };
    }
  }

  /**
   * AI authoring job: write → verify → rewrite (lesson-author.ts), then
   * narrate the verified lesson like any other. If the AI is unavailable or
   * never passes, the recipe lesson is used when there is one; otherwise the
   * assignment abstains with the reason. A draft that failed is never shown.
   */
  private async processAuthoringJob(
    jobId: string,
    _job: { status: JobStatus },
    assignmentId: string,
    script: StoredScript,
  ): Promise<{ status: string }> {
    // Claim before calling the model: a worker tick during the minute GPT takes must not start a
    // second author, whose lesson would overwrite this one under a student already practising.
    // A RUNNING claim older than AUTHORING_LOCK_MS is a crashed run and may be taken over.
    const staleBefore = new Date(Date.now() - AUTHORING_LOCK_MS);
    const claim = await this.prisma.job.updateMany({
      where: {
        id: jobId,
        OR: [
          { status: { in: [JobStatus.PENDING, JobStatus.FAILED_RETRYABLE] } },
          { status: JobStatus.RUNNING, lockedAt: { lt: staleBefore } },
        ],
      },
      data: { status: JobStatus.RUNNING, lockedAt: new Date(), lockedBy: WORKER_ID, attemptCount: { increment: 1 } },
    });
    if (claim.count === 0) return { status: JobStatus.RUNNING };
    const authoring = script.authoring!;
    const author = authoring.author === "fake"
      ? chooseAuthor({ modelConfiguration: { primary: "fake-e2e" } } as LotusSessionView, undefined)
      : chooseAuthor({ modelConfiguration: { primary: "" } } as LotusSessionView, this.openai);
    let next: StoredScript;
    if (!author) {
      next = { ...script, authoring: { ...authoring, status: "failed", reason: "No AI author is configured." } };
    } else {
      const outcome = await authorLesson(authoring.brief, author, { seed: assignmentId });
      if (outcome.ok) {
        const input = { draft: outcome.draft, studentName: authoring.brief.studentFirstName };
        const source: AnimationInput = {
          kind: "authored",
          input,
          authoredBy: { model: outcome.model, attempts: outcome.attempts.length, claimsChecked: outcome.claimsChecked },
        };
        const props = buildForTheme(source, "classic") as AuthoredLessonProps;
        const summary = summaryFromDraft(outcome.draft, authoredDurationInFrames(props, 30) / 30);
        next = {
          ...script,
          learnerDecision: outcome.draft.learnerDecision,
          teacherDecision: outcome.draft.teacherDecision,
          statusLabel: "Targeted bridge",
          uncertainty: "Moderate",
          lesson: summary.lesson,
          exit: summary.exit,
          exitCheck: { task: outcome.draft.exit.task, expression: outcome.draft.exit.expression },
          animation: props,
          animationKind: "authored",
          animationInput: source,
          practice: {
            source: outcome.practiceFromCode ? "CODE_GENERATED" : "AI_VERIFIED",
            skillId: authoring.brief.targetSkill.id,
            items: outcome.draft.practice,
          },
          authoring: { ...authoring, status: "done", model: outcome.model, attempts: outcome.attempts, claimsChecked: outcome.claimsChecked, practiceFromCode: outcome.practiceFromCode },
        };
      } else {
        next = { ...script, authoring: { ...authoring, status: "failed", model: outcome.model, attempts: outcome.attempts, reason: outcome.reason } };
      }
    }

    if (next.authoring?.status === "failed" && !next.animationInput) {
      await this.prisma.personalizedVideoAssignment.update({
        where: { id: assignmentId },
        data: {
          script: next as object,
          status: PersonalizedVideoAssignmentStatus.ABSTAINED,
          abstainReason: `No lesson yet for ${next.authoring.brief.targetSkill.name}: ${next.authoring.reason ?? "the AI lesson did not pass verification"}.`,
        },
      });
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, completedAt: new Date(), lastError: next.authoring.reason ?? null, lockedAt: null, lockedBy: null },
      });
      return { status: JobStatus.COMPLETED };
    }

    await this.prisma.personalizedVideoAssignment.update({
      where: { id: assignmentId },
      data: {
        script: next as object,
        learningObjective: next.lesson.objective,
        ...(next.authoring?.status === "done" ? { scriptSource: "CONSTRAINED_AI" as PersonalizedVideoScriptSource } : {}),
      },
    });
    return this.processAnimationReadyJob(jobId, { status: JobStatus.RUNNING }, assignmentId, next.animationInput!, { claimed: true });
  }

  /** The practice set for a lesson, without answers. */
  async practiceSet(id: string, actor: AccessActor): Promise<PracticeSetView> {
    const row = await this.requireAssignment(id);
    assertCanReadStudent(actor, row.studentId, row.schoolId ?? schoolIdForStudent(row.studentId));
    const script = row.script as StoredScript | null;
    if (!script?.practice?.items.length) throw new NotFoundException("This lesson has no practice set.");
    return {
      assignmentId: row.id,
      source: script.practice.source,
      skillName: skillName(script.practice.skillId),
      items: script.practice.items.map(practiceItemView),
    };
  }

  /**
   * Dev only, for the recorded pilot walkthrough (scripts/pilot-walkthrough):
   * the answers to a walk_* student's practice and exit, so a scripted
   * student can answer them. Same guard as Lotus's walkthrough fill; real
   * students can never read an answer key.
   */
  async walkthroughKey(id: string, actor: AccessActor): Promise<{ practice: Array<{ id: string; answer: unknown }>; exit: string | null }> {
    const row = await this.requireAssignment(id);
    if (process.env.NODE_ENV === "production" || process.env.COGNA_WALKTHROUGH_FILL !== "true" || !/^walk_[a-z]+$/.test(row.studentId)) {
      throw new ForbiddenException("Answer keys are only available to walkthrough accounts in development.");
    }
    assertStudentOwner(actor, row.studentId);
    const script = row.script as StoredScript | null;
    return {
      practice: (script?.practice?.items ?? []).map((item) => ({
        id: item.id,
        answer: item.format === "pair-hunt" ? item.answer : item.format === "spot-mistake" ? item.wrongLine : item.format === "choose" ? item.answerIndex : item.answer,
      })),
      exit: script?.exit?.expected ?? null,
    };
  }

  /** Checks one practice answer on the server and records the attempt. */
  async checkPractice(id: string, itemId: string, answer: PracticeAnswer, actor: AccessActor): Promise<PracticeCheckResult> {
    const row = await this.requireAssignment(id);
    assertCanReadStudent(actor, row.studentId, row.schoolId ?? schoolIdForStudent(row.studentId));
    if (actor.role === "student") assertStudentOwner(actor, row.studentId);
    const script = row.script as StoredScript | null;
    const item = script?.practice?.items.find((it) => it.id === itemId);
    if (!script || !item) throw new NotFoundException("No such practice item.");
    const previous = script.practiceAttempts?.[itemId];
    const attempt = (previous?.tries ?? 0) + 1;
    const result = checkPracticeAnswer(item, answer ?? ({} as PracticeAnswer), attempt);
    if (result.verdict !== "UNREADABLE") {
      await this.prisma.personalizedVideoAssignment.update({
        where: { id },
        data: {
          script: {
            ...script,
            practiceAttempts: { ...(script.practiceAttempts ?? {}), [itemId]: { tries: attempt, correct: previous?.correct || result.verdict === "CORRECT" } },
          } as object,
        },
      });
    }
    return result;
  }

  /**
   * Dev/demo student switcher: the student's animated lesson, created from
   * their pilot evidence if they don't have one yet. Students without an
   * animation recipe get their normal lesson (slides or abstention).
   */
  async demoAnimatedLesson(studentId: string, actor: AccessActor): Promise<PersonalizedVideoAssignmentView> {
    if (!demoSeedsAllowed() || !isDemoStudentId(studentId)) {
      throw new ForbiddenException("Demo lessons are only available for demo students.");
    }
    assertStudentOwner(actor, studentId);
    const key = studentKeyFromId(studentId);
    const source = key ? DEMO_ANIMATIONS[key] : undefined;
    if (!key || !source) return this.getForStudent(actor, { studentId });

    const latest = await this.prisma.personalizedVideoAssignment.findFirst({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    });
    if (latest && (latest.script as StoredScript | null)?.animationInput && latest.status !== PersonalizedVideoAssignmentStatus.TEMPORARILY_UNAVAILABLE) {
      return this.toView(latest);
    }

    const template = templateForKey(key);
    const names = await this.studentNames(studentId, undefined, template?.name);
    const record = demoLessonRecord(source, names.first);
    const stored: StoredScript = {
      name: names.full,
      roll: template?.roll,
      learnerDecision: record.learnerDecision,
      teacherDecision: record.teacherDecision,
      uncertainty: "Moderate",
      statusLabel: "Targeted bridge",
      lesson: record.lesson,
      exit: record.exit,
      animation: buildForTheme(record.input, "classic"),
      animationKind: record.input.kind,
      animationInput: record.input,
    };
    const assignmentId = randomUUID();
    const job = await this.prisma.job.create({
      data: {
        jobType: JOB_TYPE,
        idempotencyKey: `${JOB_TYPE}:${assignmentId}`,
        payload: { assignmentId, studentId, forcePendingReview: false, scriptSource: "APPROVED_TEMPLATE" },
        status: JobStatus.PENDING,
      },
    });
    await this.prisma.personalizedVideoAssignment.create({
      data: {
        id: assignmentId,
        studentId,
        studentKey: key,
        schoolId: schoolIdForStudent(studentId),
        status: PersonalizedVideoAssignmentStatus.PREPARING,
        diagnosticState: "supported-gap",
        conceptId: record.conceptId,
        learningObjective: record.lesson.objective,
        evidenceSnapshot: { ...(template?.evidence ?? {}), evidenceSource: "DEMO_SEED" } as object,
        script: stored as object,
        scriptSource: "APPROVED_TEMPLATE",
        mathValidation: { valid: true } as object,
        languageValidation: { valid: true } as object,
        renderJobId: job.id,
      },
    });
    return this.toView(await this.requireAssignment(assignmentId));
  }

  /** The interactive, themed lesson with narration URLs. Themes other than the pre-warmed one narrate on first request. */
  async lessonAnimation(
    id: string,
    theme: LessonThemeChoice,
    actor: AccessActor,
  ): Promise<PersonalizedLessonAnimationView> {
    const row = await this.requireAssignment(id);
    assertCanReadStudent(actor, row.studentId, row.schoolId ?? schoolIdForStudent(row.studentId));
    const script = row.script as StoredScript | null;
    if (!script?.animationInput) throw new NotFoundException("This lesson has no interactive animation.");
    return this.narrator.narrate({
      assignmentId: row.id,
      source: script.animationInput,
      theme,
      claims: { assignmentId: row.id, studentId: row.studentId, schoolId: row.schoolId ?? schoolIdForStudent(row.studentId) },
    });
  }

  /** One narrated beat: cached audio path and its real spoken length, or null when TTS is off/failed. */
  private async synthesizeBeat(text: string): Promise<{ audioPath: string; seconds: number } | null> {
    if (!this.tts?.enabled) return null;
    const voiced = await this.synthesizeOneScene(
      { eyebrow: "", headline: "", equation: [], narration: text, durationSeconds: 0, accent: "green" },
      this.tts.voice,
      this.tts.model,
      this.tts.instructions,
    );
    return voiced.audioPath && voiced.narrationSeconds ? { audioPath: voiced.audioPath, seconds: voiced.narrationSeconds } : null;
  }

  /**
   * First name for narration ("Aarav, here's…") and full name for the teacher
   * view. Demo students take the pilot roster name; real ones their record.
   */
  private async studentNames(
    studentId: string,
    requested?: string,
    templateName?: string,
  ): Promise<{ full: string; first: string }> {
    const key = studentKeyFromId(studentId);
    let full = requested?.trim() || templateName || (key ? APPROVED_VIDEO_TEMPLATES[key]?.name : undefined);
    if (!full) {
      const student = await this.prisma.student.findUnique({ where: { id: studentId } }).catch(() => null);
      full = student?.name?.trim() || undefined;
    }
    return { full: full ?? "Student", first: full?.split(/\s+/)[0] ?? "" };
  }

  /**
   * The slides delivery skips Remotion entirely — there is no video to mux,
   * so this only needs the narration audio (synthesizeNarration is
   * renderer-agnostic already) copied to public storage per scene, then the
   * assignment marked ready directly. No ModalityAsset is created: SLIDES
   * has no video asset to represent. Applies to every lesson, not just ones
   * with a drag-eligible EQUATION_TRANSFORMATION claim — the frontend
   * already renders a scene without one as a plain narrated card.
   */
  private async processInteractiveRenderJob(
    jobId: string,
    job: { status: JobStatus },
    assignmentId: string,
    assignment: { scriptSource: string | null },
    lesson: PersonalizedVideoLesson,
    payload: JobPayload,
  ): Promise<{ status: string }> {
    if (job.status === JobStatus.RUNNING) {
      // Same "an earlier tick already owns this" backoff as processRenderJob.
      return { status: JobStatus.RUNNING };
    }
    const claim = await this.prisma.job.updateMany({
      where: { id: jobId, status: job.status },
      data: {
        status: JobStatus.RUNNING,
        lockedAt: new Date(),
        lockedBy: WORKER_ID,
        attemptCount: { increment: 1 },
      },
    });
    if (claim.count === 0) {
      return { status: JobStatus.RUNNING };
    }
    try {
      const narratedScenes = await this.synthesizeNarration(lesson.scenes);
      const storage = this.getMediaStorage();
      const scenesAudio: InteractiveRenderResult["scenesAudio"] = [];
      for (let index = 0; index < narratedScenes.length; index += 1) {
        const audioPath = (narratedScenes[index] as { audioPath?: string }).audioPath;
        if (!audioPath) continue;
        const bytes = await readFile(audioPath);
        const stored = await storage.put({
          key: `lessons/${assignmentId}/scene-${index}.mp3`,
          body: bytes,
          contentType: "audio/mpeg",
        });
        scenesAudio.push({ index, key: stored.key });
      }
      const pending =
        Boolean(payload.forcePendingReview) ||
        (payload.scriptSource ?? assignment.scriptSource) === "CONSTRAINED_AI";
      const renderResult: InteractiveRenderResult = { interactive: true, scenesAudio };
      await this.prisma.personalizedVideoAssignment.update({
        where: { id: assignmentId },
        data: {
          renderResult: renderResult as object,
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
          lastError: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      return { status: JobStatus.COMPLETED };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.applyUnavailable(assignmentId, jobId, message, false);
      return { status: JobStatus.FAILED_RETRYABLE };
    }
  }

  /**
   * Stateless correctness check for the interactive drag widget. No
   * PersonalizedVideoEvent is written here on purpose: this is private,
   * ungraded practice inside the lesson itself ("guided success is not
   * independent success"), not diagnostic evidence — the exit item remains
   * the only independent evidence point for this assignment.
   */
  async verifyStep(
    assignmentId: string,
    input: { sceneIndex: number; assembledLine: string },
    actor: AccessActor,
  ): Promise<{ valid: boolean }> {
    const assignment = await this.requireAssignment(assignmentId);
    assertStudentOwner(actor, assignment.studentId);
    const script = assignment.script as StoredScript | null;
    const scene = script?.lesson?.scenes?.[input.sceneIndex];
    const claim = scene?.claims?.find(
      (c): c is Extract<typeof c, { kind: "EQUATION_TRANSFORMATION" }> =>
        c.kind === "EQUATION_TRANSFORMATION" && Boolean(c.chipLabel),
    );
    if (!claim) {
      throw new BadRequestException("This scene has no interactive equation step.");
    }
    const result = verifyStepValidity(claim.from, input.assembledLine);
    return { valid: result.validity === "VALID" };
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
    const correct = script?.exitCheck
      ? taskVerdict(script.exitCheck.task, input.answer, script.exitCheck.expression) === "CORRECT"
      : Boolean(expected) && normalizeAlgebraAnswer(input.answer) === normalizeAlgebraAnswer(expected);
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

  /**
   * Narration text is fixed per approved-templates.ts template (student name
   * is baked in literally, not a runtime placeholder), so the same clip gets
   * reused across renders via tts-cache. Never throws and never drops a
   * scene: a cache/TTS failure just leaves that scene's audioPath unset,
   * which renders silently — a lesson must never fail to render over a
   * narration outage.
   *
   * Scenes are synthesized one at a time, not via Promise.all — observed
   * directly: firing all of a lesson's scenes at OpenAI's TTS endpoint
   * concurrently intermittently silently drops some of them (no thrown
   * error reaches here; synthesize() itself returns null after its own
   * retry). This runs in the background render job, never on a path a
   * student is waiting on, so trading a few extra seconds of total time for
   * every scene actually getting narrated is the right tradeoff.
   */
  private async synthesizeNarration(
    scenes: PersonalizedVideoLessonScene[],
  ): Promise<Array<PersonalizedVideoLessonScene & { audioPath?: string }>> {
    if (!this.tts?.enabled) return scenes;
    const voice = this.tts.voice;
    const model = this.tts.model;
    const instructions = this.tts.instructions;
    const narrated: Array<PersonalizedVideoLessonScene & { audioPath?: string }> = [];
    for (const scene of scenes) {
      narrated.push(await this.synthesizeOneScene(scene, voice, model, instructions));
    }
    return narrated;
  }

  private async synthesizeOneScene(
    scene: PersonalizedVideoLessonScene,
    voice: string,
    model: string,
    instructions: string | undefined,
  ): Promise<PersonalizedVideoLessonScene & { audioPath?: string; narrationSeconds?: number }> {
    try {
      let audioPath = await readTtsCache(scene.narration, voice, model, instructions);
      let bytes: Buffer | null = audioPath ? await readFile(audioPath) : null;
      let probedSeconds = bytes ? await probeAudioDurationSeconds(bytes) : null;

      // Observed directly: a truncated stream (network hiccup mid-transfer)
      // can produce a still-parseable but far-too-short MP3 without ever
      // throwing — e.g. 0.36s of audio for a sentence that needs 6-8s to
      // speak. Once cached, that broken clip is served forever. Reject
      // anything implausibly short relative to the text and re-synthesize,
      // rather than trusting "it parsed" as "it's the real narration".
      const minPlausibleSeconds = Math.max(0.5, scene.narration.length / 25);
      if (audioPath && probedSeconds !== null && probedSeconds < minPlausibleSeconds) {
        audioPath = null;
        bytes = null;
        probedSeconds = null;
      }

      if (!audioPath) {
        const synthesized = await this.tts!.synthesize(scene.narration);
        if (!synthesized) return scene;
        bytes = synthesized.bytes;
        probedSeconds = await probeAudioDurationSeconds(bytes);
        if (probedSeconds !== null && probedSeconds < minPlausibleSeconds) {
          // Still truncated on a fresh call — don't cache a broken clip,
          // fall back to silent for this scene rather than looping retries.
          return scene;
        }
        audioPath = await writeTtsCache(scene.narration, voice, model, bytes, instructions);
      }

      const durationSeconds = probedSeconds
        ? Math.max(scene.durationSeconds, Math.ceil(probedSeconds) + 0.5)
        : scene.durationSeconds;
      return { ...scene, audioPath, durationSeconds, narrationSeconds: probedSeconds ?? undefined };
    } catch {
      return scene;
    }
  }

  private async resolveTrustedEvidence(
    input: CreateAssignmentInput,
    studentId: string,
    options: { allowDemoSeeds: boolean; allowTestHooks: boolean },
  ): Promise<{
    snapshot: PersonalizedVideoEvidenceSnapshot;
    template: ReturnType<typeof templateForKey>;
    lotusRecordId?: string;
    session?: LotusSessionView;
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
      return { snapshot, template, lotusRecordId: String(record.id), session };
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
    renderResult?: unknown;
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
    const interactiveResult = row.renderResult as InteractiveRenderResult | null | undefined;
    const interactive = Boolean(interactiveResult?.interactive);
    const animated = Boolean((row.renderResult as AnimationRenderResult | null | undefined)?.animation);
    const delivery = this.deliveryOf(
      row.status,
      asset?.reviewStatus,
      asset?.storageRef,
      script.lesson,
      interactive,
      animated,
    );
    const mediaClaims = {
      assignmentId: row.id,
      studentId: row.studentId,
      schoolId: row.schoolId ?? schoolIdForStudent(row.studentId),
    };
    const lessonView =
      interactive && script.lesson
        ? {
            ...script.lesson,
            scenes: script.lesson.scenes.map((scene, index) => {
              const entry = interactiveResult?.scenesAudio.find((a) => a.index === index);
              if (!entry) return scene;
              const audioUrl = attachMediaAccess(
                `${defaultPublicBaseUrl()}/${entry.key}`,
                mediaClaims,
              );
              return { ...scene, audioUrl };
            }),
          }
        : (script.lesson ?? null);
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
      lesson: lessonView,
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
    interactive?: boolean,
    animated?: boolean,
  ): PersonalizedVideoDelivery {
    if (status === "ABSTAINED") return "ABSTAINED";
    if (status === "PREPARING") return "PREPARING";
    if (status === "TEMPORARILY_UNAVAILABLE") return "UNAVAILABLE";
    if (reviewStatus === "PENDING_REVIEW") return "UNDER_REVIEW";
    if (status === "UNDER_REVIEW") return "UNDER_REVIEW";
    if (animated && status === "READY") return "ANIMATED";
    if (interactive && status === "READY") return "SLIDES";
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
