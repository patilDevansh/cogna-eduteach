/**
 * Pure aggregation logic for parent-dashboard analytics — no Prisma, no
 * NestJS, so it's directly unit-testable. Mirrors the diagnostic-formulas.ts
 * split (pure formulas separate from the injectable service that fetches data).
 */
import type { RemediationState } from "@cogna/database";
import {
  assertConceptMasteryBandShape,
  assertMasteryTrendPointShape,
  assertPatternHistoryItemShape,
  assertPracticeCalendarDayShape,
  masteryValueToBand,
  type ConceptMasteryBand,
  type MasteryTrendPoint,
  type PatternHistoryItem,
  type PracticeCalendarDay,
} from "@cogna/shared";

/** Monday (ISO date, UTC) of the week containing `date`. */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

export interface MasteryHistoryRow {
  conceptId: string;
  newValue: number;
  createdAt: Date;
}

/** Buckets ascending-ordered MasteryHistory rows into one point per (week, concept) — last write in the week wins. */
export function bucketMasteryTrend(rows: MasteryHistoryRow[]): MasteryTrendPoint[] {
  const buckets = new Map<string, MasteryTrendPoint>();
  for (const row of rows) {
    const weekStart = mondayOf(row.createdAt);
    buckets.set(`${weekStart}|${row.conceptId}`, {
      weekStart,
      conceptId: row.conceptId,
      value: row.newValue,
    });
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map(assertMasteryTrendPointShape);
}

export interface MasteryScoreRow {
  conceptId: string;
  value: number;
  updatedAt: Date;
}

export function bandConceptMastery(scores: MasteryScoreRow[]): ConceptMasteryBand[] {
  return scores.map((s) =>
    assertConceptMasteryBandShape({
      conceptId: s.conceptId,
      band: masteryValueToBand(s.value),
      value: s.value,
      lastPracticedAt: s.updatedAt.toISOString(),
    }),
  );
}

export interface SessionRow {
  startedAt: Date;
  endedAt: Date | null;
}

export function aggregatePracticeCalendar(sessions: SessionRow[]): PracticeCalendarDay[] {
  const byDay = new Map<string, { minutes: number; sessionCount: number }>();
  for (const s of sessions) {
    const day = s.startedAt.toISOString().slice(0, 10);
    const minutes = s.endedAt
      ? Math.max(0, (s.endedAt.getTime() - s.startedAt.getTime()) / 60000)
      : 0;
    const existing = byDay.get(day) ?? { minutes: 0, sessionCount: 0 };
    existing.minutes += minutes;
    existing.sessionCount += 1;
    byDay.set(day, existing);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) =>
      assertPracticeCalendarDayShape({
        date,
        minutes: Math.round(v.minutes),
        sessionCount: v.sessionCount,
      }),
    );
}

export interface RemediationHistoryRow {
  misconceptionId: string;
  conceptId: string;
  toState: RemediationState;
  createdAt: Date;
}

/** Groups ascending-ordered transition rows by misconception, most-recently-active first. */
export function summarizePatternHistory(rows: RemediationHistoryRow[]): PatternHistoryItem[] {
  interface Acc {
    conceptId: string;
    misconceptionId: string;
    first: Date;
    last: Date;
    count: number;
    lastToState: RemediationState;
  }
  const byKey = new Map<string, Acc>();
  for (const row of rows) {
    const key = `${row.misconceptionId}|${row.conceptId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        conceptId: row.conceptId,
        misconceptionId: row.misconceptionId,
        first: row.createdAt,
        last: row.createdAt,
        count: 1,
        lastToState: row.toState,
      });
    } else {
      existing.last = row.createdAt;
      existing.count += 1;
      existing.lastToState = row.toState;
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.last.getTime() - a.last.getTime())
    .map((v) =>
      assertPatternHistoryItemShape({
        misconceptionId: v.misconceptionId,
        conceptId: v.conceptId,
        status: v.lastToState === "RESOLVED" ? "resolved" : "checking",
        firstSeenAt: v.first.toISOString(),
        lastSeenAt: v.last.toISOString(),
        occurrenceCount: v.count,
      }),
    );
}

/** Clamps a query-string weeks param to a sane range; falls back to `fallback` if absent/invalid. */
export function clampWeeks(raw: string | undefined, fallback: number): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), 26);
}
