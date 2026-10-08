"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type ParentChildOverview } from "@/lib/api";
import { useParentAuth } from "@/lib/parent-auth-context";
import { classCheckLine, shortDate } from "@/lib/parent-status";
import { useRefreshTick } from "@/lib/use-refresh-tick";
import styles from "../parent.module.css";

type Child = { id: string; name: string; grade: number };

export default function ParentDashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, display, getAuth, signOut } = useParentAuth();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [overviews, setOverviews] = useState<Record<string, ParentChildOverview>>({});
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // One request per child per refresh: a minute is plenty for a parent's overview.
  const tick = useRefreshTick(60_000);

  useEffect(() => {
    document.title = "Your children — Cogna";
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/parent/login");
      return;
    }
    getAuth()
      .then(async (auth) => {
        const list = await api.listStudents(auth);
        setChildren(list);
        // Each child's card fills in as its overview arrives; one failing doesn't hide the others.
        for (const child of list) {
          api.getParentChildOverview(auth, child.id)
            .then((o) => setOverviews((prev) => ({ ...prev, [child.id]: o })))
            .catch(() => undefined);
        }
      })
      .catch(() => setError("We couldn’t load your children. Please refresh the page."));
  }, [isLoaded, isSignedIn, getAuth, router, tick]);

  async function newCode(child: Child) {
    if (!window.confirm(`Make a new sign-in code for ${child.name}? Their current code will stop working.`)) return;
    setBusyId(child.id);
    setError("");
    try {
      const result = await api.regenerateAccessCode(await getAuth(), child.id);
      setCodes((prev) => ({ ...prev, [child.id]: result.accessCode }));
    } catch {
      setError("Couldn’t make a new code. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (!isLoaded || !isSignedIn) return <p className={styles.page}>Loading…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/" className="wordmark">Cogna<span className="dot">.</span></Link>
        <button type="button" className="btn btn-ghost" onClick={async () => { await signOut(); router.push("/"); }}>Sign out</button>
      </div>

      <div className={styles.head}>
        <div>
          <h1>Hello{display?.name ? `, ${display.name.split(/\s+/)[0]}` : ""}</h1>
          <p>How each child is doing, in plain words.</p>
        </div>
        <Link href="/parent/students/new" className="btn btn-secondary">Add a child</Link>
      </div>

      {error && <p className="error">{error}</p>}
      {children === null && !error && <p className="lead">Loading…</p>}

      {children?.length === 0 && (
        <div className="empty-state">
          <p>No children added yet.</p>
          <p><Link href="/parent/students/new">Add your child</Link> to get their sign-in code.</p>
        </div>
      )}

      <ul className={styles.list}>
        {children?.map((child) => {
          const o = overviews[child.id];
          return (
            <li className={styles.item} key={child.id}>
              <div className={styles.child}>
                <div>
                  <h2>{child.name}</h2>
                  <span className={styles.meta}>
                    Grade {child.grade}
                    {o ? (o.lastActive ? ` · Last practised ${shortDate(o.lastActive)}` : " · Not started yet") : ""}
                  </span>
                </div>
                <Link href={`/parent/students/${child.id}`} className="btn btn-primary">See progress</Link>
              </div>

              {o && (
                <div className={styles.childLines}>
                  {o.classes.map((c) => {
                    const line = classCheckLine(c.check);
                    return <p key={c.classroomId} className={`${styles.line} ${styles[line.tone]}`}><span><strong>{c.name}:</strong> {line.text}</span></p>;
                  })}
                  {!o.classes.length && <p className={styles.line}>Not in a class yet. {o.totals.lessonsFinished ? `${o.totals.lessonsFinished} personal lesson${o.totals.lessonsFinished === 1 ? "" : "s"} finished.` : ""}</p>}
                </div>
              )}

              {codes[child.id] && (
                <p className="lead">New sign-in code: <span className="access-code">{codes[child.id]}</span> Save it now; it won’t be shown again.</p>
              )}

              <details className={styles.more}>
                <summary>More</summary>
                <div className="actions">
                  <Link href={`/parent/students/${child.id}/weekly`} className="btn btn-secondary">Weekly update</Link>
                  <Link href={`/parent/students/${child.id}/summary`} className="btn btn-secondary">Latest practice summary</Link>
                  <button type="button" className="btn btn-secondary" disabled={busyId === child.id} onClick={() => void newCode(child)}>
                    {busyId === child.id ? "Making…" : "Lost the sign-in code?"}
                  </button>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
