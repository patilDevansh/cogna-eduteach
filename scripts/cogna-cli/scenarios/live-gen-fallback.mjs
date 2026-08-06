/**
 * live-gen-fallback — LIVE_AGENTIC_GENERATE shadows but bank is served by default.
 * Asserts session still gets SHOW_QUESTION even when generation is on (serve off).
 */
export const name = "live-gen-fallback";
export const description =
  "With LIVE_AGENTIC_GENERATE shadowed, student still receives bank SHOW_QUESTION";
export const mapsTo = ["live-agentic-shadow"];

export async function run({ client, uuid, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  await client.health();
  const stamp = Date.now();
  const parent = await client.devSignup(`live-gen-${stamp}@test.local`, "Live Gen Parent");
  const created = await client.createStudent(parent.parentId, "Live Gen Child", 8);
  const { studentId } = await client.loginStudent(created.accessCode);

  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  const decision = session.next?.decision;
  if (decision?.uiAction !== "SHOW_QUESTION") {
    throw new Error(`expected SHOW_QUESTION, got ${decision?.uiAction}`);
  }
  if (!session.next?.payload?.id) {
    throw new Error("missing question payload (bank fallback broken)");
  }
  record("bank-or-verified", "PASS", `questionId=${session.next.payload.id}`);

  // Wrong answer must not crash the loop
  const q = session.next.payload;
  const res = await client.submitAnswer(
    client.buildAnswerPayload({
      eventId: uuid(),
      studentId,
      sessionId: session.sessionId,
      question: q,
      submittedAnswer: "0",
    }),
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`submit failed HTTP ${res.status}`);
  }
  record("wrong-answer", "PASS", `grade=${res.body?.grade ?? "?"}`);

  return { steps };
}
