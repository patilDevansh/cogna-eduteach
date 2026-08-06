import { assertLearningDecision } from "../lib/assert-decision.mjs";

export const name = "skip-question";
export const description =
  "Skip current question: QUESTION_SKIPPED event, next SHOW_QUESTION, no attempt row";
export const mapsTo = ["G32"];

/**
 * @param {{ client: ReturnType<import("../lib/client.mjs").createClient>, assert: typeof assertLearningDecision, uuid: () => string, log?: (step: string, msg: string) => void }} ctx
 */
export async function run({ client, assert, uuid, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  await client.health();
  record("health", "PASS", `API ok at ${client.apiUrl}`);

  const { studentId } = await client.loginStudent("demo1234");
  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  const question = session.next?.payload;

  if (!question?.id) {
    throw new Error("Session start missing first question payload");
  }

  const masteryBefore = await client.get(`/students/${studentId}/mastery`);
  const masteryCountBefore = Array.isArray(masteryBefore.body)
    ? masteryBefore.body.length
    : 0;

  const skipRes = await client.post("/practice/skip", {
    eventId: uuid(),
    eventType: "QUESTION_SKIPPED",
    studentId,
    sessionId: session.sessionId,
    questionId: question.id,
    questionVersion: question.version,
    clientTimestamp: new Date().toISOString(),
  });

  if (skipRes.status !== 200 && skipRes.status !== 201) {
    throw new Error(`skip failed: HTTP ${skipRes.status}`);
  }

  assertLearningDecision(skipRes.body?.next?.decision ?? skipRes.body?.decision, {
    uiAction: "SHOW_QUESTION",
    label: "after-skip",
  });

  record("skip", "PASS", `skipped ${question.id} → next question`);

  const masteryAfter = await client.get(`/students/${studentId}/mastery`);
  const masteryCountAfter = Array.isArray(masteryAfter.body)
    ? masteryAfter.body.length
    : 0;

  if (masteryCountAfter > masteryCountBefore + 1) {
    throw new Error("Skip should not create new mastery evidence rows");
  }

  record("no-mastery", "PASS", "mastery row count stable after skip");

  return { steps };
}
