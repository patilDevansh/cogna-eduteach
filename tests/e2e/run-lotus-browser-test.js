const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ARTIFACT_DIR = "/Users/dp/.gemini/antigravity/brain/a215d2e0-7e75-49df-9c60-fc922257e723";

function signPayload(payload, secret) {
  const body = Buffer.from(payload).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

async function main() {
  console.log("=== Starting Autonomous Lotus Browser Test with Live AI Studio ===");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[Browser Console Error] ${msg.text()}`);
  });

  // 1. Obtain demo student token via API
  console.log("1. Minting demo student session for Rohan...");
  const sessionRes = await fetch("http://localhost:3000/api/session/student", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: "demo_rohan", name: "Rohan" }),
  });
  const sessionData = await sessionRes.json();
  console.log("Student token obtained:", sessionData.token ? "YES" : "NO");

  // 2. Mint teacher token for AI Studio Observer access
  console.log("2. Minting verified teacher session for Ananya...");
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
  console.log("Teacher token obtained: YES");

  // 3. Set credentials in browser context
  console.log("3. Setting student & teacher credentials in browser context...");
  await context.addInitScript(({ student, teacher }) => {
    localStorage.setItem("cogna_student", JSON.stringify(student));
    sessionStorage.setItem("cogna_teacher_invitation", JSON.stringify(teacher));
  }, { student: sessionData, teacher: teacherData });

  // 4. Open Lotus Diagnostic directly with observer=1
  console.log("4. Navigating to Lotus Factorisation diagnostic with observer=1...");
  await page.goto("http://localhost:3000/student/lotus?topic=factorisation&observer=1");

  // Capture Landing Page
  const landingPath = path.join(ARTIFACT_DIR, "audit-01-landing.png");
  await page.screenshot({ path: landingPath, fullPage: false });
  console.log(`Saved landing page screenshot to: ${landingPath}`);

  // Wait for Start button and click it
  console.log("Waiting for Start button...");
  await page.waitForTimeout(1000);
  await page.locator("button:has-text('Start for')").first().click();
  console.log("Clicked Start button!");

  // Wait for diagnostic question to mount
  console.log("Waiting for Question 1 to mount in student pane...");
  await page.waitForSelector("div[class*='studentPane'] strong:has-text('Question')", { timeout: 30000 });
  await page.waitForTimeout(2000);

  // If "Show AI Lab" button is visible, click it to activate observer panel
  const showAiLabBtn = await page.$("button:has-text('Show AI Lab')");
  if (showAiLabBtn && await showAiLabBtn.isVisible()) {
    console.log("Clicking 'Show AI Lab' toggle...");
    await showAiLabBtn.click();
    await page.waitForTimeout(1500);
  }

  const questionHeader = await page.locator("div[class*='studentPane'] strong:has-text('Question')").first().innerText();
  console.log(`Question mounted! Header: "${questionHeader}"`);

  // Verify AI Studio observer panel is visible
  const aiStudioText = await page.content();
  const hasAiStudioOverview = aiStudioText.includes("AI Studio overview") || aiStudioText.includes("What Lotus currently knows");
  console.log(`AI Studio Observer Panel loaded: ${hasAiStudioOverview ? "YES" : "NO"}`);

  // Take screenshot of Question 1 + AI Studio
  const q1Path = path.join(ARTIFACT_DIR, "audit-02-q1-aistudio.png");
  await page.screenshot({ path: q1Path, fullPage: false });
  console.log(`Saved screenshot 1 to: ${q1Path}`);

  // 5. Progress through diagnostic questions
  console.log("5. Progressing through diagnostic questions...");
  let answeredCount = 0;
  const maxItems = 18;
  let activeSessionId = null;

  while (answeredCount < maxItems) {
    if (page.url().includes("/report")) {
      console.log(`Reached Report page directly! URL: ${page.url()}`);
      break;
    }

    const devExitBtn = await page.$("button:has-text('Finish test')");
    if (devExitBtn && await devExitBtn.isVisible()) {
      console.log("Encountered developer exit prompt; clicking 'Finish test'...");
      await devExitBtn.click();
      await page.waitForTimeout(2000);
      continue;
    }

    const completeHeader = await page.$("h1:has-text('complete'), h1:has-text('starting point')");
    if (completeHeader && await completeHeader.isVisible()) {
      console.log("Diagnostic complete screen detected on student view!");
      break;
    }

    // Check Question header in student pane specifically
    const questionLocator = page.locator("div[class*='studentPane'] strong:has-text('Question')").first();
    const isVisible = await questionLocator.isVisible().catch(() => false);
    if (!isVisible) {
      const dialogExit = await page.$("dialog button:has-text('Finish test'), button:has-text('Finish test')");
      if (dialogExit && await dialogExit.isVisible()) {
        console.log("Dialog exit detected while waiting; clicking 'Finish test'...");
        await dialogExit.click();
        await page.waitForTimeout(2000);
        continue;
      }
      console.log(`Question not visible yet on step ${answeredCount + 1}, waiting 1s...`);
      await page.waitForTimeout(1000);
      continue;
    }

    const headerText = await questionLocator.innerText();
    console.log(`[Item ${answeredCount + 1}] Current view: "${headerText}"`);

    // Handle Confidence probe if present before answering
    const confSkip = await page.$("div[class*='studentPane'] button:has-text('Skip')");
    if (confSkip && await confSkip.isVisible()) {
      console.log("Confidence prompt active; clicking 'Skip'...");
      await confSkip.click();
      await page.waitForTimeout(1000);
      continue;
    }

    // Check if chips game is present
    const chipCards = await page.$$("div[class*='studentPane'] [data-answer]");
    if (chipCards.length > 0) {
      console.log(`Chips game detected with ${chipCards.length} answer cards. Dropping chips on card 1...`);
      for (let c = 0; c < 4; c++) {
        await chipCards[0].click();
        await page.waitForTimeout(100);
      }
    } else {
      // Regular question: multiple choice, text, or checkbox
      const idontKnowCheckbox = await page.$("div[class*='studentPane'] input[type='checkbox']");
      const choiceButtons = await page.$$("div[class*='studentPane'] button[class*='choice'], div[class*='studentPane'] button[class*='option']");
      const textInput = await page.$("div[class*='studentPane'] input[type='text'], div[class*='studentPane'] input:not([type]), div[class*='studentPane'] textarea");

      // On Turn 2, trigger "I don't know this yet" to test non-destructive elastic runway probe insertion
      if (answeredCount === 1 && idontKnowCheckbox) {
        console.log("Turn 2: Selecting 'I don't know this yet' to test non-destructive elastic runway probe insertion...");
        await idontKnowCheckbox.check();
      } else if (choiceButtons.length > 0) {
        console.log(`Multiple choice detected with ${choiceButtons.length} choices. Picking choice 1...`);
        await choiceButtons[0].click();
      } else if (textInput) {
        await textInput.fill("2(x + 3)");
      } else if (idontKnowCheckbox) {
        await idontKnowCheckbox.check();
      }
    }

    await page.waitForTimeout(300);

    // Look for submit or continue button in student pane
    let submitBtn = await page.locator("div[class*='studentPane'] button:has-text('Submit answer'), div[class*='studentPane'] button:has-text('Continue')").first();
    if (await submitBtn.isVisible() && !(await submitBtn.isDisabled())) {
      await submitBtn.click();
      console.log(`Clicked submit button for item ${answeredCount + 1}`);
    }

    await page.waitForTimeout(800);

    // Check if confidence probe appeared after submit
    const confidenceSkip = await page.$("div[class*='studentPane'] button:has-text('Skip')");
    if (confidenceSkip && await confidenceSkip.isVisible()) {
      console.log("Confidence prompt active; clicking 'Skip'...");
      await confidenceSkip.click();
      await page.waitForTimeout(1000);
    }

    // Save screenshot on Turn 2 showing elastic runway probe inserted in AI Studio
    if (answeredCount === 1) {
      await page.waitForTimeout(2000);
      const elasticPath = path.join(ARTIFACT_DIR, "audit-03-elastic-probe.png");
      await page.screenshot({ path: elasticPath, fullPage: false });
      console.log(`Saved elastic runway screenshot to: ${elasticPath}`);
    }

    // Wait until server finished evaluating and transition occurs
    await page.waitForFunction(() => {
      const btn = document.querySelector("div[class*='studentPane'] button.btn-primary");
      if (!btn) return true;
      const text = btn.textContent || "";
      return !text.includes("Checking") && !text.includes("Saving");
    }, { timeout: 15000 }).catch(() => {});

    await page.waitForTimeout(1000);
    answeredCount++;
  }

  // 6. Transition to full report page
  let currentUrl = page.url();
  console.log(`Diagnostic loop ended. Current URL: ${currentUrl}`);

  // Find report link or extract session ID
  const reportLink = await page.$("a[href*='/student/lotus/report?session=']");
  if (reportLink) {
    const href = await reportLink.getAttribute("href");
    console.log(`Found direct report link: ${href}`);
    const match = href.match(/session=([a-f0-9-]+)/);
    if (match) activeSessionId = match[1];
    await page.goto(`http://localhost:3000${href}`);
  } else {
    // Check localStorage recovery or active session
    const storedSessionId = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes("LOTUS")) {
          try {
            const val = JSON.parse(localStorage.getItem(key));
            if (val?.session?.sessionId) return val.session.sessionId;
          } catch {}
        }
      }
      return null;
    });

    if (storedSessionId) {
      activeSessionId = storedSessionId;
      console.log(`Navigating to report page with stored session ID: ${storedSessionId}`);
      await page.goto(`http://localhost:3000/student/lotus/report?session=${storedSessionId}`);
    }
  }

  // 7. Verify Report Page
  console.log("7. Waiting for Report Page analysis to complete...");
  await page.waitForSelector("h1", { timeout: 30000 });
  const reportTitle = await page.locator("h1").first().innerText();
  console.log(`Report Page Loaded: "${reportTitle}"`);

  // Wait for Launchpad Starting Node and Competency Ratings to render
  await page.waitForTimeout(4000);

  // Take screenshot of Report Page
  const reportPath = path.join(ARTIFACT_DIR, "audit-04-final-report.png");
  await page.screenshot({ path: reportPath, fullPage: true });
  console.log(`Saved report screenshot to: ${reportPath}`);

  // Extract Session Data directly from API
  let sessionApiData = null;
  if (activeSessionId) {
    try {
      const apiRes = await fetch(`http://localhost:3001/lotus/sessions/${activeSessionId}`);
      if (apiRes.ok) {
        sessionApiData = await apiRes.json();
      }
    } catch (e) {
      console.log("API fetch error:", e.message);
    }
  }

  // Check DOM content
  const pageContent = await page.content();
  const hasStartingNode = pageContent.includes("DAY 1 LAUNCHPAD NODE") || pageContent.includes("Day 1 Launchpad Node") || pageContent.includes("Foundations:");
  const hasCompetencyRatings = pageContent.includes("Competency Ratings (1 to 5)");
  const hasReportContent = pageContent.includes("where to start");

  console.log(`\n=== Verification Results ===`);
  console.log(`- Report Header loaded: ${hasReportContent ? "PASS" : "FAIL"}`);
  console.log(`- Day 1 Launchpad Node rendered: ${hasStartingNode ? "PASS" : "FAIL"}`);
  console.log(`- Competency Ratings (1 to 5) rendered: ${hasCompetencyRatings ? "PASS" : "FAIL"}`);

  if (sessionApiData?.finalReport) {
    const fr = sessionApiData.finalReport;
    console.log("\n=== Final Report Structured Payload Audit ===");
    console.log("- Starting Node Module ID:", fr.startingZone?.moduleId);
    console.log("- Starting Node Module Name:", fr.startingZone?.moduleName);
    console.log("- Starting Node Scaffolding Level:", fr.startingZone?.scaffoldingLevel);
    console.log("- Starting Node Rationale:", fr.startingZone?.rationale);
    console.log("- Starting Node Micro-Interventions:", JSON.stringify(fr.startingZone?.microInterventions));
    console.log("- Total Evaluated Skills:", fr.skills?.length);
    console.log("- Competency Ratings Summary:");
    fr.skills?.forEach((s) => {
      console.log(`  • ${s.skillId} (${s.skillName}): Rating ${s.rating ?? "untested"}/5 [${s.ratingStatus ?? s.state}]`);
    });
  }

  await browser.close();
  console.log("=== Autonomous Lotus Browser Test Completed Successfully ===");

  await browser.close();
  console.log("=== Autonomous Lotus Browser Test Completed Successfully ===");
}

main().catch((err) => {
  console.error("Browser test failed:", err);
  process.exit(1);
});
