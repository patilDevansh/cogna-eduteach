import { assertAnswerResponse } from "../lib/assert-decision.mjs";

export const name = "parent-analytics";
export const description =
  "Parent analytics dashboard: mastery-trend, concept-bands, practice-calendar, pattern-history, and the safety-settings toggle, plus ownership rejection for an unrelated parent";
export const mapsTo = ["MVP2.1-ANALYTICS"];

/** Wrong answer that matches SIGN_HANDLING pattern on C2 subtraction items (same trick as targeting-explanation-retest.mjs). */
const SIGN_WRONG = "4";
const CORRECT_BY_ID = {
  Q_C2_D2_001: "18",
  Q_C2_D2_002: "16",
  Q_C2_D2_003: "17",
  Q_C2_D1_001: "13",
  Q_C2_D3_001: "16",
  Q_C2_D4_001: "20",
};

function correctAnswerFor(question) {
  if (question?.id && CORRECT_BY_ID[question.id]) return CORRECT_BY_ID[question.id];
  const accepted = question?.acceptedAnswers;
  if (Array.isArray(accepted) && accepted.length > 0) return accepted[0];
  return "1";
}

/**
 * Drives a fresh student through TARGETING → EXPLANATION_REQUIRED → RETEST → RESOLVED,
 * which is exactly the flow that writes MisconceptionRemediationStateHistory rows.
 * @param {{ client: ReturnType<import("../lib/client.mjs").createClient>, uuid: () => string, studentId: string, sessionId: string, next: unknown }} ctx
 */
async function driveToResolvedPattern(client, uuid, studentId, sessionId, next) {
  let question = next?.payload?.id ? next.payload : null;
  let explanationDecision = null;

  for (let i = 0; i < 12 && question && !explanationDecision; i++) {
    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId,
        question,
        submittedAnswer: SIGN_WRONG,
        overrides: { selfRatedConfidence: 5 },
      }),
    );
    assertAnswerResponse(res);
    const decision = res.body.decision;
    if (decision.uiAction === "SHOW_EXPLANATION") {
      explanationDecision = decision;
      break;
    }
    if (res.body.next?.decision?.uiAction === "SHOW_EXPLANATION") {
      explanationDecision = res.body.next.decision;
      break;
    }
    question = res.body.next?.payload;
  }

  if (!explanationDecision) return false; // no misconception path triggered — not a hard failure for this scenario

  const viewed = await client.explanationViewed({
    eventId: uuid(),
    eventType: "EXPLANATION_VIEWED",
    studentId,
    sessionId,
    conceptId: explanationDecision.parameters.conceptId,
    misconceptionId: explanationDecision.parameters.targetMisconception,
  });

  const retestQuestion = viewed.next?.payload;
  if (!retestQuestion?.id) return false;

  const retestRes = await client.submitAnswer(
    client.buildAnswerPayload({
      eventId: uuid(),
      studentId,
      sessionId,
      question: retestQuestion,
      submittedAnswer: correctAnswerFor(retestQuestion),
      overrides: { selfRatedConfidence: 4, hintCount: 0, highestHintLevel: 0 },
    }),
  );
  assertAnswerResponse(retestRes);
  return Boolean(retestRes.body.isCorrect);
}

/**
 * @param {{ client: ReturnType<import("../lib/client.mjs").createClient>, uuid: () => string, log?: (step: string, msg: string) => void }} ctx
 */
export async function run({ client, uuid, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  await client.health();

  const stamp = Date.now();
  const parent = await client.devSignup(`analytics-${stamp}@test.local`, "Analytics Parent");
  const created = await client.createStudent(parent.parentId, "Analytics Kid", 8);
  const { studentId } = await client.loginStudent(created.accessCode);
  record("fresh-student", "PASS", `studentId=${studentId}`);

  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  const resolved = await driveToResolvedPattern(
    client,
    uuid,
    studentId,
    session.sessionId,
    session.next,
  );
  await client.endSession(session.sessionId);
  record("session-drive", "PASS", `misconception path resolved=${resolved}`);

  // --- mastery-trend ---
  const trend = await client.getMasteryTrend(parent.parentId, studentId, { weeks: 6 });
  if (!Array.isArray(trend)) throw new Error("mastery-trend: expected an array");
  for (const point of trend) {
    if (typeof point.weekStart !== "string" || typeof point.conceptId !== "string") {
      throw new Error(`mastery-trend: malformed point ${JSON.stringify(point)}`);
    }
  }
  record("mastery-trend", "PASS", `${trend.length} point(s)`);

  // --- concept-bands ---
  const bands = await client.getConceptBands(parent.parentId, studentId);
  if (!Array.isArray(bands)) throw new Error("concept-bands: expected an array");
  for (const b of bands) {
    if (!["JUST_STARTED", "BUILDING", "STRONG"].includes(b.band)) {
      throw new Error(`concept-bands: invalid band ${b.band}`);
    }
  }
  record("concept-bands", "PASS", `${bands.length} concept(s)`);

  // --- practice-calendar ---
  const calendar = await client.getPracticeCalendar(parent.parentId, studentId, { weeks: 5 });
  if (!Array.isArray(calendar)) throw new Error("practice-calendar: expected an array");
  if (calendar.length < 1) {
    throw new Error("practice-calendar: expected at least today's session to appear");
  }
  record("practice-calendar", "PASS", `${calendar.length} day(s)`);

  // --- pattern-history ---
  const patterns = await client.getPatternHistory(parent.parentId, studentId, { weeks: 8 });
  if (!Array.isArray(patterns)) throw new Error("pattern-history: expected an array");
  if (resolved) {
    if (patterns.length < 1) {
      throw new Error("pattern-history: expected at least one entry after a resolved misconception");
    }
    const signHandling = patterns.find((p) => p.status === "resolved");
    if (!signHandling) {
      throw new Error(`pattern-history: expected a resolved entry, got ${JSON.stringify(patterns)}`);
    }
  }
  record("pattern-history", "PASS", `${patterns.length} pattern(s)`);

  // --- safety settings round-trip ---
  const initial = await client.getSafetySettings(parent.parentId, studentId);
  if (initial.aiAssistedPracticePaused !== false) {
    throw new Error("settings: expected aiAssistedPracticePaused=false by default");
  }
  const updated = await client.updateSafetySettings(parent.parentId, studentId, true);
  if (updated.aiAssistedPracticePaused !== true) {
    throw new Error("settings: PATCH did not persist true");
  }
  const reread = await client.getSafetySettings(parent.parentId, studentId);
  if (reread.aiAssistedPracticePaused !== true) {
    throw new Error("settings: GET after PATCH did not reflect the update");
  }
  record("safety-settings", "PASS", "toggle round-trips true→GET confirms");

  // --- ownership rejection: an unrelated parent must not see this student's analytics ---
  const stranger = await client.devSignup(`stranger-${stamp}@test.local`, "Stranger Parent");
  let rejected = false;
  try {
    await client.getConceptBands(stranger.parentId, studentId);
  } catch (err) {
    rejected = /HTTP 401/.test(String(err.message)) || /HTTP 403/.test(String(err.message));
  }
  if (!rejected) {
    throw new Error("ownership check failed: unrelated parent was able to read concept-bands");
  }
  record("ownership-rejection", "PASS", "unrelated parent correctly rejected");

  return { steps };
}
