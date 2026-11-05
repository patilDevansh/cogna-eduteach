/** ASCII algebra (x^2, " - ") shown the way a textbook writes it. */
export function prettyAlgebra(text: string): string {
  return text
    .replace(/\^(\d+)/g, (_, digits: string) => [...digits].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]).join(""))
    .replace(/ - /g, " − ")
    .replace(/(^|\()-/g, "$1−")
    .replace(/\*/g, "×");
}

