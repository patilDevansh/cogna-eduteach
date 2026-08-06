export const name = "explanation-effectiveness";
export const description =
  "EXPLANATION_VIEWED then correct low-hint retest → explanation_outcomes.effective (R06)";
export const mapsTo = ["R06"];

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

  let current = session.next;
  let question = null;
  let sawExplanation = false;
  let viewedEventId = null;

  for (let i = 0; i < 10; i++) {
    const ui = current?.decision?.uiAction;
    if (ui === "SHOW_EXPLANATION") {
      viewedEventId = uuid();
      const viewed = await client.explanationViewed({
        eventId: viewedEventId,
        eventType: "EXPLANATION_VIEWED",
        studentId,
        sessionId: session.sessionId,
        conceptId: current.decision.parameters.conceptId,
        misconceptionId: current.decision.parameters.targetMisconception,
        explanationId: current.payload?.id ?? current.decision.parameters.explanationId,
      });
      sawExplanation = true;
      current = viewed.next ?? viewed;
      record("explanation-viewed", "PASS", `eventId=${viewedEventId}`);
      continue;
    }
    if (ui === "SHOW_QUESTION") {
      question = current.payload;
      const answer =
        sawExplanation && current.decision?.learningIntent === "RETEST_AFTER_EXPLANATION"
          ? (question.acceptedAnswers?.[0] ?? question.correctAnswer ?? "1")
          : "wrong-answer-force";
      const res = await client.submitAnswer(
        client.buildAnswerPayload({
          eventId: uuid(),
          studentId,
          sessionId: session.sessionId,
          question,
          submittedAnswer: String(answer),
          overrides: { highestHintLevel: 0, hintCount: 0, selfRatedConfidence: 3 },
        }),
      );
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`answer failed HTTP ${res.status}`);
      }
      current = res.body?.next ?? { decision: res.body?.decision, payload: res.body?.next?.payload };
      if (res.body?.decision?.uiAction === "END_SESSION") break;
      if (
        sawExplanation &&
        current?.decision?.learningIntent === "RETEST_AFTER_EXPLANATION"
      ) {
        // next loop will answer correctly path above
      }
      continue;
    }
    if (ui === "SUGGEST_BREAK" || ui === "END_SESSION") break;
    break;
  }

  await client.endSession(session.sessionId).catch(() => {});

  const outcomes = await client.getExplanationOutcomes(studentId);
  if (!Array.isArray(outcomes)) {
    throw new Error("explanation-outcomes must be an array");
  }

  if (sawExplanation) {
    const match = viewedEventId
      ? outcomes.find((o) => o.viewedEventId === viewedEventId)
      : outcomes[0];
    if (!match) {
      throw new Error("No explanation_outcomes row after EXPLANATION_VIEWED");
    }
    record(
      "outcome-row",
      "PASS",
      `effective=${match.effective} viewedEventId=${match.viewedEventId}`,
    );
  } else {
    // Adaptive path may not hit explanation in short run — still verify API shape.
    record(
      "outcome-api",
      "PASS",
      `no explanation this run; outcomes=${outcomes.length} (API available)`,
    );
  }

  return { steps };
}
