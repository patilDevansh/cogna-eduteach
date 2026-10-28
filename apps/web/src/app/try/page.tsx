"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { saveStudent } from "@/lib/session";
import { saveSample } from "@/lib/sample";
import styles from "./try.module.css";

/**
 * The public sample test (the link marketing shares). A parent gives their email and agrees, the
 * child takes Cogna's factorisation check for free, and the full report unlocks with a payment.
 */
export default function TryPage() {
  const router = useRouter();
  const [price, setPrice] = useState<number | null>(null);
  const [parentEmail, setParentEmail] = useState("");
  const [childName, setChildName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Free maths check for Grade 8 — Cogna";
    api.sampleTestPrice().then((p) => setPrice(p.price)).catch(() => setPrice(null));
  }, []);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, student } = await api.startSampleTest({ parentEmail, childName, consent });
      saveStudent({ studentId: student.studentId, name: student.name, token: student.sessionToken });
      saveSample({ token, studentId: student.studentId });
      router.push("/student/lotus?topic=factorisation");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const fullPrice = price ? `₹${price}` : "a one-time fee";

  return (
    <div className="grid-air" style={{ minHeight: "100dvh" }}>
      <div className="shell">
        <TopBar right={<Link href="/parent/login">Parent sign in</Link>} />

        <section className={styles.hero}>
          <div className={styles.copy}>
            <h1>Find exactly where your child’s factorisation breaks down.</h1>
            <p className={styles.lede}>A free 15-minute check for Grade 8 that adapts to every answer. The full report is {fullPrice}.</p>
            <p className={styles.line} aria-label="Example: 12x squared plus 18x equals 6x times 2x plus 3">
              <span>12x² + 18x</span>
              <span>=</span>
              <span>6x(2x + 3)</span>
            </p>
          </div>

          <form className={styles.form} onSubmit={start} aria-label="Start the free check">
            <h2>Start the free check</h2>
            <div className="field">
              <label htmlFor="try-email">Parent’s email</label>
              <input id="try-email" className="input" type="email" autoComplete="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required />
              <p className={styles.fine}>We email you the link to the result, so you can open it on any device.</p>
            </div>
            <div className="field">
              <label htmlFor="try-child">Child’s first name</label>
              <input id="try-child" className="input" type="text" autoComplete="off" maxLength={40} value={childName} onChange={(e) => setChildName(e.target.value)} required />
            </div>
            <label className={styles.consent} htmlFor="try-consent">
              <input id="try-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>I’m the parent or guardian, and I agree to my child taking this check. Their answers are used only to make the report.</span>
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className={`btn btn-primary btn-lg ${styles.submit}`} disabled={busy || !consent}>
              {busy ? "Starting…" : "Start the check"}
            </button>
            <p className={styles.fine}>Best on a laptop or tablet. No account needed.</p>
          </form>
        </section>

        <section className={styles.compare} aria-label="What you get">
          <h2>What you see at the end</h2>
          <div className={`${styles.tier} ${styles.free}`}>
            <h3>Free</h3>
            <ul>
              <li>How many questions your child answered, and how many were right</li>
              <li>How many skills are secure, and how many need work</li>
            </ul>
          </div>
          <div className={`${styles.tier} ${styles.full}`}>
            <h3>Full report</h3>
            <span className={styles.price}>{fullPrice}</span>
            <ul>
              <li>Which skills are secure and which need work, by name</li>
              <li>Where your child gets stuck, and why</li>
              <li>A short lesson made from your child’s own answers</li>
            </ul>
          </div>
        </section>

        <p className={styles.note}>
          The check follows the CBSE Grade 8 factorisation chapter. Every answer is checked by Cogna’s maths engine, and any AI-written text is safety-checked before your child sees it. We don’t share your child’s answers, and we only email you about this check.
        </p>
      </div>
    </div>
  );
}
