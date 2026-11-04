/** How many of `units` pieces of art to draw. */
export function artSteps(answered: number, units: number, total?: number, complete?: boolean): number {
  if (complete) return units;
  if (!total || total <= 0) return Math.min(answered, units);
  return Math.min(units - 1, Math.floor((Math.min(answered, total) / total) * units));
}
