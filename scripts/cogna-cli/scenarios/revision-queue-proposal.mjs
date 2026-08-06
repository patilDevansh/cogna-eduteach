export const name = "revision-queue-proposal";
export const description =
  "SESSION_ENDED → recommendation proposals may appear in revision queue";
export const mapsTo = ["G40"];

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

  const before = await client.getRevisionQueue(studentId);
  const beforeCount = Array.isArray(before) ? before.length : 0;
  record("queue-before", "PASS", `${beforeCount} pending/in-progress item(s)`);

  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  let question = await advanceToQuestion(client, {
    studentId,
    sessionId: session.sessionId,
    next: session.next,
    uuid,
  });

  for (let i = 0; i < 3 && question?.id; i++) {
    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId: session.sessionId,
        question,
        submittedAnswer: "wrong-answer",
        overrides: { selfRatedConfidence: 2 },
      }),
    );
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Answer ${i + 1} failed: HTTP ${res.status}`);
    }
    question = res.body?.next?.payload;
    if (res.body?.decision?.uiAction === "END_SESSION") break;
  }

  const ended = await client.endSession(session.sessionId);
  record(
    "session-end",
    "PASS",
    `revisionProposed=${ended.revisionProposed} created=${ended.revisionItemsCreated ?? 0}`,
  );

  const after = await client.getRevisionQueue(studentId);
  if (!Array.isArray(after)) {
    throw new Error("Revision queue response must be an array");
  }
  record("queue-after", "PASS", `${after.length} pending/in-progress item(s)`);

  if (ended.revisionProposed && after.length === 0) {
    throw new Error("revisionProposed=true but revision queue is empty");
  }

  return { steps };
}
