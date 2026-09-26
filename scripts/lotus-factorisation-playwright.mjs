#!/usr/bin/env node
/**
 * Lotus factorisation — Playwright "Deterministic Wiring Suite"
 * (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md §9.1, §10 Phase 3 test gate).
 *
 * Drives the real student UI and real HTTP API end to end. By default it
 * swaps model calls for a deterministic, free, no-network fake
 * (LOTUS_E2E_FAKE_MODEL=true — see apps/api/src/lotus/lotus-fake-model.service.ts).
 * The explicit LOTUS_E2E_MODEL_MODE=live option instead measures browser
 * wiring against authorised real provider calls. Fake runs prove stable
 * control flow; live runs prove integration and latency only, never
 * diagnostic accuracy.
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
 * Env: LOTUS_E2E_API_PORT (3098), LOTUS_E2E_WEB_PORT (3097),
 *      LOTUS_E2E_MODEL_MODE (fake, the default; or live for an explicitly
 *      authorised real-provider browser check),
 *      LOTUS_E2E_ACTION_LIFECYCLE_MODE (normal, the default; rejected for
 *      the controlled targeted-write failure matrix; or stale for the
 *      controlled late-review matrix).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const API_PORT = process.env.LOTUS_E2E_API_PORT || "3098";
const WEB_PORT = process.env.LOTUS_E2E_WEB_PORT || "3097";
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const REPO_ROOT = new URL("..", import.meta.url).pathname;
const MODEL_MODE = process.env.LOTUS_E2E_MODEL_MODE === "live" ? "live" : "fake";
const ACTION_LIFECYCLE_MODE = process.env.LOTUS_E2E_ACTION_LIFECYCLE_MODE || "normal";
if (!new Set(["normal", "rejected", "stale"]).has(ACTION_LIFECYCLE_MODE)) {
  throw new Error(`Unknown LOTUS_E2E_ACTION_LIFECYCLE_MODE ${JSON.stringify(ACTION_LIFECYCLE_MODE)}; use normal, rejected, or stale.`);
}

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

/** Claims the local demo invitation so the AI Studio exercises the same
 * teacher-only route a real observer uses. The student session remains in
 * localStorage; the teacher credential lives separately in sessionStorage. */
async function loginAsDemoTeacher(page) {
  const minted = await page.evaluate(async () => {
    const res = await fetch("/api/teacher-invitations/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ananya@gurukul.edu", inviteCode: "GURUKUL-2026" }),
    });
    if (!res.ok) throw new Error(`teacher mint failed: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  });
  await page.evaluate((record) => {
    sessionStorage.setItem("cogna_teacher_invitation", JSON.stringify(record));
  }, minted);
}

function isStudentLotusResponse(res) {
  const path = new URL(res.url()).pathname;
  return path.includes("/api/lotus/") && !path.endsWith("/observer") && !path.endsWith("/unseen-plan");
}

async function startFactorisation(page, { demoPersona } = {}) {
  const params = new URLSearchParams({ topic: "factorisation" });
  if (demoPersona) params.set("demo", demoPersona);
  await page.goto(`${WEB_URL}/student/lotus?${params}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
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

async function submitAnswerAndWaitForTurn(page, answer, turn) {
  await page.getByPlaceholder(/Type your answer/).fill(answer);
  await page.getByRole("button", { name: /Submit answer/ }).click();
  await page.getByText(new RegExp(`^Question ${turn} of 25$`)).first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

/** Uses the existing demo-only server endpoint, never a browser-visible answer key. */
async function submitDemoAnswerAndWait(page, nextTurn) {
  const fill = page.getByRole("button", { name: /Fill .*demo response/ });
  await fill.waitFor({ state: "visible", timeout: 20_000 });
  await fill.click();
  await page.waitForFunction(() => {
    const typedAnswer = document.querySelector("#lotus-answer");
    if (typedAnswer instanceof HTMLInputElement && typedAnswer.value.trim().length > 0) return true;
    // Choice items use the same answer state, rendered as radio buttons
    // instead of the text field. A checked option proves demo-fill set it.
    return document.querySelector('input[name="lotus-answer"]:checked') !== null;
  }, undefined, { timeout: 20_000 });
  await page.getByRole("button", { name: /Submit answer/ }).click();
  if (nextTurn <= 25) {
    await page.getByText(new RegExp(`^Question ${nextTurn} of 25$`)).first()
      .waitFor({ state: "visible", timeout: 30_000 });
  } else {
    await page.getByText("Lotus found a starting point").waitFor({ state: "visible", timeout: 45_000 });
  }
}

async function currentPromptText(page) {
  // The fake writer happens to use one prompt prefix, but a real author is
  // allowed to vary wording. Select the active question structurally instead
  // of making a live-model test fail merely because its prose is different.
  const prompt = page.locator('section[class*="questionCard"] div[class*="question"]').first();
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
    log("setup", `starting isolated api:${API_PORT} (${MODEL_MODE} model) and web:${WEB_PORT}`);
    const lifecycleEnv = ACTION_LIFECYCLE_MODE === "rejected" ? {
      // The initial skeleton remains valid. Only the review-triggered CHECK
      // deliberately fails, isolating the lifecycle outcome from startup.
      LOTUS_E2E_FAKE_FIRST_WRONG_STEP: "2",
      LOTUS_E2E_FAKE_WRITE_MODE: "reject-check",
    } : ACTION_LIFECYCLE_MODE === "stale" ? {
      // The reviewer reaches its conclusion after the deliberately tiny
      // fake-only useful-age window. This must retain the evidence while
      // refusing to rewrite the now-obsolete unseen plan.
      LOTUS_E2E_FAKE_CLOSURE_DELAY_MS: "1200",
      LOTUS_E2E_ANALYSIS_USEFUL_AGE_MS: "200",
    } : {};
    apiProc = spawnServer("api", ["--filter", "@cogna/api", "dev"], {
      PORT: API_PORT,
      // CI and ordinary wiring runs remain deterministic and free.  A live
      // run is opt-in because it consumes real provider calls and records
      // non-deterministic diagnostic transcripts for evaluation.
      LOTUS_E2E_FAKE_MODEL: MODEL_MODE === "fake" ? "true" : "false",
      // The browser wiring gate validates the live-generation pipeline, not
      // bank selection. Keep its controlled personas reproducible even when
      // a developer's local database contains prior AI-authored items.
      LOTUS_E2E_DISABLE_QUESTION_BANK: MODEL_MODE === "fake" ? "true" : "false",
      ...lifecycleEnv,
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
      let observerDeferredEffectInjected = false;
      pageA.on("response", (res) => { if (res.url().includes("/api/lotus/")) lotusResponses.push(res); });
      try {
        await loginAsDemoStudent(pageA, `demo_e2ea${runId}`, "E2E Aarav");
        await loginAsDemoTeacher(pageA);
        // The service-level matrix proves the planner serializes a real
        // primary action plus a secondary deferred effect. This controlled
        // observer-only fixture proves the browser renders and filters that
        // structure without placing an artificial diagnosis into the student
        // API or relying on a brittle full-25-turn learner sequence.
        if (ACTION_LIFECYCLE_MODE === "normal") {
          await pageA.route(/\/api\/lotus\/sessions\/[^/]+\/observer$/, async (route) => {
            const response = await route.fetch();
            const body = await response.json();
            const audits = Array.isArray(body?.audits) ? body.audits : [];
            const audit = [...audits].reverse().find((candidate) => candidate?.adaptiveDecision);
            if (audit?.adaptiveDecision) {
              const effects = audit.adaptiveDecision.planEffects ?? [];
              if (!effects.some((effect) => effect?.targetTurn === 17 && effect?.outcome === "DEFERRED")) {
                audit.adaptiveDecision.planEffects = [...effects, {
                  action: "REMOVE_OR_DEFER",
                  targetTurn: 17,
                  requestedPlacement: "Question 17",
                  outcome: "DEFERRED",
                  detail: "Question 17 was removed from this diagnostic because it depends on an unresolved prerequisite.",
                }];
                observerDeferredEffectInjected = true;
              }
            }
            await route.fulfill({ response, json: body });
          });
        }
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
        if (ACTION_LIFECYCLE_MODE === "rejected") {
          // The controlled closure attributes this otherwise-unexplained Q1
          // response to step 2, requesting a CHECK. The controlled writer
          // rejects only that CHECK, so the browser must show Rejected — not
          // a misleading installed/deferred success state.
          await submitAnswerAndWaitForTurn(pageA, "3(2x + 4)", 2);
          // A second response supplies the independent same-skill evidence
          // that makes the delayed Q1 review's CHECK actionable. This is the
          // same two-turn sequence exercised by the service-level gate.
          await submitAnswerAndWaitForTurn(pageA, "x(x + 5x)", 3);
        } else if (ACTION_LIFECYCLE_MODE === "stale") {
          // Submit an incorrect expression so an asynchronous AI review is
          // required, then move immediately to the already-authorized Q2.
          // The fake closure is held past the test-only useful-age deadline.
          await submitAnswerAndWaitForTurn(pageA, "1", 2);
        } else {
          await submitDontKnow(pageA);
          await pageA.getByPlaceholder(/Type your answer/).waitFor({ state: "visible", timeout: 20000 }); // Q2 staged instantly
        }
        const statusStrip = pageA.getByText(/AI review (queued|running|complete|not required)|AI is analysing this answer/).first();
        await statusStrip.waitFor({ state: "visible", timeout: 15000 });
        pass("status-strip-renders", `"${(await statusStrip.textContent())?.trim()}"`);

        const overview = pageA.getByLabel("Session overview");
        await overview.waitFor({ state: "visible", timeout: 15_000 });
        const overviewText = (await overview.innerText()).replace(/\s+/g, " ").trim();
        if (/Latest supported signal/i.test(overviewText) && /Next planned move/i.test(overviewText) && /Analysis health/i.test(overviewText) && /Plan impact/i.test(overviewText)) {
          pass("session-overview-renders", `"${overviewText.slice(0, 220)}"`);
        } else {
          fail("session-overview-renders", `missing compact Studio summary fields: "${overviewText.slice(0, 260)}"`);
        }

        if (MODEL_MODE === "live") {
          // A real review may correctly still be pending at Q2.  It would be
          // a validity bug to demand a fabricated decision before completion.
          pass("decision-panel-renders", "live review state is visible; no premature decision was required");
        } else {
          const decisionPanel = pageA.getByLabel("Adaptive decision").first();
          await decisionPanel.waitFor({ state: "visible", timeout: 15000 });
          const decisionText = (await decisionPanel.innerText()).replace(/\s+/g, " ").trim();
          if (/What Lotus observed/.test(decisionText) && /Action lifecycle/.test(decisionText)) {
            pass("decision-panel-renders", `"${decisionText.slice(0, 180)}"`);
          } else {
            fail("decision-panel-renders", `structured decision fields missing: "${decisionText.slice(0, 240)}"`);
          }
          if (ACTION_LIFECYCLE_MODE === "rejected") {
            // Earlier audit cards are intentionally collapsed to keep a
            // 25-turn Studio readable. Open the exact decision a teacher
            // would inspect rather than asserting against hidden content.
            const targetedCard = pageA.locator("details").filter({ hasText: "TARGETED PROBE" }).first();
            await targetedCard.waitFor({ state: "attached", timeout: 15_000 });
            if (await targetedCard.getAttribute("open") === null) {
              await targetedCard.locator("summary").click();
            }
            const targetedDecision = targetedCard.getByLabel("Adaptive decision");
            await targetedDecision.waitFor({ state: "visible", timeout: 15_000 });
            const lifecycle = targetedDecision.getByLabel("Action lifecycle");
            await lifecycle.getByText("Rejected", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
            const lifecycleText = (await lifecycle.innerText()).replace(/\s+/g, " ").trim();
            if (/could not be prepared/i.test(lifecycleText) && !/Awaiting student/i.test(lifecycleText)) {
              pass("rejected-action-lifecycle", `"${lifecycleText.slice(0, 220)}"`);
            } else {
              fail("rejected-action-lifecycle", `expected an honest rejected lifecycle, got "${lifecycleText.slice(0, 260)}"`);
            }
          } else if (ACTION_LIFECYCLE_MODE === "normal") {
            // A support signal schedules a prerequisite item into an unseen
            // slot. It must be installed before it can ever be shown, and
            // the Studio must say that it is still awaiting the student —
            // not falsely claim the planned item has already been seen.
            const lifecycle = decisionPanel.getByLabel("Action lifecycle");
            await lifecycle.getByText("Awaiting student", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
            const lifecycleText = (await lifecycle.innerText()).replace(/\s+/g, " ").trim();
            if (/Installed/i.test(lifecycleText) && /Awaiting confirmation that the student has reached this item/i.test(lifecycleText)) {
              pass("installed-unseen-action-lifecycle", `"${lifecycleText.slice(0, 260)}"`);
            } else {
              fail("installed-unseen-action-lifecycle", `expected installed-but-unseen lifecycle, got "${lifecycleText.slice(0, 300)}"`);
            }
          } else if (ACTION_LIFECYCLE_MODE === "stale") {
            const lifecycle = decisionPanel.getByLabel("Action lifecycle");
            await lifecycle.getByText("Stale", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
            const lifecycleText = (await lifecycle.innerText()).replace(/\s+/g, " ").trim();
            if (/Evidence was added only/i.test(lifecycleText) && !/Awaiting student/i.test(lifecycleText)) {
              pass("stale-action-lifecycle", `"${lifecycleText.slice(0, 260)}"`);
            } else {
              fail("stale-action-lifecycle", `expected evidence-only stale lifecycle, got "${lifecycleText.slice(0, 300)}"`);
            }
          }
        }

        // Phase 5 keeps the Studio readable as the audit trail grows: these
        // controls operate only on the authorised observer payload and must
        // visibly retain their selected state. This is deliberately a UI
        // wiring assertion; outcome-specific lifecycle correctness has its
        // own normal/rejected matrix above.
        const decisionStatus = pageA.getByRole("group", { name: "Decision status" });
        await decisionStatus.waitFor({ state: "visible", timeout: 15_000 });
        const expectedFilters = ["All", "Pending", "Implemented", "Deferred", "Rejected", "Stale"];
        const renderedFilters = await decisionStatus.getByRole("button").allTextContents();
        if (expectedFilters.every((label) => renderedFilters.includes(label))) {
          await decisionStatus.getByRole("button", { name: "Rejected", exact: true }).click();
          const rejectedSelected = await decisionStatus.getByRole("button", { name: "Rejected", exact: true }).getAttribute("aria-pressed");
          await decisionStatus.getByRole("button", { name: "All", exact: true }).click();
          const allSelected = await decisionStatus.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed");
          if (rejectedSelected === "true" && allSelected === "true") {
            pass("decision-status-filter-renders", "AI Studio exposes and toggles All, Pending, Implemented, Deferred, Rejected, and Stale filters");
          } else {
            fail("decision-status-filter-renders", `filter selection state was rejected=${rejectedSelected}, all=${allSelected}`);
          }
        } else {
          fail("decision-status-filter-renders", `expected filters ${expectedFilters.join(", ")}; rendered ${renderedFilters.join(", ")}`);
        }

        if (ACTION_LIFECYCLE_MODE === "normal") {
          const deferredEffects = pageA.getByLabel("Additional plan effects");
          await deferredEffects.waitFor({ state: "visible", timeout: 15_000 });
          const effectsText = (await deferredEffects.innerText()).replace(/\s+/g, " ").trim();
          await decisionStatus.getByRole("button", { name: "Deferred", exact: true }).click();
          const deferredSelected = await decisionStatus.getByRole("button", { name: "Deferred", exact: true }).getAttribute("aria-pressed");
          const deferredStillVisible = await deferredEffects.isVisible().catch(() => false);
          await decisionStatus.getByRole("button", { name: "All", exact: true }).click();
          if (observerDeferredEffectInjected && deferredSelected === "true" && deferredStillVisible && /DEFERRED.*Question 17/i.test(effectsText)) {
            pass("deferred-plan-effect-renders", `"${effectsText}"`);
          } else {
            fail("deferred-plan-effect-renders", `injected=${observerDeferredEffectInjected}, selected=${deferredSelected}, visible=${deferredStillVisible}, text="${effectsText}"`);
          }
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
            if (!isStudentLotusResponse(res) || !json || typeof json !== "object" || !("currentQuestion" in json)) continue;
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

      // E — an adaptationTag (which skill Lotus currently suspects, and why
      // it repurposed a future turn) must never reach the browser while the
      // session is ACTIVE — it belongs to the completed diagnostic record,
      // never to a student who could still use it to game their next answer.
      // Session A's scenario-C "I don't know" answer already queued an
      // EASIER_PREREQUISITE/DESCENT turn nearby, but adaptationTag is only
      // set on the AUDIT for that turn once the student actually reaches and
      // answers it (lotus.service.ts adaptationTagFor) — not merely once the
      // decision exists. So this advances several more turns first, to make
      // it likely that repurposed turn was actually served and answered,
      // then scans every captured response for the key appearing anywhere
      // with a real value (not assuming a single known nesting path, so it
      // still catches a leak if the field moves). Ground truth that the scan
      // wasn't vacuous — i.e. a real repurposed turn really was reached —
      // comes from questionSelection.selectedFrom, a sibling field on the
      // SAME object that is NOT redacted: "ADAPTIVE_STAGED" only appears
      // when the server-side turn.status was REPURPOSED, the exact condition
      // adaptationTagFor requires to produce a non-undefined tag. Relying on
      // an unredacted field to prove non-vacuousness, rather than assuming
      // "no leak found" means "the check worked", is the point.
      function findTruthyKey(value, key, path = "$") {
        if (value === null || typeof value !== "object") return null;
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i += 1) {
            const hit = findTruthyKey(value[i], key, `${path}[${i}]`);
            if (hit) return hit;
          }
          return null;
        }
        for (const [k, v] of Object.entries(value)) {
          if (k === key && v !== null && v !== undefined) return `${path}.${k} = ${JSON.stringify(v)}`;
          const hit = findTruthyKey(v, key, `${path}.${k}`);
          if (hit) return hit;
        }
        return null;
      }
      try {
        for (let turn = 4; turn <= 12; turn += 1) {
          await submitAnswerAndWaitForTurn(pageA, "1", turn);
        }
      } catch (e) {
        // The session may legitimately reach STOP/COMPLETE before turn 12 on
        // some plan shapes; that's fine, the scan below still runs on
        // whatever was captured. Only log it for visibility.
        log("adaptation-tag-advance", `stopped advancing early: ${String(e).slice(0, 150)}`);
      }
      try {
        let leakedAt = null;
        let sawRepurposedTurn = false;
        let checked = 0;
        for (const res of lotusResponses) {
          try {
            const json = await res.json();
            if (!isStudentLotusResponse(res) || !json || typeof json !== "object" || !("audits" in json)) continue;
            checked += 1;
            if (findTruthyKey(json, "selectedFrom") && JSON.stringify(json).includes('"ADAPTIVE_STAGED"')) sawRepurposedTurn = true;
            const hit = findTruthyKey(json, "adaptationTag");
            if (hit) { leakedAt = `${res.request().method()} ${res.url()} :: ${hit}`; break; }
          } catch { /* not JSON or already consumed; skip */ }
        }
        if (leakedAt) log("no-adaptation-tag-leak-debug", leakedAt);
        if (leakedAt) {
          fail("no-adaptation-tag-leak", "an /api/lotus/ response body exposed adaptationTag to the student view");
        } else if (checked === 0) {
          fail("no-adaptation-tag-leak", "no /api/lotus/ responses with audits were captured — the check did not actually run");
        } else if (!sawRepurposedTurn && ACTION_LIFECYCLE_MODE === "normal") {
          fail("no-adaptation-tag-leak", "never observed an ADAPTIVE_STAGED turn after advancing — the check was vacuous, not a real pass");
        } else if (!sawRepurposedTurn) {
          pass("no-adaptation-tag-leak", "checked student responses with no adaptationTag; this rejected-action matrix intentionally installed no adaptive item (the non-vacuous installed-item check runs in normal mode)");
        } else {
          pass("no-adaptation-tag-leak", `checked ${checked} response(s), confirmed a real ADAPTIVE_STAGED turn was reached, no adaptationTag present`);
        }
      } catch (e) {
        fail("no-adaptation-tag-leak", String(e).slice(0, 300));
      }

      // The same normal session has now advanced through the nearby
      // prerequisite slot. Confirm the audit trail moves from INSTALLED to
      // SHOWN only once the child reaches it, with the actual placement
      // recorded. This catches the misleading opposite states: a question
      // claimed as shown before it reaches the child, or an installed item
      // never reconciled after it was served.
      if (ACTION_LIFECYCLE_MODE === "normal") {
        try {
          const lifecycleTexts = await pageA.getByLabel("Action lifecycle").allTextContents();
          const shown = lifecycleTexts.find((text) => /Action lifecycle\s*Shown/i.test(text)
            && /confirmed when the student submitted it/i.test(text)
            && /Question \d+/i.test(text));
          if (shown) {
            pass("shown-action-lifecycle", `"${shown.replace(/\s+/g, " ").trim().slice(0, 260)}"`);
          } else {
            fail("shown-action-lifecycle", `no installed action reached a confirmed shown state; lifecycles=${JSON.stringify(lifecycleTexts.map((text) => text.replace(/\s+/g, " ").trim()).slice(0, 8))}`);
          }
        } catch (e) {
          fail("shown-action-lifecycle", String(e).slice(0, 300));
        }
      }

      // F — The action record itself is as sensitive as the tag: it names
      // the current hypothesis, target skill, and requested slot.  AI Studio
      // may receive it through the teacher-only observer endpoint, but the
      // student's ordinary session responses must not contain it at all.
      try {
        let leakedAt = null;
        let checked = 0;
        for (const res of lotusResponses) {
          try {
            if (!isStudentLotusResponse(res)) continue;
            const json = await res.json();
            if (!json || typeof json !== "object" || !("audits" in json)) continue;
            checked += 1;
            const hit = findTruthyKey(json, "adaptiveDecision");
            if (hit) { leakedAt = `${res.request().method()} ${res.url()} :: ${hit}`; break; }
          } catch { /* not JSON or already consumed; skip */ }
        }
        if (leakedAt) log("no-live-decision-leak-debug", leakedAt);
        if (leakedAt) fail("no-live-decision-leak", "a student-facing /api/lotus/ response exposed a live adaptive decision");
        else if (checked === 0) fail("no-live-decision-leak", "no student session response with audits was captured — the check did not actually run");
        else pass("no-live-decision-leak", `checked ${checked} student response(s); live decisions are restricted to AI Studio`);
      } catch (e) {
        fail("no-live-decision-leak", String(e).slice(0, 300));
      }

      // G — completing a real session must give the authorised teacher a
      // trace from every final-report skill state back to direct student
      // evidence. The student keeps the compact report; this detailed audit
      // is rendered only from the observer payload.
      try {
        const endReport = pageA.getByRole("button", { name: /End & report/ });
        await endReport.waitFor({ state: "visible", timeout: 15_000 });
        await endReport.click();
        const reportTrace = pageA.getByLabel("Final report evidence");
        await reportTrace.waitFor({ state: "visible", timeout: 15_000 });
        const traceText = (await reportTrace.innerText()).replace(/\s+/g, " ").trim();
        if (/Why Lotus reached each report conclusion/i.test(traceText)
          && /Question [1-9]\d*/.test(traceText)
          && /(code-verified|AI-reviewed)/i.test(traceText)
          && /No direct student response was used|Report rationale:/i.test(traceText)) {
          pass("final-report-evidence-trace", `teacher report trace renders direct evidence and explicit no-evidence states: "${traceText.slice(0, 260)}"`);
        } else {
          fail("final-report-evidence-trace", `missing traceability fields: "${traceText.slice(0, 360)}"`);
        }
      } catch (e) {
        fail("final-report-evidence-trace", String(e).slice(0, 300));
      }

      // H — the teacher-only Studio still needs to be usable on a narrow
      // screen. Reuse the completed, authorised session above: this checks
      // the real responsive layout and accessible landmark names, without
      // manufacturing a separate mobile-only payload.
      try {
        await pageA.setViewportSize({ width: 390, height: 844 });
        const reportTrace = pageA.getByLabel("Final report evidence");
        await reportTrace.scrollIntoViewIfNeeded();
        const statusControls = pageA.getByRole("group", { name: "Decision status" });
        await statusControls.scrollIntoViewIfNeeded();
        const mobileLayout = await pageA.evaluate(() => ({
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        const reportVisible = await reportTrace.isVisible();
        const controlsVisible = await statusControls.isVisible();
        if (mobileLayout.scrollWidth <= mobileLayout.viewport && reportVisible && controlsVisible) {
          pass("mobile-studio-accessibility", `390px viewport has no horizontal overflow and exposes labelled report evidence and decision controls`);
        } else {
          fail("mobile-studio-accessibility", `viewport=${mobileLayout.viewport}, scrollWidth=${mobileLayout.scrollWidth}, reportVisible=${reportVisible}, controlsVisible=${controlsVisible}`);
        }
      } catch (e) {
        fail("mobile-studio-accessibility", String(e).slice(0, 300));
      }

      // I — a complete 25-question diagnostic must remain navigable. This
      // runs only in the normal matrix because it verifies visual density,
      // not the deliberately rejected rewrite branch. Every answer is filled
      // by the demo-only server endpoint, so the browser still never reads a
      // live question key.
      if (ACTION_LIFECYCLE_MODE === "normal") {
        const pageD = await browser.newPage();
        try {
          await loginAsDemoStudent(pageD, `demo_e2ed${runId}`, "E2E Full diagnostic");
          await loginAsDemoTeacher(pageD);
          await startFactorisation(pageD, { demoPersona: "secure" });
          for (let nextTurn = 2; nextTurn <= 26; nextTurn += 1) {
            await submitDemoAnswerAndWait(pageD, nextTurn);
          }
          await pageD.getByRole("button", { name: /Show AI Lab/ }).click();
          const observerPane = pageD.locator('aside[class*="observerPane"]');
          await observerPane.getByText("Do not show student").waitFor({ state: "visible", timeout: 20_000 });
          const auditCards = observerPane.locator('details[class*="auditCard"]');
          const cardCount = await auditCards.count();
          const expandedCount = await auditCards.evaluateAll((cards) => cards.filter((card) => card.hasAttribute("open")).length);
          const latestSummary = await auditCards.last().locator("summary").innerText();
          if (cardCount === 26 && expandedCount === 1 && /Question 25/i.test(latestSummary)) {
            pass("25-turn-audit-readability", `AI Studio renders ${cardCount} audit cards with only the latest turn expanded`);
          } else {
            fail("25-turn-audit-readability", `expected 26 cards, one expanded, latest Q25; got cards=${cardCount}, expanded=${expandedCount}, latest="${latestSummary.slice(0, 120)}"`);
          }
        } catch (e) {
          fail("25-turn-audit-readability", String(e).slice(0, 300));
        } finally {
          await pageD.close();
        }
      }

      // J — Phase 4's rapid-response gate.  When the controlled model is
      // configured to hold every closure open, the student must still reach
      // Q5 on previously authorized questions before Q1/Q2's reviews finish.
      // This is deliberately opt-in so the Phase 3 wiring command remains
      // fast; invoke with LOTUS_E2E_FAKE_CLOSURE_DELAY_MS=2500.
      //
      // The actual proof of "not blocked" is the pending-reviews COUNT below
      // (still queued/running once Q5 renders) — a state check, true or false
      // regardless of wall-clock speed. An earlier version of this gate also
      // asserted reachQ5Ms < closureDelayMs, comparing wall-clock time to
      // reach Q5 against the injected delay; that was flaky by design, not
      // just on this run: four rapid Next.js-dev-mode round trips share one
      // Node event loop with this run's other scenarios' background writes
      // and reviews, so "time to reach Q5" is sensitive to host/process load
      // for reasons that have nothing to do with whether reviews block —
      // reproduced failing at 2862-4052ms against a 2500ms threshold on both
      // the original script and this one, unrelated to any code change here.
      // The timing is still logged for visibility, just never gates pass/fail.
      const closureDelayMs = Number(process.env.LOTUS_E2E_FAKE_CLOSURE_DELAY_MS || "0");
      if (Number.isFinite(closureDelayMs) && closureDelayMs > 0) {
        const pageC = await browser.newPage();
        try {
          await loginAsDemoStudent(pageC, `demo_e2ec${runId}`, "E2E Rapid");
          await loginAsDemoTeacher(pageC);
          await startFactorisation(pageC);
          const startedAt = Date.now();
          for (let turn = 2; turn <= 5; turn += 1) {
            await submitAnswerAndWaitForTurn(pageC, "1", turn);
          }
          const reachQ5Ms = Date.now() - startedAt;
          log("rapid-q5-timing", `Q5 arrived in ${reachQ5Ms}ms (informational — each review closure was held for ${closureDelayMs}ms; see comment above on why this isn't a pass/fail gate)`);
          // Phase 5 deliberately gives the teacher a separate, authorised
          // observer read. Wait for its visible completion before counting
          // review statuses; otherwise this assertion races React's effect
          // and inspects the student pane rather than AI Studio. Keep this
          // below the 2.5-second injected review delay, so it cannot wait for
          // the held reviews to complete and manufacture a false pass.
          await pageC.getByRole("button", { name: /Show AI Lab/ }).click();
          const observerPane = pageC.locator('aside[class*="observerPane"]');
          await observerPane.getByText("Do not show student").waitFor({ state: "visible", timeout: 1_500 });
          const pendingReviews = observerPane.getByText(/AI review (queued|running)/);
          const pendingCount = await pendingReviews.count();
          if (pendingCount < 2) {
            fail("rapid-pending-reviews", `expected Q1 and Q2 reviews still pending at Q5 (reached in ${reachQ5Ms}ms); found ${pendingCount} — a serial review path would show 0`);
          } else {
            pass("rapid-pending-reviews", `${pendingCount} review(s) remain queued/running at Q5 (reached in ${reachQ5Ms}ms); the student was not blocked`);
          }
        } catch (e) {
          fail("rapid-response-flow", String(e).slice(0, 300));
        } finally {
          await pageC.close();
        }
      } else {
        skip("rapid-pending-reviews", "set LOTUS_E2E_FAKE_CLOSURE_DELAY_MS (for example 2500) to run the Phase 4 delayed-review gate");
      }

      // The normal-mode observer fixture can be resolving a final polling
      // request while this scenario ends (especially after End & report).
      // Stop interception first so Playwright does not dispose the request
      // context underneath route.fetch and turn a passed UI assertion into
      // an unhandled cleanup error.
      await pageA.unrouteAll({ behavior: "ignoreErrors" });
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
