/** Actual Next pages -> isolated validation/controllers/services -> disposable PostgreSQL. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const host='http://127.0.0.1:4313';
const f=await(await fetch(`${host}/fixture`)).json();
const state=async()=>await(await fetch(`${host}/fixture/state`)).json();
const browser=await chromium.launch({headless:true});
const checks=[];
function check(label,value){assert.ok(value,label);checks.push(label);}
try{
 const context=await browser.newContext();
 await context.addInitScript(f=>localStorage.setItem('cogna_student',JSON.stringify({studentId:f.studentId,name:'Context learner',token:f.token})),f);
 const page=await context.newPage();
 let releaseHint;
 const hintGate=new Promise(resolve=>{releaseHint=resolve;});
 await page.route(url=>/^\/(?:api\/)?(sessions|practice|lotus)(\/|$)/.test(url.pathname),async route=>{
  if(route.request().method()==="OPTIONS"){await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"*"}});return;}
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/practice/hint')) await hintGate;
  const response=await route.fetch({url:`${host}${url.pathname.replace(/^\/api/,'')}${url.search}`});
  await route.fulfill({response,headers:{...response.headers(),"access-control-allow-origin":"*"}});
 });
 await page.goto('http://127.0.0.1:4310/student/practice?mode=ADAPTIVE_PRACTICE',{waitUntil:'networkidle',timeout:120000});
 await page.getByLabel('Your answer',{exact:true}).fill('4');
 await page.waitForTimeout(1100);
 await page.getByLabel('Your answer',{exact:true}).fill('5');
 // Controlled visibility/connection events verify wiring; not a real attention measurement.
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});
 await page.waitForTimeout(80);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});
 await page.getByRole('button',{name:'Get a hint',exact:true}).click();
 check('exercise waits for in-flight hint before checking',await page.getByRole('button',{name:'Check',exact:true}).isDisabled());
 releaseHint();
 await page.getByText('Add the two numbers.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Check',exact:true}).click();
 await page.getByRole('button',{name:'Retry saving',exact:true}).waitFor();
 let s=await state();
 const answer=s.raw.find(r=>r.eventType==='ANSWER_SUBMITTED');
 assert.ok(answer,JSON.stringify(s));
 const c=answer.payload.interactionContext;
 check('exercise browser summary durably saved for correct question',c.questionId===f.questionId&&c.source==='EXERCISE');
 check('first input and later edit burst distinguished',c.timing.firstInputMs!==null&&c.revisionsAfterFirstInput===1);
 check('controlled hidden/offline context reaches storage',c.timing.hiddenMs>0&&c.technical.offlineMs>0&&c.timing.visibilityChanges===2);
 check('exercise confidence remains unreported null',c.confidence.status==='NOT_ASKED'&&c.confidence.value===null);
 check('help request is separate durable evidence',s.raw.some(r=>r.eventType==='HINT_REQUESTED')&&answer.payload.hintCount===1);
 await page.getByRole('button',{name:'Retry saving',exact:true}).click();
 await page.getByRole('button',{name:'Retry saving',exact:true}).waitFor();
 s=await state();
 check('exercise failed downstream retry preserves one immutable answer',s.raw.filter(r=>r.eventType==='ANSWER_SUBMITTED').length===1&&s.attempts.length===1&&JSON.stringify(s.raw.find(r=>r.eventType==='ANSWER_SUBMITTED').payload.interactionContext)===JSON.stringify(c));
 await page.screenshot({path:'delivery/december-2026/evidence/interaction-exercise.png',fullPage:true});
 await page.goto('http://127.0.0.1:4310/student/lotus?topic=brackets',{waitUntil:'networkidle',timeout:120000});
 await page.getByRole('button',{name:/Start for/}).click();
 await page.getByRole('checkbox',{name:/I don.t know this yet/}).waitFor();
 await page.getByRole('checkbox',{name:/I don.t know this yet/}).check();
 await page.getByRole('button',{name:'Submit answer',exact:true}).click();
 await page.getByRole('button',{name:'Very sure',exact:true}).waitFor();
 s=await state();
 const first=s.lotus.evidence.find(r=>r.eventType==='ANSWER');
 check('Lotus unasked confidence is null despite legacy60',first.metadata.interactionContext.confidence.status==='NOT_ASKED'&&first.metadata.interactionContext.confidence.value===null);
 check('Lotus explicit no answer leaves first mathematical input unknown',first.metadata.interactionContext.timing.firstInputMs===null);
 await page.getByRole('button',{name:'Minimise Cogna Lotus diagnostic',exact:true}).click();
 await page.getByRole('button',{name:'Close mini-player',exact:true}).click();
 await page.locator('#lotus-answer').fill('3x+9');
 await page.getByRole('button',{name:'Very sure',exact:true}).click();
 await page.getByRole('button',{name:'Submit answer',exact:true}).click();
 await page.waitForTimeout(600);
 s=await state();
 const rows=s.lotus.evidence.filter(r=>r.eventType==='ANSWER');
 const second=rows.find(r=>r.questionId!==first.questionId);
 check('Lotus typed answer and real confidence reach durable metadata',second&&second.metadata.interactionContext.confidence.status==='REPORTED_BEFORE_ANSWER'&&second.metadata.interactionContext.confidence.value===90&&second.metadata.interactionContext.timing.firstInputMs!==null);
 check('Lotus re-shown question starts a fresh partial observation',second.metadata.interactionContext.timing.complete===false);
 check('Lotus snapshot retains identical interaction context',JSON.stringify(s.lotus.payload.audits[1].response.interactionContext)===JSON.stringify(second.metadata.interactionContext));
 await page.screenshot({path:'delivery/december-2026/evidence/interaction-lotus.png',fullPage:true});
 const output={passed:checks.length,checks,limits:'Synthetic local HTTP fixture; exercise downstream diagnosis intentionally unavailable, controlled visibility events; no real-child/production claim'};
 await writeFile('delivery/december-2026/evidence/DATA-010-browser.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
}catch(error){console.error(error);throw error;}finally{await browser.close();}
