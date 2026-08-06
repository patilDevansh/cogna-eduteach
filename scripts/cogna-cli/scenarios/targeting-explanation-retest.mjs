import { assertAnswerResponse, assertLearningDecision } from "../lib/assert-decision.mjs";

export const name = "targeting-explanation-retest";
export const description =
  "C2 sign-handling: TARGET_MISCONCEPTION → SHOW_EXPLANATION → RETEST_AFTER_EXPLANATION (G10–G11)";
export const mapsTo = ["G10", "G11"];

/** Wrong answer that matches SIGN_HANDLING pattern on C2 subtraction items. */
const SIGN_WRONG = "4";

function wrongAnswerFor(question) {
  if (question?.conceptId === "C2_ONE_STEP_SUBTRACTION" || question?.id?.startsWith("Q_C2")) {
    return SIGN_WRONG;
  }
  return "0";
}

/** Known correct answers for milestone C2 items (API strips acceptedAnswers from student payload). */
const CORRECT_BY_ID = {
  Q_C2_D2_001: "18",
  Q_C2_D2_002: "16",
  Q_C2_D2_003: "17",
  Q_C2_D1_001: "13",
  Q_C2_D3_001: "16",
  Q_C2_D4_001: "20",
};

function correctAnswerFor(question) {
  if (question?.id && CORRECT_BY_ID[question.id]) {
    return CORRECT_BY_ID[question.id];
  }
  const accepted = question?.acceptedAnswers;
  if (Array.isArray(accepted) && accepted.length > 0) return accepted[0];
  return "1";
}

async function advanceToQuestion(client, { studentId, sessionId, next, uuid }) {
  let current = next;
  let guard = 0;

  while (current?.decision?.uiAction !== "SHOW_QUESTION" && guard < 5) {
    guard++;
    if (current?.decision?.uiAction === "SHOW_EXPLANATION") {
      return { question: null, explanation: current.decision };
    }
    if (current?.decision?.uiAction === "END_SESSION") {
      return { question: null, explanation: null };
    }
    break;
  }

  return {
    question: current?.payload?.id ? current.payload : null,
    explanation: null,
  };
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
  const parent = await client.devSignup(`scenario-${stamp}@test.local`, "Scenario Parent");
  const created = await client.createStudent(parent.parentId, "Remediation Test", 8);
  const { studentId } = await client.loginStudent(created.accessCode);
  record("fresh-student", "PASS", `studentId=${studentId}`);

  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  let { question, explanation } = await advanceToQuestion(client, {
    studentId,
    sessionId: session.sessionId,
    next: session.next,
    uuid,
  });

  if (explanation) {
    record("explanation-at-start", "PASS", "already in EXPLANATION_REQUIRED");
  }

  let sawTargeting = false;
  let explanationDecision = explanation;

  for (let i = 0; i < 12 && question && !explanationDecision; i++) {
    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId: session.sessionId,
        question,
        submittedAnswer: wrongAnswerFor(question),
        overrides: { selfRatedConfidence: 5 },
      }),
    );

    assertAnswerResponse(res);
    const decision = res.body.decision;

    if (
      decision.learningIntent === "TARGET_MISCONCEPTION" &&
      decision.uiAction === "SHOW_QUESTION"
    ) {
      sawTargeting = true;
      record("targeting", "PASS", `attempt ${i + 1} → TARGET_MISCONCEPTION`);
    }

    if (decision.uiAction === "SHOW_EXPLANATION") {
      explanationDecision = decision;
      record("explanation-required", "PASS", `after ${i + 1} wrong answer(s)`);
      break;
    }

    if (res.body.next?.decision?.uiAction === "SHOW_EXPLANATION") {
      explanationDecision = res.body.next.decision;
      record("explanation-required", "PASS", `next payload is SHOW_EXPLANATION`);
      break;
    }

    question = res.body.next?.payload;
  }

  if (!sawTargeting && !explanationDecision) {
    throw new Error("Never entered TARGET_MISCONCEPTION targeting path");
  }
  if (!explanationDecision) {
    throw new Error("Never reached SHOW_EXPLANATION (G10)");
  }

  assertLearningDecision(explanationDecision, {
    uiAction: "SHOW_EXPLANATION",
    learningIntent: "TARGET_MISCONCEPTION",
    params: { conceptId: "C2_ONE_STEP_SUBTRACTION" },
    label: "G10",
  });

  const viewed = await client.explanationViewed({
    eventId: uuid(),
    eventType: "EXPLANATION_VIEWED",
    studentId,
    sessionId: session.sessionId,
    conceptId: explanationDecision.parameters.conceptId,
    misconceptionId: explanationDecision.parameters.targetMisconception,
  });

  assertLearningDecision(viewed.next?.decision, {
    uiAction: "SHOW_QUESTION",
    learningIntent: "RETEST_AFTER_EXPLANATION",
    label: "G11",
  });
  record("retest-decision", "PASS", viewed.next.decision.learningIntent);

  const retestQuestion = viewed.next?.payload;
  if (!retestQuestion?.id) {
    throw new Error("RETEST_AFTER_EXPLANATION missing question payload");
  }

  const retestRes = await client.submitAnswer(
    client.buildAnswerPayload({
      eventId: uuid(),
      studentId,
      sessionId: session.sessionId,
      question: retestQuestion,
      submittedAnswer: correctAnswerFor(retestQuestion),
      overrides: { selfRatedConfidence: 4, hintCount: 0, highestHintLevel: 0 },
    }),
  );

  assertAnswerResponse(retestRes);
  if (!retestRes.body.isCorrect) {
    throw new Error(`Re-test answer marked incorrect for ${retestQuestion.id}`);
  }
  record("retest-correct", "PASS", `grade=${retestRes.body.grade}`);

  return { steps };
}
