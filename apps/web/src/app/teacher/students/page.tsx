import Link from "next/link";
import { MOCK_TEACHER_REPORT_DATA, type StudentReportItem } from "@/lib/teacher-report/mock-data";
import styles from "../teacher.module.css";

const stateCopy: Record<StudentReportItem["readiness"], { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "ready" },
  reinforcement: { label: "Targeted bridge", tone: "bridge" },
  probe: { label: "Evidence check", tone: "check" },
};

function evidenceFinding(student: StudentReportItem): string {
  if (student.candidateLearningNeed) return student.candidateLearningNeed;
  if (student.transferSolved) return "Independent success on familiar and changed-form tasks.";
  if (student.independentSolved) return "Independent familiar execution; transfer still needs checking.";
  return "Cogna needs another clean attempt before making a learning claim.";
}

export default function TeacherStudentsPage() {
  const students = MOCK_TEACHER_REPORT_DATA.students;
  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.dateLine}>30 demo learner profiles</div>
          <h1>Grade 8 Mathematics students</h1>
          <p>Each state includes demonstrated skills, current evidence, uncertainty, and the next useful action.</p>
        </div>
        <Link className={styles.secondary} href="/teacher/reports">Open class report</Link>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table} style={{ minWidth: 1040 }}>
          <thead><tr><th>Student</th><th>Current state</th><th>Evidence-based finding</th><th>Demonstrated</th><th>Uncertainty</th><th>Next move</th><th /></tr></thead>
          <tbody>
            {students.map((student) => {
              const state = stateCopy[student.readiness];
              return (
                <tr key={student.id}>
                  <td><span className={styles.studentName}>{student.name}</span><span className={styles.studentMeta}>Roll {student.rollNumber}</span></td>
                  <td><span className={`${styles.status} ${styles[state.tone]}`}>{state.label}</span><span className={styles.studentMeta}>{student.evidenceStatus} evidence</span></td>
                  <td style={{ maxWidth: 260 }}>{evidenceFinding(student)}</td>
                  <td style={{ maxWidth: 220 }}>{student.demonstratedSkills.length ? student.demonstratedSkills.slice(0, 3).join(" · ") : "Not enough evidence yet"}</td>
                  <td style={{ textTransform: "capitalize" }}>{student.uncertaintyRating}</td>
                  <td style={{ maxWidth: 230 }}>{student.recommendedFollowUp}</td>
                  <td><Link className={styles.textLink} href={`/teacher/evidence?student=${student.name.startsWith("Aarav")?"aarav":student.name.startsWith("Rohan")?"rohan":student.name.startsWith("Aadya")?"aadya":student.name.startsWith("Mira")?"meena":student.id}`}>Inspect →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
