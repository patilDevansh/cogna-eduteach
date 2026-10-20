"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type ClassRosterStudent, type ParentLinkRequestForTeacher } from "@/lib/api";
import { phoneKey, showPhone } from "@/lib/phone";
import shared from "../teacher.module.css";
import styles from "./pilot.module.css";

const RELATIONSHIPS = ["mother", "father", "guardian"] as const;
const STATUS_TEXT = { LINKED: "Linked", DECLINED: "Said no", WAITING: "Not signed in yet" } as const;

/** One line for the roster: how this student's parents are connected. */
export function parentStatus(s: ClassRosterStudent): string {
  const guardians = s.guardians ?? [];
  const linked = s.parents?.length ?? 0;
  if (guardians.some((g) => g.status === "DECLINED")) return "A parent said no";
  if (!guardians.length) return linked ? `${linked} parent linked` : "No parent number";
  return `${linked} of ${Math.max(guardians.length, linked)} parent${guardians.length === 1 ? "" : "s"} linked`;
}

/**
 * The parents' numbers on the school's record for one student. A parent who signs in with a listed
 * number sees the child; taking a number off, or unlinking, removes their access.
 */
export function ParentsEditor({ classroomId, student, onSaved, onClose }: { classroomId: string; student: ClassRosterStudent; onSaved: (row: ClassRosterStudent) => void; onClose: () => void }) {
  const [rows, setRows] = useState(() => (student.guardians ?? []).map((g) => ({ phone: showPhone(g.phone), relationship: g.relationship })));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const statusOf = new Map((student.guardians ?? []).map((g) => [phoneKey(g.phone), g.status]));

  async function run(key: string, action: () => Promise<ClassRosterStudent>) {
    setBusy(key);
    setError("");
    try {
      const row = await action();
      onSaved(row);
      setRows((row.guardians ?? []).map((g) => ({ phone: showPhone(g.phone), relationship: g.relationship })));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={styles.parentsEditor} aria-label={`Parents of ${student.name}`}>
      <div className={styles.panelHead}>
        <h3>Parents of {student.name}</h3>
        <button type="button" className={styles.removeNo} onClick={onClose}>Close</button>
      </div>
      <p className={styles.muted}>A parent who signs in with one of these numbers sees {student.name.split(" ")[0]}&apos;s progress once they agree. Taking a number off removes that parent&apos;s access.</p>
      <div className={styles.guardianRows}>
        {rows.map((row, i) => (
          <div className={styles.guardianRow} key={i}>
            <input aria-label="Mobile number" value={row.phone} onChange={(e) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, phone: e.target.value } : r)))} placeholder="98765 43210" inputMode="tel" />
            <select aria-label="Relationship" value={row.relationship} onChange={(e) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, relationship: e.target.value } : r)))}>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <small data-status={statusOf.get(phoneKey(row.phone))}>{statusOf.has(phoneKey(row.phone)) ? STATUS_TEXT[statusOf.get(phoneKey(row.phone))!] : "Not saved"}</small>
            <button type="button" className={styles.removeNo} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${row.phone || "this number"}`}>Remove</button>
          </div>
        ))}
        {rows.length < 4 && <button type="button" className={styles.removeNo} onClick={() => setRows((prev) => [...prev, { phone: "", relationship: "guardian" }])}>Add a number</button>}
      </div>
      <div className={styles.addActions}>
        <button type="button" className={shared.primary} disabled={Boolean(busy)} onClick={() => void run("save", () => api.setGuardianPhones(classroomId, student.studentId, rows.filter((r) => r.phone.trim())))}>
          {busy === "save" ? "Saving…" : "Save numbers"}
        </button>
      </div>
      {(student.parents?.length ?? 0) > 0 && (
        <ul className={styles.linkedParents}>
          {student.parents!.map((p) => (
            <li key={p.parentId}>
              <span><strong>{p.name}</strong> {p.phone && <small>{showPhone(p.phone)}</small>} <small>{p.source === "TEACHER_APPROVED" ? "you approved" : "signed in with their number"}</small></span>
              <button type="button" className={styles.removeNo} disabled={Boolean(busy)} onClick={() => void run(`unlink:${p.parentId}`, () => api.unlinkParent(classroomId, student.studentId, p.parentId))}>Unlink</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className={styles.formError}>{error}</p>}
    </section>
  );
}

/** Parents whose number the school doesn't have, asking to be linked. The teacher picks the student. */
export function LinkRequests({ classroomId, roster, onChanged }: { classroomId: string; roster: ClassRosterStudent[]; onChanged: () => void }) {
  const [requests, setRequests] = useState<ParentLinkRequestForTeacher[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // A new request (or any change in who follows a student) reaches the page as a roster event,
  // which reloads the roster; the requests reload with it.
  useEffect(() => {
    api.getLinkRequests(classroomId).then(setRequests).catch(() => undefined);
  }, [classroomId, roster]);

  async function answer(request: ParentLinkRequestForTeacher, approve: boolean) {
    const studentId = chosen[request.id] ?? request.suggestions[0]?.studentId ?? "";
    if (approve && !studentId) return setError("Pick which student this parent belongs to.");
    setBusy(request.id);
    setError("");
    try {
      setRequests(approve ? await api.approveLinkRequest(classroomId, request.id, studentId) : await api.declineLinkRequest(classroomId, request.id));
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not answer the request.");
    } finally {
      setBusy("");
    }
  }

  if (!requests.length) return null;
  const schoolMade = roster.filter((s) => s.schoolIssuedCode);
  return (
    <section className={styles.linkRequests} aria-label="Parents asking to be linked">
      <h4>{requests.length} parent{requests.length === 1 ? "" : "s"} asking to be linked</h4>
      {requests.map((r) => (
        <div className={styles.linkRequest} key={r.id}>
          <span>
            <strong>{r.parentName}</strong>{r.parentPhone && <small> · {showPhone(r.parentPhone)}</small>} says their child is <strong>{r.childName}</strong>{r.rollNumber && <> (roll {r.rollNumber})</>}.
          </span>
          <select aria-label={`Student for ${r.parentName}`} value={chosen[r.id] ?? r.suggestions[0]?.studentId ?? ""} onChange={(e) => setChosen((prev) => ({ ...prev, [r.id]: e.target.value }))}>
            <option value="">Choose the student…</option>
            {[...r.suggestions, ...schoolMade.filter((s) => !r.suggestions.some((m) => m.studentId === s.studentId))].map((s) => (
              <option key={s.studentId} value={s.studentId}>{s.name}{s.rollNumber ? ` · ${s.rollNumber}` : ""}</option>
            ))}
          </select>
          <button type="button" className={shared.primary} disabled={busy === r.id} onClick={() => void answer(r, true)}>Link</button>
          <button type="button" className={styles.removeNo} disabled={busy === r.id} onClick={() => void answer(r, false)}>Decline</button>
        </div>
      ))}
      {error && <p className={styles.formError}>{error}</p>}
    </section>
  );
}
