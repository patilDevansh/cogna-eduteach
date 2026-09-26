#!/usr/bin/env node
/**
 * Autonomous Lotus persona evaluation.
 *
 * Uses Playwright to submit the ten declared factorisation learner profiles
 * through the real student UI. A separate, development-only, token-gated API
 * seam returns the current item's private diagnostics to this Node process so
 * `chooseResponse()` can construct the profile's answer and working. The
 * browser never receives that data; production has no such seam.
 *
 * The default mode is fake and free, for runner verification. A live run is
 * explicit because it makes real provider calls:
 *   cd apps/api && LOTUS_AUTONOMOUS_EVAL_MODEL_MODE=live \
 *   node --import tsx ../../scripts/lotus-autonomous-persona-eval.ts
 *
 * The Phase 6 release run is 10 profiles × normal/fast × 3 = 60 sessions:
 *   LOTUS_AUTONOMOUS_EVAL_MODEL_MODE=live \
 *   LOTUS_AUTONOMOUS_EVAL_RUNS=3 \
 *   LOTUS_AUTONOMOUS_EVAL_PACES=normal,fast \
 *   node --import tsx ../../scripts/lotus-autonomous-persona-eval.ts
 *
 * For a narrow free verification, for example:
 *   cd apps/api && LOTUS_AUTONOMOUS_EVAL_PERSONAS=P08_EXPLICIT_SUPPORT_NEED \
 *   node --import tsx ../../scripts/lotus-autonomous-persona-eval.ts
 */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { PERSONA_CATALOGUE, chooseResponse, type PersonaProfile, type PersonaQuestionLike } from "../apps/api/test/fixtures/lotus-factorisation-personas";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
// Fixed 3107/3108 ports caused an old Next process to be mistaken for the
// fresh test web server: the browser then spoke to its old API while the
// evaluator queried the newly spawned API. Derive a pair per runner process
// unless a caller explicitly reserves ports, so each run is genuinely
// isolated even after a previous interrupted developer run.
const DEFAULT_PORT_BASE = 3200 + (process.pid % 500) * 2;
const WEB_PORT = process.env.LOTUS_AUTONOMOUS_EVAL_WEB_PORT || String(DEFAULT_PORT_BASE);
const API_PORT = process.env.LOTUS_AUTONOMOUS_EVAL_API_PORT || String(DEFAULT_PORT_BASE + 1);
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const MODEL_MODE = process.env.LOTUS_AUTONOMOUS_EVAL_MODEL_MODE === "live" ? "live" : "fake";
const RUNS = positiveInteger(process.env.LOTUS_AUTONOMOUS_EVAL_RUNS, 1);
const PACES = (process.env.LOTUS_AUTONOMOUS_EVAL_PACES || "normal,fast")
  .split(",").map((value) => value.trim()).filter((value): value is "normal" | "fast" => value === "normal" || value === "fast");
const PERSONA_IDS = new Set((process.env.LOTUS_AUTONOMOUS_EVAL_PERSONAS || "").split(",").map((value) => value.trim()).filter(Boolean));
const DRAIN_TIMEOUT_MS = positiveInteger(process.env.LOTUS_AUTONOMOUS_EVAL_DRAIN_TIMEOUT_MS, 600_000);
const REPORT_PATH = process.env.LOTUS_AUTONOMOUS_EVAL_REPORT_PATH;
/** When set, a per-persona failure dumps the isolated api/web servers' own stdout+stderr tail to `${DEBUG_LOG_PATH}.<persona>.<pace>.<run>.txt`. */
const DEBUG_LOG_PATH = process.env.LOTUS_AUTONOMOUS_EVAL_DEBUG_LOG_PATH;
const EVAL_TOKEN = randomBytes(32).toString("hex");

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function log(step: string, message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${step}] ${message}`);
}

function spawnServer(name: string, args: string[], env: Record<string, string>) {
  const child = spawn("pnpm", args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, output: () => output.slice(-6_000) };
}

function killServerGroup(process: { child?: ReturnType<typeof spawn> } | undefined): void {
  if (!process?.child?.pid) return;
  try { globalThis.process.kill(-process.child.pid, "SIGTERM"); } catch { /* already stopped */ }
}

async function waitForReady(url: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch { /* server still starting */ }
    await sleep(500);
  }
  return false;
}

async function loginAsDemoStudent(page: any, studentId: string, name: string): Promise<void> {
  await page.goto(`${WEB_URL}/student/login`, { waitUntil: "domcontentloaded" });
  const record = await page.evaluate(async ({ studentId, name }: { studentId: string; name: string }) => {
    const response = await fetch("/api/session/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, name }),
    });
    if (!response.ok) throw new Error(`student token failed: HTTP ${response.status}`);
    return response.json();
  }, { studentId, name });
  await page.evaluate((value: unknown) => localStorage.setItem("cogna_student", JSON.stringify(value)), record);
}

async function waitEnabled(locator: any, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await locator.isEnabled().catch(() => false)) return;
    await sleep(250);
  }
  throw new Error("start button never enabled");
}

async function startFactorisation(page: any): Promise<string> {
  let sessionId: string | null = null;
  const capture = (response: any) => {
    if (sessionId || !response.url().includes("/api/lotus/sessions") || response.request().method() !== "POST") return;
    response.json().then((payload: { sessionId?: string }) => { sessionId = payload.sessionId ?? null; }).catch(() => undefined);
  };
  page.on("response", capture);
  try {
    await page.goto(`${WEB_URL}/student/lotus?topic=factorisation`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const button = page.getByRole("button", { name: /^Start for/ });
    await waitEnabled(button, 30_000);
    await button.click();
    await page.getByText(/Question 1 of 25/).waitFor({ state: "visible", timeout: 300_000 });
    for (let attempt = 0; attempt < 20 && !sessionId; attempt += 1) await sleep(100);
    if (!sessionId) throw new Error("session-start response did not include sessionId");
    return sessionId;
  } finally {
    page.off("response", capture);
  }
}

async function privateQuestion(sessionId: string): Promise<PersonaQuestionLike & { id: string; type: string; options?: string[]; asksForWorking: boolean }> {
  const response = await fetch(`${API_URL}/lotus/sessions/${sessionId}/autonomous-evaluation-question`, {
    headers: { "X-Lotus-Autonomous-Eval-Token": EVAL_TOKEN },
  });
  if (!response.ok) throw new Error(`evaluation question unavailable: HTTP ${response.status}`);
  const question = await response.json();
  if (!question?.id || !question.answerKey?.canonicalAnswer) throw new Error("evaluation endpoint returned no active private question");
  return question;
}

function normalizePromptForComparison(value: string): string {
  return value
    .replaceAll("²", "^2")
    .replaceAll("³", "^3")
    .replaceAll("−", "-")
    // Prompt lines render as adjacent spans, so a prose boundary like
    // "Why?" can legitimately lose its preceding display-space. Whitespace
    // is not diagnostic content here; the item text and symbols are.
    .replace(/\s+/g, "")
    .trim();
}

async function assertRenderedQuestionMatchesServer(page: any, question: Awaited<ReturnType<typeof privateQuestion>>, turn: number): Promise<void> {
  const expected = normalizePromptForComparison((question as any).prompt ?? "");
  const prompt = page.locator('section[class*="questionCard"] div[class*="question"]').first();
  const startedAt = Date.now();
  let visible = "";
  while (Date.now() - startedAt < 60_000) {
    visible = normalizePromptForComparison((await prompt.textContent().catch(() => "")) ?? "");
    if (expected && visible.includes(expected)) return;
    await sleep(100);
  }
  throw new Error(`turn ${turn}: browser did not paint the server's committed item within 60s; expected=${JSON.stringify(expected)} visible=${JSON.stringify(visible)} privateQuestionId=${question.id}`);
}

// Mirrors CONFIDENCE_CHOICES in apps/web/src/app/student/lotus/page.tsx (25/60/90).
// Picks the option nearest the persona's declared confidenceBand midpoint.
function confidenceLabelForBand(band: readonly [number, number]): RegExp {
  const midpoint = (band[0] + band[1]) / 2;
  const options: Array<[number, RegExp]> = [[25, /^Not sure$/], [60, /^Somewhat sure$/], [90, /^Very sure$/]];
  const [, label] = options.reduce((closest, candidate) =>
    Math.abs(candidate[0] - midpoint) < Math.abs(closest[0] - midpoint) ? candidate : closest);
  return label;
}

async function submitPersonaResponse(
  page: any,
  question: Awaited<ReturnType<typeof privateQuestion>>,
  plan: ReturnType<typeof chooseResponse>,
  paceMs: number,
  confidenceBand: readonly [number, number],
): Promise<{ status?: string }> {
  if (plan.didNotKnow) {
    await page.getByLabel(/I don.t know this yet/).check();
  } else if (question.type === "MULTIPLE_CHOICE") {
    const choiceInputs = page.locator('input[name="lotus-answer"]');
    const startedAt = Date.now();
    let options: string[] = [];
    while (Date.now() - startedAt < 60_000) {
      options = await choiceInputs.evaluateAll((inputs: HTMLInputElement[]) => inputs.map((candidate) => candidate.value));
      if (options.includes(plan.answer)) break;
      await sleep(100);
    }
    if (!options.includes(plan.answer)) {
      const prompt = await page.locator('section[class*="questionCard"] div[class*="question"]').first().textContent().catch(() => "");
      throw new Error(`choice answer ${JSON.stringify(plan.answer)} was not painted within 60s; browser options=${JSON.stringify(options)} prompt=${JSON.stringify(prompt)}`);
    }
    await choiceInputs.evaluateAll((inputs: HTMLInputElement[], answer: string) => inputs.find((candidate) => candidate.value === answer)?.click(), plan.answer);
  } else {
    await page.getByPlaceholder(/Type your answer/).waitFor({ state: "visible", timeout: 60_000 });
    await page.getByPlaceholder(/Type your answer/).fill(plan.answer);
  }

  if (!plan.didNotKnow && question.asksForWorking) {
    const lines = plan.working.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 6);
    for (let index = 0; index < lines.length; index += 1) {
      if (index >= 3) await page.getByRole("button", { name: /Add another step/ }).click();
      await page.getByLabel(`Working step ${index + 1}`).fill(lines[index]!);
    }
  }

  // Only an adaptively repurposed turn shows this (requiresConfidenceProbe on
  // the served question); Submit silently blocks without it on those turns
  // (a visual nudge, not an error the page.waitForResponse below could ever
  // see), so a script that never picks one hangs the full 60s timeout instead
  // of failing loudly. "I don't know" already skips the requirement.
  if (!plan.didNotKnow) {
    const confidenceSection = page.getByText(/How sure are you\?/).first();
    if (await confidenceSection.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: confidenceLabelForBand(confidenceBand) }).click();
    }
  }

  // Lotus deliberately paints the already-staged next item immediately on
  // click, before this answer's API request returns. The evaluator must wait
  // for that commit before asking the private server seam for the next
  // question; otherwise it compares the browser's optimistic Q(n+1) with
  // the server's still-current Q(n).
  const committed = page.waitForResponse((response: any) =>
    response.request().method() === "POST" &&
    response.url().includes(`/api/lotus/sessions/`) &&
    response.url().includes("/answers"),
    { timeout: 60_000 },
  );
  // If a click/navigation failure aborts this turn, preserve the primary
  // failure while still marking the response waiter as handled. Without this
  // observer, closing the browser after a failed persona can surface a second
  // unhandled rejection and abort every remaining profile.
  void committed.catch(() => undefined);
  await page.getByRole("button", { name: /Submit answer/ }).click();
  const committedResponse = await committed;
  if (!committedResponse.ok()) throw new Error(`answer commit failed: HTTP ${committedResponse.status()}`);
  const committedView = await committedResponse.json().catch(() => ({}));
  // The UI measures an actual response duration. Keep rapid and normal
  // personas distinct without making the runner sleep for student-scale minutes.
  if (paceMs >= 50_000) await sleep(20);
  return { status: committedView?.status };
}

async function publicSession(page: any, sessionId: string): Promise<any> {
  return page.evaluate(async (id: string) => {
    const raw = localStorage.getItem("cogna_student");
    const student = raw ? JSON.parse(raw) : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (student?.studentId && student?.token) {
      headers["X-Cogna-Role"] = "student";
      headers["X-Cogna-Student-Id"] = student.studentId;
      headers["X-Cogna-Student-Token"] = student.token;
    }
    const response = await fetch(`/api/lotus/sessions/${id}`, { headers });
    if (!response.ok) throw new Error(`session read failed: HTTP ${response.status}`);
    return response.json();
  }, sessionId);
}

async function waitForCompletion(page: any, sessionId: string): Promise<any> {
  const startedAt = Date.now();
  let last: any = null;
  let lastError: string | undefined;
  while (Date.now() - startedAt < DRAIN_TIMEOUT_MS) {
    // A single transient read failure (e.g. the dev server briefly 503s while
    // compiling a cold route or synthesizing the final report right at
    // completion) must not abort a run this loop already budgets 10 minutes
    // for — only give up if the read never recovers before the deadline.
    try {
      last = await publicSession(page, sessionId);
      lastError = undefined;
      if (last.status === "COMPLETE" && last.finalReport) return last;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1_000);
  }
  throw new Error(`review drain timed out after ${DRAIN_TIMEOUT_MS}ms; last status=${last?.status}${lastError ? `; last read error=${lastError}` : ""}`);
}

function scoreTranscript(persona: PersonaProfile, view: any): { pass: boolean; failures: string[]; metrics: Record<string, number> } {
  const failures: string[] = [];
  const audits = view.audits ?? [];
  const reportSkills = new Map((view.finalReport?.skills ?? []).map((skill: any) => [skill.skillId, skill]));
  const metrics = {
    answeredTurns: audits.length,
    explicitDecisions: 0,
    adaptiveActions: 0,
    appliedActions: 0,
    queuedActions: 0,
    nearTermTargets: 0,
  };

  audits.forEach((audit: any, index: number) => {
    const decision = audit.adaptiveDecision;
    if (!decision) { failures.push(`turn ${index + 1}: missing adaptive decision`); return; }
    metrics.explicitDecisions += 1;
    if (decision.action !== "KEEP" && decision.action !== "STOP") metrics.adaptiveActions += 1;
    if (decision.implementation === "APPLIED") {
      metrics.appliedActions += 1;
      // `installedAt` only exists when a *replacement item* was generated
      // and installed. KEEP/STOP and a valid action served by an already
      // staged curriculum item are truthfully APPLIED without one.
      if (!decision.implementationDetail?.trim()) failures.push(`turn ${index + 1}: APPLIED action has no implementation explanation`);
    }
    if (decision.implementation === "QUEUED_FOR_GENERATION") metrics.queuedActions += 1;
    if (decision.action === "TARGETED_PROBE" || decision.action === "EASIER_PREREQUISITE") {
      if (!decision.targetSkill || !decision.targetTurn) failures.push(`turn ${index + 1}: ${decision.action} lacks a target skill or turn`);
      else if (decision.targetTurn > index + 9 || decision.targetTurn >= 24) failures.push(`turn ${index + 1}: ${decision.action} was placed too late at Q${decision.targetTurn}`);
      else metrics.nearTermTargets += 1;
    }
  });

  if (metrics.explicitDecisions !== audits.length) failures.push("not every answered turn has an explicit decision");
  if (persona.id === "P08_EXPLICIT_SUPPORT_NEED") {
    const confirmed = [...reportSkills.values()].filter((skill: any) => skill.state === "CONFIRMED");
    if (confirmed.length) failures.push(`support persona falsely confirmed ${confirmed.map((skill: any) => skill.skillId).join(", ")}`);
  }
  if (persona.id === "P01_SECURE_ADVANCED" || persona.id === "P10_LOW_CONFIDENCE_CORRECT") {
    const unsupported = [...reportSkills.values()].filter((skill: any) => skill.state === "CONFIRMED" || skill.state === "SUSPECTED");
    if (unsupported.length) failures.push(`secure persona has unsupported gap(s): ${unsupported.map((skill: any) => skill.skillId).join(", ")}`);
  }
  if (persona.id === "P09_ONE_OFF_SLIP") {
    const state = reportSkills.get(persona.misconception!.skillId)?.state;
    if (state === "CONFIRMED") failures.push(`one-off slip falsely confirmed ${persona.misconception!.skillId}`);
  }
  if (persona.misconception && persona.id !== "P09_ONE_OFF_SLIP") {
    const state = reportSkills.get(persona.misconception.skillId)?.state;
    if (state !== "CONFIRMED" && state !== "SUSPECTED") failures.push(`declared misconception ${persona.misconception.skillId} was neither suspected nor confirmed`);
  }
  return { pass: failures.length === 0, failures, metrics };
}

async function runPersona(page: any, persona: PersonaProfile, pace: "normal" | "fast", sequence: number) {
  const studentId = `demo_autonomous_${persona.id.toLowerCase()}_${pace}_${sequence}_${randomUUID().slice(0, 8)}`;
  await loginAsDemoStudent(page, studentId, `${persona.displayName} ${pace}`);
  const sessionId = await startFactorisation(page);
  let answered = 0;
  let sessionStatus = "ACTIVE";
  while (answered < 25 && sessionStatus === "ACTIVE") {
    const question = await privateQuestion(sessionId);
    await assertRenderedQuestionMatchesServer(page, question, answered + 1);
    const plan = chooseResponse(persona, question, answered + 1);
    const paceMs = pace === "fast" ? Math.min(...persona.paceMsBand) : Math.max(...persona.paceMsBand);
    const committed = await submitPersonaResponse(page, question, plan, paceMs, persona.confidenceBand);
    answered += 1;
    sessionStatus = committed.status ?? "ACTIVE";
  }
  const completed = await waitForCompletion(page, sessionId);
  return { persona: persona.id, pace, sessionId, score: scoreTranscript(persona, completed) };
}

async function main(): Promise<void> {
  const selected = PERSONA_CATALOGUE.filter((persona) => PERSONA_IDS.size === 0 || PERSONA_IDS.has(persona.id));
  if (!selected.length) throw new Error("No requested persona IDs matched the catalogue");
  if (!PACES.length) throw new Error("LOTUS_AUTONOMOUS_EVAL_PACES must contain normal and/or fast");

  let chromium: any;
  try { ({ chromium } = await import("playwright")); } catch { throw new Error("Playwright is unavailable; install the workspace dependency first"); }

  const planned = selected.length * PACES.length * RUNS;
  log("plan", `${planned} autonomous session(s), ${MODEL_MODE} model, ${selected.length} profile(s), ${PACES.join("/")} pace`);
  if (MODEL_MODE === "live") log("plan", "live mode makes real provider calls; this run is authorised by its explicit environment flag");

  const api = spawnServer("api", ["--filter", "@cogna/api", "dev"], {
    PORT: API_PORT,
    LOTUS_E2E_FAKE_MODEL: MODEL_MODE === "fake" ? "true" : "false",
    LOTUS_E2E_DISABLE_QUESTION_BANK: MODEL_MODE === "fake" ? "true" : "false",
    LOTUS_AUTONOMOUS_EVAL_TOKEN: EVAL_TOKEN,
  });
  const web = spawnServer("web", ["--filter", "@cogna/web", "dev"], {
    PORT: WEB_PORT,
    NEXT_PUBLIC_API_URL: API_URL,
    API_URL,
  });
  const results: any[] = [];
  try {
    if (!await waitForReady(`${API_URL}/lotus/status`, 90_000)) throw new Error(`API did not start\n${api.output()}`);
    if (!await waitForReady(WEB_URL, 90_000)) throw new Error(`Web did not start\n${web.output()}`);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (let run = 1; run <= RUNS; run += 1) {
        for (const pace of PACES) {
          for (const persona of selected) {
            try {
              const result = await runPersona(page, persona, pace, run);
              results.push(result);
              log("result", `${persona.id}/${pace}/${run}: ${result.score.pass ? "PASS" : "FAIL"}${result.score.failures.length ? ` — ${result.score.failures.join("; ")}` : ""}`);
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              results.push({ persona: persona.id, pace, run, score: { pass: false, failures: [detail] } });
              log("result", `${persona.id}/${pace}/${run}: ERROR — ${detail}`);
              // A mid-run failure (unlike the startup-only check above) had no
              // visibility into the isolated instance's own server output.
              // Dump both tails so a hang/timeout can actually be root-caused
              // instead of re-guessed on another live-money run.
              if (DEBUG_LOG_PATH) {
                await writeFile(
                  `${DEBUG_LOG_PATH}.${persona.id}.${pace}.${run}.txt`,
                  `=== ${persona.id}/${pace}/${run} failure: ${detail} ===\n\n--- api output (tail) ---\n${api.output()}\n\n--- web output (tail) ---\n${web.output()}\n`,
                ).catch(() => undefined);
              }
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    killServerGroup(web);
    killServerGroup(api);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    modelMode: MODEL_MODE,
    plannedSessions: planned,
    passedSessions: results.filter((result) => result.score.pass).length,
    failedSessions: results.filter((result) => !result.score.pass).length,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (REPORT_PATH) await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (report.failedSessions > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
