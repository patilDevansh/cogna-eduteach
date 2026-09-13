"use client";

import { useRouter } from "next/navigation";
import { saveMockClassroom } from "@/lib/mock-classroom";
import styles from "../teacher.module.css";

export default function TeacherSetupPage() {
  const router = useRouter();
  return (
    <div className={styles.authPage}>
      <section className={styles.authStory}>
        <a href="/" className={styles.lightWordmark}>Cogna<span>.</span></a>
        <div className={styles.storyCopy}>
          <p className="eyebrow" style={{ color: "#8ad2b8" }}>One-minute setup</p>
          <h1>Give Cogna the classroom context.</h1>
          <p>This is how the system connects student evidence to what you taught.</p>
        </div>
        <p className={styles.trustNote}>You can change the current and upcoming topic before every session.</p>
      </section>
      <section className={styles.authFormWrap}>
        <form className={styles.authCard} onSubmit={(event) => {
          event.preventDefault();
          saveMockClassroom({ teacherName: "Ananya Rao — Demo", schoolName: "Gurukul", grade: "Grade 8", className: "Grade 8 · Section A", subject: "Mathematics", shareCode: "GURU-8A" });
          router.push("/teacher/today");
        }}>
          <p className="eyebrow">Set up your first class</p>
          <h2>Grade 8 · Section A</h2>
          <p>Cogna will generate a class code when you finish.</p>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>Class name<input className={styles.formInput} defaultValue="Section A" required /></label>
            <label className={styles.formLabel}>Students<input className={styles.formInput} type="number" defaultValue="30" required /></label>
            <label className={`${styles.formLabel} ${styles.full}`}>What was taught today?<select className={styles.formInput} defaultValue="Simple equations in one variable"><option>Simple equations in one variable</option><option>Expanding algebraic brackets</option><option>Combining like terms</option></select></label>
            <label className={`${styles.formLabel} ${styles.full}`}>What comes next?<select className={styles.formInput} defaultValue="Equations with brackets"><option>Equations with brackets</option><option>Variables on both sides</option><option>Factorisation</option></select></label>
            <label className={styles.formLabel}>Diagnostic<select className={styles.formInput}><option>20 minutes</option></select></label>
            <label className={styles.formLabel}>Learning session<select className={styles.formInput}><option>20 minutes</option></select></label>
            <button className={styles.submitButton} type="submit">Create class and open dashboard →</button>
          </div>
        </form>
      </section>
    </div>
  );
}
