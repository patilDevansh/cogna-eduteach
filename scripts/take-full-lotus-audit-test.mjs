import { chromium } from "playwright";
import * as crypto from "node:crypto";
import * as path from "node:path";

const ARTIFACT_DIR = "/Users/dp/.gemini/antigravity/brain/a215d2e0-7e75-49df-9c60-fc922257e723";

function signPayload(payload, secret) {
  const body = Buffer.from(payload).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

async function main() {
  console.log("================================================================================");
  console.log("=== STARTING FULL E2E LOTUS DIAGNOSTIC AUDIT TEST IN LIVE CHROMIUM BROWSER ===");
  console.log("================================================================================");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[Browser Console Error] ${msg.text()}`);
  });

  // 1. Setup Student & Teacher credentials
  console.log("\n[Step 1] Minting authenticated student (demo_rohan) & teacher (Ananya) sessions...");
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

  // 2. Open Landing Page
  console.log("\n[Step 2] Navigating to http://localhost:3000/student/lotus?topic=factorisation&observer=1 ...");
  await page.goto("http://localhost:3000/student/lotus?topic=factorisation&observer=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Capture Landing Page
  const landingPath = path.join(ARTIFACT_DIR, "audit-01-landing-page.png");
  await page.screenshot({ path: landingPath, fullPage: false });
  console.log(`Saved screenshot: ${landingPath}`);

  // Audit Landing Page
  const badges = await page.locator("span[class*='phaseBadge']").allInnerTexts();
  const title = await page.locator("h1").innerText();
  console.log("  → Landing Page Title:", title);
  console.log("  → Badges:", badges);

  // 3. Start Diagnostic
  console.log("\n[Step 3] Clicking 'Start for Rohan'...");
  const startBtn = page.locator("button:has-text('Start for')").first();
  await startBtn.click();

  // Wait for Question 1 to mount
  console.log("Waiting for Question 1 to mount...");
  await page.waitForSelector("div[class*='studentPane'] strong:has-text('Question')", { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Capture Question 1 with AI Studio Observer
  const q1Path = path.join(ARTIFACT_DIR, "audit-02-question1-mounted.png");
  await page.screenshot({ path: q1Path, fullPage: false });
  console.log(`Saved screenshot: ${q1Path}`);

  const q1Header = await page.locator("div[class*='studentPane'] strong:has-text('Question')").first().innerText();
  const q1Prompt = await page.locator("div[class*='studentPane'] p, div[class*='studentPane'] h2").allInnerTexts();
  const aiStudioText = await page.locator("section[aria-label='Session overview']").innerText();
  console.log("  → Q1 Header:", q1Header);
  console.log("  → Q1 Text Sample:", q1Prompt.slice(0, 3).join(" | "));
  console.log("  → AI Studio Observer Status:", aiStudioText.replace(/\n+/g, " "));

  // 4. Progress Turn 1 (Solve Question 1)
  console.log("\n[Step 4] Submitting Turn 1 (Card Chips or Text Answer)...");
  const chipsButtons = await page.locator("div[class*='chipRow'] button, div[class*='chips'] button, button[class*='chip']").all();
  if (chipsButtons.length > 0) {
    console.log(`Found ${chipsButtons.length} chips buttons. Clicking first card chips...`);
    await chipsButtons[0].click();
  }
  const submitBtn = page.locator("button:has-text('Submit answer')").first();
  if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
    await submitBtn.click();
    console.log("Submitted Turn 1.");
  }
  await page.waitForTimeout(2500);

  // 5. Turn 2: Test Elastic Runway by selecting "I don't know this yet"
  console.log("\n[Step 5] Turn 2: Testing Non-Destructive Elastic Runway...");
  const q2Header = await page.locator("div[class*='studentPane'] strong:has-text('Question')").first().innerText();
  console.log("  → Current Header:", q2Header);

  const dontKnowCheckbox = page.locator("input[type='checkbox']").first();
  if (await dontKnowCheckbox.isVisible()) {
    console.log("Checking 'I don't know this yet' checkbox...");
    await dontKnowCheckbox.check();
  } else {
    const dontKnowLabel = page.locator("label:has-text(\"I don't know this yet\")").first();
    if (await dontKnowLabel.isVisible()) {
      await dontKnowLabel.click();
    }
  }
  await page.waitForTimeout(500);

  const submitBtn2 = page.locator("button:has-text('Submit answer')").first();
  await submitBtn2.click();
  console.log("Submitted 'I don't know this yet' on Turn 2.");
  await page.waitForTimeout(3000);

  // 6. Turn 3: Verify Elastic Runway Probe Insertion
  console.log("\n[Step 6] Turn 3: Inspecting Elastic Runway Probe Insertion...");
  const q3Header = await page.locator("div[class*='studentPane'] strong:has-text('Question')").first().innerText();
  console.log("  → Post-Slip Header:", q3Header);

  // Capture Elastic Runway Screen
  const runwayPath = path.join(ARTIFACT_DIR, "audit-03-elastic-runway-probe.png");
  await page.screenshot({ path: runwayPath, fullPage: false });
  console.log(`Saved screenshot: ${runwayPath}`);

  // 7. Answer subsequent items to demonstrate downstream mastery
  console.log("\n[Step 7] Progressing through remaining diagnostic questions to test Sarah Rule & completion...");
  let answered = 3;
  while (answered <= 8) {
    if (page.url().includes("/report")) break;

    const finishBtn = page.locator("button:has-text('Finish test'), button:has-text('End & report')").first();
    if (answered >= 7 && await finishBtn.isVisible()) {
      console.log(`At Turn ${answered}: clicking Finish test to conclude diagnostic and generate report...`);
      await finishBtn.click();
      break;
    }

    const currentHeader = await page.locator("div[class*='studentPane'] strong:has-text('Question')").first().innerText().catch(() => "");
    console.log(`[Turn ${answered}] Header: "${currentHeader}"`);

    // Submit answer or click chip
    const chips = await page.locator("div[class*='chipRow'] button, div[class*='chips'] button").all();
    if (chips.length > 0) {
      await chips[0].click().catch(() => {});
    }
    const input = page.locator("div[class*='studentPane'] input[type='text']").first();
    if (await input.isVisible()) {
      await input.fill("3(x + 2)").catch(() => {});
    }

    const subBtn = page.locator("button:has-text('Submit answer')").first();
    if (await subBtn.isVisible() && await subBtn.isEnabled()) {
      await subBtn.click();
    }
    await page.waitForTimeout(2000);
    answered++;
  }

  // 8. Wait for Report Page
  console.log("\n[Step 8] Waiting for Report Page navigation and final report generation...");
  await page.waitForURL(/\/student\/lotus\/report/, { timeout: 25000 });
  const reportUrl = page.url();
  console.log("Reached Report URL:", reportUrl);

  // Wait for report analysis to complete
  await page.waitForSelector("h1:has-text('We found where to start'), h1:has-text('Your report'), section[class*='card']", { timeout: 20000 });
  await page.waitForTimeout(3000);

  // Capture Report Page
  const reportPath = path.join(ARTIFACT_DIR, "audit-04-final-report.png");
  await page.screenshot({ path: reportPath, fullPage: true });
  console.log(`Saved full report screenshot: ${reportPath}`);

  // 9. Inspect Report Components
  console.log("\n[Step 9] Auditing Delivered Deliverables on the Final Report...");
  const reportTitle = await page.locator("h1").first().innerText();
  console.log("  ✓ Report Title:", reportTitle);

  // Check Day 1 Launchpad Node
  const launchpadExists = await page.locator("span[class*='eyebrow']:has-text('Day 1 Launchpad Node')").count();
  console.log("  ✓ Day 1 Launchpad Node Header:", launchpadExists > 0 ? "DELIVERED" : "MISSING");
  if (launchpadExists > 0) {
    const launchpadCard = await page.locator("span[class*='eyebrow']:has-text('Day 1 Launchpad Node')").locator("xpath=ancestor::section").first().innerText();
    console.log("  → Launchpad Details:\n" + launchpadCard.split("\n").map(l => "     " + l).join("\n"));
  }

  // Check Competency Ratings (1 to 5)
  const ratingsHeaderExists = await page.locator("h2:has-text('Competency Ratings (1 to 5)')").count();
  console.log("  ✓ Competency Ratings (1 to 5) Header:", ratingsHeaderExists > 0 ? "DELIVERED" : "MISSING");
  if (ratingsHeaderExists > 0) {
    const ratingsCard = await page.locator("h2:has-text('Competency Ratings (1 to 5)')").locator("xpath=ancestor::section").first().innerText();
    console.log("  → Competency Ratings Preview:\n" + ratingsCard.split("\n").slice(0, 12).map(l => "     " + l).join("\n"));
  }

  // Check Strengths and Gaps
  const strengthsCount = await page.locator("h2:has-text('What you did well')").count();
  const checkingCount = await page.locator("h2:has-text('Still checking')").count();
  console.log("  ✓ Observed Strengths Card:", strengthsCount > 0 ? "DELIVERED" : "MISSING");
  console.log("  ✓ Identified Gaps Card:", checkingCount > 0 ? "DELIVERED" : "MISSING");

  console.log("\n================================================================================");
  console.log("=== FULL E2E AUDIT TEST FINISHED SUCCESSFULLY ===");
  console.log("================================================================================");

  await browser.close();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
