import Link from "next/link";
import { TopBar } from "@/components/ui";
import { InteractiveMicroscope } from "@/components/landing/InteractiveMicroscope";
import styles from "./landing.module.css";

export default function Landing() {
  return (
    <div className="grid-air" style={{ minHeight: "100vh" }}>
      <div className="shell">
        <TopBar
          right={
            <>
              <Link href="/student/login">Student sign in</Link>
              <Link href="/parent/login">Parent sign in</Link>
              <Link href="/teacher/login">Teacher sign in</Link>
            </>
          }
        />
      </div>

      {/* Hero — one composition: the brand, the exact promise, the worked line. */}
      <main>
        <section className={`shell ${styles.hero}`}>
          <h1 className={styles.heroTitle}>
            The education
            <br />
            school can't give <span className={styles.accentYou}>you.</span>
          </h1>

          <div className={`${styles.workedEquation} worked-line`} aria-hidden="true">
            <span className="math">3(x + 4) = 21</span>
            <span className={styles.workedStep}>→ 3x + 12 = 21</span>
            <span className={styles.workedStep}>→ 3x = 9 → x = 3</span>
          </div>

          <p className={styles.heroLede}>
            A class of forty has to move together. Cogna learns how you think — then builds
            the next explanation, hint, and practice step for you alone.
          </p>

          <div className={styles.paths}>
            <Link href="/student/login" className="btn btn-primary btn-lg">
              Student sign in →
            </Link>
            <Link href="/parent/login" className="btn btn-secondary btn-lg">
              Parent sign in →
            </Link>
            <Link href="/teacher/login" className="btn btn-ghost btn-lg">
              Teacher sign in →
            </Link>
          </div>
        </section>

        {/* Live Interactive Verification Demo */}
        <InteractiveMicroscope />

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

        {/* Transforming Education — Personalized Learning */}
        <section className={`shell-letter ${styles.trust}`}>
          <p className={styles.trustLine}>
            We are transforming education by replacing one-size-fits-all instruction with deeply
            personalized learning. By understanding exactly how each student thinks, Cogna tailors
            every explanation, hint, and practice step in real time—empowering every learner to master
            challenging concepts with genuine confidence and lasting independence.
          </p>
        </section>
      </main>

      <footer className="footer shell center">
        Cogna · Grade 8 Linear Equations · Focused Learning Proof
      </footer>
    </div>
  );
}
