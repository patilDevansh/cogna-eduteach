import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { HeroPractice } from "@/components/landing/HeroPractice";
import { InteractiveMicroscope } from "@/components/landing/InteractiveMicroscope";
import styles from "./landing.module.css";

export default function Landing() {
  return (
    <div className={`ambient grain ${styles.page}`}>
      <header className={styles.header}>
        <div className={`shell ${styles.headerRow}`}>
          <Wordmark />
          <nav className={styles.nav} aria-label="Sign in">
            <Link href="/student/login">Student sign in</Link>
            <Link href="/parent/login">Parent sign in</Link>
            <Link href="/teacher/login">Teacher sign in</Link>
          </nav>
          <a href="#sign-in" className={styles.navMobile}>Sign in</a>
        </div>
      </header>

      <main id="main">
        {/* The product is the picture: a real practice moment, not an illustration of one. */}
        <section className={`shell ${styles.hero}`}>
          <div>
            <p className={styles.kicker}>Grade 8 maths, one student at a time</p>
            <h1 className={styles.heroTitle}>
              A personal tutor at <em>every desk.</em>
            </h1>
            <p className={styles.heroLede}>
              A class of forty has to move together. Cogna learns how each student thinks, then builds the next
              explanation, hint and practice step for them alone.
            </p>

            <nav id="sign-in" className={styles.roles} aria-label="Choose how you sign in">
              <Link href="/student/login" className={`${styles.role} ${styles.roleMain}`}>
                <span className={styles.roleWho}>I&apos;m a student</span>
                <span className={styles.roleWhat}>Pick up where you left off with your code</span>
                <span className={styles.roleArrow} aria-hidden="true">→</span>
              </Link>
              <Link href="/parent/login" className={styles.role}>
                <span className={styles.roleWho}>I&apos;m a parent</span>
                <span className={styles.roleWhat}>See progress and what&apos;s next</span>
                <span className={styles.roleArrow} aria-hidden="true">→</span>
              </Link>
              <Link href="/teacher/login" className={styles.role}>
                <span className={styles.roleWho}>I&apos;m a teacher</span>
                <span className={styles.roleWhat}>Your class, ready to teach</span>
                <span className={styles.roleArrow} aria-hidden="true">→</span>
              </Link>
            </nav>
          </div>

          <HeroPractice />
        </section>

        <section className={styles.demo}>
          <div className={`shell ${styles.sectionHead}`}>
            <p className={styles.kicker}>Try it</p>
            <h2 className={styles.sectionTitle}>See exactly where the algebra breaks.</h2>
            <p>Pick a case. Cogna finds the first line that went wrong, not just the wrong answer.</p>
          </div>
          <InteractiveMicroscope />
        </section>

        <section className={styles.loop}>
          <div className={`shell ${styles.loopGrid}`}>
            <div className={styles.loopHead}>
              <p className={styles.kicker}>How a class works</p>
              <h2 className={styles.sectionTitle}>One lesson for the class. A next step for each student.</h2>
            </div>
            <ol className={styles.steps}>
              <li>
                <span className={styles.stepNum}>1</span>
                <div>
                  <h3>A quick check</h3>
                  <p>
                    The teacher picks the topic and each student takes a short check. Code marks every answer and
                    finds exactly where each one starts to go wrong.
                  </p>
                </div>
              </li>
              <li>
                <span className={styles.stepNum}>2</span>
                <div>
                  <h3>A lesson for each student</h3>
                  <p>
                    Each student gets a short lesson built from their own answers, then practice games that show the
                    working when they get stuck.
                  </p>
                </div>
              </li>
              <li>
                <span className={styles.stepNum}>3</span>
                <div>
                  <h3>On their own</h3>
                  <p>
                    A fresh question with no help shows whether it stuck. Teachers see who is ready to move on, and
                    parents see what their child did and what&apos;s next.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className={`shell ${styles.promise}`}>
          <p className={styles.kicker}>What we promise</p>
          <p className={styles.promiseText}>
            Code marks <em>every</em> answer. Anything AI-written is checked <em>before</em> a student reads it.
            Teachers see what their class showed, and are <em>never</em> ranked.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`shell ${styles.footerRow}`}>
          <Wordmark />
          <nav aria-label="Footer">
            <Link href="/student/login">Student sign in</Link>
            <Link href="/parent/login">Parent sign in</Link>
            <Link href="/teacher/login">Teacher sign in</Link>
            <Link href="/try">Free maths check</Link>
          </nav>
          <p className={styles.footNote}>Made for Grade 8 maths classes.</p>
        </div>
      </footer>
    </div>
  );
}
