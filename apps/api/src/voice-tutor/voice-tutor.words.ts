import { isNumberWord, UNIT_WORDS } from "./voice-tutor.maths";

/**
 * The student's own words for maths, so the tutor can say maths back the way they do ("one upon two",
 * "six into four", "x square") instead of the app's defaults ("divided by", "times", "squared").
 *
 * Only correct maths phrasings from a fixed list are ever picked up: never slang, filler or casual talk,
 * and never a mistake. A slip of grammar is mirrored in its correct form ("1 divides by 2" → "divided by").
 * A phrasing counts only between two pieces of maths ("3 over 4"), so "go over it" is not one.
 * The latest phrasing the student used for each operation wins.
 *
 * ponytail: "by" alone ("three by four") is left out because it also means a size ("x by 6");
 * add it when the turn can tell a fraction from a size.
 */
export interface MathsWords {
  divide?: "divided by" | "over" | "upon";
  times?: "times" | "into" | "multiplied by";
  square?: "squared" | "square";
}

// a single letter is an unknown, except the words "a" and "i" (as in voice-tutor.maths.ts)
const isOperand = (w: string | undefined) => !!w && (/^\d/.test(w) || /^[b-hj-z]$/.test(w) || isNumberWord(w));

export function mathsWords(studentSaid: string[]): MathsWords {
  const found: MathsWords = {};
  for (const said of studentSaid) {
    const w = said.toLowerCase().replace(/[−–—]/g, "-").match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [];
    for (let i = 1; i < w.length; i++) {
      const before = w[i - 1], word = w[i]!, after = w[i + 1], afterBy = w[i + 1] === "by" ? w[i + 2] : undefined;
      if (!isOperand(before)) continue;
      if ((word === "over" || word === "upon") && isOperand(after)) found.divide = word;
      else if (/^divid(e|es|ed|ing)$/.test(word) && isOperand(afterBy)) found.divide = "divided by";
      else if ((word === "times" || word === "into") && isOperand(after)) found.times = word;
      else if (/^multipl(y|ies|ied|ying)$/.test(word) && isOperand(afterBy)) found.times = "multiplied by";
      else if (word === "squared") found.square = "squared";
      else if (word === "square" && after !== "root" && !UNIT_WORDS.test(after ?? "")) found.square = "square";
    }
  }
  return found;
}

/** The line added to the tutor's instructions, or null when the student hasn't said any maths yet. */
export function wordsNote(words: MathsWords): string | null {
  const parts = [
    words.divide && `"${words.divide}" for a fraction or division (1/2 is "one ${words.divide} two")`,
    words.times && `"${words.times}" for times`,
    words.square && `"${words.square}" for a power of two ("x ${words.square}")`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return `The student says maths in these words: ${parts.join(", ")}. Say maths the same way they do. ` +
    `Now and then, link their words to how it is written ("one ${words.divide ?? "over"} two, which we write as 1/2"). ` +
    "Copy only these maths words, never their slang or casual talk.";
}
