"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { latestStoredLotusSession, saveStoredLotusSession, type StoredLotusSession } from "@/lib/lotus-demo-store";
import styles from "../../classroom/student-demo.module.css";

type Phase = "lesson" | "guided" | "exit1" | "exit2" | "done";
const exitItems = [
  { prompt: "Expand: −3(a − 4)", expected: "-3a+12", form: "familiar" as const },
  { prompt: "Solve: −2(x − 6) = 8", expected: "2", form: "transfer" as const },
];
const normal = (value:string)=>value.toLowerCase().replace(/\s|−/g,(c)=>c==="−"?"-":"");

export default function LotusLearningPage(){
  const [stored,setStored]=useState<StoredLotusSession|null>(null);
  const [phase,setPhase]=useState<Phase>("lesson");
  const [answer,setAnswer]=useState(""); const [working,setWorking]=useState(""); const [guided,setGuided]=useState(""); const [hint,setHint]=useState(false);
  const [exit,setExit]=useState<NonNullable<StoredLotusSession["exit"]>>([]);
  useEffect(()=>setStored(latestStoredLotusSession()),[]);
  const module = useMemo(()=>{
    const report=stored?.session.finalReport;
    if(report?.outcome==="ADVANCEMENT") return {title:"Advance to equations with brackets",explanation:"Lotus found the target foundation secure enough to test a more complex form.",steps:["3(x − 2) = x + 10","3x − 6 = x + 10","2x = 16","x = 8"],guided:"Solve: 4(x − 1) = 2x + 10",hint:"Expand first, then collect the x terms."};
    if(report?.outcome==="INSUFFICIENT_OR_CONFLICTING") return {title:"Collect one clearer piece of evidence",explanation:"Lotus abstained from assigning a weakness. This short module rebuilds a clean starting point.",steps:["Write each signed product.","Change only one line at a time.","Say ‘I don’t know’ instead of guessing."],guided:"Expand: −2(y − 3)",hint:"Write (−2)y + (−2)(−3)."};
    return {title:report?.recommendedNextStep||"Preserve signs while opening brackets",explanation:report?.startingPoint||"Lotus selected this as the most useful evidenced starting point.",steps:["−2(y − 5)","= (−2)y + (−2)(−5)","= −2y + 10"],guided:"Expand: −4(m − 3)",hint:"Make both signed products visible first."};
  },[stored]);
  if(!stored) return <main className={styles.stage}><div className={styles.wrap}><section className={styles.card}><h1>No completed Lotus diagnostic found.</h1><Link className={styles.button} href="/student/classroom">Join the class →</Link></section></div></main>;
  const activeSession = stored;
  function submitExit(index:number){const item=exitItems[index];const row={prompt:item.prompt,answer,working,correct:normal(answer)===normal(item.expected),form:item.form};const next=[...exit,row];setExit(next);setAnswer("");setWorking("");if(index===0)setPhase("exit2");else{saveStoredLotusSession({session:activeSession.session,studentName:activeSession.studentName,enrollment:activeSession.enrollment,teaching:{moduleTitle:module.title,hintUsed:hint,guidedAnswer:guided},exit:next,savedAt:new Date().toISOString()});setPhase("done")}}
  return <main className={styles.stage}><header className={styles.top}><Wordmark href="/"/><span>Cogna Lotus → personalized learning</span></header><div className={styles.wrap}><div className={styles.narrow}>
    {phase==="lesson"&&<><section className={styles.hero}><div className={styles.eyebrow}>Selected from Lotus’s final report</div><h1>{module.title}</h1><p>{module.explanation}</p></section><section className={`${styles.card} ${styles.lesson}`}><div className={styles.eyebrow} style={{color:"#8ad2b8"}}>Verified teaching module</div><div className={styles.worked}>{module.steps.map(step=><div key={step}>{step}</div>)}</div><button className={styles.button} onClick={()=>setPhase("guided")}>Try guided practice →</button></section></>}
    {phase==="guided"&&<><section className={styles.hero}><div className={styles.eyebrow}>Guided practice · assistance tracked</div><h1>{module.guided}</h1></section><section className={styles.card}><div className={styles.field}><label>Your answer</label><input className={styles.input} value={guided} onChange={e=>setGuided(e.target.value)}/></div>{hint&&<div className={styles.hint}>{module.hint}</div>}<div className={styles.row}>{!hint&&<button className={`${styles.button} ${styles.buttonSecondary}`} onClick={()=>setHint(true)}>Give me one small hint</button>}<button className={styles.button} disabled={!guided} onClick={()=>setPhase("exit1")}>Begin independent exit check →</button></div></section></>}
    {(phase==="exit1"||phase==="exit2")&&(()=>{const index=phase==="exit1"?0:1;const item=exitItems[index];return <><section className={styles.hero}><div className={styles.eyebrow}>Independent exit · {item.form} form · No hints</div><h1>{item.prompt}</h1><p>This is fresh evidence and is stored separately from guided practice.</p></section><section className={styles.card}><div className={styles.field}><label>Final answer</label><input className={styles.input} value={answer} onChange={e=>setAnswer(e.target.value)}/></div><div className={styles.field}><label>Working steps</label><textarea className={styles.textarea} value={working} onChange={e=>setWorking(e.target.value)}/></div><button className={styles.button} disabled={!answer||!working} onClick={()=>submitExit(index)}>Submit independently →</button></section></>})()}
    {phase==="done"&&<><section className={styles.hero}><div className={styles.eyebrow}>Connected session complete</div><h1>Your teacher’s report is ready.</h1><p>It contains the real Lotus diagnostic audit, the learning path selected from its conclusion, assistance, and fresh exit evidence.</p></section><section className={styles.card}><div className={styles.resultBand}><div><span>Lotus diagnostic</span><strong>{stored.session.audits.length} responses audited</strong></div><div><span>Learning support</span><strong>{hint?"One hint":"Independent"}</strong></div><div><span>Exit</span><strong>{exit.filter(x=>x.correct).length}/2 verified</strong></div></div><div className={styles.hint}><strong>Retention:</strong> not claimed today. A delayed fresh check remains scheduled as a future stage.</div><Link className={styles.button} style={{display:"flex",textDecoration:"none"}} href="/teacher/today">Open teacher report →</Link></section></>}
  </div></div></main>
}
