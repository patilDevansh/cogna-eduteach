import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const fixture = JSON.parse(await readFile('/tmp/cogna-module-browser-fixture.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
const checks = [];
const check = (label, ok) => { assert.ok(ok, label); checks.push(label); };
try {
  const student = await browser.newContext();
  await student.addInitScript(data => localStorage.setItem('cogna_student', JSON.stringify({ studentId: data.studentId, name: 'Synthetic module learner', token: data.studentToken })), fixture);
  const page = await student.newPage();
  let diagnosticCalls = 0;
  page.on('request', request => { if (new URL(request.url()).pathname.includes('lotus')) diagnosticCalls++; });
  await page.goto('http://127.0.0.1:4332/student/module-learning', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('button', { name: /Start (my own factorisation module|a new factorisation run)/ }).click();
  await page.getByText('Step 1: Find the pair before writing brackets').waitFor();
  check('cold start opens reviewed lesson without a diagnostic', diagnosticCalls === 0);
  await page.reload({ waitUntil: 'networkidle' });
  check('lesson resumes after refresh', await page.getByText('Step 1: Find the pair before writing brackets').count() === 1);
  await page.getByRole('button', { name: 'Pause and save my place' }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  check('voluntary pause survives refresh without marking an answer wrong', await page.getByRole('button', { name: 'Resume' }).count() === 1);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Continue after reading' }).waitFor();

  let lostAck = false;
  await page.route('**/module-learning/runs/*/actions', async route => {
    const body = route.request().postDataJSON();
    if (!lostAck && body.action.kind === 'PRESENTED') {
      lostAck = true;
      await route.fetch();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic lost acknowledgement' }), headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Continue after reading' }).click();
  await page.getByRole('button', { name: 'Retry saving this step' }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Retry saving this step' }).click();
  await page.getByText('Factorise completely: x² + 7x + 10').waitFor();
  await page.getByRole('button', { name: 'Retry saving this step' }).waitFor({ state: 'hidden' });
  check('lost acknowledgement retry restores saved checkpoint without duplicate advancement', lostAck && await page.getByRole('button', { name: 'Retry saving this step' }).count() === 0);

  await page.getByRole('textbox', { name: 'Your answer' }).fill('(x-2)(x-5)');
  await page.reload({ waitUntil: 'networkidle' });
  check('unsubmitted answer survives refresh', await page.getByRole('textbox', { name: 'Your answer' }).inputValue() === '(x-2)(x-5)');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByText('Evaluate: (-4) × (-6)').waitFor();
  check('specific error triggers a discriminating check', await page.getByText('Check one earlier idea').count() === 1);
  await page.getByRole('button', { name: '-24' }).click();
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByText('Step 1: Choose signs from the sum and product').waitFor();
  check('incorrect probe leads to targeted sign repair', await page.getByText('Step 1: Choose signs from the sum and product').count() === 1);
  await page.getByRole('button', { name: 'Continue after reading' }).click();
  await page.getByText('Factorise completely: x² - 8x + 15').waitFor();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('(x-3)(x-5)');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByText('Factorise completely: x² - 9x + 14').waitFor();
  await page.getByRole('textbox', { name: 'Your answer' }).fill('(x-2)(x-7)');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByText('Independent Exit Check 1').waitFor();
  check('repair returns to parent then fresh independent item', await page.getByText('This is a fresh check without hints.').count() === 1);
  await page.getByRole('textbox', { name: 'Your answer' }).fill('(x+2)(x+6)');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByRole('heading', { name: 'Module complete' }).waitFor();
  check('workflow completion and independent result are shown separately', await page.getByText(/independent check was correct/).count() === 1);
  await page.screenshot({ path: '/tmp/cogna-module-learning-complete.png', fullPage: true });

  const teacher = await browser.newContext();
  await teacher.addInitScript(data => sessionStorage.setItem('cogna_teacher_invitation', JSON.stringify({ token: data.teacherToken })), fixture);
  const teacherPage = await teacher.newPage();
  await teacherPage.route('http://127.0.0.1:4333/classrooms', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: fixture.classroomId, name: 'Synthetic Grade 8', grade: 8 }]), headers: { 'access-control-allow-origin': '*' } }));
  await teacherPage.goto('http://127.0.0.1:4332/teacher/module-learning', { waitUntil: 'networkidle', timeout: 120000 });
  await teacherPage.getByRole('button', { name: 'Assign to enrolled students' }).click();
  await teacherPage.getByRole('heading', { name: 'Assignment saved for 1 students' }).waitFor();
  await teacherPage.getByRole('switch', { name: /Sample data/ }).click();
  await teacherPage.getByRole('button', { name: 'Assign to enrolled students' }).waitFor({ state: 'visible' });
  check('sample teacher mode cannot assign real work', await teacherPage.getByRole('button', { name: 'Assign to enrolled students' }).isDisabled());
  await page.reload({ waitUntil: 'networkidle' });
  check('teacher-assigned run appears separately from self-directed run', await page.getByRole('button', { name: /Assigned by your teacher/ }).count() >= 1 && await page.getByRole('button', { name: /My own learning/ }).count() >= 1);
  await writeFile('/tmp/cogna-module-browser-checks.json', JSON.stringify(checks, null, 2));
  console.log(`${checks.length} browser checks passed`);
} finally { await browser.close(); }
