"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, type ParentChildOverview } from "@/lib/api";
import { useParentAuth } from "@/lib/parent-auth-context";
import { classCheckLine, shortDate } from "@/lib/parent-status";
import { useRefreshTick } from "@/lib/use-refresh-tick";
import styles from "../../parent.module.css";

export default function ParentChildPage() {
  const router = useRouter();
  const studentId = String(useParams().id ?? "");
  const { isLoaded, isSignedIn, getAuth } = useParentAuth();
  const [data, setData] = useState<ParentChildOverview | null>(null);
  const [error, setError] = useState("");
  const tick = useRefreshTick();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/parent/login");
      return;
    }
    getAuth()
      .then((auth) => api.getParentChildOverview(auth, studentId))
      .then((overview) => {
        setData(overview);
        document.title = `${overview.student.name} — Cogna`;
      })
      .catch(() => setError("We couldn’t load this page. Please refresh, or go back to your dashboard."));
  }, [isLoaded, isSignedIn, getAuth, router, studentId, tick]);

  if (!isLoaded || !isSignedIn) return <p className={styles.page}>Loading…</p>;

  const first = data?.student.name.split(/\s+/)[0] ?? "";

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/parent/dashboard">← Your children</Link>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="lead">Loading…</p>}

      {data && (
        <>
          <div className={styles.head}>
            <div>
              <h1>{data.student.name}</h1>
              <p>Grade {data.student.grade}{data.lastActive ? ` · Last practised ${shortDate(data.lastActive)}` : " · Not started yet"}</p>
            </div>
            <div className="actions">
              <Link href={`/parent/students/${studentId}/weekly`} className="btn btn-secondary">Weekly update</Link>
            </div>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}><span>Quick checks done</span><strong>{data.totals.checksDone}</strong></div>
            <div className={styles.stat}><span>Lessons finished</span><strong>{data.totals.lessonsFinished}</strong></div>
            <div className={styles.stat}><span>Classes</span><strong>{data.classes.length}</strong></div>
          </div>

          <section className={styles.section}>
            <h2>At school</h2>
            {data.classes.length === 0 ? (
              <div className="empty-state"><p>{first} isn’t in a class on Cogna yet. When their teacher adds them, how they’re doing in class shows up here.</p></div>
            ) : (
              <ul className={styles.list}>
                {data.classes.map((c) => {
                  const line = classCheckLine(c.check);
                  return (
                    <li className={styles.item} key={c.classroomId}>
                      <div className={styles.itemHead}>
                        <strong>{c.name}</strong>
                        <span className={styles.meta}>{c.teacherName}{c.check ? ` · ${c.check.title}, ${shortDate(c.check.date)}` : ""}</span>
                      </div>
                      <p className={`${styles.line} ${styles[line.tone]}`}>{line.text}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h2>Personal lessons</h2>
            <p>Each lesson is made for one step {first} was stuck on. The final question is answered with no help, so it shows what they can do on their own.</p>
            {data.lessons.length === 0 ? (
              <div className="empty-state"><p>No personal lessons yet. One is made after a quick check finds a step to work on.</p></div>
            ) : (
              <ul className={styles.list}>
                {data.lessons.map((l) => {
                  const [label, cls] = l.finalCorrect === true
                    ? ["Got it on their own", ""]
                    : l.finalCorrect === false
                      ? ["Still tricky", styles.pillWork]
                      : l.finished
                        ? ["Lesson finished", ""]
                        : ["Not finished yet", styles.pillWait];
                  return (
                    <li className={styles.item} key={l.id}>
                      <div className={styles.itemHead}>
                        <strong>{l.title}</strong>
                        <span className={`${styles.pill} ${cls}`}>{label}</span>
                      </div>
                      <p className={styles.meta} style={{ margin: "var(--s-1) 0 0" }}>{shortDate(l.date)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className={styles.note}>
            Cogna only reports what {first} actually did: answers, lessons and final questions. It never scores personality, intelligence or speed.
          </p>
        </>
      )}
    </div>
  );
}
