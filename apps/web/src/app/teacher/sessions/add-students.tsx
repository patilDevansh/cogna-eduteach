"use client";

import { useMemo, useState } from "react";
import { api, ApiError, type IssuedStudentCode } from "@/lib/api";
import { parseClassList } from "@/lib/class-list";
import shared from "../teacher.module.css";
import styles from "./pilot.module.css";

export function AddStudents({ classroomId, onAdded }: { classroomId: string; onAdded: (codes: IssuedStudentCode[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const rows = useMemo(() => parseClassList(text), [text]);
  const withPhones = rows.filter((row) => row.phones?.length).length;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.importStudents(classroomId, rows, consent);
      onAdded(result.students);
      setText("");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not create the student accounts.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className={shared.secondary} onClick={() => setOpen(true)}>Add students from a class list</button>;
  }
  return (
    <form className={styles.addStudents} onSubmit={create}>
      <label htmlFor="class-list">
        <strong>Paste your class list</strong>
        <span>One student per line: name, roll number, then parents&apos; mobile numbers. Copying the columns from Excel or Google Sheets works. A parent who signs in with a number listed here can see their child.</span>
      </label>
      <textarea
        id="class-list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"Aarav Sharma, 8A-01, 98765 43210, 91234 56789\nMeena Krishnan, 8A-02, 99887 76655\nRohan Sengupta, 8A-03"}
        autoFocus
      />
      {rows.length > 0 && <p className={styles.muted}>{withPhones} of {rows.length} with a parent&apos;s number. You can add numbers later from the class list.</p>}
      <label className={styles.consentLine}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>The school has consent to use Cogna for these students, and these are the numbers the school holds for their parents.</span>
      </label>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.addActions}>
        <button className={shared.primary} disabled={busy || !rows.length || !consent}>
          {busy ? "Creating accounts…" : rows.length ? `Create ${rows.length} student account${rows.length === 1 ? "" : "s"}` : "Create accounts"}
        </button>
        <button type="button" className={shared.secondary} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
        <span className={styles.muted}>Each student gets their own sign-in code and is added to this class.</span>
      </div>
    </form>
  );
}

/**
 * New codes, shown once. Print gives one cut-out slip per student, with the student's sign-in code
 * and how their parent signs in; CSV keeps a copy for the school office.
 */
export function CodesSheet({ codes, className, onDone }: { codes: IssuedStudentCode[]; className: string; onDone: () => void }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const signInUrl = `${origin}/student/login`;
  const parentUrl = `${origin}/parent/login`;

  function printSlips() {
    document.body.classList.add("printing-slips");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-slips"), { once: true });
    window.print();
  }

  function downloadCsv() {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [["Name", "Roll number", "Class", "Sign-in code"], ...codes.map((c) => [c.name, c.rollNumber ?? "", className, c.accessCode ?? ""])];
    const blob = new Blob([lines.map((line) => line.map(quote).join(",")).join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${className.replace(/[^\w-]+/g, "-")}-sign-in-codes.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className={styles.codesSheet} aria-label="New sign-in codes">
      <div className={styles.codesHead}>
        <div>
          <h3>{codes.length} new sign-in code{codes.length === 1 ? "" : "s"}</h3>
          <p>Print or download them now. To keep them safe they are not shown again; you can issue a new code later if one is lost.</p>
        </div>
        <div className={styles.addActions}>
          <button type="button" className={shared.primary} onClick={printSlips}>Print slips</button>
          <button type="button" className={shared.secondary} onClick={downloadCsv}>Download CSV</button>
          <button type="button" className={shared.secondary} onClick={onDone}>Done</button>
        </div>
      </div>
      <div className={shared.tableWrap}>
        <table className={shared.table} style={{ minWidth: 420 }}>
          <thead><tr><th>Student</th><th>Roll</th><th>Sign-in code</th><th>Parent numbers</th></tr></thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.studentId}>
                <td>{c.name}</td><td>{c.rollNumber ?? "—"}</td>
                <td>{c.accessCode ? <code className={styles.code}>{c.accessCode}</code> : "—"}</td>
                <td>{c.phones === undefined ? "—" : c.phones || "None yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`${styles.slips} print-slips`} aria-hidden="true">
        {codes.map((c) => (
          <div className={styles.slip} key={c.studentId}>
            <strong>{c.name}</strong>
            <span>{className}{c.rollNumber ? ` · Roll ${c.rollNumber}` : ""}</span>
            {c.accessCode && (
              <>
                <span>Your sign-in code</span>
                <code>{c.accessCode}</code>
                <small>Go to {signInUrl} and type this code.</small>
              </>
            )}
            <span>For your parent</span>
            <small>Parents: sign in at {parentUrl} with the mobile number the school has for you to follow {c.name.split(" ")[0]}&apos;s progress. No code needed.</small>
          </div>
        ))}
      </div>
    </section>
  );
}
