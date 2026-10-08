import type { SlideVisual } from "@cogna/shared";
import { gridExtent, pieSlices, polygonCorners, slicePath, towardCentre } from "@cogna/lesson-video/player";
import styles from "./slides.module.css";

const SLICE_COLOURS = ["#2f7d63", "#e3a33b", "#4f7fc0", "#c4584b", "#7d5fb0", "#5aa6a0"];

/** One beat's picture on a slide. Keyed by the caller so each new picture fades in. */
export function SlideVisualView({ visual }: { visual: SlideVisual }) {
  switch (visual.type) {
    case "expression":
      return (
        <figure className={styles.expression}>
          <span className={styles.math}>{visual.expr}</span>
          {visual.caption && <figcaption>{visual.caption}</figcaption>}
        </figure>
      );
    case "steps":
      return <StepsView steps={visual.steps} caption={visual.caption} />;
    case "mistake":
      return (
        <figure className={styles.compare}>
          <div className={`${styles.answer} ${styles.yours}`}>
            <span className={styles.answerLabel}>Your answer</span>
            <span className={styles.math}>{visual.wrong}</span>
            <span className={styles.verdict}>{visual.wrongKind === "unfinished" ? "Equal, but not finished" : "Not equal"}</span>
          </div>
          <div className={`${styles.answer} ${styles.right}`} style={{ animationDelay: "0.6s" }}>
            <span className={styles.answerLabel}>{visual.task === "factorise" ? "Fully factorised" : "Right answer"}</span>
            <span className={styles.math}>{visual.right}</span>
            <span className={styles.verdict}>✓ Multiplies back to {visual.expr}</span>
          </div>
          {visual.note && <figcaption>{visual.note}</figcaption>}
        </figure>
      );
    case "shape":
      return <ShapeView angles={visual.angles} sides={visual.sides} caption={visual.caption} />;
    case "chart":
      return <ChartView kind={visual.kind} labels={visual.labels} values={visual.values} caption={visual.caption} />;
    case "grid":
      return <GridView points={visual.points} line={visual.line} caption={visual.caption} />;
    case "rule":
      return (
        <figure className={styles.rule}>
          <ol>
            {visual.lines.map((line, i) => (
              <li key={line} style={{ animationDelay: `${i * 0.35}s` }}>
                <span>{i + 1}</span>
                {line}
              </li>
            ))}
          </ol>
        </figure>
      );
  }
}

/** A chain of equal lines, one under the other, appearing in order. */
export function StepsView({ steps, caption }: { steps: string[]; caption?: string }) {
  return (
    <figure className={styles.steps}>
      {steps.map((step, i) => (
        <div key={`${i}-${step}`} className={styles.step} style={{ animationDelay: `${i * 0.45}s` }}>
          <span className={styles.eq} aria-hidden="true">{i === 0 ? "" : "="}</span>
          <span className={styles.math}>{step}</span>
        </div>
      ))}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** A shape with its angles written in each corner; the one to find shows as "?". */
function ShapeView({ angles, sides, caption }: { angles: Array<number | null>; sides?: string[]; caption?: string }) {
  const cx = 160, cy = 120, corners = polygonCorners(angles.length, cx, cy, 92);
  return (
    <figure className={styles.figure}>
      <svg viewBox="0 0 320 240" role="img" aria-label={`A ${angles.length}-sided shape with angles ${angles.map((a) => (a === null ? "unknown" : `${a} degrees`)).join(", ")}`}>
        <polygon points={corners.map((p) => `${p.x},${p.y}`).join(" ")} className={styles.shapeFill} />
        <text x="316" y="236" className={styles.scaleNote}>Not to scale</text>
        {corners.map((p, i) => {
          const at = towardCentre(p, cx, cy, 26);
          const a = angles[i];
          return <text key={`a${i}`} x={at.x} y={at.y} className={a === null ? styles.unknown : styles.angle}>{a === null ? "?" : `${a}°`}</text>;
        })}
        {sides?.map((label, i) => {
          const p = corners[i]!, q = corners[(i + 1) % corners.length]!;
          const mid = towardCentre({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, cx, cy, -16);
          return <text key={`s${i}`} x={mid.x} y={mid.y} className={styles.sideLabel}>{label}</text>;
        })}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** A bar chart (bars grow in) or a pie chart (slices in proportion), with a key. */
function ChartView({ kind, labels, values, caption }: { kind: "bar" | "pie"; labels: string[]; values: number[]; caption?: string }) {
  const max = Math.max(...values, 1);
  const label = `${kind === "bar" ? "Bar" : "Pie"} chart: ${labels.map((l, i) => `${l} ${values[i]}`).join(", ")}`;
  return (
    <figure className={styles.figure}>
      {kind === "bar" ? (
        <svg viewBox="0 0 320 240" role="img" aria-label={label}>
          <line x1="30" y1="200" x2="310" y2="200" className={styles.axis} />
          {values.map((v, i) => {
            const w = 260 / values.length, h = (v / max) * 160, x = 40 + i * w;
            return (
              <g key={labels[i]}>
                <rect x={x + w * 0.15} y={200 - h} width={w * 0.7} height={h} fill={SLICE_COLOURS[i % SLICE_COLOURS.length]} className={styles.bar} style={{ animationDelay: `${i * 0.15}s` }} />
                <text x={x + w / 2} y={194 - h} className={styles.angle}>{v}</text>
                <text x={x + w / 2} y={218} className={styles.sideLabel}>{labels[i]}</text>
              </g>
            );
          })}
        </svg>
      ) : (
        <svg viewBox="0 0 320 240" role="img" aria-label={label}>
          {pieSlices(values).map((sl, i) => <path key={labels[i]} d={slicePath(110, 120, 95, sl.start, sl.end)} fill={SLICE_COLOURS[i % SLICE_COLOURS.length]} stroke="#fff" strokeWidth="2" />)}
          {labels.map((l, i) => (
            <g key={l}>
              <rect x="220" y={40 + i * 28} width="14" height="14" rx="3" fill={SLICE_COLOURS[i % SLICE_COLOURS.length]} />
              <text x="240" y={52 + i * 28} className={styles.keyLabel}>{l} · {values[i]}</text>
            </g>
          ))}
        </svg>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** A first-quadrant grid with labelled points and, if given, the straight line through them. */
function GridView({ points, line, caption }: { points: Array<{ label: string; x: number; y: number }>; line?: { m: number; c: number }; caption?: string }) {
  const n = gridExtent(points), size = 200, step = size / n, ox = 50, oy = 220;
  const at = (x: number, y: number) => ({ x: ox + x * step, y: oy - y * step });
  const ticks = Array.from({ length: n + 1 }, (_, i) => i);
  // The line, clipped to the grid: from x = 0 to wherever it leaves the top or the right.
  const end = line ? Math.min(n, line.m > 0 ? (n - line.c) / line.m : n) : 0;
  return (
    <figure className={styles.figure}>
      <svg viewBox="0 0 300 250" role="img" aria-label={`Grid with points ${points.map((p) => `${p.label} at ${p.x}, ${p.y}`).join("; ")}${line ? `, on the line y = ${line.m}x + ${line.c}` : ""}`}>
        {ticks.map((i) => (
          <g key={i}>
            <line x1={at(i, 0).x} y1={oy} x2={at(i, n).x} y2={at(i, n).y} className={styles.gridLine} />
            <line x1={ox} y1={at(0, i).y} x2={at(n, i).x} y2={at(n, i).y} className={styles.gridLine} />
            <text x={at(i, 0).x} y={oy + 16} className={styles.tick}>{i}</text>
            {i > 0 && <text x={ox - 12} y={at(0, i).y + 4} className={styles.tick}>{i}</text>}
          </g>
        ))}
        <line x1={ox} y1={oy} x2={at(n, 0).x} y2={oy} className={styles.axis} />
        <line x1={ox} y1={oy} x2={ox} y2={at(0, n).y} className={styles.axis} />
        {line && end > 0 && <line x1={at(0, line.c).x} y1={at(0, line.c).y} x2={at(end, line.m * end + line.c).x} y2={at(end, line.m * end + line.c).y} className={styles.plotLine} />}
        {points.map((p) => (
          <g key={p.label}>
            <circle cx={at(p.x, p.y).x} cy={at(p.x, p.y).y} r="5" className={styles.point} />
            <text x={at(p.x, p.y).x + 9} y={at(p.x, p.y).y - 8} className={styles.keyLabel}>{p.label}({p.x}, {p.y})</text>
          </g>
        ))}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
