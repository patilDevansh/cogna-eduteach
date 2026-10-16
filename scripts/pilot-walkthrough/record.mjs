/**
 * Records the whole pilot flow in real browsers: one teacher and three
 * students, each in their own browser profile (so their sign-ins don't mix),
 * running at the same time like a real classroom.
 *
 * The students are the walk_* accounts from seed-students.mjs. Their answers
 * are scripted (dev-only walkthrough endpoints); everything Cogna does in
 * response — the diagnostic, its stopping rule, the AI-written lesson, the
 * practice checks, the exit marking and the teacher's live report — is real.
 *
 *   node scripts/pilot-walkthrough/record.mjs            # real GPT (needs OpenAI credit)
 *   node scripts/pilot-walkthrough/record.mjs --fake     # free fake model, for a dry run
 *
 * Writes webm clips and timeline.json to scripts/pilot-walkthrough/out/.
 */
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HERE = fileURLToPath(new URL(".", import.meta.url));
// Every run gets its own folder, so a failed run never overwrites a good recording.
const RUN = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = join(HERE, "out", "runs", RUN);
const BASE = process.env.COGNA_WEB_URL ?? "http://localhost:3000";
const FAKE = process.argv.includes("--fake");
const HEADED = process.argv.includes("--headed");
const SIZE = { width: 1280, height: 800 };
const MINUTE = 60_000;

/** Each student's scripted behaviour: which gap their diagnostic answers show, and how they do afterwards. */
const STUDENTS = [
  { key: "aarav", name: "Aarav Choudhury", code: "AARAV-8B", roll: "8B-03", gap: "signs", missFirstPractice: true, exitRight: true, watchSeconds: 40 },
  { key: "meena", name: "Meena Krishnan", code: "MEENA-8B", roll: "8B-11", gap: "grouping", missFirstPractice: false, exitRight: false, watchSeconds: 8 },
  { key: "rohan", name: "Rohan Sengupta", code: "ROHAN-8B", roll: "8B-19", gap: "common-factor", missFirstPractice: false, exitRight: true, watchSeconds: 8 },
];

mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const timeline = { startedAt: new Date(t0).toISOString(), model: FAKE ? "fake" : "real", clips: {}, marks: [] };
function mark(who, label, extra = {}) {
  const at = (Date.now() - t0) / 1000;
  timeline.marks.push({ who, label, at, ...extra });
  console.log(`[${at.toFixed(1).padStart(6)}s] ${who.padEnd(8)} ${label}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ""}`);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: !HEADED });

async function person(who) {
  const dir = join(OUT, who);
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE }, deviceScaleFactor: 1 });
  await context.addInitScript(({ fake }) => {
    try {
      // Dev tools stay hidden in the recording, except that a dry run needs them on for the fake model.
      localStorage.setItem("cogna_dev_mode", fake ? "on" : "off");
      if (fake) localStorage.setItem("cogna_lotus_model_mode", "fake");
    } catch {}
  }, { fake: FAKE });
  const page = await context.newPage();
  timeline.clips[who] = { startedAt: (Date.now() - t0) / 1000 };
  return { context, page, dir };
}

/** Moves the mouse to an element before clicking, so the recording shows where the click lands. */
async function click(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await pause(250);
  await locator.click();
}

async function type(page, locator, text) {
  await click(page, locator);
  await locator.fill("");
  await locator.pressSequentially(text, { delay: 35 });
}

/** Runs in the page: the student's auth headers, plus the fake-model route when the dry run uses it (same as the app's own calls). */
function studentHeaders() {
  const s = JSON.parse(localStorage.getItem("cogna_student") || "{}");
  const fake = localStorage.getItem("cogna_dev_mode") !== "off" && localStorage.getItem("cogna_lotus_model_mode") === "fake";
  return { "X-Cogna-Role": "student", "X-Cogna-Student-Id": s.studentId, "X-Cogna-Student-Token": s.token, ...(fake ? { "x-cogna-lotus-model-mode": "fake" } : {}) };
}

// ---------------------------------------------------------------- teacher

const teacher = await person("teacher");
let joinCode = "";
{
  const { page } = teacher;
  await page.goto(`${BASE}/teacher/login`);
  mark("teacher", "login");
  await pause(1200);
  await click(page, page.locator("form button[type=submit], form button").last());
  await page.waitForURL(/\/teacher\/(today|classes|sessions)/, { timeout: MINUTE });
  await page.goto(`${BASE}/teacher/classes`);
  await page.getByText("Create a production class").waitFor();
  mark("teacher", "create-class");
  await pause(1500);
  // Older classes are listed too: the new one is the card with a join code we haven't seen before.
  const before = new Set(await page.locator("text=Join code:").locator("b").allTextContents());
  await type(page, page.locator("form input").first(), "Grade 8 · Section B");
  await click(page, page.getByRole("button", { name: /Create class/ }));
  await page.waitForFunction((seen) => [...document.querySelectorAll("p b")].some((b) => /^CG-/.test(b.textContent) && !seen.includes(b.textContent)), [...before]);
  const fresh = (await page.locator("text=Join code:").locator("b").allTextContents()).find((c) => !before.has(c));
  const card = page.locator("p", { hasText: fresh }).locator("..");
  joinCode = ((await card.locator("b").first().textContent()) ?? "").trim();
  mark("teacher", "class-created", { joinCode });
  await pause(1500);
  await click(page, card.getByRole("link", { name: /Open classroom/ }));
  await page.getByText(/Release Lotus diagnostic/).waitFor();
  mark("teacher", "console");
}

// ---------------------------------------------------------------- students join

const students = [];
for (const s of STUDENTS) students.push({ ...s, ...(await person(s.key)) });

await Promise.all(students.map(async (s) => {
  const { page } = s;
  await page.goto(`${BASE}/student/login`);
  mark(s.key, "login");
  await type(page, page.locator("form input").first(), s.code);
  await click(page, page.locator("form button[type=submit], form button").last());
  await page.waitForURL(/\/student\/home/, { timeout: MINUTE });
  await page.goto(`${BASE}/student/classroom/live`);
  await page.locator("label", { hasText: /^Class code$/ }).waitFor();
  mark(s.key, "join");
  const inputs = page.locator("form input");
  await type(page, inputs.nth(0), joinCode);
  await type(page, inputs.nth(1), s.roll);
  await click(page, page.getByRole("button", { name: /Join class/ }));
  await page.getByText(/Joined:/).waitFor();
  mark(s.key, "joined");
}));

// ---------------------------------------------------------------- teacher releases

{
  const { page } = teacher;
  await page.reload();
  await page.getByText(/3 joined so far/).waitFor({ timeout: 30_000 }).catch(() => undefined);
  await pause(1500);
  mark("teacher", "release");
  await click(page, page.getByRole("button", { name: /Release Lotus diagnostic/ }));
  await page.getByTestId("roster-row").first().waitFor({ timeout: MINUTE });
  mark("teacher", "released");
}

// ---------------------------------------------------------------- each student, on their own

async function diagnostic(s) {
  const { page } = s;
  let sessionId = "";
  page.on("response", async (res) => {
    if (res.request().method() === "POST" && /\/api\/lotus\/sessions(\?|$)/.test(res.url())) {
      try { sessionId = (await res.json()).sessionId ?? sessionId; } catch {}
    }
  });
  const start = page.getByRole("link", { name: /Start the diagnostic/ });
  await start.waitFor({ timeout: MINUTE });
  mark(s.key, "diagnostic-ready");
  await click(page, start);
  await page.waitForURL(/\/student\/lotus/);
  const begin = page.getByRole("button", { name: /^Start/ }).first();
  await begin.waitFor({ timeout: MINUTE });
  await click(page, begin);
  mark(s.key, "diagnostic-start");

  for (let turn = 1; turn <= 30; turn++) {
    // A question is on screen, or the test ended and the report opened.
    const ready = page.locator("#lotus-answer, input[name=lotus-answer]").first();
    const outcome = await Promise.race([
      ready.waitFor({ timeout: 6 * MINUTE }).then(() => "question"),
      page.waitForURL(/\/student\/lotus\/report/, { timeout: 6 * MINUTE }).then(() => "report"),
    ]);
    if (outcome === "report") break;
    await page.waitForFunction(() => {
      if (location.pathname.includes("/report")) return true;
      const el = document.querySelector("#lotus-answer") || document.querySelector("input[name=lotus-answer]");
      return el && !el.disabled;
    }, null, { timeout: 6 * MINUTE });
    if (page.url().includes("/report")) break;
    if (!sessionId) throw new Error(`${s.key}: no Lotus session id seen`);
    const fill = await page.evaluate(async ({ sessionId, studentId, gap, headersFn }) => {
      const headers = new Function(`return (${headersFn})()`)();
      const r = await fetch(`/api/lotus/sessions/${sessionId}/demo-fill?studentId=${studentId}&gap=${gap}`, { headers });
      if (!r.ok) throw new Error(`demo-fill ${r.status}: ${await r.text()}`);
      return r.json();
    }, { sessionId, studentId: `walk_${s.key}`, gap: s.gap, headersFn: studentHeaders.toString() });

    if (await page.locator("input[name=lotus-answer]").count()) {
      // Multiple choice: find the option the answer names (spacing, minus signs and letter labels vary).
      const index = await page.evaluate((answer) => {
        const norm = (t) => String(t).replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/\.$/, "").toLowerCase();
        const values = [...document.querySelectorAll("input[name=lotus-answer]")].map((r) => r.value);
        let i = values.findIndex((v) => norm(v) === norm(answer));
        if (i < 0) i = values.findIndex((v) => norm(v).startsWith(norm(answer)) || norm(answer).startsWith(norm(v)));
        if (i < 0 && /^[A-Da-d]$/.test(String(answer).trim())) i = "abcd".indexOf(String(answer).trim().toLowerCase());
        return i;
      }, fill.answer);
      if (index < 0) mark(s.key, "choice-unmatched", { answer: fill.answer });
      await click(page, page.locator("input[name=lotus-answer]").nth(Math.max(0, index)).locator(".."));
    } else {
      // Maths goes in whole: typing "^" key by key switches the box into exponent mode.
      const box = page.locator("#lotus-answer");
      await click(page, box);
      await box.fill(fill.answer);
    }
    const steps = String(fill.working ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3);
    for (let i = 0; i < steps.length; i++) {
      const field = page.locator(`[data-working-index="${i}"]`);
      if (await field.count()) await field.fill(steps[i]);
    }
    const sure = page.getByRole("button", { name: "Somewhat sure" });
    if (await sure.count()) await click(page, sure);
    await click(page, page.getByRole("button", { name: /Submit answer/ }));
    mark(s.key, "answer", { turn });
    await pause(400);
  }
  await page.waitForURL(/\/student\/lotus\/report/, { timeout: 5 * MINUTE });
  mark(s.key, "report");
}

async function lessonAndPractice(s) {
  const { page } = s;
  const learn = page.getByRole("link", { name: /Learn lesson/ });
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll("a")].find((x) => /Learn lesson/.test(x.textContent || ""));
    return a && /assignment=/.test(a.getAttribute("href") || "") && a.getAttribute("aria-disabled") !== "true";
  }, null, { timeout: 8 * MINUTE });
  await pause(2500);
  mark(s.key, "lesson-ready");
  await click(page, learn);
  await page.waitForURL(/personalized-video/);
  // The AI writes and verifies the lesson in the background; wait until it plays.
  const world = page.getByText("Classic", { exact: true });
  await world.waitFor({ timeout: 8 * MINUTE });
  mark(s.key, "lesson-open");
  await click(page, world);
  const player = page.locator(".__remotion-player").first();
  await player.waitFor({ timeout: 4 * MINUTE });
  await player.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await pause(1200);
  await click(page, player);
  mark(s.key, "lesson-play");
  // Watch, answering any checkpoint the way a student would: the lesson resumes only on the right option.
  const until = Date.now() + s.watchSeconds * 1000;
  let tried = 0;
  while (Date.now() < until) {
    const checkpoint = page.getByRole("dialog", { name: "Checkpoint question" });
    if (await checkpoint.isVisible().catch(() => false)) {
      mark(s.key, "checkpoint");
      await pause(1800);
      const options = checkpoint.getByRole("button");
      const count = await options.count();
      await click(page, options.nth(tried % Math.max(1, count))).catch(() => undefined);
      tried += 1;
      await pause(2600);
      continue;
    }
    tried = 0;
    if (/practice|Practise/.test(await page.locator("body").innerText().catch(() => "")) && await page.getByText(/Practice on your own/i).isVisible().catch(() => false)) break;
    await pause(500);
  }
  // A short lesson may already have finished and moved on to practice by itself.
  const watched = page.getByRole("button", { name: /I've watched it/ });
  if (await watched.isVisible().catch(() => false)) await click(page, watched);

  await page.getByText(/Practice on your own/i).waitFor({ timeout: MINUTE });
  mark(s.key, "practice");
  const videoId = new URL(page.url()).searchParams.get("video");
  const key = await page.evaluate(async ({ videoId, headersFn }) => {
    const headers = new Function(`return (${headersFn})()`)();
    const r = await fetch(`/api/personalized-videos/assignments/${videoId}/walkthrough-key`, { headers });
    if (!r.ok) throw new Error(`walkthrough-key ${r.status}: ${await r.text()}`);
    return r.json();
  }, { videoId, headersFn: studentHeaders.toString() });

  const minus = (n) => (n < 0 ? `−${-n}` : `${n}`);
  for (let i = 0; i < key.practice.length; i++) {
    const { answer } = key.practice[i];
    await page.getByText(new RegExp(`Question ${i + 1} of`)).waitFor();
    await pause(900);
    const card = page.locator("main section").filter({ hasText: /Question \d+ of/ }).first();
    const miss = s.missFirstPractice && i === 0;
    if (Array.isArray(answer)) {
      const [a, b] = answer;
      const right = card.getByRole("button").filter({ hasText: new RegExp(`^(${minus(a)}, ${minus(b)}|${minus(b)}, ${minus(a)})`) }).first();
      if (miss) {
        const wrong = card.getByRole("button").filter({ hasNotText: new RegExp(`^(${minus(a)}, ${minus(b)}|${minus(b)}, ${minus(a)})`) }).first();
        await click(page, wrong);
        await pause(1800);
      }
      await click(page, right);
    } else if (typeof answer === "number") {
      const isSpot = await card.getByText(/goes wrong/).count();
      const options = card.getByRole("button").filter({ hasNotText: /^(Next|Check)/ });
      if (miss) {
        await click(page, options.nth(answer === 0 ? 1 : 0));
        await pause(1800);
      }
      await click(page, options.nth(isSpot ? answer : answer));
    } else {
      const box = card.getByLabel("Your answer");
      if (miss) {
        await type(page, box, String(answer).replace(/\+/g, "#").replace(/-/g, "+").replace(/#/g, "-"));
        await page.keyboard.press("Enter");
        await pause(1800);
      }
      await type(page, box, String(answer));
      await page.keyboard.press("Enter");
    }
    await pause(1800);
    await click(page, card.getByRole("button", { name: /^Next/ }));
  }
  await page.getByRole("button", { name: /One on your own/ }).waitFor();
  mark(s.key, "practice-done");
  await pause(2500);
  await click(page, page.getByRole("button", { name: /One on your own/ }));
  return key.exit;
}

async function exit(s, expected) {
  const { page } = s;
  await page.getByText(/no hints this time/i).waitFor({ timeout: MINUTE });
  mark(s.key, "exit");
  const answer = s.exitRight ? expected : String(expected).replace(/\+/g, "#").replace(/-/g, "+").replace(/#/g, "-");
  await type(page, page.getByPlaceholder(/e\.g\./).first(), answer);
  await type(page, page.getByPlaceholder(/Write at least one step/), s.exitRight ? "Read the signs, found the pair, multiplied back to check." : "Took out what was common.");
  await click(page, page.getByRole("button", { name: /Check my answer/ }));
  await page.getByText(/Nicely done|Not quite/).waitFor({ timeout: MINUTE });
  mark(s.key, "exit-done", { right: s.exitRight });
  await pause(2500);
}

await Promise.all(students.map(async (s) => {
  try {
    await diagnostic(s);
    const expected = await lessonAndPractice(s);
    await exit(s, expected);
  } catch (error) {
    mark(s.key, "ERROR", { message: String(error?.message ?? error).slice(0, 300) });
    await s.page.screenshot({ path: join(OUT, `${s.key}-error.png`) }).catch(() => undefined);
  }
}));

// ---------------------------------------------------------------- teacher sees the class

{
  const { page } = teacher;
  await page.reload();
  await page.getByTestId("gap-group").first().waitFor({ timeout: MINUTE }).catch(() => undefined);
  mark("teacher", "final-report");
  await pause(4000);
  await page.mouse.wheel(0, 500);
  await pause(3500);
  await page.mouse.wheel(0, -500);
  await pause(2000);
  // The full-page screenshot resizes the page for a moment, so the edit stops before it.
  mark("teacher", "end");
  await page.screenshot({ path: join(OUT, "teacher-final.png"), fullPage: true });
}

// ---------------------------------------------------------------- save clips

for (const who of ["teacher", ...STUDENTS.map((s) => s.key)]) {
  const ctx = who === "teacher" ? teacher : students.find((s) => s.key === who);
  await ctx.context.close();
  const file = readdirSync(ctx.dir).find((f) => f.endsWith(".webm"));
  if (file) {
    renameSync(join(ctx.dir, file), join(OUT, `${who}.webm`));
    timeline.clips[who].file = `${who}.webm`;
  }
}
timeline.endedAt = (Date.now() - t0) / 1000;
timeline.complete = STUDENTS.every((s) => timeline.marks.some((m) => m.who === s.key && m.label === "exit-done"));
writeFileSync(join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
if (timeline.complete) writeFileSync(join(HERE, "out", "latest-complete.txt"), RUN);
await browser.close();
console.log(`\nDone in ${Math.round(timeline.endedAt)}s. ${timeline.complete ? "Every student finished." : "INCOMPLETE: not every student finished (see *-error.png)."} Clips and timeline in ${OUT}`);
