import { lotusModelMode, setFakeModel } from "./dev-mode";
import type {
  PracticeAnswer,
  PracticeCheckResult,
  PracticeSetView,
  LessonThemeChoice,
  PersonalizedLessonAnimationView,
  ConceptMasteryBand,
  ConfidenceCalibrationSummary,
  DiagnosticV2DebugView,
  DiagnosticV2SummaryResponse,
  DiagnosticV2Track,
  MasteryTrendPoint,
  PatternHistoryItem,
  PracticeCalendarDay,
  PracticeNextResponse,
  StartDiagnosticV2SessionResponse,
  StudentSafetySettings,
  SubmitDiagnosticV2StepRequest,
  SubmitDiagnosticV2StepResponse,
  LotusSessionView,
  LotusStatusResponse,
  LotusStudentResponse,
  LotusOverrideAction,
  LotusTopic,
  LotusUnseenPlanEntry,
  PersonalizedVideoAssignmentView,
  PersonalizedVideoTeacherReport,
  TileBuildResponse,
  MicroCheckResult,
  MicroLessonView,
} from "@cogna/shared";
import { LOTUS_PLANNED_TOPICS } from "@cogna/shared";
import {
  buildParentAuthHeaders,
  type ParentAuthInput,
} from "./parent-auth-headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SESSION_LIMIT_MS = 15 * 60 * 1000;

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export function isUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.status === 0 || err.message.includes("API unavailable"))
  );
}

function cognaAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const studentRaw = localStorage.getItem("cogna_student");
    if (studentRaw) {
      const student = JSON.parse(studentRaw) as { studentId?: string; token?: string };
      if (student.studentId && student.token) {
        return {
          "X-Cogna-Role": "student",
          "X-Cogna-Student-Id": student.studentId,
          "X-Cogna-Student-Token": student.token,
        };
      }
    }
  } catch {
    /* ignore malformed student session */
  }
  try {
    const teacherRaw = sessionStorage.getItem("cogna_teacher_invitation");
    if (teacherRaw) {
      const teacher = JSON.parse(teacherRaw) as { token?: string };
      if (teacher.token) {
        return {
          "X-Cogna-Role": "teacher",
          "X-Cogna-Teacher-Token": teacher.token,
        };
      }
    }
  } catch {
    /* ignore malformed teacher session */
  }
  return {};
}

/** `sendSession: false` for calls made as a parent, so a child signed in on the same browser is not sent too. */
async function apiFetch<T>(path: string, options?: RequestInit, sendSession = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        // Student/teacher session: the API checks every per-student route against it.
        ...(sendSession ? cognaAuthHeaders() : {}),
        ...options?.headers,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    throw new ApiError(
      detail === "Failed to fetch"
        ? `API unavailable at ${API_URL} — start the API (port 3001) and retry.`
        : `API request failed: ${detail}`,
      0,
      path,
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const message =
      typeof err === "object" && err && "message" in err
        ? String((err as { message?: string }).message ?? res.statusText)
        : res.statusText;
    throw new ApiError(message || `API error ${res.status}`, res.status, path);
  }

  return res.json() as Promise<T>;
}

/**
 * Dev-only: which model backend Lotus calls hit. Backed by the dev-mode store
 * (lib/dev-mode.ts) so the Dev panel switch, the Lotus page badge and these
 * headers always agree. The proxy route ignores the header in production.
 */
export function getLotusDevModelMode(): "fake" | "real" {
  if (typeof window === "undefined") return "real";
  return lotusModelMode();
}

export function setLotusDevModelMode(mode: "fake" | "real") {
  setFakeModel(mode === "fake");
}

function lotusDevModelModeHeaders(): Record<string, string> {
  return getLotusDevModelMode() === "fake" ? { "x-cogna-lotus-model-mode": "fake" } : {};
}

/** Longest a Lotus call may take before the page gives up and offers a retry (the proxy's own limit is 90 s for answers). */
const LOTUS_CLIENT_TIMEOUT_MS = 100_000;

async function lotusFetch<T>(path: string, options?: RequestInit, timeoutMs = LOTUS_CLIENT_TIMEOUT_MS): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(`/api/lotus${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...cognaAuthHeaders(),
        ...lotusDevModelModeHeaders(),
        ...options?.headers,
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const detail = controller.signal.aborted ? "it took too long" : err instanceof Error ? err.message : "Network error";
    throw new ApiError(`Cogna Lotus request failed: ${detail}`, 0, path);
  }
  try {
    return await readLotusResponse<T>(res, path);
  } catch (err) {
    if (controller.signal.aborted) throw new ApiError("Cogna Lotus request failed: it took too long", 0, path);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function readLotusResponse<T>(res: Response, path: string): Promise<T> {

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const message =
      typeof err === "object" && err && "message" in err
        ? String((err as { message?: string }).message ?? res.statusText)
        : res.statusText;
    throw new ApiError(message || `Lotus error ${res.status}`, res.status, path);
  }

  return res.json() as Promise<T>;
}

function teacherAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const teacherRaw = sessionStorage.getItem("cogna_teacher_invitation");
    if (!teacherRaw) return {};
    const teacher = JSON.parse(teacherRaw) as { token?: string };
    if (!teacher.token) return {};
    return {
      "X-Cogna-Role": "teacher",
      "X-Cogna-Teacher-Token": teacher.token,
    };
  } catch {
    return {};
  }
}

/** AI Studio reads are deliberately teacher-only; never fall back to student credentials. */
async function lotusObserverFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return lotusFetch<T>(path, {
    ...options,
    headers: {
      ...teacherAuthHeaders(),
      ...options?.headers,
    },
  });
}

async function personalizedVideoFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/personalized-videos${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...cognaAuthHeaders(),
        ...options?.headers,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    throw new ApiError(`Personalized video request failed: ${detail}`, 0, path);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const message =
      typeof err === "object" && err && "message" in err
        ? String((err as { message?: string }).message ?? res.statusText)
        : res.statusText;
    throw new ApiError(message || `Personalized video error ${res.status}`, res.status, path);
  }

  return res.json() as Promise<T>;
}

/** Where class pages listen for live updates (lib/event-stream.ts), with the same sign-in as their other calls. */
export const liveUpdates = {
  classUrl: (classroomId: string) => `${API_URL}/classrooms/${encodeURIComponent(classroomId)}/events`,
  studentUrl: () => `${API_URL}/classrooms/student/events`,
  teacherHeaders: (): Record<string, string> => ({ ...cognaAuthHeaders(), ...teacherAuthHeaders() }),
  studentHeaders: (): Record<string, string> => cognaAuthHeaders(),
};

/** A live "a student answered" update for one row of a teacher's class report. */
export interface ClassActivityEvent {
  type: "activity";
  runId: string;
  studentId: string;
  answeredSoFar: number;
  lastActiveAt: string;
  testFinished: boolean;
}

async function classroomFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...cognaAuthHeaders(),
        ...options?.headers,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    throw new ApiError(`Classroom request failed: ${detail}`, 0, path);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(String(body?.message ?? res.statusText), res.status, path);
  }
  return res.json() as Promise<T>;
}

export interface StudentSession {
  studentId: string;
  name: string;
  sessionToken?: string;
}

export interface ParentSession {
  parentId: string;
  email: string;
  name: string;
}

export interface TeacherInvitationClaim {
  teacherEmail: string;
  teacherName: string;
  schoolId: string;
  schoolName: string;
  role: "teacher";
  invitationVerified: true;
  token?: string;
}

export { SESSION_LIMIT_MS };

export interface AnswerResponse {
  processingStatus: string;
  grade: string;
  isCorrect: boolean;
  decision: PracticeNextResponse["decision"];
  attemptId: string;
  next?: PracticeNextResponse;
}

export interface RevisionQueueItem {
  id: string;
  conceptId: string;
  type: string;
  status: string;
  priority: number;
  questionCount: number;
  reasoning: string;
  dueAt?: string;
  targetMisconception?: string | null;
}

export interface RevisionPlan {
  studentId: string;
  daily: {
    date: string;
    items: Array<{
      revisionItemId: string;
      type: string;
      conceptId: string;
      priority: number;
      dueAt: string;
      questionCount: number;
    }>;
    cappedAt: number;
  };
  weekly: {
    weekStart: string;
    retentionConceptIds: string[];
    misconceptionPaths: string[];
    transferEligible: boolean;
  };
}

/** Fields used when renderedText is empty — plain-language fallback only. */
export interface WeeklyStructuredSummary {
  sessionsCompleted?: number;
  questionsAttempted?: number;
  conceptsPracticed?: string[];
  weakEvidence?: boolean;
  activePatterns?: Array<{
    misconceptionId?: string;
    confidence?: number;
    uncertainty?: string;
  }>;
  parentActions?: string[];
}

export type CheckKind = "DIAGNOSTIC" | "TOPIC_CHECK" | "CATCH_UP";
export type TopicStudentStatus = "UNDERSTOOD" | "STUCK" | "UNCLEAR" | "IN_PROGRESS" | "NOT_CHECKED";

/** A class's topic plan (apps/api/src/classrooms/class-topics.service.ts). */
export interface ClassTopicPlan {
  classroomId: string;
  grade: number;
  topics: Array<{
    topicId: string;
    name: string;
    chapter: number;
    status: "UPCOMING" | "TEACHING" | "DONE";
    available: boolean;
    startedAt: string | null;
    doneAt: string | null;
    confirmedAt: string | null;
    checks: Array<{ runId: string; kind: CheckKind; title: string; status: string; createdAt: string }>;
  }>;
  current: {
    topicId: string;
    readiness: {
      students: Array<{ studentId: string; name: string; status: TopicStudentStatus; need?: string }>;
      counts: Record<TopicStudentStatus, number> & { enrolled: number };
      recommendation: { action: "DIAGNOSTIC" | "WAIT" | "TOPIC_CHECK" | "CATCH_UP" | "MOVE_ON"; text: string; studentIds?: string[] };
    };
    growth: { students: number; before: number; after: number } | null;
  } | null;
  next: string | null;
}

/** How a student grew on a topic between their first and latest check. */
export interface TopicGrowthEntry {
  topicId: string;
  name: string;
  growth: { checks: number; firstDate: string; latestDate: string; firstSecure: number; latestSecure: number; fixed: string[]; stillWorking: string[] };
}

/** One child, as their parent sees it: their own class results (never classmates') and recent personal lessons. */
export interface ParentChildOverview {
  student: { id: string; name: string; grade: number };
  classes: Array<{
    classroomId: string;
    name: string;
    grade: number;
    teacherName: string;
    check: {
      title: string;
      live: boolean;
      date: string;
      stage: "JOINED" | "DIAGNOSTIC" | "LESSON" | "EXIT" | "DONE";
      stageStatus: string;
      progress: "IMPROVED" | "NOT_YET" | "NO_GAP" | "UNCLEAR" | "PENDING";
      need: string | null;
      lessonTitle: string | null;
      finalCorrect: boolean | null;
    } | null;
  }>;
  lessons: Array<{ id: string; title: string; date: string; finished: boolean; finalCorrect: boolean | null }>;
  totals: { checksDone: number; lessonsFinished: number };
  lastActive: string | null;
  growth: TopicGrowthEntry[];
}

export interface ParentWeeklySummary {
  studentId: string;
  reportId?: string;
  structuredSummary?: WeeklyStructuredSummary | null;
  renderedText?: string;
  periodStart?: string;
  periodEnd?: string;
  createdAt?: string;
}

export interface HomeSummary {
  studentId: string;
  nextAction: { conceptId: string; reason: "revision" | "continue" } | null;
  momentum: { sessionsCount: number; days: boolean[] };
  recap: { conceptId: string | null; minutes: number; endedAt: string } | null;
}

export type ClassroomAssignmentKind = "DIAGNOSTIC" | "TEACHING" | "INDEPENDENT_EXIT";
export type ClassroomAssignmentStatus = "WAITING" | "READY" | "IN_PROGRESS" | "COMPLETE" | "SKIPPED" | "FAILED";

export interface ProductionClassroom {
  id: string;
  name: string;
  grade: number;
  subjectId: string;
  joinCode: string;
  isDemo: boolean;
  _count?: { enrollments: number };
  /** Newest first (up to 12), so runs[0] is the latest check. */
  runs?: Array<{ id: string; title: string; phase: string; status: string; createdAt: string; startedAt?: string | null; completedAt?: string | null }>;
}

/** The Lotus test for a class topic id ("algebraic-expressions" → ALGEBRAIC_EXPRESSIONS); linear equations and anything unknown run the brackets test. */
export function lotusTopicForClassTopic(topicId: string): LotusTopic {
  if (/factor/i.test(topicId)) return "FACTORISATION";
  const key = topicId.toUpperCase().replace(/-/g, "_");
  return (LOTUS_PLANNED_TOPICS as readonly string[]).includes(key) ? (key as LotusTopic) : "BRACKETS";
}

/** Where a classroom assignment is done. The diagnostic carries its topic so Lotus runs the right test. */
export function classroomAssignmentHref(item: { id: string; kind: ClassroomAssignmentKind; videoAssignmentId?: string | null; payload?: Record<string, unknown>; run: { id: string; topicId: string } }): string {
  const params = new URLSearchParams({ assignment: item.id, run: item.run.id });
  if (item.videoAssignmentId) params.set("video", item.videoAssignmentId);
  if (item.kind === "DIAGNOSTIC") {
    const topic = lotusTopicForClassTopic(item.run.topicId);
    if (topic !== "BRACKETS") params.set("topic", topic.toLowerCase());
    if (item.payload?.kind === "CATCH_UP") params.set("check", "catch-up");
    return `/student/lotus?${params.toString()}`;
  }
  // Lesson, practice and the independent exit share one page; the exit opens straight at its step.
  if (item.kind === "INDEPENDENT_EXIT") params.set("stage", "exit");
  return `/student/personalized-video?${params.toString()}`;
}

export interface ClassRosterStudent {
  studentId: string;
  name: string;
  rollNumber?: string | null;
  joinedAt: string;
  /** The same teacher's other classes this student is also in — usually a mistyped code. */
  alsoIn: Array<{ id: string; name: string }>;
  /** Created from the class list (not by a family), so the teacher can issue a new code. */
  schoolIssuedCode: boolean;
  /** A family account owns this student (made them, or claimed them with the code from school). */
  parentLinked?: boolean;
  /** An unused parent link code is still valid. */
  parentCodeActive?: boolean;
}

/** A sign-in code, shown once: only its hash is stored. */
export interface IssuedStudentCode {
  studentId: string;
  name: string;
  rollNumber?: string | null;
  /** The student's sign-in code; absent when only a parent code was issued. */
  accessCode?: string;
  /** The one-time code a parent enters to link this student to their account. */
  parentCode?: string;
  parentCodeExpiresAt?: string;
}

/** An update from school on a parent's dashboard. */
export interface ParentNotificationItem {
  id: string;
  studentId: string;
  studentName: string;
  kind: "CHECK_FINISHED" | "CATCH_UP_SET" | string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface ClassroomStudentAssignment {
  id: string;
  kind: ClassroomAssignmentKind;
  status: ClassroomAssignmentStatus;
  videoAssignmentId?: string | null;
  payload: Record<string, unknown>;
  run: { id: string; title: string; topicId: string; config?: Record<string, unknown>; classroom: { id: string; name: string; grade: number; subjectId: string } };
}

/** Pilot class results (apps/api/src/classrooms/class-report.ts). */
export interface PilotClassReport {
  totals: { enrolled: number; diagnosticDone: number; gapFound: number; noGap: number; unclear: number; lessonDone: number; exitDone: number; improved: number };
  gapGroups: Array<{ skillId: string; name: string; students: string[]; exitCorrect: number; exitDone: number }>;
  skills: Array<{ skillId: string; name: string; secure: number; gap: number; suspected: number }>;
  headline: string;
  students: Array<{
    studentId: string;
    name: string;
    rollNumber?: string | null;
    stage: "JOINED" | "DIAGNOSTIC" | "LESSON" | "EXIT" | "DONE";
    stageStatus: string;
    outcome?: string;
    startingPoint?: { skillId: string; name: string };
    answered?: number;
    correct?: number;
    minutes?: number | null;
    endedNote?: string;
    lesson?: { title?: string; status?: string; authoredBy?: "AI" | "RECIPE"; practice?: { attempted: number; correct: number; total: number } } | null;
    exitCorrect?: boolean | null;
    exitScore?: { right: number; total: number };
    progress: "IMPROVED" | "NOT_YET" | "NO_GAP" | "UNCLEAR" | "PENDING";
    /** Only while a step is in progress, or a finished test is being filed. */
    activity?: { state: "WORKING" | "IDLE" | "FILING"; lastActiveAt: string | null; quietMinutes: number | null; quietAfterMinutes: number; answeredSoFar?: number };
  }>;
}

export interface ClassroomRunReport {
  run: { id: string; title: string; phase: string; status: string; topicId: string; classroom: ProductionClassroom };
  autoAdvance: boolean;
  /** Teacher controls on a running check: paused since, and when it ends by itself. */
  controls?: { pausedAt: string | null; endsAt: string | null };
  classReport: PilotClassReport;
  progress: Array<{ kind: ClassroomAssignmentKind; total: number; ready: number; inProgress: number; complete: number }>;
  summary: { enrolled: number; diagnosticOutcomes: Record<string, number>; observedStrengths: Record<string, number>; uncertaintyAreas: Record<string, number>; lessonDeliveries: Record<string, number>; independentExit: { completed: number; verified: number; needsReview: number } };
  students: Array<{ assignmentId: string; studentId: string; studentName: string; kind: ClassroomAssignmentKind; status: ClassroomAssignmentStatus; result?: Record<string, unknown> | null }>;
}

export const api = {
  /** Dev-only demo login credentials. The API omits them in production/staging, so fail with a clear message. */
  health: async () => {
    const health = await apiFetch<{ devStudentId?: string; devAccessCode?: string }>("/health");
    if (!health.devAccessCode || !health.devStudentId) {
      throw new Error("Demo login is not available in this environment.");
    }
    return { devStudentId: health.devStudentId, devAccessCode: health.devAccessCode };
  },

  claimTeacherInvitation: async (email: string, inviteCode: string) => {
    const path = "/api/teacher-invitations/claim";
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, inviteCode }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(String(body.message ?? "Invitation verification failed"), response.status, path);
    }
    return response.json() as Promise<TeacherInvitationClaim>;
  },

  listClassrooms: () => classroomFetch<ProductionClassroom[]>("/classrooms", { headers: teacherAuthHeaders() }),

  createClassroom: (input: { name: string; grade: number; subjectId: string; joinCode?: string; isDemo?: boolean }) =>
    classroomFetch<ProductionClassroom>("/classrooms", { method: "POST", headers: teacherAuthHeaders(), body: JSON.stringify(input) }),

  joinClassroom: (input: { joinCode: string; rollNumber?: string; admissionNumber?: string }) =>
    classroomFetch<{ id: string; classroom: ProductionClassroom; alsoIn: Array<{ id: string; name: string }> }>("/classrooms/join", { method: "POST", body: JSON.stringify(input) }),

  getClassRoster: (classroomId: string) =>
    classroomFetch<ClassRosterStudent[]>(`/classrooms/${classroomId}/students`, { headers: teacherAuthHeaders() }),

  importStudents: (classroomId: string, students: Array<{ name: string; rollNumber?: string }>) =>
    classroomFetch<{ classroom: { id: string; name: string; joinCode: string }; students: IssuedStudentCode[] }>(`/classrooms/${classroomId}/students/import`, { method: "POST", headers: teacherAuthHeaders(), body: JSON.stringify({ students }) }),

  resetStudentAccessCode: (classroomId: string, studentId: string) =>
    classroomFetch<IssuedStudentCode>(`/classrooms/${classroomId}/students/${encodeURIComponent(studentId)}/access-code`, { method: "POST", headers: teacherAuthHeaders() }),

  issueParentCode: (classroomId: string, studentId: string) =>
    classroomFetch<IssuedStudentCode>(`/classrooms/${classroomId}/students/${encodeURIComponent(studentId)}/parent-code`, { method: "POST", headers: teacherAuthHeaders() }),

  restartStudentCheck: (runId: string, studentId: string) =>
    classroomFetch<ClassroomRunReport>(`/classrooms/runs/${runId}/students/${encodeURIComponent(studentId)}/restart`, { method: "POST", headers: teacherAuthHeaders() }),

  pauseClassroomRun: (runId: string, paused: boolean) =>
    classroomFetch<ClassroomRunReport>(`/classrooms/runs/${runId}/pause`, { method: "POST", headers: teacherAuthHeaders(), body: JSON.stringify({ paused }) }),

  setClassroomRunTimeLimit: (runId: string, minutes: number | null) =>
    classroomFetch<ClassroomRunReport>(`/classrooms/runs/${runId}/time-limit`, { method: "POST", headers: teacherAuthHeaders(), body: JSON.stringify(minutes === null ? {} : { minutes }) }),

  nudgeClassroomRun: (runId: string) =>
    classroomFetch<{ nudged: number; alreadyReminded: number }>(`/classrooms/runs/${runId}/nudge`, { method: "POST", headers: teacherAuthHeaders() }),

  removeStudentFromClass: (classroomId: string, studentId: string) =>
    classroomFetch<{ removed: true }>(`/classrooms/${classroomId}/students/${encodeURIComponent(studentId)}`, { method: "DELETE", headers: teacherAuthHeaders() }),

  createClassroomRun: (classroomId: string, input: { title: string; topicId: string; config?: Record<string, unknown> }) =>
    classroomFetch<{ id: string; title: string; phase: string; status: string }>(`/classrooms/${classroomId}/runs`, { method: "POST", headers: teacherAuthHeaders(), body: JSON.stringify(input) }),

  launchClassroomPhase: (runId: string, phase: ClassroomAssignmentKind) =>
    classroomFetch<ClassroomRunReport>(`/classrooms/runs/${runId}/launch`, { method: "POST", headers: teacherAuthHeaders(), body: JSON.stringify({ phase }) }),

  renameClassroom: (classroomId: string, name: string) =>
    classroomFetch<ProductionClassroom>(`/classrooms/${classroomId}`, { method: "PATCH", headers: teacherAuthHeaders(), body: JSON.stringify({ name }) }),

  endClassroomRun: (runId: string) =>
    classroomFetch<ClassroomRunReport>(`/classrooms/runs/${runId}/end`, { method: "POST", headers: teacherAuthHeaders() }),

  getClassroomRunReport: (runId: string) => classroomFetch<ClassroomRunReport>(`/classrooms/runs/${runId}/report`, { headers: teacherAuthHeaders() }),

  getClassTopics: (classroomId: string) => classroomFetch<ClassTopicPlan>(`/classrooms/${classroomId}/topics`, { headers: teacherAuthHeaders() }),

  setTopicStatus: (classroomId: string, topicId: string, action: "start" | "confirm" | "done") =>
    classroomFetch<ClassTopicPlan>(`/classrooms/${classroomId}/topics/${encodeURIComponent(topicId)}/${action}`, { method: "POST", headers: teacherAuthHeaders() }),

  startTopicCheck: (classroomId: string, topicId: string, kind: CheckKind, studentIds?: string[]) =>
    classroomFetch<ClassTopicPlan>(`/classrooms/${classroomId}/topics/${encodeURIComponent(topicId)}/checks`, { method: "POST", headers: teacherAuthHeaders(), body: JSON.stringify({ kind, studentIds }) }),

  /** The signed-in student's growth on each topic. */
  getStudentProgress: () => classroomFetch<TopicGrowthEntry[]>("/classrooms/student/progress"),

  /** The signed-in student's classes and where they are in each one's latest check. */
  getStudentClasses: () => classroomFetch<ParentChildOverview["classes"]>("/classrooms/student/classes"),

  getStudentClassroomAssignments: () => classroomFetch<ClassroomStudentAssignment[]>("/classrooms/student/assignments"),

  startClassroomAssignment: (assignmentId: string) => classroomFetch<ClassroomStudentAssignment>(`/classrooms/assignments/${assignmentId}/start`, { method: "POST" }),

  completeClassroomAssignment: (assignmentId: string, input: { diagnosticSessionId?: string; videoAssignmentId?: string; result: Record<string, unknown> }) =>
    classroomFetch<ClassroomStudentAssignment & { next: { id: string; kind: ClassroomAssignmentKind } | null }>(`/classrooms/assignments/${assignmentId}/complete`, { method: "POST", body: JSON.stringify(input) }),

  parentSignup: (email: string, name: string) =>
    apiFetch<ParentSession>("/parents/dev/signup", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    }),

  parentDemoLogin: () =>
    apiFetch<ParentSession>("/parents/dev/demo-login", { method: "POST" }),

  listStudents: (auth?: string | ParentAuthInput) =>
    apiFetch<Array<{ id: string; name: string; grade: number }>>(
      "/parents/me/students",
      { headers: buildParentAuthHeaders(auth) },
    ),

  createStudent: (
    auth: string | ParentAuthInput | undefined,
    name: string,
    grade?: number,
  ) =>
    apiFetch<{ studentId: string; name: string; accessCode: string }>(
      "/parents/me/students",
      {
        method: "POST",
        headers: buildParentAuthHeaders(auth),
        body: JSON.stringify({ name, grade }),
      },
    ),

  /** Links a school-made student with the one-time code from school. */
  claimStudentWithCode: (auth: string | ParentAuthInput | undefined, code: string) =>
    apiFetch<{ id: string; name: string; grade: number }>("/parents/me/students/claim", {
      method: "POST",
      headers: buildParentAuthHeaders(auth),
      body: JSON.stringify({ code }),
    }),

  getParentNotifications: (auth?: string | ParentAuthInput) =>
    apiFetch<{ unread: number; items: ParentNotificationItem[] }>("/parents/me/notifications", { headers: buildParentAuthHeaders(auth) }),

  markParentNotificationsRead: (auth?: string | ParentAuthInput) =>
    apiFetch<{ marked: number }>("/parents/me/notifications/read", { method: "POST", headers: buildParentAuthHeaders(auth) }),

  regenerateAccessCode: (auth: string | ParentAuthInput | undefined, studentId: string) =>
    apiFetch<{ studentId: string; accessCode: string }>(
      `/parents/me/students/${studentId}/access-code`,
      {
        method: "POST",
        headers: buildParentAuthHeaders(auth),
      },
    ),

  studentLogin: (accessCode: string) =>
    apiFetch<StudentSession>("/auth/student/login", {
      method: "POST",
      body: JSON.stringify({ accessCode }),
    }),

  createSession: (studentId: string, sessionMode: "BASELINE" | "ADAPTIVE_PRACTICE") =>
    apiFetch<{ sessionId: string; sessionMode: string; next: PracticeNextResponse }>(
      "/sessions",
      {
        method: "POST",
        body: JSON.stringify({ studentId, sessionMode }),
      },
    ),

  getNext: (sessionId: string, studentId: string) =>
    apiFetch<PracticeNextResponse>(
      `/practice/next?sessionId=${sessionId}&studentId=${studentId}`,
    ),

  submitAnswer: (payload: {
    eventId: string;
    eventType: "ANSWER_SUBMITTED";
    studentId: string;
    sessionId: string;
    questionId: string;
    questionVersion: number;
    submittedAnswer: string;
    timeToFirstResponseMs: number;
    totalTimeMs: number;
    idleTimeMs: number;
    attemptNumber: number;
    hintCount: number;
    highestHintLevel: number;
    selfRatedConfidence: number | null;
    answerChangedBeforeSubmit: boolean;
    clientTimestamp: string;
  }) =>
    apiFetch<AnswerResponse>("/practice/answer", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  requestHint: (payload: {
    eventId: string;
    eventType: "HINT_REQUESTED";
    studentId: string;
    sessionId: string;
    questionId: string;
    questionVersion: number;
    clientTimestamp?: string;
  }) =>
    apiFetch<{ hint: { level: number; content: string }; payload: { level: number; content: string } }>(
      "/practice/hint",
      {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          clientTimestamp: payload.clientTimestamp ?? new Date().toISOString(),
        }),
      },
    ),

  skipQuestion: (payload: {
    eventId: string;
    eventType: "QUESTION_SKIPPED";
    studentId: string;
    sessionId: string;
    questionId: string;
    questionVersion: number;
    clientTimestamp: string;
  }) =>
    apiFetch<{
      processingStatus: string;
      decision: PracticeNextResponse["decision"];
      next: PracticeNextResponse;
    }>("/practice/skip", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  explanationViewed: (payload: {
    eventId: string;
    eventType: "EXPLANATION_VIEWED";
    studentId: string;
    sessionId: string;
    conceptId?: string;
    misconceptionId?: string;
    clientTimestamp?: string;
  }) =>
    apiFetch<{ next?: PracticeNextResponse }>("/practice/explanation-viewed", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        clientTimestamp: payload.clientTimestamp ?? new Date().toISOString(),
      }),
    }),

  endSession: (sessionId: string) =>
    apiFetch<{
      sessionId: string;
      questionCount: number;
      summaryReportId: string;
      revisionProposed?: boolean;
      revisionItemsCreated?: number;
    }>(`/sessions/${sessionId}/end`, { method: "POST" }),

  /** Fused, non-blocking confidence tap on the adaptive-practice feedback screen — fire-and-forget from the caller's point of view. */
  updateAttemptConfidence: (attemptId: string, studentId: string, selfRatedConfidence: number) =>
    apiFetch<{ attemptId: string; selfRatedConfidence: number }>(
      `/practice/attempts/${attemptId}/confidence`,
      {
        method: "PATCH",
        body: JSON.stringify({ studentId, selfRatedConfidence }),
      },
    ),

  getRevisionQueue: (studentId: string) =>
    apiFetch<RevisionQueueItem[]>(`/students/${studentId}/revision-queue`),

  /** MVP 2.0 — may 404 until backend lands. */
  getRevisionPlan: (studentId: string) =>
    apiFetch<RevisionPlan>(`/students/${studentId}/revision-plan`),

  getLatestReport: (studentId: string, audience: "STUDENT" | "PARENT" = "STUDENT") =>
    apiFetch<{
      id: string;
      renderedText: string;
      createdAt: string;
    }>(`/students/${studentId}/reports/latest?audience=${audience}`),

  getParentStudentSummary: (
    auth: string | ParentAuthInput | undefined,
    studentId: string,
  ) =>
    apiFetch<{
      studentId: string;
      reportId?: string;
      renderedText: string;
      structuredData?: unknown;
      createdAt: string;
    }>(`/parents/me/students/${studentId}/summary`, {
      headers: buildParentAuthHeaders(auth),
    }),

  /** MVP 2.0 — may 404 until backend lands. */
  getParentChildOverview: (auth: string | ParentAuthInput | undefined, studentId: string) =>
    apiFetch<ParentChildOverview>(
      `/parents/me/students/${studentId}/overview`,
      { headers: buildParentAuthHeaders(auth) },
      false,
    ),

  getParentWeeklySummary: (
    auth: string | ParentAuthInput | undefined,
    studentId: string,
  ) =>
    apiFetch<ParentWeeklySummary>(
      `/parents/me/students/${studentId}/weekly-summary`,
      { headers: buildParentAuthHeaders(auth) },
    ),

  /** MVP 2.0 — optional trigger; may 404 until backend lands. */
  /** `parentAuth` when a parent asks (the API checks they are linked to this student). */
  requestWeeklyReport: (
    studentId: string,
    body: { periodStart: string; periodEnd: string; requestId?: string },
    parentAuth?: string | ParentAuthInput,
  ) =>
    apiFetch<{ reportId: string; status: string; idempotencyKey?: string }>(
      `/students/${studentId}/reports/weekly`,
      { method: "POST", body: JSON.stringify(body), ...(parentAuth ? { headers: buildParentAuthHeaders(parentAuth) } : {}) },
      !parentAuth,
    ),

  getHomeSummary: (studentId: string) =>
    apiFetch<HomeSummary>(`/students/${studentId}/home-summary`),

  getMasteryTrend: (
    auth: string | ParentAuthInput | undefined,
    studentId: string,
    opts?: { conceptId?: string; weeks?: number },
  ) => {
    const params = new URLSearchParams();
    if (opts?.conceptId) params.set("conceptId", opts.conceptId);
    if (opts?.weeks) params.set("weeks", String(opts.weeks));
    const qs = params.toString();
    return apiFetch<MasteryTrendPoint[]>(
      `/parents/me/students/${studentId}/mastery-trend${qs ? `?${qs}` : ""}`,
      { headers: buildParentAuthHeaders(auth) },
    );
  },

  getConceptBands: (auth: string | ParentAuthInput | undefined, studentId: string) =>
    apiFetch<ConceptMasteryBand[]>(
      `/parents/me/students/${studentId}/concept-bands`,
      { headers: buildParentAuthHeaders(auth) },
    ),

  getPracticeCalendar: (
    auth: string | ParentAuthInput | undefined,
    studentId: string,
    weeks?: number,
  ) =>
    apiFetch<PracticeCalendarDay[]>(
      `/parents/me/students/${studentId}/practice-calendar${weeks ? `?weeks=${weeks}` : ""}`,
      { headers: buildParentAuthHeaders(auth) },
    ),

  getPatternHistory: (
    auth: string | ParentAuthInput | undefined,
    studentId: string,
    weeks?: number,
  ) =>
    apiFetch<PatternHistoryItem[]>(
      `/parents/me/students/${studentId}/pattern-history${weeks ? `?weeks=${weeks}` : ""}`,
      { headers: buildParentAuthHeaders(auth) },
    ),

  getConfidenceCalibration: (auth: string | ParentAuthInput | undefined, studentId: string) =>
    apiFetch<ConfidenceCalibrationSummary>(
      `/parents/me/students/${studentId}/confidence-calibration`,
      { headers: buildParentAuthHeaders(auth) },
    ),

  getSafetySettings: (auth: string | ParentAuthInput | undefined, studentId: string) =>
    apiFetch<StudentSafetySettings>(
      `/parents/me/students/${studentId}/settings`,
      { headers: buildParentAuthHeaders(auth) },
    ),

  updateSafetySettings: (
    auth: string | ParentAuthInput | undefined,
    studentId: string,
    aiAssistedPracticePaused: boolean,
  ) =>
    apiFetch<StudentSafetySettings>(
      `/parents/me/students/${studentId}/settings`,
      {
        method: "PATCH",
        headers: buildParentAuthHeaders(auth),
        body: JSON.stringify({ aiAssistedPracticePaused }),
      },
    ),

  /** MVP 9.0.1 Phase A — micro-skill step diagnostic; standalone from the
   * MVP 1.0-9.0 session/practice routes above. May 404 until the backend lands.
   * Optional track, including the combined five-topic diagnostic. */
  startDiagnosticV2Session: (
    studentId: string,
    track: DiagnosticV2Track = "FRACTION_LINEAR",
  ) =>
    apiFetch<StartDiagnosticV2SessionResponse>("/diagnostic-v2/sessions", {
      method: "POST",
      body: JSON.stringify({
        studentId,
        track,
      }),
    }),

  submitDiagnosticV2Step: (
    sessionId: string,
    payload: SubmitDiagnosticV2StepRequest,
  ) =>
    apiFetch<SubmitDiagnosticV2StepResponse>(
      `/diagnostic-v2/sessions/${sessionId}/steps`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  /** Internal debug view — only fetched when the page is opened with `?debug=1`. */
  getDiagnosticV2Session: (sessionId: string) =>
    apiFetch<DiagnosticV2DebugView>(`/diagnostic-v2/sessions/${sessionId}`),

  getDiagnosticV2Summary: (sessionId: string) =>
    apiFetch<DiagnosticV2SummaryResponse>(
      `/diagnostic-v2/sessions/${sessionId}/summary`,
    ),

  /** Cogna Lotus — experimental dual-model AI Lab, isolated from diagnostic-v2. */
  getLotusStatus: () => lotusFetch<LotusStatusResponse>("/status"),

  startLotusSession: (studentId: string, topic?: LotusTopic, classroomAssignmentId?: string) =>
    lotusFetch<LotusSessionView>("/sessions", {
      method: "POST",
      body: JSON.stringify({ studentId, topic, ...(classroomAssignmentId ? { classroomAssignmentId } : {}) }),
    }),

  getLotusSession: (sessionId: string) =>
    lotusFetch<LotusSessionView>(`/sessions/${sessionId}`),

  getLotusObserverSession: (sessionId: string) =>
    lotusObserverFetch<LotusSessionView>(`/sessions/${sessionId}/observer`),

  /** Server computes the demo answer now that the answer key isn't shipped to the client while a diagnostic is active. Demo student ids only. */
  demoFillLotusResponse: (sessionId: string, studentId: string, gap?: string) =>
    lotusFetch<{ answer: string; working: string; confidence: number }>(
      `/sessions/${sessionId}/demo-fill?studentId=${encodeURIComponent(studentId)}${gap ? `&gap=${encodeURIComponent(gap)}` : ""}`,
    ),

  /** The current question, spoken by the server's voice (base64 MP3). */
  readLotusAloud: (sessionId: string, studentId: string) =>
    lotusFetch<{ audio: string; format: "mp3" }>(`/sessions/${sessionId}/read-aloud?studentId=${encodeURIComponent(studentId)}`),

  submitLotusAnswer: (
    sessionId: string,
    studentId: string,
    response: LotusStudentResponse,
  ) =>
    lotusFetch<LotusSessionView>(`/sessions/${sessionId}/answers`, {
      method: "POST",
      body: JSON.stringify({ studentId, ...response }),
    }),

  /** "How did you get it?": the student's one tap after an answer code couldn't explain. */
  answerLotusReason: (sessionId: string, studentId: string, questionId: string, optionId: string) =>
    lotusFetch<LotusSessionView>(`/sessions/${sessionId}/reasons`, {
      method: "POST",
      body: JSON.stringify({ studentId, questionId, optionId }),
    }),

  overrideLotusSession: (
    sessionId: string,
    studentId: string,
    action: LotusOverrideAction,
  ) =>
    lotusObserverFetch<LotusSessionView>(`/sessions/${sessionId}/override`, {
      method: "POST",
      body: JSON.stringify({ studentId, action }),
    }),

  getLotusUnseenPlan: (sessionId: string) =>
    lotusObserverFetch<LotusUnseenPlanEntry[]>(`/sessions/${sessionId}/unseen-plan`),

  getPersonalizedVideoAssignment: (studentId: string, studentKey?: string) => {
    const query = new URLSearchParams({ studentId });
    if (studentKey) query.set("studentKey", studentKey);
    return personalizedVideoFetch<PersonalizedVideoAssignmentView>(
      `/for-student?${query.toString()}`,
    );
  },

  createPersonalizedVideoAssignment: (input: {
    studentId?: string;
    studentKey?: string;
    lotusSessionId: string;
  }) =>
    personalizedVideoFetch<PersonalizedVideoAssignmentView>("/assignments", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getPersonalizedVideoById: (id: string) =>
    personalizedVideoFetch<PersonalizedVideoAssignmentView>(`/assignments/${id}`),

  /** Dev/demo: this demo student's animated lesson, created from pilot evidence if they don't have one yet. */
  demoAnimatedLesson: (studentId: string) =>
    personalizedVideoFetch<PersonalizedVideoAssignmentView>("/demo-animated", {
      method: "POST",
      body: JSON.stringify({ studentId }),
    }),

  /** The animated, voiced lesson in one world; the first open of a world narrates it (a few seconds). */
  getLessonAnimation: (id: string, theme: LessonThemeChoice) =>
    personalizedVideoFetch<PersonalizedLessonAnimationView>(`/assignments/${id}/animation?theme=${encodeURIComponent(theme)}`),

  getPracticeSet: (id: string) => personalizedVideoFetch<PracticeSetView>(`/assignments/${id}/practice`),

  /** The narrated 20-second lesson on the student's own mistake, or null when none fits. */
  getMicroLesson: (id: string, theme?: string) =>
    personalizedVideoFetch<{ lesson: MicroLessonView | null }>(`/assignments/${id}/micro-lesson${theme ? `?theme=${encodeURIComponent(theme)}` : ""}`),

  checkMicroLesson: (id: string, option: number) =>
    personalizedVideoFetch<MicroCheckResult>(`/assignments/${id}/micro-check`, { method: "POST", body: JSON.stringify({ option }) }),

  checkPracticeAnswer: (id: string, itemId: string, answer: PracticeAnswer) =>
    personalizedVideoFetch<PracticeCheckResult>(`/assignments/${id}/practice/${encodeURIComponent(itemId)}`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    }),

  recordPersonalizedVideoWatched: (id: string, dwellMs = 0) =>
    personalizedVideoFetch<PersonalizedVideoAssignmentView>(`/assignments/${id}/watched`, {
      method: "POST",
      body: JSON.stringify({ dwellMs }),
    }),

  recordPersonalizedVideoCompleted: (id: string, dwellMs = 0) =>
    personalizedVideoFetch<PersonalizedVideoAssignmentView>(`/assignments/${id}/completed`, {
      method: "POST",
      body: JSON.stringify({ dwellMs }),
    }),

  /** One attempt. A tile exit sends its picks; the server rebuilds and marks the answer itself. */
  submitPersonalizedVideoExit: (id: string, answer: string, working: string, interaction?: TileBuildResponse, item = 0) =>
    personalizedVideoFetch<PersonalizedVideoAssignmentView>(`/assignments/${id}/exit`, {
      method: "POST",
      body: JSON.stringify({ answer, working, item, ...(interaction ? { interaction } : {}) }),
    }),

  verifyPersonalizedVideoStep: (id: string, sceneIndex: number, assembledLine: string) =>
    personalizedVideoFetch<{ valid: boolean }>(`/assignments/${id}/verify-step`, {
      method: "POST",
      body: JSON.stringify({ sceneIndex, assembledLine }),
    }),

  getPersonalizedVideoTeacherReport: (demo = false) =>
    personalizedVideoFetch<PersonalizedVideoTeacherReport>(
      `/teacher-report${demo ? "?demo=1" : ""}`,
      { headers: teacherAuthHeaders() },
    ),
};

export function newEventId(): string {
  return crypto.randomUUID();
}

/** Read breakMinutes from decision parameters (additive MVP 2.0 field). */
export function breakMinutesFromDecision(
  decision: PracticeNextResponse["decision"] | undefined,
): number {
  const params = decision?.parameters as { breakMinutes?: number } | undefined;
  const n = params?.breakMinutes;
  return typeof n === "number" && n > 0 ? n : 3;
}
