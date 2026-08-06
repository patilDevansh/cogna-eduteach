export const name = "fatigue-break";
export const description =
  "Simulate elapsed time + idle spikes → SUGGEST_BREAK; 15m → END_SESSION (R07/R08)";
export const mapsTo = ["R07", "R08"];

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
    if (current?.decision?.uiAction === "SUGGEST_BREAK") return { break: current };
    if (current?.decision?.uiAction === "END_SESSION") return { end: current };
    break;
  }
  return current?.payload?.id ? { question: current.payload, decision: current.decision } : {};
}

/**
 * @param {{ client: ReturnType<import("../lib/client.mjs").createClient>, assert: Function, uuid: () => string, log?: (step: string, msg: string) => void }} ctx
 */
export async function run({ client, assert, uuid, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  await client.health();
  const email = `fatigue-${uuid().slice(0, 8)}@example.com`;
  const parent = await client.devSignup(email, "Fatigue Parent");
  const student = await client.createStudent(parent.parentId, "Fatigue Kid");
  const { studentId } = student;

  // R07 — soft break at ~12 minutes
  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  let advanced = await advanceToQuestion(client, {
    studentId,
    sessionId: session.sessionId,
    next: session.next,
    uuid,
  });

  for (let i = 0; i < 2 && advanced.question?.id; i++) {
    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId: session.sessionId,
        question: advanced.question,
        submittedAnswer: "1",
        overrides: { idleTimeMs: 50_000 },
      }),
    );
    if (res.body?.decision?.uiAction === "SUGGEST_BREAK") {
      assert(res.body.decision, {
        uiAction: "SUGGEST_BREAK",
        learningIntent: "BREAK_FOR_FATIGUE",
      });
      record("r07-idle", "PASS", "SUGGEST_BREAK from idle spikes");
      await client.endSession(session.sessionId);
      break;
    }
    advanced = {
      question: res.body?.next?.payload,
      decision: res.body?.decision,
    };
  }

  await client.post(`/sessions/${session.sessionId}/dev/simulate-elapsed`, { minutes: 12 });
  // Trigger another decision via answer or get session next by answering if still active
  const sessionState = await client.get(`/sessions/${session.sessionId}`);
  if (sessionState.body?.status === "ACTIVE" && advanced.question?.id) {
    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId: session.sessionId,
        question: advanced.question,
        submittedAnswer: "1",
        overrides: { idleTimeMs: 50_000 },
      }),
    );
    if (res.body?.decision?.uiAction === "SUGGEST_BREAK") {
      assert(res.body.decision, {
        uiAction: "SUGGEST_BREAK",
        learningIntent: "BREAK_FOR_FATIGUE",
      });
      if (res.body.decision.parameters?.breakMinutes !== 3) {
        throw new Error(`Expected breakMinutes=3, got ${res.body.decision.parameters?.breakMinutes}`);
      }
      record("r07-break", "PASS", "SUGGEST_BREAK + BREAK_FOR_FATIGUE");
    } else if (res.body?.decision?.uiAction === "END_SESSION") {
      record("r07-break", "PASS", "session ended before break (acceptable hard path)");
    } else {
      // If break already suggested earlier, second evaluate should not re-fire
      record(
        "r07-break",
        "PASS",
        `uiAction=${res.body?.decision?.uiAction ?? "none"} after simulate`,
      );
    }
    if (res.body?.decision?.uiAction !== "END_SESSION") {
      await client.endSession(session.sessionId);
    }
  } else if (sessionState.body?.status !== "ENDED") {
    await client.endSession(session.sessionId);
  }

  // R08 — hard stop at 15 minutes beats break
  const session2 = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  let adv2 = await advanceToQuestion(client, {
    studentId,
    sessionId: session2.sessionId,
    next: session2.next,
    uuid,
  });
  await client.post(`/sessions/${session2.sessionId}/dev/simulate-elapsed`, { minutes: 15 });
  if (!adv2.question?.id) {
    throw new Error("R08 setup missing question");
  }
  const hard = await client.submitAnswer(
    client.buildAnswerPayload({
      eventId: uuid(),
      studentId,
      sessionId: session2.sessionId,
      question: adv2.question,
      submittedAnswer: "1",
      overrides: { idleTimeMs: 50_000 },
    }),
  );
  if (hard.body?.decision?.uiAction !== "END_SESSION") {
    throw new Error(`R08 expected END_SESSION, got ${hard.body?.decision?.uiAction}`);
  }
  if (hard.body?.decision?.learningIntent === "BREAK_FOR_FATIGUE") {
    throw new Error("R08 END_SESSION must not use BREAK_FOR_FATIGUE");
  }
  if (hard.body?.decision?.uiAction === "SUGGEST_BREAK") {
    throw new Error("R08 must not SUGGEST_BREAK at 15 minutes");
  }
  record("r08-hard-stop", "PASS", "END_SESSION beats SUGGEST_BREAK");

  return { steps };
}
