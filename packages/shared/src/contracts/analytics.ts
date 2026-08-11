/**
 * Parent-dashboard analytics payload shapes — mastery trend, concept bands,
 * practice calendar, pattern history. Same zero-dep runtime-guard convention
 * as payload-shapes.ts (hand-written interfaces + isXxx/assertXxxShape).
 */

export type MasteryBand = "JUST_STARTED" | "BUILDING" | "STRONG";

const MASTERY_BANDS: MasteryBand[] = ["JUST_STARTED", "BUILDING", "STRONG"];

export function isMasteryBand(v: unknown): v is MasteryBand {
  return typeof v === "string" && (MASTERY_BANDS as string[]).includes(v);
}

/** Maps a raw MasteryScore.value (0..1) to a parent-facing band label. Never a percentage in the UI. */
export function masteryValueToBand(value: number): MasteryBand {
  if (value >= 0.75) return "STRONG";
  if (value >= 0.4) return "BUILDING";
  return "JUST_STARTED";
}

export interface MasteryTrendPoint {
  weekStart: string; // ISO date, Monday of the bucket week
  conceptId: string;
  value: number; // 0..1, latest MasteryHistory.newValue within the week bucket
}

export function assertMasteryTrendPointShape(v: unknown): MasteryTrendPoint {
  if (!v || typeof v !== "object") {
    throw new Error("MasteryTrendPoint: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.weekStart !== "string" || !o.weekStart) {
    throw new Error("MasteryTrendPoint: weekStart required");
  }
  if (typeof o.conceptId !== "string" || !o.conceptId) {
    throw new Error("MasteryTrendPoint: conceptId required");
  }
  if (typeof o.value !== "number" || o.value < 0 || o.value > 1) {
    throw new Error(`MasteryTrendPoint: value must be 0..1, got ${String(o.value)}`);
  }
  return v as MasteryTrendPoint;
}

export interface ConceptMasteryBand {
  conceptId: string;
  band: MasteryBand;
  value: number; // 0..1, retained for internal sort/threshold use — never rendered raw to a parent
  lastPracticedAt: string; // ISO timestamp — the real recency signal, used to pick "what's newest"
  /** How many pieces of evidence back this band — the same counter the diagnostic
   * engine uses internally (MasteryScore.evidenceCount). Surfaced so a parent can
   * tell "this is based on 3 tries" apart from "this is based on 40". */
  evidenceCount: number;
}

export function assertConceptMasteryBandShape(v: unknown): ConceptMasteryBand {
  if (!v || typeof v !== "object") {
    throw new Error("ConceptMasteryBand: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.conceptId !== "string" || !o.conceptId) {
    throw new Error("ConceptMasteryBand: conceptId required");
  }
  if (!isMasteryBand(o.band)) {
    throw new Error(`ConceptMasteryBand: invalid band ${String(o.band)}`);
  }
  if (typeof o.value !== "number" || o.value < 0 || o.value > 1) {
    throw new Error(`ConceptMasteryBand: value must be 0..1, got ${String(o.value)}`);
  }
  if (typeof o.lastPracticedAt !== "string" || !o.lastPracticedAt) {
    throw new Error("ConceptMasteryBand: lastPracticedAt required");
  }
  if (typeof o.evidenceCount !== "number" || o.evidenceCount < 0) {
    throw new Error("ConceptMasteryBand: evidenceCount must be a non-negative number");
  }
  return v as ConceptMasteryBand;
}

export interface PracticeCalendarDay {
  date: string; // ISO date (day granularity)
  minutes: number;
  sessionCount: number;
}

export function assertPracticeCalendarDayShape(v: unknown): PracticeCalendarDay {
  if (!v || typeof v !== "object") {
    throw new Error("PracticeCalendarDay: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.date !== "string" || !o.date) {
    throw new Error("PracticeCalendarDay: date required");
  }
  if (typeof o.minutes !== "number" || o.minutes < 0) {
    throw new Error("PracticeCalendarDay: minutes must be a non-negative number");
  }
  if (typeof o.sessionCount !== "number" || o.sessionCount < 0) {
    throw new Error("PracticeCalendarDay: sessionCount must be a non-negative number");
  }
  return v as PracticeCalendarDay;
}

export type PatternHistoryStatus = "checking" | "resolved";

export interface PatternHistoryExample {
  /** The question stem the student saw (already parent/student-safe content). */
  stem: string;
  /** What the student actually submitted for that attempt. */
  submittedAnswer: string;
}

export interface PatternHistoryItem {
  misconceptionId: string;
  conceptId: string;
  status: PatternHistoryStatus;
  firstSeenAt: string; // ISO datetime — earliest transition into this misconception's active states
  lastSeenAt: string; // ISO datetime — most recent transition
  occurrenceCount: number; // number of transition-log rows for this misconception in the window
  /** Plain-language explanation of the pattern, from the authored explanation
   * library — undefined when no explanation has been authored for this
   * misconception yet (falls back to the generic label in the UI, never blank). */
  explanation?: string;
  /** One concrete example of this pattern actually happening, for the "spotlight" —
   * omitted when no matching wrong attempt could be found in the window. */
  example?: PatternHistoryExample;
}

export function assertPatternHistoryItemShape(v: unknown): PatternHistoryItem {
  if (!v || typeof v !== "object") {
    throw new Error("PatternHistoryItem: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.misconceptionId !== "string" || !o.misconceptionId) {
    throw new Error("PatternHistoryItem: misconceptionId required");
  }
  if (typeof o.conceptId !== "string" || !o.conceptId) {
    throw new Error("PatternHistoryItem: conceptId required");
  }
  if (o.status !== "checking" && o.status !== "resolved") {
    throw new Error(`PatternHistoryItem: invalid status ${String(o.status)}`);
  }
  if (typeof o.firstSeenAt !== "string" || !o.firstSeenAt) {
    throw new Error("PatternHistoryItem: firstSeenAt required");
  }
  if (typeof o.lastSeenAt !== "string" || !o.lastSeenAt) {
    throw new Error("PatternHistoryItem: lastSeenAt required");
  }
  if (typeof o.occurrenceCount !== "number" || o.occurrenceCount < 0) {
    throw new Error("PatternHistoryItem: occurrenceCount must be a non-negative number");
  }
  if (o.explanation !== undefined && typeof o.explanation !== "string") {
    throw new Error("PatternHistoryItem: explanation must be a string when present");
  }
  if (o.example !== undefined) {
    const ex = o.example as Record<string, unknown>;
    if (!ex || typeof ex !== "object" || typeof ex.stem !== "string" || typeof ex.submittedAnswer !== "string") {
      throw new Error("PatternHistoryItem: example must have string stem and submittedAnswer when present");
    }
  }
  return v as PatternHistoryItem;
}

export interface StudentSafetySettings {
  aiAssistedPracticePaused: boolean;
}

export function assertStudentSafetySettingsShape(v: unknown): StudentSafetySettings {
  if (!v || typeof v !== "object") {
    throw new Error("StudentSafetySettings: not an object");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.aiAssistedPracticePaused !== "boolean") {
    throw new Error("StudentSafetySettings: aiAssistedPracticePaused must be boolean");
  }
  return v as StudentSafetySettings;
}

/** Mirrors diagnostic-formulas.ts's CalibrationLabel — kept as a separate parent-
 * facing type rather than importing the engine's internal type, matching this
 * file's existing convention of hand-written, dependency-free contract shapes. */
export type ConfidenceCalibration =
  | "possibly_overconfident"
  | "possibly_underconfident"
  | "reasonably_calibrated"
  | "unknown";

const CONFIDENCE_CALIBRATIONS: ConfidenceCalibration[] = [
  "possibly_overconfident",
  "possibly_underconfident",
  "reasonably_calibrated",
  "unknown",
];

export interface ConfidenceCalibrationSummary {
  calibration: ConfidenceCalibration;
}

export function assertConfidenceCalibrationSummaryShape(v: unknown): ConfidenceCalibrationSummary {
  if (!v || typeof v !== "object") {
    throw new Error("ConfidenceCalibrationSummary: not an object");
  }
  const o = v as Record<string, unknown>;
  if (!(CONFIDENCE_CALIBRATIONS as string[]).includes(o.calibration as string)) {
    throw new Error(`ConfidenceCalibrationSummary: invalid calibration ${String(o.calibration)}`);
  }
  return v as ConfidenceCalibrationSummary;
}
