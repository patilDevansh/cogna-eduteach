/**
 * Monic trinomials v² + bv + c and the "right numbers, wrong signs" mistake.
 *
 * Built for the Lotus factorisation diagnostic: the student factorised
 * x² − 7x + 12 as (x + 3)(x + 4). Everything here is integer arithmetic —
 * the lesson is built from that exact item, every expansion is recomputed,
 * and verifyTrinomialLesson refuses anything that doesn't check out.
 */
import { assertCheckpoints, openingLine, type KitScene, type LessonCheckpoint } from "../lesson-types";
import type { LessonThemeId } from "../themes";

export interface Trinomial {
  b: number;
  c: number;
  /** Variable letter. */
  v: string;
}

/** (v + p)(v + q) */
export type Pair = [number, number];

// ---------- parsing ----------

function normalize(text: string): string {
  return text
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("²", "^2")
    .replaceAll("×", "*")
    .replace(/\s+/g, "");
}

/**
 * Parses a sum of terms and +/− parenthesised groups in one variable, up to
 * degree 2, and collects like terms. Handles the padded forms Lotus items
 * sometimes carry, e.g. "(x^2 + 7x + 12) + 3091 - 3091". Returns null unless
 * the result is exactly monic quadratic.
 */
export function parseTrinomial(text: string): Trinomial | null {
  const s = normalize(text);
  const coef = [0, 0, 0];
  let v: string | null = null;
  let i = 0;
  const signStack = [1];
  let sign = 1;
  let expectTerm = true;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "+" || ch === "-") {
      sign = ch === "-" ? -1 : 1;
      expectTerm = true;
      i += 1;
      continue;
    }
    if (ch === "(") {
      signStack.push(signStack.at(-1)! * sign);
      sign = 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      if (signStack.length === 1) return null;
      signStack.pop();
      i += 1;
      expectTerm = false;
      continue;
    }
    if (!expectTerm) return null; // implicit multiplication such as ")(" is not a sum
    const m = /^(\d*)([a-z])?(?:\^(\d))?/i.exec(s.slice(i));
    if (!m || m[0] === "") return null;
    const [whole, digits, letter, power] = m;
    if (letter) {
      if (v && v !== letter) return null;
      v = letter;
    } else if (!digits) return null;
    const degree = letter ? Number(power ?? 1) : 0;
    if (degree > 2 || (!letter && power)) return null;
    coef[degree]! += signStack.at(-1)! * sign * (digits ? Number(digits) : 1);
    i += whole!.length;
    sign = 1;
    expectTerm = false;
  }
  if (signStack.length !== 1 || !v || coef[2] !== 1) return null;
  return { b: coef[1]!, c: coef[0]!, v };
}

/** "(x + 3)(x - 4)" → [3, -4]. Only monic linear factors. */
export function parsePair(text: string, v: string): Pair | null {
  const s = normalize(text).replace(/^=/, "");
  const re = new RegExp(`^\\(${v}([+-]\\d+)\\)\\*?\\(${v}([+-]\\d+)\\)$`);
  const m = re.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// ---------- arithmetic ----------

/** Smallest magnitude first — the order tiles, narration and answers use. */
const sortPair = ([p, q]: Pair): Pair => (Math.abs(p) < Math.abs(q) || (Math.abs(p) === Math.abs(q) && p <= q) ? [p, q] : [q, p]);

export const expandPair = ([p, q]: Pair): { b: number; c: number } => ({ b: p + q, c: p * q });

export function correctPair(t: Trinomial): Pair | null {
  const target = Math.abs(t.c);
  for (let d = 1; d <= target; d += 1) {
    if (target % d) continue;
    for (const [p, q] of [[d, t.c / d], [-d, -t.c / d]] as Pair[]) {
      if (p + q === t.b) return sortPair([p, q]);
    }
  }
  return null;
}

/** Factor pairs of |c| as magnitudes, smallest first: 12 → [1,12],[2,6],[3,4]. */
export function magnitudePairs(c: number): Pair[] {
  const n = Math.abs(c);
  const out: Pair[] = [];
  for (let d = 1; d * d <= n; d += 1) if (n % d === 0) out.push([d, n / d]);
  return out;
}

/** Apply the sign rules to a magnitude pair — the pair a student should try. */
export function signedPair([a, b]: Pair, t: Trinomial): Pair {
  if (t.c > 0) return t.b < 0 ? [-a, -b] : [a, b];
  // Different signs: the larger magnitude takes b's sign.
  const bigNeg = t.b < 0;
  return bigNeg ? [a, -b] : [-a, b];
}

const samePair = (x: Pair, y: Pair) => sortPair(x)[0] === sortPair(y)[0] && sortPair(x)[1] === sortPair(y)[1];

/**
 * "sign": the student used the right numbers with the wrong signs — the
 * magnitudes match the correct pair but the pair itself doesn't.
 * Anything else (wrong numbers, right answer) is not this lesson.
 */
export function classifyTrinomialAnswer(t: Trinomial, student: Pair): "sign" | "correct" | "other" {
  const right = correctPair(t);
  if (!right) return "other";
  if (samePair(student, right)) return "correct";
  const mags = (p: Pair) => sortPair([Math.abs(p[0]), Math.abs(p[1])]);
  return samePair(mags(student), mags(right)) ? "sign" : "other";
}

// ---------- formatting ----------

const sgn = (n: number) => (n < 0 ? "−" : "+");

export function formatTrinomial({ b, c, v }: Trinomial): string {
  const mid = b === 0 ? "" : ` ${sgn(b)} ${Math.abs(b) === 1 ? "" : Math.abs(b)}${v}`;
  const last = c === 0 ? "" : ` ${sgn(c)} ${Math.abs(c)}`;
  return `${v}²${mid}${last}`;
}

export const formatFactor = (p: number, v: string) => `(${v} ${sgn(p)} ${Math.abs(p)})`;
export const formatPair = ([p, q]: Pair, v: string) => `${formatFactor(p, v)}${formatFactor(q, v)}`;
export const formatSigned = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n)}`;
export const formatNumber = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n)}`;

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function spokenInt(n: number): string {
  const a = Math.abs(n);
  let w: string;
  if (a <= 20) w = WORDS[a]!;
  else if (a < 100) w = a % 10 ? `${TENS[Math.floor(a / 10)]}-${WORDS[a % 10]}` : TENS[Math.floor(a / 10)]!;
  else throw new Error(`No spoken form for ${n}.`);
  return n < 0 ? `minus ${w}` : w;
}

export function spokenTrinomial({ b, c, v }: Trinomial): string {
  const mid = b === 0 ? "" : ` ${b < 0 ? "minus" : "plus"} ${Math.abs(b) === 1 ? "" : `${spokenInt(Math.abs(b))} `}${v}`;
  const last = c === 0 ? "" : ` ${c < 0 ? "minus" : "plus"} ${spokenInt(Math.abs(c))}`;
  return `${v} squared${mid}${last}`;
}

const spokenFactor = (p: number, v: string) => `${v} ${p < 0 ? "minus" : "plus"} ${spokenInt(Math.abs(p))}`;
export const spokenPair = ([p, q]: Pair, v: string) => `${spokenFactor(p, v)}, times ${spokenFactor(q, v)}`;

// ---------- lesson ----------

export interface TrinomialLessonProps {
  studentName: string;
  topic: string;
  trinomial: Trinomial;
  student: Pair;
  studentExpansion: { b: number; c: number };
  correct: Pair;
  /** Magnitude pairs of |c> shown as tiles, each with the signs applied and its sum. */
  tiles: Array<{ pair: Pair; sum: number; match: boolean }>;
  rules: { constant: string; middle: string };
  exit: { prompt: string; expected: string };
  scenes: KitScene[];
  /** Visual world; framing lines are chosen for it at build time. */
  theme?: LessonThemeId;
  /** Where the interactive player stops to ask the child. */
  checkpoints: LessonCheckpoint[];
}

function estimateSeconds(text: string): number {
  return Math.max(2.2, text.split(/\s+/).length / 2.6 + 0.8);
}

/** Same sign case, each magnitude one bigger: (x−3)(x−4) → (x−4)(x−5). */
function exitItem(correct: Pair, v: string): { prompt: string; expected: string } {
  const bump = (n: number) => (n < 0 ? n - 1 : n + 1);
  const fresh = sortPair([bump(correct[0]), bump(correct[1])]);
  const { b, c } = expandPair(fresh);
  return { prompt: `Factorise ${formatTrinomial({ b, c, v })}.`, expected: formatPair(fresh, v) };
}

export interface TrinomialLessonInput {
  studentName: string;
  expression: string;
  answer: string;
  theme?: LessonThemeId;
  /** Skills the report calls secure; the first is used to open the lesson from a strength. */
  strengths?: string[];
}

/** Theme framing: only these sentences change between worlds. */
const FRAMING: Record<LessonThemeId, { intro: string; pairs: string; bigger: string; routine: string }> = {
  classic: {
    intro: "here's one from your diagnostic",
    pairs: "Pairs that multiply to",
    bigger: "the bigger number takes that sign",
    routine: "Read the signs, find the pair, then expand to check. Now try one on your own.",
  },
  cricket: {
    intro: "let's replay one delivery from your diagnostic",
    pairs: "Pick your batting partnership. Pairs that multiply to",
    bigger: "like a tug of war, the bigger number wins and takes that sign",
    routine: "Read the signs, pick the partnership, then check the scoreboard by expanding. Your turn to bat.",
  },
  space: {
    intro: "mission control has one from your diagnostic",
    pairs: "Line up the fuel pairs. Pairs that multiply to",
    bigger: "like the stronger engine, the bigger number sets the direction and takes that sign",
    routine: "Read the signs, find the pair, then expand to check. That's your launch checklist. Your turn.",
  },
};

export function buildTrinomialLesson(input: TrinomialLessonInput): TrinomialLessonProps {
  const theme = input.theme ?? "classic";
  const frame = FRAMING[theme] ?? FRAMING.classic;
  const t = parseTrinomial(input.expression);
  if (!t) throw new Error("Not a monic trinomial.");
  const student = parsePair(input.answer, t.v);
  if (!student) throw new Error("Answer is not a product of two monic brackets.");
  if (classifyTrinomialAnswer(t, student) !== "sign") throw new Error("Answer is not a right-numbers, wrong-signs mistake.");
  const correct = correctPair(t)!;
  const v = t.v;
  const studentExpansion = expandPair(student);
  const name = input.studentName;

  const tiles = magnitudePairs(t.c).map((mag) => {
    const pair = signedPair(mag, t);
    return { pair, sum: pair[0] + pair[1], match: samePair(pair, correct) };
  });
  if (!tiles.some((tile) => tile.match)) throw new Error("Sign rules did not produce the correct pair.");

  const same = t.c > 0;
  const rules = {
    constant: same ? `${formatSigned(t.c)} → same signs` : `${formatSigned(t.c)} → different signs`,
    middle: same
      ? t.b < 0 ? `${formatSigned(t.b)} → both negative` : `${formatSigned(t.b)} → both positive`
      : t.b < 0 ? `${formatSigned(t.b)} → bigger one negative` : `${formatSigned(t.b)} → bigger one positive`,
  };

  const q = `${spokenTrinomial(t)}`;
  const theirs = spokenTrinomial({ ...studentExpansion, v });
  const mismatch = [
    studentExpansion.b !== t.b ? `${studentExpansion.b < 0 ? "minus" : "plus"} ${Math.abs(studentExpansion.b) === 1 ? "" : `${spokenInt(Math.abs(studentExpansion.b))} `}${v} where the question has ${t.b < 0 ? "minus" : "plus"} ${Math.abs(t.b) === 1 ? "" : `${spokenInt(Math.abs(t.b))} `}${v}` : "",
    studentExpansion.c !== t.c ? `${spokenInt(studentExpansion.c)} where the question has ${spokenInt(t.c)}` : "",
  ].filter(Boolean);
  const matchTile = tiles.find((tile) => tile.match)!;

  const scenes: KitScene[] = [
    {
      id: "check",
      title: "Check your answer",
      beats: [
        openingLine(name, input.strengths?.[0], frame.intro, `factorise ${q}`),
        `You wrote ${spokenPair(student, v)}. Let's expand it, one pair of terms at a time.`,
        `That gives ${theirs}. It has ${mismatch.join(", and ")}. The numbers are right. The signs aren't.`,
      ].map((text) => ({ text, seconds: estimateSeconds(text) })),
    },
    {
      id: "signs",
      title: "Read the signs first",
      beats: [
        same
          ? `Before choosing numbers, look at the last term. ${spokenInt(t.c).replace(/^(?!minus)/, "Plus ")}: the two numbers have the same sign.`
          : `Before choosing numbers, look at the last term. ${spokenInt(t.c).replace(/^minus/, "Minus")}: the two numbers have different signs.`,
        same
          ? `Now the middle. ${t.b < 0 ? "Minus" : "Plus"} ${spokenInt(Math.abs(t.b))}: they add to a ${t.b < 0 ? "negative" : "positive"}, so both are ${t.b < 0 ? "negative" : "positive"}.`
          : `Now the middle. ${t.b < 0 ? "Minus" : "Plus"} ${spokenInt(Math.abs(t.b))}: ${frame.bigger}, so it's ${t.b < 0 ? "negative" : "positive"}.`,
      ].map((text) => ({ text, seconds: estimateSeconds(text) })),
    },
    {
      id: "pair",
      title: "Then find the pair",
      beats: [
        `${frame.pairs} ${spokenInt(Math.abs(t.c))}, with those signs: ${tiles.map((tile) => `${spokenInt(tile.pair[0])} and ${spokenInt(tile.pair[1])}`).join("; ")}.`,
        `Which pair adds to ${spokenInt(t.b)}? ${spokenInt(matchTile.pair[0]).replace(/^./, (c) => c.toUpperCase())} and ${spokenInt(matchTile.pair[1])}.`,
        `So it's ${spokenPair(correct, v)}. Expand to check: ${q}. It matches.`,
        frame.routine,
      ].map((text) => ({ text, seconds: estimateSeconds(text) })),
    },
  ];

  const lesson: TrinomialLessonProps = {
    studentName: name,
    topic: "Factorising trinomials",
    trinomial: t,
    student,
    studentExpansion,
    correct,
    tiles,
    rules,
    exit: exitItem(correct, v),
    scenes,
    theme,
    checkpoints: trinomialCheckpoints(t, tiles, student),
  };
  verifyTrinomialLesson(lesson);
  return lesson;
}

/**
 * 1. After "look at the last term": same or different signs?
 * 2. After the tiles appear: which pair adds to b? The child's own diagnostic
 *    pair is always an option, with feedback that names it.
 */
function trinomialCheckpoints(t: Trinomial, tiles: TrinomialLessonProps["tiles"], student: Pair): LessonCheckpoint[] {
  const same = t.c > 0;
  const c = formatNumber(t.c);
  const b = formatNumber(t.b);
  const label = (p: Pair) => `${formatNumber(p[0])} and ${formatNumber(p[1])}`;
  const pairOptions = tiles.map((tile) => ({
    label: label(tile.pair),
    correct: tile.match,
    feedback: tile.match
      ? `Yes. ${label(tile.pair)} multiply to ${c} and add to ${b}.`
      : `${label(tile.pair)} multiply to ${c}, but they add to ${formatNumber(tile.sum)}, not ${b}. Try another pair.`,
  }));
  const studentSorted = sortPair(student);
  if (!pairOptions.some((o) => o.label === label(studentSorted))) {
    pairOptions.push({
      label: label(studentSorted),
      correct: false,
      feedback: `That's the pair you wrote in your diagnostic. It adds to ${formatNumber(student[0] + student[1])}, not ${b}. Check which number takes the minus.`,
    });
  }
  return [
    {
      id: "signs",
      afterScene: 1,
      afterBeat: 0,
      prompt: `The last term is ${formatSigned(t.c)}. The two numbers have…`,
      spoken: `The last term is ${spokenInt(t.c)}. Do the two numbers have the same sign, or different signs?`,
      options: [
        {
          label: "the same sign",
          correct: same,
          feedback: same
            ? "Right. A positive product means both signs match."
            : `Not quite. Two numbers with the same sign always multiply to a positive, but ${c} is negative. Try again.`,
        },
        {
          label: "different signs",
          correct: !same,
          feedback: !same
            ? "Right. Only a positive times a negative gives a minus."
            : `Not quite. Different signs would make the product negative, but ${c} is positive. Try again.`,
        },
      ],
    },
    {
      id: "pair",
      afterScene: 2,
      afterBeat: 0,
      prompt: `Which pair multiplies to ${c} and adds to ${b}?`,
      spoken: `Your turn to choose. Which pair multiplies to ${spokenInt(t.c)} and adds to ${spokenInt(t.b)}?`,
      options: pairOptions,
    },
  ];
}

/** Release gate: the taught pair expands to the question, the student's doesn't, the exit item is new and right. */
export function verifyTrinomialLesson(lesson: TrinomialLessonProps): void {
  const t = lesson.trinomial;
  const right = expandPair(lesson.correct);
  if (right.b !== t.b || right.c !== t.c) throw new Error("Verification failed: taught pair does not expand to the question.");
  const theirs = expandPair(lesson.student);
  if (theirs.b !== lesson.studentExpansion.b || theirs.c !== lesson.studentExpansion.c) throw new Error("Verification failed: student's expansion.");
  if (theirs.b === t.b && theirs.c === t.c) throw new Error("Verification failed: the student's answer is actually correct.");
  for (const tile of lesson.tiles) {
    if (tile.pair[0] * tile.pair[1] !== t.c || tile.pair[0] + tile.pair[1] !== tile.sum) throw new Error("Verification failed: a tile.");
  }
  const exitT = parseTrinomial(lesson.exit.prompt.replace(/^Factorise\s+/, "").replace(/\.$/, ""));
  const exitPair = exitT && parsePair(lesson.exit.expected, exitT.v);
  if (!exitT || !exitPair || classifyTrinomialAnswer(exitT, exitPair) !== "correct") throw new Error("Verification failed: exit item.");
  if (exitT.b === t.b && exitT.c === t.c) throw new Error("Verification failed: exit item repeats the diagnostic item.");
  assertCheckpoints(lesson.checkpoints ?? [], lesson.scenes);
  for (const option of lesson.checkpoints?.find((cp) => cp.id === "pair")?.options ?? []) {
    const [p, q] = option.label.split(" and ").map((n) => Number(n.replace("−", "-")));
    const right = p! * q! === t.c && p! + q! === t.b;
    if (right !== option.correct) throw new Error(`Verification failed: checkpoint pair ${option.label} is marked ${option.correct}.`);
  }
}

export function trinomialDurationInFrames(props: Pick<TrinomialLessonProps, "scenes">, fps: number): number {
  return Math.max(1, props.scenes.reduce((sum, s) => sum + s.beats.reduce((t, b) => t + Math.round(b.seconds * fps), 0), 0));
}

/** Aarav's factorisation evidence: x² − 7x + 12 written as (x + 3)(x + 4). */
export const AARAV_TRINOMIAL_EXAMPLE = { studentName: "Aarav", expression: "x^2 - 7x + 12", answer: "(x + 3)(x + 4)" };
