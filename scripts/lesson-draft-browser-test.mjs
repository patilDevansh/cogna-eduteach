/** Uses a separate browser context; never submits or alters the review learner's checked answers. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const fixture = await (await fetch('http://127.0.0.1:4311/fixture')).json();
const state = async () => (await (await fetch('http://127.0.0.1:4311/fixture/state')).json()).script;
const answers = (script) => (script.learningEvidence?.receipts ?? []).filter(e => e.receipt.kind === 'ANSWER_SUBMITTED');
const before = answers(await state());
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.addInitScript(f => localStorage.setItem('cogna_student', JSON.stringify({ studentId:f.studentId, name:'Review learner', token:f.token })),fixture);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4310/student/personalized-video?studentId=${fixture.studentId}&video=${fixture.assignmentId}`,{waitUntil:'networkidle',timeout:120000});
  const input = page.getByRole('textbox',{name:'Your answer'});
  await input.waitFor();
  assert.equal(await input.isEnabled(),true);
  await input.fill('(x+3)(X+2)');
  assert.match(await page.getByTestId('practice-save-status').innerText(),/Draft saved.*Not checked/);
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await input.inputValue(),'(x+3)(X+2)');
  assert.match(await page.getByTestId('practice-save-status').innerText(),/Draft restored.*Not checked/);
  assert.deepEqual(answers(await state()),before,'draft must not change or create checked-answer receipts');
  await input.fill('');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await input.inputValue(),'','intentional empty draft must also survive');
  await page.screenshot({path:'delivery/december-2026/evidence/s1-draft-recovery.png',fullPage:true});
  const result={passed:4,checks:['exact mixed-case edit survives refresh without Check','draft status clearly says not checked','checked-answer receipts unchanged','cleared draft survives refresh'],assignmentId:fixture.assignmentId};
  await writeFile('delivery/december-2026/evidence/DATA-008-draft-browser.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
