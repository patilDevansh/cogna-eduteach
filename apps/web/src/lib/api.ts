import type {
  ConceptMasteryBand,
  ConfidenceCalibrationSummary,
  DiagnosticV2DebugView,
  DiagnosticV2SummaryResponse,
  MasteryTrendPoint,
  PatternHistoryItem,
  PracticeCalendarDay,
  PracticeNextResponse,
  StartDiagnosticV2SessionResponse,
  StudentSafetySettings,
  SubmitDiagnosticV2StepRequest,
  SubmitDiagnosticV2StepResponse,
} from "@cogna/shared";
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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
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

export interface StudentSession {
  studentId: string;
  name: string;
}

export interface ParentSession {
  parentId: string;
  email: string;
  name: string;
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

export const api = {
  health: () =>
    apiFetch<{ devStudentId: string; devAccessCode: string }>("/health"),

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
  getParentWeeklySummary: (
    auth: string | ParentAuthInput | undefined,
    studentId: string,
  ) =>
    apiFetch<ParentWeeklySummary>(
      `/parents/me/students/${studentId}/weekly-summary`,
      { headers: buildParentAuthHeaders(auth) },
    ),

  /** MVP 2.0 — optional trigger; may 404 until backend lands. */
  requestWeeklyReport: (
    studentId: string,
    body: { periodStart: string; periodEnd: string; requestId?: string },
  ) =>
    apiFetch<{ reportId: string; status: string; idempotencyKey?: string }>(
      `/students/${studentId}/reports/weekly`,
      { method: "POST", body: JSON.stringify(body) },
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
   * Optional `track` selects NEGATIVE_DISTRIBUTION (default) or FRACTION_LINEAR (B1). */
  startDiagnosticV2Session: (
    studentId: string,
    track: "NEGATIVE_DISTRIBUTION" | "FRACTION_LINEAR" = "FRACTION_LINEAR",
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
