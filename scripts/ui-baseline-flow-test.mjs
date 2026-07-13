#!/usr/bin/env node
/**
 * UI-equivalent baseline flow test (API + log monitoring).
 * Mirrors browser path: login → baseline → answer through variable + 12+9.
 */
import { createClient } from "./cogna-cli/lib/client.mjs";
import { uuid } from "./cogna-cli/lib/uuid.mjs";
import { BASELINE_QUESTION_IDS } from "./cogna-cli/lib/contracts.mjs";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const client = createClient();

const log = (step, msg) => console.log(`[${step}] ${msg}`);

function pickAnswer(question) {
  if (question.id === BASELINE_QUESTION_IDS.q1TwelvePlusNine) return "18";
  if (question.id === BASELINE_QUESTION_IDS.q3Variable) return "x";
  if (question.stem?.includes("14 + (-6)")) return "8";
  if (question.stem?.includes("2a + 1")) return "7";
  if (question.type === "MCQ") {
    return question.stem?.includes("variable") ? "x" : "Add 2 to the right";
  }
  return "1";
}

async function main() {
  const results = [];
  const fail = (step, detail) => {
    results.push({ step, status: "FAIL", detail });
    log(step, `FAIL — ${detail}`);
  };
  const pass = (step, detail) => {
    results.push({ step, status: "PASS", detail });
    log(step, `PASS — ${detail}`);
  };

  // Step 0: servers up
  try {
    const web = await fetch(WEB);
    pass("0-web", `HTTP ${web.status}`);
  } catch (e) {
    fail("0-web", String(e));
    process.exit(1);
  }
  try {
    const health = await client.health();
    pass("0-api", `health ok, demo code ${health?.devAccessCode ?? "demo1234"}`);
  } catch (e) {
    fail("0-api", String(e));
    process.exit(1);
  }

  const { studentId } = await client.loginStudent("demo1234");
  pass("1-login", `studentId=${studentId}`);

  const session = await client.startSession(studentId, "BASELINE");
  const sessionId = session.sessionId;
  let q = session.next?.payload;
  pass("2-session", `sessionId=${sessionId} firstQ=${q?.id} stem="${q?.stem?.slice(0, 40)}"`);

  let sawTwelvePlusNine = false;
  let sawVariable = false;
  let step = 0;

  while (q && step < 15) {
    step++;
    const answer = pickAnswer(q);

    if (q.id === BASELINE_QUESTION_IDS.q1TwelvePlusNine) sawTwelvePlusNine = true;
    if (q.id === BASELINE_QUESTION_IDS.q3Variable) sawVariable = true;

    log(`3-submit-${step}`, `POST /practice/answer q=${q.id} answer="${answer}"`);
    const res = await client.submitAnswer(
      client.buildAnswerPayload({
        eventId: uuid(),
        studentId,
        sessionId,
        question: q,
        submittedAnswer: answer,
      }),
    );

    if (res.status >= 500) {
      fail(`3-submit-${step}`, `HTTP ${res.status} ${JSON.stringify(res.body)}`);
      break;
    }
    if (res.status === 503) {
      fail(`3-submit-${step}`, `503 FAILED_RETRYABLE ${JSON.stringify(res.body)}`);
      break;
    }
    if (res.status !== 201) {
      fail(`3-submit-${step}`, `HTTP ${res.status} ${JSON.stringify(res.body)}`);
      break;
    }

    pass(
      `3-submit-${step}`,
      `grade=${res.body.grade} correct=${res.body.isCorrect} next=${res.body.next?.payload?.id ?? "END"}`,
    );

    if (res.body.next?.decision?.uiAction === "END_SESSION") {
      pass("4-end", "session ended by decision");
      break;
    }
    q = res.body.next?.payload;
    if (!q) break;
  }

  try {
    await client.health();
    pass("5-api-alive", `health ok after ${step} submits`);
  } catch (e) {
    fail("5-api-alive", `API died: ${e}`);
  }

  // Thin smoke: critical routes + revision/parent APIs (no engine re-assertions)
  try {
    const revisionRes = await fetch(`${WEB}/student/revision`);
    pass("6-route-revision", `HTTP ${revisionRes.status}`);
  } catch (e) {
    fail("6-route-revision", String(e));
  }

  try {
    const parentRes = await fetch(`${WEB}/parent/login`);
    pass("7-route-parent-login", `HTTP ${parentRes.status}`);
  } catch (e) {
    fail("7-route-parent-login", String(e));
  }

  try {
    const queue = await client.getRevisionQueue(studentId);
    pass("8-revision-api", `queue items=${Array.isArray(queue) ? queue.length : "?"}`);
  } catch (e) {
    fail("8-revision-api", String(e));
  }

  try {
    const parent = await client.devSignup(`smoke-${Date.now()}@test.local`, "Smoke Parent");
    const child = await client.createStudent(parent.parentId, "Smoke Child", 8);
    try {
      const summaryRes = await client.getParentStudentSummary(parent.parentId, child.studentId);
      const hasText = typeof summaryRes?.renderedText === "string";
      pass("9-parent-summary-api", hasText ? "summary payload ok" : "empty summary");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404") && msg.includes("No parent summary")) {
        pass("9-parent-summary-api", "404 empty summary (expected before first session)");
      } else {
        throw e;
      }
    }
  } catch (e) {
    fail("9-parent-summary-api", String(e));
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Saw 12+9 (${BASELINE_QUESTION_IDS.q1TwelvePlusNine}): ${sawTwelvePlusNine}`);
  console.log(`Saw variable (${BASELINE_QUESTION_IDS.q3Variable}): ${sawVariable}`);
  console.log(`Note: 12+9 is baseline Q1; variable is Q3 (not after 12+9)`);
  for (const r of results) {
    console.log(`${r.status} ${r.step}: ${r.detail}`);
  }

  const failed = results.some((r) => r.status === "FAIL");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
