/**
 * "Confirm your input": how a typed factorisation is read back to the student
 * before it is marked. Pure and shared, so the screen and the server read the
 * same text the same way. It only describes how the typing was understood, never
 * whether the maths is right.
 */
export type LotusReadbackFlagCode = "X2_AMBIGUOUS" | "OPEN_BRACKET" | "EXTRA_BRACKET" | "READS_AS_SUM";

export interface LotusReadbackFlag {
  code: LotusReadbackFlagCode;
  /** Plain text for the student. */
  text: string;
}

export interface LotusReadback {
  /** The text that will be marked: the typing with its small, stated repairs applied. ASCII algebra. */
  read: string;
  flags: LotusReadbackFlag[];
  /** Two brackets multiplied, when the typing reads as a sum of that shape; else null. */
  suggestion: string | null;
}

const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/** ASCII algebra as a textbook shows it: x^2+5x → x² + 5x. */
export function prettyReadback(text: string): string {
  return text
    .replace(/\^([0-9]+)/g, (_, d: string) => [...d].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)]).join(""))
    .replace(/\*/g, " · ")
    .replace(/-/g, " − ")
    .replace(/\+/g, " + ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function readbackTyped(raw: string): LotusReadback {
  let s = raw.replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (sup) => `^${[...sup].map((c) => SUPERSCRIPT[c]).join("")}`);
  const flags: LotusReadbackFlag[] = [];
  const open = (s.match(/\(/g) ?? []).length;
  const close = (s.match(/\)/g) ?? []).length;
  if (/[a-z]2(?!\d)/.test(s) && !s.includes("^")) {
    flags.push({ code: "X2_AMBIGUOUS", text: "“x2” could be x² or x × 2. Read as x²." });
    s = s.replace(/([a-z])2(?!\d)/g, "$1^2");
  }
  if (open > close) {
    flags.push({ code: "OPEN_BRACKET", text: `${open - close === 1 ? "A bracket is" : "Brackets are"} left open. Closed at the end.` });
    s += ")".repeat(open - close);
  }
  if (close > open) flags.push({ code: "EXTRA_BRACKET", text: "There is an extra closing bracket." });
  let suggestion: string | null = null;
  const m = /^([a-z][+-]\d+)\(([a-z][+-]\d+)\)$/.exec(s);
  if (m && m[1]![0] === m[2]![0]) {
    suggestion = `(${m[1]})(${m[2]})`;
    flags.push({ code: "READS_AS_SUM", text: `This reads as a sum, not two brackets multiplied. Did you mean ${prettyReadback(suggestion)}?` });
  }
  return { read: s, flags, suggestion };
}
