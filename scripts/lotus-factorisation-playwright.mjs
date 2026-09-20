#!/usr/bin/env node
/**
 * Lotus factorisation — Playwright "Deterministic Wiring Suite"
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §9.1, §10 Phase 3 test gate).
 *
 * Drives the real student UI and real HTTP API end to end, but with the
 * API's model calls swapped for a deterministic, free, no-network fake
 * (LOTUS_E2E_FAKE_MODEL=true — see apps/api/src/lotus/lotus-fake-model.service.ts).
 * This proves the wiring (login, session start, provenance, per-session
 * variation, the AI Lab observer panels, no answer-key leakage, duplicate-
 * submit protection) without live-model cost or non-determinism, and must
 * never be read as a measurement of live-model diagnostic accuracy.
 *
 * Spawns its own isolated API + web dev servers on dedicated ports and
 * tears them down afterwards — it does not touch whatever dev servers may
 * already be running on 3000/3001. Uses the shared local Postgres (the same
 * one `pnpm db:push` targets); every session it creates uses a randomized
 * demo_e2e_* student id and is left in place like other local dev data.
 *
 * Missing deps (playwright) → explicit SKIP, never a fake PASS.
 *
 * Usage: node scripts/lotus-factorisation-playwright.mjs
 * Env: LOTUS_E2E_API_PORT (3098), LOTUS_E2E_WEB_PORT (3097)
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const API_PORT = process.env.LOTUS_E2E_API_PORT || "3098";
const WEB_PORT = process.env.LOTUS_E2E_WEB_PORT || "3097";
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const REPO_ROOT = new URL("..", import.meta.url).pathname;

const results = [];
const log = (step, msg) => console.log(`[${step}] ${msg}`);
const pass = (step, detail) => { results.push({ step, status: "PASS", detail }); log(step, `PASS — ${detail}`); };
const fail = (step, detail) => { results.push({ step, status: "FAIL", detail }); log(step, `FAIL — ${detail}`); };
const skip = (step, reason) => { results.push({ step, status: "SKIP", detail: reason }); log(step, `SKIP — ${reason}`); };

function printSummary() {
  const failed = results.filter((r) => r.status === "FAIL").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);
}

function spawnServer(name, args, env) {
  // detached so the actual dev-server process (which `pnpm` forks, not `pnpm`
  // itself) can be reached and killed as a whole group on teardown — killing
  // only the `pnpm` wrapper leaves the real server running on its port.
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

async function waitForReady(url, label, timeoutMs) {
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

/** Mints a real, server-signed demo student token via the web app's own same-origin route, and stores it exactly as the real login flow would. */
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
  await page.evaluate((record) => {
    localStorage.setItem("cogna_student", JSON.stringify(record));
  }, minted);
}

async function startFactorisation(page) {
  await page.goto(`${WEB_URL}/student/lotus?topic=factorisation`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const startButton = page.getByRole("button", { name: /^Start for/ });
  // Disabled until the client's own GET /lotus/status resolves — wait for
  // that, not just visibility, before clicking.
  await expectEnabled(startButton, 30_000);
  await startButton.click({ timeout: 30_000 });
  // Factorisation waits for the 15-question preparation gate before showing Q1.
  // Two concurrent sessions' 15-question preparation pipelines share this
  // process's cross-session repeat-avoidance tracking, so a print collision
  // can occasionally cost a slot a retry round -- generous on purpose.
  await page.getByPlaceholder(/Type your answer/).waitFor({ state: "visible", timeout: 120_000 });
}

async function expectEnabled(locator, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await locator.isEnabled().catch(() => false)) return;
    await sleep(250);
  }
  throw new Error("element never became enabled");
}

async function submitDontKnow(page) {
  await page.getByLabel(/I don.t know this yet/).check();
  await page.getByRole("button", { name: /Submit answer/ }).click();
}

async function currentPromptText(page) {
  // Every factorisation item's prompt (real or fake writer) starts with this
  // fixed phrase (see makerPrompt/controlledWrite) — a stable, content-based
  // selector, since the question card's own CSS class names are hashed by
  // the CSS module build and not something a test should couple to.
  const prompt = page.getByText(/^Factorise completely:/).first();
  await prompt.waitFor({ state: "visible", timeout: 20000 });
  return (await prompt.textContent())?.trim() ?? "";
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    skip("playwright", "playwright package not installed — run pnpm add -Dw playwright");
    printSummary();
    process.exit(0);
  }

  const apiAlreadyUp = await waitForReady(`${API_URL}/lotus/status`, "api", 1_000);
  const webAlreadyUp = apiAlreadyUp && await waitForReady(WEB_URL, "web", 1_000);
  let apiProc = null;
  let webProc = null;
  if (apiAlreadyUp && webAlreadyUp) {
    log("setup", `reusing already-running api:${API_PORT} and web:${WEB_PORT} (set LOTUS_E2E_FORCE_SPAWN=true to always spawn fresh)`);
  } else {
    log("setup", `starting isolated api:${API_PORT} (fake model) and web:${WEB_PORT}`);
    apiProc = spawnServer("api", ["--filter", "@cogna/api", "dev"], {
      PORT: API_PORT,
      LOTUS_E2E_FAKE_MODEL: "true",
    });
    webProc = spawnServer("web", ["--filter", "@cogna/web", "dev"], {
      PORT: WEB_PORT,
      NEXT_PUBLIC_API_URL: API_URL,
      API_URL,
    });
  }

  try {
    const apiReady = await waitForReady(`${API_URL}/lotus/status`, "api", 90_000);
    if (!apiReady) { fail("setup-api", `api did not become ready within 90s\n${apiProc?.getLog() ?? ""}`); printSummary(); process.exit(1); }
    pass("setup-api", `api ready on ${API_URL}`);

    const webReady = await waitForReady(WEB_URL, "web", 90_000);
    if (!webReady) { fail("setup-web", `web did not become ready within 90s\n${webProc?.getLog() ?? ""}`); printSummary(); process.exit(1); }
    pass("setup-web", `web ready on ${WEB_URL}`);

    const browser = await chromium.launch({ headless: true });
    try {
      // Next.js dev compiles each route on its first hit — sometimes past
      // any reasonable in-scenario timeout. Force that compile here, before
      // any timed assertion, so flakiness comes from the app, not the tool.
      const warmup = await browser.newPage();
      await warmup.goto(`${WEB_URL}/student/login`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);
      await warmup.goto(`${WEB_URL}/student/lotus?topic=factorisation`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);
      await warmup.close();
      pass("warmup", "pre-compiled /student/login and /student/lotus");

      const runId = randomUUID().replace(/-/g, "").slice(0, 8);

      // A — login, start, first question renders, provenance is honest, no hardcoded label ever appears.
      const pageA = await browser.newPage();
      // Registered before any navigation so scenario D's leak check covers
      // the whole session's traffic, not just its last request.
      const lotusResponses = [];
      pageA.on("response", (res) => { if (res.url().includes("/api/lotus/")) lotusResponses.push(res); });
      try {
        await loginAsDemoStudent(pageA, `demo_e2ea${runId}`, "E2E Aarav");
        await startFactorisation(pageA);
        const promptA = await currentPromptText(pageA);
        pass("start-session-a", `Q1 rendered: "${promptA.slice(0, 60)}"`);

        await pageA.getByRole("button", { name: /Show AI Lab/ }).click();
        const provenanceBadge = pageA.getByText(/New question made for this session|hardcoded question already present/).first();
        await provenanceBadge.waitFor({ state: "visible", timeout: 15000 });
        const provenanceText = (await provenanceBadge.textContent()) ?? "";
        const pageText = await pageA.locator("body").innerText();
        if (/hardcoded/i.test(provenanceText)) {
          fail("provenance-honest", `Q1's own provenance badge claims hardcoded: "${provenanceText}"`);
        } else if (/hardcoded question already present/i.test(pageText)) {
          fail("provenance-honest", "the hardcoded-provenance label text appears somewhere on the page for a factorisation session");
        } else {
          pass("provenance-honest", `Q1 shows "${provenanceText.trim()}", and no hardcoded-provenance label appears anywhere on the page`);
        }
      } catch (e) {
        fail("session-a-flow", String(e).slice(0, 300));
      }

      // B — a second, independent session's opening question must differ (real per-session variation reaching the actual browser).
      const pageB = await browser.newPage();
      try {
        await loginAsDemoStudent(pageB, `demo_e2eb${runId}`, "E2E Meena");
        await startFactorisation(pageB);
        const promptA = await currentPromptText(pageA);
        const promptB = await currentPromptText(pageB);
        if (promptA && promptB && promptA !== promptB) {
          pass("first-question-varies", `session A: "${promptA.slice(0, 40)}" vs session B: "${promptB.slice(0, 40)}"`);
        } else {
          fail("first-question-varies", `expected different opening prompts, got A="${promptA}" B="${promptB}"`);
        }
      } catch (e) {
        fail("session-b-flow", String(e).slice(0, 300));
      }

      // C — the AI Lab observer view renders the Phase 0 status strip, the
      // Phase 2 explainable decision panel, and the Unseen Plan panel with
      // real data. This is a wiring check only: it uses the controlled model
      // adapter, not a live-model accuracy claim.
      try {
        await submitDontKnow(pageA);
        await pageA.getByPlaceholder(/Type your answer/).waitFor({ state: "visible", timeout: 20000 }); // Q2 staged instantly
        const statusStrip = pageA.getByText(/AI review (queued|running|complete|not required)/).first();
        await statusStrip.waitFor({ state: "visible", timeout: 15000 });
        pass("status-strip-renders", `"${(await statusStrip.textContent())?.trim()}"`);

        const decisionPanel = pageA.getByLabel("Adaptive decision").first();
        await decisionPanel.waitFor({ state: "visible", timeout: 15000 });
        const decisionText = (await decisionPanel.innerText()).replace(/\s+/g, " ").trim();
        if (/What Lotus observed/.test(decisionText) && /Action implementation/.test(decisionText)) {
          pass("decision-panel-renders", `"${decisionText.slice(0, 180)}"`);
        } else {
          fail("decision-panel-renders", `structured decision fields missing: "${decisionText.slice(0, 240)}"`);
        }

        const unseenPlanToggle = pageA.getByText(/Unseen plan/).first();
        await unseenPlanToggle.click();
        const readinessChip = pageA.getByText(/Ready|Awaiting generation/).first();
        await readinessChip.waitFor({ state: "visible", timeout: 15000 });
        pass("unseen-plan-renders", `readiness chip shows "${(await readinessChip.textContent())?.trim()}"`);
      } catch (e) {
        fail("observer-panels", String(e).slice(0, 300));
      }

      // D — a NOT-yet-answered question's key must never reach the network,
      // even though an already-answered turn's key legitimately does (the
      // UI shows it as the "Correct answer" comparison once that turn is
      // done — see audit.question.answerKey in AuditCard). So this checks
      // currentQuestion/upcomingQuestions specifically, not the whole body.
      try {
        await submitDontKnow(pageA);
        await pageA.getByPlaceholder(/Type your answer/).waitFor({ state: "visible", timeout: 20000 });
        let leaked = false;
        let leakDetail = "";
        let checked = 0;
        for (const res of lotusResponses) {
          try {
            const json = await res.json();
            if (!json || typeof json !== "object" || !("currentQuestion" in json)) continue;
            checked += 1;
            const suspects = [json.currentQuestion, ...(json.upcomingQuestions ?? [])].filter(Boolean);
            for (const q of suspects) {
              const key = q?.answerKey;
              if (key && (key.canonicalAnswer || (key.workedSolution?.length ?? 0) > 0 || key.diagnostics?.predictedMistakes?.length)) {
                leaked = true;
                leakDetail = `${res.request().method()} ${res.url()} :: question ${q.id} exposed answerKey.canonicalAnswer="${key.canonicalAnswer}"`;
                break;
              }
            }
            if (leaked) break;
          } catch { /* not JSON or already consumed; skip */ }
        }
        if (leaked) log("no-answer-key-leak-debug", leakDetail);
        if (leaked) fail("no-answer-key-leak", "an /api/lotus/ response body contained answer-key-shaped fields");
        else if (checked === 0) fail("no-answer-key-leak", "no /api/lotus/ responses were captured — the check did not actually run");
        else pass("no-answer-key-leak", `checked ${checked} /api/lotus/ response(s), no answer-key fields present`);
      } catch (e) {
        fail("no-answer-key-leak", String(e).slice(0, 300));
      }

      await pageA.close();
      await pageB.close();
    } finally {
      await browser.close();
    }
  } finally {
    log("teardown", "stopping isolated api and web servers");
    killServerGroup(apiProc);
    killServerGroup(webProc);
    await sleep(500);
  }

  printSummary();
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

main().catch((err) => {
  fail("fatal", err instanceof Error ? (err.stack ?? err.message) : String(err));
  printSummary();
  process.exit(1);
});
