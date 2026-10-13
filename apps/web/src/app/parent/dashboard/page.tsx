"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type ParentChildOverview, type ParentNotificationItem, type ParentWork } from "@/lib/api";
import { useParentAuth } from "@/lib/parent-auth-context";
import { shortDate } from "@/lib/parent-status";
import { deadlineShare, dueLabel, growthFor, latestCheck, shortDay, stuckView, taskName, topicSkills, type DueTone, type StepLook } from "@/lib/parent-home";
import { pendingParentCode } from "@/lib/pending-parent-code";
import { useRefreshTick } from "@/lib/use-refresh-tick";
import parentStyles from "../parent.module.css";
import styles from "./home.module.css";

type Child = { id: string; name: string; grade: number };

const COLORS = { onTime: "#0e6b54", late: "#a2660d", missed: "#7d8c84", track: "#e6ece7" };
const DUE_FILL: Record<DueTone, string> = { calm: "#0e6b54", soon: "#a2660d", over: "#8a4a0c", grey: "#9aa8a0" };
const DUE_CHIP: Record<DueTone, string> = { calm: styles.chipCalm!, soon: styles.chipSoon!, over: styles.chipOver!, grey: styles.chipGrey! };
const STUCK_CHIP = { good: styles.chipGood!, soon: styles.chipSoon!, calm: styles.chipCalm!, grey: styles.chipGrey! };
const DOT: Record<StepLook, string> = { done: styles.dotDone!, good: styles.dotGood!, work: styles.dotWork!, now: styles.dotNow!, unsure: styles.dotUnsure!, todo: "" };

export default function ParentDashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, display, getAuth, signOut } = useParentAuth();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [overviews, setOverviews] = useState<Record<string, ParentChildOverview>>({});
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<{ unread: number; items: ParentNotificationItem[] } | null>(null);
  // Asked on the page itself: browser confirm() dialogs are silently refused by some
  // embedded and kiosk-mode browsers (e.g. locked-down school tablets).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // One request per child per refresh: a minute is plenty for a parent's overview.
  const tick = useRefreshTick(60_000);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    document.title = "Your children — Cogna";
    // Signed in from an invite email's link: finish linking the child first.
    if (pendingParentCode()) router.replace("/parent/students/new");
  }, [router]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/parent/login");
      return;
    }
    setNow(new Date());
    getAuth()
      .then(async (auth) => {
        const list = await api.listStudents(auth);
        setChildren(list);
        setSelected((current) => (current && list.some((c) => c.id === current) ? current : list[0]?.id ?? null));
        api.getParentNotifications(auth).then(setUpdates).catch(() => undefined);
        // Each child fills in as its overview arrives; one failing doesn't hide the others.
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

  if (!isLoaded || !isSignedIn) return <p className={parentStyles.page}>Loading…</p>;

  const child = children?.find((c) => c.id === selected) ?? null;
  const overview = child ? overviews[child.id] : undefined;
  const first = child ? firstName(child.name) : "";
  const parentFirst = display?.name?.split(/\s+/)[0];

  return (
    <div className="dash">
      <main id="main" className="dash-wrap">
        <nav className="dash-nav">
          <Link href="/" className="wordmark">Cogna<span className="dot">.</span></Link>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
            <Link href="/parent/students/new" className="btn btn-ghost btn-pill">Add a child</Link>
            <button type="button" className="btn btn-quiet" onClick={async () => { await signOut(); router.push("/"); }}>Sign out</button>
          </div>
        </nav>

        <header style={{ margin: "var(--s-4) 0 var(--s-5)" }}>
          <h1 className="dash-title" style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>{parentFirst ? `Hello, ${parentFirst}.` : "Hello."}</h1>
        </header>

        {error && <p className="error">{error}</p>}

        {children === null && !error && (
          <div className={styles.grid} aria-busy="true" aria-label="Loading">
            {[0, 1, 2, 3].map((k) => <div key={k} className="dash-card"><div className="skeleton" style={{ height: 180 }} /></div>)}
          </div>
        )}

        {children?.length === 0 && (
          <div className="dash-card rise">
            <h2 className="dash-section-title">Add your first child</h2>
            <p className="dash-sub" style={{ marginBottom: "var(--s-5)" }}>Make a sign-in code for them, or link a child the school already added with the code from the email or slip.</p>
            <Link href="/parent/students/new" className="btn btn-primary btn-pill">Add a child</Link>
          </div>
        )}

        {children && children.length > 1 && (
          <nav className={styles.switcher} aria-label="Choose a child">
            {children.map((c) => {
              const due = overviews[c.id]?.work?.next;
              const urgent = due && (due.state === "OVERDUE" || dueLabel(due, now).tone === "soon");
              return (
                <button key={c.id} type="button" className={styles.kid} aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
                  <span className={styles.initials} aria-hidden>{initials(c.name)}</span>
                  {firstName(c.name)}
                  {urgent && <span className={styles.due} aria-label="has work due soon" />}
                </button>
              );
            })}
          </nav>
        )}

        {child && !overview && (
          <div className={styles.grid} aria-busy="true" aria-label={`Loading ${first}`}>
            {[0, 1, 2, 3].map((k) => <div key={k} className="dash-card"><div className="skeleton" style={{ height: 180 }} /></div>)}
          </div>
        )}

        {child && overview && (
          <>
            <div className={styles.grid} data-testid="parent-home">
              <WorkCard work={overview.work} first={first} />
              <NextCard work={overview.work} first={first} now={now} />
              <StuckCard overview={overview} first={first} wide={!overview.growth.length} />
              {overview.growth.length > 0 && <TopicsCard overview={overview} />}
            </div>

            {updates && updates.items.length > 0 && (
              <details className={`dash-card ${styles.updates}`} data-testid="parent-updates">
                <summary>
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                    {updates.unread > 0 && <span className={styles.newDot} aria-hidden />}
                    {updates.unread > 0 ? `${updates.unread} new update${updates.unread === 1 ? "" : "s"} from school` : "Updates from school"}
                  </span>
                  <Chevron />
                </summary>
                <ul className={styles.updateList}>
                  {updates.items.slice(0, 8).map((n) => (
                    <li key={n.id}>
                      <strong>{n.title}</strong> <span>· {shortDate(n.createdAt)}{n.read ? "" : " · New"}</span>
                      <p>{n.body}</p>
                    </li>
                  ))}
                </ul>
                {updates.unread > 0 && (
                  <div style={{ padding: "0 var(--s-5) var(--s-5)" }}>
                    <button type="button" className="btn btn-ghost btn-pill" onClick={() => void markRead()}>Mark all as read</button>
                  </div>
                )}
              </details>
            )}

            {codes[child.id] && (
              <div className={parentStyles.code} role="status" style={{ marginTop: "var(--s-5)" }}>
                <span>New sign-in code for {first}</span>
                <strong className="access-code">{codes[child.id]}</strong>
                <button type="button" className="btn-link" onClick={() => void navigator.clipboard?.writeText(codes[child.id]!).catch(() => undefined)}>Copy</button>
                <small>Save it now: it won’t be shown again, and the old code no longer works.</small>
              </div>
            )}
            {confirmId === child.id && (
              <div className={parentStyles.confirm} role="alertdialog" aria-label={`Make a new sign-in code for ${child.name}`} style={{ marginTop: "var(--s-5)" }}>
                <p>Make a new sign-in code for {first}? Their current code will stop working.</p>
                <div>
                  <button type="button" className="btn btn-primary btn-pill" disabled={busyId === child.id} onClick={() => void newCode(child)}>
                    {busyId === child.id ? "Making a code…" : "Make a new code"}
                  </button>
                  <button type="button" className="btn-link" onClick={() => setConfirmId(null)}>Cancel</button>
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <Link href={`/parent/students/${child.id}`} className={`btn btn-primary btn-pill ${styles.primary}`}>See all of {first}’s maths</Link>
              <Link href={`/parent/students/${child.id}/weekly`} className="btn-link">Weekly update</Link>
              <Link href={`/parent/students/${child.id}/summary`} className="btn-link">Latest practice</Link>
              <button type="button" className={`btn-link ${styles.push}`} aria-expanded={confirmId === child.id} onClick={() => setConfirmId(confirmId === child.id ? null : child.id)}>
                Lost the sign-in code?
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** 1 · Has the work been done? A ring of the last 30 days' class checks. */
function WorkCard({ work, first }: { work: ParentWork; first: string }) {
  const done = work.onTime + work.late;
  const parts = [
    { key: "onTime", n: work.onTime, color: COLORS.onTime, label: "on time" },
    { key: "late", n: work.late, color: COLORS.late, label: "late" },
    { key: "missed", n: work.missed, color: COLORS.missed, label: "not finished" },
  ].filter((p) => p.n > 0);
  const r = 58;
  const c = 2 * Math.PI * r;
  const gap = parts.length + (work.open ? 1 : 0) > 1 ? 2 : 0;
  let offset = 0;
  const arcs = parts.map((p) => {
    const length = work.total ? (p.n / work.total) * c : 0;
    const arc = { ...p, dash: Math.max(0, length - gap), offset };
    offset += length;
    return arc;
  });
  const summary = work.total
    ? `${done} of ${work.total} class checks done in the last ${work.windowDays} days: ${work.onTime} on time, ${work.late} late${work.missed ? `, ${work.missed} not finished` : ""}, ${work.open} still to do`
    : "No class checks yet";
  return (
    <article className={`dash-card ${styles.card}`} aria-labelledby="work-title">
      <h2 id="work-title" className={styles.eyebrow}>{first}’s work · last {work.windowDays} days</h2>
      {work.total === 0 ? (
        <p className={styles.big}>No class checks yet.</p>
      ) : (
        <div className={styles.donutRow}>
          <div className={styles.donut}>
            <svg role="img" aria-label={summary} width="148" height="148" viewBox="0 0 148 148">
              <g transform="rotate(-90 74 74)" fill="none" strokeWidth="16">
                <circle cx="74" cy="74" r={r} stroke={COLORS.track} />
                {arcs.map((a) => <circle key={a.key} cx="74" cy="74" r={r} stroke={a.color} strokeDasharray={`${a.dash} ${c}`} strokeDashoffset={-a.offset} />)}
              </g>
            </svg>
            <div className={styles.donutLabel} aria-hidden>
              <strong>{done}<small>/{work.total}</small></strong>
              <span>done</span>
            </div>
          </div>
          <ul className={styles.key}>
            {parts.map((p) => <li key={p.key}><span className={styles.swatch} style={{ background: p.color }} aria-hidden /><span><strong>{p.n}</strong> {p.label}</span></li>)}
            {work.open > 0 && <li><span className={styles.swatch} style={{ boxShadow: "inset 0 0 0 2px #b9c6bc" }} aria-hidden /><span><strong>{work.open}</strong> to do</span></li>}
          </ul>
        </div>
      )}
    </article>
  );
}

/** 2 · What's next, how long, by when. */
function NextCard({ work, first, now }: { work: ParentWork; first: string; now: Date }) {
  const next = work.next;
  if (!next) {
    return (
      <article className={`dash-card ${styles.card}`} aria-labelledby="next-title">
        <div className={styles.cardHead}>
          <h2 id="next-title" className={styles.eyebrow}>Next for {first}</h2>
          {work.total > 0 && <span className={`${styles.chip} ${styles.chipGood}`}>Up to date</span>}
        </div>
        <p className={styles.big}>{work.total ? "Nothing due. All work done." : "Nothing to do yet."}</p>
        <p className={styles.soft}>When the teacher sets a check, it shows here with how long it takes and when it’s due.</p>
      </article>
    );
  }
  const due = dueLabel(next, now);
  const share = deadlineShare(next, now);
  return (
    <article className={`dash-card ${styles.card}`} aria-labelledby="next-title" data-testid="parent-next">
      <div className={styles.cardHead}>
        <h2 id="next-title" className={styles.eyebrow}>Next for {first}</h2>
        <span className={`${styles.chip} ${DUE_CHIP[due.tone]}`}>{due.chip}</span>
      </div>
      <p className={styles.big}>{taskName(next.title)}</p>
      <div className={styles.tiles}>
        <div className={styles.tile}><span>Takes about</span><strong>{next.minutesLeft} min</strong></div>
        <div className={styles.tile}><span>Due</span><strong>{next.dueAt ? shortDay(next.dueAt) : "No date"}</strong></div>
      </div>
      {next.dueAt && (
        <div>
          <div className={styles.track} role="img" aria-label={`Time until due: ${due.left}`}>
            <div className={styles.fill} style={{ width: `${Math.round(share * 100)}%`, background: DUE_FILL[due.tone] }} />
          </div>
          <div className={styles.trackLabels}><span>Set {shortDay(next.setAt)}</span><strong style={{ color: due.tone === "calm" ? "inherit" : "#7a4c08" }}>{due.left}</strong></div>
        </div>
      )}
      <p className={styles.soft}>{next.state === "STARTED" ? `${first} has started it.` : next.state === "WITH_TEACHER" ? "Something went wrong on our side. It won’t count as late." : `${first} hasn’t started it yet.`}</p>
      {work.openTasks.length > 1 && (
        <ul className={styles.more} aria-label="Also to do">
          {work.openTasks.slice(1, 4).map((t) => <li key={t.runId}><span>{taskName(t.title)}</span><span>{dueLabel(t, now).chip}</span></li>)}
        </ul>
      )}
    </article>
  );
}

/** 3 · Where exactly they're stuck: found → lesson → fixed, and the topic's skills. */
function StuckCard({ overview, first, wide }: { overview: ParentChildOverview; first: string; wide: boolean }) {
  const check = latestCheck(overview.classes);
  if (!check) {
    return (
      <article className={`dash-card ${styles.card} ${wide ? styles.wide : ""}`} aria-labelledby="stuck-title">
        <h2 id="stuck-title" className={styles.eyebrow}>Where {first} is stuck</h2>
        <p className={styles.big}>{first}’s first class check hasn’t happened yet.</p>
        <p className={styles.soft}>After it, you’ll see where {first} is strong and exactly what to work on.</p>
      </article>
    );
  }
  const view = stuckView(check, first);
  const topic = growthFor(view.topic, overview.growth);
  const skills = topic ? topicSkills(topic) : null;
  return (
    <article className={`dash-card ${styles.card} ${wide ? styles.wide : ""}`} aria-labelledby="stuck-title" data-testid="parent-stuck">
      <div className={styles.cardHead}>
        <h2 id="stuck-title" className={styles.eyebrow}>Where {first} is stuck · {view.topic}</h2>
        <span className={`${styles.chip} ${STUCK_CHIP[view.chip.tone]}`}>{view.chip.text}</span>
      </div>
      <p className={styles.big}>{view.headline}</p>
      <ol className={styles.steps} aria-label={view.steps.map((s) => s.label).join(", ")}>
        {view.steps.map((s, i) => (
          <li key={s.label} className={styles.step} data-joined={i < 2 ? view.joined[i as 0 | 1] : undefined}>
            <span className={`${styles.dot} ${DOT[s.look]}`} aria-hidden>{stepIcon(s.look)}</span>
            <strong>{s.label}</strong>
          </li>
        ))}
      </ol>
      {skills && skills.total > 0 && (
        <div>
          <div className={styles.rowBetween}><span>{view.topic} skills</span><span><strong>{skills.secure}</strong> of {skills.total} secure</span></div>
          <div className={styles.segments} style={{ gridTemplateColumns: `repeat(${skills.total}, minmax(0, 1fr))`, marginTop: "var(--s-2)" }} role="img" aria-label={`${skills.secure} of ${skills.total} skills secure`}>
            {Array.from({ length: skills.total }, (_, k) => <i key={k} className={k < skills.secure ? styles.on : ""} />)}
          </div>
        </div>
      )}
    </article>
  );
}

/** 4 · Every topic checked so far, as skills secure out of skills seen. */
function TopicsCard({ overview }: { overview: ParentChildOverview }) {
  return (
    <article className={`dash-card ${styles.card}`} aria-labelledby="topics-title">
      <h2 id="topics-title" className={styles.eyebrow}>Topics this term</h2>
      <ul className={styles.topics}>
        {overview.growth.map((g) => {
          const { secure, total } = topicSkills(g);
          const share = total ? secure / total : 0;
          return (
            <li key={g.topicId}>
              <div className={styles.rowBetween}><span style={{ color: "var(--ink)" }}>{g.name}</span><span><strong>{secure}</strong> of {total} skills</span></div>
              <div className={styles.track} role="img" aria-label={`${g.name}: ${secure} of ${total} skills secure`} style={{ height: 10 }}>
                <div className={styles.fill} style={{ width: `${Math.round(share * 100)}%`, background: "var(--accent)" }} />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function stepIcon(look: StepLook) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (look === "done" || look === "good") return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
  if (look === "work") return <svg {...common}><path d="M12 8v5" /><path d="M12 16.5v.5" /></svg>;
  if (look === "unsure") return "?";
  return null;
}

function Chevron() {
  return <svg className={styles.chev} aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#51635a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}
