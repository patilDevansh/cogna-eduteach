"use client";

const STUDENT_KEY = "cogna_student";
const PARENT_KEY = "cogna_parent";

/** Fired on save/clear so same-tab listeners (parent-auth-context) notice a
 * change — Next.js client-side navigation doesn't remount layout-level
 * providers, so a mount-only localStorage read would otherwise go stale. */
const PARENT_CHANGED_EVENT = "cogna:parent-changed";

export function saveStudent(data: { studentId: string; name: string }) {
  localStorage.setItem(STUDENT_KEY, JSON.stringify(data));
}

export function getStudent(): { studentId: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STUDENT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearStudent() {
  localStorage.removeItem(STUDENT_KEY);
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
