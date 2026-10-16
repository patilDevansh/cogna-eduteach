/**
 * Turns maths as students read it (x², −3, (x + 2)(x − 4)) into words a
 * text-to-speech voice says clearly ("x squared", "minus 3", "x plus 2,
 * times x minus 4"). Shared by "Read it to me" in Lotus and lesson narration.
 */
export function spokenMath(text: string): string {
  return String(text)
    .replace(/\)\s*\(/g, ", times ")
    .replace(/([\da-z])\(/g, "$1 times ")
    .replace(/[()]/g, " ")
    .replace(/\^2|²/g, " squared")
    .replace(/\^3|³/g, " cubed")
    .replace(/\^(\d+)/g, " to the power $1")
    .replace(/×/g, " times ")
    .replace(/÷|\//g, " divided by ")
    .replace(/\s=\s/g, " equals ")
    .replace(/[−–]\s?/g, " minus ")
    .replace(/(^|\s)-\s?(?=[\dA-Za-z])/g, "$1minus ")
    .replace(/\s-\s/g, " minus ")
    .replace(/\+\s?/g, " plus ")
    .replace(/(\d)([a-z])\b/g, "$1 $2")
    .replace(/\s+([,.?!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
