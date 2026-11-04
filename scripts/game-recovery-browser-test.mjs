/**
 * A refresh in the middle of a Lotus game resumes it, and a typing game feeds the draft record.
 * Needs the web app on :3000 with the API on :3001 and the fake-model API on :3098 (see .claude/launch.json).
 * Synthetic demo student and fake model only.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.COGNA_WEB_URL ?? "http://localhost:3000";
const student = `demo_recovery_${Date.now()}`;
const checks = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const drafts = [];
  page.on("request", (r) => { if (r.method() === "POST" && /draft|checkpoint/i.test(r.url() + (r.postData() ?? "").slice(0, 400))) drafts.push(r.url()); });
  await page.goto(`${BASE}/student/home`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (id) => {
    const r = await fetch("/api/session/student", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: id, name: "Recovery" }) });
    localStorage.setItem("cogna_student", JSON.stringify(await r.json()));
    localStorage.setItem("cogna_dev_mode", "on");
    localStorage.setItem("cogna_lotus_model_mode", "fake");
  }, student);
  await page.goto(`${BASE}/student/lotus?topic=factorisation`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Start for/ }).click({ timeout: 30000 });
  await page.locator('section[data-game="SPLIT_CONFIDENCE"]').waitFor({ timeout: 120000 });

  const chipsOn = (game) => game.locator("[data-answer][data-has]").count();
  let game = page.locator('section[data-game="SPLIT_CONFIDENCE"]');
  await game.locator("[data-answer]").nth(0).click();
  await game.locator("[data-answer]").nth(1).click();
  await page.waitForTimeout(300);
  assert.equal(await chipsOn(game), 2);
  await page.reload({ waitUntil: "domcontentloaded" });
  game = page.locator('section[data-game="SPLIT_CONFIDENCE"]');
  await game.waitFor({ timeout: 30000 });
  assert.equal(await chipsOn(game), 2);
  checks.push("chips placed before a refresh are still placed after it");

  await game.locator("[data-answer]").nth(0).click();
  await game.locator("[data-answer]").nth(0).click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  game = page.locator('section[data-game="SPLIT_CONFIDENCE"]');
  await game.waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  assert.match(await game.innerText(), /All four chips are placed/);
  const before = await page.getByText(/^Question \d+$/).first().innerText();
  await page.getByRole("button", { name: "Submit answer", exact: true }).click();
  checks.push("a finished play survives a refresh and can be submitted");

  for (let i = 0; i < 40; i++) {
    const reason = page.locator("button[class*=reasonOption]");
    if (await reason.count()) await reason.first().click().catch(() => {});
    const now = await page.getByText(/^Question \d+$/).first().innerText({ timeout: 500 }).catch(() => null);
    if (now && now !== before) break;
    await page.waitForTimeout(300);
  }
  const typing = page.locator('section[data-game="READBACK"], section[data-game="EDIT_HISTORY"]');
  await typing.waitFor({ timeout: 30000 });
  const input = typing.locator("input");
  // The next question shows at once, but stays locked until the last answer has saved.
  for (let i = 0; i < 60 && !(await input.isEnabled()); i++) await page.waitForTimeout(250);
  await input.pressSequentially("(x+2", { delay: 40 });
  await input.press("Backspace");
  await input.pressSequentially("3", { delay: 40 });
  await input.blur();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "domcontentloaded" });
  const again = page.locator('section[data-game="READBACK"], section[data-game="EDIT_HISTORY"]').locator("input");
  await again.waitFor({ timeout: 30000 });
  assert.equal(await again.inputValue(), "(x+3");
  checks.push("what was typed in a typing game is still there after a refresh");
  assert.ok(drafts.length > 0, "the typing reached the draft record");
  checks.push("typing in a game reaches the same draft record as a typed answer");
  const leftovers = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("cogna_lotus_game_draft:") && /chips/.test(k)).length);
  assert.equal(leftovers, 0);
  checks.push("the finished question's draft is cleared once the next one is on screen");
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 1));
} finally {
  await browser.close();
}
