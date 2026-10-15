"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ParentLinkRequest, type SchoolChild } from "@/lib/api";
import type { ParentAuthInput } from "@/lib/parent-auth-headers";
import { showPhone } from "@/lib/phone";
import styles from "../parent.module.css";

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/**
 * How a parent finds a child their school added: confirm the mobile number the school has (a
 * texted code), then agree for each child listed with it. Without a number on record, they ask
 * the class teacher instead.
 */
export function SchoolLink({ getAuth, onLinked }: { getAuth: () => Promise<ParentAuthInput>; onLinked: () => void }) {
  const [phone, setPhone] = useState<string | null | undefined>(undefined);
  const [schoolChildren, setSchoolChildren] = useState<SchoolChild[]>([]);
  const [requests, setRequests] = useState<ParentLinkRequest[]>([]);
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState<{ phone: string; masked: string; devCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState({ joinCode: "", childName: "", rollNumber: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const auth = await getAuth();
    const [p, kids, reqs] = await Promise.all([api.getParentPhone(auth), api.getSchoolChildren(auth), api.getParentLinkRequests(auth)]);
    setPhone(p.phone);
    setSchoolChildren(kids);
    setRequests(reqs);
  }, [getAuth]);

  useEffect(() => {
    load().catch(() => setPhone(null));
  }, [load]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  }

  const sendCode = () => run("send", async () => {
    setSent(await api.sendParentPhoneCode(await getAuth(), typed));
    setCode("");
  });

  const confirm = () => run("verify", async () => {
    const result = await api.verifyParentPhone(await getAuth(), sent!.phone, code);
    setPhone(result.phone);
    setSchoolChildren(result.children);
    setSent(null);
    onLinked();
  });

  const answer = (child: SchoolChild, agree: boolean) => run(child.studentId, async () => {
    setSchoolChildren(await api.answerSchoolChild(await getAuth(), child.studentId, agree));
    if (agree) onLinked();
  });

  const sendRequest = () => run("ask", async () => {
    setRequests(await api.requestParentLink(await getAuth(), { joinCode: ask.joinCode, childName: ask.childName, rollNumber: ask.rollNumber || undefined }));
    setAsking(false);
    setAsk({ joinCode: "", childName: "", rollNumber: "" });
  });

  if (phone === undefined) return null;
  const waiting = schoolChildren.filter((c) => c.status !== "LINKED");
  const pending = requests.filter((r) => r.status !== "APPROVED");

  return (
    <section className={`dash-card rise ${styles.schoolLink}`} id="school" aria-label="Children from school">
      {!phone ? (
        <>
          <h2 className="dash-section-title">Is your child&apos;s school on Cogna?</h2>
          <p className={styles.schoolNote}>Confirm the mobile number you gave the school, and your child appears here. No code from school needed.</p>
          {!sent ? (
            <form className={styles.schoolForm} onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
              <label htmlFor="parent-phone">Your mobile number</label>
              <div>
                <input id="parent-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="98765 43210" required />
                <button type="submit" className="btn btn-primary btn-pill" disabled={busy === "send"}>{busy === "send" ? "Sending…" : "Text me a code"}</button>
              </div>
            </form>
          ) : (
            <form className={styles.schoolForm} onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
              <label htmlFor="parent-phone-code">The 6-digit code we texted to {sent.masked}</label>
              <div>
                <input id="parent-phone-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" required />
                <button type="submit" className="btn btn-primary btn-pill" disabled={busy === "verify" || code.length !== 6}>{busy === "verify" ? "Checking…" : "Confirm"}</button>
                <button type="button" className="btn-link" onClick={() => { setSent(null); setError(""); }}>Change number</button>
              </div>
              {sent.devCode && <small className={styles.devCode} data-testid="dev-phone-code">Test mode: no text is sent. Your code is {sent.devCode}.</small>}
            </form>
          )}
        </>
      ) : (
        <>
          {waiting.length > 0 ? (
            <>
              <h2 className="dash-section-title">From your child&apos;s school</h2>
              <ul className={styles.schoolKids}>
                {waiting.map((child) => (
                  <li key={child.studentId}>
                    <p>
                      <strong>{child.name}</strong>
                      {child.className && <> · {child.className}{child.teacherName ? ` with ${child.teacherName}` : ""}</>}
                    </p>
                    {child.status === "DECLINED" ? (
                      <p className={styles.schoolNote}>You said no, so you don&apos;t see {firstName(child.name)}&apos;s progress. The school still decides about class use.</p>
                    ) : (
                      <p className={styles.schoolNote}>
                        The school listed your number for {firstName(child.name)}. Do you agree to {firstName(child.name)} practising maths on Cogna with their class, and to seeing their progress here?
                      </p>
                    )}
                    <div className={styles.schoolActions}>
                      <button type="button" className="btn btn-primary btn-pill" disabled={busy === child.studentId} onClick={() => void answer(child, true)}>
                        {child.status === "DECLINED" ? "I agree now" : "I agree"}
                      </button>
                      {child.status !== "DECLINED" && <button type="button" className="btn-link" disabled={busy === child.studentId} onClick={() => void answer(child, false)}>No thanks</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.schoolNote}>
              Signed in with {showPhone(phone)}. Children the school lists with this number appear here.
            </p>
          )}
        </>
      )}

      {pending.length > 0 && (
        <ul className={styles.schoolRequests}>
          {pending.map((r) => (
            <li key={r.id}>
              {r.status === "PENDING" ? "Waiting for the teacher" : "The teacher couldn't match this"}: <strong>{r.childName}</strong> in {r.className}
            </li>
          ))}
        </ul>
      )}

      {!asking ? (
        <button type="button" className={`btn-link ${styles.schoolAsk}`} onClick={() => setAsking(true)}>Can&apos;t find your child? Ask their teacher</button>
      ) : (
        <form className={styles.schoolForm} onSubmit={(e) => { e.preventDefault(); void sendRequest(); }}>
          <p className={styles.schoolNote}>The teacher links you once they&apos;ve checked. Sending this means you agree to your child practising maths on Cogna with their class.</p>
          <label htmlFor="ask-code">Class code (from your child, or the teacher)</label>
          <input id="ask-code" className="input" value={ask.joinCode} onChange={(e) => setAsk({ ...ask, joinCode: e.target.value })} placeholder="CG-1A2B3C" required autoComplete="off" />
          <label htmlFor="ask-name">Your child&apos;s name, as the school has it</label>
          <input id="ask-name" className="input" value={ask.childName} onChange={(e) => setAsk({ ...ask, childName: e.target.value })} required />
          <label htmlFor="ask-roll">Roll number (if you know it)</label>
          <input id="ask-roll" className="input" value={ask.rollNumber} onChange={(e) => setAsk({ ...ask, rollNumber: e.target.value })} />
          <div>
            <button type="submit" className="btn btn-primary btn-pill" disabled={busy === "ask"}>{busy === "ask" ? "Sending…" : "Send to the teacher"}</button>
            <button type="button" className="btn-link" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
