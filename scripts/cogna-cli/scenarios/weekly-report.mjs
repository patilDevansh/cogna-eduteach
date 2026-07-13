export const name = "weekly-report";
export const description =
  "POST weekly report idempotent; uncertainty language when weak evidence (R11/R17)";
export const mapsTo = ["R11", "R17"];

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
    if (current?.decision?.uiAction === "END_SESSION") return null;
    if (current?.decision?.uiAction === "SUGGEST_BREAK") break;
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
  if (question?.id) {
    await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId: session.sessionId,
        question,
        submittedAnswer: "1",
      }),
    );
  }
  await client.endSession(session.sessionId);
  record("session", "PASS", "short practice + session end");

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const body = {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    requestId: uuid(),
  };

  const first = await client.postWeeklyReport(studentId, body);
  if (!first.reportId) throw new Error("weekly report missing reportId");
  record("weekly-1", "PASS", `reportId=${first.reportId} status=${first.status}`);

  const second = await client.postWeeklyReport(studentId, body);
  if (second.reportId !== first.reportId) {
    throw new Error(`Idempotency failed: ${first.reportId} vs ${second.reportId}`);
  }
  if (second.idempotencyKey !== first.idempotencyKey) {
    throw new Error("idempotencyKey mismatch on duplicate request");
  }
  record("weekly-2", "PASS", "same reportId on duplicate key");

  const report = await client.get(`/students/${studentId}/reports/latest?audience=PARENT`);
  const text = report.body?.renderedText ?? "";
  if (!/still gathering evidence/i.test(text) && !/pattern we are checking/i.test(text)) {
    // Weak evidence path should use cautious language; accept either phrase.
    throw new Error(`Weekly/parent report lacks cautious language: ${text.slice(0, 200)}`);
  }
  record("uncertainty", "PASS", "cautious parent language present");

  return { steps };
}
