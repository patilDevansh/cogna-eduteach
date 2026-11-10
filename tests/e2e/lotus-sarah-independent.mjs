import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import personas from '../../apps/api/test/fixtures/lotus-factorisation-personas.ts';
const {PERSONA_CATALOGUE,chooseResponse}=personas;
const evaluationToken=process.env.LOTUS_AUTONOMOUS_EVAL_TOKEN;
assert.ok(evaluationToken,'LOTUS_AUTONOMOUS_EVAL_TOKEN must be provided by the gate environment');
const persona=PERSONA_CATALOGUE.find(p=>p.id==='no_gap')||PERSONA_CATALOGUE[0];
const web='http://localhost:3002',api='http://localhost:3001',dir='test-results/lotus-sarah-independent';
await mkdir(dir,{recursive:true});
async function req(url,init={}){const r=await fetch(url,init),v=await r.json();assert.ok(r.ok,`${r.status} ${JSON.stringify(v).slice(0,200)}`);return v;}
const student=await req(`${web}/api/session/student`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:'demo_divya',name:'Divya'})});
const headers={'Content-Type':'application/json','x-cogna-student-id':'demo_divya','x-cogna-student-token':student.token};
let view=process.env.LOTUS_SESSION_ID ? await req(`${api}/lotus/sessions/${process.env.LOTUS_SESSION_ID}`,{headers}) : await req(`${api}/lotus/sessions`,{method:'POST',headers,body:JSON.stringify({studentId:'demo_divya',topic:'FACTORISATION'})});
console.log(`Sarah session ${view.sessionId}`);
const deadline=Date.now()+240000;const rows=[];
while(view.status==='ACTIVE'){
 assert.ok(Date.now()<deadline,'preparation deadline');
 if(!view.currentQuestion||!view.preparation?.ready){await new Promise(r=>setTimeout(r,500));view=await req(`${api}/lotus/sessions/${view.sessionId}`,{headers});continue;}
 const q=await req(`${api}/lotus/sessions/${view.sessionId}/autonomous-evaluation-question`,{headers:{'x-lotus-autonomous-eval-token':evaluationToken}});
 const slot=q.answerKey.diagnostics.slot;const response=chooseResponse(persona,q,rows.length+1);
 delete response.isDeliberateMistake;
 if(q.answerKey.diagnostics.skillId==='FAC_PAIR_PRODUCT_SUM'){response.answer=q.answerKey.diagnostics.predictedMistakes?.[0]?.answer||q.options?.find(o=>o!==q.answerKey.canonicalAnswer)||'0';delete response.gameResponse;}
 rows.push({slot,question:q,response});
 view=await req(`${api}/lotus/sessions/${view.sessionId}/answers`,{method:'POST',headers,body:JSON.stringify({...response,studentId:'demo_divya',questionId:q.id,nextQuestionId:view.upcomingQuestions?.[0]?.id,responseTimeMs:60000,confidence:80,submissionId:crypto.randomUUID()})});
 console.log(`saved slot ${slot}`);
}
await writeFile(`${dir}/session.json`,JSON.stringify({view,rows},null,2));
const browser=await chromium.launch({headless:true});try{const context=await browser.newContext();await context.addInitScript(v=>localStorage.setItem('cogna_student',JSON.stringify(v)),student);const page=await context.newPage();await page.goto(`${web}/student/lotus/report?session=${view.sessionId}`);await page.locator('h1').first().waitFor();await page.screenshot({path:`${dir}/report.png`,fullPage:true});const skill=view.finalReport.skills.find(s=>s.skillId==='FAC_PAIR_PRODUCT_SUM');assert.ok(skill.evidence.some(n=>/retroactively cleared/i.test(n)),'Sarah note absent');console.log(JSON.stringify({sessionId:view.sessionId,skill,startingZone:view.finalReport.startingZone}));}finally{await browser.close();}
