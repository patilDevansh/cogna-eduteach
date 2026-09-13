"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { StudentDetailModal } from "@/components/teacher-report/StudentDetailModal";
import {
  MOCK_TEACHER_REPORT_DATA,
  type ReadinessCategory,
  type StudentReportItem,
} from "@/lib/teacher-report/mock-data";
import { getMockClassroom, MOCK_CLASSROOM } from "@/lib/mock-classroom";
import styles from "@/components/classroom-profile.module.css";

type StudentFilter = ReadinessCategory | "all";

const FILTERS: Array<{ key: StudentFilter; label: string; count: number }> = [
  { key: "all", label: "All students", count: 30 },
  { key: "ready", label: "Ready to progress", count: 18 },
  { key: "reinforcement", label: "Targeted support", count: 8 },
  { key: "probe", label: "Evidence check", count: 4 },
];

function readinessCopy(student: StudentReportItem) {
  if (student.readiness === "ready") {
    return {
      label: "Ready to progress",
      conclusion: "Prerequisites demonstrated independently",
    };
  }
  if (student.readiness === "reinforcement") {
    return {
      label: "Targeted support",
      conclusion: student.candidateLearningNeed ?? "A focused learning need was observed",
    };
  }
  return {
    label: "Needs evidence",
    conclusion: "No dependable learning-gap conclusion yet",
  };
}

function evidenceCopy(student: StudentReportItem) {
  if (student.readiness === "probe") return "Fresh check required";
  if (student.evidenceStatus === "solid") return "Strong evidence";
  if (student.evidenceStatus === "assisted") return "Assisted evidence";
  return "Developing evidence";
}

export default function ClassroomProfilePage() {
  const [activeFilter, setActiveFilter] = useState<StudentFilter>("all");
  const [selectedStudent, setSelectedStudent] = useState<StudentReportItem | null>(null);
  const [classroom, setClassroom] = useState(MOCK_CLASSROOM);

  useEffect(() => {
    const storedClassroom = getMockClassroom();
    setClassroom(storedClassroom);
    document.title = `${storedClassroom.className} — Class profile | Cogna`;
  }, []);

  const visibleStudents = useMemo(
    () => MOCK_TEACHER_REPORT_DATA.students.filter((student) => activeFilter === "all" || student.readiness === activeFilter),
    [activeFilter],
  );

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brandContext}>
            <Wordmark href="/" />
            <span>Teacher classroom</span>
          </div>
          <nav className={styles.nav} aria-label="Teacher navigation">
            <Link href="/prototype/classroom/setup">Class setup</Link>
            <Link href="/prototype/teacher-report">Class diagnostic report</Link>
            <Link href="/prototype/classroom/join">Preview student join</Link>
          </nav>
        </div>
      </header>

      <main className={styles.container}>
        <section className={styles.profileHero}>
          <div className={styles.teacherIdentity}>
            <div className={styles.avatar} aria-hidden="true">LS</div>
            <div>
              <span className={styles.eyebrow}>Teacher profile</span>
              <h1>{classroom.teacherName}</h1>
              <p>{classroom.subject} teacher · {classroom.schoolName}</p>
            </div>
          </div>

          <div className={styles.classIdentity}>
            <div>
              <span>Current class</span>
              <strong>{classroom.className}</strong>
              <small>{classroom.grade} · 30 students</small>
            </div>
            <div className={styles.classCode}>
              <span>Sharing code</span>
              <strong>{classroom.shareCode}</strong>
            </div>
          </div>
        </section>

        <section className={styles.metricGrid} aria-label="Class diagnostic summary">
          <article>
            <strong>30</strong>
            <div><b>Students enrolled</b><span>Complete class roster</span></div>
          </article>
          <article>
            <strong>30</strong>
            <div><b>Diagnostic sessions</b><span>Every student has a record</span></div>
          </article>
          <article className={styles.metricPositive}>
            <strong>26</strong>
            <div><b>Usable conclusions</b><span>Enough evidence to act</span></div>
          </article>
          <article className={styles.metricOpen}>
            <strong>4</strong>
            <div><b>Need a fresh check</b><span>Cogna has not assigned a gap</span></div>
          </article>
        </section>

        <section className={styles.diagnosticsSection}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>30 student diagnostics</span>
              <h2>Where should each student begin?</h2>
              <p>Current evidence, the safest conclusion, and the next instructional action.</p>
            </div>
            <Link href="/prototype/teacher-report" className={styles.reportLink}>
              See the whole-class report →
            </Link>
          </div>

          <div className={styles.filterBar} role="group" aria-label="Filter students by diagnostic result">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={activeFilter === filter.key ? styles.filterActive : ""}
                onClick={() => setActiveFilter(filter.key)}
                aria-pressed={activeFilter === filter.key}
              >
                {filter.label} <span>{filter.count}</span>
              </button>
            ))}
          </div>

          <div className={styles.rosterHeader} aria-hidden="true">
            <span>Student</span>
            <span>Current diagnostic conclusion</span>
            <span>Next action</span>
            <span>Evidence</span>
          </div>

          <div className={styles.roster}>
            {visibleStudents.map((student) => {
              const readiness = readinessCopy(student);
              return (
                <article key={student.id} className={styles.studentRow}>
                  <div className={styles.studentName}>
                    <span className={styles.studentInitial}>{student.name.charAt(0)}</span>
                    <div>
                      <strong>{student.name}</strong>
                      <small>Roll {student.rollNumber}</small>
                    </div>
                  </div>

                  <div className={styles.conclusionCell}>
                    <span className={`${styles.statusBadge} ${styles[student.readiness]}`}>
                      {readiness.label}
                    </span>
                    <strong>{readiness.conclusion}</strong>
                    {student.readiness === "probe" && (
                      <small>{student.candidateLearningNeed}</small>
                    )}
                  </div>

                  <div className={styles.nextAction}>
                    <span>Next action</span>
                    <p>{student.recommendedFollowUp}</p>
                  </div>

                  <div className={styles.evidenceCell}>
                    <span className={`${styles.evidencePill} ${styles[`evidence_${student.readiness}`]}`}>
                      {evidenceCopy(student)}
                    </span>
                    <button type="button" onClick={() => setSelectedStudent(student)}>
                      View diagnostic evidence →
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className={styles.safeguardNote}>
            <span aria-hidden="true">i</span>
            <p><strong>These are current teaching decisions, not permanent student labels.</strong> Cogna separates demonstrated understanding, targeted support needs, and cases where the evidence is still insufficient.</p>
          </div>
        </section>
      </main>

      <StudentDetailModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
    </div>
  );
}
