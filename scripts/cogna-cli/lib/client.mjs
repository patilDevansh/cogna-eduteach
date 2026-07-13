/**
 * Shared HTTP client for Cogna CLI scenarios and UI smoke tests.
 * API_URL defaults to http://localhost:3001 (matches apps/web NEXT_PUBLIC_API_URL).
 */

const DEFAULT_API_URL = "http://localhost:3001";

function formatBody(body) {
  if (body == null) return "(empty)";
  if (typeof body === "string") return body.slice(0, 500);
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body);
  }
}

function httpError(method, path, status, body) {
  const msg = body?.message ?? body?.error ?? formatBody(body);
  return new Error(`${method} ${path} → HTTP ${status}: ${msg}`);
}

/**
 * @param {string} [apiUrl]
 */
export function createClient(apiUrl = process.env.API_URL ?? DEFAULT_API_URL) {
  const base = apiUrl.replace(/\/$/, "");

  async function get(path) {
    let res;
    try {
      res = await fetch(`${base}${path}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        detail === "fetch failed" || detail.includes("ECONNREFUSED")
          ? `API unavailable at ${base} — start the API and retry. (${detail})`
          : `GET ${path} failed: ${detail}`,
      );
    }
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, body };
  }

  async function post(path, payload) {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        detail === "fetch failed" || detail.includes("ECONNREFUSED")
          ? `API unavailable at ${base} — start the API and retry. (${detail})`
          : `POST ${path} failed: ${detail}`,
      );
    }
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, body };
  }

  async function health() {
    const res = await get("/health");
    if (res.status !== 200) {
      throw httpError("GET", "/health", res.status, res.body);
    }
    return res.body;
  }

  async function loginStudent(accessCode = "demo1234") {
    const res = await post("/auth/student/login", { accessCode });
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", "/auth/student/login", res.status, res.body);
    }
    if (!res.body?.studentId) {
      throw new Error("loginStudent: response missing studentId");
    }
    return { studentId: res.body.studentId, name: res.body.name };
  }

  async function startSession(studentId, sessionMode) {
    const res = await post("/sessions", { studentId, sessionMode });
    if (res.status !== 201) {
      throw httpError("POST", "/sessions", res.status, res.body);
    }
    if (!res.body?.sessionId) {
      throw new Error("startSession: response missing sessionId");
    }
    return {
      sessionId: res.body.sessionId,
      sessionMode: res.body.sessionMode,
      next: res.body.next,
    };
  }

  async function submitAnswer(payload) {
    const res = await post("/practice/answer", payload);
    return res;
  }

  async function explanationViewed(payload) {
    const res = await post("/practice/explanation-viewed", {
      clientTimestamp: new Date().toISOString(),
      ...payload,
    });
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", "/practice/explanation-viewed", res.status, res.body);
    }
    return res.body;
  }

  async function requestHint(payload) {
    const res = await post("/practice/hint", payload);
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", "/practice/hint", res.status, res.body);
    }
    return res.body;
  }

  async function skipQuestion(payload) {
    const res = await post("/practice/skip", {
      clientTimestamp: new Date().toISOString(),
      ...payload,
    });
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", "/practice/skip", res.status, res.body);
    }
    return res.body;
  }

  async function endSession(sessionId) {
    const res = await post(`/sessions/${sessionId}/end`, {});
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", `/sessions/${sessionId}/end`, res.status, res.body);
    }
    return res.body;
  }

  async function getRevisionQueue(studentId) {
    const res = await get(`/students/${studentId}/revision-queue`);
    if (res.status !== 200) {
      throw httpError("GET", `/students/${studentId}/revision-queue`, res.status, res.body);
    }
    return res.body;
  }

  async function getRevisionPlan(studentId) {
    const res = await get(`/students/${studentId}/revision-plan`);
    if (res.status !== 200) {
      throw httpError("GET", `/students/${studentId}/revision-plan`, res.status, res.body);
    }
    return res.body;
  }

  async function getRetention(studentId) {
    const res = await get(`/students/${studentId}/retention`);
    if (res.status !== 200) {
      throw httpError("GET", `/students/${studentId}/retention`, res.status, res.body);
    }
    return res.body;
  }

  async function getExplanationOutcomes(studentId) {
    const res = await get(`/students/${studentId}/explanation-outcomes`);
    if (res.status !== 200) {
      throw httpError(
        "GET",
        `/students/${studentId}/explanation-outcomes`,
        res.status,
        res.body,
      );
    }
    return res.body;
  }

  async function postWeeklyReport(studentId, body) {
    const res = await post(`/students/${studentId}/reports/weekly`, body);
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", `/students/${studentId}/reports/weekly`, res.status, res.body);
    }
    return res.body;
  }

  async function postEmailReport(studentId, body) {
    const res = await post(`/students/${studentId}/reports/email`, body);
    if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
      throw httpError("POST", `/students/${studentId}/reports/email`, res.status, res.body);
    }
    return res.body;
  }

  async function getApprovalGate() {
    const res = await get("/content/approval-gate");
    if (res.status !== 200) {
      throw httpError("GET", "/content/approval-gate", res.status, res.body);
    }
    return res.body;
  }

  async function getLatestReport(studentId, audience = "STUDENT") {
    const res = await get(`/students/${studentId}/reports/latest?audience=${audience}`);
    if (res.status !== 200) {
      throw httpError(
        "GET",
        `/students/${studentId}/reports/latest?audience=${audience}`,
        res.status,
        res.body,
      );
    }
    return res.body;
  }

  async function devSignup(email, name) {
    const res = await post("/parents/dev/signup", { email, name });
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", "/parents/dev/signup", res.status, res.body);
    }
    if (!res.body?.parentId) {
      throw new Error("devSignup: response missing parentId");
    }
    return res.body;
  }

  async function createStudent(parentId, name, grade = 8) {
    const res = await fetch(`${base}/parents/me/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Parent-Id": parentId,
      },
      body: JSON.stringify({ name, grade }),
    });
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (res.status !== 200 && res.status !== 201) {
      throw httpError("POST", "/parents/me/students", res.status, body);
    }
    if (!body?.studentId || !body?.accessCode) {
      throw new Error("createStudent: response missing studentId or accessCode");
    }
    return body;
  }

  async function getParentStudentSummary(parentId, studentId) {
    const res = await fetch(`${base}/parents/me/students/${studentId}/summary`, {
      headers: { "X-Parent-Id": parentId },
    });
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (res.status !== 200) {
      throw httpError(
        "GET",
        `/parents/me/students/${studentId}/summary`,
        res.status,
        body,
      );
    }
    return body;
  }

  /** MVP 2.0 — may 404 until backend lands. */
  async function getParentWeeklySummary(parentId, studentId) {
    const res = await fetch(
      `${base}/parents/me/students/${studentId}/weekly-summary`,
      { headers: { "X-Parent-Id": parentId } },
    );
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (res.status !== 200) {
      throw httpError(
        "GET",
        `/parents/me/students/${studentId}/weekly-summary`,
        res.status,
        body,
      );
    }
    return body;
  }

  function buildAnswerPayload({
    eventId,
    studentId,
    sessionId,
    question,
    submittedAnswer,
    overrides = {},
  }) {
    return {
      eventId,
      eventType: "ANSWER_SUBMITTED",
      studentId,
      sessionId,
      questionId: question.id,
      questionVersion: question.version,
      submittedAnswer,
      timeToFirstResponseMs: 200,
      totalTimeMs: 3000,
      idleTimeMs: 0,
      attemptNumber: 1,
      hintCount: 0,
      highestHintLevel: 0,
      selfRatedConfidence: 3,
      answerChangedBeforeSubmit: false,
      clientTimestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  return {
    apiUrl: base,
    get,
    post,
    health,
    loginStudent,
    startSession,
    submitAnswer,
    explanationViewed,
    requestHint,
    skipQuestion,
    endSession,
    getRevisionQueue,
    getRevisionPlan,
    getRetention,
    getExplanationOutcomes,
    postWeeklyReport,
    postEmailReport,
    getApprovalGate,
    getLatestReport,
    devSignup,
    createStudent,
    getParentStudentSummary,
    getParentWeeklySummary,
    buildAnswerPayload,
  };
}

export { DEFAULT_API_URL };
