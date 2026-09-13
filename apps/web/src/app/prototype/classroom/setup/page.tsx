"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/ui";
import {
  MOCK_CLASSROOM,
  saveMockClassroom,
  type MockClassroomProfile,
} from "@/lib/mock-classroom";
import styles from "@/components/classroom-onboarding.module.css";

export default function TeacherClassroomSetupPage() {
  const [profile, setProfile] = useState<MockClassroomProfile>(MOCK_CLASSROOM);
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "Create your class — Cogna";
  }, []);

  function updateProfile(field: keyof MockClassroomProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function createClass(event: React.FormEvent) {
    event.preventDefault();
    saveMockClassroom(profile);
    setIsReady(true);
  }

  async function copyCode() {
    await navigator.clipboard?.writeText(profile.shareCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className={styles.stage}>
      <header className={styles.topbar}>
        <Wordmark href="/" />
        <div className={styles.topbarRight}>
          <span>Teacher classroom setup</span>
          <Link href="/prototype/classroom/profile" className="btn-quiet">Class profile</Link>
          <Link href="/prototype/classroom/join" className="btn-quiet">Student join</Link>
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}>Teacher setup</span>
          <h1>Create the class once. Share one code.</h1>
          <p>
            Students use the code to join the correct grade and class. Their names and roll numbers
            then connect their diagnostic evidence to your teacher report.
          </p>

          <ol className={styles.flowList}>
            <li><span>1</span><div><strong>Create your profile</strong>Your name and school context.</div></li>
            <li><span>2</span><div><strong>Name the class</strong>Grade and class are carried by the code.</div></li>
            <li><span>3</span><div><strong>Share and diagnose</strong>Students join, then start Cogna Lotus.</div></li>
          </ol>
        </section>

        <section className={`${styles.card} phase-in`}>
          {!isReady ? (
            <>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.stepBadge}>Profile and class</span>
                  <h2>Tell Cogna who you teach</h2>
                  <p>These details appear on the class report and student join confirmation.</p>
                </div>
              </div>

              <form className={styles.form} onSubmit={createClass}>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="teacher-name">Teacher name</label>
                  <input
                    id="teacher-name"
                    value={profile.teacherName}
                    onChange={(event) => updateProfile("teacherName", event.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="school-name">School or organisation</label>
                  <input
                    id="school-name"
                    value={profile.schoolName}
                    onChange={(event) => updateProfile("schoolName", event.target.value)}
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="grade">Grade</label>
                  <select id="grade" value={profile.grade} onChange={(event) => updateProfile("grade", event.target.value)}>
                    <option>Grade 6</option>
                    <option>Grade 7</option>
                    <option>Grade 8</option>
                    <option>Grade 9</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="class-name">Class name or section</label>
                  <input
                    id="class-name"
                    value={profile.className}
                    onChange={(event) => updateProfile("className", event.target.value)}
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="subject">Subject</label>
                  <select id="subject" value={profile.subject} onChange={(event) => updateProfile("subject", event.target.value)}>
                    <option>Mathematics</option>
                    <option>Science</option>
                    <option>English</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="share-code">Sharing code</label>
                  <input
                    id="share-code"
                    value={profile.shareCode}
                    onChange={(event) => updateProfile("shareCode", event.target.value.toUpperCase().replace(/\s/g, ""))}
                    required
                    minLength={6}
                    maxLength={12}
                  />
                  <span className={styles.helper}>Students type this code exactly once when joining.</span>
                </div>

                <div className={styles.formActions}>
                  <p className={styles.privacyNote}>
                    Only collect student details the school already uses to identify classroom work.
                  </p>
                  <button type="submit" className={styles.primaryButton}>Create {profile.className} →</button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.stepBadge}>Class ready</span>
                  <h2>{profile.className} is ready</h2>
                  <p>{profile.teacherName} · {profile.grade} · {profile.subject}</p>
                </div>
              </div>

              <div className={styles.readyBody}>
                <div className={styles.successHero}>
                  <div className={styles.successIcon}>✓</div>
                  <div>
                    <h3>Share this with students</h3>
                    <p>Ask students to open the join page and enter the code below.</p>
                  </div>
                </div>

                <div className={styles.shareCard}>
                  <span>Class sharing code</span>
                  <div className={styles.shareCode}>{profile.shareCode}</div>
                  <p>{profile.schoolName} · {profile.className} · Teacher: {profile.teacherName}</p>
                  <button type="button" className={styles.textButton} onClick={copyCode} style={{ marginTop: "var(--s-3)" }}>
                    {copied ? "Copied ✓" : "Copy code"}
                  </button>
                </div>

                <div className={styles.mockNote}>
                  <strong>Prototype note</strong>
                  <p>The teacher report contains 30 mock students from 7th Tukaram so the full classroom experience can be demonstrated immediately.</p>
                </div>

                <div className={styles.readyActions}>
                  <Link href="/prototype/classroom/join" className={styles.secondaryButton}>Preview student join</Link>
                  <Link href="/prototype/classroom/profile" className={styles.secondaryButton}>Open class profile</Link>
                  <Link href="/prototype/teacher-report" className={styles.primaryButton}>View diagnostic report →</Link>
                </div>

                <button type="button" className={styles.textButton} onClick={() => setIsReady(false)}>Edit class details</button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
