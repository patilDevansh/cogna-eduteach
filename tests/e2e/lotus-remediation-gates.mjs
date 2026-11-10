import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import personas from '../../apps/api/test/fixtures/lotus-factorisation-personas.ts';
const {PERSONA_CATALOGUE, chooseResponse}=personas;

const web = process.env.LOTUS_WEB_URL || 'http://localhost:3000';
const api = process.env.LOTUS_API_URL || 'http://localhost:3001';
const dir = process.env.LOTUS_GATE_ARTIFACTS || 'test-results/lotus-remediation';
await mkdir(dir, {recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
async function json(url, options={}) {
  const response = await fetch(url, {...options, signal:AbortSignal.timeout(45000)});
  const text = await response.text();
  assert.ok(response.ok, `${options.method || 'GET'} ${url}: ${response.status} ${text.slice(0,300)}`);
  return JSON.parse(text);
}
try {
  for (const persona of PERSONA_CATALOGUE) {
    const studentId = `demo_e2e_gate_${persona.id.toLowerCase()}`;
    const credentials = await json(`${web}/api/session/student`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId,name:'Gate persona'})});
    const headers = {'Content-Type':'application/json','x-cogna-student-id':studentId,'x-cogna-student-token':credentials.token};
    let view = await json(`${api}/lotus/sessions`, {method:'POST',headers,body:JSON.stringify({studentId,topic:'FACTORISATION'})});
    const id = view.sessionId;
    console.log(`${persona.id}: session ${id}`);
    const context = await browser.newContext();
    await context.addInitScript(data=>localStorage.setItem('cogna_student',JSON.stringify(data)),credentials);
    const page = await context.newPage();
    const deadline = Date.now()+180000;
    let answered=0;
    while (view.status==='ACTIVE') {
      assert.ok(Date.now()<deadline,`${persona.id}: preparation timed out`);
      view=await json(`${api}/lotus/sessions/${id}`,{headers});
      if (!view.currentQuestion || !view.preparation?.ready) { await new Promise(r=>setTimeout(r,250));continue; }
      if(answered>=17) {
        const failed=await json(`${api}/lotus/sessions/${id}/observer`,{headers});
        await writeFile(`${dir}/${persona.id}-failed.json`,JSON.stringify(failed,null,2));
        assert.fail(`${persona.id} session ${id}: more than 17 answers requested`);
      }
      const q=await json(`${api}/lotus/sessions/${id}/autonomous-evaluation-question`,{headers:{...headers,'x-lotus-autonomous-eval-token':process.env.LOTUS_AUTONOMOUS_EVAL_TOKEN || ''}});
      const plan=chooseResponse(persona,q,answered+1);
      delete plan.isDeliberateMistake;
      const next=view.upcomingQuestions?.[0];
      view=await json(`${api}/lotus/sessions/${id}/answers`,{method:'POST',headers,body:JSON.stringify({...plan,studentId,questionId:q.id,nextQuestionId:next?.id,confidence:4,responseTimeMs:persona.paceMsBand[1],submissionId:crypto.randomUUID()})});
      answered++;
      console.log(`${persona.id}: saved ${answered}, status ${view.status}`);
    }
    const evidence=await json(`${api}/lotus/sessions/${id}/observer`,{headers});
    await writeFile(`${dir}/${persona.id}.json`,JSON.stringify(evidence,null,2));
    const questions=evidence.audits.map(a=>a.question);
    assert.equal(questions.length,answered,'server audit count differs from successful POST count');
    const followups=questions.filter(q=>q.answerKey.diagnostics?.isElasticProbe);
    const slots=questions.filter(q=>!q.answerKey.diagnostics?.isElasticProbe).map(q=>q.answerKey.diagnostics?.slot);
    assert.deepEqual(slots,Array.from({length:15},(_,i)=>i+1));
    assert.ok(followups.length<=2);
    for(const q of followups) assert.equal(q.answerKey.diagnostics.slot%1,.5);
    assert.equal(evidence.status,'COMPLETE');
    await page.goto(`${web}/student/lotus/report?session=${id}`);
    await page.locator('h1').first().waitFor();
    await page.waitForFunction(()=>document.body.innerText.includes('where to start') || document.body.innerText.includes('Competency Ratings'),{timeout:30000});
    await page.screenshot({path:`${dir}/${persona.id}-report.png`,fullPage:true});
    await writeFile(`${dir}/${persona.id}.json`,JSON.stringify(evidence,null,2));
    const timings=evidence.audits.map(a=>a.timingMs?.instantVerdict).filter(x=>typeof x==='number').sort((a,b)=>a-b);
    const p99=timings[Math.max(0,Math.ceil(timings.length*.99)-1)];
    results.push({persona:persona.id,sessionId:id,answered,slots,followups:followups.length,instantVerdictSamples:timings.length,instantVerdictP99Ms:p99});
    await context.close();
  }
  await writeFile(`${dir}/summary.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
