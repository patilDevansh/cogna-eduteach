import type { AuthoredCheckpoint, AuthoredLessonDraft, AuthoredScene } from "@cogna/shared";
import { openAiStudentTextModerator, studentStrings } from "../../ai/student-text-safety";
import type { OpenAIService } from "../../ai/openai.service";
import { classifyProviderError } from "../../lotus/lotus-model.service";
import { isReadable } from "../../lotus/lotus-algebra";
import type { LessonBrief } from "./lesson-brief";
import { briefFromPrompt } from "./lesson-prompt";
import { codePracticeFits, generatePractice, practiceFamilyFor } from "./practice-generator";
import { curriculumOfSkill } from "../../lotus/lotus-factorisation-catalogue";
import { taskVerdict } from "./lesson-verifier";

/** Anything that can turn an author prompt into a draft (raw JSON; the verifier decides if it's usable). */
export interface LessonAuthorModel {
  /** Shown in the audit trail and the dev line: which model wrote the lesson. */
  readonly label: string;
  author(prompt: string): Promise<unknown>;
}

/** The account refused the call (no credits, bad key): retrying won't help, so authoring stops at once. */
export class AuthorUnavailableError extends Error {}

/**
 * GPT via the Responses API in JSON mode. Same client (and daily spend cap)
 * as Lotus; the model is COGNA_LESSON_AUTHOR_MODEL, else Lotus's primary.
 */
export class OpenAiLessonAuthor implements LessonAuthorModel {
  readonly label: string;

  constructor(
    private readonly openai: OpenAIService,
    private readonly model = process.env.COGNA_LESSON_AUTHOR_MODEL?.trim() || process.env.LOTUS_OPENAI_MODEL?.trim() || "gpt-5.6-terra",
  ) {
    this.label = this.model;
  }

  get available(): boolean {
    return this.openai.isConfigured;
  }

  async author(prompt: string): Promise<unknown> {
    try {
      const response = await this.openai.getClient().responses.create(
        {
          model: this.model,
          input: prompt,
          max_output_tokens: 8000,
          reasoning: { effort: "medium" },
          text: { format: { type: "json_object" }, verbosity: "medium" },
          prompt_cache_key: "cogna-lesson-author-v1",
        },
        { timeout: 120_000 },
      );
      const content = response.output_text;
      if (!content) throw new Error("The lesson author returned an empty response.");
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      const draft: unknown = JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
      // Narration, slides and practice all reach the student: safety-check them
      // before the maths verifier even looks. A flagged draft is a failed attempt.
      const unsafe = await openAiStudentTextModerator(this.openai.getClient())(studentStrings(draft));
      if (unsafe) throw new Error(`The lesson draft was rejected: ${unsafe}`);
      return draft;
    } catch (error) {
      const outage = classifyProviderError(error);
      if (outage) throw new AuthorUnavailableError(`The AI author is unavailable: ${outage.reason}`);
      throw error;
    }
  }
}

/**
 * Deterministic stand-in for the AI author, used for fake-model sessions in
 * development and in tests. It writes a plausible lesson from the brief
 * (the student's own expression, mistake and strengths) using only maths
 * from the brief's verified answer keys and the code practice generator, so
 * the whole pipeline — prompt, verify, narrate, play, practise — runs with
 * no API credits. It is still verified like any model output.
 */
export class FakeLessonAuthor implements LessonAuthorModel {
  readonly label = "fake-lesson-author";

  async author(prompt: string): Promise<unknown> {
    const brief = briefFromPrompt(prompt);
    if (!brief) throw new Error("The fake author could not read the brief.");
    return fakeDraft(brief);
  }
}

function routineFor(skillId: string): string[] {
  const family = practiceFamilyFor(skillId);
  if (family === "trinomial") return ["Read the last sign, then the middle sign", "Find the pair that multiplies and adds", "Multiply back out to check"];
  if (family === "expand") return ["Draw one arrow to every term inside", "Keep each term's sign", "Count: one product per term"];
  return ["Find the biggest number every term shares", "Find the letters every term shares", "Multiply back out to check"];
}

/**
 * The fake author for a chapter the code practice doesn't cover (rational
 * numbers, mensuration…): an arithmetic lesson on the student's own question,
 * with practice and an exit taken from the chapter's own checked examples.
 * Null when the chapter has too few arithmetic examples to make one.
 */
function chapterFakeDraft(brief: LessonBrief): AuthoredLessonDraft | null {
  const curriculum = curriculumOfSkill(brief.targetSkill.id);
  if (!curriculum) return null;
  const own = new Set(brief.studentItems.map((i) => i.expression));
  const sums = curriculum.slots
    .filter((s) => s.kind === "NUMBER" && s.example?.check && !s.example.check.includes("=") && !own.has(s.example.check))
    .sort((a, b) => Number(b.skillId === brief.targetSkill.id) - Number(a.skillId === brief.targetSkill.id))
    .map((s) => ({ expression: s.example!.check!, answer: s.example!.answer }));
  if (sums.length < 5) return null;
  const [a, b, c, d, exit] = sums as [typeof sums[0], typeof sums[0], typeof sums[0], typeof sums[0], typeof sums[0]];
  const name = brief.studentFirstName;
  const item = brief.studentItems.find((i) => i.task === "calculate");
  const routine = ["Write the working one step at a time", "Check each step before the next", "Read the question again at the end"];
  const scenes: AuthoredScene[] = [
    { title: "Start from what you know", beats: [{ say: `${name}, let's look closely at one idea from your diagnostic.`, visual: { type: "title", text: brief.targetSkill.name } }] },
  ];
  let checkpoint: AuthoredCheckpoint = {
    afterScene: 1, afterBeat: 0, prompt: `What is ${a.expression}?`, spoken: "Quick question. Work this one out.",
    check: { task: "calculate", expression: a.expression },
    options: [{ label: a.answer, correct: true, feedback: "Yes. Every step checks out." }, { label: `${a.answer}1`, correct: false, feedback: "Not quite. Work it through one step at a time." }],
  };
  if (item && taskVerdict("calculate", item.studentAnswer, item.expression) === "INCORRECT") {
    scenes.push({
      title: "What happened",
      beats: [
        { say: `In question ${item.questionNumber}, here is your answer next to the right one.`, visual: { type: "mistake", expr: item.expression, task: "calculate", wrong: item.studentAnswer, wrongKind: "incorrect", right: item.correctAnswer, note: "Work it through one step at a time." } },
        { say: "Now work it through, one step at a time, and it lands on the right answer.", visual: { type: "steps", steps: [item.expression, item.correctAnswer], caption: "One step at a time" } },
      ],
    });
    checkpoint = {
      afterScene: 1, afterBeat: 1, prompt: `Which one is right for ${item.expression}?`, spoken: "Before we go on, which answer is right?",
      check: { task: "calculate", expression: item.expression },
      options: [{ label: item.correctAnswer, correct: true, feedback: "Yes. That's what it comes to." }, { label: item.studentAnswer, correct: false, feedback: "That was your diagnostic answer. Work it through again." }],
    };
  } else {
    scenes.push({ title: "Work it through", beats: [{ say: "Here is one worked through, one step at a time.", visual: { type: "steps", steps: [a.expression, a.answer], caption: "One step at a time" } }] });
  }
  scenes.push({ title: "Your routine", beats: [{ say: "Here is a routine to use every time. Then you'll try some on your own.", visual: { type: "rule", heading: "Your routine", lines: routine } }] });
  return {
    title: name ? `${name}, ${brief.targetSkill.name.toLowerCase()}` : brief.targetSkill.name,
    objective: `Use a step-by-step routine for ${brief.targetSkill.name.toLowerCase()}.`,
    whyThisLesson: item
      ? `Your answer to question ${item.questionNumber} showed where ${brief.targetSkill.name.toLowerCase()} goes wrong, so this lesson starts there.`
      : `Your diagnostic pointed to ${brief.targetSkill.name.toLowerCase()} as the place to start.`,
    scenes,
    checkpoints: [checkpoint],
    practice: [
      { id: "p1", format: "type-answer", prompt: `Work out ${b.expression}.`, expression: b.expression, task: "calculate", answer: b.answer, hint: "One step at a time.", workedSteps: [b.expression, b.answer] },
      { id: "p2", format: "choose", prompt: `Work out ${c.expression}.`, expression: c.expression, task: "calculate", options: [c.answer, `${c.answer}1`, `${c.answer}2`], answerIndex: 0, feedback: ["Right.", "Check each step again.", "Check each step again."] },
      { id: "p3", format: "spot-mistake", prompt: "Find the wrong line.", lines: [d.expression, d.answer, `${d.answer}1`], wrongLine: 2, fix: d.answer, explanation: `It comes to ${d.answer}: the last line copied it wrong.` },
      { id: "p4", format: "type-answer", prompt: `Work out ${a.expression}.`, expression: a.expression, task: "calculate", answer: a.answer, hint: "One step at a time.", workedSteps: [a.expression, a.answer] },
    ],
    exit: { prompt: `Work out ${exit.expression}.`, expression: exit.expression, task: "calculate", answer: exit.answer },
    learnerDecision: routine.join("; ") + ".",
    teacherDecision: `Lesson on ${brief.targetSkill.name} from the student's own answers; give one fresh item of the same form, unsupported.`,
  };
}

export function fakeDraft(brief: LessonBrief): AuthoredLessonDraft {
  if (!codePracticeFits(brief.targetSkill.id)) {
    const chapter = chapterFakeDraft(brief);
    if (chapter) return chapter;
  }
  const name = brief.studentFirstName;
  const item = brief.studentItems[0];
  const strength = brief.strengths[0];
  const practice = generatePractice(brief.targetSkill.id, `fake:${brief.targetSkill.id}:${item?.expression ?? ""}`, brief.studentItems.map((i) => i.expression));

  const scenes: AuthoredScene[] = [
    {
      title: "Start from what you know",
      beats: [
        {
          say: strength
            ? `${name}, your report says ${strength.toLowerCase()} is secure, so you already have the basics. Let's build on that.`
            : `${name}, let's look closely at one idea from your diagnostic.`,
          visual: { type: "title", text: brief.targetSkill.name },
        },
        ...(item
          ? [{ say: `In question ${item.questionNumber}, you worked on this expression.`, visual: { type: "expression" as const, expr: item.expression } }]
          : []),
      ],
    },
  ];

  const wrongVerdict = item && isReadable(item.studentAnswer) ? taskVerdict(item.task, item.studentAnswer, item.expression) : null;
  const wrongUsable = wrongVerdict === "UNFINISHED" || wrongVerdict === "INCORRECT";
  const unfinished = wrongVerdict === "UNFINISHED";
  let checkpoint: AuthoredCheckpoint;
  if (item && wrongUsable) {
    scenes.push({
      title: "What happened",
      beats: [
        {
          say: unfinished
            ? "Here is your answer next to the right one. Yours is equal to the expression, so you were on the right track, but it isn't finished: part of it still splits further."
            : "Here is your answer next to the right one. Multiply your answer back out and it does not give the expression you started with.",
          visual: {
            type: "mistake", expr: item.expression, task: item.task, wrong: item.studentAnswer,
            wrongKind: unfinished ? "unfinished" : "incorrect", right: item.correctAnswer,
            note: unfinished ? "Equal, but keep going until nothing splits further." : "Multiply back out to see which one matches.",
          },
        },
        {
          say: "Now multiply the right answer back out. Every step stays equal, and it lands exactly on the original.",
          visual: { type: "steps", steps: [item.correctAnswer, item.expression], caption: "Multiply back out to check" },
        },
      ],
    });
    checkpoint = {
      afterScene: 1, afterBeat: 1,
      prompt: `Which one is right for ${item.expression}?`,
      spoken: "Before we go on, which answer is right?",
      check: { task: item.task, expression: item.expression },
      options: [
        { label: item.correctAnswer, correct: true, feedback: "Yes. It multiplies back to the original." },
        {
          label: item.studentAnswer,
          correct: false,
          feedback: unfinished
            ? "That was your diagnostic answer. It's equal, but one part still splits further, so it isn't finished."
            : "That was your diagnostic answer. Multiply it out and compare it with the original.",
        },
      ],
    };
  } else {
    scenes.push({
      title: "How to check",
      beats: [{ say: "Whatever you write, you can always check it by multiplying it back out.", visual: { type: "title", text: "Multiply back out to check" } }],
    });
    checkpoint = {
      afterScene: 1, afterBeat: 0,
      prompt: "How can you check a factorisation?",
      spoken: "Quick question. How can you check your answer?",
      options: [
        { label: "Multiply it back out", correct: true, feedback: "Yes. If it gives the original, it's right." },
        { label: "Guess and move on", correct: false, feedback: "Not quite. Multiplying back out tells you for sure." },
      ],
    };
  }

  scenes.push({
    title: "Your routine",
    beats: [{ say: "Here is a routine to use every time. Then you'll try some on your own.", visual: { type: "rule", heading: "Your routine", lines: routineFor(brief.targetSkill.id) } }],
  });

  return {
    title: name ? `${name}, ${brief.targetSkill.name.toLowerCase()}` : brief.targetSkill.name,
    objective: `Use a routine for ${brief.targetSkill.name.toLowerCase()} and check every answer by multiplying back out.`,
    whyThisLesson: item
      ? `Your answer to question ${item.questionNumber} showed where ${brief.targetSkill.name.toLowerCase()} goes wrong, so this lesson starts there.`
      : `Your diagnostic pointed to ${brief.targetSkill.name.toLowerCase()} as the place to start.`,
    scenes,
    checkpoints: [checkpoint],
    practice: practice.items,
    exit: practice.exit,
    learnerDecision: routineFor(brief.targetSkill.id).join("; ") + ".",
    teacherDecision: `Lesson on ${brief.targetSkill.name} from the student's own answers; give one fresh item of the same form, unsupported.`,
  };
}
