"use client";

const STUDENT_KEY = "cogna_student";
const PARENT_KEY = "cogna_parent";
const TEACHER_KEY = "cogna_teacher_invitation";

/** Fired on save/clear so same-tab listeners (parent-auth-context) notice a
 * change — Next.js client-side navigation doesn't remount layout-level
 * providers, so a mount-only localStorage read would otherwise go stale. */
const PARENT_CHANGED_EVENT = "cogna:parent-changed";

export type StudentSessionRecord = {
  studentId: string;
  name: string;
  token?: string;
};

export type TeacherInvitationRecord = {
  teacherEmail: string;
  teacherName: string;
  schoolId: string;
  schoolName: string;
  role: "teacher";
  invitationVerified: true;
  token?: string;
};

export function saveStudent(data: StudentSessionRecord) {
  localStorage.setItem(STUDENT_KEY, JSON.stringify(data));
}

export function getStudent(): StudentSessionRecord | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STUDENT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearStudent() {
  localStorage.removeItem(STUDENT_KEY);
}

export async function ensureDemoStudentSession(
  studentId: string,
  name: string,
): Promise<StudentSessionRecord> {
  const existing = getStudent();
  if (existing?.studentId === studentId && existing.token) return existing;
  const response = await fetch("/api/session/student", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, name }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    studentId?: string;
    name?: string;
    token?: string;
    message?: string;
  };
  if (!response.ok || !body.token) {
    throw new Error(body.message ?? "Could not start a signed student session.");
  }
  const next: StudentSessionRecord = {
    studentId: body.studentId ?? studentId,
    name: body.name ?? name,
    token: body.token,
  };
  saveStudent(next);
  return next;
}

export function saveTeacherInvitation(data: TeacherInvitationRecord) {
  sessionStorage.setItem(TEACHER_KEY, JSON.stringify(data));
}

export function getTeacherInvitation(): TeacherInvitationRecord | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(TEACHER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TeacherInvitationRecord;
  } catch {
    return null;
  }
}

export function saveParent(data: { parentId: string; email: string; name: string }) {
  localStorage.setItem(PARENT_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event(PARENT_CHANGED_EVENT));
}

export function getParent(): { parentId: string; email: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PARENT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearParent() {
  localStorage.removeItem(PARENT_KEY);
  window.dispatchEvent(new Event(PARENT_CHANGED_EVENT));
}

/** Subscribes to saveParent/clearParent changes, including same-tab. Returns an unsubscribe function. */
export function onParentChanged(listener: () => void): () => void {
  window.addEventListener(PARENT_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PARENT_CHANGED_EVENT, listener);
}
