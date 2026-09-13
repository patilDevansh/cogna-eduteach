import type { LotusSessionView } from "@cogna/shared";
import type { MockStudentEnrollment } from "./mock-classroom";

export type StoredLotusSession = {
  session: LotusSessionView;
  studentName: string;
  enrollment: MockStudentEnrollment | null;
  savedAt: string;
  teaching?: { moduleTitle: string; hintUsed: boolean; guidedAnswer: string };
  exit?: Array<{ prompt: string; answer: string; working: string; correct: boolean; form: "familiar" | "transfer" }>;
};

const KEY = "cogna_lotus_class_sessions_v1";
export function getStoredLotusSessions(): StoredLotusSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as StoredLotusSession[]; } catch { return []; }
}
export function saveStoredLotusSession(value: StoredLotusSession) {
  const rest = getStoredLotusSessions().filter(item => item.session.sessionId !== value.session.sessionId);
  localStorage.setItem(KEY, JSON.stringify([value, ...rest]));
  window.dispatchEvent(new Event("cogna-lotus-sessions"));
}
export function latestStoredLotusSession() { return getStoredLotusSessions()[0] ?? null; }
