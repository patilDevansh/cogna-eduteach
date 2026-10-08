/**
 * Records one student's voice-and-video tutoring in the real app, for the
 * "how tutoring works in Cogna" video (video/render-tutoring.mjs).
 *
 * A teacher makes a class and starts the quick check; walk_aarav joins and
 * plays the diagnostic games (with "Read it to me"), sees the report, plays
 * the narrated 20-second micro-lesson and the full narrated lesson, plays
 * the practice games and the two-question exit. The answers are scripted
 * (the dev-only demo fill); everything Cogna does in response is live.
 *
 * Every sound the app plays (read-aloud, micro-lesson and lesson narration)
 * is captured with its start time, so the edit can lay the app's own voice
 * under the footage.
 *
 *   node scripts/pilot-walkthrough/record-tutoring.mjs            # real model
 *   node scripts/pilot-walkthrough/record-tutoring.mjs --fake     # free fake model
 *
 * Writes teacher.webm, aarav.webm, sounds/ and timeline.json to out/tutoring/<run>/.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RUN = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = join(HERE, "out", "tutoring", RUN);
const BASE = process.env.COGNA_WEB_URL ?? "http://localhost:3000";
const FAKE = process.argv.includes("--fake");
const GAP = process.env.CHECK_GAP ?? "signs";
const SIZE = { width: 1280, height: 800 };
const MINUTE = 180_000; // dev pages compile on first visit
mkdirSync(join(OUT, "sounds"), { recursive: true });

const t0 = Date.now();
const timeline = { startedAt: new Date(t0).toISOString(), model: FAKE ? "fake" : "real", clips: {}, marks: [], sounds: [] };
function mark(who, label, extra = {}) {
  const at = (Date.now() - t0) / 1000;
  timeline.marks.push({ who, label, at, ...extra });
  console.log(`[${at.toFixed(1).padStart(6)}s] ${who.padEnd(8)} ${label}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ""}`);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Watchdog: names any step that runs over 20 s, with a screenshot, so a slow spot is never a mystery.
let step = { name: "start", at: Date.now(), warned: false };
const stepTo = (name) => { step = { name, at: Date.now(), warned: false }; };
let watchedPage = null;
setInterval(() => {
  if (step.warned || Date.now() - step.at < 20_000) return;
  step.warned = true;
  console.log(`SLOW step "${step.name}" (${Math.round((Date.now() - step.at) / 1000)}s so far)`);
  watchedPage?.screenshot({ path: join(OUT, `slow-${step.name.replace(/\W+/g, "-")}.png`) }).catch(() => undefined);
}, 2000).unref();
const norm = (t) => String(t ?? "").replace(/[−–]/g, "-").replace(/²/g, "^2").replace(/³/g, "^3").replace(/\s+/g, "").toLowerCase().replace(/(^|[^0-9a-z])1([a-z])/g, "$1$2");

// Audio must really play (its "ended" event moves the lessons on); muted so the machine stays quiet.
const browser = await chromium.launch({
  headless: !process.argv.includes("--headed"),
  args: [
    "--autoplay-policy=no-user-gesture-required", "--mute-audio",
    // Two pages share this browser; neither may be treated as backgrounded (timers slowed to once a minute).
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion",
  ],
});

async function person(who, { video = true } = {}) {
  const dir = join(OUT, who);
  // Video encoding is the heaviest part of a run: only the student's screen is filmed; the teacher's is photographed.
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, ...(video ? { recordVideo: { dir, size: SIZE } } : {}) });
  await context.addInitScript(({ fake }) => {
    try {
      localStorage.setItem("cogna_dev_mode", fake ? "on" : "off");
      if (fake) localStorage.setItem("cogna_lotus_model_mode", "fake");
    } catch {}
    // Dev-only overlays (Next's badge, the dev switch, dev notes) stay out of the footage.
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = 'nextjs-portal, [class*="dev-panel_root"], p[class*="practice_dev"] { display: none !important; }';
      document.head.append(style);
    });
    // Report every sound the page starts, with its bytes, so the edit can use the app's own voice.
    const seen = new WeakMap();
    const report = (el) => {
      const src = el.currentSrc || el.src;
      if (!src || seen.get(el) === src) return; // a resume after a pause is the same sound
      seen.set(el, src);
      const wall = Date.now() - el.currentTime * 1000;
      if (src.startsWith("data:")) {
        // The bytes are already here: no fetch, no re-encoding on the page's thread.
        window.__cognaSound?.({ wall, type: src.slice(5, src.indexOf(";")), data: src.slice(src.indexOf(",") + 1) });
        return;
      }
      fetch(src).then((r) => r.arrayBuffer()).then((buf) => {
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        window.__cognaSound?.({ wall, type: src.startsWith("data:") ? src.slice(5, src.indexOf(";")) : "", data: btoa(bin) });
      }).catch(() => undefined);
    };
    // In-page <audio> elements announce "playing"; detached `new Audio()` (read-aloud, micro-lesson) only calls play().
    document.addEventListener("playing", (event) => report(event.target), true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      const result = play.apply(this, args);
      Promise.resolve(result).then(() => report(this), () => undefined);
      return result;
    };
  }, { fake: FAKE });
  await context.exposeBinding("__cognaSound", (_source, sound) => {
    const ext = /wav/.test(sound.type) ? "wav" : "mp3";
    const file = `sounds/${who}-${timeline.sounds.length + 1}.${ext}`;
    writeFileSync(join(OUT, file), Buffer.from(sound.data, "base64"));
    const at = (sound.wall - t0) / 1000;
    timeline.sounds.push({ who, at, file });
    console.log(`[${at.toFixed(1).padStart(6)}s] ${who.padEnd(8)} sound ${file}`);
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`page error (${who}): ${e.message}`));
  timeline.clips[who] = { startedAt: (Date.now() - t0) / 1000 };
  return { context, page, dir };
}

/** Moves the mouse to an element before clicking, so a click reads as a click. */
async function click(page, locator, options = {}) {
  // Moving targets (swimming fish, fireflies) never settle: click them where they are.
  if (options.force) return locator.click(options);
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
  const box = await locator.boundingBox({ timeout: 3000 }).catch(() => null);
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await pause(200);
  // A click that hangs mid-action (a busy page) is retried as a plain DOM click.
  await locator.click({ timeout: 10_000, ...options }).catch(async (err) => {
    if (options.timeout) throw err;
    console.log(`click retried as a DOM click: ${String(err.message).split("\n")[0]}`);
    await locator.evaluate((el) => el.click());
  });
}

// ---------------- teacher: class + start
const T = await person("teacher", { video: false });
const snap = (name) => T.page.screenshot({ path: join(OUT, `teacher-${name}.png`) }).catch(() => undefined);
const teacher = T.page;
await teacher.goto(`${BASE}/teacher/login`, { waitUntil: "domcontentloaded" });
await pause(2500); // let the page hydrate before using its forms
mark("teacher", "login");
await click(teacher, teacher.locator("form button[type=submit], form button").last());
await teacher.waitForURL(/\/teacher\/(today|classes|sessions)/, { timeout: MINUTE, waitUntil: "commit" });
await teacher.goto(`${BASE}/teacher/sessions`, { waitUntil: "domcontentloaded" });
await pause(2500);
const nameField = teacher.locator("form input").first();
if (!(await nameField.isVisible().catch(() => false))) await click(teacher, teacher.getByRole("button", { name: /new class/i }).first());
await nameField.fill("");
await nameField.pressSequentially("Grade 8 · Section B", { delay: 45 });
await click(teacher, teacher.getByRole("button", { name: /Create class and get a code/ }));
await teacher.getByText(/0 joined so far/).waitFor({ timeout: MINUTE });
const joinCode = (await teacher.getByTestId("join-code").first().textContent()).trim();
mark("teacher", "class-created", { joinCode });
await snap("class");

// ---------------- student joins
const S = await person("aarav");
const page = S.page;
watchedPage = page;
await page.goto(`${BASE}/student/login`, { waitUntil: "domcontentloaded" });
await pause(2500);
mark("aarav", "login");
await page.locator("form input").first().pressSequentially("AARAV-8B", { delay: 60 });
await click(page, page.locator("form button[type=submit], form button").last());
await page.waitForURL(/\/student\/home/, { timeout: MINUTE, waitUntil: "commit" });
await page.goto(`${BASE}/student/classroom/live`, { waitUntil: "domcontentloaded" });
await pause(2500);
await page.locator("label", { hasText: /^Class code$/ }).waitFor();
const inputs = page.locator("form input");
await inputs.nth(0).pressSequentially(joinCode, { delay: 60 });
await inputs.nth(1).pressSequentially("8B-03", { delay: 60 });
await click(page, page.getByRole("button", { name: /Join class/ }));
await page.getByText(/Joined:/).waitFor();
mark("aarav", "joined");

await teacher.getByText(/1 joined so far/).waitFor({ timeout: 2 * MINUTE });
await pause(1500);
await snap("joined");
mark("teacher", "release");
await click(teacher, teacher.getByRole("button", { name: /Start the quick check/ }));
await teacher.getByTestId("roster-row").first().waitFor({ timeout: MINUTE });
mark("teacher", "released");
await pause(1500);
await snap("released");

// ---------------- diagnostic
let sessionId = "";
page.on("response", async (res) => {
  if (res.request().method() === "POST" && /\/api\/lotus\/sessions(\?|$)/.test(res.url())) {
    try { sessionId = (await res.json()).sessionId ?? sessionId; } catch {}
  }
});
await click(page, page.getByRole("link", { name: /Start the quick check|Carry on/ }).first(), { timeout: MINUTE });
await page.waitForURL(/\/student\/lotus/, { waitUntil: "commit" });
await pause(1500);
await click(page, page.getByRole("button", { name: /^Start/ }).first(), { timeout: MINUTE });
mark("aarav", "diagnostic-start");

function studentHeaders() {
  const s = JSON.parse(localStorage.getItem("cogna_student") || "{}");
  const fake = localStorage.getItem("cogna_dev_mode") !== "off" && localStorage.getItem("cogna_lotus_model_mode") === "fake";
  return { "X-Cogna-Role": "student", "X-Cogna-Student-Id": s.studentId, "X-Cogna-Student-Token": s.token, ...(fake ? { "x-cogna-lotus-model-mode": "fake" } : {}) };
}
async function demoFill() {
  return page.evaluate(async ({ sessionId, gap, headersFn }) => {
    const headers = new Function(`return (${headersFn})()`)();
    const r = await fetch(`/api/lotus/sessions/${sessionId}/demo-fill?studentId=walk_aarav&gap=${gap}`, { headers });
    if (!r.ok) throw new Error(`demo-fill ${r.status}: ${await r.text()}`);
    return r.json();
  }, { sessionId, gap: GAP, headersFn: studentHeaders.toString() });
}
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
  for (const loose of [false, true]) {
    for (let i = 0; i < n; i++) {
      const full = norm(await items.nth(i).innerText());
      const hit = loose ? full.includes(norm(text)) : full === norm(text) || full.replace(/🎣/g, "") === norm(text);
      if (hit && norm(text)) { await click(page, items.nth(i), { force: true }); return true; }
    }
  }
  return false;
}
/** Fill tile boxes from an answer like "(x - 5)(x + 3)". */
async function buildTiles(answer) {
  const tiles = page.locator("[class*=bank] button");
  const labels = (await tiles.allInnerTexts()).map(norm);
  const used = new Set();
  let rest = norm(answer);
  for (let guard = 0; guard < 6 && rest; guard++) {
    let best = -1;
    for (let i = 0; i < labels.length; i++) {
      if (used.has(i)) continue;
      const forms = [labels[i], `(${labels[i]})`, labels[i].replace(/^\+/, ""), `+${labels[i]}`];
      if (forms.some((f) => rest.startsWith(f)) && (best < 0 || labels[i].length > labels[best].length)) best = i;
    }
    if (best < 0) break;
    used.add(best);
    await click(page, tiles.nth(best));
    await pause(350);
    const l = labels[best];
    rest = rest.slice([`(${l})`, l, `+${l}`, l.replace(/^\+/, "")].find((f) => rest.startsWith(f)).length);
  }
  return rest.length === 0;
}

let readAloudDone = false;
let seenReasons = 0;
for (let turn = 1; turn <= 30; turn++) {
  const outcome = await Promise.race([
    page.locator(".lotus-q, [class*=cardBody]").first().waitFor({ timeout: 5 * MINUTE }).then(() => "question", () => "timeout"),
    page.waitForURL(/\/student\/lotus\/report/, { timeout: 5 * MINUTE, waitUntil: "commit" }).then(() => "report", () => "timeout"),
  ]);
  if (outcome === "report" || page.url().includes("/report")) break;
  // "How did you get it?" after an answer code couldn't explain: one tap, then the next question.
  const reason = page.locator("[class*=reasonOptions] button");
  if (await reason.first().waitFor({ timeout: 1500 }).then(() => true, () => false)) {
    await pause(1800);
    await click(page, reason.first());
    seenReasons += 1;
    await page.locator("[class*=reasonOptions]").waitFor({ state: "detached", timeout: MINUTE }).catch(() => undefined);
  }
  const ready = await page.waitForFunction(() => location.pathname.includes("/report") || [...document.querySelectorAll("button")].some((b) => /Submit answer/.test(b.textContent) && !b.disabled), null, { timeout: 5 * MINUTE, polling: 500 }).then(() => true, () => false);
  if (!ready) {
    await page.screenshot({ path: join(OUT, `stall-turn-${turn}.png`) });
    throw new Error(`turn ${turn}: no question to answer (see stall-turn-${turn}.png)`);
  }
  if (page.url().includes("/report")) break;
  await pause(900);
  const kind = await staging();
  if (!sessionId) throw new Error("no Lotus session id seen");
  mark("aarav", "question", { turn, kind });
  stepTo(`turn ${turn} ${kind}: answer`);
  if (!readAloudDone) {
    // "Read it to me": the question, read in Cogna's voice.
    const read = page.getByRole("button", { name: /Read it to me/ });
    if (await read.count()) {
      mark("aarav", "read-aloud");
      await click(page, read);
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => /Reading…/.test(b.textContent)), null, { timeout: 12_000, polling: 300 }).catch(() => undefined);
      await pause(600);
      readAloudDone = true;
    }
  }
  const fill = await demoFill();
  await pause(kind === "TYPED" || kind === "CHOICE" ? 600 : 1500); // a moment to see the game
  if (kind === "FIREFLY") await clickByText("[class*=night] button", fill.answer);
  else if (kind === "IMPOSTOR") await clickByText("[class*=crits] button", fill.answer);
  else if (kind === "DETECTIVE") {
    await pause(3200);
    if (/^Line \d+$/.test(fill.answer)) await click(page, page.locator("[class*=caseFile] li").nth(Number(fill.answer.split(" ")[1])).locator("button"));
    else await click(page, page.locator("[class*=nothing]"));
  } else if (kind === "FISHING") {
    for (const part of fill.answer.split(" | ")) { await clickByText("[class*=fishpond] button", part); await pause(400); }
  } else if (kind === "GARDEN" || kind?.startsWith("TILES_")) {
    if (!(await buildTiles(fill.answer))) console.log(`turn ${turn}: could not build ${fill.answer} from the tiles`);
  } else if (kind === "CHOICE") {
    await clickByText("label", fill.answer);
  } else if (kind === "TYPED") {
    await page.locator("#lotus-answer").pressSequentially(fill.answer, { delay: 25 });
    const step = page.locator("[aria-label='Working step 1']");
    if (await step.count()) await step.fill(fill.working.split("\n")[0] ?? fill.answer);
  }
  const conf = page.locator("[class*=confidenceChoices] button");
  if (await conf.count()) await click(page, conf.last());
  await pause(kind === "TYPED" || kind === "CHOICE" ? 300 : 1000);
  stepTo(`turn ${turn} ${kind}: submit`);
  await click(page, page.getByRole("button", { name: /Submit answer/ }));
  mark("aarav", "answer", { turn, kind });
  stepTo(`turn ${turn + 1}: wait for question`);
  await pause(600);
}
await page.waitForURL(/\/student\/lotus\/report/, { timeout: 5 * MINUTE, waitUntil: "commit" }).catch(() => undefined);
await pause(1500);
mark("aarav", "report");
await pause(4000);
await page.mouse.wheel(0, 500);
await pause(2500);

// ---------------- lessons: the 20-second micro-lesson, then the full narrated lesson
await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => /Learn lesson/.test(a.textContent) && a.getAttribute("aria-disabled") !== "true"), null, { timeout: 2 * MINUTE });
await click(page, page.getByRole("link", { name: /Learn lesson/ }));
await page.waitForURL(/personalized-video/, { timeout: MINUTE, waitUntil: "commit" });
mark("aarav", "lesson-page");
const micro = page.locator("[aria-label='Your 20-second lesson']");
if (await micro.waitFor({ timeout: 4 * MINUTE }).then(() => true).catch(() => false)) {
  await pause(1500);
  await micro.scrollIntoViewIfNeeded();
  mark("aarav", "micro-play");
  await click(page, micro.locator("button[aria-label^='Play']"));
  await micro.locator("[class*=check]").waitFor({ timeout: 3 * 60_000 });
  mark("aarav", "micro-check");
  await pause(1500);
  // Answer the quick check: try options until it says yes.
  const options = micro.locator("[class*=option]");
  for (let i = 0; i < (await options.count()); i++) {
    await click(page, options.nth(i));
    await pause(2200);
    if (await micro.locator("[data-ok]").count()) break;
  }
  mark("aarav", "micro-done");
  await pause(1500);
} else {
  mark("aarav", "no-micro");
}

const start = page.getByRole("button", { name: /Start lesson/ });
await start.waitFor({ timeout: 4 * MINUTE }).catch(() => undefined);
if (await start.count()) {
  await start.scrollIntoViewIfNeeded();
  await pause(800);
  mark("aarav", "lesson-play");
  await click(page, start);
  // Keep the lesson's slide in view while it plays.
  await pause(400);
  await page.locator("[class*=videoStage]").first().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => undefined);
  // The lesson moves itself on when each line of narration ends; it finishes into practice.
  const until = Date.now() + 6 * 60_000;
  while (Date.now() < until && !(await page.getByText(/Question 1 of \d+/).count())) {
    const chip = page.locator("[class*=dragTray] [class*=dragChip]");
    if (await chip.count()) {
      // A balance step: drag the chip onto both sides, then check.
      for (const zone of ["left", "right"]) {
        const from = await chip.boundingBox();
        const zones = page.locator("[class*=dragZone]");
        const to = await zones.nth(zone === "left" ? 0 : 1).boundingBox();
        if (!from || !to) break;
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
        await page.mouse.up();
        await pause(500);
        if (!(await chip.count())) break;
      }
      const check = page.getByRole("button", { name: /^Check$/ });
      if (await check.count()) await click(page, check);
      await pause(1500);
    }
    await pause(1000);
  }
  mark("aarav", "lesson-end");
}
const watched = page.getByRole("button", { name: /I've watched it/ }).first();
if (!(await page.getByText(/Question 1 of \d+/).count()) && (await watched.count())) await click(page, watched);

// ---------------- practice games
await page.getByText(/Question 1 of \d+/).waitFor({ timeout: MINUTE }).catch(() => undefined);
mark("aarav", "practice");
await pause(1200);
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
  mark("aarav", "practice-game", { kind, index: i });
  await pause(1500);
  const next = page.getByRole("button", { name: /Next|One on your own/ });
  if (kind === "rectangle") {
    for (let k = 0; k < 3; k++) { await click(page, page.getByRole("button", { name: /Does it fit/ })).catch(() => undefined); await pause(1200); }
  } else if (kind === "factor-safe") {
    for (let k = 0; k < 3; k++) { await click(page, page.getByRole("button", { name: /Try to open/ })).catch(() => undefined); await pause(1200); }
  } else if (kind === "build") {
    await click(page, page.locator("[class*=bank] button").nth(0)); await pause(400);
    await click(page, page.locator("[class*=bank] button").nth(1)); await pause(600);
    for (let k = 0; k < 3; k++) { await click(page, page.getByRole("button", { name: /^Check$/ })).catch(() => undefined); await pause(1200); }
  } else if (kind === "mark-it") {
    for (let p = 0; p < 3; p++) {
      await click(page, page.getByRole("button", { name: /✓ Right/ })).catch(() => undefined);
      await pause(900);
      const reason = page.getByRole("button", { name: /Sign slip|Forgot a term|Not finished|Wrong pair/ });
      for (let r = 0; r < 4 && (await reason.count()); r++) { await click(page, reason.nth(r)).catch(() => undefined); await pause(700); }
      await click(page, page.getByRole("button", { name: /Next paper|Finish/ })).catch(() => undefined);
      await pause(900);
    }
  } else if (kind === "rush") {
    await click(page, page.getByRole("button", { name: /^Start$/ }));
    for (let k = 0; k < 8; k++) { await click(page, page.locator("[class*=answers] button").first()).catch(() => undefined); await pause(1400); }
    await page.waitForFunction(() => !!document.querySelector("[class*=rushScore]"), null, { timeout: 70_000 }).catch(() => undefined);
    await pause(1500);
  } else {
    const first = page.locator("[class*=tiles] button, [class*=choices] button, [class*=lines] button").first();
    for (let k = 0; k < 3 && (await first.count()); k++) { await click(page, first).catch(() => undefined); await pause(900); }
    const typed = page.locator("input[aria-label='Your answer']");
    if (await typed.count()) for (let k = 0; k < 2; k++) { await typed.fill("(x + 1)(x + 2)"); await click(page, page.getByRole("button", { name: /^Check$/ })).catch(() => undefined); await pause(900); }
  }
  await next.first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await pause(1200);
  const label = (await next.first().innerText().catch(() => "")) ?? "";
  await click(page, next.first()).catch(() => undefined);
  await pause(900);
  if (/One on your own/.test(label)) break;
}
mark("aarav", "practice-done");

// ---------------- exit: the lantern gate
await page.getByRole("button", { name: /One on your own/ }).click({ timeout: 20_000 }).catch(() => undefined);
await pause(1500);
await page.getByText(/no hints this time/).waitFor({ timeout: MINUTE }).catch(() => undefined);
mark("aarav", "exit");
await pause(2000);
for (let q = 0; q < 2; q++) {
  const seal = page.getByRole("button", { name: /Seal my answer/ });
  if (!(await seal.count())) break;
  const tiles = page.locator("[class*=bank] button");
  const n = await tiles.count();
  for (let k = 0; k < Math.min(3, n); k++) {
    if (!(await seal.isDisabled())) break;
    await click(page, tiles.nth(k));
    await pause(500);
  }
  await pause(800);
  await click(page, seal);
  mark("aarav", "exit-sealed", { q });
  await pause(2500);
}
await pause(1500);
mark("aarav", "exit-done", { headline: await page.locator("h2").first().innerText().catch(() => "") });
await pause(4000);

// ---------------- the teacher's view
await teacher.reload({ waitUntil: "domcontentloaded" });
await pause(4000);
mark("teacher", "final-report");
await teacher.mouse.wheel(0, 600);
await pause(3000);
await teacher.screenshot({ path: join(OUT, "teacher-final.png"), fullPage: true });
await pause(1000);
mark("teacher", "end");

// ---------------- save clips
for (const [who, ctx] of [["aarav", S]]) {
  await ctx.context.close();
  const file = existsSync(ctx.dir) ? readdirSync(ctx.dir).find((f) => f.endsWith(".webm")) : null;
  if (file) {
    renameSync(join(ctx.dir, file), join(OUT, `${who}.webm`));
    timeline.clips[who].file = `${who}.webm`;
  }
}
timeline.endedAt = (Date.now() - t0) / 1000;
timeline.complete = timeline.marks.some((m) => m.label === "exit-done");
writeFileSync(join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
await browser.close();
console.log(`\nDone in ${Math.round(timeline.endedAt)}s. ${timeline.sounds.length} sounds captured. ${OUT}`);
