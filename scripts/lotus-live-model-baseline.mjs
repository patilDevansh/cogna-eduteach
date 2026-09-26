#!/usr/bin/env node
/**
 * Lotus factorisation — live-model performance baseline
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md, "Outstanding before Phase 4 can
 * be declared complete").
 *
 * Drives the real student UI and real HTTP API end to end, against the
 * REAL, configured OpenAI-backed model service — no fake model. This
 * spends real provider budget; only run it with explicit authorization.
 *
 * Unlike scripts/lotus-factorisation-playwright.mjs (which proves wiring
 * correctness with a free, deterministic fake model and only optionally
 * exercises the live model for a quick smoke), this script's whole purpose
 * is to gather a representative timing sample: queue age, model duration,
 * and recommendation-to-install time, with p50/p95 across many real
 * reviews, not just a five-review anecdote.
 *
 * It does NOT track dollar cost — the product has no cost-telemetry field
 * yet (see the diagnostic doc's outstanding-work list) — only call counts
 * and durations, which is an honest limit on what this baseline can claim.
 *
 * Spawns its own isolated API + web dev servers on dedicated ports and
 * tears them down afterwards. Uses the shared local Postgres. Every session
 * it creates uses a randomized demo_baseline_* student id and is left in
 * place like other local dev data.
 *
 * Usage: node scripts/lotus-live-model-baseline.mjs
 * Env: LOTUS_BASELINE_SESSIONS (default 3), LOTUS_BASELINE_TURNS (default 12,
 *      turns answered per session including Q1), LOTUS_E2E_API_PORT (3098),
 *      LOTUS_E2E_WEB_PORT (3097), LOTUS_BASELINE_DRAIN_TIMEOUT_MS (300000).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const API_PORT = process.env.LOTUS_E2E_API_PORT || "3098";
const WEB_PORT = process.env.LOTUS_E2E_WEB_PORT || "3097";
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SESSIONS = Number(process.env.LOTUS_BASELINE_SESSIONS || "3");
const TURNS = Number(process.env.LOTUS_BASELINE_TURNS || "12");
const DRAIN_TIMEOUT_MS = Number(process.env.LOTUS_BASELINE_DRAIN_TIMEOUT_MS || "300000");

const log = (step, msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] [${step}] ${msg}`);

function spawnServer(name, args, env) {
  const child = spawn("pnpm", args, { cwd: REPO_ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let buffer = "";
  child.stdout.on("data", (chunk) => { buffer += chunk.toString(); });
  child.stderr.on("data", (chunk) => { buffer += chunk.toString(); });
  child.getLog = () => buffer.slice(-4000);
  child.on("exit", (code) => { if (code && code !== null) log(name, `process exited early with code ${code}`); });
  return child;
}

function killServerGroup(child) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
}

async function waitForReady(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

async function loginAsDemoStudent(page, studentId, name) {
  await page.goto(`${WEB_URL}/student/login`, { waitUntil: "domcontentloaded" });
  const minted = await page.evaluate(async ({ studentId, name }) => {
    const res = await fetch("/api/session/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, name }),
    });
    if (!res.ok) throw new Error(`mint failed: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  }, { studentId, name });
  await page.evaluate((record) => { localStorage.setItem("cogna_student", JSON.stringify(record)); }, minted);
}

async function expectEnabled(locator, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await locator.isEnabled().catch(() => false)) return;
    await sleep(250);
  }
  throw new Error("element never became enabled");
}

/**
 * The session id never appears in the URL (the page keeps it in React state,
 * not routing), so it's captured off the network response that creates the
 * session — the same technique the wiring suite uses to inspect traffic —
 * rather than guessed from page.url().
 */
async function startFactorisation(page, label) {
  const t0 = Date.now();
  let sessionId = null;
  const captureSessionId = (res) => {
    if (sessionId || !res.url().includes("/api/lotus/sessions") || res.request().method() !== "POST") return;
    res.json().then((json) => { if (json?.sessionId) sessionId = json.sessionId; }).catch(() => {});
  };
  page.on("response", captureSessionId);
  try {
    await page.goto(`${WEB_URL}/student/lotus?topic=factorisation`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const startButton = page.getByRole("button", { name: /^Start for/ });
    await expectEnabled(startButton, 30_000);
    await startButton.click({ timeout: 30_000 });
    // The start response is usually captured within the same tick the button
    // click resolves, but give it a moment in case the event fires just after.
    for (let i = 0; i < 20 && !sessionId; i += 1) await sleep(100);
    try {
      // Live question-writing has its own 45s SDK timeout per call; the prep
      // gate can legitimately take several minutes for a real model.
      await page.getByPlaceholder(/Type your answer/).waitFor({ state: "visible", timeout: 300_000 });
    } catch (e) {
      // The session was already created server-side (real billed calls
      // already happened) even though the browser never saw Q1 — attach the
      // id so the caller can still register it for telemetry rather than
      // silently discarding everything that was already generated and paid
      // for. A prep-gate timeout this severe is itself a real finding.
      if (sessionId) e.sessionId = sessionId;
      throw e;
    }
    log(label, `Q1 ready after ${((Date.now() - t0) / 1000).toFixed(1)}s prep (includes live question-writing)`);
    if (!sessionId) throw new Error("could not capture sessionId from the session-creation response");
    return sessionId;
  } finally {
    page.off("response", captureSessionId);
  }
}

/**
 * Handles both question kinds so a session can actually progress through the
 * full turn range instead of stalling at the first CHOICE-kind slot (which
 * has no text input) — the wiring suite's own scenarios only submit text and
 * don't need to advance far, but a representative timing sample does.
 */
async function submitAnyAnswerAndWaitForTurn(page, textAnswer, turn, timeoutMs = 60_000) {
  const textInput = page.getByPlaceholder(/Type your answer/);
  if (await textInput.isVisible().catch(() => false)) {
    await textInput.fill(textAnswer);
  } else {
    await page.locator('input[name="lotus-answer"]').first().check();
  }
  await page.getByRole("button", { name: /Submit answer/ }).click();
  await page.getByText(new RegExp(`^Question ${turn} of 25$`)).first().waitFor({ state: "visible", timeout: timeoutMs });
}

/** Reads the current session view via the same route the browser uses, for telemetry extraction. */
/**
 * lotusFetch (apps/web/src/lib/api.ts) attaches X-Cogna-Student-Id/-Token
 * from the cogna_student localStorage record on every real call — a plain
 * unauthenticated fetch here got a silent 401 that the original version of
 * this function swallowed via `if (!res.ok) return null`, producing a
 * "0 total audits" report even though real, billed reviews had happened.
 * Replicated here rather than guessed at, matching cognaAuthHeaders exactly.
 */
async function fetchSessionView(page, sessionId) {
  return page.evaluate(async (id) => {
    const headers = { "Content-Type": "application/json" };
    try {
      const raw = localStorage.getItem("cogna_student");
      if (raw) {
        const student = JSON.parse(raw);
        if (student.studentId && student.token) {
          headers["X-Cogna-Role"] = "student";
          headers["X-Cogna-Student-Id"] = student.studentId;
          headers["X-Cogna-Student-Token"] = student.token;
        }
      }
    } catch { /* ignore malformed student session */ }
    const res = await fetch(`/api/lotus/sessions/${id}`, { headers });
    if (!res.ok) return { __error: `HTTP ${res.status} ${await res.text().catch(() => "")}` };
    return res.json();
  }, sessionId);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label, valuesMs) {
  const clean = valuesMs.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (clean.length === 0) { log("summary", `${label}: no samples`); return; }
  const p50 = percentile(clean, 50);
  const p95 = percentile(clean, 95);
  const mean = clean.reduce((s, v) => s + v, 0) / clean.length;
  log("summary", `${label}: n=${clean.length} mean=${(mean / 1000).toFixed(2)}s p50=${(p50 / 1000).toFixed(2)}s p95=${(p95 / 1000).toFixed(2)}s min=${(clean[0] / 1000).toFixed(2)}s max=${(clean[clean.length - 1] / 1000).toFixed(2)}s`);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    log("playwright", "playwright package not installed — run pnpm add -Dw playwright");
    process.exit(1);
  }

  log("setup", `starting isolated api:${API_PORT} (LIVE model) and web:${WEB_PORT}`);
  const apiProc = spawnServer("api", ["--filter", "@cogna/api", "dev"], { PORT: API_PORT, LOTUS_E2E_FAKE_MODEL: "false" });
  const webProc = spawnServer("web", ["--filter", "@cogna/web", "dev"], { PORT: WEB_PORT, NEXT_PUBLIC_API_URL: API_URL, API_URL });

  const outcome = { sessions: [], failures: [] };
  try {
    const apiReady = await waitForReady(`${API_URL}/lotus/status`, 90_000);
    if (!apiReady) { console.error(`api did not become ready\n${apiProc.getLog()}`); process.exit(1); }
    const webReady = await waitForReady(WEB_URL, 90_000);
    if (!webReady) { console.error(`web did not become ready\n${webProc.getLog()}`); process.exit(1); }
    log("setup", "api and web ready");

    const browser = await chromium.launch({ headless: true });
    try {
      const runId = randomUUID().replace(/-/g, "").slice(0, 8);
      log("plan", `${SESSIONS} session(s), ${TURNS} turn(s) each, live model — this will make real, billed OpenAI calls`);

      const pages = await Promise.all(
        Array.from({ length: SESSIONS }, (_, i) => browser.newPage()),
      );

      // Sessions run concurrently, like real independent students, so the
      // queue-depth/contention this baseline measures reflects real load,
      // not one student at a time.
      await Promise.all(pages.map(async (page, i) => {
        const label = `session-${i + 1}`;
        const studentId = `demo_baseline_${runId}_${i}`;
        let sessionId = null;
        try {
          await loginAsDemoStudent(page, studentId, `Baseline ${i + 1}`);
          sessionId = await startFactorisation(page, label);
          // Registered only now, after prep, so we don't push a session with
          // zero telemetry into the report if even startFactorisation fails.
          outcome.sessions.push({ label, studentId, page, sessionId }); log(label, `sessionId: ${sessionId}`);
          for (let turn = 2; turn <= TURNS; turn += 1) {
            const t0 = Date.now();
            await submitAnyAnswerAndWaitForTurn(page, turn % 3 === 0 ? "1" : "2x+3", turn);
            log(label, `turn ${turn} rendered after ${Date.now() - t0}ms (student-facing latency, not review time)`);
          }
        } catch (e) {
          // A partial failure (e.g. an unhandled question shape at some turn,
          // or startFactorisation itself timing out on Q1) still leaves real,
          // already-generated server-side telemetry behind for every turn
          // reached so far. If the session was registered above, it stays in
          // outcome.sessions so the drain/summary phase still reads it. If
          // startFactorisation itself failed before registering, but still
          // captured a sessionId (the session was created server-side, real
          // calls already happened), register it now rather than discarding
          // everything that was already generated and paid for.
          if (!sessionId && e.sessionId) {
            sessionId = e.sessionId;
            outcome.sessions.push({ label, studentId, page, sessionId }); log(label, `sessionId: ${sessionId}`);
          }
          outcome.failures.push({ label, error: String(e).slice(0, 300) });
          log(label, `stopped early: ${String(e).slice(0, 200)}`);
          log(label, `recent api server log:\n${apiProc.getLog().split("\n").slice(-25).join("\n")}`);
        }
      }));

      log("drain", `waiting up to ${DRAIN_TIMEOUT_MS / 1000}s for all background reviews to complete...`);
      const drainStart = Date.now();
      let allDrained = false;
      let lastViews = new Map();
      while (Date.now() - drainStart < DRAIN_TIMEOUT_MS) {
        let pending = 0;
        for (const s of outcome.sessions) {
          if (!s.sessionId) continue;
          let view;
          try {
            view = await fetchSessionView(s.page, s.sessionId);
          } catch (e) {
            // A page-level error (e.g. dev-server HMR triggering a full
            // reload mid-evaluate, "Execution context was destroyed") must
            // not crash the whole run and lose every already-completed
            // review's telemetry — skip this session for this round only,
            // and count whatever it last reported as still pending so the
            // loop keeps retrying rather than declaring a false drain.
            log("drain", `${s.label}: page.evaluate failed this round — ${String(e).slice(0, 150)}`);
            const prior = lastViews.get(s.label);
            pending += prior ? (prior.audits ?? []).filter((a) => a.analysisStatus === "PENDING").length : 1;
            continue;
          }
          if (!view || view.__error) {
            if (view?.__error) log("drain", `${s.label}: fetch failed — ${view.__error}`);
            const prior = lastViews.get(s.label);
            pending += prior ? (prior.audits ?? []).filter((a) => a.analysisStatus === "PENDING").length : 1;
            continue;
          }
          lastViews.set(s.label, view);
          pending += (view.audits ?? []).filter((a) => a.analysisStatus === "PENDING").length;
        }
        log("drain", `${pending} review(s) still pending across ${outcome.sessions.length} session(s)`);
        if (pending === 0) { allDrained = true; break; }
        await sleep(5000);
      }
      if (!allDrained) log("drain", "timed out with reviews still pending — reporting on what completed anyway");

      const queueAgeMs = [];
      const modelDurationMs = [];
      const totalReviewMs = [];
      const recommendToInstallMs = [];
      let totalAudits = 0;
      let completedReviews = 0;
      let failedReviews = 0;

      for (const [label, view] of lastViews) {
        for (const audit of view.audits ?? []) {
          totalAudits += 1;
          if (audit.analysisStatus === "COMPLETE") {
            completedReviews += 1;
            if (audit.analysisQueuedAt && audit.analysisStartedAt) {
              queueAgeMs.push(Date.parse(audit.analysisStartedAt) - Date.parse(audit.analysisQueuedAt));
            }
            if (audit.analysisStartedAt && audit.analysisCompletedAt) {
              modelDurationMs.push(Date.parse(audit.analysisCompletedAt) - Date.parse(audit.analysisStartedAt));
            }
            if (audit.analysisQueuedAt && audit.analysisCompletedAt) {
              totalReviewMs.push(Date.parse(audit.analysisCompletedAt) - Date.parse(audit.analysisQueuedAt));
            }
          } else if (audit.analysisStatus === "FAILED") {
            failedReviews += 1;
          }
          const d = audit.adaptiveDecision;
          if (d?.recommendedAt && d?.installedAt) {
            recommendToInstallMs.push(Date.parse(d.installedAt) - Date.parse(d.recommendedAt));
          }
        }
      }

      console.log("\n===== Lotus live-model performance baseline =====");
      console.log(`Sessions attempted: ${SESSIONS}, completed setup+turns: ${outcome.sessions.length}, failed mid-flow: ${outcome.failures.length}`);
      console.log(`Total audits observed: ${totalAudits}, reviews COMPLETE: ${completedReviews}, reviews FAILED: ${failedReviews}, drained cleanly: ${allDrained}`);
      summarize("queue age (queued -> started)", queueAgeMs);
      summarize("model duration (started -> completed)", modelDurationMs);
      summarize("total review time (queued -> completed)", totalReviewMs);
      summarize("recommendation-to-install time", recommendToInstallMs);
      if (outcome.failures.length) {
        console.log("\nFailures:");
        for (const f of outcome.failures) console.log(`  - ${f.label}: ${f.error}`);
        // A baseline that never reached a servable question has no valid
        // latency or diagnostic-quality evidence. Make that impossible to
        // mistake for a green run in a terminal, CI, or an orchestration job.
        process.exitCode = 1;
      }
      console.log("\nNote: no dollar-cost figure — the product has no cost-telemetry field yet; only call counts and durations are measured here.");
      console.log("===================================================\n");
    } finally {
      await browser.close();
    }
  } finally {
    log("teardown", "stopping isolated api and web servers");
    killServerGroup(apiProc);
    killServerGroup(webProc);
    await sleep(500);
  }
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
