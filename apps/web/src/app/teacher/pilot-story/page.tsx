import { Suspense } from "react";
import Link from "next/link";
import { PilotVideoReport } from "@/components/pilot-video-report";
import styles from "../teacher.module.css";

export default function TeacherPilotStoryPage() {
  return <>
    <div className={styles.pageHeader}>
      <div><div className={styles.dateLine}>Generated immediately · 4 Sep 2026</div><h1>Personalized learning report</h1><p>Grade 8 · Section A · Signed brackets and equation foundations. Add <code>?demo=1</code> only to render fixture seeds.</p></div>
      <div className={styles.headerActions}><Link className={styles.secondary} href="/teacher/today">Back to today</Link><Link className={styles.primary} href="/student/classroom">Run another student</Link></div>
    </div>
    <Suspense fallback={null}>
      <PilotVideoReport />
    </Suspense>
  </>;
}
