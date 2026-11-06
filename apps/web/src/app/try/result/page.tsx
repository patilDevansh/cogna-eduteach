"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/ui";
import { api, ApiError, type SampleTestStatus } from "@/lib/api";
import { saveStudent } from "@/lib/session";
import { saveSample } from "@/lib/sample";
import styles from "../try.module.css";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCheckout = { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout }
}

/** Razorpay's checkout script, loaded only when a parent chooses to pay. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("The payment window couldn't load. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

function ResultPage() {
  const router = useRouter();
  const token = useSearchParams().get("t") ?? "";
  const [status, setStatus] = useState<SampleTestStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [testOrder, setTestOrder] = useState(false);

  const load = useCallback(async () => {
    if (!token) return setError("This link is missing its code. Open the link from our email, or start a new check.");
    try {
      setStatus(await api.getSampleTest(token));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We couldn't load the result. Please refresh.");
    }
  }, [token]);

  useEffect(() => {
    document.title = "Your maths check — Cogna";
    void load();
  }, [load]);

  /** Signs this device in as the child, so the check or the report opens. */
  function openAsChild(next: SampleTestStatus, href: string) {
    if (!next.student) return;
    saveStudent({ studentId: next.student.studentId, name: next.student.name, token: next.student.sessionToken });
    saveSample({ token, studentId: next.student.studentId });
    router.push(href);
  }

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const order = await api.orderSampleReport(token);
      if (order.mode === "TEST") {
        setTestOrder(true);
        setBusy(false);
        return;
      }
      await loadCheckout();
      const checkout = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Cogna",
        description: `${status?.childName ?? "Your child"}'s full maths report`,
        prefill: order.prefill,
        theme: { color: "#0e6b54" },
        handler: async (response: RazorpayResponse) => {
          try {
            setStatus(await api.verifySamplePayment(token, { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }));
          } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : "We couldn't confirm the payment yet. Refresh in a minute.");
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on("payment.failed", (response) => {
        setError(response.error?.description ?? "The payment didn't go through. No money was taken; you can try again.");
        setBusy(false);
      });
      checkout.open();
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  async function testPay() {
    setBusy(true);
    setError("");
    try {
      setStatus(await api.testPaySampleReport(token));
      setTestOrder(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Test payment failed.");
    } finally {
      setBusy(false);
    }
  }

  const child = status?.childName.split(/\s+/)[0] ?? "";

  return (
    <div className="grid-air" style={{ minHeight: "100dvh" }}>
      <div className="shell">
        <TopBar right={<Link href="/try">Start a new check</Link>} />
        <main className={styles.result}>
          {error && <p className="error" role="alert">{error}</p>}
          {!status && !error && <p className={styles.muted} aria-busy="true">Loading the result…</p>}

          {status && status.state !== "COMPLETE" && (
            <>
              <h1>{child}’s check isn’t finished yet</h1>
              <p className={styles.muted}>{status.state === "NOT_STARTED" ? `${child} hasn't started yet.` : `${child} can carry on from where they stopped.`} It takes about 15 minutes.</p>
              <div className={styles.pay}>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => openAsChild(status, "/student/lotus?topic=factorisation")}>
                  {status.state === "NOT_STARTED" ? "Start the check" : "Carry on"}
                </button>
              </div>
            </>
          )}

          {status?.state === "COMPLETE" && status.summary && (
            <>
              <h1>{status.paid ? `${child}’s full report is ready` : `${child} finished the check`}</h1>
              <div className={styles.score} aria-label="Summary">
                <div><strong>{status.summary.correct}/{status.summary.answered}</strong><span>questions right</span></div>
                <div className={styles.secure}><strong>{status.summary.secure}</strong><span>skills secure</span></div>
                <div className={styles.work}><strong>{status.summary.needWork}</strong><span>skill{status.summary.needWork === 1 ? "" : "s"} need work</span></div>
              </div>

              {!status.paid && !status.summary.readable ? (
                <div className={styles.locked}>
                  <p>There weren’t enough answers to say where {child} gets stuck, so there’s no report to unlock. That usually means many questions were skipped or answered “I don’t know”.</p>
                  <div className={styles.pay}>
                    <Link href="/try" className="btn btn-primary btn-lg">Take the check again</Link>
                    <span className={styles.muted}>Free, as before.</span>
                  </div>
                </div>
              ) : status.paid ? (
                <>
                  <p className={styles.muted}>The report names each skill, shows where {child} gets stuck and why, and comes with a short lesson made from {child}’s own answers.</p>
                  <div className={styles.pay}>
                    <button type="button" className="btn btn-primary btn-lg" onClick={() => openAsChild(status, `/student/lotus/report?session=${encodeURIComponent(status.sessionId ?? "")}`)}>
                      Open the full report
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.locked}>
                  <p>The full report shows:</p>
                  <ul>
                    <li>the {status.summary.skillsChecked} skill{status.summary.skillsChecked === 1 ? "" : "s"} checked, by name, and which need work</li>
                    <li>where {child} gets stuck, and why</li>
                    <li>a short lesson made from {child}’s own answers</li>
                  </ul>
                  <div className={styles.pay}>
                    <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void unlock()}>
                      {busy ? "Opening payment…" : `Unlock for ₹${status.price}`}
                    </button>
                    <span className={styles.muted}>UPI, cards and netbanking. One payment, no subscription.</span>
                  </div>
                  {testOrder && (
                    <p className={styles.testNote}>
                      Test mode: payments aren’t set up on this server, so no money is taken.{" "}
                      <button type="button" className="btn-link" disabled={busy} onClick={() => void testPay()}>Complete the test payment</button>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function TryResultRoute() {
  return (
    <Suspense fallback={<p className="shell">Loading…</p>}>
      <ResultPage />
    </Suspense>
  );
}
