#!/usr/bin/env node
/**
 * Phase 1 audit capture — visits every public product surface and saves
 * screenshots under docs/product-wedge/screenshots/.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "screenshots");
mkdirSync(OUT, { recursive: true });

const PUBLIC_ROUTES = [
  ["landing", "/"],
  ["student-login", "/student/login"],
  ["student-classroom-join", "/student/classroom"],
  ["parent-login", "/parent/login"],
  ["teacher-login", "/teacher/login"],
  ["teacher-signup", "/teacher/signup"],
  ["teacher-setup", "/teacher/setup"],
  ["teacher-today", "/teacher/today"],
  ["teacher-classes", "/teacher/classes"],
  ["teacher-sessions", "/teacher/sessions"],
  ["teacher-students", "/teacher/students"],
  ["teacher-reports", "/teacher/reports"],
  ["teacher-evidence-empty", "/teacher/evidence"],
  ["teacher-pilot-story", "/teacher/pilot-story"],
  ["teacher-lotus-evidence", "/teacher/lotus-evidence"],
  ["prototype-classroom-join", "/prototype/classroom/join"],
  ["prototype-teacher-report", "/prototype/teacher-report"],
  ["prototype-quadratics", "/prototype/quadratics"],
  ["diagnostic-v2-prototype", "/student/diagnostic-v2?prototype=1&debug=1"],
];

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log("saved", name);
}

async function safeGoto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(700);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await desktop.newPage();
  const phone = await mobile.newPage();

  for (const [name, path] of PUBLIC_ROUTES) {
    await safeGoto(page, `${WEB}${path}`);
    await shot(page, name);
  }

  // Mobile landing + teacher brief + student login
  await safeGoto(phone, `${WEB}/`);
  await shot(phone, "landing-mobile");
  await safeGoto(phone, `${WEB}/student/login`);
  await shot(phone, "student-login-mobile");
  await safeGoto(phone, `${WEB}/teacher/today`);
  await shot(phone, "teacher-today-mobile");
  await safeGoto(phone, `${WEB}/teacher/reports`);
  await shot(phone, "teacher-reports-mobile");
  await safeGoto(phone, `${WEB}/parent/login`);
  await shot(phone, "parent-login-mobile");

  // Teacher reports: open action blueprint + evidence audit if present
  await safeGoto(page, `${WEB}/teacher/reports`);
  const actionBtn = page.getByRole("button", { name: /action|10-minute|blueprint|plan/i }).first();
  if (await actionBtn.count()) {
    await actionBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "teacher-reports-action-modal");
    await page.keyboard.press("Escape").catch(() => {});
  }
  const auditBtn = page.getByRole("button", { name: /evidence|audit|quality/i }).first();
  if (await auditBtn.count()) {
    await auditBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "teacher-reports-evidence-modal");
    await page.keyboard.press("Escape").catch(() => {});
  }

  // Teacher sessions launch
  await safeGoto(page, `${WEB}/teacher/sessions`);
  const launch = page.getByRole("button", { name: /launch/i });
  if (await launch.count()) {
    await launch.click();
    await page.waitForTimeout(400);
    await shot(page, "teacher-sessions-live");
  }

  // Student classroom identity + instructions
  await safeGoto(page, `${WEB}/student/classroom`);
  const findClass = page.getByRole("button", { name: /find my class/i });
  if (await findClass.count()) {
    await findClass.click();
    await page.waitForTimeout(500);
    await shot(page, "student-classroom-identity");
    const continueBtn = page.getByRole("button", { name: /continue as/i });
    if (await continueBtn.count()) {
      await continueBtn.click();
      await page.waitForTimeout(800);
      await shot(page, "student-classroom-instructions");
    }
  }

  // Student demo login → home
  await safeGoto(page, `${WEB}/student/login`);
  const demo = page.getByRole("button", { name: /use demo code/i });
  if (await demo.count()) {
    await demo.click();
    await page.waitForURL(/home|baseline|practice/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "student-home");
    await shot(phone, "student-home-mobile");
    // phone needs same cookies — skip if not logged in there

    await safeGoto(page, `${WEB}/student/baseline`);
    await shot(page, "student-baseline-intro");

    await safeGoto(page, `${WEB}/student/revision`);
    await shot(page, "student-revision");

    await safeGoto(page, `${WEB}/student/practice?mode=ADAPTIVE_PRACTICE`);
    await page.waitForTimeout(1500);
    await shot(page, "student-session-question");

    // Try a wrong answer if the input is there
    const answer = page.locator("#answer");
    if (await answer.count()) {
      await answer.fill("999");
      const check = page.getByRole("button", { name: /^check$/i });
      if (await check.count()) {
        await check.click();
        await page.waitForTimeout(800);
        await shot(page, "student-session-confidence");
        const skipConf = page.getByRole("button", { name: /skip this/i });
        if (await skipConf.count()) {
          await skipConf.click();
          await page.waitForTimeout(800);
          await shot(page, "student-session-feedback-wrong");
        } else {
          const n3 = page.getByRole("button", { name: /^3$/ });
          if (await n3.count()) {
            await n3.click();
            const submit = page.getByRole("button", { name: /check my answer/i });
            if (await submit.count()) await submit.click();
            await page.waitForTimeout(800);
            await shot(page, "student-session-feedback-wrong");
          }
        }
      }
    }

    await safeGoto(page, `${WEB}/student/diagnostic-v2?track=NEGATIVE_DISTRIBUTION`);
    await page.waitForTimeout(1000);
    await shot(page, "student-diagnostic-v2-intro");
    const start = page.getByRole("button", { name: /^start$/i });
    if (await start.count()) {
      await start.click();
      await page.waitForTimeout(1500);
      await shot(page, "student-diagnostic-v2-working");
      const nextLine = page.locator("#nextLine");
      if (await nextLine.count()) {
        // Incomplete distribution on a typical opening 3(x+2)=18 → 3x+2=18
        await nextLine.fill("3x + 2 = 18");
        const submitStep = page.getByRole("button", { name: /submit step/i });
        if (await submitStep.count()) {
          await submitStep.click();
          await page.waitForTimeout(1500);
          await shot(page, "student-diagnostic-v2-invalid-step");
        }
      }
    }

    await safeGoto(page, `${WEB}/student/lotus?observer=1`);
    await page.waitForTimeout(1200);
    await shot(page, "student-lotus-observer");

    await safeGoto(page, `${WEB}/student/personalized-video`);
    await page.waitForTimeout(1000);
    await shot(page, "student-personalized-video");
  }

  // Parent demo
  await safeGoto(page, `${WEB}/parent/login`);
  const demoParent = page.getByRole("button", { name: /use demo parent/i });
  if (await demoParent.count()) {
    await demoParent.click();
    await page.waitForURL(/parent\/dashboard/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "parent-dashboard");

    const progress = page.getByRole("link", { name: /view progress/i }).first();
    if (await progress.count()) {
      await progress.click();
      await page.waitForTimeout(1200);
      await shot(page, "parent-progress");
    }

    const weekly = page.getByRole("link", { name: /weekly/i }).first();
    if (await weekly.count()) {
      const href = await weekly.getAttribute("href");
      if (href) {
        await safeGoto(page, `${WEB}${href}`);
        await page.waitForTimeout(800);
        await shot(page, "parent-weekly");
      }
    }

    // summary via dashboard links if we can reconstruct
    await safeGoto(page, `${WEB}/parent/dashboard`);
    const summary = page.getByRole("link", { name: /session summary/i }).first();
    if (await summary.count()) {
      await summary.click();
      await page.waitForTimeout(800);
      await shot(page, "parent-session-summary");
    }

    await safeGoto(page, `${WEB}/parent/students/new`);
    await shot(page, "parent-add-student");
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
