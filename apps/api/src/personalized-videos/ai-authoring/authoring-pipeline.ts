import type { AuthoredLessonProps } from "@cogna/lesson-video";
import { answerFromPicks } from "../../interaction-formats/tile-builder";
import type {
  AuthoredLessonDraft,
  AuthoredScene,
  AuthoredVisual,
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
import { pretty } from "../micro-lessons";

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

const num = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
/** Terms written as one sum: ["2x", "-5"] → "2x − 5". */
const sum = (terms: string[]) => pretty(terms.map((t, i) => (i === 0 || /^\s*-/.test(t) ? t : `+ ${t}`)).join(" "));

/**
 * The maths lines a slide shows for one scene, taken from its beats' visuals
 * (each one already passed the verifier). Visuals with no maths claim add nothing.
 */
export function sceneEquationLines(scene: AuthoredScene): Array<{ text: string }> {
  const lines: string[] = [];
  for (const { visual: v } of scene.beats) {
    switch (v.type) {
      case "expression": lines.push(pretty(v.expr)); break;
      case "steps": lines.push(...v.steps.map(pretty)); break;
      case "distribute": lines.push(`${pretty(v.outside)}(${sum(v.inside)})`, sum(v.result)); break;
      case "common-factor": lines.push(sum(v.terms), `${pretty(v.factor)}(${sum(v.remaining)})`); break;
      case "pair-search": lines.push(`${num(v.answer[0])} × ${num(v.answer[1])} = ${num(v.product)}`, `${num(v.answer[0])} + ${num(v.answer[1])} = ${num(v.sum)}`); break;
      case "mistake": lines.push(pretty(v.expr), `✗ ${pretty(v.wrong)}`, `✓ ${pretty(v.right)}`); break;
      case "tiles": lines.push(`x² + ${v.b}x + ${v.c} = (x + ${v.sides[0]})(x + ${v.sides[1]})`); break;
      default: break;
    }
  }
  return [...new Set(lines)].slice(0, 4).map((text) => ({ text }));
}

/** A beat's picture as a slide draws it: maths formatted for reading; the diagram kinds as a column of their maths lines. */
function slideVisual(v: AuthoredVisual): SlideVisual | null {
  switch (v.type) {
    case "title": return null;
    case "expression": return { type: "expression", expr: pretty(v.expr), caption: v.caption };
    case "mistake": return { ...v, expr: pretty(v.expr), wrong: pretty(v.wrong), right: pretty(v.right) };
    case "rule": case "shape": case "chart": case "grid": return v;
    case "steps": return { type: "steps", steps: v.steps.map(pretty), caption: v.caption };
    default: {
      const steps = sceneEquationLines({ beats: [{ visual: v }] } as AuthoredScene).map((l) => l.text);
      return steps.length ? { type: "steps", steps, caption: "caption" in v ? v.caption : undefined } : null;
    }
  }
}

/**
 * The slides draw an AI-written lesson beat by beat: each beat's picture, timed to the
 * narration, with its spoken line as the caption. Rows stored before slide maths existed
 * also get their `equation` lines (for the transcript) filled here.
 */
export function withBeatEquations(lesson: PersonalizedVideoLesson, animation: Pick<AuthoredLessonProps, "scenes"> | undefined): PersonalizedVideoLesson {
  if (!animation?.scenes?.length) return lesson;
  return {
    ...lesson,
    scenes: lesson.scenes.map((scene, i) => {
      const beats = (animation.scenes[i]?.beats ?? []) as Array<{ visual: AuthoredVisual; seconds?: number; text?: string }>;
      if (!beats.length) return scene;
      let at = 0;
      const visuals = beats.map((b) => {
        const start = at;
        const seconds = b.seconds ?? 6;
        at += seconds;
        return { at: Math.round(start * 10) / 10, seconds, say: b.text ?? "", visual: b.visual ? slideVisual(b.visual) : null };
      });
      const equation = scene.equation.length ? scene.equation : sceneEquationLines({ beats } as unknown as AuthoredScene);
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
        equation: sceneEquationLines(scene),
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
    case "factor-safe": {
      const { answer: _a, ...rest } = item;
      return rest;
    }
    case "build": {
      const { answer: _a, workedSteps: _s, ...rest } = item;
      return rest;
    }
    case "rectangle": {
      const { answer: _a, ...rest } = item;
      return rest;
    }
    case "mark-it":
      return { ...item, papers: item.papers.map((p) => ({ question: p.question, bitAnswer: p.bitAnswer })) };
    case "rush":
      return { ...item, rounds: item.rounds.map((r) => ({ expression: r.expression, options: r.options })) };
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
    case "factor-safe": {
      if (!("pair" in answer) || !Array.isArray(answer.pair) || !answer.pair.every(Number.isInteger)) return result("UNREADABLE", "Set both dials first.");
      const [a, b] = answer.pair;
      const reveal = { answer: `(${linear(item.answer[0])})(${linear(item.answer[1])})`, steps: [`${fmt(item.answer[0])} × ${fmt(item.answer[1])} = ${fmt(item.product)}`, `${fmt(item.answer[0])} + ${fmt(item.answer[1])} = ${fmt(item.sum)}`] };
      if (a * b === item.product && a + b === item.sum) return result("CORRECT", `Unlocked: ${fmt(a)} and ${fmt(b)} multiply to ${fmt(item.product)} and add to ${fmt(item.sum)}.`, reveal);
      if (a * b === item.product && a + b === -item.sum) return result("INCORRECT", `So close: the product is right, but they add to ${fmt(a + b)}, not ${fmt(item.sum)}. Flip both signs.`, reveal);
      if (a * b === item.product) return result("INCORRECT", `The product lamp is on, but they add to ${fmt(a + b)}, not ${fmt(item.sum)}.`, reveal);
      return result("INCORRECT", `They multiply to ${fmt(a * b)}, not ${fmt(item.product)}.`, reveal);
    }
    case "rectangle": {
      if (!("pair" in answer) || !Array.isArray(answer.pair) || !answer.pair.every(Number.isInteger)) return result("UNREADABLE", "Move the strips first.");
      const [side, bottom] = answer.pair;
      const spaces = side * bottom;
      const reveal = { answer: `(x + ${item.answer[0]})(x + ${item.answer[1]})`, steps: [`${item.answer[0]} + ${item.answer[1]} = ${item.strips} strips`, `${item.answer[0]} × ${item.answer[1]} = ${item.units} small squares`] };
      if (side + bottom !== item.strips) return result("UNREADABLE", `Use all ${item.strips} strips.`);
      if (spaces === item.units) return result("CORRECT", `It fits: ${side} × ${bottom} = ${item.units}. The sides are x + ${side} and x + ${bottom}.`, reveal);
      if (bottom === 0 || side === 0) return result("INCORRECT", `Move some strips to the other side to make a corner for the ${item.units} small squares.`, reveal);
      return result("INCORRECT", spaces < item.units
        ? `${side} × ${bottom} = ${spaces} spaces, but there are ${item.units} small squares: ${item.units - spaces} left over.`
        : `${side} × ${bottom} = ${spaces} spaces, but only ${item.units} small squares: ${spaces - item.units} hole${spaces - item.units === 1 ? "" : "s"}.`, reveal);
    }
    case "mark-it": {
      if (!("paper" in answer) || !item.papers[answer.paper]) return result("UNREADABLE", "Pick a paper to mark.");
      const paper = item.papers[answer.paper]!;
      const stamped = answer.mark;
      if (stamped !== "right" && stamped !== "wrong") return result("UNREADABLE", "Stamp it right or wrong.");
      if (stamped !== paper.verdict) {
        return result("INCORRECT", paper.verdict === "right" ? `Are you sure? Multiply it back out: ${paper.learn.replace(/ I was right!$/, "")}` : "My teacher says there's a mistake in this one. Can you find it?");
      }
      if (paper.verdict === "right") return result("CORRECT", paper.learn);
      if (!answer.reason) return result("UNFINISHED", "Right, it's wrong! What went wrong?");
      if (paper.reasons.includes(answer.reason)) return result("CORRECT", paper.learn);
      return result("INCORRECT", attempt > 1 ? "Multiply Bit's answer back out and compare it with the question." : "Not that one. Look again.");
    }
    case "rush": {
      if (!("round" in answer) || !item.rounds[answer.round] || !Number.isInteger(answer.option)) return result("UNREADABLE", "Tap an answer.");
      const round = item.rounds[answer.round]!;
      if (!round.options[answer.option]) return result("UNREADABLE", "Tap an answer.");
      const reveal = { answer: round.options[round.answerIndex]!, steps: [] };
      if (answer.option === round.answerIndex) return result("CORRECT", round.why[answer.option] ?? "", reveal);
      return { ...result("INCORRECT", `${round.why[answer.option] ?? ""} It was ${round.options[round.answerIndex]}.`), reveal };
    }
    case "build": {
      if (!("picks" in answer)) return result("UNREADABLE", "Fill the boxes with tiles first.");
      const built = answerFromPicks(item.interaction, { format: item.interaction.format, picks: answer.picks });
      if (!built) return result("UNREADABLE", "Fill every box with a tile first.");
      const verdict = taskVerdict(item.task, built, item.expression);
      const reveal = { answer: item.answer, steps: item.workedSteps };
      if (verdict === "CORRECT") return result("CORRECT", "Built it. It multiplies back to the original.", reveal);
      if (verdict === "UNFINISHED") return result("UNFINISHED", "That's equal, but it isn't finished: one part still splits.", reveal);
      return result("INCORRECT", "Multiply it back out: it doesn't give the original. Check each sign.", reveal);
    }
  }
}

const linear = (n: number) => (n < 0 ? `x − ${-n}` : `x + ${n}`);
