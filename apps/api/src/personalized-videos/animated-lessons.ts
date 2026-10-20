import type {
  PersonalizedVideoEvidenceSnapshot,
  PersonalizedVideoExitItem,
  PersonalizedVideoLesson,
} from "@cogna/shared";
import {
  buildDistributionLesson,
  formatExpression,
  matchDistributionMistake,
  type DistributionErrorMatch,
  type DistributionLessonInput,
  type DistributionLessonProps,
  type DistributionMistake,
} from "@cogna/lesson-video";

/**
 * Evidence → animated lesson, with no model in the loop.
 *
 * A Lotus SOLID_GAP is necessary but not sufficient: at least
 * MIN_MATCHING_ITEMS independently verified-wrong answers must each be
 * exactly reproduced by the same distribution mistake (recomputed from the
 * question, see matchDistributionMistake). Only then is a lesson built — from
 * the student's own item — and it still has to pass verifyDistributionLesson.
 * Anything short of that returns null and the caller falls back to the
 * approved-template path (or abstains).
 */

const MIN_MATCHING_ITEMS = 2;

export function animatedLessonsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COGNA_ANIMATED_LESSONS_ENABLED?.trim() !== "false";
}

export interface AnimatedLessonPlan {
  animation: DistributionLessonProps;
  /** What built `animation`: rebuilt per theme by the interactive player endpoint. */
  input: DistributionLessonInput;
  lesson: PersonalizedVideoLesson;
  exit: PersonalizedVideoExitItem;
  mistake: DistributionMistake;
  matchedPrompts: string[];
  learnerDecision: string;
  teacherDecision: string;
}

const COPY: Record<DistributionMistake, { title: string; objective: string; learner: string; teacher: string; label: string }> = {
  "sign-lost": {
    title: "Carry the sign with the number",
    objective: "Keep the sign of every product when a negative number multiplies a bracket.",
    learner: "Write each signed product in full before combining; check by working the bracket first.",
    teacher: "Do not reteach the sign rules in isolation. Give one fresh negative-multiplier bracket without support next.",
    label: "lost the sign of a product",
  },
  untouched: {
    title: "One arrow for every term",
    objective: "Multiply the number outside a bracket into every term inside it.",
    learner: "Count the terms inside, draw one arrow per term, then check by substituting.",
    teacher: "Give one fresh two-bracket expansion without support next.",
    label: "left a term inside the bracket unmultiplied",
  },
};

/** Items the lesson can draw: brackets only, at most two of them. */
function drawable(match: DistributionErrorMatch): boolean {
  return match.expression.extras.length === 0 && match.expression.groups.length <= 2;
}

export function planAnimatedLesson(
  snapshot: PersonalizedVideoEvidenceSnapshot,
  studentName: string,
): AnimatedLessonPlan | null {
  if (snapshot.lotusOutcome !== "SOLID_GAP") return null;

  const matches = (snapshot.verifiedObservations ?? [])
    .filter((o) => o.independent && o.verificationStatus === "VERIFIED_INCORRECT")
    .map((o) => matchDistributionMistake(o.questionText, o.submittedText))
    .filter((m): m is DistributionErrorMatch => m !== null);

  const byMistake = new Map<DistributionMistake, DistributionErrorMatch[]>();
  for (const m of matches) byMistake.set(m.mistake, [...(byMistake.get(m.mistake) ?? []), m]);
  const [mistake, supporting] =
    [...byMistake.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!mistake || !supporting || supporting.length < MIN_MATCHING_ITEMS) return null;
  // Two different mistakes both well-supported is conflicting evidence, not one gap.
  if ([...byMistake.values()].filter((list) => list.length >= MIN_MATCHING_ITEMS).length > 1) return null;

  for (const item of supporting.filter(drawable)) {
    let animation: DistributionLessonProps;
    const input: DistributionLessonInput = {
      studentName,
      variable: item.expression.variable,
      groups: item.expression.groups,
      studentProducts: item.studentProducts,
    };
    try {
      animation = buildDistributionLesson(input);
    } catch {
      continue; // verification refused this item; try the next one
    }
    const copy = COPY[mistake];
    const v = animation.variable || "x";
    const lesson: PersonalizedVideoLesson = {
      title: studentName ? `${studentName}, ${copy.title.charAt(0).toLowerCase()}${copy.title.slice(1)}` : copy.title,
      duration: `About ${Math.max(1, Math.round(animation.scenes.flatMap((s) => s.beats).reduce((t, b) => t + b.seconds, 0) / 60))} min`,
      objective: copy.objective,
      generationReason: `Animated from ${supporting.length} diagnostic answers that each ${copy.label}: ${supporting
        .map((m) => m.prompt.replace(/\s*Show your steps\.?/i, ""))
        .join(" · ")}`,
      verification:
        "Every number was computed in code. The taught expansion equals the original expression, the check exposes the original answer, and the exit item is new.",
      scenes: animation.scenes.map((scene) => ({
        eyebrow: animation.topic,
        headline: scene.title,
        equation: [{ text: formatExpression(animation.groups, v) }],
        narration: scene.beats.map((b) => b.text).join(" "),
        durationSeconds: Math.ceil(scene.beats.reduce((t, b) => t + b.seconds, 0)),
        accent: "green" as const,
      })),
    };
    return {
      animation,
      input,
      lesson,
      exit: {
        prompt: `${animation.exit.prompt} Show your steps.`,
        expected: animation.exit.expected,
        evidencePurpose: "A fresh item with the same trap, answered without support: does the habit transfer?",
      },
      mistake,
      matchedPrompts: supporting.map((m) => m.prompt),
      learnerDecision: copy.learner,
      teacherDecision: copy.teacher,
    };
  }
  return null;
}
