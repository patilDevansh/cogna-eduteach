import type { PracticeNextResponse } from "@cogna/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
    throw new Error(
      detail === "Failed to fetch"
        ? `API unavailable at ${API_URL} — start the API (port 3001) and retry.`
        : `API request failed: ${detail}`,
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `API error ${res.status}`);
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

export interface AnswerResponse {
  processingStatus: string;
  grade: string;
  isCorrect: boolean;
  decision: PracticeNextResponse["decision"];
  attemptId: string;
  next?: PracticeNextResponse;
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
    }>(`/sessions/${sessionId}/end`, { method: "POST" }),
};

export function newEventId(): string {
  return crypto.randomUUID();
}
