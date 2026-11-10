import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const env=await readFile('.env','utf8');
const secret=process.env.COGNA_SESSION_SECRET || env.match(/^COGNA_SESSION_SECRET=(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g,'');
assert.ok(secret,'session secret required');
const body=Buffer.from(JSON.stringify({role:'teacher',sub:'ananya@gurukul.edu',schoolId:'gurukul-pilot',exp:Date.now()+3600000})).toString('base64url');
const token=`v1.${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;
const classroom='cmwahv7330001y2hhs919vi2y';
const response=await fetch(`http://localhost:3001/lotus/classrooms/${classroom}/portfolio`,{headers:{'x-cogna-teacher-token':token}});
assert.equal(response.status,200);
const portfolio=await response.json();
await mkdir('test-results/lotus-remediation',{recursive:true});
await writeFile('test-results/lotus-remediation/portfolio.json',JSON.stringify(portfolio,null,2));
console.log(JSON.stringify(portfolio));
const browser=await chromium.launch({headless:true});
try{
const context=await browser.newContext();
await context.addInitScript(t=>{sessionStorage.setItem('cogna_teacher_invitation',JSON.stringify({token:t,teacher:{id:'teacher_ananya',name:'Ananya',email:'ananya@gurukul.edu'}}));localStorage.setItem('cogna_teacher_sample_data','off');},token);
const page=await context.newPage();
await page.goto(`http://localhost:3002/teacher/lotus-portfolio?classroom=${classroom}`);
await page.waitForTimeout(3000);
console.log((await page.locator('body').innerText()).slice(0,5000));
await page.screenshot({path:'test-results/lotus-remediation/portfolio.png',fullPage:true});
assert.ok((await page.locator('body').innerText()).includes('12 students have rated results'),'rated class summary must render');
const classes=await (await fetch('http://localhost:3001/classrooms',{headers:{'x-cogna-teacher-token':token}})).json();
let empty;
for(const candidate of classes){
const r=await fetch(`http://localhost:3001/lotus/classrooms/${candidate.id}/portfolio`,{headers:{'x-cogna-teacher-token':token}});
if(!r.ok)continue;
const value=await r.json();
if(value.completedTests===0){empty={id:candidate.id,value};break;}
}
assert.ok(empty,'an existing unrated class must be available');
assert.ok(/not enough|insufficient|no rated|no .*rated/i.test(empty.value.teacherBrief),empty.value.teacherBrief);
await page.goto(`http://localhost:3002/teacher/lotus-portfolio?classroom=${empty.id}`);
await page.waitForTimeout(2000);
const text=await page.locator('body').innerText();
assert.ok(text.includes(empty.value.teacherBrief),'empty class brief must render');
await page.screenshot({path:'test-results/lotus-remediation/portfolio-empty.png',fullPage:true});
await writeFile('test-results/lotus-remediation/portfolio-empty.json',JSON.stringify(empty,null,2));
console.log('EMPTY CLASS PASS',empty.id,empty.value.teacherBrief);
}finally{await browser.close();}
