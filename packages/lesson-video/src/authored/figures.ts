/**
 * Layout for the lesson pictures that aren't algebra: a labelled shape, a bar
 * or pie chart, and a coordinate grid. Pure numbers, so the slide player
 * (React 19) and the video renderer (React 18) draw the same picture.
 */

export interface Point { x: number; y: number }

/** Corners of a regular n-sided shape around (cx, cy), flat side at the bottom, clockwise from bottom-left. */
export function polygonCorners(n: number, cx: number, cy: number, r: number): Point[] {
  const start = Math.PI / 2 + Math.PI / n;
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

/** Where to write a corner's angle: a little way in from the corner, toward the centre. */
export function towardCentre(p: Point, cx: number, cy: number, by: number): Point {
  const dx = cx - p.x; const dy = cy - p.y; const d = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / d) * by, y: p.y + (dy / d) * by };
}

/** The missing angle of a polygon when exactly one is unknown (null), from (n − 2) × 180°. */
export function missingAngle(angles: Array<number | null>): number | null {
  const unknown = angles.filter((a) => a === null).length;
  if (unknown !== 1) return null;
  return (angles.length - 2) * 180 - angles.reduce<number>((sum, a) => sum + (a ?? 0), 0);
}

/** Each slice of a pie as start/end angles in radians, clockwise from 12 o'clock, in proportion to its value. */
export function pieSlices(values: number[]): Array<{ start: number; end: number }> {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let at = -Math.PI / 2;
  return values.map((v) => {
    const start = at;
    at += (v / total) * 2 * Math.PI;
    return { start, end: at };
  });
}

/** An SVG path for one pie slice. */
export function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  if (end - start >= 2 * Math.PI - 1e-9) return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  return `M ${cx} ${cy} L ${p(start)} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${p(end)} Z`;
}

/** Grid lines for a first-quadrant grid that fits every point (at least 0–6 on each axis). */
export function gridExtent(points: Point[]): number {
  return Math.max(6, ...points.flatMap((p) => [p.x, p.y]));
}
