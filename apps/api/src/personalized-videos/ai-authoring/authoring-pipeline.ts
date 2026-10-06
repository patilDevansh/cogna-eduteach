import { prettyMath, type AuthoredLessonProps } from "@cogna/lesson-video";
import type {
  AuthoredLessonDraft,
  AuthoredVisual,
  EquationStep,
  SlideVisual,
  LotusSessionView,
  PersonalizedVideoExitItem,
  PersonalizedVideoLesson,
  PracticeAnswer,
  PracticeCheckResult,
  PracticeItem,
  PracticeItemView,
} from "@cogna/shared";
import type { OpenAIService } from "../../ai/openai.service";
import { FakeLessonAuthor, OpenAiLessonAuthor, type LessonAuthorModel } from "./author-models";
import type { LessonBrief } from "./lesson-brief";
import { taskVerdict } from "./lesson-verifier";

/**
 * Glue between the lesson service and the AI author: which author to use,
 * what the student sees while it writes, and the server-side practice
 * checker (answers never leave the server).
 */

/** COGNA_AI_LESSONS=false turns AI authoring off; lessons then come only from recipes. */
export function aiLessonsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COGNA_AI_LESSONS?.trim().toLowerCase() !== "false";
}

/**
 * Sessions the fake diagnostic model produced get the fake author (free,
 * deterministic) outside production; everything else gets GPT when a key is
 * configured. Null means no author: the recipe lesson (if any) is used.
 */
export function chooseAuthor(session: LotusSessionView, openai: OpenAIService | undefined, env: NodeJS.ProcessEnv = process.env): LessonAuthorModel | null {
  const fakeSession = session.modelConfiguration?.primary?.startsWith("fake-e2e");
  if (fakeSession) return env.NODE_ENV === "production" ? null : new FakeLessonAuthor();
  if (env.COGNA_LESSON_AUTHOR?.trim() === "fake" && env.NODE_ENV !== "production") return new FakeLessonAuthor();
  return openai?.isConfigured ? new OpenAiLessonAuthor(openai) : null;
}

/** What the student sees while the AI writes (replaced as soon as a verified draft lands). */
export function placeholderLesson(brief: LessonBrief): PersonalizedVideoLesson {
  return {
    title: brief.studentFirstName ? `${brief.studentFirstName}, your lesson on ${brief.targetSkill.name.toLowerCase()}` : brief.targetSkill.name,
    duration: "About 2 min",
    objective: `Work on ${brief.targetSkill.name.toLowerCase()}, starting from your own answers.`,
    generationReason: "Being written from your diagnostic answers, then every step is checked.",
    verification: "Every equation is checked by Cogna's algebra engine before you see it.",
    scenes: [],
  };
}

/** What a slide shows for one beat's picture, ready to read (titles show nothing: the slide's headline covers them). */
function visualLines(v: AuthoredVisual): string[] {
  const m = prettyMath;
  const sum = (terms: string[]) => terms.map(m).join(" + ");
  switch (v.type) {
    case "title": return [];
    case "expression": return [m(v.expr)];
    case "steps": return v.steps.map(m);
    case "distribute": return [`${m(v.outside)}(${sum(v.inside)})`, sum(v.result)];
    case "area": return [`(${sum(v.rows)})(${sum(v.cols)})`, sum(v.cells.flat())];
    case "pair-search": return [`${v.answer[0]} × ${v.answer[1]} = ${v.product}`, `${v.answer[0]} + ${v.answer[1]} = ${v.sum}`];
    case "common-factor": return [sum(v.terms), `${m(v.factor)}(${sum(v.remaining)})`];
    case "mistake": return [`${m(v.wrong)} ✗`, `${m(v.right)} ✓`];
    case "rule": return v.lines;
  }
}

/** A beat's picture as a slide draws it: maths formatted for reading, the diagram kinds shown as a column of steps. */
function slideVisual(v: AuthoredVisual): SlideVisual | null {
  const m = prettyMath;
  switch (v.type) {
    case "title": return null;
    case "expression": return { type: "expression", expr: m(v.expr), caption: v.caption };
    case "mistake": return { ...v, expr: m(v.expr), wrong: m(v.wrong), right: m(v.right) };
    case "rule": return v;
    case "steps": return { type: "steps", steps: v.steps.map(m), caption: v.caption };
    default: return { type: "steps", steps: visualLines(v) };
  }
}

/**
 * Slides read `lesson.scenes[i]`; an AI-written lesson keeps its maths in the animation's
 * beats instead. This gives each slide its beats' pictures (timed to the narration) and a
 * plain `equation` for the transcript, for rows stored before this existed too. Slides
 * that already have maths are left alone.
 */
export function withBeatEquations(lesson: PersonalizedVideoLesson, animation: Pick<AuthoredLessonProps, "scenes"> | undefined): PersonalizedVideoLesson {
  if (!animation?.scenes?.length) return lesson;
  return {
    ...lesson,
    scenes: lesson.scenes.map((scene, i) => {
      if (scene.equation.length) return scene;
      const beats = (animation.scenes[i]?.beats ?? []) as Array<{ visual?: AuthoredVisual; seconds?: number; text?: string }>;
      const equation: EquationStep[] = beats.flatMap((b) => (b.visual ? visualLines(b.visual) : [])).map((text) => ({ text }));
      let at = 0;
      const visuals = beats.map((b) => {
        const start = at;
        const seconds = b.seconds ?? 6;
        at += seconds;
        return { at: Math.round(start * 10) / 10, seconds, say: b.text ?? "", visual: b.visual ? slideVisual(b.visual) : null };
      });
      return { ...scene, equation, visuals };
    }),
  };
}

/** The lesson summary and exit item stored for a verified draft. */
export function summaryFromDraft(draft: AuthoredLessonDraft, seconds: number): { lesson: PersonalizedVideoLesson; exit: PersonalizedVideoExitItem } {
  return {
    lesson: {
      title: draft.title,
      duration: `About ${Math.max(1, Math.round(seconds / 60))} min`,
      objective: draft.objective,
      generationReason: draft.whyThisLesson,
      verification: "Written by AI from your answers; every equation was checked by Cogna's algebra engine before you saw it.",
      scenes: draft.scenes.map((scene) => ({
        eyebrow: "Your lesson",
        headline: scene.title,
        equation: [],
        narration: scene.beats.map((b) => b.say).join(" "),
        durationSeconds: Math.ceil(scene.beats.length * 6),
        accent: "green" as const,
      })),
    },
    exit: {
      prompt: draft.exit.prompt.replace(/\s+/g, "").includes(draft.exit.expression.replace(/\s+/g, ""))
        ? draft.exit.prompt
        : `${draft.exit.prompt} ${draft.exit.expression}`,
      expected: draft.exit.answer,
      evidencePurpose: "A fresh item of the same kind, answered without support.",
    },
  };
}

/** Practice as the browser sees it: no answers, fixes or worked steps. */
export function practiceItemView(item: PracticeItem): PracticeItemView {
  switch (item.format) {
    case "pair-hunt": {
      const { answer: _a, ...rest } = item;
      return rest;
    }
    case "spot-mistake": {
      const { wrongLine: _w, fix: _f, explanation: _e, ...rest } = item;
      return rest;
    }
    case "choose": {
      const { answerIndex: _i, feedback: _f, ...rest } = item;
      return rest;
    }
    case "type-answer": {
      const { answer: _a, workedSteps: _s, ...rest } = item;
      return rest;
    }
  }
}

const fmt = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

/** Checks one practice answer. `attempt` counts this try (1-based); the answer is revealed on success or after two misses. */
export function checkPracticeAnswer(item: PracticeItem, answer: PracticeAnswer, attempt: number): PracticeCheckResult {
  const result = (verdict: PracticeCheckResult["verdict"], feedback: string, reveal?: PracticeCheckResult["reveal"]): PracticeCheckResult => ({
    itemId: item.id,
    verdict,
    feedback,
    attempt,
    ...(reveal && (verdict === "CORRECT" || attempt >= 2) ? { reveal } : {}),
  });

  switch (item.format) {
    case "pair-hunt": {
      if (!("pair" in answer) || !Array.isArray(answer.pair)) return result("UNREADABLE", "Pick one of the pairs.");
      const [a, b] = answer.pair;
      const reveal = { answer: `${fmt(item.answer[0])} and ${fmt(item.answer[1])}`, steps: [`${fmt(item.answer[0])} × ${fmt(item.answer[1])} = ${fmt(item.product)}`, `${fmt(item.answer[0])} + ${fmt(item.answer[1])} = ${fmt(item.sum)}`] };
      if (a * b === item.product && a + b === item.sum) return result("CORRECT", `Yes: they multiply to ${fmt(item.product)} and add to ${fmt(item.sum)}.`, reveal);
      if (a * b === item.product) return result("INCORRECT", `They multiply to ${fmt(item.product)}, but add to ${fmt(a + b)}, not ${fmt(item.sum)}. Check the signs.`, reveal);
      return result("INCORRECT", `Those multiply to ${fmt(a * b)}, not ${fmt(item.product)}.`, reveal);
    }
    case "spot-mistake": {
      if (!("line" in answer) || !Number.isInteger(answer.line)) return result("UNREADABLE", "Tap the line that goes wrong.");
      const reveal = { answer: item.fix, steps: [item.explanation] };
      if (answer.line === item.wrongLine) return result("CORRECT", item.explanation, reveal);
      if (answer.line < item.wrongLine) return result("INCORRECT", "That line is still right. Look further down.", reveal);
      return result("INCORRECT", "The mistake happens earlier than that.", reveal);
    }
    case "choose": {
      if (!("option" in answer) || !item.options[answer.option]) return result("UNREADABLE", "Pick one of the answers.");
      const reveal = { answer: item.options[item.answerIndex]!, steps: [] };
      if (answer.option === item.answerIndex) return result("CORRECT", item.feedback[answer.option] ?? "", reveal);
      // Equal-but-unfinished picks are told apart from wrong ones, by algebra rather than by the option's feedback text.
      const verdict = taskVerdict(item.task, item.options[answer.option]!, item.expression);
      return result(verdict === "UNFINISHED" ? "UNFINISHED" : "INCORRECT", item.feedback[answer.option] ?? "", reveal);
    }
    case "type-answer": {
      if (!("text" in answer) || !answer.text.trim()) return result("UNREADABLE", "Type your answer first.");
      const verdict = taskVerdict(item.task, answer.text, item.expression);
      const reveal = { answer: item.answer, steps: item.workedSteps };
      if (verdict === "CORRECT") return result("CORRECT", "Correct, and it multiplies back to the original.", reveal);
      if (verdict === "UNFINISHED") return result("UNFINISHED", item.task === "factorise" ? "That's equal, but it isn't finished: something common is still inside a bracket." : "That's equal, but finish it off.", reveal);
      if (verdict === "UNREADABLE") return result("UNREADABLE", "I couldn't read that. Write it like (x - 3)(x - 4).");
      return result("INCORRECT", `Not quite. ${item.hint}`, reveal);
    }
  }
}
