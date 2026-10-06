/**
 * Dev only: an end-to-end check of the game formats in the real app.
 *
 * A teacher makes a class, one walkthrough student (walk_aarav) joins, the
 * teacher releases the Lotus diagnostic, and the student plays it through.
 * Every game question that appears (bracket bridge, garden, fireflies,
 * impostor, detective, fishing) is answered from the server's own demo fill
 * and screenshotted. Then the micro-lesson, the practice games and the
 * two-question exit (lantern gate) are played and screenshotted too.
 *
 *   node scripts/pilot-walkthrough/check-games.mjs --fake     # fake Lotus model, free
 *
 * Needs: web on :3000, API on :3001 (and :3098 with --fake), COGNA_WALKTHROUGH_FILL=true,
 * the walkthrough students seeded (seed-students.mjs). Screenshots go to out/games/<run>/.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RUN = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = join(HERE, "out", "games", RUN);
const BASE = process.env.COGNA_WEB_URL ?? "http://localhost:3000";
const FAKE = process.argv.includes("--fake");
const GAP = process.env.CHECK_GAP ?? "signs";
// --pace=4000 answers at a human pace, so background reviews land mid-test (how real classes run).
const PACE = Number(process.argv.find((a) => a.startsWith("--pace="))?.slice("--pace=".length) ?? 0);
const MINUTE = 180_000; // dev pages compile on first visit
mkdirSync(OUT, { recursive: true });

const seen = { diagnostic: {}, practice: [], errors: [] };
const t0 = Date.now();
const log = (...args) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...args);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (t) => String(t ?? "").replace(/[−–]/g, "-").replace(/²/g, "^2").replace(/³/g, "^3").replace(/\s+/g, "").toLowerCase().replace(/(^|[^0-9a-z])1([a-z])/g, "$1$2");

const browser = await chromium.launch({ headless: !process.argv.includes("--headed") });
async function person() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ fake }) => {
    try {
      localStorage.setItem("cogna_dev_mode", fake ? "on" : "off");
      if (fake) localStorage.setItem("cogna_lotus_model_mode", "fake");
    } catch {}
  }, { fake: FAKE });
  const page = await context.newPage();
  page.on("pageerror", (e) => seen.errors.push(e.message));
  return page;
}
function studentHeaders() {
  const s = JSON.parse(localStorage.getItem("cogna_student") || "{}");
  const fake = localStorage.getItem("cogna_dev_mode") !== "off" && localStorage.getItem("cogna_lotus_model_mode") === "fake";
  return { "X-Cogna-Role": "student", "X-Cogna-Student-Id": s.studentId, "X-Cogna-Student-Token": s.token, ...(fake ? { "x-cogna-lotus-model-mode": "fake" } : {}) };
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });

// ---------------- teacher: class + release
const teacher = await person();
await teacher.goto(`${BASE}/teacher/login`, { waitUntil: "domcontentloaded" });
await pause(2500); // let the page hydrate before using its forms
await teacher.locator("form button[type=submit], form button").last().click();
await teacher.waitForURL(/\/teacher\/(today|classes|sessions)/, { timeout: MINUTE, waitUntil: "commit" });
await teacher.goto(`${BASE}/teacher/sessions`, { waitUntil: "domcontentloaded" });
await pause(2500); // let the page hydrate before using its forms
// With classes already there, open the new-class form from the class tabs; a first-ever class shows the form directly.
const nameField = teacher.locator("form input").first();
if (!(await nameField.isVisible().catch(() => false))) {
  await teacher.getByRole("button", { name: /new class/i }).first().click();
}
await nameField.fill(`Games check ${RUN.slice(11)}`);
await teacher.getByRole("button", { name: /Create class and get a code/ }).click();
await teacher.getByText(/0 joined so far/).waitFor({ timeout: MINUTE });
const joinCode = (await teacher.getByTestId("join-code").first().textContent()).trim();
log("class", joinCode);

// ---------------- student joins
const page = await person();
await page.goto(`${BASE}/student/login`, { waitUntil: "domcontentloaded" });
await pause(2500); // let the page hydrate before using its forms
await page.locator("form input").first().fill("AARAV-8B");
await page.locator("form button[type=submit], form button").last().click();
await page.waitForURL(/\/student\/home/, { timeout: MINUTE, waitUntil: "commit" });
await page.goto(`${BASE}/student/classroom/live`, { waitUntil: "domcontentloaded" });
await pause(2500); // let the page hydrate before using its forms
await page.locator("label", { hasText: /^Class code$/ }).waitFor();
const inputs = page.locator("form input");
await inputs.nth(0).fill(joinCode);
await inputs.nth(1).fill("8B-03");
await page.getByRole("button", { name: /Join class/ }).click();
await page.getByText(/Joined:/).waitFor();
// The console polls the roster; the join shows within a few seconds.
await teacher.getByText(/1 joined so far/).waitFor({ timeout: 2 * MINUTE });
await teacher.getByRole("button", { name: /Start the quick check/ }).click();
await teacher.getByTestId("roster-row").first().waitFor({ timeout: MINUTE });
log("released");

// ---------------- diagnostic
if (process.env.DEBUG_LOTUS) {
  // Every Lotus call the page makes, with how long it took: shows what a slow turn is waiting on.
  const started = new Map();
  page.on("request", (r) => r.url().includes("/api/lotus") && started.set(r, Date.now()));
  const done = (r, how) => {
    if (!started.has(r)) return;
    const ms = Date.now() - started.get(r);
    log(`  ${how} ${r.method()} ${r.url().replace(/^.*\/api\/lotus/, "").replace(/[0-9a-f-]{36}/, ":id").slice(0, 60)} ${ms}ms`);
    started.delete(r);
  };
  page.on("requestfinished", (r) => done(r, "ok"));
  page.on("requestfailed", (r) => done(r, `FAILED(${r.failure()?.errorText})`));
  page.on("console", (m) => m.type() === "error" && log(`  console: ${m.text().slice(0, 160)}`));
}
let sessionId = "";
page.on("response", async (res) => {
  if (res.request().method() === "POST" && /\/api\/lotus\/sessions(\?|$)/.test(res.url())) {
    try { sessionId = (await res.json()).sessionId ?? sessionId; } catch {}
  }
});
await page.getByRole("link", { name: /Start the quick check|Start the diagnostic|Carry on/ }).first().click({ timeout: MINUTE });
await page.waitForURL(/\/student\/lotus/, { waitUntil: "commit" });
await page.getByRole("button", { name: /^Start/ }).first().click({ timeout: MINUTE });

async function demoFill() {
  return page.evaluate(async ({ sessionId, gap, headersFn }) => {
    const headers = new Function(`return (${headersFn})()`)();
    const r = await fetch(`/api/lotus/sessions/${sessionId}/demo-fill?studentId=walk_aarav&gap=${gap}`, { headers });
    if (!r.ok) throw new Error(`demo-fill ${r.status}: ${await r.text()}`);
    return r.json();
  }, { sessionId, gap: GAP, headersFn: studentHeaders.toString() });
}

/** Which way this question is staged on screen. */
async function staging() {
  return page.evaluate(() => {
    const has = (sel) => !!document.querySelector(sel);
    if (has("[class*=night]")) return "FIREFLY";
    if (has("[class*=crits]")) return "IMPOSTOR";
    if (has("[class*=caseFile]")) return "DETECTIVE";
    if (has("[class*=fishpond]")) return "FISHING";
    const game = document.querySelector("[class*=game][data-theme]");
    if (game) return game.getAttribute("data-theme") === "garden" ? "GARDEN" : `TILES_${game.getAttribute("data-theme").toUpperCase()}`;
    if (has("input[name=lotus-answer]")) return "CHOICE";
    if (has("#lotus-answer")) return "TYPED";
    return null;
  });
}

async function clickByText(selector, text) {
  const items = page.locator(selector);
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    if (norm(await items.nth(i).innerText()) .includes(norm(text)) && norm(text).length > 0) {
      const full = norm(await items.nth(i).innerText());
      if (full === norm(text) || full.replace(/🎣/g, "") === norm(text)) { await items.nth(i).click({ force: true }); return true; }
    }
  }
  // Fall back to the closest match (labels are prettified on screen).
  for (let i = 0; i < n; i++) {
    if (norm(await items.nth(i).innerText()).includes(norm(text))) { await items.nth(i).click({ force: true }); return true; }
  }
  return false;
}

/** Fill tile boxes from an answer like "(x - 5)(x + 3)" or "2(x - 3)(x + 3)". */
async function buildTiles(answer) {
  const tiles = page.locator("[class*=bank] button");
  const labels = (await tiles.allInnerTexts()).map(norm);
  const target = norm(answer);
  const used = new Set();
  let rest = target;
  // Greedy: take the longest tile label that the remaining answer starts with (as is, or inside a bracket).
  for (let guard = 0; guard < 6 && rest; guard++) {
    let best = -1;
    for (let i = 0; i < labels.length; i++) {
      if (used.has(i)) continue;
      const l = labels[i];
      const forms = [l, `(${l})`, l.replace(/^\+/, ""), `+${l}`];
      if (forms.some((f) => rest.startsWith(f)) && (best < 0 || l.length > labels[best].length)) best = i;
    }
    if (best < 0) break;
    used.add(best);
    await tiles.nth(best).click();
    const l = labels[best];
    const form = [`(${l})`, l, `+${l}`, l.replace(/^\+/, "")].find((f) => rest.startsWith(f));
    rest = rest.slice(form.length);
  }
  return rest.length === 0;
}

const shots = {};
for (let turn = 1; turn <= 30; turn++) {
  const outcome = await Promise.race([
    page.locator(".lotus-q, [class*=cardBody]").first().waitFor({ timeout: 5 * MINUTE }).then(() => "question"),
    page.waitForURL(/\/student\/lotus\/report/, { timeout: 5 * MINUTE, waitUntil: "commit" }).then(() => "report"),
  ]);
  if (outcome === "report" || page.url().includes("/report")) break;
  const ready = () => page.waitForFunction(() => location.pathname.includes("/report") || [...document.querySelectorAll("button")].some((b) => /Submit answer/.test(b.textContent) && !b.disabled), null, { timeout: 20_000, polling: 500 });
  if (!(await ready().then(() => true).catch(() => false))) {
    // A stall: record exactly what the student is looking at.
    const state = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll("button")].map((b) => `${b.textContent?.trim().slice(0, 40)}${b.disabled ? " [disabled]" : ""}`).filter((t) => /Submit|Saving|Retry|Checking|Start/.test(t)),
      error: document.querySelector("[class*=error]")?.textContent?.slice(0, 200) ?? null,
      heading: document.querySelector("h1, h2")?.textContent?.slice(0, 80) ?? null,
      question: document.querySelector("[class*=questionNumber]")?.textContent ?? null,
    })).catch((e) => ({ evaluateFailed: String(e) }));
    log(`STALL before turn ${turn}:`, JSON.stringify(state));
    await page.screenshot({ path: join(OUT, `stall-turn-${turn}.png`) }).catch(() => undefined);
    seen.stalls = [...(seen.stalls ?? []), { turn, state }];
    await page.waitForFunction(() => location.pathname.includes("/report") || [...document.querySelectorAll("button")].some((b) => /Submit answer/.test(b.textContent) && !b.disabled), null, { timeout: 5 * MINUTE, polling: 1000 });
    log(`stall before turn ${turn} cleared`);
  }
  if (page.url().includes("/report")) break;
  await pause(500 + PACE);
  const kind = await staging();
  if (!sessionId) throw new Error("no Lotus session id seen");
  const fill = await demoFill();
  seen.diagnostic[kind] = (seen.diagnostic[kind] ?? 0) + 1;
  if (kind === "FIREFLY") await clickByText("[class*=night] button", fill.answer);
  else if (kind === "IMPOSTOR") await clickByText("[class*=crits] button", fill.answer);
  else if (kind === "DETECTIVE") {
    await pause(3200);
    if (/^Line \d+$/.test(fill.answer)) await page.locator("[class*=caseFile] li").nth(Number(fill.answer.split(" ")[1])).locator("button").click();
    else await page.locator("[class*=nothing]").click();
  } else if (kind === "FISHING") {
    for (const part of fill.answer.split(" | ")) await clickByText("[class*=fishpond] button", part);
  } else if (kind === "GARDEN" || kind?.startsWith("TILES_")) {
    const ok = await buildTiles(fill.answer);
    if (!ok) log(`turn ${turn}: could not build ${fill.answer} from the tiles`);
  } else if (kind === "CHOICE") {
    await clickByText("label", fill.answer);
  } else if (kind === "TYPED") {
    await page.locator("#lotus-answer").fill(fill.answer);
    const step = page.locator("[aria-label='Working step 1']");
    if (await step.count()) await step.fill(fill.working.split("\n")[0] ?? fill.answer);
  }
  const conf = page.locator("[class*=confidenceChoices] button");
  if (await conf.count()) await conf.last().click();
  if (kind && kind !== "TYPED" && kind !== "CHOICE" && !shots[kind]) {
    shots[kind] = true;
    await page.locator("[class*=cardBody]").first().screenshot({ path: join(OUT, `diagnostic-${kind.toLowerCase()}.png`) });
  }
  log(`turn ${turn}: ${kind} → ${fill.answer}`);
  await page.getByRole("button", { name: /Submit answer/ }).click();
  await pause(600);
}
log("diagnostic done", seen.diagnostic);
await page.waitForURL(/\/student\/lotus\/report/, { timeout: 5 * MINUTE, waitUntil: "commit" }).catch(() => undefined);
await pause(2500);
await shot(page, "report-bloom");

// ---------------- lesson: micro-lesson first
const lessonLink = page.getByRole("link", { name: /Learn lesson/ });
await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => /Learn lesson/.test(a.textContent) && a.getAttribute("aria-disabled") !== "true"), null, { timeout: MINUTE });
await lessonLink.click();
await page.waitForURL(/personalized-video/, { timeout: MINUTE, waitUntil: "commit" });
const micro = page.locator("[aria-label='Your 20-second lesson']");
if (await micro.waitFor({ timeout: 4 * MINUTE }).then(() => true).catch(() => false)) {
  await micro.screenshot({ path: join(OUT, "micro-poster.png") });
  await micro.locator("button[aria-label^='Play']").click();
  await pause(9000);
  await micro.screenshot({ path: join(OUT, "micro-playing.png") });
  await micro.locator("[class*=check]").waitFor({ timeout: 90_000 });
  await micro.locator("[class*=option]").first().click();
  await pause(800);
  await micro.screenshot({ path: join(OUT, "micro-check.png") });
  seen.micro = true;
} else {
  log("no micro-lesson shown");
  seen.micro = false;
}

// ---------------- practice games
const toPractice = page.getByRole("button", { name: /I've watched it/ }).first();
await toPractice.waitFor({ timeout: MINUTE }).catch(() => undefined);
if (await toPractice.count()) await toPractice.click().catch(() => undefined);
await page.getByText(/Question 1 of \d+/).waitFor({ timeout: MINUTE }).catch(() => undefined);
await pause(800);
for (let i = 0; i < 10; i++) {
  const card = page.locator("section[class*=arena]").first();
  if (!(await card.count()) || !(await page.getByText(/Question \d+ of \d+/).count())) break;
  const kind = await page.evaluate(() => {
    const has = (s) => !!document.querySelector(s);
    if (has("[class*=desk]")) return "mark-it";
    if (has("[class*=rushIntro], [class*=well]")) return "rush";
    if (has("[class*=rect] [class*=board]")) return "rectangle";
    if (has("[class*=safe]")) return "factor-safe";
    if (has("[class*=game][data-theme]")) return "build";
    return "other";
  });
  seen.practice.push(kind);
  await card.screenshot({ path: join(OUT, `practice-${i + 1}-${kind}.png`) }).catch(() => undefined);
  const next = page.getByRole("button", { name: /Next|One on your own/ });
  // Play just enough of each game to move on (reveal after misses).
  if (kind === "rectangle") { for (let k = 0; k < 3; k++) await page.getByRole("button", { name: /Does it fit/ }).click().catch(() => undefined); }
  else if (kind === "factor-safe") { for (let k = 0; k < 3; k++) await page.getByRole("button", { name: /Try to open/ }).click().catch(() => undefined); }
  else if (kind === "build") { await page.locator("[class*=bank] button").nth(0).click(); await page.locator("[class*=bank] button").nth(1).click(); for (let k = 0; k < 3; k++) await page.getByRole("button", { name: /^Check$/ }).click().catch(() => undefined); }
  else if (kind === "mark-it") {
    for (let p = 0; p < 3; p++) {
      await page.getByRole("button", { name: /✓ Right/ }).click().catch(() => undefined);
      await pause(500);
      const reason = page.getByRole("button", { name: /Sign slip|Forgot a term|Not finished|Wrong pair/ });
      for (let r = 0; r < 4 && (await reason.count()); r++) { await reason.nth(r).click().catch(() => undefined); await pause(300); }
      await page.getByRole("button", { name: /Next paper|Finish/ }).click().catch(() => undefined);
      await pause(400);
    }
    await card.screenshot({ path: join(OUT, `practice-${i + 1}-mark-it-done.png`) }).catch(() => undefined);
  } else if (kind === "rush") {
    await page.getByRole("button", { name: /^Start$/ }).click();
    await pause(1500);
    await card.screenshot({ path: join(OUT, `practice-${i + 1}-rush-playing.png`) }).catch(() => undefined);
    for (let k = 0; k < 6; k++) { await page.locator("[class*=answers] button").first().click().catch(() => undefined); await pause(1100); }
    const ended = await page.waitForFunction(() => !!document.querySelector("[class*=rushScore]"), null, { timeout: 70_000 }).then(() => true).catch(() => false);
    await card.screenshot({ path: join(OUT, `practice-${i + 1}-rush-${ended ? "end" : "stuck"}.png`) }).catch(() => undefined);
    seen.rushEnded = ended;
  } else {
    const first = page.locator("[class*=tiles] button, [class*=choices] button, [class*=lines] button").first();
    for (let k = 0; k < 3 && (await first.count()); k++) { await first.click().catch(() => undefined); await pause(400); }
    const typed = page.locator("input[aria-label='Your answer']");
    if (await typed.count()) for (let k = 0; k < 2; k++) { await typed.fill("(x + 1)(x + 2)"); await page.getByRole("button", { name: /^Check$/ }).click().catch(() => undefined); await pause(500); }
  }
  await next.first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  const label = (await next.first().innerText().catch(() => "")) ?? "";
  await next.first().click().catch(() => undefined);
  await pause(800);
  if (/One on your own/.test(label)) break;
}
log("practice", seen.practice);

// ---------------- exit: lantern gate
await page.getByRole("button", { name: /One on your own/ }).click({ timeout: 20_000 }).catch(() => undefined);
await pause(1500);
await page.getByText(/no hints this time/).waitFor({ timeout: MINUTE }).catch(() => undefined);
for (let q = 0; q < 2; q++) {
  if (!(await page.getByRole("button", { name: /Seal my answer/ }).count())) break;
  await shot(page, `exit-${q + 1}`);
  const tiles = page.locator("[class*=bank] button");
  const n = await tiles.count();
  for (let k = 0; k < Math.min(3, n); k++) {
    if (!(await page.getByRole("button", { name: /Seal my answer/ }).isDisabled())) break;
    await tiles.nth(k).click();
  }
  await page.getByRole("button", { name: /Seal my answer/ }).click();
  await pause(2500);
}
await shot(page, "exit-result");
seen.exitResult = await page.locator("h2").first().innerText().catch(() => "");

// ---------------- teacher sees it
await teacher.reload();
await pause(2500);
await teacher.screenshot({ path: join(OUT, "teacher-roster.png"), fullPage: true });

writeFileSync(join(OUT, "summary.json"), JSON.stringify(seen, null, 2));
log("summary", JSON.stringify(seen));
log("screenshots in", OUT);
await browser.close();
