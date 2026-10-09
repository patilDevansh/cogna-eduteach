"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type ParentChildOverview, type ParentNotificationItem } from "@/lib/api";
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
  const [updates, setUpdates] = useState<{ unread: number; items: ParentNotificationItem[] } | null>(null);
  // Asked on the card itself: browser confirm() dialogs are silently refused by some
  // embedded and kiosk-mode browsers (e.g. locked-down school tablets).
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
        api.getParentNotifications(auth).then(setUpdates).catch(() => undefined);
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
    setConfirmId(null);
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

  async function markRead() {
    try {
      await api.markParentNotificationsRead(await getAuth());
      setUpdates((prev) => (prev ? { unread: 0, items: prev.items.map((n) => ({ ...n, read: true })) } : prev));
    } catch {
      // Still unread; the next refresh shows them again.
    }
  }

  if (!isLoaded || !isSignedIn) return <p className={styles.page}>Loading…</p>;

  const all = Object.values(overviews);
  const sum = (f: (o: ParentChildOverview) => number) => all.reduce((n, o) => n + f(o), 0);
  const firstName = display?.name?.split(/\s+/)[0];
  const secure = sum((o) => latestGrowth(o)?.growth.latestSecure ?? 0);
  const checks = sum((o) => o.totals.checksDone);
  const lessons = sum((o) => o.totals.lessonsFinished);

  return (
    <div className="dash">
      <main id="main" className="dash-wrap">
        <nav className="dash-nav">
          <Link href="/" className="wordmark">Cogna<span className="dot">.</span></Link>
          <button type="button" className="btn btn-quiet" onClick={async () => { await signOut(); router.push("/"); }}>Sign out</button>
        </nav>

        <header className="dash-head rise">
          <div>
            <h1 className="dash-title">{firstName ? `Hello, ${firstName}.` : "Hello."}</h1>
            <p className="dash-sub">{summary(children?.length ?? 0, secure, checks, lessons)}</p>
          </div>
          <Link href="/parent/students/new" className="btn btn-ghost btn-pill">Add a child</Link>
        </header>


        {error && <p className="error">{error}</p>}
        {children === null && !error && (
          <ul className={styles.cards} aria-busy="true" aria-label="Loading your children">
            {[0, 1].map((k) => (
              <li className="dash-card" key={k}>
                <div className={styles.cardTop}>
                  <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 15 }} />
                  <div className={styles.who}>
                    <div className="skeleton" style={{ height: 20, width: "55%" }} />
                    <div className="skeleton" style={{ height: 12, width: "35%", marginTop: 10 }} />
                  </div>
                </div>
                <div className="skeleton" style={{ height: 8, marginTop: 28 }} />
                <div className="skeleton" style={{ height: 40, width: 150, marginTop: 36, borderRadius: 999 }} />
              </li>
            ))}
          </ul>
        )}

        {children?.length === 0 && (
          <div className="dash-card rise">
            <h2 className="dash-section-title">Add your first child</h2>
            <p className="dash-sub" style={{ marginBottom: "var(--s-5)" }}>You’ll get a sign-in code they use to start practising.</p>
            <Link href="/parent/students/new" className="btn btn-primary btn-pill">Add a child</Link>
          </div>
        )}

        {updates && updates.items.length > 0 && (
          <section className={styles.updates} aria-label="Updates from school" data-testid="parent-updates">
            <div className={styles.updatesHead}>
              <h2>Updates from school{updates.unread ? ` · ${updates.unread} new` : ""}</h2>
              {updates.unread > 0 && <button type="button" className="btn btn-ghost" onClick={() => void markRead()}>Mark all as read</button>}
            </div>
            <ul className={styles.cards}>
              {updates.items.slice(0, 6).map((n) => (
                <li key={n.id} className={`dash-card ${styles.update}`} data-unread={!n.read || undefined}>
                  <strong>{n.title}</strong>
                  <span>{shortDate(n.createdAt)}{n.read ? "" : " · New"}</span>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {children && children.length > 0 && <h2 className="dash-section-title rise" style={{ ["--i" as string]: 4 }}>Your children</h2>}
        <ul className={styles.cards}>
          {children?.map((child, index) => {
            const o = overviews[child.id];
            const g = o ? latestGrowth(o) : null;
            const total = g ? g.growth.latestSecure + g.growth.stillWorking.length : 0;
            const gained = g ? g.growth.latestSecure - g.growth.firstSecure : 0;
            return (
              <li className="dash-card rise" key={child.id} style={{ ["--i" as string]: index + 5 }}>
                <div className={styles.cardTop}>
                  <div className="avatar" style={{ ["--hue" as string]: hueFor(child.name) }} aria-hidden>{initials(child.name)}</div>
                  <div className={styles.who}>
                    <h3>{child.name}</h3>
                    <span>
                      Grade {child.grade}
                      {o ? (o.lastActive ? ` · Last practised ${shortDate(o.lastActive)}` : " · Not started yet") : ""}
                    </span>
                  </div>
                </div>

                {g && total > 0 && (
                  <div className={styles.skills}>
                    <div className={styles.skillsHead}>
                      <span>{g.name}</span>
                      <span><strong>{g.growth.latestSecure}</strong> of {total} skills secure</span>
                    </div>
                    <div className={styles.bar} role="img" aria-label={`${g.growth.latestSecure} of ${total} skills secure`}>
                      {Array.from({ length: total }, (_, k) => (
                        <i key={k} className={k < g.growth.latestSecure ? (k >= g.growth.firstSecure ? styles.gained : styles.on) : ""} />
                      ))}
                    </div>
                  </div>
                )}

                {o && (
                  <div className={styles.lines}>
                    {o.classes.map((c) => {
                      const line = classCheckLine(c.check);
                      const live = c.check?.stageStatus === "IN_PROGRESS";
                      return (
                        <p key={c.classroomId} className={`status-chip ${line.tone === "wait" ? "" : line.tone} ${live ? "live" : ""}`}>
                          <span><strong>{c.name}</strong> · {line.text}</span>
                        </p>
                      );
                    })}
                    {!o.classes.length && (
                      <p className="status-chip">
                        Not in a class yet.{o.totals.lessonsFinished ? ` ${o.totals.lessonsFinished} personal lesson${o.totals.lessonsFinished === 1 ? "" : "s"} finished.` : ""}
                      </p>
                    )}
                    {g && gained > 0 && <p className={styles.growth}>{gained} more skill{gained === 1 ? "" : "s"} secure than at the first check.</p>}
                  </div>
                )}

                {codes[child.id] && (
                  <div className={styles.code} role="status">
                    <span>New sign-in code for {child.name.split(/\s+/)[0]}</span>
                    <strong className="access-code">{codes[child.id]}</strong>
                    <button type="button" className="btn-link" onClick={() => void navigator.clipboard?.writeText(codes[child.id]!).catch(() => undefined)}>Copy</button>
                    <small>Save it now: it won’t be shown again, and the old code no longer works.</small>
                  </div>
                )}

                {confirmId === child.id && (
                  <div className={styles.confirm} role="alertdialog" aria-label={`Make a new sign-in code for ${child.name}`}>
                    <p>Make a new sign-in code for {child.name.split(/\s+/)[0]}? Their current code will stop working.</p>
                    <div>
                      <button type="button" className="btn btn-primary btn-pill" disabled={busyId === child.id} onClick={() => void newCode(child)}>
                        {busyId === child.id ? "Making a code…" : "Make a new code"}
                      </button>
                      <button type="button" className="btn-link" onClick={() => setConfirmId(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                <div className={styles.cardActions}>
                  <Link href={`/parent/students/${child.id}`} className="btn btn-primary btn-pill">See progress</Link>
                  <Link href={`/parent/students/${child.id}/weekly`} className="btn-link">Weekly update</Link>
                  <Link href={`/parent/students/${child.id}/summary`} className="btn-link">Latest practice</Link>
                  <button type="button" className={`btn-link ${styles.pushRight}`} aria-expanded={confirmId === child.id} onClick={() => setConfirmId(confirmId === child.id ? null : child.id)}>
                    Lost the sign-in code?
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

/** The topic most recently checked: that's the one a parent cares about now. */
function latestGrowth(o: ParentChildOverview) {
  return [...o.growth].sort((a, b) => b.growth.latestDate.localeCompare(a.growth.latestDate))[0] ?? null;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

/** A stable colour per child, so each keeps the same avatar. */
function hueFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** One plain sentence instead of a row of number tiles. */
function summary(children: number, secure: number, checks: number, lessons: number): string {
  if (!children) return "Add a child to get their sign-in code.";
  const bits = [
    secure ? `${secure} skill${secure === 1 ? "" : "s"} secure` : "",
    checks ? `${checks} class check${checks === 1 ? "" : "s"} done` : "",
    lessons ? `${lessons} personal lesson${lessons === 1 ? "" : "s"} finished` : "",
  ].filter(Boolean);
  if (!bits.length) return "Nothing to report yet. You’ll see their progress here after their first class check.";
  return `So far: ${bits.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
}
