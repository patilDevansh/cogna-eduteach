import type { LotusSessionView } from "@cogna/shared";
import { confirmedByDepth, foldLedger } from "../../lotus/lotus-factorisation";
import { findFactorisationSkill, skillName } from "../../lotus/lotus-factorisation-catalogue";
import { algebraicallyEqual, isReadable } from "../../lotus/lotus-algebra";

/**
 * Everything the AI author is told about one student, built from a finished
 * factorisation diagnostic. Deliberately small: first name only, the target
 * skill, the student's own wrong answers on it (with the verified correct
 * answers from the answer keys), and what they already do well. No ids, no
 * school, no free-text notes about the child.
 */
export interface LessonBrief {
  studentFirstName: string;
  grade: 8;
  topic: "Factorisation";
  targetSkill: { id: string; name: string };
  /** Skills the target builds on, by name, so the lesson can lean on them. */
  buildsOn: string[];
  /** Lotus mistake codes seen on the target skill, most frequent first. */
  mistakes: string[];
  /** The student's own wrong answers on the target skill. Maths here comes from verified answer keys. */
  studentItems: Array<{
    questionNumber: number;
    prompt: string;
    expression: string;
    task: "factorise" | "simplify";
    studentAnswer: string;
    correctAnswer: string;
    mistake?: string;
    mistakeDescription?: string;
  }>;
  /** Secure skills, by name: the lesson opens from one of these. */
  strengths: string[];
}

/**
 * Removes "(E) + 7932 - 7932"-style padding some generated items carry to make them unique,
 * so the lesson shows the expression the way a student reads it. Kept only if still exactly equal.
 */
export function tidyExpression(expression: string): string {
  const m = expression.trim().match(/^\((.+)\)\s*([+-])\s*(\d+)\s*([+-])\s*(\d+)$/);
  if (!m || m[3] !== m[5] || m[2] === m[4]) return expression;
  const inner = m[1]!.trim();
  try {
    return algebraicallyEqual(inner, expression) ? inner : expression;
  } catch {
    return expression;
  }
}

export function buildLessonBrief(session: LotusSessionView, studentFirstName: string): LessonBrief | null {
  if (session.topic !== "FACTORISATION" || session.finalReport?.outcome !== "SOLID_GAP") return null;
  const target = confirmedByDepth(foldLedger(session.audits))[0];
  if (!target) return null;

  const studentItems: LessonBrief["studentItems"] = [];
  session.audits.forEach((audit, index) => {
    const d = audit.question.answerKey?.diagnostics;
    const answer = audit.response?.answer?.trim();
    if (!d?.expression || !answer || audit.response?.didNotKnow || d.itemKind === "CHOICE") return;
    const evidence = (audit.skillEvidence ?? []).find((ev) => ev.skillId === target.skillId && ev.kind !== "SECURE");
    if (!evidence) return;
    const correct = audit.question.answerKey.canonicalAnswer;
    // Only maths the engine can read goes to the author: it has to be checkable later.
    if (!isReadable(d.expression) || !isReadable(correct)) return;
    studentItems.push({
      questionNumber: index + 1,
      prompt: audit.question.prompt.replace(d.expression, tidyExpression(d.expression)).slice(0, 200),
      expression: tidyExpression(d.expression),
      task: d.itemKind === "SIMPLIFY" ? "simplify" : "factorise",
      studentAnswer: answer.slice(0, 80),
      correctAnswer: correct,
      ...(evidence.mistake ? { mistake: evidence.mistake } : {}),
      ...(evidence.description ? { mistakeDescription: evidence.description.slice(0, 160) } : {}),
    });
  });

  const counts = new Map<string, number>();
  for (const m of target.mistakes) counts.set(m, (counts.get(m) ?? 0) + 1);
  const skill = findFactorisationSkill(target.skillId);

  return {
    studentFirstName: studentFirstName.split(" ")[0] ?? "",
    grade: 8,
    topic: "Factorisation",
    targetSkill: { id: target.skillId, name: skillName(target.skillId) },
    buildsOn: (skill?.dependsOn ?? []).map(skillName),
    mistakes: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m),
    studentItems: studentItems.slice(0, 4),
    strengths: (session.finalReport.skills ?? []).filter((s) => s.state === "SECURE").map((s) => s.name).slice(0, 6),
  };
}
