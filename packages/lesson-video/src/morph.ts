/**
 * Carry: which terms of one line of maths are the same terms in the next line.
 * Pure text matching, so the video kit and the web draw the same motion. It
 * never changes or checks mathematics; it only decides what travels.
 */

/** A line split into numbers, words, single letters (variables), single symbols and the spaces between them. */
export function tokenize(line: string): string[] {
  return line.match(/\s+|\d+(?:\.\d+)?|[A-Za-z]{2,}|[^\s\d]/gu) ?? [];
}

const isSpace = (t: string) => /^\s+$/.test(t);
/** Only numbers and letters travel out of order; an operator or bracket in a new place is a new one. */
const isOperand = (t: string) => /[\dA-Za-z]/.test(t);

/** For each token of `next`: the index of the `prev` token it is the same term as, or -1 if it is new. */
export function carry(prev: string[], next: string[]): number[] {
  const from = new Array<number>(next.length).fill(-1);
  const a = prev.map((t, i) => ({ t, i })).filter((x) => !isSpace(x.t));
  const b = next.map((t, i) => ({ t, i })).filter((x) => !isSpace(x.t));

  // Terms that kept their order: the longest common subsequence.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i]!.t === b[j]!.t ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const used = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i]!.t === b[j]!.t) { from[b[j]!.i] = a[i]!.i; used.add(a[i]!.i); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }

  // Terms that moved (the 5 that crosses the equals sign): same text, first one still free.
  for (const { t, i } of b) {
    if (from[i] !== -1 || !isOperand(t)) continue;
    const source = a.find((x) => x.t === t && !used.has(x.i));
    if (source) { from[i] = source.i; used.add(source.i); }
  }
  return from;
}
