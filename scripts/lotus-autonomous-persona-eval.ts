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
import assert from "node:assert/strict";
import { driver as driveLotusNativeGame } from "./lotus-native-game-driver";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { MESSY_PERSONA_CATALOGUE, PERSONA_CATALOGUE, chooseResponse, type PersonaProfile, type PersonaQuestionLike } from "../apps/api/test/fixtures/lotus-factorisation-personas";

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
// Qualification runs use already-built servers: watch mode can retain an old
// compiler process after an interrupted run and makes browser evidence depend
// on a hot-reload race. Set this explicitly only when debugging a source edit.
const SERVER_MODE = process.env.LOTUS_AUTONOMOUS_EVAL_SERVER_MODE === "dev" ? "dev" : "start";
const REPORT_PATH = process.env.LOTUS_AUTONOMOUS_EVAL_REPORT_PATH;
/** When set, a per-persona failure dumps the isolated api/web servers' own stdout+stderr tail to `${DEBUG_LOG_PATH}.<persona>.<pace>.<run>.txt`. */
const DEBUG_LOG_PATH = process.env.LOTUS_AUTONOMOUS_EVAL_DEBUG_LOG_PATH;
const ARTIFACT_DIR = process.env.LOTUS_AUTONOMOUS_EVAL_ARTIFACT_DIR;
const EVAL_DATABASE_URL = process.env.LOTUS_AUTONOMOUS_EVAL_DATABASE_URL;
const REVIEW_OUTAGE_FILE = `${ARTIFACT_DIR ?? "/tmp"}/simulate-review-outage`;
const REQUIRE_ISOLATED_DATABASE = process.env.LOTUS_AUTONOMOUS_EVAL_REQUIRE_ISOLATED_DATABASE === "true" || MODEL_MODE === "live";
// A caller may provide a per-run token for debugging an isolated local run;
// production still rejects this route and normal runs get an unpredictable
// process-local token.
const EVAL_TOKEN = process.env.LOTUS_AUTONOMOUS_EVAL_TOKEN || randomBytes(32).toString("hex");

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function log(step: string, message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${step}] ${message}`);
}

/** Never let a live-model qualification silently write synthetic children to
 * a developer's ordinary local database. The caller must name a different,
 * already-provisioned disposable database; migrations remain an explicit
 * operator action, not something this evaluator attempts. */
function assertIsolatedDatabase(): void {
  if (!REQUIRE_ISOLATED_DATABASE) return;
  if (!EVAL_DATABASE_URL) throw new Error("LOTUS_AUTONOMOUS_EVAL_DATABASE_URL is required for qualification/live evaluation");
  if (EVAL_DATABASE_URL === process.env.DATABASE_URL) throw new Error("LOTUS_AUTONOMOUS_EVAL_DATABASE_URL must not equal the inherited DATABASE_URL");
}

function spawnServer(name: string, args: string[], env: Record<string, string>, command = "pnpm") {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("error", (error) => { output += `\\n${name} failed to start: ${error.message}\\n`; });
  return { child, output: () => output.slice(-6_000), fullOutput: () => output };
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
    for (let attempt = 0; attempt < 20 && !sessionId; attempt += 1) await sleep(100);
    if (!sessionId) throw new Error("session-start response did not include sessionId");
    // Do not use a cosmetic counter as the readiness signal. The next step
    // reads the committed server question and independently checks that exact
    // prompt is visible in the browser before any answer is sent.
    return sessionId;
  } finally {
    page.off("response", capture);
  }
}

async function privateQuestion(sessionId: string): Promise<PersonaQuestionLike & { id: string; type: string; options?: string[]; asksForWorking: boolean }> {
  const startedAt = Date.now();
  let lastStatus = "no response";
  while (Date.now() - startedAt < (MODEL_MODE === "live" ? 480_000 : 60_000)) {
    const response = await fetch(`${API_URL}/lotus/sessions/${sessionId}/autonomous-evaluation-question`, {
      headers: { "X-Lotus-Autonomous-Eval-Token": EVAL_TOKEN },
    });
    lastStatus = String(response.status);
    if (response.ok) {
      // While the live AI is still writing, the route answers with an empty body.
      const body = await response.text();
      const question = body ? JSON.parse(body) : null;
      if (question?.id && question.answerKey?.canonicalAnswer) return question;
      lastStatus = "200 without a complete active question";
    }
    await sleep(250);
  }
  throw new Error(`evaluation question unavailable: ${lastStatus}`);
}

/** The live AI needs minutes to write the paper; students wait on a preparation screen meanwhile. */
const PAINT_TIMEOUT_MS = MODEL_MODE === "live" ? 480_000 : 60_000;

function normalizePromptForComparison(value: string): string {
  return value
    .replaceAll("²", "^2")
    .replaceAll("³", "^3")
    .replaceAll("−", "-")
    // Game option writers may omit the explicit coefficient one that the
    // canonical answer retains; this is presentation-only, not a different
    // factorisation.
    .replace(/(^|[+(\-])1x/g, "$1x")
    // Prompt lines render as adjacent spans, so a prose boundary like
    // "Why?" can legitimately lose its preceding display-space. Whitespace
    // is not diagnostic content here; the item text and symbols are.
    .replace(/\s+/g, "")
    .trim();
}

/** Who is answering, so the "How did you get it?" screen is answered in character. */
let responder: { persona: PersonaProfile; reasons: string[] } | null = null;

/** After an unexplained wrong answer the page asks how the student got it, before showing the next question. */
async function answerReasonPromptIfShown(page: any): Promise<void> {
  const heading = page.locator("#reason-heading");
  if (!await heading.isVisible().catch(() => false)) return;
  const persona = responder?.persona;
  const wanted = persona?.messy?.copySlipTurns || persona?.slipOnTurn ? /slipped/i
    : persona?.messy?.guessSkills || persona?.messy?.randomTapper ? /guessed/i : /wasn.t sure/i;
  const group = page.getByRole("group", { name: await heading.innerText() });
  const preferred = group.getByRole("button", { name: wanted }).first();
  const choice = await preferred.isVisible().catch(() => false) ? preferred : group.getByRole("button").first();
  const text = await choice.innerText();
  await choice.click();
  responder?.reasons.push(text);
  await heading.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
}

async function assertRenderedQuestionMatchesServer(page: any, question: Awaited<ReturnType<typeof privateQuestion>>, turn: number): Promise<void> {
  const game = (question as any).game;
  if (game?.kind) {
    const surface = page.locator(`[data-game="${game.kind}"]`).first();
    const waitStarted = Date.now();
    while (!await surface.isVisible().catch(() => false)) {
      await answerReasonPromptIfShown(page);
      if (Date.now() - waitStarted > PAINT_TIMEOUT_MS) throw new Error(`turn ${turn}: ${game.kind} never appeared on screen in time`);
      await sleep(100);
    }
    // Seven Ways hero games intentionally omit the normal prompt. Their own
    // expression/options are the student-visible committed question.
    if (Array.isArray(game.options) && game.options.length) {
      const visible = normalizePromptForComparison((await surface.textContent()) ?? "");
      for (const option of game.options) {
        if (!visible.includes(normalizePromptForComparison(option))) throw new Error(`turn ${turn}: ${game.kind} did not paint option ${JSON.stringify(option)}`);
      }
    }
    return;
  }
  const expected = normalizePromptForComparison((question as any).prompt ?? "");
  const prompt = page.locator('section[class*="questionCard"] div[class*="question"]').first();
  const startedAt = Date.now();
  let visible = "";
  while (Date.now() - startedAt < PAINT_TIMEOUT_MS) {
    visible = normalizePromptForComparison((await prompt.textContent().catch(() => "")) ?? "");
    if (expected && visible.includes(expected)) return;
    await answerReasonPromptIfShown(page);
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

/**
 * LOTUS_AUTONOMOUS_EVAL_SUBMIT=api: post each answer to the same route the
 * student page uses, from inside the logged-in page, instead of clicking the
 * answer controls. The page now shows many game-style formats (tiles, puzzles,
 * fireflies, detective…) this runner can't operate; API mode still measures
 * Lotus's judgement and cost, but not that each game control works.
 */
const SUBMIT_VIA_API = process.env.LOTUS_AUTONOMOUS_EVAL_SUBMIT === "api";
/** An 8 GB machine running the API, Next dev and a browser can take minutes to boot. */
const SERVER_START_TIMEOUT_MS = positiveInteger(process.env.LOTUS_AUTONOMOUS_EVAL_START_TIMEOUT_MS, 300_000);
const API_ANSWER_PAUSE_MS = positiveInteger(process.env.LOTUS_AUTONOMOUS_EVAL_ANSWER_PAUSE_MS, MODEL_MODE === "live" ? 15_000 : 1);

async function submitViaApi(
  page: any,
  sessionId: string,
  question: Awaited<ReturnType<typeof privateQuestion>>,
  plan: ReturnType<typeof chooseResponse>,
  paceMs: number,
  confidenceBand: readonly [number, number],
): Promise<{ status?: string }> {
  const body = {
    answer: plan.didNotKnow ? "" : plan.answer,
    working: plan.didNotKnow ? "" : plan.working,
    confidence: Math.round((confidenceBand[0] + confidenceBand[1]) / 2),
    responseTimeMs: paceMs,
    didNotKnow: plan.didNotKnow,
    submissionId: randomUUID(),
    questionId: question.id,
  };
  // A real child takes tens of seconds per item, and the live writer needs a
  // few seconds per staged question; answering in milliseconds outruns it.
  await sleep(API_ANSWER_PAUSE_MS);
  const result = await page.evaluate(async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
    const raw = localStorage.getItem("cogna_student");
    const student = raw ? JSON.parse(raw) : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (student?.studentId && student?.token) {
      headers["X-Cogna-Role"] = "student";
      headers["X-Cogna-Student-Id"] = student.studentId;
      headers["X-Cogna-Student-Token"] = student.token;
    }
    const response = await fetch(`/api/lotus/sessions/${id}/answers`, {
      method: "POST", headers, body: JSON.stringify({ studentId: student?.studentId, ...payload }),
    });
    return { ok: response.ok, status: response.status, view: await response.json().catch(() => ({})) };
  }, { id: sessionId, payload: body });
  if (!result.ok) throw new Error(`answer commit failed: HTTP ${result.status} ${JSON.stringify(result.view).slice(0, 400)}`);
  return { status: result.view?.status };
}

/** The Detective, Impostor, Fishing and Firefly screens use buttons rather than radio inputs. */
async function playChoiceGame(page: any, question: any, plan: ReturnType<typeof chooseResponse>): Promise<void> {
  const card = page.locator('section[class*="questionCard"]').first();
  const same = (a: string, b: string) => normalizePromptForComparison(a).toLowerCase() === normalizePromptForComparison(b).toLowerCase();
  const options: string[] = question.options ?? [];
  const picks = options.filter((option) => same(option, plan.answer));
  const chosen = picks.length ? picks
    : question.presentation === "FISHING" ? options.filter((option) => plan.answer.includes(option))
    : [];
  if (!chosen.length) {
    if (!plan.isDeliberateMistake) throw new Error(`${question.presentation}: planned answer ${plan.answer} is not offered`);
    chosen.push(options.find((option) => !same(option, question.answerKey.canonicalAnswer))!);
    (plan as any).gameFidelity = "wrong answer not offered; another wrong option chosen";
  }
  for (const option of chosen) {
    const line = /^Line (\d+)$/i.exec(option)?.[1];
    const buttons = card.locator("button:not([disabled])");
    const started = Date.now();
    let clicked = false;
    while (!clicked && Date.now() - started < 30_000) {
      for (let i = 0, n = await buttons.count(); i < n && !clicked; i += 1) {
        const text = (await buttons.nth(i).innerText().catch(() => "")).trim();
        if (line ? new RegExp(`^${line}\\b`).test(text) : same(text, option)) { await buttons.nth(i).click(); clicked = true; }
      }
      if (!clicked) await sleep(100);
    }
    if (!clicked) throw new Error(`${question.presentation}: option ${option} never became clickable`);
  }
}

async function submitPersonaResponse(
  page: any,
  question: Awaited<ReturnType<typeof privateQuestion>>,
  plan: ReturnType<typeof chooseResponse>,
  paceMs: number,
  confidenceBand: readonly [number, number],
): Promise<{ status?: string }> {
  const game = (question as any).game;
  const gameSurface = game?.kind ? page.locator(`[data-game="${game.kind}"]`).first() : null;
  const canonical = question.answerKey.canonicalAnswer;
  const sameMath = (left: string, right: string) => normalizePromptForComparison(left) === normalizePromptForComparison(right);
  if (plan.didNotKnow) {
    await page.getByLabel(/I don.t know this yet/).check();
  } else if (game && await driveLotusNativeGame(page, question, plan)) {
    // The native adapter completed the issued game through its UI controls.
  } else if (game?.kind === "SPLIT_CONFIDENCE") {
    // Keep the persona's intended behaviour: never swap a wrong answer for the right one.
    const option = game.options.find((value: string) => sameMath(value, plan.answer))
      ?? (plan.isDeliberateMistake ? game.options.find((value: string) => !sameMath(value, canonical)) : undefined);
    if (!option) throw new Error(`SPLIT_CONFIDENCE has no option for planned answer ${plan.answer}`);
    const optionIndex = game.options.indexOf(option);
    const choice = gameSurface!.locator('button[data-answer]').nth(optionIndex);
    await choice.waitFor({ state: "visible", timeout: 60_000 });
    for (let chip = 0; chip < 4; chip += 1) await choice.click();
  } else if (game?.kind === "EDIT_HISTORY" || game?.kind === "READBACK") {
    const input = gameSurface!.getByPlaceholder(/Type your answer/);
    await input.waitFor({ state: "visible", timeout: 60_000 });
    await input.fill(plan.answer);
  } else if (game?.kind === "TRUE_FALSE") {
    // Each claim is judged against the checked answer. The UI records one
    // actual card decision per claim; this is not a synthetic API payload.
    for (const claim of game.claims as string[]) {
      const verdict = plan.isDeliberateMistake
        ? (sameMath(claim, canonical) ? "false" : "true")
        : sameMath(claim, canonical) ? "true" : "false";
      const button = gameSurface!.locator(`button[data-kind="${verdict}"], button[data-verdict="${verdict}"]`).first();
      await button.waitFor({ state: "visible", timeout: 60_000 });
      await button.click();
    }
  } else if (game?.kind === "RECTANGLE") {
    // For x² + bx + c the rectangle's intended split is the positive factor
    // from the checked pair; the game uses the number of strips down.
    const factors = [...canonical.matchAll(/\(x\s*[+−-]\s*(\d+)\)/g)].map((m) => Number(m[1]));
    const target = (factors.length ? Math.min(...factors) : 0) + (plan.isDeliberateMistake ? 1 : 0);
    const button = gameSurface!.getByRole("button", { name: String(target), exact: true });
    await button.waitFor({ state: "visible", timeout: 60_000 });
    await button.click();
  } else if (["DETECTIVE", "IMPOSTOR", "FISHING", "FIREFLY"].includes((question as any).presentation)) {
    await playChoiceGame(page, question, plan);
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
    // Working can be optional and folded behind "+ Add working (optional)",
    // and the page may start with fewer empty steps than the profile writes:
    // open it and add steps only when the next field isn't there yet.
    const openWorking = page.getByRole("button", { name: /Add working \(optional\)/ });
    if (await openWorking.isVisible().catch(() => false)) await openWorking.click();
    for (let index = 0; index < lines.length; index += 1) {
      const field = page.getByRole("textbox", { name: `Working step ${index + 1}`, exact: true });
      if (!await field.isVisible().catch(() => false)) await page.getByRole("button", { name: /Add another step/ }).click();
      await field.fill(lines[index]!);
    }
  }

  // The UI measures real elapsed time and ratings depend on it. Advancing the
  // browser's clock gives the persona its declared pace without really waiting.
  if (paceMs > 0) await page.clock.fastForward(paceMs);

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
  // On a targeted check the page asks "How sure are you?" only after Submit is
  // pressed, and sends nothing until a choice is made and Continue is pressed.
  // Wait on the question text: a game on the next screen can have its own "Not sure" button.
  const confidenceHeading = page.getByText(/How sure are you\?/).first();
  const firstEvent = await Promise.race([
    committed.then(() => "committed" as const, () => "committed" as const),
    confidenceHeading.waitFor({ state: "visible", timeout: 55_000 }).then(() => "confidence" as const, () => "committed" as const),
  ]);
  if (firstEvent === "confidence") {
    await page.getByRole("button", { name: confidenceLabelForBand(confidenceBand) }).click();
    await page.getByRole("button", { name: /^Continue$/ }).click();
  }
  const committedResponse = await committed;
  if (!committedResponse.ok()) throw new Error(`answer commit failed: HTTP ${committedResponse.status()}`);
  const committedView = await committedResponse.json().catch(() => ({ reportPending: page.url().includes("/report") }));
  // The UI measures an actual response duration. Keep rapid and normal
  // personas distinct without making the runner sleep for student-scale minutes.
  if (paceMs >= 50_000) await sleep(20);
  return { status: committedView?.reportPending ? "COMPLETE" : committedView?.status };
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

/** A real student takes far longer per question than a review does, so give each review the time a student would. */
async function waitForReview(page: any, sessionId: string, index: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    const status = await publicSession(page, sessionId).then((view: any) => view.audits?.[index]?.analysisStatus).catch(() => undefined);
    if (status && status !== "PENDING") return;
    await sleep(500);
  }
}

/** Late reviews can update a finished report, so read it again once none are outstanding. */
async function settledSession(page: any, sessionId: string, first: any): Promise<any> {
  let view = first;
  const startedAt = Date.now();
  while (MODEL_MODE === "live" && Date.now() - startedAt < 120_000 && view.audits.some((audit: any) => audit.analysisStatus === "PENDING")) {
    await sleep(2_000);
    view = await publicSession(page, sessionId).catch(() => view);
  }
  return view;
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
      // A rewrite of an existing later question ("Rewritten to test X without
      // needing Y") is placed where that question already was; only a fresh
      // check or an easier prerequisite has to land near the evidence. Late in
      // a test, nothing nearer than 9 questions may be left, which is fine.
      else if (!/^Rewritten to test/.test(decision.rationale ?? "") && decision.targetTurn > index + 9) failures.push(`turn ${index + 1}: ${decision.action} was placed too late at Q${decision.targetTurn}`);
      else metrics.nearTermTargets += 1;
    }
  });

  if (metrics.explicitDecisions !== audits.length) failures.push("not every answered turn has an explicit decision");
  if (persona.id === "P08_EXPLICIT_SUPPORT_NEED") {
    // Current rule (lotus-factorisation.ts foldLedger): one "I don't know" is a
    // support signal; two on a skill, or one alongside a mistake, confirm it so
    // the child is taught from the foundations. Anything less is a false confirm.
    const signals = new Map<string, number>();
    for (const audit of audits) for (const ev of audit.skillEvidence ?? []) {
      if (ev.kind !== "SECURE") signals.set(ev.skillId, (signals.get(ev.skillId) ?? 0) + 1);
    }
    const unsupported = [...reportSkills.values()].filter((skill: any) => skill.state === "CONFIRMED" && (signals.get(skill.skillId) ?? 0) < 2);
    if (unsupported.length) failures.push(`support persona confirmed on fewer than two signals: ${unsupported.map((skill: any) => skill.skillId).join(", ")}`);
  }
  if (persona.id === "P01_SECURE_ADVANCED" || persona.id === "P10_LOW_CONFIDENCE_CORRECT") {
    const unsupported = [...reportSkills.values()].filter((skill: any) => skill.state === "CONFIRMED" || skill.state === "SUSPECTED");
    if (unsupported.length) failures.push(`secure persona has unsupported gap(s): ${unsupported.map((skill: any) => skill.skillId).join(", ")}`);
  }
  if (persona.id === "P09_ONE_OFF_SLIP") {
    const state = reportSkills.get(persona.misconception!.skillId)?.state;
    if (state === "CONFIRMED") failures.push(`one-off slip falsely confirmed ${persona.misconception!.skillId}`);
  }
  if (persona.messy) {
    const states = [...reportSkills.values()] as any[];
    if (persona.messy.mayConfirm) {
      const extra = states.filter((skill) => skill.state === "CONFIRMED" && !persona.messy!.mayConfirm!.includes(skill.skillId));
      if (extra.length) failures.push(`messy persona: confirmed a gap from slips or typing: ${extra.map((skill) => skill.skillId).join(", ")}`);
    }
    const guessedSecure = states.filter((skill) => skill.state === "SECURE" && persona.messy!.guessSkills?.includes(skill.skillId));
    if (guessedSecure.length) failures.push(`guessing persona reported SECURE on guessed skills: ${guessedSecure.map((skill) => skill.skillId).join(", ")}`);
    if (persona.messy.expectOutcome && view.finalReport?.outcome !== persona.messy.expectOutcome) {
      failures.push(`expected outcome ${persona.messy.expectOutcome}, got ${view.finalReport?.outcome}`);
    }
    if (persona.messy.expectSignRoot && !/sign/i.test(view.finalReport?.startingPoint ?? "")) {
      failures.push(`expected signs with negative numbers as the starting point, got: ${view.finalReport?.startingPoint}`);
    }
  }
  // Scorecard (Cogna Project Hub, C5): gaps found, missed and invented, per persona.
  const confirmedSkills = [...reportSkills.values()].filter((skill: any) => skill.state === "CONFIRMED").map((skill: any) => skill.skillId as string);
  const expectedGaps = [
    ...(persona.misconception && persona.id !== "P09_ONE_OFF_SLIP" ? [persona.misconception.skillId] : []),
    ...(persona.supportSkills ?? []).filter((id) => confirmedSkills.includes(id)),
  ];
  const allowed = new Set([...expectedGaps, ...(persona.messy?.mayConfirm ?? []), ...(persona.messy?.guessSkills ?? []), ...(persona.messy?.signSkills ?? [])]);
  (metrics as any).gapsExpected = expectedGaps.length;
  (metrics as any).gapsFound = expectedGaps.filter((id) => confirmedSkills.includes(id) || reportSkills.get(id)?.state === "SUSPECTED").length;
  (metrics as any).falseGaps = persona.messy?.mayConfirm || !persona.messy ? confirmedSkills.filter((id) => !allowed.has(id)).length : 0;
  if (persona.misconception && persona.id !== "P09_ONE_OFF_SLIP") {
    const state = reportSkills.get(persona.misconception.skillId)?.state;
    if (state !== "CONFIRMED" && state !== "SUSPECTED") failures.push(`declared misconception ${persona.misconception.skillId} was neither suspected nor confirmed`);
  }
  return { pass: failures.length === 0, failures, metrics };
}

async function runPersona(page: any, persona: PersonaProfile, pace: "normal" | "fast", sequence: number) {
  const studentId = `demo_autonomous_${persona.id.toLowerCase()}_${pace}_${sequence}_${randomUUID().slice(0, 8)}`;
  await loginAsDemoStudent(page, studentId, `${persona.displayName} ${pace}`);
  // What the browser really sent and showed, kept apart from what the persona planned.
  const sentAnswers: any[] = [];
  const browserErrors: string[] = [];
  const onRequest = (request: any) => {
    if (request.method() !== "POST" || !/\/api\/lotus\/sessions\/[^/]+\/answers/.test(request.url())) return;
    try { sentAnswers.push(JSON.parse(request.postData() ?? "{}")); } catch { sentAnswers.push({ unreadable: true }); }
  };
  const onConsole = (message: any) => { if (message.type() === "error") browserErrors.push(message.text().slice(0, 300)); };
  const onPageError = (error: Error) => browserErrors.push(`pageerror: ${error.message.slice(0, 300)}`);
  page.on("request", onRequest);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  responder = { persona, reasons: [] };
  const sessionId = await startFactorisation(page);
  let answered = 0;
  let sessionStatus = "ACTIVE";
  let worstOverflowPx = 0;
  const horizontalOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);
  const ledger: Array<Record<string, unknown>> = [];
  while (answered < 19 && sessionStatus === "ACTIVE") {
    const question = await privateQuestion(sessionId);
    log("turn", `${persona.id} Q${answered + 1}: ${(question as any).game?.kind ?? question.type}`);
    if (!SUBMIT_VIA_API) await assertRenderedQuestionMatchesServer(page, question, answered + 1);
    worstOverflowPx = Math.max(worstOverflowPx, await horizontalOverflow());
    const screenLabel = await page.getByText(/Question \d+(\.5)? of \d+/).first().textContent({ timeout: 800 }).catch(() => null);
    const plan = chooseResponse(persona, question, answered + 1);
    const tired = persona.messy?.tiredFromTurn !== undefined && answered + 1 >= persona.messy.tiredFromTurn;
    const paceMs = tired ? 3_000 : pace === "fast" ? Math.min(...persona.paceMsBand) : Math.max(...persona.paceMsBand);
    // This is sealed before the evaluator reads Lotus's report or observer
    // projection. It is the independent, transcript-only analysis boundary.
    ledger.push({
      turn: answered + 1,
      screenLabel,
      gameKind: (question as any).game?.kind ?? null,
      plannedDeliberateMistake: plan.isDeliberateMistake,
      question: { id: question.id, prompt: (question as any).prompt, diagnostics: question.answerKey.diagnostics },
      response: { answer: plan.answer, working: plan.working, didNotKnow: plan.didNotKnow, confidenceBand: persona.confidenceBand, responseTimeMs: paceMs },
      independentAssessment: plan.didNotKnow ? "SUPPORT_SIGNAL" : plan.isDeliberateMistake ? "DECLARED_MISCONCEPTION_OR_SLIP" : "DEMONSTRATED_SUCCESS",
    });
    const committed = SUBMIT_VIA_API
      ? await submitViaApi(page, sessionId, question, plan, paceMs, persona.confidenceBand)
      : await submitPersonaResponse(page, question, plan, paceMs, persona.confidenceBand);
    if ((plan as any).gameFidelity) ledger.at(-1)!.gameFidelity = (plan as any).gameFidelity;
    answered += 1;
    sessionStatus = committed.status ?? "ACTIVE";
    if (MODEL_MODE === "live" && sessionStatus === "ACTIVE") await waitForReview(page, sessionId, answered - 1);
    if (page.url().includes("/student/lotus/report")) sessionStatus = "COMPLETE";
  }
  if (sessionStatus === "ACTIVE") throw new Error(`${persona.id}: diagnostic exceeded the 15-spine + four-follow-up cap`);
  const baseSlots = ledger.filter((row) => !(row.question as any).diagnostics?.isElasticProbe).map((row) => (row.question as any).diagnostics?.slot);
  const elasticSlots = ledger.filter((row) => (row.question as any).diagnostics?.isElasticProbe).map((row) => (row.question as any).diagnostics?.slot);
  // An early exit legitimately stops the paper short, but what was asked must still be in order.
  assert.deepEqual(baseSlots, Array.from({ length: baseSlots.length }, (_, index) => index + 1), `${persona.id}: every spine slot must be shown once and in order`);
  if (baseSlots.length !== 15) log("exit", `${persona.id}: ended after ${baseSlots.length} main questions`);
  assert.ok(elasticSlots.length <= 4 && elasticSlots.every((slot) => Number(slot) % 1 === 0.5), `${persona.id}: elastic probes must be at most four .5 slots`);
  const blindAnalysis = {
    oracleVersion: "factorisation-browser-transcript-v1",
    sealedAt: new Date().toISOString(),
    persona: persona.id,
    pace,
    sessionId,
    declaredTruth: { misconception: persona.misconception, supportSkills: persona.supportSkills, messy: persona.messy },
    provisionalConclusion: persona.misconception ? { likelyGap: persona.misconception.skillId, alternative: "one-off slip or ambiguous working" } : { likelyGap: null, alternative: "untested skills remain unrated" },
    ledger,
  };
  if (ARTIFACT_DIR) {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await writeFile(`${ARTIFACT_DIR}/${sessionId}.blind-analysis.json`, `${JSON.stringify(blindAnalysis, null, 2)}\n`, "utf8");
  }
  const completed = await settledSession(page, sessionId, await waitForCompletion(page, sessionId));
  const score = scoreTranscript(persona, completed);
  if (ARTIFACT_DIR) {
    // Open the report the way a person does and keep exactly what the screen says.
    await page.goto(`${WEB_URL}/student/lotus/report?session=${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByText(/Competency Ratings|couldn.t open this report/).first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
    const reportText = await page.evaluate(() => document.body.innerText).catch(() => "");
    const reportOverflowPx = await horizontalOverflow();
    const label = `${persona.id}.${pace}.${(page.viewportSize()?.width ?? 0) < 500 ? "mobile" : "desktop"}`;
    await page.screenshot({ path: `${ARTIFACT_DIR}/${label}.report.png`, fullPage: true }).catch(() => undefined);
    page.off("request", onRequest);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    await writeFile(`${ARTIFACT_DIR}/${sessionId}.browser-evidence.json`, `${JSON.stringify({
      sessionId, persona: persona.id, pace, modelMode: MODEL_MODE, viewport: page.viewportSize(), reasonsAnswered: responder?.reasons ?? [], sentAnswers, browserErrors, worstOverflowPx, reportOverflowPx, reportText,
    }, null, 2)}\n`, "utf8");
    await writeFile(`${ARTIFACT_DIR}/${sessionId}.cogna-result.json`, `${JSON.stringify({ completed, score }, null, 2)}\n`, "utf8");
    await writeFile(`${ARTIFACT_DIR}/${sessionId}.comparison.json`, `${JSON.stringify({ sessionId, persona: persona.id, pace, result: score.pass ? "MATCH" : "MISMATCH", failures: score.failures }, null, 2)}\n`, "utf8");
  }
  return { persona: persona.id, pace, sessionId, score };
}

/** Real-browser checks of behaviour around the test: refresh, failed saves, old tabs, access, private data, phone layout. */
async function runBrowserScenarios(browser: any): Promise<void> {
  const persona = PERSONA_CATALOGUE.find((p) => p.id === "P01_SECURE_ADVANCED")!;
  const results: Array<{ id: string; pass: boolean; detail: string }> = [];
  const opened = async (name: string, options: Record<string, unknown> = {}) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.clock.install();
    const studentId = `demo_qa_${name}_${randomUUID().slice(0, 8)}`;
    await loginAsDemoStudent(page, studentId, `QA ${name}`);
    return { context, page, studentId };
  };
  const answerOne = async (page: any, sessionId: string, turn: number) => {
    const question = await privateQuestion(sessionId);
    await assertRenderedQuestionMatchesServer(page, question, turn);
    return submitPersonaResponse(page, question, chooseResponse(persona, question, turn), 20_000, persona.confidenceBand);
  };
  const record = (id: string, pass: boolean, detail: string) => { results.push({ id, pass, detail }); log("scenario", `${id}: ${pass ? "PASS" : "FAIL"} — ${detail}`); };
  const scenario = async (id: string, body: () => Promise<void>) => {
    try { await body(); } catch (error) { record(id, false, `could not complete: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`); }
  };

  await scenario("REFRESH_MID_TEST", async () => {
    const { context, page } = await opened("refresh");
    const id = await startFactorisation(page);
    for (let turn = 1; turn <= 2; turn += 1) await answerOne(page, id, turn);
    const before = await privateQuestion(id);
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertRenderedQuestionMatchesServer(page, before, 3);
    const after = await privateQuestion(id);
    const view = await publicSession(page, id);
    record("REFRESH_MID_TEST", before.id === after.id && view.audits.length === 2, `same question after refresh: ${before.id === after.id}; saved answers: ${view.audits.length} of 2`);
    await context.close();
  });

  await scenario("FAILED_SAVE_THEN_RETRY", async () => {
    const { context, page } = await opened("retry");
    const id = await startFactorisation(page);
    await answerOne(page, id, 1);
    const blockedIds: string[] = [];
    const pattern = "**/api/lotus/sessions/*/answers";
    await page.route(pattern, (route: any) => { blockedIds.push(JSON.parse(route.request().postData() ?? "{}").submissionId); return route.abort(); });
    const pending = answerOne(page, id, 2).catch((error: Error) => error.message);
    const retry = page.getByRole("button", { name: /Retry saving previous answer/ });
    await retry.waitFor({ state: "visible", timeout: 45_000 });
    const message = await page.getByText(/didn.t save/).first().isVisible().catch(() => false);
    await page.unroute(pattern);
    const released: string[] = [];
    page.on("request", (request: any) => { if (/\/answers$/.test(request.url()) && request.method() === "POST") released.push(JSON.parse(request.postData() ?? "{}").submissionId); });
    await retry.click();
    await pending;
    const view = await publicSession(page, id);
    const sameId = released.length > 0 && released.every((value) => blockedIds.includes(value));
    record("FAILED_SAVE_THEN_RETRY", message && view.audits.length === 2 && sameId, `student told it did not save: ${message}; retry reused the same answer: ${sameId}; answers saved: ${view.audits.length} of 2`);
    await context.close();
  });

  await scenario("OLD_TAB_CANNOT_DOUBLE_ANSWER", async () => {
    const { context, page } = await opened("stale");
    const id = await startFactorisation(page);
    const second = await context.newPage();
    await second.clock.install();
    await second.goto(`${WEB_URL}/student/lotus?topic=factorisation&session=${id}`, { waitUntil: "domcontentloaded" });
    const first = await privateQuestion(id);
    await assertRenderedQuestionMatchesServer(second, first, 1);
    await answerOne(page, id, 1);
    let staleOutcome = "accepted";
    await submitPersonaResponse(second, first, chooseResponse(persona, first, 1), 20_000, persona.confidenceBand).catch((error: Error) => { staleOutcome = error.message.slice(0, 120); });
    const view = await publicSession(page, id);
    const ids = view.audits.map((audit: any) => audit.question.id);
    record("OLD_TAB_CANNOT_DOUBLE_ANSWER", view.audits.length === 1 && new Set(ids).size === ids.length, `answers saved after two tabs answered Q1: ${view.audits.length}; old tab result: ${staleOutcome}`);
    await context.close();
  });

  await scenario("STUDENT_CANNOT_READ_ANOTHER", async () => {
    const owner = await opened("owner");
    const id = await startFactorisation(owner.page);
    const other = await opened("other_student");
    const status = (useHeaders: boolean) => other.page.evaluate(async ({ id, useHeaders }: { id: string; useHeaders: boolean }) => {
      const student = JSON.parse(localStorage.getItem("cogna_student") ?? "{}");
      const headers: Record<string, string> = useHeaders ? { "X-Cogna-Role": "student", "X-Cogna-Student-Id": student.studentId, "X-Cogna-Student-Token": student.token } : {};
      return (await fetch(`/api/lotus/sessions/${id}`, { headers })).status;
    }, { id, useHeaders });
    const asOther = await status(true);
    const asNobody = await status(false);
    record("STUDENT_CANNOT_READ_ANOTHER", asOther >= 401 && asOther < 500 && asNobody >= 401 && asNobody < 500, `another student got HTTP ${asOther}; no login got HTTP ${asNobody} (demo identities, development mode)`);
    await owner.context.close(); await other.context.close();
  });

  await scenario("ANSWERS_NOT_SENT_TO_BROWSER", async () => {
    const { context, page } = await opened("leak");
    const id = await startFactorisation(page);
    const secret = await privateQuestion(id);
    const view = await publicSession(page, id);
    // The answerKey field exists but must be empty: the page's data shape is kept while the contents are removed.
    const questions = [view.currentQuestion, ...(view.upcomingQuestions ?? [])].filter(Boolean);
    const leaked = questions.filter((item: any) => item.answerKey?.canonicalAnswer || item.answerKey?.workedSolution?.length || item.answerKey?.diagnostics);
    const privateRead = !questions.some((item: any) => item.id === secret.id && item.answerKey?.canonicalAnswer === secret.answerKey.canonicalAnswer);
    const html = await page.content();
    const inPage = ["predictedMistakes", "workedSolution\":[\""].filter((field) => html.includes(field));
    const pass = leaked.length === 0 && privateRead && inPage.length === 0;
    record("ANSWERS_NOT_SENT_TO_BROWSER", pass, pass ? `${questions.length} current and upcoming questions were sent with empty answer keys; none in the page itself` : `${leaked.length} question(s) carried answer data; in page: ${inPage.join(", ") || "none"}`);
    await context.close();
  });

  await scenario("PRIVATE_TEST_DOOR_NEEDS_TOKEN", async () => {
    const { context, page } = await opened("door");
    const id = await startFactorisation(page);
    const response = await fetch(`${API_URL}/lotus/sessions/${id}/autonomous-evaluation-question`);
    record("PRIVATE_TEST_DOOR_NEEDS_TOKEN", response.status === 404, `without the token: HTTP ${response.status}`);
    await context.close();
  });

  await scenario("REPORT_WAITS_FOR_AI_REVIEWS", async () => {
    const flag = REVIEW_OUTAGE_FILE;
    await writeFile(flag, "outage", "utf8");
    const { context, page } = await opened("outage");
    try {
      const id = await startFactorisation(page);
      let status: string | undefined = "ACTIVE";
      for (let turn = 1; turn <= 19 && status === "ACTIVE"; turn += 1) {
        const result = await answerOne(page, id, turn);
        status = result.status;
        if (page.url().includes("/student/lotus/report")) break;
      }
      let held: any = await publicSession(page, id);
      for (let i = 0; i < 80 && !held.reportReview?.failing; i += 1) { await sleep(500); held = await publicSession(page, id); }
      await page.goto(`${WEB_URL}/student/lotus/report?session=${id}`, { waitUntil: "domcontentloaded" });
      await page.getByText(/still being reviewed/).first().waitFor({ state: "visible", timeout: 30_000 });
      const heldText = await page.evaluate(() => document.body.innerText);
      if (ARTIFACT_DIR) await page.screenshot({ path: `${ARTIFACT_DIR}/report-held-during-outage.png`, fullPage: true });
      const heldCorrectly = held.finalReport === null && !/Competency Ratings/.test(heldText);
      await rm(flag, { force: true });
      let done: any = held;
      for (let i = 0; i < 120 && done.status !== "COMPLETE"; i += 1) { await sleep(500); done = await publicSession(page, id); }
      await page.getByText(/Competency Ratings/).first().waitFor({ state: "visible", timeout: 30_000 });
      const remaining = done.audits.filter((a: any) => ["PENDING", "FAILED"].includes(a.analysisStatus)).length;
      if (ARTIFACT_DIR) await page.screenshot({ path: `${ARTIFACT_DIR}/report-after-reviews.png`, fullPage: true });
      record("REPORT_WAITS_FOR_AI_REVIEWS", heldCorrectly && done.status === "COMPLETE" && remaining === 0, `during the outage: no report shown, ${held.reportReview?.outstanding ?? 0} reviews outstanding; after recovery: report ${done.status}, ${remaining} reviews unfinished`);
    } finally { await rm(flag, { force: true }); await context.close(); }
  });

  await scenario("PHONE_FULL_TEST", async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.clock.install();
    const result = await runPersona(page, persona, "normal", 99);
    record("PHONE_FULL_TEST", result.score.pass, `full test on a 375-wide phone screen, session ${result.sessionId}`);
    await context.close();
  });

  if (ARTIFACT_DIR) {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await writeFile(`${ARTIFACT_DIR}/scenarios.json`, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  }
}

async function main(): Promise<void> {
  assertIsolatedDatabase();
  // Messy personas run only when named, so the default run stays the tidy ten.
  // Says "I don't know" from the start, so the early-exit rule can be exercised.
  const overwhelmed: PersonaProfile = {
    ...PERSONA_CATALOGUE.find((p) => p.id === "P08_EXPLICIT_SUPPORT_NEED")!,
    id: "X10_OVERWHELMED",
    displayName: "Overwhelmed",
    supportSkills: ["FAC_DIVIDE_TERMS", "FAC_GCF_VARIABLE", "FAC_COMMON_MONOMIAL", "FAC_GCF_NEGATIVE", "FAC_GCF_NUMERIC"],
  };
  const selected = [...PERSONA_CATALOGUE, ...MESSY_PERSONA_CATALOGUE, overwhelmed].filter((persona) =>
    PERSONA_IDS.size === 0 ? !persona.messy && persona !== overwhelmed : PERSONA_IDS.has(persona.id));
  if (!selected.length) throw new Error("No requested persona IDs matched the catalogue");
  if (!PACES.length) throw new Error("LOTUS_AUTONOMOUS_EVAL_PACES must contain normal and/or fast");

  let chromium: any;
  try { ({ chromium } = await import("playwright")); } catch { throw new Error("Playwright is unavailable; install the workspace dependency first"); }

  const planned = selected.length * PACES.length * RUNS;
  log("plan", `${planned} autonomous session(s), ${MODEL_MODE} model, ${selected.length} profile(s), ${PACES.join("/")} pace`);
  if (MODEL_MODE === "live") log("plan", "live mode makes real provider calls; this run is authorised by its explicit environment flag");

  const apiEnv = {
    PORT: API_PORT,
    NODE_ENV: "development",
    LOTUS_E2E_FAKE_MODEL: MODEL_MODE === "fake" ? "true" : "false",
    LOTUS_E2E_DISABLE_QUESTION_BANK: MODEL_MODE === "fake" ? "true" : "false",
    LOTUS_AUTONOMOUS_EVAL_TOKEN: EVAL_TOKEN,
    LOTUS_E2E_REVIEW_OUTAGE_FILE: `${REPO_ROOT}${REVIEW_OUTAGE_FILE}`,
    LOTUS_E2E_REVIEW_RETRY_MS: "2000",
    ...(EVAL_DATABASE_URL ? { DATABASE_URL: EVAL_DATABASE_URL } : {}),
    // Allows the synthetic learner to retrieve the durable observer
    // projection only after its independent transcript has been sealed.
    LOTUS_DEV_OBSERVER_BYPASS: "true",
  };
  const api = SERVER_MODE === "start"
    ? spawnServer("api", ["apps/api/dist/main.js"], apiEnv, process.execPath)
    : spawnServer("api", ["--filter", "@cogna/api", "dev"], apiEnv);
  const webEnv = {
    PORT: WEB_PORT,
    NEXT_PUBLIC_API_URL: API_URL,
    API_URL,
  };
  const web = SERVER_MODE === "start"
    // The runner's cwd is the repository root; tell Next where the built app
    // lives or it looks for a root-level .next directory and exits silently.
    ? spawnServer("web", ["apps/web/node_modules/next/dist/bin/next", "start", "apps/web"], webEnv, process.execPath)
    : spawnServer("web", ["--filter", "@cogna/web", "dev"], webEnv);
  const results: any[] = [];
  const scorecard = () => {
    const scored = results.filter((r) => r.score?.metrics);
    const sum = (k: string) => scored.reduce((t, r) => t + (r.score.metrics[k] ?? 0), 0);
    return { sessions: scored.length, gapsExpected: sum("gapsExpected"), gapsFound: sum("gapsFound"), falseGaps: sum("falseGaps"), passed: scored.filter((r) => r.score.pass).length };
  };
  try {
    if (!await waitForReady(`${API_URL}/lotus/status`, SERVER_START_TIMEOUT_MS)) throw new Error(`API did not start\n${api.output()}`);
    if (!await waitForReady(WEB_URL, SERVER_START_TIMEOUT_MS)) throw new Error(`Web did not start\n${web.output()}`);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.clock.install();
      if (process.env.LOTUS_QA_SCENARIOS === "true") {
        await runBrowserScenarios(browser);
        return;
      }
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
              if (ARTIFACT_DIR) {
                await mkdir(ARTIFACT_DIR, { recursive: true });
                await page.screenshot({ path: `${ARTIFACT_DIR}/${persona.id}.${pace}.${run}.failure.png`, fullPage: true }).catch(() => undefined);
                await writeFile(`${ARTIFACT_DIR}/${persona.id}.${pace}.${run}.failure.json`, `${JSON.stringify({ persona: persona.id, pace, run, detail }, null, 2)}\n`, "utf8").catch(() => undefined);
              }
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
    // Kept for passing runs too: a review error can happen in a session that still finishes.
    if (ARTIFACT_DIR) await writeFile(`${ARTIFACT_DIR}/api-server.log`, api.fullOutput().split(EVAL_TOKEN).join("<token>"), "utf8").catch(() => undefined);
    killServerGroup(web);
    killServerGroup(api);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    modelMode: MODEL_MODE,
    plannedSessions: planned,
    passedSessions: results.filter((result) => result.score.pass).length,
    failedSessions: results.filter((result) => !result.score.pass).length,
    scorecard: scorecard(),
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  const card = report.scorecard;
  log("scorecard", `${card.passed}/${card.sessions} sessions passed · gaps found ${card.gapsFound}/${card.gapsExpected} · false gaps ${card.falseGaps}`);
  if (REPORT_PATH) await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (report.failedSessions > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
