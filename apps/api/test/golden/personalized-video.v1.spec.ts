import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView, PersonalizedVideoLesson } from "@cogna/shared";
import {
  INSECURE_LOCAL_DEV_SESSION_SECRET,
  authorizeGeneratedMediaPath,
  attachMediaAccess,
  issueMediaToken,
  issueStudentToken,
  resolveActor,
  sessionSecretFromEnv,
  type AccessActor,
} from "../../src/access/cogna-access";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";
import { PersonalizedVideosService } from "../../src/personalized-videos/personalized-videos.service";
import { snapshotFromLotusSession } from "../../src/personalized-videos/lotus-evidence";
import { evaluateRemediationEligibility } from "../../src/personalized-videos/video-evidence";
import { collectSceneClaims, validateMathClaims } from "../../src/personalized-videos/video-math";
import { validateVideoLanguage } from "../../src/personalized-videos/video-language";
import {
  VideoRendererAdapter,
  type VideoRendererConfig,
} from "../../src/personalized-videos/video-renderer.adapter";
import { APPROVED_VIDEO_TEMPLATES } from "../../src/personalized-videos/approved-templates";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";

process.env.COGNA_SESSION_SECRET = process.env.COGNA_SESSION_SECRET || "test-session-secret";

function studentActor(studentId: string): AccessActor {
  return { role: "student", studentId };
}

function teacherActor(): AccessActor {
  return { role: "teacher", teacherEmail: "ananya@gurukul.edu", schoolId: "gurukul-pilot" };
}

function serviceWith(
  renderer: VideoRendererAdapter = new VideoRendererAdapter({}),
  db = createPersonalizedVideoMemoryDb(),
) {
  return {
    db,
    videos: new PersonalizedVideosService(db as never, renderer),
  };
}

function mockRenderer(options: { delayed?: boolean } = {}): VideoRendererAdapter {
  const config: VideoRendererConfig = {
    endpoint: "https://renderer.example/jobs",
    token: "secret-token",
  };
  let polls = 0;
  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      return {
        ok: true,
        json: async () => ({ providerJobId: "render-1" }),
      } as Response;
    }
    polls += 1;
    if (options.delayed && polls < 2) {
      return {
        ok: true,
        json: async () => ({ status: "RUNNING" }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        status: "COMPLETED",
        storageRef: "https://cdn.example.com/lessons/aarav.mp4",
        transcriptRef: "https://cdn.example.com/lessons/aarav.vtt",
        durationMs: 78_000,
        integrity: { sha256: "abc123" },
      }),
    } as Response;
  }) as typeof fetch;
  return new VideoRendererAdapter(config, fetchImpl);
}

async function drainRender(
  videos: PersonalizedVideosService,
  assignmentId: string,
  actor: AccessActor,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await videos.processPendingRenderJobs();
    const view = await videos.getAssignment(assignmentId, actor);
    if (view.status !== "PREPARING") return view;
  }
  return videos.getAssignment(assignmentId, actor);
}

async function createThenRead(
  videos: PersonalizedVideosService,
  input: Parameters<PersonalizedVideosService["createAssignment"]>[0],
  actor: AccessActor = studentActor(input.studentId ?? "unknown"),
) {
  const created = await videos.createAssignment(input, {
    actor,
    allowDemoSeeds: true,
    allowTestHooks: true,
  });
  if (created.status === "ABSTAINED") return created;
  return drainRender(videos, created.id, actor);
}

const aaravLesson = APPROVED_VIDEO_TEMPLATES.aarav.lesson;

function lotusSession(overrides: Partial<LotusSessionView> = {}): LotusSessionView {
  return {
    sessionId: "lotus_trusted_1",
    studentId: "demo_aarav",
    grade: 8,
    board: "CBSE",
    status: "COMPLETE",
    experimental: true,
    phase: "DIAGNOSE",
    startedAt: new Date().toISOString(),
    currentQuestion: null,
    openingAudit: {
      question: {
        id: "q1",
        phase: "EXPLORE",
        subtopic: "brackets",
        prompt: "Expand -2(y-5)",
        type: "CONSTRUCTED_RESPONSE",
        asksForWorking: true,
        purpose: "sign preservation",
        answerKey: { kind: "NUMERIC", canonicalAnswer: "-2y+10", workedSolution: [] },
      },
      response: {
        answer: "-2y-10",
        working: "I distributed only the first term.",
        confidence: 70,
        responseTimeMs: 12_000,
        didNotKnow: false,
      },
      verification: {
        status: "VERIFIED_INCORRECT",
        correctAnswer: "-2y+10",
        method: "DETERMINISTIC_ARITHMETIC",
        explanation: "Sign of the second product was lost.",
      },
      gpt: { mathJudgment: "INCORRECT", observations: [], hypotheses: [], phaseRecommendation: "DIAGNOSE", proposedAction: "ASK", conciseRationale: "Gap." },
      challenger: { mathJudgment: "INCORRECT", observations: [], hypotheses: [], phaseRecommendation: "DIAGNOSE", proposedAction: "ASK", conciseRationale: "Gap." },
      debate: { agreements: [], disagreements: [], disagreementExample: "", acceptedImprovements: [], revisedConclusion: "", revisedAction: "EXIT_GAP", revisedPhase: "DIAGNOSE" },
      conclusion: {
        verdict: "ACCEPTED",
        acceptedFromGpt: [],
        acceptedFromChallenger: [],
        rejectedClaims: [],
        conclusion: "Supported gap.",
        evidenceState: "SUPPORTED",
        uncertainty: [],
        phase: "DIAGNOSE",
        action: "EXIT_GAP",
        selectionReason: "enough evidence",
        exitDiagnostic: true,
      },
      questionSelection: {
        selectedFrom: "NONE_EXIT",
        reason: "exit",
        informationGain: { passed: true, explanation: "complete" },
      },
      createdAt: new Date().toISOString(),
    },
    audits: [
      {
        question: {
          id: "q1",
          phase: "EXPLORE",
          subtopic: "brackets",
          prompt: "Expand -2(y-5)",
          type: "CONSTRUCTED_RESPONSE",
          asksForWorking: true,
          purpose: "sign preservation",
          answerKey: { kind: "NUMERIC", canonicalAnswer: "-2y+10", workedSolution: [] },
        },
        response: {
          answer: "-2y-10",
          working: "I distributed only the first term.",
          confidence: 70,
          responseTimeMs: 12_000,
          didNotKnow: false,
        },
        verification: {
          status: "VERIFIED_INCORRECT",
          correctAnswer: "-2y+10",
          method: "DETERMINISTIC_ARITHMETIC",
          explanation: "Sign of the second product was lost.",
        },
        gpt: { mathJudgment: "INCORRECT", observations: [], hypotheses: [], phaseRecommendation: "DIAGNOSE", proposedAction: "ASK", conciseRationale: "Gap." },
        challenger: { mathJudgment: "INCORRECT", observations: [], hypotheses: [], phaseRecommendation: "DIAGNOSE", proposedAction: "ASK", conciseRationale: "Gap." },
        debate: { agreements: [], disagreements: [], disagreementExample: "", acceptedImprovements: [], revisedConclusion: "", revisedAction: "EXIT_GAP", revisedPhase: "DIAGNOSE" },
        conclusion: {
          verdict: "ACCEPTED",
          acceptedFromGpt: [],
          acceptedFromChallenger: [],
          rejectedClaims: [],
          conclusion: "Supported gap.",
          evidenceState: "SUPPORTED",
          uncertainty: [],
          phase: "DIAGNOSE",
          action: "EXIT_GAP",
          selectionReason: "enough evidence",
          exitDiagnostic: true,
        },
        questionSelection: {
          selectedFrom: "NONE_EXIT",
          reason: "exit",
          informationGain: { passed: true, explanation: "complete" },
        },
        createdAt: new Date().toISOString(),
      },
    ],
    finalReport: {
      outcome: "SOLID_GAP",
      startingPoint: "Sign preservation in distribution.",
      observedStrengths: [],
      uncertainAreas: [],
      evidenceSummary: ["Expanded -2(y-5) as -2y-10."],
      recommendedNextStep: "Teach writing both signed products.",
      limitations: [],
    },
    modelConfiguration: { primary: "primary", challenger: "challenger" },
    ...overrides,
  };
}

describe("Personalized video evidence gate", () => {
  it("requires independent verified question-and-step evidence", () => {
    const result = evaluateRemediationEligibility({
      diagnosticState: "supported-gap",
      observedEvidence: [],
      verifiedObservations: [],
    });
    assert.equal(result.eligible, false);
    assert.match(result.reason, /No independent/);
  });

  it("abstains on insufficient or conflicting Lotus outcomes", () => {
    const result = evaluateRemediationEligibility({
      diagnosticState: "supported-gap",
      lotusOutcome: "INSUFFICIENT_OR_CONFLICTING",
      observedEvidence: ["Skipped two items."],
      verifiedObservations: [
        {
          questionText: "Expand 2(x+1)",
          submittedText: "I don't know",
          verificationStatus: "NO_ANSWER",
          independent: true,
        },
      ],
    });
    assert.equal(result.eligible, false);
    assert.equal(result.diagnosticState, "insufficient-evidence");
  });

  it("does not treat advancement as a weakness", () => {
    const result = evaluateRemediationEligibility({
      diagnosticState: "supported-gap",
      lotusOutcome: "ADVANCEMENT",
      observedEvidence: ["Solved 3(x-2)=9 independently."],
      verifiedObservations: [
        {
          questionText: "Solve 3(x-2)=9",
          submittedText: "x=5",
          verificationStatus: "VERIFIED_CORRECT",
          independent: true,
        },
      ],
    });
    assert.equal(result.eligible, false);
    assert.equal(result.diagnosticState, "developing");
  });
});

describe("Personalized video math validation", () => {
  it("accepts the approved Aarav template claims", () => {
    const result = validateMathClaims(collectSceneClaims(aaravLesson.scenes));
    assert.equal(result.valid, true, result.errors.join("; "));
  });

  it("accepts every remediation template family's claims", () => {
    for (const key of ["aarav", "meena", "rohan", "divya"] as const) {
      const result = validateMathClaims(
        collectSceneClaims(APPROVED_VIDEO_TEMPLATES[key].lesson.scenes),
      );
      assert.equal(result.valid, true, `${key}: ${result.errors.join("; ")}`);
    }
  });

  it("rejects an invalid mathematical statement", () => {
    const result = validateMathClaims([
      { kind: "ARITHMETIC", expression: "(-2)*(-5)", expected: -10 },
    ]);
    assert.equal(result.valid, false);
    assert.match(result.errors[0] ?? "", /evaluated to 10/);
  });
});

describe("Personalized video language validation", () => {
  it("accepts the approved Divya script which uses the verb add", () => {
    const lesson = APPROVED_VIDEO_TEMPLATES.divya.lesson;
    const result = validateVideoLanguage([
      lesson.title,
      lesson.objective,
      lesson.generationReason,
      ...lesson.scenes.flatMap((scene) => [scene.headline, scene.narration, scene.equation]),
    ]);
    assert.equal(result.valid, true, (result.errors ?? []).join("; "));
  });

  it("still rejects the clinical acronym ADHD", () => {
    const result = validateVideoLanguage(["This checks whether you have ADHD."]);
    assert.equal(result.valid, false);
  });
});

describe("Personalized video access and trusted evidence", () => {
  it("rejects unsigned requests", () => {
    assert.throws(
      () => resolveActor({}),
      (error: unknown) => error instanceof UnauthorizedException,
    );
  });

  it("rejects a student reading another student's assignment", async () => {
    const { videos } = serviceWith();
    const created = await videos.createAssignment(
      { studentId: "demo_aarav", studentKey: "aarav" },
      { actor: studentActor("demo_aarav"), allowDemoSeeds: true },
    );
    await assert.rejects(
      () => videos.getAssignment(created.id, studentActor("demo_meena")),
      (error: unknown) => error instanceof ForbiddenException,
    );
    await assert.rejects(
      () => videos.getForStudent(studentActor("demo_aarav"), { studentId: "demo_meena" }),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });

  it("rejects assignment creation without a Lotus session for non-demo students", async () => {
    const { videos } = serviceWith();
    await assert.rejects(
      () =>
        videos.createAssignment(
          { studentId: "stu_unmapped" },
          { actor: studentActor("stu_unmapped") },
        ),
      /persisted Lotus session is required/,
    );
  });

  it("uses the persisted Lotus payload and ignores client-supplied evidence", async () => {
    const { db, videos } = serviceWith();
    const session = lotusSession();
    await db.lotusSessionRecord.upsert({
      where: { sessionId: session.sessionId },
      create: {
        sessionId: session.sessionId,
        studentId: session.studentId,
        status: session.status,
        phase: session.phase,
        startedAt: new Date(session.startedAt),
        payload: session,
      },
      update: { payload: session },
    });
    const created = await videos.createAssignment(
      {
        studentId: "demo_aarav",
        lotusSessionId: session.sessionId,
        evidence: {
          diagnosticState: "insufficient-evidence",
          observedEvidence: ["Client invented this gap."],
          verifiedObservations: [],
          lotusOutcome: "INSUFFICIENT_OR_CONFLICTING",
        },
      },
      { actor: studentActor("demo_aarav") },
    );
    assert.equal(created.evidenceSnapshot.evidenceSource, "LOTUS_SESSION");
    assert.equal(created.evidenceSnapshot.lotusOutcome, "SOLID_GAP");
    assert.ok(!created.evidenceSnapshot.observedEvidence.includes("Client invented this gap."));
    assert.equal(created.status, "PREPARING");
  });

  it("ignores client studentKey when a Lotus session is present", async () => {
    const { db, videos } = serviceWith();
    const session = lotusSession();
    await db.lotusSessionRecord.upsert({
      where: { sessionId: session.sessionId },
      create: {
        sessionId: session.sessionId,
        studentId: session.studentId,
        status: session.status,
        phase: session.phase,
        startedAt: new Date(session.startedAt),
        payload: session,
      },
      update: { payload: session },
    });
    const created = await videos.createAssignment(
      {
        studentId: "demo_aarav",
        lotusSessionId: session.sessionId,
        studentKey: "kabir",
      },
      { actor: studentActor("demo_aarav") },
    );
    assert.equal(created.studentKey, "aarav");
    assert.equal(created.status, "PREPARING");
    assert.notEqual(created.status, "ABSTAINED");
  });

  it("builds observations from Lotus audits", () => {
    const snapshot = snapshotFromLotusSession(lotusSession());
    assert.equal(snapshot.evidenceSource, "LOTUS_SESSION");
    assert.equal(snapshot.verifiedObservations.length, 1);
    assert.equal(snapshot.verifiedObservations[0]?.verificationStatus, "VERIFIED_INCORRECT");
  });
});

describe("Personalized video assignment pipeline", () => {
  it("does not create a remediation assignment from insufficient evidence", async () => {
    const { videos } = serviceWith();
    const assignment = await videos.createAssignment(
      { studentId: "demo_kabir", studentKey: "kabir" },
      { actor: studentActor("demo_kabir"), allowDemoSeeds: true },
    );
    assert.equal(assignment.status, "ABSTAINED");
    assert.equal(assignment.delivery, "ABSTAINED");
    assert.equal(assignment.asset, null);
    assert.equal(assignment.job, null);
    assert.match(assignment.abstainReason ?? "", /insufficient or conflicting/i);
  });

  it("rejects unsafe student-facing language", async () => {
    const { videos } = serviceWith();
    const unsafe: PersonalizedVideoLesson = {
      ...aaravLesson,
      scenes: aaravLesson.scenes.map((scene, index) =>
        index === 0
          ? { ...scene, narration: "This checks whether you have ADHD and a low IQ." }
          : scene,
      ),
    };
    await assert.rejects(
      () =>
        videos.createAssignment(
          {
            studentId: "stu_unsafe",
            studentKey: "aarav",
            scriptOverride: unsafe,
            scriptSource: "CONSTRAINED_AI",
          },
          { actor: studentActor("stu_unsafe"), allowTestHooks: true },
        ),
      /language rejected/i,
    );
  });

  it("rejects a script whose mathematics is wrong", async () => {
    const { videos } = serviceWith();
    const invalid: PersonalizedVideoLesson = {
      ...aaravLesson,
      scenes: [
        {
          ...aaravLesson.scenes[0]!,
          claims: [{ kind: "ARITHMETIC", expression: "(-2)*(-5)", expected: -10 }],
        },
        ...aaravLesson.scenes.slice(1),
      ],
    };
    await assert.rejects(
      () =>
        videos.createAssignment(
          {
            studentId: "stu_bad_math",
            studentKey: "aarav",
            scriptOverride: invalid,
          },
          { actor: studentActor("stu_bad_math"), allowTestHooks: true },
        ),
      /mathematics rejected/i,
    );
  });

  it("returns PREPARING until a worker tick settles the job", async () => {
    const { videos } = serviceWith(mockRenderer());
    const created = await videos.createAssignment(
      { studentId: "demo_aarav", studentKey: "aarav" },
      { actor: studentActor("demo_aarav"), allowDemoSeeds: true },
    );
    assert.equal(created.status, "PREPARING");
    assert.equal(created.job?.status, "PENDING");
  });

  it("does not let read routes submit or poll the renderer", async () => {
    const { videos } = serviceWith(mockRenderer());
    const actor = studentActor("demo_aarav");
    const created = await videos.createAssignment(
      { studentId: "demo_aarav", studentKey: "aarav" },
      { actor, allowDemoSeeds: true },
    );
    const afterGet = await videos.getAssignment(created.id, actor);
    const afterStudent = await videos.getForStudent(actor, { studentId: "demo_aarav" });
    await videos.teacherReport(teacherActor(), false);
    assert.equal(afterGet.status, "PREPARING");
    assert.equal(afterGet.job?.status, "PENDING");
    assert.equal(afterStudent.status, "PREPARING");
    assert.equal(afterStudent.job?.status, "PENDING");
  });

  it("does not assign a PENDING_REVIEW asset to the student", async () => {
    const { videos } = serviceWith(mockRenderer());
    const assignment = await createThenRead(videos, {
      studentId: "stu_pending",
      studentKey: "aarav",
      forcePendingReview: true,
    });
    assert.equal(assignment.status, "UNDER_REVIEW");
    assert.equal(assignment.delivery, "UNDER_REVIEW");
    assert.equal(assignment.asset, null);
    assert.equal(assignment.job?.status, "COMPLETED");
  });

  it("assigns an approved rendered asset when the template is verified", async () => {
    const { videos } = serviceWith(mockRenderer());
    const assignment = await createThenRead(videos, {
      studentId: "stu_ready",
      studentKey: "aarav",
    });
    assert.equal(assignment.status, "READY");
    assert.equal(assignment.delivery, "VIDEO");
    assert.equal(assignment.asset?.reviewStatus, "APPROVED");
    assert.equal(assignment.asset?.storageRef, "https://cdn.example.com/lessons/aarav.mp4");
  });

  it("keeps the assignment PREPARING while the provider job is still running", async () => {
    const { videos } = serviceWith(mockRenderer({ delayed: true }));
    const actor = studentActor("demo_aarav");
    const created = await videos.createAssignment(
      { studentId: "demo_aarav", studentKey: "aarav" },
      { actor, allowDemoSeeds: true },
    );
    await videos.processPendingRenderJobs();
    const first = await videos.getAssignment(created.id, actor);
    assert.equal(first.status, "PREPARING");
    assert.equal(first.job?.status, "RUNNING");
    const stillPreparing = await videos.getAssignment(created.id, actor);
    assert.equal(stillPreparing.status, "PREPARING");
    assert.equal(stillPreparing.job?.status, "RUNNING");
    await videos.processPendingRenderJobs();
    const second = await videos.getAssignment(created.id, actor);
    assert.equal(second.status, "READY");
    assert.equal(second.delivery, "VIDEO");
  });

  it("completes a running job from a provider callback", async () => {
    const { videos } = serviceWith(mockRenderer({ delayed: true }));
    const created = await videos.createAssignment(
      { studentId: "demo_aarav", studentKey: "aarav" },
      { actor: studentActor("demo_aarav"), allowDemoSeeds: true },
    );
    await videos.processPendingRenderJobs();
    const callback = await videos.handleRenderCallback({
      providerJobId: "render-1",
      status: "COMPLETED",
      storageRef: "https://cdn.example.com/lessons/callback.mp4",
      transcriptRef: "https://cdn.example.com/lessons/callback.vtt",
      durationMs: 40_000,
    });
    assert.equal(callback.status, "COMPLETED");
    const ready = await videos.getAssignment(created.id, studentActor("demo_aarav"));
    assert.equal(ready.status, "READY");
    assert.equal(ready.asset?.storageRef, "https://cdn.example.com/lessons/callback.mp4");
  });

  it("fails the renderer job as retryable and serves the HTML fallback", async () => {
    const { videos } = serviceWith(new VideoRendererAdapter({ localRenderer: false }));
    const created = await videos.createAssignment(
      { studentId: "stu_fallback", studentKey: "aarav" },
      { actor: studentActor("stu_fallback"), allowTestHooks: true },
    );
    assert.equal(created.status, "PREPARING");
    const unread = await videos.getAssignment(created.id, studentActor("stu_fallback"));
    assert.equal(unread.status, "PREPARING");
    await videos.processPendingRenderJobs();
    const assignment = await videos.getAssignment(created.id, studentActor("stu_fallback"));
    assert.equal(assignment.status, "FALLBACK");
    assert.equal(assignment.delivery, "HTML_FALLBACK");
    assert.equal(assignment.job?.status, "FAILED_RETRYABLE");
    assert.ok(assignment.lesson);
    assert.match(assignment.fallbackReason ?? "", /Renderer unavailable/);
  });

  it("stores completion separately from an independent exit", async () => {
    const { videos } = serviceWith(mockRenderer());
    const created = await createThenRead(videos, {
      studentId: "stu_exit",
      studentKey: "aarav",
    });
    const actor = studentActor("stu_exit");
    const watched = await videos.recordWatched(created.id, 12_000, actor);
    assert.equal(watched.watched, true);
    assert.equal(watched.completed, false);
    assert.equal(watched.exitAttempt, null);

    const completed = await videos.recordCompleted(created.id, 40_000, actor);
    assert.equal(completed.completed, true);
    assert.equal(completed.exitAttempt, null);

    const exited = await videos.recordExit(
      created.id,
      {
        answer: "-3a+12",
        working: "(-3)(a)+(-3)(-4)=-3a+12",
      },
      actor,
    );
    assert.equal(exited.exitAttempt?.correct, true);
    assert.equal(exited.completed, true);

    const outcomes = await (
      videos as unknown as {
        prisma: {
          modalityOutcome: {
            findMany: () => Promise<Array<{ completed: boolean; retestCorrect?: boolean | null }>>;
          };
        };
      }
    ).prisma.modalityOutcome.findMany();
    assert.equal(outcomes.length, 3);
    assert.equal(outcomes[0]?.completed, false);
    assert.equal(outcomes[0]?.retestCorrect ?? null, null);
    assert.equal(outcomes[1]?.completed, true);
    assert.equal(outcomes[1]?.retestCorrect ?? null, null);
    assert.equal(outcomes[2]?.completed, false);
    assert.equal(outcomes[2]?.retestCorrect, true);
  });

  it("lets a teacher read the report and refuses a student", async () => {
    const { videos } = serviceWith();
    await videos.createAssignment(
      { studentId: "demo_kabir", studentKey: "kabir" },
      { actor: studentActor("demo_kabir"), allowDemoSeeds: true },
    );
    const report = await videos.teacherReport(teacherActor(), false);
    assert.equal(report.totals.abstained, 1);
    await assert.rejects(
      () => videos.teacherReport(studentActor("demo_aarav")),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });

  it("forbids a teacher from another school", async () => {
    const { videos } = serviceWith();
    const created = await videos.createAssignment(
      { studentId: "demo_aarav", studentKey: "aarav" },
      { actor: studentActor("demo_aarav"), allowDemoSeeds: true },
    );
    const outsider: AccessActor = {
      role: "teacher",
      teacherEmail: "priya@other.edu",
      schoolId: "other-school",
    };
    await assert.rejects(
      () => videos.getAssignment(created.id, outsider),
      (error: unknown) => error instanceof ForbiddenException,
    );
    const report = await videos.teacherReport(outsider, false);
    assert.equal(report.students.length, 0);
  });

  it("rejects watched, completed, and exit events while under review", async () => {
    const { videos } = serviceWith(mockRenderer());
    const actor = studentActor("stu_pending_events");
    const assignment = await createThenRead(videos, {
      studentId: "stu_pending_events",
      studentKey: "aarav",
      forcePendingReview: true,
    });
    assert.equal(assignment.status, "UNDER_REVIEW");
    await assert.rejects(
      () => videos.recordWatched(assignment.id, 1_000, actor),
      (error: unknown) => error instanceof BadRequestException,
    );
    await assert.rejects(
      () => videos.recordCompleted(assignment.id, 1_000, actor),
      (error: unknown) => error instanceof BadRequestException,
    );
    await assert.rejects(
      () => videos.recordExit(assignment.id, { answer: "-3a+12", working: "step" }, actor),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it("issues a student HMAC that resolveActor accepts", () => {
    const token = issueStudentToken("demo_aarav");
    const actor = resolveActor({
      "x-cogna-student-id": "demo_aarav",
      "x-cogna-student-token": token,
    });
    assert.deepEqual(actor, { role: "student", studentId: "demo_aarav" });
  });

  it("requires COGNA_SESSION_SECRET in staging and production", () => {
    assert.equal(sessionSecretFromEnv({ NODE_ENV: "production" }), null);
    assert.equal(sessionSecretFromEnv({ COGNA_ENV: "staging" }), null);
    assert.equal(
      sessionSecretFromEnv({
        NODE_ENV: "production",
        COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET: "true",
      }),
      null,
    );
    assert.equal(
      sessionSecretFromEnv({ COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET: "true" }),
      INSECURE_LOCAL_DEV_SESSION_SECRET,
    );
    assert.equal(sessionSecretFromEnv({ COGNA_SESSION_SECRET: "set-in-prod", NODE_ENV: "production" }), "set-in-prod");
  });

  it("does not serve generated lesson media without a signed token", () => {
    const denied = authorizeGeneratedMediaPath(["lessons", "asg_1", "lesson.mp4"], null);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.status, 401);
    assert.equal(authorizeGeneratedMediaPath(["render-jobs", "job.json"], "x").ok, false);
  });

  it("allows a matching media token and rejects a token for another assignment", () => {
    const token = issueMediaToken({
      assignmentId: "asg_1",
      studentId: "demo_aarav",
      schoolId: "gurukul-pilot",
    });
    const allowed = authorizeGeneratedMediaPath(["lessons", "asg_1", "lesson.mp4"], token);
    assert.equal(allowed.ok, true);
    const other = authorizeGeneratedMediaPath(["lessons", "asg_2", "lesson.vtt"], token);
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.status, 403);
  });

  it("signs local generated-media URLs and leaves CDN URLs unchanged", () => {
    const claims = {
      assignmentId: "asg_1",
      studentId: "demo_aarav",
      schoolId: "gurukul-pilot",
    };
    const local = attachMediaAccess("http://localhost:3000/generated-media/lessons/asg_1/lesson.mp4", claims);
    assert.match(local ?? "", /[?&]media=/);
    assert.equal(
      attachMediaAccess("https://cdn.example.com/lessons/aarav.mp4", claims),
      "https://cdn.example.com/lessons/aarav.mp4",
    );
  });
});
