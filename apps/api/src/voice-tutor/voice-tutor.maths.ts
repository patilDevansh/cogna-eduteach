import { algebraicallyEqual, finalAnswerText } from "../lotus/lotus-algebra";

/**
 * The maths check on everything the voice tutor says ("no unchecked LLM maths to students").
 *
 * The tutor's reply is untrusted text. Before it is spoken it must pass four rules, all decided
 * here by code with the exact algebra engine (lotus-algebra.ts), never by a model:
 *
 *  A. Every equation it states is true. Spoken maths is turned back into symbols first
 *     ("twelve times twelve is one hundred forty-four" → 12 * 12 = 144) and re-derived exactly.
 *     A statement that looks like maths but cannot be checked fails, and so does giving the
 *     value of an unknown ("x is 14"): that is solving, not hinting.
 *  B. Every number it mentions is backed: it appears in the question, its choices, the hints the
 *     student has already been given, the lesson on screen, or a checked equation. Small counting
 *     numbers (0–10) are free, as in the lesson verifier, and so is 1098 (Childline, the safety line).
 *  C. It does not give away the open question's answer: not the answer's value, not an expression
 *     equal to it, not all of the answer's own numbers.
 *  D. A formula it states in words ("the area of a triangle is half of base times height") must match
 *     a reviewed formula. An unknown or wrong one fails.
 *
 * Pure and synchronous, so the golden tests can pin every rule.
 */

/** India's free helpline for children. The tutor may always say it (voice-tutor.rules.ts, safety rule). */
export const CHILDLINE_NUMBER = 1098;

export interface MathsFacts {
  /** Reviewed text the tutor may draw numbers from: the question, its choices, issued hints, lesson steps. */
  grounded: string[];
  /** The open question's accepted answers (server-side only). Never to be said. */
  answers: string[];
  /** The open question's text. Its numbers are not part of the "answer's own numbers". */
  question?: string;
}

export interface MathsVerdict {
  ok: boolean;
  /** Plain reasons, written so the model can fix its reply. */
  problems: string[];
  /** Equations re-derived by the algebra engine, for the audit trail. */
  claimsChecked: number;
}

// ---------------------------------------------------------------- spoken maths → symbols

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000, crore: 10000000, million: 1000000 };
const UNIT_WORDS = /^(cm|centimetres?|centimeters?|metres?|meters?|m|mm|millimetres?|km|kilometres?|units?|inches|inch|feet|foot|ft|yards?)$/;
const RELATIONS: string[][] = [
  ["is", "equal", "to"], ["are", "equal", "to"], ["is", "the", "same", "as"], ["equals"], ["equal"], ["gives", "you"], ["gives"], ["give"],
  ["makes"], ["make"], ["comes", "to"], ["works", "out", "to"], ["is"], ["are"], ["="],
];
const OPERATORS = new Set(["+", "-", "*", "/", "^", "(", ")"]);

function isNumberWord(w: string | undefined): boolean {
  return !!w && (w in UNITS || w in TENS || w in SCALES);
}

/** Lower-cased tokens of spoken maths, with number words turned into numbers and operator words into symbols. */
export function spokenTokens(text: string): string[] {
  const raw = String(text)
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (sup) => ` ^ ${[...sup].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)).join("")} `)
    .replace(/½/g, " 1/2 ").replace(/¼/g, " 1/4 ").replace(/¾/g, " 3/4 ")
    .replace(/√/g, " square root of ")
    .replace(/[−–—]/g, "-")
    .replace(/[×·∙]/g, " * ")
    .replace(/÷/g, " / ")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/([a-z])-([a-z])/g, "$1 $2");
  const words = raw.match(/\d+(?:\.\d+)?|[a-z]+|[^\s\w]/g) ?? [];
  const out: string[] = [];
  let i = 0;
  const prevIsMath = () => out.length > 0 && isMathToken(out[out.length - 1]!, out[out.length - 2], undefined);
  const nextIsMath = (j: number) => {
    const w = words[j];
    return !!w && (/^\d/.test(w) || isNumberWord(w) || /^[b-hj-z]$/.test(w) || w === "(" || w === "x");
  };
  while (i < words.length) {
    const w = words[i]!;
    // a run of number words: "one hundred and forty four", "a hundred", "ten thousand", "two point five"
    if (isNumberWord(w) || (w === "a" && (words[i + 1] === "hundred" || words[i + 1] === "thousand" || words[i + 1] === "lakh"))) {
      let total = 0, current = 0, j = i, used = false;
      while (j < words.length) {
        const t = words[j]!;
        if (t === "a" && !used && (words[j + 1] === "hundred" || words[j + 1] === "thousand" || words[j + 1] === "lakh")) { current = 1; j++; continue; }
        if (t in UNITS) { current += UNITS[t]!; used = true; j++; continue; }
        if (t in TENS) { current += TENS[t]!; used = true; j++; continue; }
        if (t === "hundred") { current = (current || 1) * 100; used = true; j++; continue; }
        if (t in SCALES) { total += (current || 1) * SCALES[t]!; current = 0; used = true; j++; continue; }
        // "and" joins only after a hundred or thousand ("one hundred and forty"), never "two and five"
        if (t === "and" && used && (words[j - 1] === "hundred" || words[j - 1]! in SCALES) && isNumberWord(words[j + 1]) && !(words[j + 1]! in SCALES)) { j++; continue; }
        break;
      }
      let value = String(total + current);
      // "two point five"
      if (words[j] === "point" && (words[j + 1] && (words[j + 1]! in UNITS || /^\d+$/.test(words[j + 1]!)))) {
        let digits = "";
        j++;
        while (j < words.length && (words[j]! in UNITS && UNITS[words[j]!]! < 10 || /^\d$/.test(words[j]!))) { digits += /^\d$/.test(words[j]!) ? words[j] : String(UNITS[words[j]!]); j++; }
        value = `${value}.${digits}`;
      }
      out.push(value);
      i = j;
      continue;
    }
    const two = `${w} ${words[i + 1] ?? ""}`;
    const three = `${two} ${words[i + 2] ?? ""}`;
    // units are words, not powers: "24 square centimetres"
    if ((w === "square" || w === "sq" || w === "cubic") && UNIT_WORDS.test(words[i + 1] ?? "")) { out.push(`${w}_${words[i + 1]}`); i += 2; continue; }
    if (three === "square root of" || (w === "root" && words[i + 1] === "of")) { out.push("sqrt"); i += w === "root" ? 2 : 3; continue; }
    if (w === "the" && `${words[i + 1]} ${words[i + 2]} ${words[i + 3]}` === "square root of") { out.push("sqrt"); i += 4; continue; }
    if (two === "multiplied by" || two === "divided by" || two === "added to" || two === "take away") {
      out.push(two === "multiplied by" ? "*" : two === "divided by" ? "/" : two === "added to" ? "+" : "-"); i += 2; continue;
    }
    if (w === "times" || w === "plus" || w === "minus") { out.push(w === "times" ? "*" : w === "plus" ? "+" : "-"); i++; continue; }
    // Indian classroom "six into four" is 6 × 4; "put them into brackets" is not
    if (w === "into" && prevIsMath() && nextIsMath(i + 1)) { out.push("*"); i++; continue; }
    if ((w === "squared" || w === "square" || w === "cubed" || w === "cube") && prevIsMath() && words[i + 1] !== "root" && !UNIT_WORDS.test(words[i + 1] ?? "")) {
      out.push("^", w.startsWith("square") ? "2" : "3"); i++; continue;
    }
    if (three === "to the power" || two === "raised to") {
      i += three === "to the power" ? 3 : 2;
      if (words[i] === "of") i++;
      out.push("^"); continue;
    }
    if (two === "half of") { out.push("1", "/", "2", "*"); i += 2; continue; }
    if (w === "half") { out.push("1", "/", "2"); i++; continue; }
    if (w === "twice") { out.push("2", "*"); i++; continue; }
    // relations last, longest first
    const rel = RELATIONS.find((r) => r.every((part, k) => words[i + k] === part));
    if (rel) { out.push("="); i += rel.length; continue; }
    out.push(w);
    i++;
  }
  return out;
}

/** A token that can be part of a written-out equation. Single letters are unknowns, except "a" and "i" (words). */
function isMathToken(t: string, before?: string, after?: string): boolean {
  if (/^\d+(\.\d+)?$/.test(t) || OPERATORS.has(t) || t === "sqrt") return true;
  if (/^[b-hj-z]$/.test(t)) return true;
  // "a" is an unknown only when it is plainly algebra: "a ^ 2", "2 a", "a + b"
  if (t === "a") return !!(before && (OPERATORS.has(before) || /^\d/.test(before))) || !!(after && (OPERATORS.has(after) && after !== "("));
  return false;
}

/** A run of maths as algebra text. "sqrt 144" becomes 12 when the root is whole; any other root is left, and then fails to parse. */
function spanText(tokens: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "sqrt" && /^\d+$/.test(tokens[i + 1] ?? "")) {
      const n = Number(tokens[i + 1]);
      const r = Math.round(Math.sqrt(n));
      if (r * r === n) { out.push(String(r)); i++; continue; }
    }
    out.push(tokens[i]!);
  }
  return out.join(" ");
}

function trimSpan(span: string[]): string[] {
  let s = span.slice();
  // a dangling operator at either end belongs to the words around it
  while (s.length && ["+", "*", "/", "^", "-"].includes(s[0]!) && !(s[0] === "-" && /^\d/.test(s[1] ?? ""))) s = s.slice(1);
  while (s.length && OPERATORS.has(s[s.length - 1]!) && s[s.length - 1] !== ")") s = s.slice(0, -1);
  return s;
}

function sentences(tokens: string[]): Array<{ tokens: string[]; question: boolean }> {
  const out: Array<{ tokens: string[]; question: boolean }> = [];
  let cur: string[] = [];
  for (const t of tokens) {
    if (t === "." || t === "!" || t === "?" || t === ";") {
      if (cur.length) out.push({ tokens: cur, question: t === "?" });
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) out.push({ tokens: cur, question: false });
  return out;
}

const QUESTION_STARTS = new Set(["what", "which", "how", "why", "can", "could", "do", "does", "did", "would", "will", "should", "where", "when", "who"]);

interface Claim { lhs: string[]; rhs: string[]; text: string }

/** Equations stated in a sentence: maximal runs of maths on both sides of "=". */
function claimsIn(tokens: string[]): Claim[] {
  const claims: Claim[] = [];
  tokens.forEach((t, idx) => {
    if (t !== "=") return;
    let j = idx - 1;
    while (j >= 0 && isMathToken(tokens[j]!, tokens[j - 1], tokens[j + 1])) j--;
    let k = idx + 1;
    while (k < tokens.length && isMathToken(tokens[k]!, tokens[k - 1], tokens[k + 1])) k++;
    const lhs = trimSpan(tokens.slice(j + 1, idx));
    const rhs = trimSpan(tokens.slice(idx + 1, k));
    if (!lhs.length || !rhs.length) return;
    claims.push({ lhs, rhs, text: `${spanText(lhs)} = ${spanText(rhs)}` });
  });
  return claims;
}

function numbersOf(tokens: string[]): number[] {
  return tokens.filter((t) => /^\d+(\.\d+)?$/.test(t)).map(Number);
}

/** Every number in reviewed text, read the same way as the tutor's words. */
export function numbersInText(text: string): number[] {
  return numbersOf(spokenTokens(text));
}

const isUnknown = (span: string[]) => span.length === 1 && /^[a-z]$/.test(span[0]!);

// ---------------------------------------------------------------- reviewed formulas (rule D)

const FORMULA_NOUNS = /\b(area|perimeter)\b/;
/** Each entry: the shape, and what the formula may say after "=", with "the", "a" and "an" removed. */
const REVIEWED_FORMULAS: Array<{ shape: RegExp; forms: RegExp[] }> = [
  { shape: /\barea of (rectangle|rectangular \w+)\b/, forms: [/^(length|l) \* (breadth|width|b|w)$/, /^(breadth|width|b|w) \* (length|l)$/] },
  { shape: /\barea of square\b/, forms: [/^side \* side$/, /^side \^ 2$/, /^s \* s$/, /^s \^ 2$/] },
  { shape: /\barea of parallelogram\b/, forms: [/^base \* (perpendicular |vertical )?height$/, /^(perpendicular |vertical )?height \* base$/, /^b \* h$/] },
  { shape: /\barea of triangle\b/, forms: [/^1 \/ 2 \* (base \* (perpendicular |vertical )?height|b \* h)$/, /^1 \/ 2 \* \( ?base \* height ?\)$/, /^base \* height \/ 2$/, /^1 \/ 2 base \* height$/] },
  { shape: /\barea of trapezi(um|a|um s)\b/, forms: [/^1 \/ 2 \* (\( )?(sum of parallel sides|a \+ b)( \))? \* (perpendicular |vertical )?height$/, /^1 \/ 2 \* (\( )?(sum of parallel sides|a \+ b)( \))? \* h$/] },
  { shape: /\bperimeter of rectangle\b/, forms: [/^2 \* \( ?(length|l) \+ (breadth|width|b|w) ?\)$/, /^2 \* (length|l) \+ 2 \* (breadth|width|b|w)$/] },
  { shape: /\bperimeter of square\b/, forms: [/^4 \* (side|s)$/] },
];

function formulaProblem(tokens: string[]): string | null {
  const words = tokens.filter((t) => t !== "the" && t !== "a" && t !== "an").join(" ");
  if (!FORMULA_NOUNS.test(words) || !words.includes("=")) return null;
  if (!/[*+/^]/.test(words) && !/\b1 \/ 2\b/.test(words)) return null; // "the area is 24" is a number, handled by rules B and C
  const entry = REVIEWED_FORMULAS.find((f) => f.shape.test(words));
  const said = words.slice(words.indexOf("=") + 1).replace(/[,]/g, "").trim();
  if (!entry) return `states a formula I can't check: "${words}"`;
  return entry.forms.some((re) => re.test(said)) ? null : `states a formula that isn't the reviewed one: "${words}"`;
}

// ---------------------------------------------------------------- the check

function verifyClaim(claim: Claim, problems: string[], backed: Set<number>): boolean {
  if (isUnknown(claim.lhs) !== isUnknown(claim.rhs) && (isUnknown(claim.lhs) ? !claim.rhs.some((t) => /^[a-z]$/.test(t)) : !claim.lhs.some((t) => /^[a-z]$/.test(t)))) {
    problems.push(`gives the value of an unknown ("${claim.text}"): give a hint instead of solving`);
    return false;
  }
  let same: boolean;
  try {
    same = algebraicallyEqual(spanText(claim.lhs), spanText(claim.rhs));
  } catch {
    problems.push(`states maths I couldn't check: "${claim.text}"`);
    return false;
  }
  if (!same) { problems.push(`says "${claim.text}", which is not true`); return false; }
  for (const n of [...numbersOf(claim.lhs), ...numbersOf(claim.rhs)]) backed.add(n);
  return true;
}

/** The answer as a number when it is one ("14", "14.0", "x = 14", "₹ 12"); null for an expression or fraction. */
function answerNumbers(answer: string): number | null {
  const text = (finalAnswerText(answer) || answer).replace(/[₹,\s]/g, "").replace(/(cm|m|units?|sq\.?\w*)$/i, "");
  return /^[-+]?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

export function checkSpokenMaths(say: string, listed: string[], facts: MathsFacts): MathsVerdict {
  const problems: string[] = [];
  let claimsChecked = 0;
  // Small counting numbers are free, and so is 1098, Childline India: the tutor's safety line names it.
  const backed = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, CHILDLINE_NUMBER]);
  for (const g of facts.grounded) for (const n of numbersInText(g)) backed.add(n);

  // equations the model listed: they must be true too, and back the numbers they use
  for (const item of listed) {
    const tokens = spokenTokens(item);
    for (const claim of claimsIn(tokens)) if (verifyClaim(claim, problems, backed)) claimsChecked++;
  }

  const tokens = spokenTokens(say);
  const parts = sentences(tokens);
  for (const part of parts) {
    // A question asserts nothing ("What is twelve times twelve?"); its numbers are still checked below.
    const asks = part.question || QUESTION_STARTS.has(part.tokens[0] ?? "");
    if (!asks) {
      for (const claim of claimsIn(part.tokens)) if (verifyClaim(claim, problems, backed)) claimsChecked++;
      const f = formulaProblem(part.tokens);
      if (f) problems.push(f);
    }
  }

  // rule B: every number backed
  const said = numbersOf(tokens);
  for (const n of [...new Set(said)]) if (!backed.has(n)) problems.push(`mentions ${n}, which isn't in the question, its hints or a checked step`);

  // rule C: never the answer
  const questionNumbers = new Set(facts.question ? numbersInText(facts.question) : []);
  for (const answer of facts.answers) {
    const value = answerNumbers(answer);
    if (value !== null) {
      if (questionNumbers.has(value)) continue; // the answer is also in the question: only "x = …" (rule A) catches it
      const hits = tokens.map((t, i) => ({ t, i })).filter(({ t }) => /^\d/.test(t) && Number(t) === value);
      // a small answer may also be a counting word ("two numbers"); only maths next to it counts then
      const leak = hits.some(({ i }) => value > 10 || ["+", "-", "*", "/", "^", "="].includes(tokens[i - 1] ?? "") || ["+", "-", "*", "/", "^", "="].includes(tokens[i + 1] ?? ""));
      if (leak) problems.push(`gives away the answer (${value})`);
      continue;
    }
    // an expression answer: no run of maths equal to it, and not all of its own numbers
    const own = numbersInText(answer).filter((n) => n > 1 && !questionNumbers.has(n));
    if (own.length && own.every((n) => said.includes(n))) { problems.push("gives away the answer (all of its numbers)"); continue; }
    let start = -1;
    for (let i = 0; i <= tokens.length; i++) {
      const math = i < tokens.length && isMathToken(tokens[i]!, tokens[i - 1], tokens[i + 1]) && tokens[i] !== "=";
      if (math && start < 0) start = i;
      if (!math && start >= 0) {
        const span = trimSpan(tokens.slice(start, i));
        start = -1;
        if (span.length < 3) continue;
        try { if (algebraicallyEqual(spanText(span), answer)) { problems.push("gives away the answer"); break; } } catch { /* not algebra */ }
      }
    }
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)], claimsChecked };
}
