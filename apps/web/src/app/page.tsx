import Link from "next/link";
import { TopBar } from "@/components/ui";
import styles from "./landing.module.css";

export default function Landing() {
  return (
    <div className="grid-air" style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar
          right={
            <>
              <Link href="/student/mission">10-Min Student Mission</Link>
              <Link href="/parent/students/demo-student">30s Parent Card</Link>
              <Link href="/teacher/reports">Teacher Brief</Link>
            </>
          }
        />
      </div>

      {/* Hero — one composition: the brand, the exact promise, the worked line. */}
      <main>
        <section className={`shell ${styles.hero}`}>
          <p className="eyebrow">Grade 8 CBSE Mathematics · Rescoped Proof Wedge</p>
          <h1 className={styles.heroTitle}>
            Find the exact step
            <br />
            where algebra breaks<span style={{ color: "var(--accent)" }}>.</span>
          </h1>

          <div className={`${styles.workedEquation} worked-line`} aria-hidden="true">
            <span className="math">3(x + 4) = 21</span>
            <span className={styles.workedStep}>→ 3x + 12 = 21</span>
            <span className={styles.workedStep}>→ 3x = 9 → x = 3</span>
          </div>

          <p className={styles.heroLede}>
            COGNA finds the exact step where algebra breaks, fixes that one gap, and checks
            later that your child can solve it alone.
          </p>

          <div className={styles.paths}>
            <Link href="/student/mission" className="btn btn-primary btn-lg">
              Start 10-Minute Student Mission →
            </Link>
            <Link href="/parent/students/demo-student" className="btn btn-secondary btn-lg">
              View 30-Second Parent Card
            </Link>
            <Link href="/teacher/reports" className="btn btn-ghost btn-lg">
              Teacher Classroom Brief
            </Link>
          </div>
        </section>

        {/* The Core Learning Loop */}
        <section className={styles.band}>
          <div className="shell-letter">
            <h2 className={styles.bandTitle}>The 10-Minute Proof Loop</h2>
            <div className={styles.steps}>
              <div>
                <p className="eyebrow">1. Inspect</p>
                <p>
                  Line-by-line deterministic verification finds the exact operation that changed
                  the answer — never an IQ or personality label.
                </p>
              </div>
              <div>
                <p className="eyebrow">2. Contrast</p>
                <p>
                  The Mistake Microscope shows side-by-side what happened vs the correct balance,
                  with one active check question.
                </p>
              </div>
              <div>
                <p className="eyebrow">3. Independent Proof</p>
                <p>
                  A structurally different transfer problem confirms whether the fix worked unaided,
                  followed by a calm Day 4 retention check.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Trust — scientific restraint */}
        <section className={`shell-letter ${styles.trust}`}>
          <p className={styles.trustLine}>
            No generic chatbots. No 2,000-question drill banks. No test anxiety. Just deterministic
            mathematical verification, active dignity-first rescue, and independent before-and-after proof.
          </p>
        </section>
      </main>

      <footer className="footer shell center">
        Cogna · Grade 8 Linear Equations · Focused Learning Proof
      </footer>
    </div>
  );
}
