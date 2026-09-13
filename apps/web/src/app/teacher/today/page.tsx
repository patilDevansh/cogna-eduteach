import Link from "next/link";
import styles from "../teacher.module.css";
import { TeacherDemoLive } from "@/components/teacher-demo-live";

const skills = [
  ["Two-step equation solving", 83, "Secure", "#17734f"],
  ["Variables on both sides", 63, "Developing", "#d58b17"],
  ["Preserving signs", 47, "Reinforce", "#c56636"],
  ["Changed-form transfer", 53, "Check again", "#7956a8"],
] as const;

export default function TeacherTodayPage() {
  return (
    <>
      <div className={styles.pageHeader}>
        <div><div className={styles.dateLine}>● Evidence ready · Today</div><h1>Good afternoon, Ananya.</h1><p>Here is the shortest useful read on Grade 8 · Section A.</p></div>
        <div className={styles.headerActions}><Link className={styles.secondary} href="/teacher/classes">Class code: GURU-8A</Link><Link className={styles.primary} href="/teacher/sessions">Start a session</Link></div>
      </div>

      <TeacherDemoLive />

      <section className={styles.pilotCallout}>
        <div><div className={styles.dateLine}>New · five personalized learning trails</div><h2>Aarav and four classmates now have evidence-linked video lessons.</h2><p>See each diagnostic decision, generated teaching objective, verified micro-video, exit evidence, and teacher action in one concise report.</p></div>
        <Link className={styles.primary} href="/teacher/pilot-story">Open five-student story →</Link>
      </section>

      <section className={styles.decisionCard}>
        <div className={styles.decisionTop}><div><div className={styles.dateLine} style={{ color: "#8ad2b8" }}>Cogna’s teaching recommendation</div><h2>Reinforce signed operations for 10 minutes before equations with brackets.</h2><p>Most students can solve familiar equations. The class-wide blocker is keeping both negative signs visible while expanding brackets.</p></div><span className={styles.signal}>Reinforcement advised</span></div>
        <div className={styles.decisionAction}><strong>18 progress · 8 targeted bridge · 4 need a fresh check</strong><Link className={styles.decisionLink} href="/teacher/reports">See the 10-minute plan →</Link></div>
      </section>

      <section className={styles.metricGrid} aria-label="Class summary">
        <article className={styles.metric}><div className={styles.metricTop}><span>UNDERSTOOD TODAY</span><span>✓</span></div><strong>63%</strong><p>19 of 30 showed the taught method independently.</p><div className={styles.meter}><span style={{ width: "63%" }} /></div></article>
        <article className={styles.metric}><div className={styles.metricTop}><span>READY NEXT</span><span>→</span></div><strong>18</strong><p>Students have the prerequisites for tomorrow.</p><div className={styles.meter}><span style={{ width: "60%" }} /></div></article>
        <article className={styles.metric}><div className={styles.metricTop}><span>NEED A BRIDGE</span><span>△</span></div><strong>8</strong><p>A specific gap is supported by repeated evidence.</p><div className={styles.meter}><span style={{ width: "27%", background: "#d58b17" }} /></div></article>
        <article className={styles.metric}><div className={styles.metricTop}><span>EVIDENCE CHECK</span><span>?</span></div><strong>4</strong><p>Cogna is withholding a weakness conclusion.</p><div className={styles.meter}><span style={{ width: "13%", background: "#7956a8" }} /></div></article>
      </section>

      <section className={styles.sectionGrid}>
        <article className={styles.panel}><div className={styles.panelHeader}><div><h3>What landed—and what did not</h3><p>Independent exit evidence · 30 students</p></div><Link className={styles.textLink} href="/teacher/reports">Open class report →</Link></div><div className={styles.skillRows}>{skills.map(([name, value, state, color]) => <div className={styles.skillRow} key={name}><strong>{name}</strong><div className={styles.skillTrack}><span style={{ width: `${value}%`, background: color }} /></div><span className={styles.skillState} style={{ color }}>{state}</span></div>)}</div></article>
        <article className={styles.panel}><div className={styles.panelHeader}><div><h3>Your next three moves</h3><p>Smallest useful actions first</p></div></div><div className={styles.nextSteps}><div className={styles.nextStep}><span>0–10 min · Whole class</span><strong>Make both signs visible</strong><p>Compare −2(y−5) with 2(y−5).</p></div><div className={styles.nextStep}><span>Then · Split support</span><strong>8 targeted, 18 progress</strong><p>Avoid reteaching the entire class.</p></div><div className={styles.nextStep}><span>Before concluding</span><strong>Recheck 4 students</strong><p>Current evidence is conflicting or sparse.</p></div></div></article>
      </section>
    </>
  );
}
