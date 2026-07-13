#!/usr/bin/env node
/**
 * UI-equivalent baseline flow test (API + log monitoring).
 * Mirrors browser path: login → baseline → answer through variable + 12+9.
 */
const API = process.env.API_URL ?? "http://localhost:3001";
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const uuid = () => crypto.randomUUID();

const log = (step, msg) => console.log(`[${step}] ${msg}`);

async function get(path) {
  const r = await fetch(`${API}${path}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function post(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let bodyJson;
  try {
    bodyJson = JSON.parse(text);
  } catch {
    bodyJson = text;
  }
  return { status: r.status, body: bodyJson };
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
    const health = await get("/health");
    if (health.status !== 200) fail("0-api", `health ${health.status}`);
    else pass("0-api", `health ok, demo code ${health.body?.devAccessCode}`);
  } catch (e) {
    fail("0-api", String(e));
    process.exit(1);
  }

  // Step 1: login (same as UI)
  const login = await post("/auth/student/login", { accessCode: "demo1234" });
  if (login.status !== 201 && login.status !== 200) {
    fail("1-login", `status ${login.status} ${JSON.stringify(login.body)}`);
    process.exit(1);
  }
  const studentId = login.body.studentId;
  pass("1-login", `studentId=${studentId}`);

  // Step 2: start BASELINE session
  const session = await post("/sessions", { studentId, sessionMode: "BASELINE" });
  if (session.status !== 201) {
    fail("2-session", `status ${session.status}`);
    process.exit(1);
  }
  const sessionId = session.body.sessionId;
  let q = session.body.next?.payload;
  pass("2-session", `sessionId=${sessionId} firstQ=${q?.id} stem="${q?.stem?.slice(0, 40)}"`);

  const targets = {
    variable: "Q_P3_D1_001",
    twelvePlusNine: "Q_P1_D1_001",
  };

  let sawTwelvePlusNine = false;
  let sawVariable = false;
  let step = 0;

  while (q && step < 15) {
    step++;
    let answer;
    if (q.id === targets.twelvePlusNine) {
      sawTwelvePlusNine = true;
      answer = "18";
    } else if (q.id === targets.variable) {
      sawVariable = true;
      answer = "x";
    } else if (q.stem?.includes("14 + (-6)")) answer = "8";
    else if (q.stem?.includes("2a + 1")) answer = "7";
    else if (q.type === "MCQ") answer = q.stem?.includes("variable") ? "x" : "Add 2 to the right";
    else answer = "1";

    log(`3-submit-${step}`, `POST /practice/answer q=${q.id} answer="${answer}"`);
    const res = await post("/practice/answer", {
      eventId: uuid(),
      eventType: "ANSWER_SUBMITTED",
      studentId,
      sessionId,
      questionId: q.id,
      questionVersion: q.version,
      submittedAnswer: answer,
      timeToFirstResponseMs: 200,
      totalTimeMs: 3000,
      idleTimeMs: 0,
      attemptNumber: 1,
      hintCount: 0,
      highestHintLevel: 0,
      selfRatedConfidence: 3,
      answerChangedBeforeSubmit: false,
      clientTimestamp: new Date().toISOString(),
    });

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

  // Verify health after flow
  try {
    const healthAfter = await get("/health");
    pass("5-api-alive", `health ${healthAfter.status} after ${step} submits`);
  } catch (e) {
    fail("5-api-alive", `API died: ${e}`);
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Saw 12+9 (Q_P1_D1_001): ${sawTwelvePlusNine}`);
  console.log(`Saw variable (Q_P3_D1_001): ${sawVariable}`);
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
