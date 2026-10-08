/**
 * Writes one question for a planned topic with the AI, then proves it with code
 * before anything can use it:
 *  - the answer is equal to the expression and fully factorised or expanded (exact algebra, not sampling)
 *  - a number answer is re-derived from the writer's own arithmetic check
 *  - every predicted wrong answer really is wrong, or equal-but-unfinished with an "unfinished" mistake
 *  - the question text actually shows the expression
 *  - multiple-choice and number questions are solved blind by a second AI, and must agree
 * A question that fails any check is rejected and retried; if every attempt
 * fails, no question is installed. The diagnostic remains in preparation.
 */
import type { LotusQuestion } from "@cogna/shared";
import { normalizeMathText, sameNumber } from "./lotus-algebra";
import {
  type SlotSpec,
  assertFixedItemIsValid,
  curriculumOfSkill,
  dependsOnTransitively,
  findSkill,
  skillName,
} from "./lotus-factorisation-catalogue";

type Item = Omit<LotusQuestion, "id">;

export interface WriteRequest {
  spec: SlotSpec;
  purpose: "BASE" | "CHECK" | "AVOID";
  /** Per-session nonce so the model cannot deterministically replay the same opener across sessions. */
  variation?: string;
  /** For Q1, the AI must write this fresh numerical instance rather than falling back to the stock example. */
  requiredExpression?: string;
  /** For a CHECK: the mistake the student made, so the new question can catch it again in a different form. */
  targetMistake?: string;
  /** For an AVOID rewrite: a confirmed gap this question must not depend on. */
  avoidSkill?: string;
  /** Expressions and prompts already in this student's test. */
  avoid: string[];
}

export interface WriteResult {
  item: Item | null;
  attempts: number;
  ms: number;
  rejections: string[];
}

export interface QuestionWriterModels {
  writeQuestion(prompt: string): Promise<Record<string, unknown>>;
  solveBlind(prompt: string): Promise<Record<string, unknown>>;
}

const MAX_ATTEMPTS = 2;

function makerPrompt(req: WriteRequest): string {
  const { spec } = req;
  const curriculum = curriculumOfSkill(spec.skillId);
  const topicName = (curriculum?.name ?? "Factorisation").toLowerCase();
  const isFactorisation = !curriculum || curriculum.topic === "FACTORISATION";
  const minWrong = Math.min(2, spec.mistakes.length);
  const lines = [
    `You write ONE diagnostic maths question for a Grade 8 CBSE student taking a ${topicName} diagnostic.`,
    "",
    `Skill tested: ${spec.skillId} — ${skillName(spec.skillId)}`,
    `Difficulty: ${spec.level}`,
    // Keep the requested planning role explicit even when a CHECK has no
    // single named predicted mistake. That makes the constraint legible to
    // the writer and lets the deterministic browser adapter exercise every
    // checked rewrite, not only ones with a mistake-code label.
    `Generation purpose: ${req.purpose}`,
    `Follow this shape, but write a NEW question with DIFFERENT numbers: ${spec.shape}`,
  ];
  if (spec.note) lines.push(`Requirement: ${spec.note}.`);
  if (spec.example) lines.push(`Its answer was: ${spec.example.answer}${spec.example.options ? ` (options: ${spec.example.options.join(" | ")})` : ""}. Yours must differ.`);
  if (req.purpose === "CHECK" && req.targetMistake) {
    lines.push(`This question re-checks a suspected mistake: ${req.targetMistake}. Test the same skill in a different form, so a student with that misconception would make it again and a student who only slipped would not.`);
  }
  if (req.purpose === "AVOID" && req.avoidSkill) {
    lines.push(`The student has a confirmed gap in ${skillName(req.avoidSkill)}. This question must test ${skillName(spec.skillId)} WITHOUT needing ${skillName(req.avoidSkill)} at any step.`);
  }
  if (req.avoid.length) lines.push(`Do not reuse any of these: ${req.avoid.slice(-20).join(" | ")}`);
  if (req.variation) {
    lines.push(`Session variation token: ${req.variation}. Use it only to choose a fresh numerical instance; never print or mention the token.`);
    lines.push("This must be a genuinely different instance from questions generated in other sessions, not the stock example 8x + 12.");
  }
  if (req.requiredExpression) {
    lines.push(`For this session's opener, the expression MUST be exactly: ${req.requiredExpression}. Write the full question and solution for this expression.`);
  }
  lines.push(
    "",
    `Mistakes this question must be able to catch — give at least ${minWrong} wrong answer(s), each EXACTLY what a student making that mistake would write:`,
    ...spec.mistakes.map((m) => `- ${m}${curriculum?.mistakeNotes[m] ? `: ${curriculum.mistakeNotes[m]}` : ""}`),
    "",
    "Rules:",
    `- One clear task. The student-facing prompt is ${isFactorisation ? 25 : 40} words or fewer. Describe any figure, table or graph in words: the student sees no picture.`,
    isFactorisation
      ? "- Grade 8 numbers: whole numbers, coefficients up to 12, constants up to 50."
      : "- Grade 8 numbers a student can work without a calculator. Use Indian contexts (₹, km, Indian names) where a story helps.",
    "- Machine fields use plain ASCII maths: ^ for powers, no unicode, e.g. 2x^2(5 - 9x + 7x^2).",
    `- Tag every solution step with the skill it uses. Allowed skills: ${[spec.skillId, ...spec.tagged].join(", ")} (or another skill id from the ${topicName} map if a step genuinely needs it).`,
  );
  if (spec.kind === "CHOICE") {
    lines.push(
      "- Multiple choice with exactly 4 options. Exactly one is correct.",
      "Return JSON only:",
      '{"prompt": "...", "options": ["...", "...", "...", "..."], "correctOption": "<exact text>", "wrongOptionMistakes": [{"option": "<exact text>", "mistake": "<CODE>"}], "steps": [{"line": "...", "skill": "<SKILL_ID>"}]}',
    );
  } else if (spec.kind === "NUMBER") {
    lines.push(
      '- "answer" is a single number or fraction such as 36, -3/2 or 37.5: no units or words. Every wrong answer is a number too.',
      '- "check" is plain ASCII arithmetic whose value is the answer, e.g. "(1250 - 1000) / 1250 * 100", or an equation in x that the answer solves, e.g. "3*(x - 4) = 18". Code evaluates it.',
      "Return JSON only:",
      '{"prompt": "...", "answer": "...", "check": "...", "wrongAnswers": [{"answer": "...", "mistake": "<CODE>"}], "steps": [{"line": "...", "skill": "<SKILL_ID>"}]}',
    );
  } else {
    lines.push(
      spec.kind === "EXPAND"
        ? '- "expression" is exactly what the student must expand or simplify, and the prompt MUST show it. "answer" is the result with no brackets and like terms collected, e.g. 2a^2 + 7a - 15.'
        : spec.kind === "SIMPLIFY"
        ? '- "expression" is the division to simplify, as (numerator)/(denominator). The prompt MUST show the full division, e.g. "Simplify fully: (x^2 - 9) / (x^2 - 6x + 9)". "answer" is the fully simplified result.'
        : '- "expression" is exactly what the student must factorise, and the prompt MUST show it. "answer" is the FULLY factorised form, written as a product.',
      "Return JSON only:",
      '{"prompt": "...", "expression": "...", "answer": "...", "wrongAnswers": [{"answer": "...", "mistake": "<CODE>"}], "steps": [{"line": "...", "skill": "<SKILL_ID>"}]}',
    );
  }
  return lines.join("\n");
}

function blindPrompt(item: Item): string {
  if (item.answerKey.diagnostics?.itemKind === "NUMBER") {
    return [
      "You are a careful Grade 8 maths student. Answer this question.",
      `Question: ${item.prompt}`,
      'Return JSON only: {"answer": "<just the number or fraction, no units>"}',
    ].join("\n");
  }
  return [
    "You are a careful Grade 8 maths student. Answer this multiple-choice question.",
    `Question: ${item.prompt}`,
    "Options:",
    ...(item.options ?? []).map((o) => `- ${o}`),
    'Return JSON only: {"choice": "<exact text of the option you choose>"}',
  ].join("\n");
}

function str(v: unknown): string | null { return typeof v === "string" && v.trim() ? v.trim() : null; }

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Students read x², not x^2. Only text the student sees is changed; the checker reads both the same way. */
export function prettyPowers(text: string): string {
  return text.replace(/\^(\d+)/g, (_, digits: string) => [...digits].map((d) => SUPERSCRIPT_DIGITS[Number(d)]).join(""));
}

/** Turns the writer's JSON into an item, taking skill tags from the plan rather than trusting the model. */
function toItem(req: WriteRequest, raw: Record<string, unknown>): Item | string {
  const { spec } = req;
  const rawPrompt = str(raw.prompt);
  if (!rawPrompt) return "no prompt";
  const prompt = prettyPowers(rawPrompt);
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const stepLines: string[] = [];
  const stepSkills: string[] = [];
  for (const s of steps) {
    if (!s || typeof s !== "object") continue;
    const line = str((s as Record<string, unknown>).line);
    if (!line) continue;
    const skill = str((s as Record<string, unknown>).skill);
    stepLines.push(line);
    stepSkills.push(skill && findSkill(skill) ? skill : spec.skillId);
  }
  if (!stepLines.length) return "no worked steps";
  const base = {
    phase: spec.phase,
    subtopic: skillName(spec.skillId),
    prompt,
    purpose: `${req.purpose === "CHECK" ? "Re-check" : "Test"}: ${skillName(spec.skillId)}`,
  };
  if (spec.kind === "CHOICE") {
    // Options, the key and the predicted wrong options are all reformatted the same way, so they still match exactly.
    const options = Array.isArray(raw.options) ? raw.options.filter((o): o is string => typeof o === "string").map(prettyPowers) : [];
    const rawCorrect = str(raw.correctOption);
    const correct = rawCorrect ? prettyPowers(rawCorrect) : null;
    if (!correct) return "no correct option";
    const wrong = Array.isArray(raw.wrongOptionMistakes) ? raw.wrongOptionMistakes : [];
    return {
      ...base, type: "MULTIPLE_CHOICE", options, asksForWorking: false,
      answerKey: {
        kind: "MULTIPLE_CHOICE", canonicalAnswer: correct, workedSolution: stepLines,
        diagnostics: {
          itemKind: "CHOICE", skillId: spec.skillId, taggedSkills: spec.tagged, stepSkills, slot: spec.slot, level: spec.level, origin: "AI", provenance: "AI_GENERATED_FOR_SESSION",
          predictedMistakes: wrong.flatMap((w) => {
            const option = str((w as Record<string, unknown>)?.option); const mistake = str((w as Record<string, unknown>)?.mistake);
            return option && mistake ? [{ answer: prettyPowers(option), mistake }] : [];
          }),
        },
      },
    };
  }
  const wrong = Array.isArray(raw.wrongAnswers) ? raw.wrongAnswers : [];
  const predictedMistakes = wrong.flatMap((w) => {
    const a = str((w as Record<string, unknown>)?.answer); const mistake = str((w as Record<string, unknown>)?.mistake);
    return a && mistake ? [{ answer: a, mistake }] : [];
  });
  if (spec.kind === "NUMBER") {
    const answer = str(raw.answer);
    const check = str(raw.check);
    if (!answer || !check) return "missing answer or check";
    return {
      ...base, type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
      answerKey: {
        kind: "OPEN_RESPONSE", canonicalAnswer: answer, workedSolution: stepLines,
        diagnostics: {
          itemKind: "NUMBER", check, skillId: spec.skillId, taggedSkills: spec.tagged, stepSkills, slot: spec.slot, level: spec.level, origin: "AI", provenance: "AI_GENERATED_FOR_SESSION",
          predictedMistakes,
        },
      },
    };
  }
  const expression = str(raw.expression);
  const answer = str(raw.answer);
  if (!expression || !answer) return "missing expression or answer";
  return {
    ...base, type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
    answerKey: {
      kind: "OPEN_RESPONSE", canonicalAnswer: answer, workedSolution: stepLines,
      diagnostics: {
        itemKind: spec.kind, expression, skillId: spec.skillId, taggedSkills: spec.tagged, stepSkills, slot: spec.slot, level: spec.level, origin: "AI", provenance: "AI_GENERATED_FOR_SESSION",
        predictedMistakes,
      },
    },
  };
}

/** Deterministic checks applied to every AI-written item. Empty = accepted. */
export function checkWrittenItem(req: WriteRequest, item: Item): string[] {
  const reasons: string[] = [];
  try { assertFixedItemIsValid(item, "item"); } catch (e) { reasons.push(e instanceof Error ? e.message.replace(/^item: /, "") : String(e)); }
  const d = item.answerKey.diagnostics!;
  const minWrong = Math.min(2, req.spec.mistakes.length);
  if (d.predictedMistakes.length < minWrong) reasons.push(`only ${d.predictedMistakes.length} predicted wrong answer(s), need ${minWrong}`);
  for (const p of d.predictedMistakes) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(p.mistake)) reasons.push(`mistake "${p.mistake}" is not a code`);
  }
  const print = normalizeMathText(d.expression ?? item.prompt).toLowerCase();
  if (req.requiredExpression && print !== normalizeMathText(req.requiredExpression).toLowerCase()) {
    reasons.push(`uses ${d.expression ?? item.prompt} instead of the required fresh opener ${req.requiredExpression}`);
  }
  if (req.avoid.some((a) => normalizeMathText(a).toLowerCase() === print)) reasons.push("repeats a question already in this test");
  if (req.avoidSkill && d.stepSkills.some((s) => dependsOnTransitively(s, req.avoidSkill!))) {
    reasons.push(`still needs ${req.avoidSkill}`);
  }
  // A CHECK exists to re-elicit one specific suspected misconception — an
  // item that happens to be valid but doesn't actually cover that mistake
  // can't distinguish a repeatable gap from a slip, which is the entire
  // point of asking it.
  if (req.purpose === "CHECK" && req.targetMistake && !d.predictedMistakes.some((p) => p.mistake === req.targetMistake)) {
    reasons.push(`does not cover the requested mistake ${req.targetMistake}`);
  }
  return reasons;
}

export class LotusQuestionFactory {
  constructor(private readonly models: QuestionWriterModels) {}

  async write(req: WriteRequest): Promise<WriteResult> {
    const t0 = Date.now();
    const rejections: string[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let raw: Record<string, unknown>;
      try {
        raw = await this.models.writeQuestion(makerPrompt(req));
      } catch (e) {
        rejections.push(`attempt ${attempt}: writer failed — ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const item = toItem(req, raw);
      if (typeof item === "string") { rejections.push(`attempt ${attempt}: ${item}`); continue; }
      const reasons = checkWrittenItem(req, item);
      if (!reasons.length && req.spec.kind === "NUMBER") {
        try {
          const solved = str((await this.models.solveBlind(blindPrompt(item))).answer);
          if (!solved || !sameNumber(solved, item.answerKey.canonicalAnswer)) reasons.push(`blind solver got "${solved}", the key says "${item.answerKey.canonicalAnswer}"`);
        } catch (e) {
          reasons.push(`blind solver failed — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!reasons.length && req.spec.kind === "CHOICE") {
        try {
          const solved = await this.models.solveBlind(blindPrompt(item));
          const choice = str(solved.choice);
          // Case-insensitive to match sameChoice() in lotus-factorisation.ts, the
          // real grading path a student's answer goes through — otherwise this
          // self-check is stricter than production grading and can burn a factory
          // attempt on a casing difference no student would ever be marked wrong for.
          if (!choice || normalizeMathText(choice).toLowerCase() !== normalizeMathText(item.answerKey.canonicalAnswer).toLowerCase()) {
            reasons.push(`blind solver chose "${choice}", the key says "${item.answerKey.canonicalAnswer}"`);
          }
        } catch (e) {
          reasons.push(`blind solver failed — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!reasons.length) return { item, attempts: attempt, ms: Date.now() - t0, rejections };
      rejections.push(`attempt ${attempt}: ${reasons.join("; ")}`);
    }
    return { item: null, attempts: MAX_ATTEMPTS, ms: Date.now() - t0, rejections };
  }
}
