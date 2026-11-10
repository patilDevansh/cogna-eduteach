import { chromium } from "playwright";
import * as fs from "node:fs";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log("1. Visiting landing page: http://localhost:3000/student/lotus?topic=factorisation");
  await page.goto("http://localhost:3000/student/lotus?topic=factorisation", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/Users/dp/.gemini/antigravity/brain/a215d2e0-7e75-49df-9c60-fc922257e723/verify-landing-clean.png" });
  console.log("Captured verify-landing-clean.png");

  // Check badge text
  const badgeText = await page.locator("span[class*='phaseBadge']").allInnerTexts();
  console.log("Landing badges:", badgeText);

  console.log("2. Visiting report page: http://localhost:3000/student/lotus/report?session=d0ee69ce-d2b7-4e14-b8dd-9da4d7ad70d9");
  await page.goto("http://localhost:3000/student/lotus/report?session=d0ee69ce-d2b7-4e14-b8dd-9da4d7ad70d9", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/Users/dp/.gemini/antigravity/brain/a215d2e0-7e75-49df-9c60-fc922257e723/verify-report-clean.png" });
  console.log("Captured verify-report-clean.png");

  // Check if error card exists
  const hasError = await page.locator("text=We couldn't open this report").count();
  console.log("Error card count:", hasError);

  // Check if Launchpad exists
  const hasLaunchpad = await page.locator("text=Day 1 Launchpad · Starting Node").count();
  console.log("Day 1 Launchpad count:", hasLaunchpad);

  // Check if Competency Ratings exist
  const hasCompetency = await page.locator("text=Competency Ratings").count();
  console.log("Competency Ratings count:", hasCompetency);

  await browser.close();
  console.log("Browser verification finished.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
