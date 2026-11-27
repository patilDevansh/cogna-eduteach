import Link from "next/link";
import { TopBar } from "@/components/ui";
import { KineticWord } from "@/components/landing/KineticWord";
import { ClassStory } from "@/components/landing/ClassStory";
import { InteractiveMicroscope } from "@/components/landing/InteractiveMicroscope";
import { CarrySteps } from "@/components/carry-steps";
import styles from "./landing.module.css";

const ROLES = [
  ["Student", "/student/login"],
  ["Teacher", "/teacher/login"],
  ["Parent", "/parent/login"],
] as const;

/** The front page, written for schools and teachers. Example numbers and names throughout. */
export default function Landing() {
  return (
    <div className="grid-air" style={{ minHeight: "100vh" }}>
      <div className={`shell ${styles.top}`}>
        <TopBar
          right={
            <>
              <a href="#how" className={styles.navExtra}>How it works</a>
              <Link href="/try" className={styles.navExtra}>For parents</Link>
              {/* Native popover: opens on click, closes on outside click or Escape. */}
              <button type="button" className={styles.signIn} popoverTarget="sign-in">Sign in</button>
              <div id="sign-in" popover="auto" className={styles.signInMenu}>
                {ROLES.map(([role, href]) => <Link key={role} href={href}>{role}</Link>)}
              </div>
            </>
          }
        />
      </div>

      <main>
        {/* Hero: the promise on the left, the product doing it on the right. */}
        <section className={`shell ${styles.hero}`}>
          <div>
            <h1 className={styles.heroTitle} aria-label="A personal tutor at every desk.">
              A personal tutor
              <br />
              at every <KineticWord />
            </h1>
            <p className={styles.heroLede}>
              A class of forty has to move together. Cogna reads each student&apos;s working, finds
              the line where it goes wrong, and builds the next lesson for that student.
            </p>
            <div className={styles.paths}>
              <Link href="/teacher/signup" className="btn btn-primary btn-lg">Set up your class</Link>
              <a href="#microscope" className="btn btn-ghost btn-lg">See it catch a mistake</a>
            </div>
            <p className={styles.scope}>CBSE Grade 8 maths. Every answer is checked by code.</p>
          </div>

          <figure className={styles.lessonCard} aria-label="Example: a lesson solving 3(x + 4) = 21 step by step to x = 3">
            <figcaption><b>Meena&apos;s lesson</b><span>Opening a bracket</span></figcaption>
            <div className={styles.lessonMaths} aria-hidden="true">
              <CarrySteps steps={["3(x + 4) = 21", "3x + 12 = 21", "3x = 9", "x = 3"]} stepMs={1300} />
            </div>
            <p>Built from the line she got wrong in today&apos;s check.</p>
          </figure>
        </section>

        {/* Scroll story: forty lights are a class; one opens into its working; the class regroups by need. */}
        <ClassStory />

        <section id="microscope" className={styles.try}>
          <div className={`shell ${styles.sectionHead}`}>
            <p className="eyebrow">Try it</p>
            <h2 className={styles.bandTitle}>Pick a mistake. See what Cogna sees.</h2>
          </div>
          <InteractiveMicroscope />
        </section>

        <section id="how" className={styles.band}>
          <div className="shell">
            <h2 className={styles.bandTitle}>How a class works with Cogna</h2>

            <div className={styles.row}>
              <div>
                <p className="eyebrow">1. Quick check</p>
                <p>
                  You pick the topic and each student takes a short check. Code marks every answer
                  and finds exactly where each one starts to go wrong.
                </p>
              </div>
              <div className={styles.frag} aria-hidden="true">
                <span className="maths">3(x + 4) = 21</span>
                <span className="maths">3x + <u>4</u> = 21 <em>line 2</em></span>
              </div>
            </div>

            <div className={styles.row}>
              <div>
                <p className="eyebrow">2. A lesson for each student</p>
                <p>
                  Each student gets a short lesson built from their own answers. Same mistake, same
                  checked maths, a different way in for each child.
                </p>
              </div>
              <div className={`${styles.frag} ${styles.pair}`} aria-hidden="true">
                <div>
                  <b>Meena · cricket</b>
                  <p>3 overs. Each over has x runs and 4 extras.</p>
                  <span className="maths">3(x + 4) = 3x + 12</span>
                </div>
                <div>
                  <b>Kabir · space</b>
                  <p>3 rockets. Each carries x crew and 4 robots.</p>
                  <span className="maths">3(x + 4) = 3x + 12</span>
                </div>
              </div>
            </div>

            <div className={styles.row}>
              <div>
                <p className="eyebrow">3. On their own</p>
                <p>
                  A fresh question with no help shows whether it stuck. You see who is ready to move
                  on, and parents see what their child did and what&apos;s next.
                </p>
              </div>
              <div className={styles.frag} aria-hidden="true">
                <strong>27 of 40 <span>ready to move on</span></strong>
                <i className={styles.meter} />
                <p>Next move: reteach <b>bracket expansion</b> to 7 students.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={`shell ${styles.trust}`}>
          <div>
            <h3>The maths is checked</h3>
            <p>Nothing an AI writes reaches a student until code has verified the mathematics.</p>
          </div>
          <div>
            <h3>Watching is not knowing</h3>
            <p>A lesson viewed or a game played never counts as mastery. Only an unaided answer does.</p>
          </div>
          <div>
            <h3>The teacher leads</h3>
            <p>You choose the topic and the pace. Cogna shows you who needs what next.</p>
          </div>
        </section>

        <section className={`shell ${styles.close}`}>
          <h2 className={styles.bandTitle}>Start with one class and one topic.</h2>
          <div className={styles.paths}>
            <Link href="/teacher/signup" className="btn btn-primary btn-lg">Set up your class</Link>
            <Link href="/try" className="btn btn-ghost btn-lg">Parent? Take the free check</Link>
          </div>
        </section>
      </main>

      <footer className={`footer shell ${styles.foot}`}>
        <span>Cogna · CBSE Grade 8 maths</span>
        <nav>Sign in: {ROLES.map(([role, href]) => <Link key={role} href={href}>{role}</Link>)}</nav>
      </footer>
    </div>
  );
}
