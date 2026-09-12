"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DEMO_STUDENTS, DIAGNOSTIC_QUESTIONS, EXIT_QUESTIONS, answerIsCorrect,
  buildConclusion, saveDemoResult, type DemoResponse, type DemoStudentKey, type DemoStudentResult,
} from "@/lib/gurukul-demo";
import { Wordmark } from "@/components/ui";
import { ensureDemoStudentSession } from "@/lib/session";
import { saveMockEnrollment } from "@/lib/mock-classroom";
import { useRouter } from "next/navigation";
import styles from "./student-demo.module.css";

type Phase = "join" | "identity" | "instructions" | "diagnostic" | "profile" | "lesson" | "guided" | "exit" | "done";

export default function StudentClassroomDemoPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("join");
  const [code, setCode] = useState("GURU-8A");
  const [error, setError] = useState("");
  const [studentKey, setStudentKey] = useState<DemoStudentKey>("aarav");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [working, setWorking] = useState("");
  const [confidence, setConfidence] = useState(70);
  const [responses, setResponses] = useState<DemoResponse[]>([]);
  const [lessonAnswer, setLessonAnswer] = useState("");
  const [hintShown, setHintShown] = useState(false);
  const [exitIndex, setExitIndex] = useState(0);
  const [exitResponses, setExitResponses] = useState<DemoStudentResult["exit"]>([]);
  const student = DEMO_STUDENTS[studentKey];
  const conclusion = useMemo(() => buildConclusion(responses), [responses]);

  function findClass(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().toUpperCase() !== "GURU-8A") { setError("That class code was not found. Check it with your teacher."); return; }
    setError(""); setPhase("identity");
  }

  async function continueAsStudent() {
    const studentId = `demo_${studentKey}`;
    try {
      await ensureDemoStudentSession(studentId, student.name);
      saveMockEnrollment({
        studentId,
        fullName: student.name,
        rollNumber: student.roll,
        classCode: "GURU-8A",
        className: "Grade 8 · Section A",
        grade: "Grade 8",
        teacherName: "Ananya Rao — Demo",
      });
      setPhase("instructions");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start a signed student session.");
    }
  }

  function fillDemo() {
    const q = DIAGNOSTIC_QUESTIONS[questionIndex];
    const demo = student.demoAnswers[q.id];
    setAnswer(demo.answer); setWorking(demo.working); setConfidence(demo.confidence);
  }

  function submitDiagnostic(skipped = false) {
    const q = DIAGNOSTIC_QUESTIONS[questionIndex];
    const response: DemoResponse = { questionId:q.id, prompt:q.prompt, answer:skipped?"":answer, working:skipped?"":working, confidence, skipped, correct:!skipped && answerIsCorrect(answer,q.expected), timeSeconds: 34 + questionIndex * 11 };
    const next = [...responses, response]; setResponses(next); setAnswer(""); setWorking(""); setConfidence(70);
    if (questionIndex < DIAGNOSTIC_QUESTIONS.length - 1) setQuestionIndex(questionIndex + 1); else setPhase("profile");
  }

  function startLesson() {
    const result: DemoStudentResult = { id:`demo-${studentKey}-${Date.now()}`, studentKey, studentName:student.name, rollNumber:student.roll, startedAt:new Date().toISOString(), diagnostic:responses, conclusion, assistanceUsed:0, exit:[], outcome:"in-progress" };
    saveDemoResult(result); setPhase("lesson");
  }

  function submitExit(skipped = false) {
    const q = EXIT_QUESTIONS[exitIndex];
    const response = { questionId:q.id,prompt:q.prompt,answer:skipped?"":answer,working:skipped?"":working,confidence,skipped,correct:!skipped&&answerIsCorrect(answer,q.expected),timeSeconds:45+exitIndex*8,form:q.form };
    const next = [...exitResponses,response]; setExitResponses(next); setAnswer(""); setWorking(""); setConfidence(70);
    if(exitIndex<EXIT_QUESTIONS.length-1){setExitIndex(exitIndex+1);return;}
    const completed = next.filter(r=>!r.skipped);
    const outcome: DemoStudentResult["outcome"] = completed.length<2?"insufficient-evidence":next.every(r=>r.correct)?"independent-transfer":next[0]?.correct?"independent-familiar":"needs-reinforcement";
    saveDemoResult({id:`demo-${studentKey}-${Date.now()}`,studentKey,studentName:student.name,rollNumber:student.roll,startedAt:new Date(Date.now()-12*60*1000).toISOString(),completedAt:new Date().toISOString(),diagnostic:responses,conclusion,assistanceUsed:hintShown?1:0,guidedResponse:lessonAnswer,exit:next,outcome});
    setPhase("done");
  }

  return <div className={styles.stage}><header className={styles.top}><Wordmark href="/"/><span>Gurukul · Grade 8 Mathematics</span></header><main className={styles.wrap}>
    {phase==="join"&&<div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Student class join</div><h1>Join your Cogna class.</h1><p>No email needed. Use the code your teacher displayed.</p></section><form className={styles.card} onSubmit={findClass}><div className={styles.field}><label>Class code</label><input className={styles.input} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} /></div>{error&&<div className={styles.error}>{error}</div>}<button className={styles.button}>Find my class →</button></form></div>}
    {phase==="identity"&&<div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Class found</div><h1>Grade 8 · Section A</h1><p>Ananya Rao — Demo · Mathematics</p></section><section className={styles.card}><div className={styles.classFound}><strong>Choose a demo learner</strong><span>Demo identities provide test answers only; Cogna Lotus still selects and interprets every diagnostic question.</span></div><div className={styles.studentGrid}>{(Object.keys(DEMO_STUDENTS) as DemoStudentKey[]).map(key=><button key={key} className={`${styles.studentOption} ${studentKey===key?styles.studentOptionActive:""}`} onClick={()=>setStudentKey(key)}><strong>{DEMO_STUDENTS[key].name}</strong><span>Roll {DEMO_STUDENTS[key].roll}</span></button>)}</div>{error&&<div className={styles.error}>{error}</div>}<button className={styles.button} onClick={() => void continueAsStudent()}>Continue as {student.name.split(" ")[0]} →</button></section></div>}
    {phase==="instructions"&&<div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Before you begin · about 20 minutes</div><h1>Show Cogna how you think.</h1><p>This is a starting-point check, not a marks test.</p></section><section className={styles.card}><div className={styles.rules}><div className={styles.rule}><b>✓</b><span>Work independently. Your teacher is supervising the class.</span></div><div className={styles.rule}><b>✎</b><span>Rough paper is welcome. Enter important working steps into Cogna.</span></div><div className={styles.rule}><b>×</b><span>Do not use a calculator or ask a friend.</span></div><div className={styles.rule}><b>?</b><span>Skip when you genuinely do not know. Cogna will record insufficient evidence rather than call it a weakness.</span></div></div><button className={styles.button} onClick={()=>router.push(`/student/lotus?demo=${studentKey}`)}>I understand — start Cogna Lotus →</button></section></div>}
    {phase==="diagnostic"&&(()=>{const q=DIAGNOSTIC_QUESTIONS[questionIndex];return <div className={styles.narrow}><div className={styles.questionTop}><div><div className={styles.eyebrow}>Initial diagnostic · Anchor question</div><span className={styles.progress}>Question {questionIndex+1} of {DIAGNOSTIC_QUESTIONS.length}</span></div><button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} onClick={fillDemo}>Use {student.name.split(" ")[0]}’s demo response</button></div><section className={styles.card}><div className={styles.question}>{q.prompt}</div><p className={styles.why}>Why this is asked: {q.why}</p><div className={styles.field}><label>Your final answer</label><input className={styles.input} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Enter your answer" /></div><div className={styles.field}><label>Show the important working steps</label><textarea className={styles.textarea} value={working} onChange={e=>setWorking(e.target.value)} placeholder="Write one step per line" /></div><div className={styles.row}><div className={styles.confidence}><span>How sure are you? {confidence}%</span><input type="range" min="0" max="100" value={confidence} onChange={e=>setConfidence(Number(e.target.value))}/></div></div><div className={styles.row}><button className={styles.button} disabled={!answer||!working} onClick={()=>submitDiagnostic(false)}>Submit answer →</button><button className={`${styles.button} ${styles.buttonSecondary}`} onClick={()=>submitDiagnostic(true)}>I don’t know / skip</button></div></section></div>})()}
    {phase==="profile"&&<div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Starting learner profile · Evidence collected</div><h1>Cogna found a useful starting point.</h1></section><section className={`${styles.card} ${styles.profileHero}`}><div className={styles.eyebrow}>{conclusion.status.replaceAll("-"," ")} · uncertainty {conclusion.uncertainty}</div><h2>{conclusion.headline}</h2><div className={styles.evidenceBox}><div className={styles.evidenceLine}><span>Observed</span>{conclusion.observation}</div><div className={styles.evidenceLine}><span>Interpretation</span>{conclusion.interpretation}</div></div><button className={styles.button} onClick={startLesson}>Start my personalized lesson →</button></section></div>}
    {phase==="lesson"&&<div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Personalized teaching · approximately 20 minutes</div><h1>{conclusion.teachingTitle}</h1><p>{conclusion.teachingExplanation}</p></section><section className={`${styles.card} ${styles.lesson}`}><div className={styles.eyebrow} style={{color:"#8ad2b8"}}>Worked example · mathematically verified</div><div className={styles.worked}>{conclusion.workedExample.map(line=><div key={line}>{line}</div>)}</div><button className={styles.button} onClick={()=>setPhase("guided")}>Try one with guidance →</button></section></div>}
    {phase==="guided"&&<div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Guided practice</div><h1>Now you take the next step.</h1></section><section className={styles.card}><div className={styles.question}>{conclusion.guidedPrompt}</div><div className={styles.field}><label>Your answer</label><input className={styles.input} value={lessonAnswer} onChange={e=>setLessonAnswer(e.target.value)}/></div>{hintShown&&<div className={styles.hint}><strong>Small hint:</strong> {conclusion.hint}</div>}<div className={styles.row}>{!hintShown&&<button className={`${styles.button} ${styles.buttonSecondary}`} onClick={()=>setHintShown(true)}>Give me a small hint</button>}<button className={styles.button} disabled={!lessonAnswer} onClick={()=>{saveDemoResult({id:`demo-${studentKey}-${Date.now()}`,studentKey,studentName:student.name,rollNumber:student.roll,startedAt:new Date().toISOString(),diagnostic:responses,conclusion,assistanceUsed:hintShown?1:0,guidedResponse:lessonAnswer,exit:[],outcome:"in-progress"});setPhase("exit")}}>Continue to independent check →</button></div></section></div>}
    {phase==="exit"&&(()=>{const q=EXIT_QUESTIONS[exitIndex];return <div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Independent exit check · No hints</div><h1>Show what you can do on your own.</h1><p>These questions are fresh—they were not used in your lesson.</p></section><section className={styles.card}><div className={styles.questionTop}><span className={styles.status}>{q.form==="familiar"?"Familiar form":"Changed form / transfer"}</span><span className={styles.progress}>{exitIndex+1} of {EXIT_QUESTIONS.length}</span></div><div className={styles.question}>{q.prompt}</div><div className={styles.field}><label>Final answer</label><input className={styles.input} value={answer} onChange={e=>setAnswer(e.target.value)}/></div><div className={styles.field}><label>Working steps</label><textarea className={styles.textarea} value={working} onChange={e=>setWorking(e.target.value)}/></div><div className={styles.row}><div className={styles.confidence}><span>Confidence {confidence}%</span><input type="range" min="0" max="100" value={confidence} onChange={e=>setConfidence(Number(e.target.value))}/></div><button className={styles.button} disabled={!answer||!working} onClick={()=>submitExit(false)}>Submit independently →</button><button className={`${styles.button} ${styles.buttonSecondary}`} onClick={()=>submitExit(true)}>Skip</button></div></section></div>})()}
    {phase==="done"&&<div className={styles.narrow}><section className={styles.hero}><div className={styles.eyebrow}>Session complete</div><h1>Your evidence is with your teacher.</h1><p>Cogna has separated what you did independently from anything completed with support.</p></section><section className={styles.card}><div className={styles.resultBand}><div><span>Diagnostic</span><strong>{responses.filter(r=>r.correct).length}/3 anchors correct</strong></div><div><span>Support</span><strong>{hintShown?"1 hint used":"No hint used"}</strong></div><div><span>Exit check</span><strong>{exitResponses.filter(r=>r.correct).length}/2 independent</strong></div></div><div className={styles.hint}><strong>Retention preview:</strong> Cogna would schedule a fresh delayed check in 3–7 days. This demo does not claim retention today.</div><Link className={styles.button} style={{display:"flex",textDecoration:"none"}} href="/teacher/today">Open the immediate teacher report →</Link></section></div>}
  </main></div>;
}
