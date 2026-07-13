import { assertLearningDecision } from "../lib/assert-decision.mjs";

export const name = "session-end-summary";
export const description =
  "End session → student + parent report payloads available via API";
export const mapsTo = ["G41", "G42"];

async function advanceToQuestion(client, { studentId, sessionId, next, uuid }) {
  let current = next;
  let guard = 0;

  while (current?.decision?.uiAction !== "SHOW_QUESTION" && guard < 5) {
    guard++;
    if (current?.decision?.uiAction === "SHOW_EXPLANATION") {
      const viewed = await client.explanationViewed({
        eventId: uuid(),
        eventType: "EXPLANATION_VIEWED",
        studentId,
        sessionId,
        conceptId: current.decision.parameters.conceptId,
        misconceptionId: current.decision.parameters.targetMisconception,
      });
      current = viewed.next ?? viewed;
      continue;
    }
    if (current?.decision?.uiAction === "END_SESSION") {
      return null;
    }
    break;
  }

  return current?.payload?.id ? current.payload : null;
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
  const { studentId } = await client.loginStudent("demo1234");
  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  let question = await advanceToQuestion(client, {
    studentId,
    sessionId: session.sessionId,
    next: session.next,
    uuid,
  });

  if (!question?.id) {
    await client.endSession(session.sessionId);
    const studentReport = await client.getLatestReport(studentId, "STUDENT");
    const parentReport = await client.getLatestReport(studentId, "PARENT");
    record("session-end", "PASS", "ended from explanation-only start");
    record("student-report", "PASS", studentReport.renderedText.slice(0, 80));
    record("parent-report", "PASS", parentReport.renderedText.slice(0, 80));
    return { steps };
  }

  for (let i = 0; i < 2 && question?.id; i++) {
    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId: session.sessionId,
        question,
        submittedAnswer: "1",
      }),
    );
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Answer ${i + 1} failed: HTTP ${res.status}`);
    }
    question = res.body?.next?.payload;
    if (res.body?.decision?.uiAction === "END_SESSION") break;
  }

  const ended = await client.endSession(session.sessionId);
  if (!ended.summaryReportId) {
    throw new Error("Session end missing summaryReportId");
  }
  record("session-end", "PASS", `summaryReportId=${ended.summaryReportId}`);

  const studentReport = await client.getLatestReport(studentId, "STUDENT");
  if (!studentReport.renderedText) {
    throw new Error("Student report missing renderedText");
  }
  record("student-report", "PASS", studentReport.renderedText.slice(0, 80));

  const parentReport = await client.getLatestReport(studentId, "PARENT");
  if (!parentReport.renderedText) {
    throw new Error("Parent report missing renderedText");
  }
  record("parent-report", "PASS", parentReport.renderedText.slice(0, 80));

  return { steps };
}
