"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PersonalizedVideoAssignmentView } from "@cogna/shared";
import { api } from "@/lib/api";
import { getStudent } from "@/lib/session";
import { Wordmark } from "@/components/ui";
import styles from "../student-demo.module.css";

function ExitCheck() {
  const search=useSearchParams(); const classroomAssignmentId=search.get("assignment");
  const [lesson,setLesson]=useState<PersonalizedVideoAssignmentView|null>(null); const [answer,setAnswer]=useState(""); const [working,setWorking]=useState(""); const [done,setDone]=useState<boolean|null>(null); const [error,setError]=useState("");
  useEffect(()=>{const student=getStudent();if(!student?.token){setError("Sign in as a student first.");return;} if(classroomAssignmentId)void api.startClassroomAssignment(classroomAssignmentId); api.getPersonalizedVideoAssignment(student.studentId).then(setLesson).catch(e=>setError(e instanceof Error?e.message:"No personalized exit check is ready."));},[classroomAssignmentId]);
  async function submit(){if(!lesson||!classroomAssignmentId)return;try{const result=await api.submitPersonalizedVideoExit(lesson.id,answer,working);const correct=result.exitAttempt?.correct??false;await api.completeClassroomAssignment(classroomAssignmentId,{videoAssignmentId:lesson.id,result:{prompt:lesson.exit?.prompt,answer,working,correct,independent:true}});setDone(correct);}catch(e){setError(e instanceof Error?e.message:"The exit evidence could not be stored.");}}
  return <main className={styles.stage}><header className={styles.top}><Wordmark href="/"/><span>Independent exit check</span></header><div className={styles.wrap}><div className={styles.narrow}>{done===null?<><section className={styles.hero}><div className={styles.eyebrow}>Personalized from your diagnosis · No hints</div><h1>{lesson?.exit?.prompt??"Preparing your fresh question…"}</h1><p>{lesson?.exit?.evidencePurpose??"This response is stored separately from guided and gamified practice."}</p></section><section className={styles.card}>{error&&<div className={styles.error}>{error}</div>}<div className={styles.field}><label>Final answer</label><input className={styles.input} value={answer} onChange={e=>setAnswer(e.target.value)}/></div><div className={styles.field}><label>Show your working</label><textarea className={styles.textarea} value={working} onChange={e=>setWorking(e.target.value)}/></div><button className={styles.button} disabled={!lesson||!answer.trim()||!working.trim()} onClick={()=>void submit()}>Submit independent evidence →</button></section></>:<section className={styles.card}><div className={styles.eyebrow}>Evidence safely stored</div><h1>{done?"This response was verified.":"This needs another look."}</h1><p>Cogna has updated your teacher’s live report without treating guided work as independent mastery.</p><Link className={styles.button} href="/student/classroom/live">Return to classroom →</Link></section>}</div></div></main>;
}
export default function ExitPage(){return <Suspense fallback={null}><ExitCheck/></Suspense>}
