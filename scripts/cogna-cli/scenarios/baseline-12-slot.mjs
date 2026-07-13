import { BASELINE_QUESTION_IDS } from "../lib/contracts.mjs";
import { assertLearningDecision, assertAnswerResponse } from "../lib/assert-decision.mjs";

export const name = "baseline-12-slot";
export const description =
  "BASELINE session: fresh student, fixed concept blueprint, 12-slot completion";
export const mapsTo = ["G30", "G30b"];

const { q1TwelvePlusNine, q3Variable } = BASELINE_QUESTION_IDS;
const FIRST_CONCEPT = "P1_INTEGER_ADD_SUB";
const THIRD_CONCEPT = "P3_VARIABLES_CONSTANTS";

function pickAnswer(question) {
  if (question.id === q1TwelvePlusNine) return "21";
  if (question.id === q3Variable) return "x";
  if (question.stem?.includes("14 + (-6)")) return "8";
  if (question.stem?.includes("2a + 1")) return "7";
  if (question.type === "MCQ") {
    return question.stem?.includes("variable") ? "x" : "Add 2 to the right";
  }
  return "1";
}

/**
 * @param {{ client: import("../lib/client.mjs").createClient extends Function ? ReturnType<import("../lib/client.mjs").createClient> : never, assert: typeof assertLearningDecision, uuid: () => string, log?: (step: string, msg: string) => void }} ctx
 */
export async function run({ client, assert, uuid, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  await client.health();
  record("health", "PASS", `API ok at ${client.apiUrl}`);

  const stamp = `${Date.now()}-${uuid().slice(0, 8)}`;
  const parent = await client.devSignup(`baseline-${stamp}@test.local`, "Baseline Parent");
  const created = await client.createStudent(parent.parentId, "Baseline Student", 8);
  const { studentId } = await client.loginStudent(created.accessCode);
  record("fresh-student", "PASS", `studentId=${studentId}`);

  const session = await client.startSession(studentId, "BASELINE");
  const { sessionId } = session;
  let question = session.next?.payload;

  if (!question?.id) {
    throw new Error("Session start missing first question payload");
  }

  assertLearningDecision(session.next?.decision, {
    uiAction: "SHOW_QUESTION",
    learningIntent: "BASELINE_ASSESSMENT",
    label: "session-start",
  });
  record("session-start", "PASS", `sessionId=${sessionId}`);

  if (question.conceptId !== FIRST_CONCEPT) {
    throw new Error(
      `Expected baseline slot 1 concept ${FIRST_CONCEPT}, got ${question.conceptId} question=${question.id}`,
    );
  }
  record("q1-slot", "PASS", `first question ${question.id} concept=${question.conceptId}`);

  let submitStep = 0;
  let sawQ3 = false;
  const maxSteps = 15;

  while (question && submitStep < maxSteps) {
    submitStep++;
    const answer = pickAnswer(question);

    if (submitStep === 3) {
      if (question.conceptId !== THIRD_CONCEPT) {
        throw new Error(
          `Expected baseline slot 3 concept ${THIRD_CONCEPT}, got ${question.conceptId} question=${question.id}`,
        );
      }
      sawQ3 = true;
      record("q3-slot", "PASS", `third question ${question.id} concept=${question.conceptId}`);
    }

    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId,
        question,
        submittedAnswer: answer,
      }),
    );

    const body = assertAnswerResponse(res, {
      label: `submit-${submitStep}`,
    });

    const nextDecision = body.next?.decision;
    const ended = nextDecision?.uiAction === "END_SESSION";

    if (!ended) {
      assert(nextDecision, {
        uiAction: "SHOW_QUESTION",
        learningIntent: "BASELINE_ASSESSMENT",
        label: `after-submit-${submitStep}`,
      });
    }

    record(
      `submit-${submitStep}`,
      "PASS",
      `q=${question.id} grade=${body.grade} correct=${body.isCorrect} next=${body.next?.payload?.id ?? "END"}`,
    );

    if (ended) {
      assert(nextDecision, {
        uiAction: "END_SESSION",
        learningIntent: "BASELINE_ASSESSMENT",
        label: "session-end",
      });
      record("session-end", "PASS", `ended after ${submitStep} submits`);
      break;
    }

    question = body.next?.payload;
    if (!question) break;
  }

  if (!sawQ3) {
    throw new Error(`Never saw baseline slot 3 concept ${THIRD_CONCEPT}`);
  }

  if (submitStep !== 12) {
    throw new Error(`Expected session to end after 12 submits, got ${submitStep}`);
  }

  await client.health();
  record("health-after", "PASS", `API alive after ${submitStep} submits`);

  return { pass: true, steps };
}
