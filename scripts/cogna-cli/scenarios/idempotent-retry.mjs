import { assertAnswerResponse } from "../lib/assert-decision.mjs";

export const name = "idempotent-retry";
export const description = "Duplicate eventId over HTTP returns stored answer response (G20)";
export const mapsTo = ["G20"];

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
  const question = await advanceToQuestion(client, {
    studentId,
    sessionId: session.sessionId,
    next: session.next,
    uuid,
  });

  if (!question?.id) {
    throw new Error("Could not reach a question for idempotency test");
  }

  const eventId = uuid();
  const payload = client.buildAnswerPayload({
    eventId,
    studentId,
    sessionId: session.sessionId,
    question,
    submittedAnswer: "1",
  });

  const first = await client.submitAnswer(payload);
  assertAnswerResponse(first);
  record("first-submit", "PASS", `attemptId=${first.body?.attemptId}`);

  const second = await client.submitAnswer(payload);
  assertAnswerResponse(second);
  record("retry-submit", "PASS", `attemptId=${second.body?.attemptId}`);

  if (first.body?.attemptId !== second.body?.attemptId) {
    throw new Error("Idempotent retry returned a different attemptId");
  }
  if (first.body?.grade !== second.body?.grade) {
    throw new Error("Idempotent retry returned a different grade");
  }

  return { steps };
}
