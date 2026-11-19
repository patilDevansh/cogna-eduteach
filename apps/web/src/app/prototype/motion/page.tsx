"use client";

/**
 * Prototype: Motion for interface feedback + a Rive character that reacts to the learner.
 * The bear is Rive's public "animated login screen" sample (state machine "Login Machine"),
 * loaded at runtime as a stand-in until we have our own character. Nothing here is wired to Lotus.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import styles from "./motion.module.css";

const BEAR = "https://public.rive.app/community/runtime-files/2244-4463-animated-login-screen.riv";
const MACHINE = "Login Machine";

const QUESTIONS = [
  { expr: "x² + 5x + 6", options: ["(x + 2)(x + 3)", "(x + 1)(x + 6)", "(x − 2)(x − 3)"], answer: 0, hint: "Two numbers that multiply to 6 and add to 5." },
  { expr: "x² − 9", options: ["(x − 3)²", "(x − 3)(x + 3)", "(x − 9)(x + 1)"], answer: 1, hint: "A difference of two squares." },
  { expr: "6x + 9", options: ["3(2x + 9)", "6(x + 9)", "3(2x + 3)"], answer: 2, hint: "Divide every term by the common factor." },
  { expr: "x² + x − 12", options: ["(x + 4)(x − 3)", "(x − 4)(x + 3)", "(x + 6)(x − 2)"], answer: 0, hint: "Multiply to −12, add to +1." },
];

const list: Variants = { show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 380, damping: 26 } },
};

export default function MotionPrototype() {
  const { rive, RiveComponent } = useRive({ src: BEAR, stateMachines: MACHINE, autoplay: true });
  const look = useStateMachineInput(rive, MACHINE, "numLook");
  const checking = useStateMachineInput(rive, MACHINE, "isChecking");
  const handsUp = useStateMachineInput(rive, MACHINE, "isHandsUp");
  const success = useStateMachineInput(rive, MACHINE, "trigSuccess");
  const fail = useStateMachineInput(rive, MACHINE, "trigFail");

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [hint, setHint] = useState(false);
  const done = index >= QUESTIONS.length;
  const q = QUESTIONS[Math.min(index, QUESTIONS.length - 1)]!;

  // The bear is decoration: if it has not loaded, or was torn down mid-hover, the game carries on without it.
  const bear = (act: () => void) => { if (rive) try { act(); } catch { /* bear gone */ } };

  // The bear covers its eyes while the hint is open: it is "not looking".
  useEffect(() => bear(() => { if (handsUp) handsUp.value = hint; }), [hint, handsUp]);

  const watch = (option: number | null) => bear(() => {
    if (checking) checking.value = option !== null;
    // numLook runs 0–100 across the bear's field of view; spread the options over it.
    if (look && option !== null) look.value = 20 + (option * 60) / (q.options.length - 1);
  });

  const choose = (option: number) => {
    if (picked !== null || wrong.includes(option)) return;
    watch(null);
    setHint(false);
    if (option === q.answer) {
      bear(() => success?.fire());
      setPicked(option);
      if (wrong.length === 0) { setStreak((s) => s + 1); setScore((s) => s + 1); }
      setTimeout(() => { setIndex((i) => i + 1); setPicked(null); setWrong([]); }, 1100);
    } else {
      bear(() => fail?.fire());
      setStreak(0);
      setWrong((w) => [...w, option]);
    }
  };

  const restart = () => { setIndex(0); setScore(0); setStreak(0); setPicked(null); setWrong([]); };

  return (
    <MotionConfig reducedMotion="user">
      <main className={styles.page}>
        <header className={styles.top}>
          <div className={styles.track} aria-hidden>
            <motion.div className={styles.fill} initial={false} animate={{ scaleX: index / QUESTIONS.length }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          </div>
          <div className={styles.streak} aria-label={`Streak ${streak}`}>
            <motion.span animate={streak > 0 ? { scale: [1, 1.35, 1], rotate: [0, -12, 0] } : {}} key={`flame-${streak}`}>🔥</motion.span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={streak} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}>{streak}</motion.b>
            </AnimatePresence>
          </div>
        </header>

        <div className={styles.bear}><RiveComponent aria-label="Bear tutor" /></div>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.section key="end" className={styles.card} variants={list} initial="hidden" animate="show" exit={{ opacity: 0 }}>
              <motion.h1 variants={item}>{score === QUESTIONS.length ? "Perfect run!" : "Nice work"}</motion.h1>
              <motion.p variants={item}>{score} of {QUESTIONS.length} right first time</motion.p>
              <motion.button variants={item} className={styles.primary} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} onClick={restart}>Play again</motion.button>
            </motion.section>
          ) : (
            <motion.section key={index} className={styles.card} variants={list} initial="hidden" animate="show"
              exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}>
              <motion.p variants={item} className={styles.label}>Question {index + 1} · Factorise fully</motion.p>
              <motion.h1 variants={item} className={styles.expr}>{q.expr}</motion.h1>
              <motion.div className={styles.options} variants={list}>
                {q.options.map((text, i) => {
                  const right = picked === i, isWrong = wrong.includes(i);
                  return (
                    // The entrance runs on the wrapper; the feedback runs on the button, so the two never fight.
                    <motion.div key={text} variants={item}>
                    <motion.button
                      className={`${styles.option} ${right ? styles.right : ""} ${isWrong ? styles.wrong : ""}`}
                      onHoverStart={() => watch(i)}
                      onHoverEnd={() => watch(null)}
                      onFocus={() => watch(i)}
                      onBlur={() => watch(null)}
                      whileHover={picked === null && !isWrong ? { y: -3, scale: 1.02 } : undefined}
                      whileTap={{ scale: 0.97 }}
                      animate={isWrong ? { x: [0, -10, 9, -6, 4, 0], opacity: 0.5 } : right ? { scale: [1, 1.08, 1], opacity: 1 } : { x: 0, opacity: 1 }}
                      transition={{ duration: 0.45 }}
                      disabled={isWrong || picked !== null}
                      onClick={() => choose(i)}
                    >
                      {text}
                      {right && <motion.span className={styles.tick} initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>✓</motion.span>}
                    </motion.button>
                    </motion.div>
                  );
                })}
              </motion.div>
              <motion.button variants={item} className={styles.hintButton} onClick={() => setHint((h) => !h)} aria-expanded={hint}>
                {hint ? "Hide hint" : "Show a hint"}
              </motion.button>
              <AnimatePresence>
                {hint && (
                  <motion.p className={styles.hint} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    {q.hint}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
