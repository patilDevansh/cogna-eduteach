import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const web=process.env.LOTUS_WEB_URL||'http://localhost:3002';
const api=process.env.LOTUS_API_URL||'http://localhost:3001';
const dir='test-results/lotus-phase3-independent';
await mkdir(dir,{recursive:true});
const request=async(url,init={})=>{const r=await fetch(url,init);const v=await r.json();assert.ok(r.ok,`${r.status} ${JSON.stringify(v).slice(0,200)}`);return v;};
const student=await request(`${web}/api/session/student`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:'demo_divya',name:'Divya'})});
const headers={'Content-Type':'application/json','x-cogna-student-id':'demo_divya','x-cogna-student-token':student.token};
let view=await request(`${api}/lotus/sessions`,{method:'POST',headers,body:JSON.stringify({studentId:'demo_divya',topic:'FACTORISATION'})});
console.log(`session ${view.sessionId}`);
const deadline=Date.now()+120000;
for(let count=0;count<4;count++){
  while(!view.currentQuestion||!view.preparation?.ready){assert.ok(Date.now()<deadline,'question preparation timed out');await new Promise(r=>setTimeout(r,500));view=await request(`${api}/lotus/sessions/${view.sessionId}`,{headers});}
  view=await request(`${api}/lotus/sessions/${view.sessionId}/answers`,{method:'POST',headers,body:JSON.stringify({studentId:'demo_divya',questionId:view.currentQuestion.id,nextQuestionId:view.upcomingQuestions?.[0]?.id,answer:'',working:'',didNotKnow:true,responseTimeMs:4000,confidence:0,submissionId:crypto.randomUUID()})});
}
assert.equal(view.status,'COMPLETE','four IDK should finish');
await writeFile(`${dir}/four-idk.json`,JSON.stringify(view,null,2));
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();await context.addInitScript(v=>localStorage.setItem('cogna_student',JSON.stringify(v)),student);
 const page=await context.newPage();await page.goto(`${web}/student/lotus/report?session=${view.sessionId}`);await page.locator('h1').first().waitFor();await page.screenshot({path:`${dir}/four-idk-report.png`,fullPage:true});
 const text=await page.locator('body').innerText();assert.ok(view.finalReport.skills.every(s=>s.rating===undefined),'IDK-only ratings must be absent');assert.doesNotMatch(text,/3\/5/);console.log(JSON.stringify({sessionId:view.sessionId,status:view.status,ratings:0,reportScreenshot:`${dir}/four-idk-report.png`}));
}finally{await browser.close();}
