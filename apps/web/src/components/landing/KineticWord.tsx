"use client";

import { useEffect, useState } from "react";
import styles from "@/app/landing.module.css";

const WORDS = ["desk", "mistake", "question", "student"];

/** The last word of the hero headline, swapping every few seconds. Still for reduced motion. */
export function KineticWord() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <span aria-hidden="true" className={styles.kineticSlot}>
      <span key={i} className={styles.kineticWord}>{WORDS[i]}</span>
      <span className={styles.caret} />
    </span>
  );
}
