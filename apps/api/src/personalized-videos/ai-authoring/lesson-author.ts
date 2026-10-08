import type { AuthoredLessonDraft } from "@cogna/shared";
import { AuthorUnavailableError, type LessonAuthorModel } from "./author-models";
import type { LessonBrief } from "./lesson-brief";
import { buildAuthorPrompt } from "./lesson-prompt";
import { codePracticeFits, generatePractice } from "./practice-generator";
import { verifyAuthoredLesson } from "./lesson-verifier";

/**
 * Write → verify → rewrite.
 *
 * The model drafts the lesson; the verifier re-checks every claim. Rejected
 * drafts go back to the model with the exact errors, up to `maxAttempts`.
 * If the lesson itself passes but the practice or exit item keeps failing,
 * those are swapped for code-generated ones (and verified again) rather
 * than throwing the lesson away. Nothing unverified is ever returned.
 */

export interface AuthoringAttempt {
  attempt: number;
  ok: boolean;
  errors: string[];
  claimsChecked: number;
}

export type AuthoringOutcome =
  | {
      ok: true;
      draft: AuthoredLessonDraft;
      model: string;
      attempts: AuthoringAttempt[];
      claimsChecked: number;
      /** True when the practice/exit came from code because the model's kept failing. */
      practiceFromCode: boolean;
    }
  | { ok: false; model: string; attempts: AuthoringAttempt[]; reason: string };

const LESSON_ONLY = /^(practice|exit)\b/;

export async function authorLesson(
  brief: LessonBrief,
  model: LessonAuthorModel,
  options: { maxAttempts?: number; seed?: string } = {},
): Promise<AuthoringOutcome> {
  const maxAttempts = options.maxAttempts ?? 3;
  const attempts: AuthoringAttempt[] = [];
  let lastErrors: string[] = [];
  let lastDraft: AuthoredLessonDraft | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: unknown;
    try {
      raw = await model.author(buildAuthorPrompt(brief, lastErrors));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ attempt, ok: false, errors: [message], claimsChecked: 0 });
      // An account-level refusal won't change on retry; a one-off failure might.
      if (error instanceof AuthorUnavailableError) return { ok: false, model: model.label, attempts, reason: message };
      continue;
    }
    const draft = raw as AuthoredLessonDraft;
    const result = verifyAuthoredLesson(draft, brief);
    attempts.push({ attempt, ok: result.ok, errors: result.errors, claimsChecked: result.claimsChecked });
    if (result.ok) return { ok: true, draft, model: model.label, attempts, claimsChecked: result.claimsChecked, practiceFromCode: false };
    lastErrors = result.errors;
    lastDraft = draft;
  }

  // Salvage: the lesson is sound and only the practice/exit failed.
  if (lastDraft && lastErrors.length && lastErrors.every((e) => LESSON_ONLY.test(e)) && codePracticeFits(brief.targetSkill.id)) {
    const generated = generatePractice(brief.targetSkill.id, options.seed ?? brief.targetSkill.id, brief.studentItems.map((i) => i.expression));
    const patched: AuthoredLessonDraft = { ...lastDraft, practice: generated.items, exit: generated.exit };
    const result = verifyAuthoredLesson(patched, brief);
    attempts.push({ attempt: attempts.length + 1, ok: result.ok, errors: result.errors, claimsChecked: result.claimsChecked });
    if (result.ok) return { ok: true, draft: patched, model: model.label, attempts, claimsChecked: result.claimsChecked, practiceFromCode: true };
  }

  return {
    ok: false,
    model: model.label,
    attempts,
    reason: `The AI lesson failed verification ${attempts.length} time(s); first problems: ${lastErrors.slice(0, 3).join(" | ") || "no usable response"}`,
  };
}
