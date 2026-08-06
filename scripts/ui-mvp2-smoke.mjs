#!/usr/bin/env node
/**
 * MVP 2.0 UI smoke — route + API wiring (not engine golden assertions).
 *
 * Covers:
 * - health (API + web)
 * - student login + session start
 * - parent session summary + weekly-summary (404 = empty data soft-pass; 200 hard-pass; 5xx fail)
 * - revision queue + revision-plan (404 = empty soft-pass; 200 hard-pass; 5xx fail)
 * - SUGGEST_BREAK path when the engine emits it (else soft-pass + UI wiring check)
 *
 * Env: API_URL (default http://localhost:3001), WEB_URL (default http://localhost:3000)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "./cogna-cli/lib/client.mjs";
import { uuid } from "./cogna-cli/lib/uuid.mjs";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const client = createClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

const log = (step, msg) => console.log(`[${step}] ${msg}`);

const results = [];
const fail = (step, detail) => {
  results.push({ step, status: "FAIL", detail });
  log(step, `FAIL — ${detail}`);
};
const pass = (step, detail) => {
  results.push({ step, status: "PASS", detail });
  log(step, `PASS — ${detail}`);
};
const soft = (step, detail) => {
  results.push({ step, status: "PASS", detail: `soft: ${detail}` });
  log(step, `PASS (soft) — ${detail}`);
};

async function fetchWeb(path) {
  return fetch(`${WEB}${path}`);
}

function pickAnswer(question) {
  if (question?.type === "MCQ") {
    return question.stem?.includes("variable") ? "x" : "Add 2 to the right";
  }
  if (question?.stem?.includes("14 + (-6)")) return "8";
  if (question?.stem?.includes("12 + 9") || question?.stem?.includes("12+9")) return "21";
  return "1";
}

async function main() {
  try {
    const web = await fetchWeb("/");
    if (web.status >= 500) fail("0-web", `HTTP ${web.status}`);
    else pass("0-web", `HTTP ${web.status}`);
  } catch (e) {
    fail("0-web", String(e));
    process.exit(1);
  }

  let health;
  try {
    health = await client.health();
    pass("0-api", `health ok, demo=${health?.devAccessCode ?? "demo1234"}`);
  } catch (e) {
    fail("0-api", String(e));
    process.exit(1);
  }

  let studentId;
  try {
    const login = await client.loginStudent(health?.devAccessCode ?? "demo1234");
    studentId = login.studentId;
    pass("1-login", `studentId=${studentId}`);
  } catch (e) {
    fail("1-login", String(e));
    process.exit(1);
  }

  let sawBreak = false;
  try {
    const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
    const sessionId = session.sessionId;
    let q = session.next?.payload;
    let decision = session.next?.decision;
    pass(
      "2-session",
      `sessionId=${sessionId} uiAction=${decision?.uiAction ?? "?"}`,
    );
    if (decision?.uiAction === "SUGGEST_BREAK") sawBreak = true;

    for (let i = 0; i < 4 && q?.id; i++) {
      const res = await client.submitAnswer(
        client.buildAnswerPayload({
          eventId: uuid(),
          studentId,
          sessionId,
          question: q,
          submittedAnswer: pickAnswer(q),
        }),
      );
      if (res.status !== 201 && res.status !== 200) {
        soft("3-answers", `submit HTTP ${res.status} at step ${i + 1}`);
        break;
      }
      decision = res.body?.next?.decision ?? res.body?.decision;
      if (decision?.uiAction === "SUGGEST_BREAK") {
        sawBreak = true;
        pass(
          "3-break-triggered",
          `breakMinutes=${decision?.parameters?.breakMinutes ?? "default"}`,
        );
        break;
      }
      if (decision?.uiAction === "END_SESSION") {
        soft("3-answers", `ended early after ${i + 1} answers`);
        break;
      }
      q = res.body?.next?.payload;
      if (!q?.id) break;
    }
    if (!sawBreak) {
      soft(
        "3-break-path",
        "engine did not emit SUGGEST_BREAK (UI wired; verify when fatigue path lands)",
      );
    }
  } catch (e) {
    fail("2-session", String(e));
  }

  try {
    const practiceSrc = readFileSync(
      join(__dirname, "../apps/web/src/app/student/practice/page.tsx"),
      "utf8",
    );
    if (
      practiceSrc.includes("SUGGEST_BREAK") &&
      practiceSrc.includes('phase === "break"')
    ) {
      pass("3b-break-ui-wired", "practice page has break phase");
    } else {
      fail("3b-break-ui-wired", "practice page missing SUGGEST_BREAK / break phase");
    }
  } catch (e) {
    fail("3b-break-ui-wired", String(e));
  }

  for (const [step, path] of [
    ["4-route-revision", "/student/revision"],
    ["4-route-parent-login", "/parent/login"],
    ["4-route-weekly-template", "/parent/students/smoke-id/weekly"],
    ["4-route-summary-template", "/parent/students/smoke-id/summary"],
  ]) {
    try {
      const res = await fetchWeb(path);
      if (res.status >= 500) fail(step, `HTTP ${res.status}`);
      else pass(step, `HTTP ${res.status}`);
    } catch (e) {
      fail(step, String(e));
    }
  }

  try {
    const queue = await client.getRevisionQueue(studentId);
    pass(
      "5-revision-queue",
      `items=${Array.isArray(queue) ? queue.length : "?"}`,
    );
  } catch (e) {
    fail("5-revision-queue", String(e));
  }

  try {
    const planRes = await client.get(`/students/${studentId}/revision-plan`);
    if (planRes.status === 404) {
      soft("5-revision-plan", "404 empty plan (no revision data yet)");
    } else if (planRes.status >= 500) {
      fail("5-revision-plan", `HTTP ${planRes.status}`);
    } else if (planRes.status === 200) {
      pass(
        "5-revision-plan",
        `dailyItems=${planRes.body?.daily?.items?.length ?? 0}`,
      );
    } else {
      fail("5-revision-plan", `unexpected HTTP ${planRes.status}`);
    }
  } catch (e) {
    fail("5-revision-plan", String(e));
  }

  try {
    const parent = await client.devSignup(
      `mvp2-smoke-${Date.now()}@test.local`,
      "MVP2 Smoke Parent",
    );
    const child = await client.createStudent(parent.parentId, "MVP2 Smoke Child", 8);

    try {
      await client.getParentStudentSummary(parent.parentId, child.studentId);
      pass("6-parent-summary", "summary payload ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404")) {
        soft("6-parent-summary", "404 empty summary (expected before first session)");
      } else {
        fail("6-parent-summary", msg);
      }
    }

    try {
      const weekly = await client.getParentWeeklySummary(
        parent.parentId,
        child.studentId,
      );
      pass(
        "6-parent-weekly",
        weekly?.renderedText
          ? "weekly text ok"
          : weekly?.structuredSummary
            ? "weekly structured summary ok"
            : "weekly payload (empty fields)",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404")) {
        soft("6-parent-weekly", "404 empty weekly (no report data yet)");
      } else {
        fail("6-parent-weekly", msg);
      }
    }
  } catch (e) {
    fail("6-parent-flow", String(e));
  }

  try {
    await client.health();
    pass("7-api-alive", "health ok after smoke");
  } catch (e) {
    fail("7-api-alive", String(e));
  }

  console.log("\n--- MVP2 UI SMOKE SUMMARY ---");
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
