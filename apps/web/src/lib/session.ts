"use client";

const STUDENT_KEY = "cogna_student";
const PARENT_KEY = "cogna_parent";

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
}

export function getParent(): { parentId: string; email: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PARENT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearParent() {
  localStorage.removeItem(PARENT_KEY);
}
