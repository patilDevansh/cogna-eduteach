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
              <Link href="/parent/login">For parents</Link>
              <Link href="/student/login">I have a code</Link>
            </>
          }
        />
      </div>

      {/* Hero — one composition: the brand, the promise, the worked line. */}
      <main>
        <section className={`shell ${styles.hero}`}>
          <p className="eyebrow">Grade 8 · CBSE Mathematics</p>
          <h1 className={styles.heroTitle}>
            Practice that pays
            <br />
            attention<span style={{ color: "var(--accent)" }}>.</span>
          </h1>

          <div className={`${styles.workedEquation} worked-line`} aria-hidden="true">
            <span className="math">2x + 5 = 17</span>
            <span className={styles.workedStep}>→ 2x = 12</span>
            <span className={styles.workedStep}>→ x = 6</span>
          </div>

          <p className={styles.heroLede}>
            Cogna gives your child short, calm maths sessions that adjust to how they
            actually think — noticing where a step goes wrong, teaching that step, and
            telling you plainly what it saw.
          </p>

          <div className={styles.paths}>
            <Link href="/parent/login" className="btn btn-primary btn-lg">
              I’m a parent
            </Link>
            <Link href="/student/login" className="btn btn-ghost btn-lg">
              I’m a student — I have a code
            </Link>
          </div>
        </section>

        {/* How it works — quiet, three steps in prose, no card grid */}
        <section className={styles.band}>
          <div className="shell-letter">
            <h2 className={styles.bandTitle}>Fifteen minutes, start to finish</h2>
            <div className={styles.steps}>
              <div>
                <p className="eyebrow">Practice</p>
                <p>
                  One problem at a time, on a clean page. Hints come one small step at a
                  time — never the whole answer at once.
                </p>
              </div>
              <div>
                <p className="eyebrow">Notice</p>
                <p>
                  Every answer teaches Cogna something about how your child works — which
                  steps are solid, and which patterns need another check.
                </p>
              </div>
              <div>
                <p className="eyebrow">Report</p>
                <p>
                  You get a short, honest note after each session: what happened, what it
                  might mean, and one small thing to try next.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Trust — a single quiet statement */}
        <section className={`shell-letter ${styles.trust}`}>
          <p className={styles.trustLine}>
            Every question and explanation in Cogna is written and reviewed by teachers.
            When we spot a pattern, we say so carefully — “a pattern we’re checking”, not
            a verdict. Sessions are paced, with real breaks, and they end on time.
          </p>
        </section>
      </main>

      <footer className="footer shell center">
        Cogna · Linear Equations pilot · made for quiet, focused learning
      </footer>
    </div>
  );
}
