import type { AuthoredCheckpoint, AuthoredLessonDraft, AuthoredScene } from "@cogna/shared";
import type { OpenAIService } from "../../ai/openai.service";
import { classifyProviderError } from "../../lotus/lotus-model.service";
import { isReadable } from "../../lotus/lotus-algebra";
import type { LessonBrief } from "./lesson-brief";
import { briefFromPrompt } from "./lesson-prompt";
import { generatePractice, practiceFamilyFor } from "./practice-generator";
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
      return JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
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

export function fakeDraft(brief: LessonBrief): AuthoredLessonDraft {
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
