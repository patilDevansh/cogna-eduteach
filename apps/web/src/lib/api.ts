import type { PracticeNextResponse } from "@cogna/shared";

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

export const api = {
  health: () =>
    apiFetch<{ devStudentId: string; devAccessCode: string }>("/health"),

  parentSignup: (email: string, name: string) =>
    apiFetch<ParentSession>("/parents/dev/signup", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    }),

  listStudents: (parentId: string) =>
    apiFetch<Array<{ id: string; name: string; grade: number }>>(
      "/parents/me/students",
      { headers: { "X-Parent-Id": parentId } },
    ),

  createStudent: (parentId: string, name: string, grade?: number) =>
    apiFetch<{ studentId: string; name: string; accessCode: string }>(
      "/parents/me/students",
      {
        method: "POST",
        headers: { "X-Parent-Id": parentId },
        body: JSON.stringify({ name, grade }),
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
  }) =>
    apiFetch<{ hint: { level: number; content: string }; payload: { level: number; content: string } }>(
      "/practice/hint",
      { method: "POST", body: JSON.stringify(payload) },
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
  }) =>
    apiFetch<{ next?: PracticeNextResponse }>("/practice/explanation-viewed", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  endSession: (sessionId: string) =>
    apiFetch<{
      sessionId: string;
      questionCount: number;
      summaryReportId: string;
      revisionProposed?: boolean;
      revisionItemsCreated?: number;
    }>(`/sessions/${sessionId}/end`, { method: "POST" }),

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

  getParentStudentSummary: (parentId: string, studentId: string) =>
    apiFetch<{
      studentId: string;
      reportId?: string;
      renderedText: string;
      structuredData?: unknown;
      createdAt: string;
    }>(`/parents/me/students/${studentId}/summary`, {
      headers: { "X-Parent-Id": parentId },
    }),

  /** MVP 2.0 — may 404 until backend lands. */
  getParentWeeklySummary: (parentId: string, studentId: string) =>
    apiFetch<ParentWeeklySummary>(
      `/parents/me/students/${studentId}/weekly-summary`,
      { headers: { "X-Parent-Id": parentId } },
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
