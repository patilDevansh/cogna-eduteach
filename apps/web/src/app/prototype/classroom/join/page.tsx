"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { saveStudent } from "@/lib/session";
import {
  getMockClassroom,
  saveMockEnrollment,
  type MockClassroomProfile,
  type MockStudentEnrollment,
} from "@/lib/mock-classroom";
import styles from "@/components/classroom-onboarding.module.css";

type JoinStep = "code" | "details" | "ready";

export default function StudentClassroomJoinPage() {
  const [step, setStep] = useState<JoinStep>("code");
  const [classroom, setClassroom] = useState<MockClassroomProfile | null>(null);
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [error, setError] = useState("");
  const [enrollment, setEnrollment] = useState<MockStudentEnrollment | null>(null);

  useEffect(() => {
    document.title = "Join your class — Cogna";
  }, []);

  function findClass(event: React.FormEvent) {
    event.preventDefault();
    const mockClass = getMockClassroom();
    if (code.trim().toUpperCase() !== mockClass.shareCode.toUpperCase()) {
      setError("That code does not match a Cogna class. Check it with your teacher and try again.");
      return;
    }
    setError("");
    setClassroom(mockClass);
    setStep("details");
  }

  function joinClass(event: React.FormEvent) {
    event.preventDefault();
    if (!classroom) return;

    const studentId = `tukaram7_${rollNumber.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const nextEnrollment: MockStudentEnrollment = {
      studentId,
      fullName: fullName.trim(),
      rollNumber: rollNumber.trim().toUpperCase(),
      admissionNumber: admissionNumber.trim() || undefined,
      classCode: classroom.shareCode,
      className: classroom.className,
      grade: classroom.grade,
      teacherName: classroom.teacherName,
    };

    saveMockEnrollment(nextEnrollment);
    saveStudent({ studentId, name: nextEnrollment.fullName });
    setEnrollment(nextEnrollment);
    setStep("ready");
  }

  return (
    <main className={styles.stage}>
      <header className={styles.topbar}>
        <Wordmark href="/" />
        <div className={styles.topbarRight}>
          <span>Student class join</span>
          <Link href="/prototype/classroom/setup" className="btn-quiet">Teacher setup</Link>
        </div>
      </header>

      <div className={styles.joinShell}>
        <section className={styles.joinIntro}>
          <span className={styles.eyebrow}>Join your Cogna class</span>
          <h1>{step === "ready" ? `You're in, ${enrollment?.fullName.split(" ")[0] ?? "student"}.` : "Start with your teacher’s code."}</h1>
          <p>
            {step === "ready"
              ? "Your diagnostic will now be connected to the correct class and teacher."
              : "The code tells Cogna which grade, class, and teacher you belong to."}
          </p>
        </section>

        <section className={`${styles.card} phase-in`}>
          {step === "code" && (
            <>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.stepBadge}>Step 1 of 2</span>
                  <h2>Enter the sharing code</h2>
                  <p>Your teacher will write or display this code in class.</p>
                </div>
              </div>
              <form className={styles.codeForm} onSubmit={findClass}>
                <div className={styles.field}>
                  <label htmlFor="class-code">Class sharing code</label>
                  <input
                    id="class-code"
                    className={styles.codeInput}
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ""))}
                    placeholder="ENTER CODE"
                    required
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                {error && <div className={styles.error}>{error}</div>}
                <button type="submit" className={styles.primaryButton}>Find my class →</button>
                <button type="button" className={styles.textButton} onClick={() => { setCode("TUKARAM7"); setError(""); }}>
                  Use mock code TUKARAM7
                </button>
              </form>
            </>
          )}

          {step === "details" && classroom && (
            <>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.stepBadge}>Step 2 of 2</span>
                  <h2>Tell your teacher who you are</h2>
                  <p>Use the same name and roll number that appear in the school register.</p>
                </div>
              </div>

              <form className={styles.form} onSubmit={joinClass}>
                <div className={`${styles.classResolved} ${styles.fieldFull}`}>
                  <strong>{classroom.className} found</strong>
                  <p>{classroom.grade} · {classroom.subject} · Teacher: {classroom.teacherName}</p>
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="student-name">Full name</label>
                  <input
                    id="student-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name as written in school"
                    required
                    autoComplete="name"
                    autoFocus
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="roll-number">Roll number</label>
                  <input
                    id="roll-number"
                    value={rollNumber}
                    onChange={(event) => setRollNumber(event.target.value)}
                    placeholder="For example, 7T-31"
                    required
                    autoComplete="off"
                  />
                  <span className={styles.helper}>This connects your work to the teacher roster.</span>
                </div>

                <div className={styles.field}>
                  <label htmlFor="admission-number">Admission number <span className={styles.helper}>(optional)</span></label>
                  <input
                    id="admission-number"
                    value={admissionNumber}
                    onChange={(event) => setAdmissionNumber(event.target.value)}
                    placeholder="Only if your school uses it"
                    autoComplete="off"
                  />
                </div>

                <div className={styles.formActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setStep("code")}>← Change code</button>
                  <button type="submit" className={styles.primaryButton}>Join {classroom.className} →</button>
                </div>
              </form>
            </>
          )}

          {step === "ready" && classroom && enrollment && (
            <>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.stepBadge}>Joined successfully</span>
                  <h2>Ready for Cogna Lotus</h2>
                  <p>Your first diagnostic can now begin.</p>
                </div>
              </div>

              <div className={styles.studentConfirmation}>
                <div className={styles.successHero}>
                  <div className={styles.successIcon}>✓</div>
                  <div>
                    <h3>{enrollment.fullName}</h3>
                    <p>{classroom.className} · Roll {enrollment.rollNumber}</p>
                  </div>
                </div>

                <div className={styles.studentSummary}>
                  <div><span>Teacher</span><strong>{classroom.teacherName}</strong></div>
                  <div><span>Grade and class</span><strong>{classroom.grade} · {classroom.className}</strong></div>
                  <div><span>Subject</span><strong>{classroom.subject}</strong></div>
                  <div><span>Diagnostic</span><strong>Cogna Lotus · Up to 20 min</strong></div>
                </div>

                <div className={styles.mockNote}>
                  <strong>Before you start</strong>
                  <p>Work independently, use rough paper if needed, and choose “I don&apos;t know” rather than guessing when you are genuinely unsure.</p>
                </div>

                <Link href="/student/lotus" className={styles.primaryButton}>Start my diagnostic →</Link>
                <button type="button" className={styles.textButton} onClick={() => setStep("details")}>Edit my details</button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
