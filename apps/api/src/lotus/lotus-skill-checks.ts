import type { LotusPredictedMistake, LotusQuestion } from "@cogna/shared";
import { assertFixedItemIsValid, skillName } from "./lotus-factorisation-catalogue";

/**
 * Question families for the skills no live question tests on its own.
 *
 * Each family is a short, code-made check on ONE skill: 10 to 20 seconds, no
 * working asked for, built from a seed so every child can get a fresh variant.
 * A family has several conditions (the forms the skill shows up in), so two
 * questions from it test the skill in different conditions. Every answer is
 * worked out by code, every wrong answer is a named mistake the skill lists,
 * and every item must pass assertFixedItemIsValid (the algebra engine proves
 * written answers; numbers are proved by their check) before it is returned.
 * Anything that does not check out returns null.
 *
 * These are a bank of verified questions. They are not yet placed in the live
 * test's 25 slots; wiring them in is a separate change checked against the
 * simulated-student scorecard.
 */

type Item = Omit<LotusQuestion, "id">;
type Level = "easy" | "medium" | "hard";
type Mistake = LotusPredictedMistake;

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
function shuffle<T>(r: Rand, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}
function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** Student-facing: a real minus sign, and ² / ³ style powers. */
const shown = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) => String(n).split("").map((d) => SUP[Number(d)]).join("");
const pretty = (text: string) => text.replace(/\^(\d)/g, (_, d) => sup(Number(d))).replace(/ - /g, " − ").replace(/^-/, "−").replace(/\(-/g, "(−");
/** ASCII polynomial pieces the algebra engine reads. */
const term = (n: number, body: string, first = false) => {
  const sign = n < 0 ? "-" : "+";
  const mag = Math.abs(n) === 1 && body ? "" : String(Math.abs(n));
  return first ? `${n < 0 ? "-" : ""}${mag}${body}` : ` ${sign} ${mag}${body}`;
};
const quad = (a: number, b: number, c: number) => {
  const parts: string[] = [];
  if (a) parts.push(term(a, "x^2", parts.length === 0));
  if (b) parts.push(term(b, "x", parts.length === 0));
  if (c) parts.push(term(c, "", parts.length === 0));
  return parts.join("") || "0";
};
const bracket = (m: number, v = "x") => (m < 0 ? `(${v} - ${-m})` : `(${v} + ${m})`);

export interface SkillFamily {
  skillId: string;
  /** The forms this skill shows up in; each is a separate piece of evidence. */
  conditions: string[];
  level: Level;
  build: (rand: Rand, condition: string) => Item | null;
}

function head(skillId: string, level: Level, prompt: string) {
  return { phase: "DIAGNOSE" as const, subtopic: skillName(skillId), prompt, purpose: `Test: ${skillName(skillId)} (short check)`, asksForWorking: false };
}
function clean(skillId: string, mistakes: Mistake[], key: string): Mistake[] {
  const seen = new Set<string>([key]);
  return mistakes.filter((m) => { if (seen.has(m.answer)) return false; seen.add(m.answer); return true; });
}
function numberItem(skillId: string, level: Level, prompt: string, answer: number, check: string, worked: string[], wrong: Array<[number, string]>): Item {
  const key = String(answer);
  return {
    ...head(skillId, level, prompt), type: "CONSTRUCTED_RESPONSE",
    answerKey: {
      kind: "OPEN_RESPONSE", canonicalAnswer: key, workedSolution: worked,
      diagnostics: {
        itemKind: "NUMBER", check, skillId, taggedSkills: [], stepSkills: worked.map(() => skillId), level, origin: "CODE",
        predictedMistakes: clean(skillId, wrong.map(([a, mistake]) => ({ answer: String(a), mistake })), key),
      },
    },
  };
}
function choiceItem(skillId: string, level: Level, prompt: string, key: string, wrong: Array<[string, string | null]>, worked: string[], r: Rand): Item | null {
  const options = [key, ...wrong.map(([a]) => a)];
  if (options.length !== 4 || new Set(options).size !== 4) return null;
  return {
    ...head(skillId, level, prompt), type: "MULTIPLE_CHOICE", options: shuffle(r, options),
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: key, workedSolution: worked,
      diagnostics: {
        itemKind: "CHOICE", skillId, taggedSkills: [], stepSkills: worked.map(() => skillId), level, origin: "CODE",
        predictedMistakes: wrong.flatMap(([answer, mistake]) => (mistake ? [{ answer, mistake }] : [])),
      },
    },
  };
}
function expandItem(skillId: string, level: Level, expression: string, answer: string, worked: string[], wrong: Array<[string, string]>): Item {
  return {
    ...head(skillId, level, `Expand ${pretty(expression)}.`), type: "CONSTRUCTED_RESPONSE",
    answerKey: {
      kind: "OPEN_RESPONSE", canonicalAnswer: answer, workedSolution: worked,
      diagnostics: {
        itemKind: "EXPAND", expression, skillId, taggedSkills: [], stepSkills: worked.map(() => skillId), level, origin: "CODE",
        predictedMistakes: clean(skillId, wrong.map(([a, mistake]) => ({ answer: a, mistake })), answer),
      },
    },
  };
}
function factoriseItem(skillId: string, level: Level, expression: string, answer: string, worked: string[], wrong: Array<[string, string]>): Item {
  return {
    ...head(skillId, level, `Factorise ${pretty(expression)}.`), type: "CONSTRUCTED_RESPONSE",
    answerKey: {
      kind: "OPEN_RESPONSE", canonicalAnswer: answer, workedSolution: worked,
      diagnostics: {
        itemKind: "FACTORISE", expression, skillId, taggedSkills: [], stepSkills: worked.map(() => skillId), level, origin: "CODE",
        predictedMistakes: clean(skillId, wrong.map(([a, mistake]) => ({ answer: a, mistake })), answer),
      },
    },
  };
}
const magnitude = (r: Rand, lo = 2, hi = 9) => int(r, lo, hi);
/** Two different magnitudes whose product and sum differ, so no two wrong answers collide. */
function twoMagnitudes(r: Rand, lo = 3, hi = 9): [number, number] {
  for (let i = 0; i < 40; i++) { const a = magnitude(r, lo, hi), b = magnitude(r, lo, hi); if (a !== b && a * b !== a + b && Math.abs(a - b) > 1) return [a, b]; }
  return [3, 7];
}

// ---------- foundations: signed numbers ----------
const signMulDiv: SkillFamily = {
  skillId: "FND_SIGN_MUL_DIV", level: "easy",
  conditions: ["multiply, same signs", "multiply, different signs", "divide, same signs", "divide, different signs"],
  build(r, condition) {
    const [a, b] = twoMagnitudes(r);
    switch (condition) {
      case "multiply, same signs":
        return numberItem(this.skillId, this.level, `${shown(-a)} × ${shown(-b)} = ?`, a * b, `(-${a})*(-${b})`,
          [`Same signs multiply to a plus: ${a} × ${b} = ${a * b}`], [[-a * b, "SIGN_PRODUCT_ERROR"], [-(a + b), "ADDED_INSTEAD"]]);
      case "multiply, different signs":
        return numberItem(this.skillId, this.level, `${shown(-a)} × ${b} = ?`, -a * b, `(-${a})*${b}`,
          [`Different signs multiply to a minus: ${a} × ${b} = ${a * b}, so ${-a * b}`], [[a * b, "SIGN_PRODUCT_ERROR"], [b - a, "ADDED_INSTEAD"]]);
      case "divide, same signs": {
        const q = magnitude(r), d = magnitude(r);
        return numberItem(this.skillId, this.level, `${shown(-q * d)} ÷ ${shown(-d)} = ?`, q, `(-${q * d})/(-${d})`,
          [`Same signs divide to a plus: ${q * d} ÷ ${d} = ${q}`], [[-q, "SIGN_PRODUCT_ERROR"]]);
      }
      case "divide, different signs": {
        const q = magnitude(r), d = magnitude(r);
        return numberItem(this.skillId, this.level, `${q * d} ÷ ${shown(-d)} = ?`, -q, `${q * d}/(-${d})`,
          [`Different signs divide to a minus: ${q * d} ÷ ${d} = ${q}, so ${-q}`], [[q, "SIGN_PRODUCT_ERROR"]]);
      }
    }
    return null;
  },
};

const signAddSub: SkillFamily = {
  skillId: "FND_SIGN_ADD_SUB", level: "easy",
  conditions: ["add, same signs", "add, different signs", "subtract a negative", "subtract a bigger number"],
  build(r, condition) {
    const [a, b] = twoMagnitudes(r, 3, 12);
    switch (condition) {
      case "add, same signs":
        return numberItem(this.skillId, this.level, `${shown(-a)} + (${shown(-b)}) = ?`, -(a + b), `(-${a})+(-${b})`,
          [`Both negative, so add the sizes and keep the minus: ${-(a + b)}`], [[a + b, "SIGN_SUM_ERROR"], [-Math.abs(a - b), "SIGN_SUM_ERROR"]]);
      case "add, different signs":
        return numberItem(this.skillId, this.level, `${shown(-a)} + ${b} = ?`, b - a, `(-${a})+${b}`,
          [`Different signs: subtract the sizes, keep the sign of the bigger: ${b - a}`], [[a - b, "SIGN_SUM_ERROR"], [-(a + b), "SIGN_SUM_ERROR"]]);
      case "subtract a negative":
        return numberItem(this.skillId, this.level, `${a} − (${shown(-b)}) = ?`, a + b, `${a}-(-${b})`,
          [`Taking away a negative adds: ${a} + ${b} = ${a + b}`], [[a - b, "SIGN_SUM_ERROR"], [-(a + b), "SIGN_SUM_ERROR"]]);
      case "subtract a bigger number": {
        const [small, big] = a < b ? [a, b] : [b, a];
        return numberItem(this.skillId, this.level, `${small} − ${big} = ?`, small - big, `${small}-${big}`,
          [`${big} is bigger, so the answer is negative: ${small - big}`], [[big - small, "SIGN_SUM_ERROR"], [-(small + big), "SIGN_SUM_ERROR"]]);
      }
    }
    return null;
  },
};

// ---------- foundations: factor pairs, HCF, powers ----------
const NON_SQUARES = [6, 10, 12, 14, 15, 18, 20, 21, 22, 24, 26];
function divisorCount(n: number) { let d = 0; for (let i = 1; i <= n; i++) if (n % i === 0) d++; return d; }
const factorPairs: SkillFamily = {
  skillId: "FND_FACTOR_PAIRS", level: "easy",
  conditions: ["count the pairs", "partner of a negative"],
  build(r, condition) {
    if (condition === "count the pairs") {
      const n = pick(r, NON_SQUARES), d = divisorCount(n); // not a square, so d pairs: d/2 positive and d/2 negative
      return choiceItem(this.skillId, this.level,
        `How many different pairs of whole numbers multiply to ${n}? Count negative pairs too, and count 3 × 4 and 4 × 3 as the same pair.`,
        String(d), [[String(d / 2), "NO_NEGATIVE_PAIRS"], [String(d - 1), "MISSED_PAIR"], [String(d + 2), null]],
        [`The positive pairs: ${d / 2}`, `Each has a negative twin, so ${d / 2} × 2 = ${d}`], r);
    }
    if (condition === "partner of a negative") {
      const [a, b] = twoMagnitudes(r, 2, 9);
      return numberItem(this.skillId, this.level, `What goes in the box?  ${shown(-a)} × □ = ${a * b}`, -b, `(-${a})*x = ${a * b}`,
        [`A negative times a negative is a plus, so the partner is ${shown(-b)}`], [[b, "NO_NEGATIVE_PAIRS"]]);
    }
    return null;
  },
};

const hcf: SkillFamily = {
  skillId: "FND_GCD_NUMERIC", level: "easy",
  conditions: ["two numbers", "three numbers"],
  build(r, condition) {
    const g = pick(r, [4, 6, 8, 9, 12]);
    const ms = condition === "two numbers" ? pick(r, [[2, 3], [3, 4], [2, 5], [3, 5], [4, 5]]) : pick(r, [[2, 3, 5], [2, 3, 7], [3, 4, 5]]);
    if (!ms) return null;
    const nums = ms.map((m) => g * m);
    const smallest = [2, 3, 5, 7].find((p) => g % p === 0)!;
    const common = g / smallest;
    const l = nums.reduce((acc, n) => lcm(acc, n));
    return numberItem(this.skillId, this.level, `Find the HCF of ${nums.join(", ")}.`, g, `${nums[0]}/${ms[0]}`,
      [`The highest number that divides all of them is ${g}`], [[l, "GAVE_LCM"], [common, "COMMON_NOT_HIGHEST"]]);
  },
};

const gcfNumeric: SkillFamily = {
  skillId: "FAC_GCF_NUMERIC", level: "easy",
  conditions: ["two terms", "three terms", "one term is only a number"],
  build(r, condition) {
    const g = pick(r, [4, 6, 8, 9, 12]);
    const smallest = [2, 3, 5, 7].find((p) => g % p === 0)!;
    let expr: string, coeffs: number[];
    if (condition === "two terms") { const [m1, m2] = pick(r, [[2, 3], [3, 4], [2, 5], [3, 5]]); coeffs = [g * m1, g * m2]; expr = `${coeffs[0]}x + ${coeffs[1]}y`; }
    else if (condition === "three terms") { const [m1, m2, m3] = pick(r, [[2, 3, 5], [2, 3, 7], [3, 4, 5]]); coeffs = [g * m1, g * m2, g * m3]; expr = `${coeffs[0]}x^2 + ${coeffs[1]}x + ${coeffs[2]}`; }
    else { const [m1, m2] = pick(r, [[2, 3], [3, 4], [2, 5], [3, 5]]); coeffs = [g * m1, g * m2]; expr = `${coeffs[0]}x + ${coeffs[1]}`; }
    const l = coeffs.reduce((acc, n) => lcm(acc, n));
    return numberItem(this.skillId, this.level, `What is the highest number that divides every term of ${pretty(expr)}?`, g, `${coeffs[0]}/${coeffs[0] / g}`,
      [`The coefficients ${coeffs.join(", ")} share the highest factor ${g}`], [[l, "GAVE_LCM"], [g / smallest, "COMMON_NOT_HIGHEST"]]);
  },
};

const exponentProduct: SkillFamily = {
  skillId: "FND_EXPONENT_PRODUCT", level: "easy",
  conditions: ["two powers", "a power and x", "three powers"],
  build(r, condition) {
    const a = int(r, 2, 6), b = int(r, 2, 6);
    if (condition === "two powers") {
      if (a === b) return null;
      return numberItem(this.skillId, this.level, `x${sup(a)} · x${sup(b)} = xⁿ.  What is n?`, a + b, `${a}+${b}`,
        [`Multiplying powers adds the indices: ${a} + ${b} = ${a + b}`], [[a * b, "MULTIPLIED_EXPONENTS"], [Math.abs(a - b), "SUBTRACTED_EXPONENTS"]]);
    }
    if (condition === "a power and x") {
      return numberItem(this.skillId, this.level, `x${sup(a)} · x = xⁿ.  What is n?`, a + 1, `${a}+1`,
        [`x is x¹, so the indices add: ${a} + 1 = ${a + 1}`], [[a, "MULTIPLIED_EXPONENTS"], [a - 1, "SUBTRACTED_EXPONENTS"]]);
    }
    if (condition === "three powers") {
      const c = int(r, 2, 5);
      if (a === b || b === c || a === c) return null;
      return numberItem(this.skillId, this.level, `x${sup(a)} · x${sup(b)} · x${sup(c)} = xⁿ.  What is n?`, a + b + c, `${a}+${b}+${c}`,
        [`Add all the indices: ${a} + ${b} + ${c} = ${a + b + c}`], [[a * b * c, "MULTIPLIED_EXPONENTS"], [Math.abs(a - b) + c, "SUBTRACTED_EXPONENTS"]]);
    }
    return null;
  },
};

const lowestPower: SkillFamily = {
  skillId: "FND_MIN_EXP_COMMON", level: "easy",
  conditions: ["three terms", "two terms", "one term is only x"],
  build(r, condition) {
    let powers: number[];
    if (condition === "three terms") powers = shuffle(r, [2, 3, 4, 5, 6]).slice(0, 3);
    else if (condition === "two terms") powers = shuffle(r, [2, 3, 4, 5, 6]).slice(0, 2);
    else powers = [1, int(r, 3, 6)];
    const min = Math.min(...powers), max = Math.max(...powers);
    const expr = powers.map((p) => `x${p === 1 ? "" : "^" + p}`).join(" + ");
    return numberItem(this.skillId, this.level,
      `What is the highest power of x that divides every term of ${pretty(expr)}?  Answer with the power, like 2 for x².`, min, `${min}`,
      [`Every term has at least x${sup(min)}, and the lowest power decides`], [[max, "TOOK_HIGHEST_POWER"], ...(min > 1 ? [[min - 1, "COMMON_NOT_HIGHEST"] as [number, string]] : [])]);
  },
};

const recogniseSquare: SkillFamily = {
  skillId: "FND_RECOGNISE_SQUARE", level: "medium",
  conditions: ["square root of a number and letter", "square root of a number", "spot the perfect square"],
  build(r, condition) {
    const n = int(r, 3, 12);
    const sq = n * n;
    if (condition === "square root of a number and letter") {
      return choiceItem(this.skillId, this.level, `What is the square root of ${sq}a²?`, `${n}a`,
        [[`${n}a²`, "ROOTED_NUMBER_ONLY"], [`${sq}a`, "NOT_ROOTED"], [`${sq / 2}a`, "HALVED_NOT_ROOTED"]],
        [`√${sq} = ${n} and √(a²) = a`], r);
    }
    if (condition === "square root of a number") {
      return choiceItem(this.skillId, this.level, `What is the square root of ${sq}?`, String(n),
        [[String(sq), "NOT_ROOTED"], [String(sq / 2), "HALVED_NOT_ROOTED"], [String(2 * n), null]],
        [`${n} × ${n} = ${sq}`], r);
    }
    if (condition === "spot the perfect square") {
      return choiceItem(this.skillId, this.level, "Which of these is a perfect square?", `${sq}a²`,
        [[`${sq + 1}a²`, null], [`${2 * sq}a²`, null], [`${sq}a³`, null]],
        [`${sq} = ${n}² and a² is a square`], r);
    }
    return null;
  },
};

const identifyStructure: SkillFamily = {
  skillId: "ALG_IDENTIFY_STRUCTURE", level: "easy",
  conditions: ["a sum of terms", "one product", "a product inside a sum"],
  build(r, condition) {
    const m = int(r, 2, 6), k = int(r, 2, 7), c = int(r, 2, 9);
    if (condition === "a sum of terms") {
      const count = pick(r, [3, 4]);
      const a = int(r, 2, 6), b = int(r, 2, 6), d = int(r, 2, 6);
      const expr = count === 3 ? `${a}x^2 - ${b}x + ${c}` : `${a}x^2 - ${b}x + ${c} - ${d}`;
      return numberItem(this.skillId, this.level, `How many terms does ${pretty(expr)} have?`, count, `${count}`,
        [`Terms are separated by + and − signs: ${count}`], [[count - 1, "MISCOUNTED_TERMS"], [count + 1, "MISCOUNTED_TERMS"]]);
    }
    if (condition === "one product") {
      const expr = pick(r, [`${m}x(x - ${k})`, `(x + ${k})(x - ${c})`, `${m}(x + ${k})`]);
      return numberItem(this.skillId, this.level, `How many terms does ${pretty(expr)} have?`, 1, "1",
        ["It is one product, so one term: the pieces multiplied together are factors, not terms"], [[2, "COUNTED_FACTORS_AS_TERMS"], [3, "MISCOUNTED_TERMS"]]);
    }
    if (condition === "a product inside a sum") {
      return numberItem(this.skillId, this.level, `How many terms does ${pretty(`${m}(x + ${k}) + ${c}`)} have?`, 2, "2",
        ["One term is the product, the other is the number: 2"], [[3, "COUNTED_FACTORS_AS_TERMS"], [1, "MISCOUNTED_TERMS"]]);
    }
    return null;
  },
};

// ---------- expanding ----------
const expandSingle: SkillFamily = {
  skillId: "EXP_EXPAND_SINGLE", level: "easy",
  conditions: ["number outside", "letter outside", "negative outside"],
  build(r, condition) {
    const m = pick(r, [2, 3, 4, 5, 6, 7]);
    const k = int(r, 2, 5);
    if (condition === "number outside") {
      const sign = pick(r, [1, -1]);
      const expr = `${k}(x ${sign < 0 ? "-" : "+"} ${m})`;
      return expandItem(this.skillId, this.level, expr, `${k}x ${sign < 0 ? "-" : "+"} ${k * m}`,
        [`${k} × x = ${k}x`, `${k} × ${sign * m} = ${sign * k * m}`],
        [[`${k}x ${sign < 0 ? "-" : "+"} ${m}`, "FIRST_TERM_ONLY"], [`${k + k * m * sign}x`, "COMBINED_UNLIKE_TERMS"]]);
    }
    if (condition === "letter outside") {
      const expr = `${k}x(x + ${m})`;
      return expandItem(this.skillId, this.level, expr, `${k}x^2 + ${k * m}x`,
        [`${k}x × x = ${k}x²`, `${k}x × ${m} = ${k * m}x`],
        [[`${k}x^2 + ${m}`, "FIRST_TERM_ONLY"], [`${k}x + ${k * m}x`, "DROPPED_VARIABLE_POWER"], [`${k + k * m}x^3`, "COMBINED_UNLIKE_TERMS"]]);
    }
    if (condition === "negative outside") {
      const expr = `-${k}(x - ${m})`;
      return expandItem(this.skillId, this.level, expr, `-${k}x + ${k * m}`,
        [`−${k} × x = −${k}x`, `−${k} × −${m} = +${k * m}`],
        [[`-${k}x - ${m}`, "FIRST_TERM_ONLY"]]);
    }
    return null;
  },
};

const expandBinomials: SkillFamily = {
  skillId: "EXP_EXPAND_BINOMIALS", level: "medium",
  conditions: ["both plus", "one minus", "both minus"],
  build(r, condition) {
    const [p0, q0] = twoMagnitudes(r, 2, 8);
    const [p, q] = condition === "both plus" ? [p0, q0] : condition === "one minus" ? [p0, -q0] : [-p0, -q0];
    const s = p + q, prod = p * q;
    if (s === prod || s === 0) return null;
    return expandItem(this.skillId, this.level, `${bracket(p)}${bracket(q)}`, quad(1, s, prod),
      ["x · x = x²", `${shown(p)}x + ${shown(q)}x = ${shown(s)}x`, `${shown(p)} × ${shown(q)} = ${shown(prod)}`],
      [[quad(1, 0, prod), "FIRST_LAST_ONLY"], [quad(1, s, s), "ADDED_CONSTANTS"], [quad(1, prod, s), "SWAPPED_PRODUCT_SUM"]]);
  },
};

const identitiesForward: SkillFamily = {
  skillId: "ID_SQUARE_DIFF", level: "medium",
  conditions: ["square of a sum", "square of a difference"],
  build(r, condition) {
    const b = int(r, 2, 9);
    if (condition === "square of a sum") {
      return expandItem(this.skillId, this.level, `(x + ${b})^2`, quad(1, 2 * b, b * b),
        [`x²`, `2 × x × ${b} = ${2 * b}x`, `${b}² = ${b * b}`], [[quad(1, 0, b * b), "SQUARE_DISTRIBUTES"]]);
    }
    if (condition === "square of a difference") {
      return expandItem(this.skillId, this.level, `(x - ${b})^2`, quad(1, -2 * b, b * b),
        [`x²`, `−2 × x × ${b} = −${2 * b}x`, `${b}² = ${b * b}`],
        [[quad(1, 0, -b * b), "SQUARE_DISTRIBUTES"], [quad(1, 0, b * b), "DROPPED_MIDDLE_TERM"]]);
    }
    return null;
  },
};

// ---------- reading the trinomial and recognising identities ----------
const readAbc: SkillFamily = {
  skillId: "FAC_READ_ABC_SIGNS", level: "easy",
  conditions: ["negative b", "negative c", "negative b and c", "positive b and c"],
  build(r, condition) {
    const B = int(r, 2, 9), C = int(r, 2, 12);
    const [b, c] = condition === "negative b" ? [-B, C] : condition === "negative c" ? [B, -C] : condition === "negative b and c" ? [-B, -C] : [B, C];
    const expr = pretty(quad(1, b, c));
    const say = (x: number, y: number) => `b = ${shown(x)}, c = ${shown(y)}`;
    const variants: Array<[number, number]> = [[-b, c], [b, -c], [-b, -c]];
    // A sign is "dropped" only where the real number was negative and the option shows it positive.
    const keeps = (shown: number, real: number) => shown === real || (real < 0 && shown === -real);
    const wrong = variants.map(([x, y]): [string, string | null] => [say(x, y), keeps(x, b) && keeps(y, c) ? "DROPPED_SIGN" : null]);
    return choiceItem(this.skillId, this.level, `In ${expr}, what are b and c?  (The expression is x² + bx + c.)`, say(b, c), wrong,
      [`Each sign belongs to the number after it: b = ${shown(b)}, c = ${shown(c)}`], r);
  },
};

const reversePattern: SkillFamily = {
  skillId: "ID_REVERSE_PATTERN", level: "medium",
  conditions: ["three terms, plus", "three terms, minus", "two terms", "not an identity"],
  build(r, condition) {
    const a = pick(r, [1, 2, 3, 4, 5]), b = int(r, 2, 6);
    const PLUS = "a² + 2ab + b²", MINUS = "a² − 2ab + b²", DIFF = "a² − b²", NONE = "none of these";
    const all = [PLUS, MINUS, DIFF, NONE];
    let expr: string, key: string;
    if (condition === "three terms, plus") { expr = quad(a * a, 2 * a * b, b * b); key = PLUS; }
    else if (condition === "three terms, minus") { expr = quad(a * a, -2 * a * b, b * b); key = MINUS; }
    else if (condition === "two terms") { expr = quad(a * a, 0, -b * b); key = DIFF; }
    else { expr = quad(a * a, a * b + 1, b * b); key = NONE; }
    const rest = all.filter((o) => o !== key);
    return choiceItem(this.skillId, this.level, `Which pattern does ${pretty(expr)} match?`, key, rest.map((o): [string, string] => [o, "SHAPE_MISREAD"]),
      [`Count the terms, check the squares and the middle term`], r);
  },
};

// ---------- skills the live test already asks about: the forms it leaves out ----------
const exponentBases: SkillFamily = {
  skillId: "FND_EXPONENT_PRODUCT", level: "easy",
  conditions: ["two powers", "a power and x", "three powers", "numbers as bases"],
  build(r, condition) {
    if (condition !== "numbers as bases") return exponentProduct.build.call(exponentProduct, r, condition);
    const base = pick(r, [2, 3, 5]), a = int(r, 2, 5), b = int(r, 2, 5);
    if (a === b || a * b === a + b) return null;
    const p = (x: number, n: number) => `${x}${sup(n)}`;
    return choiceItem(this.skillId, this.level, `${p(base, a)} × ${p(base, b)} = ?`, p(base, a + b),
      [[p(base * base, a + b), "ADDED_BASES"], [p(base, a * b), "MULTIPLIED_EXPONENTS"], [p(base, Math.abs(a - b)), "SUBTRACTED_EXPONENTS"]],
      [`The base stays ${base}; the indices add: ${a} + ${b} = ${a + b}`], r);
  },
};

const commonBracket: SkillFamily = {
  skillId: "FAC_COMMON_BINOMIAL", level: "easy",
  conditions: ["the same bracket", "a reversed bracket"],
  build(r, condition) {
    const k = pick(r, [2, 3, 4, 5]), m = int(r, 2, 7), v = pick(r, ["y", "p", "a"]);
    if (condition === "the same bracket") {
      return factoriseItem(this.skillId, this.level, `${k}(x - ${m}) + ${v}(x - ${m})`, `(x - ${m})(${k} + ${v})`,
        [`(x − ${m}) is a factor of both parts`, `What is left over is ${k} + ${v}`],
        [[`(x - ${m})(${k}${v})`, "LEFTOVERS_MULTIPLIED"], [`${k}(x - ${m}) + ${v}(x - ${m})`, "BRACKET_NOT_SEEN_AS_FACTOR"]]);
    }
    if (condition === "a reversed bracket") {
      return factoriseItem(this.skillId, this.level, `${k}(x - ${m}) + ${v}(${m} - x)`, `(x - ${m})(${k} - ${v})`,
        [`(${m} − x) = −(x − ${m})`, `So ${v}(${m} − x) = −${v}(x − ${m}) and the left over is ${k} − ${v}`],
        [[`(x - ${m})(${k} + ${v})`, "REVERSED_BRACKET_MISSED"], [`(x - ${m})(${k}${v})`, "LEFTOVERS_MULTIPLIED"]]);
    }
    return null;
  },
};

const diffSquares: SkillFamily = {
  skillId: "FAC_DIFF_SQUARES", level: "medium",
  conditions: ["plain", "number in front", "spot a difference of squares"],
  build(r, condition) {
    const n = int(r, 2, 9);
    if (condition === "plain") {
      return factoriseItem(this.skillId, "easy", `x^2 - ${n * n}`, `(x - ${n})(x + ${n})`,
        [`x² − ${n * n} = x² − ${n}²`, `= (x − ${n})(x + ${n})`],
        [[`(x - ${n})^2`, "WROTE_PERFECT_SQUARE"], [`(x - ${n * n})(x + 1)`, "DROPPED_SQUARE"]]);
    }
    if (condition === "number in front") {
      const [p, q] = twoMagnitudes(r, 2, 9);
      return factoriseItem(this.skillId, this.level, `${p * p}a^2 - ${q * q}b^2`, `(${p}a - ${q}b)(${p}a + ${q}b)`,
        [`${p * p}a² = (${p}a)² and ${q * q}b² = (${q}b)²`, `= (${p}a − ${q}b)(${p}a + ${q}b)`],
        [[`(${p * p}a - ${q * q}b)(${p * p}a + ${q * q}b)`, "COEFFICIENT_NOT_ROOTED"], [`(${p}a - ${q}b)^2`, "WROTE_PERFECT_SQUARE"]]);
    }
    if (condition === "spot a difference of squares") {
      return choiceItem(this.skillId, this.level, "Which of these can be factorised as a difference of two squares?", `x² − ${n * n}`,
        [[`x² + ${n * n}`, "NOT_DIFF_OF_SQUARES"], [`x² − ${n * n + 1}`, "NOT_DIFF_OF_SQUARES"], [`x² − ${2 * n}x`, null]],
        [`${n * n} = ${n}², and the sign is a minus`], r);
    }
    return null;
  },
};

const perfectSquarePlus: SkillFamily = {
  skillId: "FAC_PERFECT_SQUARE_PLUS", level: "medium",
  conditions: ["plain", "check the middle term"],
  build(r, condition) {
    const n = int(r, 2, 9);
    if (condition === "plain") {
      return factoriseItem(this.skillId, "easy", quad(1, 2 * n, n * n), `(x + ${n})^2`,
        [`x² + ${2 * n}x + ${n * n} = x² + 2·x·${n} + ${n}²`, `= (x + ${n})²`],
        [[`(x + ${n * n})^2`, "SQUARED_WITHOUT_ROOT"], [`(x - ${n})(x + ${n})`, "WROTE_DIFF_OF_SQUARES"]]);
    }
    if (condition === "check the middle term") {
      return choiceItem(this.skillId, this.level, "Which of these is a perfect square, like (x + □)²?", pretty(quad(1, 2 * n, n * n)),
        [[pretty(quad(1, 2 * n + 2, n * n)), "MIDDLE_TERM_NOT_CHECKED"], [pretty(quad(1, 2 * n - 2, n * n)), "MIDDLE_TERM_NOT_CHECKED"], [pretty(quad(1, n * n, 2 * n)), null]],
        [`The middle term must be 2 × ${n} = ${2 * n}`], r);
    }
    return null;
  },
};

const chooseMethod: SkillFamily = {
  skillId: "FAC_CHOOSE_METHOD", level: "medium",
  conditions: ["take out a common factor first", "an identity doesn't fit"],
  build(r, condition) {
    const k = pick(r, [2, 3, 4, 5]), m = int(r, 2, 6);
    if (condition === "take out a common factor first") {
      return choiceItem(this.skillId, this.level, `What should you do first to factorise ${pretty(`${k}x^2 - ${k * m * m}`)}?`, `Take out the common factor ${k}`,
        [[`Use a² − b² straight away`, "SKIPPED_COMMON_FACTOR_CHECK"], [`Split the middle term`, null], [`It can't be factorised`, null]],
        [`Both terms are divisible by ${k}, so take that out first`], r);
    }
    if (condition === "an identity doesn't fit") {
      const sq = m * m;
      return choiceItem(this.skillId, this.level, `Riya wants to use a² − b² on x² + ${sq}. What should you tell her?`,
        "It doesn't fit: a sum of squares can't be factorised this way",
        [[`Use it: (x − ${m})(x + ${m})`, "IDENTITY_MISAPPLIED"], [`Use it: (x + ${m})(x + ${m})`, "IDENTITY_MISAPPLIED"], [`Take out ${m} first`, null]],
        ["a² − b² needs a minus between two squares; here it is a plus"], r);
    }
    return null;
  },
};

export const SKILL_FAMILIES: SkillFamily[] = [
  signMulDiv, signAddSub, factorPairs, readAbc, hcf, gcfNumeric, exponentBases, lowestPower,
  recogniseSquare, identifyStructure, expandSingle, expandBinomials, identitiesForward, reversePattern,
  commonBracket, diffSquares, perfectSquarePlus, chooseMethod,
];
const FAMILY_BY_SKILL = new Map(SKILL_FAMILIES.map((f) => [f.skillId, f]));

export function skillFamily(skillId: string): SkillFamily | undefined { return FAMILY_BY_SKILL.get(skillId); }
export const skillsWithFamily = (): string[] => SKILL_FAMILIES.map((f) => f.skillId);

/**
 * One checked question for a skill, from its family. The seed picks the numbers,
 * so a child never sees the same variant twice; the condition picks the form.
 * Returns null if the skill has no family or a variant did not check out.
 */
export function buildSkillCheck(skillId: string, seed: string, condition?: string): (Item & { condition: string }) | null {
  const family = FAMILY_BY_SKILL.get(skillId);
  if (!family) return null;
  const r = seeded(`${skillId}|${seed}`);
  const cond = condition ?? pick(r, family.conditions);
  if (!family.conditions.includes(cond)) return null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const item = family.build.call(family, r, cond);
    if (!item) continue;
    try { assertFixedItemIsValid(item, `${skillId}/${cond}`); } catch { continue; }
    return { ...item, condition: cond };
  }
  return null;
}
