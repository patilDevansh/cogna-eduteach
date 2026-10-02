/**
 * Builds a verified distribution lesson from a student's own wrong working.
 *
 * Two mistakes are taught, each with its own script:
 *  - "untouched": the multiplier reaches some terms, but one is copied down
 *    unchanged (Meena: ½(4x − 6) → 2x − 6). Lesson: one arrow for every term.
 *  - "sign-lost": a negative multiplier's product loses its sign
 *    (Aarav: −2(5 − 8) → −10 − 16). Lesson: carry the sign with the number.
 *
 * Every number shown or spoken is computed here; verifyDistributionLesson is
 * the release gate. Anything that isn't exactly one of these mistakes is
 * rejected rather than mis-taught.
 */
import {
  add,
  combine,
  eq,
  evaluateGroup,
  evaluateGroups,
  evaluateTerms,
  expandGroup,
  formatFactor,
  formatLeadingTerm,
  formatMagnitude,
  formatRational,
  formatTerms,
  neg,
  q,
  spokenMagnitude,
  spokenRational,
  spokenTerm,
  type BracketGroup,
  type Rational,
  type Term,
} from "./math";
import { answerFor, type DistributionMistake } from "./evidence";
import { assertCheckpoints, openingLine, type LessonCheckpoint } from "../lesson-types";
import type { LessonThemeId } from "../themes";

export type TermStatus = "correct" | DistributionMistake | "wrong";

export interface LessonBeat {
  text: string;
  /** Seconds this beat stays on screen (narration length + breathing room). */
  seconds: number;
  /** Local mp3 path; converted to audioSrc (data URI) right before render. */
  audioPath?: string;
  audioSrc?: string;
}

export interface LessonSceneSpec {
  id: "working" | "arrows" | "check";
  title: string;
  beats: LessonBeat[];
}

export interface CheckCard {
  heading: string;
  math: string;
  lines: string[];
}

export interface DistributionLessonProps {
  studentName: string;
  topic: string;
  /** Variable letter; "" for a purely numeric expression. */
  variable: string;
  mistake: DistributionMistake;
  groups: BracketGroup[];
  error: { group: number; term: number };
  student: { products: Term[][]; status: TermStatus[][]; answer: Term[] };
  correct: { products: Term[][]; answer: Term[] };
  display: {
    errorTag: string;
    /** Per group, per term: "(−2) × (−8)" — shown for sign-lost lessons. */
    factorLabels: string[][] | null;
    chips: string[];
    check: { left: CheckCard; right: CheckCard; earlier: string };
    routine: string[];
  };
  check: { originalValue: Rational; correctValue: Rational; studentValue: Rational; x: Rational | null };
  exit: { prompt: string; expected: string };
  scenes: LessonSceneSpec[];
  theme?: LessonThemeId;
  checkpoints: LessonCheckpoint[];
}

export interface DistributionLessonInput {
  studentName: string;
  /** Variable letter, or null/"" for numeric. */
  variable?: string | null;
  groups: BracketGroup[];
  /** What the student wrote under each bracket, term by term. */
  studentProducts: Term[][];
  /** Numeric items say "Evaluate", algebraic ones "Expand". */
  verb?: "Evaluate" | "Expand";
  theme?: LessonThemeId;
  /** Skills the report calls secure; the first opens the lesson from a strength. */
  strengths?: string[];
}

const FRAMING: Record<LessonThemeId, { intro: string; outro: string }> = {
  classic: { intro: "here's one you worked on in your diagnostic", outro: "Now try one on your own." },
  cricket: { intro: "let's replay one shot from your diagnostic", outro: "Your turn to bat." },
  space: { intro: "mission control has one from your diagnostic", outro: "That's your launch checklist. Your turn." },
};

const sameTerm = (a: Term, b: Term) => a.x === b.x && eq(a.coef, b.coef);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const COUNT_WORDS = ["no", "one", "two", "three", "four"];
const ORDINALS = ["first", "second", "third", "fourth"];

function spokenExpression(terms: Term[], v: string): string {
  if (!terms.length) return "zero";
  return terms
    .map((term, i) => {
      if (i === 0) return spokenTerm(term, v);
      const body = spokenTerm({ ...term, coef: q(Math.abs(term.coef.n), term.coef.d) }, v);
      return `${term.coef.n < 0 ? "minus" : "plus"} ${body}`;
    })
    .join(" ");
}

/** "the half", "minus two" — the multiplier as something that acts. */
function multiplierName(m: Rational): string {
  return m.d === 1 ? spokenRational(m) : `the ${spokenMagnitude(m).replace(/^a /, "")}`;
}

/** "half of four x" / "minus two times five". */
function spokenProduct(m: Rational, term: Term, v: string): string {
  return m.d === 1
    ? `${spokenRational(m)} times ${spokenTerm(term, v)}`
    : `${spokenMagnitude(m).replace(/^a /, "")} of ${spokenTerm(term, v)}`;
}

/** Placeholder pacing when narration audio is unavailable (~2.6 words/s). */
function estimateSeconds(text: string): number {
  return Math.max(2.2, text.split(/\s+/).length / 2.6 + 0.8);
}

function formatGroup(group: BracketGroup, g: number, v: string): string {
  const m = group.multiplier;
  const lead = g === 0 ? (m.n < 0 ? "−" : "") : m.n < 0 ? "− " : "+ ";
  return `${lead}${formatMagnitude(m)}(${formatTerms(group.terms, v)})`;
}

export function formatExpression(groups: BracketGroup[], v: string): string {
  return groups.map((group, g) => formatGroup(group, g, v)).join(" ");
}

/**
 * A fresh item with the same structure and the same trap: integer
 * multipliers grow by one in magnitude, term coefficients by the multiplier's
 * denominator (so ½ still divides evenly). Never the diagnostic item itself.
 */
function exitItem(groups: BracketGroup[], v: string, verb: string): { prompt: string; expected: string } {
  const fresh = groups.map((group) => {
    const m = group.multiplier;
    const multiplier = m.d === 1 ? q(m.n < 0 ? m.n - 1 : m.n + 1) : m;
    const step = m.d;
    return {
      multiplier,
      terms: group.terms.map((t) => ({ ...t, coef: q(t.coef.n + (t.coef.n < 0 ? -step : step) * t.coef.d, t.coef.d) })),
    };
  });
  const answer = combine(fresh.flatMap(expandGroup));
  return { prompt: `${verb} ${formatExpression(fresh, v)}.`, expected: formatTerms(answer, v) };
}

export function buildDistributionLesson(input: DistributionLessonInput): DistributionLessonProps {
  const { groups, studentProducts, studentName } = input;
  const v = input.variable || "";
  const vs = v || "x"; // formatting helpers need a letter; numeric terms never print it
  const numeric = !v;
  if (groups.length !== studentProducts.length) throw new Error("Student working must have one product row per bracket.");
  if (groups.some((g) => eq(g.multiplier, q(1)) || eq(g.multiplier, q(-1)))) {
    throw new Error("A ±1 multiplier has no visible factor to animate; this template does not cover it.");
  }

  const correctProducts = groups.map(expandGroup);
  const status: TermStatus[][] = groups.map((group, g) =>
    group.terms.map((term, t) => {
      const written = studentProducts[g]![t];
      const right = correctProducts[g]![t]!;
      if (!written) throw new Error(`Missing student product for bracket ${g + 1}, term ${t + 1}.`);
      if (sameTerm(written, right)) return "correct";
      if (sameTerm(written, term)) return "untouched";
      if (group.multiplier.n < 0 && sameTerm(written, { ...right, coef: neg(right.coef) })) return "sign-lost";
      return "wrong";
    }),
  );
  const errors = status.flatMap((row, g) => row.flatMap((s, t) => (s === "correct" ? [] : [{ g, t, s }])));
  if (errors.length !== 1 || errors[0]!.s === "wrong") {
    throw new Error("Working must contain exactly one untouched or sign-lost term; this template would mis-teach anything else.");
  }
  const { g: eg, t: et } = errors[0]!;
  const mistake = errors[0]!.s as DistributionMistake;
  const errGroup = groups[eg]!;
  const m = errGroup.multiplier;
  const errTerm = errGroup.terms[et]!;
  const wrote = studentProducts[eg]![et]!;
  const right = correctProducts[eg]![et]!;

  const correctAnswer = combine(correctProducts.flat());
  const studentAnswer = combine(studentProducts.flat());
  const checkX = numeric ? null : q(1);
  const at = checkX ?? q(0);
  const originalValue = evaluateGroups(groups, at);
  const correctValue = evaluateTerms(correctAnswer, at);
  const studentValue = evaluateTerms(studentAnswer, at);
  const sp = (terms: Term[]) => spokenExpression(terms, vs);
  const st = (term: Term) => spokenTerm(term, vs);

  // ---- scene 1: the student's own working ----
  const correctLines: string[] = [];
  groups.forEach((group, g) => {
    const rowOk = status[g]!.every((s) => s === "correct");
    if (rowOk) {
      correctLines.push(
        groups.length > 1
          ? `You opened the ${ORDINALS[g]} bracket perfectly: ${sp(correctProducts[g]!)}.`
          : `You opened the bracket: ${sp(correctProducts[g]!)}.`,
      );
    } else {
      group.terms.forEach((term, t) => {
        if (status[g]![t] !== "correct") return;
        correctLines.push(`${capitalize(spokenProduct(group.multiplier, term, vs))} is ${st(correctProducts[g]![t]!)}. That's right.`);
      });
    }
  });
  const errorLine =
    mistake === "untouched"
      ? `But look at the ${st(errTerm)}. ${capitalize(multiplierName(m))} never reached it, so it stayed ${st(errTerm)}.`
      : `Then ${spokenProduct(m, errTerm, vs)}. You wrote ${st(wrote)}. Look at the two signs: that's a negative times a negative.`;

  // ---- scene 2: the fix ----
  const arrowsTitle = mistake === "untouched" ? "One arrow for every term" : "Carry the sign with the number";
  const ruleLine =
    mistake === "untouched"
      ? "Here's the rule. The number outside sends one arrow to every term inside."
      : "Here's the habit. Write each number with its sign, then multiply the signs first.";
  const groupLines = groups.map((group, g) => {
    const n = group.terms.length;
    if (mistake === "untouched") {
      const lead = g === eg
        ? `The ${ORDINALS[g]} bracket has ${COUNT_WORDS[n]} terms${g > 0 ? " too" : ""}. So ${multiplierName(group.multiplier)} needs ${COUNT_WORDS[n]} arrows: `
        : `The ${ORDINALS[g]} bracket has ${COUNT_WORDS[n]} terms, so it gets ${COUNT_WORDS[n]} arrows.`;
      if (g !== eg) return lead;
      return `${lead}${group.terms.map((t, i) => `${spokenProduct(group.multiplier, t, vs)} is ${st(correctProducts[g]![i]!)}`).join(", and ")}.`;
    }
    return group.terms
      .map((t, i) => {
        const product = correctProducts[g]![i]!;
        const both = group.multiplier.n < 0 && t.coef.n < 0;
        return both
          ? `${capitalize(spokenProduct(group.multiplier, t, vs))}: negative times negative is positive, so plus ${st({ ...product, coef: q(Math.abs(product.coef.n), product.coef.d) })}.`
          : `${capitalize(spokenProduct(group.multiplier, t, vs))} is ${st(product)}.`;
      })
      .join(" ");
  });
  const factorLabels =
    mistake === "sign-lost"
      ? groups.map((group) => group.terms.map((t) => `${formatFactor({ coef: group.multiplier, x: false })} × ${formatFactor(t, vs)}`))
      : null;
  const chips = groups.map((group, g) =>
    mistake === "untouched"
      ? `${group.terms.length} terms · ${group.terms.length} arrows ✓`
      : g === eg
        ? "− × − = +"
        : "signs written ✓",
  );

  // ---- scene 3: collect and check ----
  const flat = correctProducts.flat();
  const xTerms = flat.filter((t) => t.x);
  const constTerms = flat.filter((t) => !t.x);
  const collectLine = numeric
    ? `Now add them up. ${capitalize(sp(flat))} is ${sp(correctAnswer)}.`
    : `Now collect like terms. ${[xTerms, constTerms]
        .filter((ts) => ts.length > 1)
        .map((ts) => `${capitalize(sp(ts))} is ${sp(combine(ts))}.`)
        .join(" ")} So the answer is ${sp(correctAnswer)}.`;

  let left: CheckCard;
  let checkLine: string;
  if (numeric) {
    const innerValues = groups.map((group) => evaluateTerms(group.terms, at));
    const groupValues = groups.map((group) => evaluateGroup(group, at));
    left = {
      heading: "Bracket first",
      math: "",
      lines: [
        ...groups.map((group, g) => `${formatTerms(group.terms, vs)} = ${formatRational(innerValues[g]!)}`),
        ...groups.map((group, g) => `${formatRational(group.multiplier)} × ${formatFactor({ coef: innerValues[g]!, x: false })} = ${formatRational(groupValues[g]!)}`),
        ...(groups.length > 1 ? [`= ${formatRational(originalValue)}`] : []),
      ],
    };
    checkLine = `Let's check by working the bracket first. ${groups
      .map((group, g) => `${capitalize(sp(group.terms))} is ${spokenRational(innerValues[g]!)}, and ${spokenRational(group.multiplier)} times ${spokenRational(innerValues[g]!)} is ${spokenRational(groupValues[g]!)}.`)
      .join(" ")}`;
  } else {
    const xs = formatRational(checkX!);
    const subst = (group: BracketGroup, g: number) => {
      const inner = group.terms
        .map((term, t) => {
          const body = term.x ? (eq(q(Math.abs(term.coef.n), term.coef.d), q(1)) ? xs : `${formatMagnitude(term.coef)}·${xs}`) : formatMagnitude(term.coef);
          return t === 0 ? `${term.coef.n < 0 ? "−" : ""}${body}` : `${term.coef.n < 0 ? "−" : "+"} ${body}`;
        })
        .join(" ");
      const mm = group.multiplier;
      const lead = g === 0 ? (mm.n < 0 ? "−" : "") : mm.n < 0 ? "− " : "+ ";
      return `${lead}${formatMagnitude(mm)}(${inner})`;
    };
    const groupValues = groups.map((group) => evaluateGroup(group, at));
    left = {
      heading: "Original",
      math: `${vs} = ${xs}`,
      lines: [
        groups.map(subst).join(" "),
        `= ${groupValues.map((val, i) => (i === 0 ? formatRational(val) : val.n < 0 ? `+ (${formatRational(val)})` : `+ ${formatRational(val)}`)).join(" ")}`,
        `= ${formatRational(originalValue)}`,
      ],
    };
    checkLine = `Let's check with ${vs} equals ${spokenRational(checkX!)}. The original expression gives ${spokenRational(originalValue)}.`;
  }
  const substituteTerms = (terms: Term[]) =>
    numeric
      ? formatTerms(terms, vs)
      : terms
          .map((term, t) => {
            const body = term.x ? (eq(q(Math.abs(term.coef.n), term.coef.d), q(1)) ? formatRational(checkX!) : `${formatMagnitude(term.coef)}·${formatRational(checkX!)}`) : formatMagnitude(term.coef);
            return t === 0 ? `${term.coef.n < 0 ? "−" : ""}${body}` : `${term.coef.n < 0 ? "−" : "+"} ${body}`;
          })
          .join(" ");
  const right2: CheckCard = numeric
    ? { heading: "Your expansion, fixed", math: "", lines: [`${formatTerms(flat, vs)}`, `= ${formatRational(correctValue)}`] }
    : { heading: "Answer", math: `${formatTerms(correctAnswer, vs)},  ${vs} = ${formatRational(checkX!)}`, lines: [substituteTerms(correctAnswer), `= ${formatRational(correctValue)}`] };
  const earlier = numeric
    ? `earlier answer  ${formatTerms(studentAnswer, vs)}  ✗`
    : `earlier answer  ${formatTerms(studentAnswer, vs)}  →  ${substituteTerms(studentAnswer)} = ${formatRational(studentValue)}  ✗`;
  const matchLine = numeric
    ? `Same answer, ${spokenRational(correctValue)}. They match. Your earlier answer, ${sp(studentAnswer)}, doesn't. That's how the check catches a ${mistake === "sign-lost" ? "lost sign" : "missed term"}.`
    : `${capitalize(sp(correctAnswer))} gives ${spokenRational(correctValue)} too. They match. Your earlier answer, ${sp(studentAnswer)}, gives ${spokenRational(studentValue)}. That's how the check catches a ${mistake === "sign-lost" ? "lost sign" : "missed term"}.`;

  const checkStep = numeric ? "Check by working the bracket first" : `Check with ${vs} = ${formatRational(checkX!)}`;
  const routine =
    mistake === "untouched"
      ? ["Count the terms inside each bracket", "Draw one arrow to every term", checkStep]
      : ["Write each number with its sign", "Multiply the signs first:  − × − = +", checkStep];
  const theme = input.theme ?? "classic";
  const frame = FRAMING[theme] ?? FRAMING.classic;
  const routineLine =
    mistake === "untouched"
      ? `Count the terms, give every term an arrow, then check. ${frame.outro}`
      : `Write the signs, multiply the signs first, then check. ${frame.outro}`;

  const scenes: LessonSceneSpec[] = [
    {
      id: "working",
      title: "Your working",
      beats: [openingLine(studentName, input.strengths?.[0], frame.intro, ""), correctLines.join(" "), errorLine].map((text) => ({ text, seconds: 0 })),
    },
    { id: "arrows", title: arrowsTitle, beats: [ruleLine, ...groupLines].map((text) => ({ text, seconds: 0 })) },
    {
      id: "check",
      title: "Put it together, then check",
      beats: [collectLine, checkLine, matchLine, routineLine].map((text) => ({ text, seconds: 0 })),
    },
  ];
  for (const scene of scenes) for (const beat of scene.beats) beat.seconds = estimateSeconds(beat.text);

  const lesson: DistributionLessonProps = {
    studentName,
    topic: "Expanding brackets",
    variable: v,
    mistake,
    groups,
    error: { group: eg, term: et },
    student: { products: studentProducts, status, answer: studentAnswer },
    correct: { products: correctProducts, answer: correctAnswer },
    display: {
      errorTag:
        mistake === "untouched"
          ? `the ${formatMagnitude(m)} never reached this`
          : `${formatFactor({ coef: m, x: false })} × ${formatFactor(errTerm, vs)} is not ${formatLeadingTerm(wrote, vs)}`,
      factorLabels,
      chips,
      check: { left, right: right2, earlier },
      routine,
    },
    check: { originalValue, correctValue, studentValue, x: checkX },
    exit: exitItem(groups, vs, input.verb ?? (numeric ? "Evaluate" : "Expand")),
    scenes,
    theme,
    checkpoints: [
      mistake === "sign-lost"
        ? {
            id: "product",
            afterScene: 0,
            afterBeat: 2,
            prompt: `What is ${formatFactor({ coef: m, x: false })} × ${formatFactor(errTerm, vs)}?`,
            spoken: `Before we fix it: what is ${spokenProduct(m, errTerm, vs)}?`,
            options: uniqueOptions([
              { label: `${right.coef.n > 0 ? "+" : ""}${formatLeadingTerm(right, vs)}`, correct: true, feedback: `Yes. A negative times a negative is positive: ${formatLeadingTerm(right, vs)}.` },
              { label: formatLeadingTerm(wrote, vs), correct: false, feedback: `That's what you wrote in your diagnostic. Look at the two signs: a negative times a negative is positive. Try again.` },
              ...(errTerm.x
                ? []
                : [{ label: formatRational(add(m, errTerm.coef)), correct: false, feedback: "That's what you get by adding them. This step multiplies. Try again." }]),
            ]),
          }
        : {
            id: "arrows",
            afterScene: 0,
            afterBeat: 2,
            prompt: `How many terms inside that bracket does the ${formatMagnitude(m)} need to multiply?`,
            spoken: `Quick check: how many terms inside that bracket does the ${multiplierName(m).replace(/^the /, "")} need to multiply?`,
            options: Array.from({ length: errGroup.terms.length + 1 }, (_, i) => i + 1).map((n) => ({
              label: String(n),
              correct: n === errGroup.terms.length,
              feedback:
                n === errGroup.terms.length
                  ? `Yes, all ${n}. One arrow for every term.`
                  : n < errGroup.terms.length
                    ? `That's how many it reached in your diagnostic. It needs to reach every term inside. Try again.`
                    : "That bracket doesn't have that many terms. Count them again.",
            })),
          },
    ],
  };
  verifyDistributionLesson(lesson);
  return lesson;
}

/**
 * Release gate. Throws unless the taught expansion equals the original
 * expression (checked at several points — conclusive for a linear
 * expression), the check really exposes the student's answer, and the exit
 * item is a different question whose stated answer is right.
 */
/** Two distractors can coincide with the answer for some numbers; drop any repeat label. */
function uniqueOptions(options: LessonCheckpoint["options"]): LessonCheckpoint["options"] {
  const seen = new Set<string>();
  return options.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true)));
}

export function verifyDistributionLesson(lesson: DistributionLessonProps): void {
  assertCheckpoints(lesson.checkpoints ?? [], lesson.scenes);
  const probes = [-3, -2, -1, 0, 1, 2, 3].map((n) => q(n)).concat([q(1, 2), q(-5, 3)]);
  for (const x of probes) {
    if (!eq(evaluateTerms(lesson.correct.answer, x), evaluateGroups(lesson.groups, x))) {
      throw new Error(`Verification failed: expansion differs from the original at x = ${x.n}/${x.d}.`);
    }
  }
  lesson.groups.forEach((group, g) => {
    const expected = expandGroup(group);
    lesson.correct.products[g]!.forEach((term, t) => {
      if (!sameTerm(term, expected[t]!)) throw new Error(`Verification failed: product ${g + 1}.${t + 1}.`);
    });
  });
  const { check } = lesson;
  if (!eq(check.originalValue, check.correctValue)) throw new Error("Verification failed: check values differ.");
  if (eq(check.studentValue, check.originalValue)) {
    throw new Error("The check does not expose the student's error; this lesson cannot show why the answer was wrong.");
  }
  const studentRecomputed = answerFor({ groups: lesson.groups, extras: [], variable: lesson.variable || null }, lesson.student.products);
  if (formatTerms(studentRecomputed) !== formatTerms(lesson.student.answer)) {
    throw new Error("Verification failed: the student's answer does not follow from the shown working.");
  }
  if (lesson.exit.prompt.includes(formatExpression(lesson.groups, lesson.variable || "x"))) {
    throw new Error("Verification failed: the exit item repeats the diagnostic item.");
  }
}

export function lessonFps(): number {
  return 30;
}

export function distributionLessonDurationInFrames(props: Pick<DistributionLessonProps, "scenes">, fps: number): number {
  const total = props.scenes.reduce(
    (sum, scene) => sum + scene.beats.reduce((s, b) => s + Math.round(b.seconds * fps), 0),
    0,
  );
  return Math.max(1, total);
}

/** Meena Krishnan's pilot evidence: ½ reaches 4x but never reaches −6. */
export const MEENA_EXAMPLE: DistributionLessonInput = {
  studentName: "Meena",
  variable: "x",
  groups: [
    { multiplier: q(2), terms: [{ coef: q(1), x: true }, { coef: q(3), x: false }] },
    { multiplier: q(1, 2), terms: [{ coef: q(4), x: true }, { coef: q(-6), x: false }] },
  ],
  studentProducts: [
    [{ coef: q(2), x: true }, { coef: q(6), x: false }],
    [{ coef: q(2), x: true }, { coef: q(-6), x: false }],
  ],
};

/** Aarav Choudhury's diagnostic item: −2(5 − 8) written as −10 − 16. */
export const AARAV_EXAMPLE: DistributionLessonInput = {
  studentName: "Aarav",
  variable: null,
  groups: [{ multiplier: q(-2), terms: [{ coef: q(5), x: false }, { coef: q(-8), x: false }] }],
  studentProducts: [[{ coef: q(-10), x: false }, { coef: q(-16), x: false }]],
};
