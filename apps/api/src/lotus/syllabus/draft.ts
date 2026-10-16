/**
 * Draft skill maps and question plans for the Class 8 chapters Cogna doesn't
 * run checks on yet, in the same shape as lotus-factorisation-catalogue.ts:
 * skills that build on each other, the mistakes each one catches, and 25
 * question slots (13 explore, 6 diagnose, 6 confirm) the AI writer fills.
 *
 * Written from the NCERT chapter without a teacher's review. Every NUMBER and
 * EXPRESSION answer that has a `check` is re-derived by the algebra engine in
 * the golden test, so the maths is right; the pedagogy is a first draft.
 *
 * Not wired into the diagnostic yet: each chapter still needs its answer
 * checker and lesson brief before it can be switched on in topic-catalogue.ts.
 */
import type { LotusPhase } from "@cogna/shared";

/** EXPRESSION: algebra the engine can compare. NUMBER: a number or fraction. CHOICE: four options. */
export type DraftKind = "EXPRESSION" | "NUMBER" | "CHOICE";
type Level = "easy" | "medium" | "hard";

export interface DraftSkill { id: string; name: string; group: number; dependsOn: string[]; mistakes: string[] }

export interface DraftSlot {
  slot: number;
  skillId: string;
  kind: DraftKind;
  level: Level;
  phase: LotusPhase;
  prompt: string;
  answer: string;
  /** CHOICE only; the first option is the right one, so shuffle before showing. */
  options?: string[];
  /** An expression equal to the answer, or an equation the answer (as x) solves. */
  check?: string;
  tagged: string[];
  mistakes: string[];
}

export interface DraftChapter {
  topicId: string;
  chapter: number;
  skills: DraftSkill[];
  /** What each mistake code means, for the AI writer and the lesson. */
  mistakes: Record<string, string>;
  slots: DraftSlot[];
}

export type SkillRow = [id: string, name: string, group: number, dependsOn: string[], mistakes: string[]];
export type SlotRow = [skillId: string, kind: DraftKind, level: Level, phase: LotusPhase, prompt: string, answer: string | string[], tagged: string[], mistakes: string[], check?: string];

export function draftChapter(topicId: string, chapter: number, skills: SkillRow[], mistakes: Record<string, string>, slots: SlotRow[]): DraftChapter {
  return {
    topicId,
    chapter,
    skills: skills.map(([id, name, group, dependsOn, m]) => ({ id, name, group, dependsOn, mistakes: m })),
    mistakes,
    slots: slots.map(([skillId, kind, level, phase, prompt, answer, tagged, m, check], i) => ({
      slot: i + 1,
      skillId,
      kind,
      level,
      phase,
      prompt,
      answer: Array.isArray(answer) ? answer[0]! : answer,
      ...(Array.isArray(answer) ? { options: answer } : {}),
      ...(check ? { check } : {}),
      tagged,
      mistakes: m,
    })),
  };
}
