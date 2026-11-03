/** Local synthetic browser verification. Requires the isolated server and web app described in the evidence record. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const api = "http://127.0.0.1:4311";
const web = "http://127.0.0.1:4310";
const output = new URL("../delivery/december-2026/evidence/", import.meta.url);
await mkdir(output, { recursive: true });
const fixture = await (await fetch(`${api}/fixture`)).json();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((f) => localStorage.setItem("cogna_student", JSON.stringify({ studentId: f.studentId, name: "Test learner", token: f.token })), fixture);
const page = await context.newPage();
const checks = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
try {
  await page.goto(`${web}/student/personalized-video?studentId=${fixture.studentId}&video=${fixture.assignmentId}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: /I've watched it/ }).waitFor({ timeout: 30000 });
  await page.locator('[aria-label="Your 20-second lesson"]').waitFor();
  const before = await (await fetch(`${api}/fixture/state`)).json();
  check("lesson exposure recorded only after rendered micro-lesson", before.script.learningEvidence.receipts.some((e) => e.receipt.kind === "PRESENTED" && !e.receipt.itemId));
  await page.getByRole("button", { name: /I've watched it/ }).click();
  await page.getByTestId("saved-practice-card").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  check("typed answer and save controls fit a phone viewport", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.getByRole("button", { name: "Check and save" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: new URL("s1-practice-mobile-input.png", output).pathname, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: new URL("s1-practice-before.png", output).pathname, fullPage: true });

  let loseAck = true;
  await page.route("**/api/personalized-videos/assignments/*/practice-evidence", async (route) => {
    const body = route.request().postDataJSON();
    if (loseAck && body.kind === "ANSWER_SUBMITTED") {
      loseAck = false;
      const response = await route.fetch();
      check("first answer committed before simulated lost acknowledgement", response.ok());
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Simulated acknowledgement loss" }) });
    } else await route.continue();
  });
  await page.getByRole("textbox", { name: "Your answer" }).fill("(x+2)(x+3)");
  await page.getByRole("button", { name: "Check and save" }).click();
  await page.getByRole("button", { name: "Retry saving" }).waitFor();
  check("lost acknowledgement never displays a false Saved state", (await page.getByTestId("practice-save-status").innerText()).includes("Not confirmed saved"));
  await page.getByRole("button", { name: "Retry saving" }).click();
  await page.getByText("Saved. You can refresh and resume this practice.", { exact: true }).waitFor();
  check("first practice shows no recorded item help", await page.getByText(/No item help was recorded/).isVisible());
  let state = await (await fetch(`${api}/fixture/state`)).json();
  check("lost-ack retry produced one answer receipt", state.script.learningEvidence.receipts.filter((e) => e.receipt.kind === "ANSWER_SUBMITTED" && e.receipt.itemId === "typed-1").length === 1);
  check("lost-ack retry produced one aggregate attempt", state.script.practiceAttempts["typed-1"].tries === 1);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Your answer" }).waitFor();
  check("refresh resumes at the next unsolved typed question", (await page.getByRole("textbox", { name: "Your answer" }).inputValue()) === "" && (await page.getByText("Question 2 of 2", { exact: true }).isVisible()));

  let disconnect = true;
  await page.unroute("**/api/personalized-videos/assignments/*/practice-evidence");
  await page.route("**/api/personalized-videos/assignments/*/practice-evidence", async (route) => {
    const body = route.request().postDataJSON();
    if (disconnect && body.kind === "ANSWER_SUBMITTED") { disconnect = false; await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("textbox", { name: "Your answer" }).fill("x+12");
  await page.getByRole("button", { name: "Check and save" }).click();
  await page.getByRole("button", { name: "Retry saving" }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Retry saving" }).waitFor();
  check("pending request survives a refresh in the same signed-in tab", await page.getByRole("textbox", { name: "Your answer" }).inputValue() === "x+12");
  await page.getByRole("button", { name: "Retry saving" }).click();
  await page.getByText("Saved. You can refresh and resume this practice.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await page.getByText("Help saved. Try the next step when you’re ready.", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Your answer" }).fill("(x+3)(x+4)");
  await page.getByRole("button", { name: "Check and save" }).click();
  await page.getByText("Saved. You can refresh and resume this practice.", { exact: true }).waitFor();
  check("helped response is visibly distinct", await page.getByText(/Help or feedback was used for this practice/).isVisible());
  await page.screenshot({ path: new URL("s1-practice-saved.png", output).pathname, fullPage: true });
  state = await (await fetch(`${api}/fixture/state`)).json();
  const answers = state.script.learningEvidence.receipts.map((e) => e.receipt).filter((r) => r.kind === "ANSWER_SUBMITTED");
  check("browser outcomes match durable records", answers.length === 3 && answers[0].assistance === "NONE_RECORDED" && answers.at(-1).assistance === "ISSUED");
  check("practice never became independent or retained knowledge", answers.every((r) => r.purpose === "PRACTICE" && r.flow === "PERSONALIZED_VIDEO_PRACTICE_V1"));
  check("responses link to actual item and lesson presentation", answers.every((r) => r.exposureEventId && r.lessonExposureEventId));
  check("hint display acknowledgement is separate from hint issuance", state.script.learningEvidence.receipts.some((e) => e.receipt.kind === "PRESENTED" && e.receipt.supportEventId));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Practice complete", { exact: true }).waitFor();
  check("completed typed set remains complete after refresh", await page.getByText("Practice complete", { exact: true }).isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  check("practice completion fits a phone viewport", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: new URL("s1-practice-mobile.png", output).pathname, fullPage: true });
  await writeFile(new URL("DATA-008-browser.json", output), JSON.stringify({ passed: checks.length, checks, fixtureAssignmentId: fixture.assignmentId, runtime: "Next web + actual controller/service in isolated HTTP harness + disposable PostgreSQL", scope: "typed practice; not all games or full production bootstrap", paidCalls: 0 }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: new URL("s1-practice-failure.png", output).pathname, fullPage: true });
  console.error(await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }
