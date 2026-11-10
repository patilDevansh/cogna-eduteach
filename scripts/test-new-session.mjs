import { chromium } from "playwright";
import * as crypto from "node:crypto";

function signPayload(payload, secret) {
  const body = Buffer.from(payload).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  const sessionRes = await fetch("http://localhost:3000/api/session/student", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: "demo_rohan", name: "Rohan" }),
  });
  const sessionData = await sessionRes.json();

  const secret = "local-dev-secret-cogna-2026-safe";
  const teacherToken = signPayload(
    JSON.stringify({
      role: "teacher",
      sub: "ananya@gurukul.edu",
      schoolId: "gurukul-pilot",
      exp: Date.now() + 12 * 3600 * 1000,
    }),
    secret
  );
  const teacherData = {
    token: teacherToken,
    teacher: { id: "teacher_ananya", name: "Ananya", email: "ananya@gurukul.edu" },
  };

  await context.addInitScript(
    ({ student, teacher }) => {
      localStorage.setItem("cogna_student", JSON.stringify(student));
      sessionStorage.setItem("cogna_teacher_invitation", JSON.stringify(teacher));
    },
    { student: sessionData, teacher: teacherData }
  );

  const page = await context.newPage();

  console.log("Navigating to diagnostic...");
  await page.goto("http://localhost:3000/student/lotus?topic=factorisation&observer=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Check if landing page
  const startBtn = page.locator("button:has-text('Start for')").first();
  if (await startBtn.isVisible()) {
    console.log("Clicking start button...");
    await startBtn.click();
    await page.waitForTimeout(3000);
  }

  // Answer Q1
  console.log("Waiting for Q1...");
  await page.locator("div[class*='studentPane'] input[type='text']").waitFor({ timeout: 15000 });
  const q1Text = await page.locator("div[class*='studentPane'] p, div[class*='studentPane'] h2").allInnerTexts();
  console.log("Q1 texts:", q1Text.slice(0, 5));

  // Fill answer 2 * 2 * 3 * x
  await page.locator("div[class*='studentPane'] input[type='text']").fill("2 * 2 * 3 * x");
  await page.locator("button:has-text('Submit answer')").first().click();
  await page.waitForTimeout(2000);

  // Click End & report in observer pane
  console.log("Clicking End & report...");
  const endBtn = page.locator("button:has-text('End & report')").first();
  if (await endBtn.isVisible()) {
    await endBtn.click();
    console.log("Clicked End & report.");
  }

  // Wait for redirect to report
  await page.waitForURL(/\/student\/lotus\/report/, { timeout: 25000 });
  console.log("Navigated to report URL:", page.url());
  await page.waitForTimeout(4000);

  await page.screenshot({ path: "/Users/dp/.gemini/antigravity/brain/a215d2e0-7e75-49df-9c60-fc922257e723/verify-live-session-report.png" });
  console.log("Captured verify-live-session-report.png");

  const hasLaunchpad = await page.locator("text=Day 1 Launchpad Node").count();
  console.log("Day 1 Launchpad Node count:", hasLaunchpad);
  const hasCompetency = await page.locator("text=Competency Ratings").count();
  console.log("Competency Ratings count:", hasCompetency);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
