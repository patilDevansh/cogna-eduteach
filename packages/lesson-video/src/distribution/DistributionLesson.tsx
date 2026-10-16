import React, { useContext } from "react";
import { AbsoluteFill, Sequence, interpolate, useVideoConfig } from "remotion";
import {
  Arrow,
  C,
  Card,
  CardLabel,
  InlinePill,
  Line,
  MathText,
  PopMath,
  Ring,
  SceneFrame,
  ThemeRoot,
  Svg,
  Tag,
  Tick,
  UI_FONT,
  VarContext,
  WIDTH,
  beatP,
  beatPop,
  pulse,
  textWidth,
  type BeatClock,
} from "../lesson-kit";
import {
  formatLeadingTerm,
  formatMagnitude,
  formatSignedTerm,
  formatTerms,
  type BracketGroup,
  type Term,
} from "./math";
import type { CheckCard, DistributionLessonProps, LessonSceneSpec } from "./lesson";

/**
 * Renders a DistributionLessonProps. Every string on screen comes from the
 * verified lesson (lesson.ts) — this file only decides where and when.
 */

const EXPR_SIZE = 66;
const EXPR_Y = 262;
const PRODUCT_Y = 430;


// ---------- expression layout (deterministic cell widths so arrows can target terms) ----------

interface Cell {
  id: string;
  text: string;
  left: number;
  width: number;
  cx: number;
  kind: "mult" | "paren" | "term" | "op";
}

function layoutExpression(groups: BracketGroup[], size: number, v: string): Cell[] {
  const raw: Omit<Cell, "left" | "cx">[] = [];
  const push = (id: string, text: string, kind: Cell["kind"], pad: number) =>
    raw.push({ id, text, kind, width: textWidth(text, size) + pad * size * 2 });
  groups.forEach((group, g) => {
    const m = group.multiplier;
    if (g > 0) push(`op${g}`, m.n < 0 ? "−" : "+", "op", 0.32);
    push(`m${g}`, `${g === 0 && m.n < 0 ? "−" : ""}${formatMagnitude(m)}`, "mult", 0.06);
    push(`open${g}`, "(", "paren", 0.02);
    group.terms.forEach((term, t) =>
      push(`t${g}-${t}`, t === 0 ? formatLeadingTerm(term, v) : formatSignedTerm(term, v), "term", 0.16),
    );
    push(`close${g}`, ")", "paren", 0.02);
  });
  const total = raw.reduce((w, c) => w + c.width, 0);
  let left = (WIDTH - total) / 2;
  return raw.map((c) => {
    const cell = { ...c, left, cx: left + c.width / 2 };
    left += c.width;
    return cell;
  });
}

const cellOf = (cells: Cell[], id: string) => cells.find((c) => c.id === id)!;
const termTop = (cell: Cell) => ({ x: cell.cx, y: EXPR_Y - EXPR_SIZE * 0.55 });
const productText = (term: Term, t: number, v: string) => (t === 0 ? formatLeadingTerm(term, v) : formatSignedTerm(term, v));

/**
 * x-centres for the products row. Spaced by what it has to hold (the widest
 * of the student's product, the correct product and its factor label), not by
 * the term above it — a short bracket like −2(5 − 8) would otherwise collide.
 */
function layoutProducts(lesson: DistributionLessonProps, v: string): Record<string, number> {
  const slots: Array<{ id: string; width: number }> = [];
  lesson.groups.forEach((group, g) => {
    if (g > 0) slots.push({ id: `op${g}`, width: textWidth("+", 52) + 36 });
    group.terms.forEach((_, t) => {
      const widths = [
        textWidth(productText(lesson.student.products[g]![t]!, t, v), 52) + 40,
        textWidth(productText(lesson.correct.products[g]![t]!, t, v), 52) + 40,
        lesson.display.factorLabels ? textWidth(lesson.display.factorLabels[g]![t]!, 26) + 28 : 0,
      ];
      slots.push({ id: `p${g}-${t}`, width: Math.max(...widths) });
    });
  });
  const total = slots.reduce((w, s) => w + s.width, 0);
  let left = (WIDTH - total) / 2;
  const at: Record<string, number> = {};
  for (const slot of slots) {
    at[slot.id] = left + slot.width / 2;
    left += slot.width;
  }
  return at;
}

function ExpressionRow({
  cells,
  appear,
  colorOf,
}: {
  cells: Cell[];
  appear: (index: number) => number;
  colorOf?: (cell: Cell) => string | undefined;
}) {
  return (
    <>
      {cells.map((cell, i) => {
        const p = appear(i);
        return (
          <div
            key={cell.id}
            style={{
              position: "absolute",
              left: cell.left,
              width: cell.width,
              top: EXPR_Y - EXPR_SIZE * 0.62,
              height: EXPR_SIZE * 1.24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: EXPR_SIZE,
              color: colorOf?.(cell) ?? C.ink,
              opacity: p,
              transform: `translateY(${(1 - p) * 18}px)`,
            }}
          >
            <MathText text={cell.text} />
          </div>
        );
      })}
    </>
  );
}

function RowLabel({ text, p }: { text: string; p: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: PRODUCT_Y - 62,
        fontFamily: UI_FONT,
        fontSize: 17,
        fontWeight: 700,
        color: C.muted,
        letterSpacing: 1,
        textTransform: "uppercase",
        opacity: p,
      }}
    >
      {text}
    </div>
  );
}

// ---------- scene 1: the student's own working ----------
// Beats: 0 intro · 1 the products they got right · 2 the mistake and their answer.

function WorkingScene({ lesson, clock }: { lesson: DistributionLessonProps; clock: BeatClock }) {
  const v = useContext(VarContext);
  const cells = layoutExpression(lesson.groups, EXPR_SIZE, v);
  const { group: eg, term: et } = lesson.error;
  const errCell = cellOf(cells, `t${eg}-${et}`);
  const multOf = (g: number) => termTop(cellOf(cells, `m${g}`));
  const correctTerms = lesson.groups.flatMap((group, g) => group.terms.flatMap((_, t) => (g === eg && t === et ? [] : [{ g, t }])));
  const signLost = lesson.mistake === "sign-lost";
  const px = layoutProducts(lesson, v);
  const errX = px[`p${eg}-${et}`]!;

  const arrows: React.ReactNode[] = [];
  const products: React.ReactNode[] = [];
  correctTerms.forEach(({ g, t }, i) => {
    const cell = cellOf(cells, `t${g}-${t}`);
    const x = px[`p${g}-${t}`]!;
    const span = 0.62 / correctTerms.length;
    const a0 = 0.18 + i * span;
    arrows.push(<Arrow key={`a${g}${t}`} from={multOf(g)} to={termTop(cell)} progress={beatP(clock, 1, a0, a0 + span * 0.7)} color={C.green} />);
    products.push(
      <React.Fragment key={`p${g}${t}`}>
        <PopMath x={x} y={PRODUCT_Y} p={beatPop(clock, 1, a0 + span * 0.75)} size={52} text={productText(lesson.student.products[g]![t]!, t, v)} />
        <Tick x={x + 42} y={PRODUCT_Y - 38} p={beatPop(clock, 1, a0 + span * 0.9)} />
      </React.Fragment>,
    );
  });

  const wrongText = productText(lesson.student.products[eg]![et]!, et, v);
  const ringP = beatPop(clock, 2, signLost ? 0.4 : 0.12);
  const answerP = beatPop(clock, 2, 0.74);
  const ringPulse = pulse(clock, Math.min(1, ringP));
  const dropP = beatP(clock, 2, 0.42, 0.62);

  return (
    <>
      <Svg>
        {arrows}
        {signLost ? (
          <Arrow from={multOf(eg)} to={termTop(errCell)} progress={beatP(clock, 2, 0.08, 0.26)} color={C.miss} />
        ) : (
          <Arrow from={multOf(eg)} to={termTop(errCell)} progress={beatP(clock, 2, 0.18, 0.35)} color={C.miss} dashed />
        )}
      </Svg>
      <ExpressionRow
        cells={cells}
        appear={(i) => beatP(clock, 0, 0.08 + i * 0.035, 0.2 + i * 0.035)}
        colorOf={(cell) => (cell.id === errCell.id && ringP > 0.05 && !signLost ? C.miss : undefined)}
      />
      {signLost ? (
        // The wrong product lands, then gets ringed.
        <>
          <PopMath x={errX} y={PRODUCT_Y} p={beatPop(clock, 2, 0.28)} size={52} text={wrongText} color={C.miss} />
          <Ring cx={errX} cy={PRODUCT_Y} w={textWidth(wrongText, 52) + 30} h={80} p={ringP} scale={ringPulse} />
        </>
      ) : (
        // The untouched term: ringed where it sits, then copied down unchanged.
        <>
          <Ring cx={errCell.cx} cy={EXPR_Y} w={errCell.width + 8} h={EXPR_SIZE * 1.44} p={ringP} scale={ringPulse} />
          {dropP > 0 && (
            <div
              style={{
                position: "absolute",
                left: interpolate(dropP, [0, 1], [errCell.cx, errX]),
                top: interpolate(dropP, [0, 1], [EXPR_Y, PRODUCT_Y]),
                transform: "translate(-50%, -50%)",
                fontSize: interpolate(dropP, [0, 1], [EXPR_SIZE, 52]),
                color: C.miss,
              }}
            >
              <MathText text={wrongText} />
            </div>
          )}
        </>
      )}
      <Tag x={errCell.cx} y={EXPR_Y - 150} p={beatPop(clock, 2, signLost ? 0.5 : 0.26)} text={lesson.display.errorTag} color={C.miss} bg={C.surface} />
      <RowLabel text={lesson.studentName ? `${lesson.studentName}'s working` : "Your working"} p={beatP(clock, 1, 0.05, 0.18)} />
      {cells
        .filter((c) => c.kind === "op")
        .map((op) => (
          <PopMath key={op.id} x={px[op.id]!} y={PRODUCT_Y} p={beatPop(clock, 1, 0.8)} size={52} text={op.text} />
        ))}
      {products}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: PRODUCT_Y + 58,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
          opacity: Math.min(1, answerP),
          transform: `translateY(${(1 - Math.min(1, answerP)) * 14}px)`,
        }}
      >
        <MathText text={`= ${formatTerms(lesson.student.answer, v)}`} style={{ fontSize: 48, color: C.ink }} />
        <span style={{ fontFamily: UI_FONT, fontSize: 18, fontWeight: 700, color: C.muted, border: `2px solid ${C.line}`, borderRadius: 999, padding: "4px 12px" }}>
          {lesson.studentName ? `${lesson.studentName}'s answer` : "Your answer"}
        </span>
      </div>
    </>
  );
}

// ---------- scene 2: the fix ----------
// Beats: 0 the rule · then one beat per bracket.

function ArrowsScene({ lesson, clock }: { lesson: DistributionLessonProps; clock: BeatClock }) {
  const v = useContext(VarContext);
  const cells = layoutExpression(lesson.groups, EXPR_SIZE, v);
  const multOf = (g: number) => termTop(cellOf(cells, `m${g}`));
  const glow = beatP(clock, 0, 0.35, 0.6);
  const labels = lesson.display.factorLabels;
  const px = layoutProducts(lesson, v);

  const arrows: React.ReactNode[] = [];
  const products: React.ReactNode[] = [];
  const chips: React.ReactNode[] = [];

  lesson.groups.forEach((group, g) => {
    const beat = 1 + g;
    const n = group.terms.length;
    group.terms.forEach((_, t) => {
      const cell = cellOf(cells, `t${g}-${t}`);
      const a = 0.22 + (t * 0.6) / n;
      const b = a + 0.14;
      const wasWrong = lesson.error.group === g && lesson.error.term === t;
      const color = wasWrong ? C.fix : C.green;
      arrows.push(<Arrow key={`a${g}${t}`} from={multOf(g)} to={termTop(cell)} progress={beatP(clock, beat, a, b)} color={color} width={wasWrong ? 5 : 4} />);
      if (labels) {
        products.push(
          <PopMath key={`f${g}${t}`} x={px[`p${g}-${t}`]!} y={PRODUCT_Y - 64} p={beatPop(clock, beat, b)} size={26} text={labels[g]![t]!} color={wasWrong ? C.fix : C.muted} />,
        );
      }
      products.push(
        <PopMath
          key={`p${g}${t}`}
          x={px[`p${g}-${t}`]!}
          y={PRODUCT_Y}
          p={beatPop(clock, beat, b + 0.06)}
          size={52}
          text={productText(lesson.correct.products[g]![t]!, t, v)}
          color={wasWrong ? C.fix : C.ink}
          bg={wasWrong ? C.fixSoft : undefined}
        />,
      );
    });
    const firstX = px[`p${g}-0`]!;
    const lastX = px[`p${g}-${n - 1}`]!;
    chips.push(
      <Tag key={`chip${g}`} x={(firstX + lastX) / 2} y={PRODUCT_Y + 78} p={beatPop(clock, beat, 0.9)} text={lesson.display.chips[g]!} color={C.green} bg={C.greenSoft} />,
    );
  });

  return (
    <>
      <Svg>{arrows}</Svg>
      {lesson.groups.map((_, g) => {
        const m = cellOf(cells, `m${g}`);
        const r = Math.max(38, m.width / 2 + 10);
        return (
          <div
            key={g}
            style={{
              position: "absolute",
              left: m.cx - r,
              top: EXPR_Y - 38,
              width: r * 2,
              height: 76,
              borderRadius: 38,
              background: C.greenSoft,
              border: `3px solid ${C.green}`,
              opacity: glow * (0.55 + 0.45 * Math.sin((clock.frame / clock.fps) * Math.PI * 1.5) ** 2),
            }}
          />
        );
      })}
      <ExpressionRow cells={cells} appear={(i) => beatP(clock, 0, 0, 0.02 + i * 0.01)} />
      {cells
        .filter((c) => c.kind === "op")
        .map((op) => (
          <PopMath key={op.id} x={px[op.id]!} y={PRODUCT_Y} p={beatPop(clock, 1, 0.75)} size={52} text={op.text} />
        ))}
      {products}
      {chips}
    </>
  );
}

// ---------- scene 3: collect, check, routine ----------
// Beats: 0 collect · 1 left check card · 2 right card + earlier answer · 3 routine.

function CheckScene({ lesson, clock }: { lesson: DistributionLessonProps; clock: BeatClock }) {
  const v = useContext(VarContext);
  const flat = lesson.correct.products.flat();
  const numeric = !lesson.variable;
  const xChip = beatP(clock, 0, 0.18, 0.3);
  const cChip = beatP(clock, 0, numeric ? 0.18 : 0.46, numeric ? 0.3 : 0.58);
  const answerP = beatPop(clock, 0, numeric ? 0.6 : 0.74);
  const { left, right, earlier } = lesson.display.check;
  const routineP = beatPop(clock, 3, 0.04);

  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", justifyContent: "center", gap: 14, alignItems: "center" }}>
        {flat.map((term, i) => {
          const chip = term.x ? xChip : cChip;
          const color = term.x ? C.green : C.blue;
          const bg = term.x ? C.greenSoft : C.blueSoft;
          return (
            <span
              key={i}
              style={{
                fontSize: 50,
                borderRadius: 12,
                padding: "0 10px",
                background: chip > 0 ? bg : "transparent",
                color: chip > 0.5 ? color : C.ink,
                opacity: beatP(clock, 0, 0.02 + i * 0.03, 0.1 + i * 0.03),
              }}
            >
              <MathText text={i === 0 ? formatLeadingTerm(term, v) : formatSignedTerm(term, v)} />
            </span>
          );
        })}
        <span
          style={{
            fontSize: 50,
            marginLeft: 20,
            opacity: Math.min(1, answerP),
            transform: `scale(${0.8 + 0.2 * Math.min(1, answerP)})`,
            border: `3px solid ${C.green}`,
            borderRadius: 14,
            padding: "0 16px",
            background: C.surface,
          }}
        >
          <MathText text={`= ${formatTerms(lesson.correct.answer, v)}`} style={{ color: C.green, fontWeight: 700 }} />
        </span>
      </div>

      <Card x={80} p={beatP(clock, 1, 0.02, 0.14)} accent={C.ink}>
        <CardLabel card={left} />
        {left.lines.map((text, i) => {
          const start = 0.14 + (i * 0.55) / left.lines.length;
          return <Line key={i} text={text} p={beatP(clock, 1, start, start + 0.12)} size={i === left.lines.length - 1 ? 42 : 36} />;
        })}
      </Card>
      <Card x={660} p={beatP(clock, 2, 0.0, 0.1)} accent={C.green}>
        <CardLabel card={right} />
        {right.lines.map((text, i) => {
          const isLast = i === right.lines.length - 1;
          return (
            <Line
              key={i}
              text={text}
              p={beatP(clock, 2, 0.06 + i * 0.1, 0.16 + i * 0.1)}
              size={isLast ? 44 : 36}
              color={isLast ? C.green : C.ink}
              suffix={isLast ? <InlinePill p={beatPop(clock, 2, 0.28)} text="match ✓" /> : undefined}
            />
          );
        })}
        <div style={{ marginTop: 10, borderTop: `1px dashed ${C.line}`, paddingTop: 10, opacity: beatP(clock, 2, 0.5, 0.62) }}>
          <MathText text={earlier} style={{ fontSize: 28, color: C.miss }} />
        </div>
      </Card>

      {routineP > 0.01 && (
        <AbsoluteFill style={{ background: C.paperAlpha(0.9 * Math.min(1, routineP)), alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: 800,
              background: C.surface,
              borderRadius: 24,
              border: `1px solid ${C.line}`,
              borderTop: `8px solid ${C.green}`,
              boxShadow: "0 18px 50px rgba(11,59,51,0.14)",
              padding: "30px 40px",
              marginTop: -40,
              transform: `scale(${0.92 + 0.08 * Math.min(1, routineP)})`,
              opacity: Math.min(1, routineP),
              fontFamily: UI_FONT,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: 1.4, textTransform: "uppercase" }}>Your routine</div>
            {lesson.display.routine.map((step, i) => {
              const p = beatP(clock, 3, 0.12 + i * 0.13, 0.22 + i * 0.13);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18, opacity: p, transform: `translateX(${(1 - p) * 20}px)` }}>
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: C.green, color: C.onAccent, fontWeight: 800, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 600, color: C.ink }}>
                    <MathText text={step} style={{ fontFamily: UI_FONT }} />
                  </div>
                </div>
              );
            })}
            <div
              style={{
                marginTop: 26,
                display: "inline-block",
                background: C.ink,
                color: C.paper,
                fontSize: 24,
                fontWeight: 700,
                borderRadius: 999,
                padding: "10px 26px",
                opacity: beatP(clock, 3, 0.62, 0.74),
              }}
            >
              Your turn →
            </div>
          </div>
        </AbsoluteFill>
      )}
    </>
  );
}

// ---------- composition ----------

export const DistributionLesson: React.FC<DistributionLessonProps> = (lesson) => {
  const { fps } = useVideoConfig();
  if (!lesson.scenes?.length) return <AbsoluteFill style={{ background: C.paper }} />;
  let from = 0;
  return (
    <VarContext.Provider value={lesson.variable || ""}>
      <ThemeRoot theme={lesson.theme}>
        {lesson.scenes.map((scene, index) => {
          const duration = scene.beats.reduce((s, b) => s + Math.round(b.seconds * fps), 0);
          const start = from;
          from += duration;
          return (
            <Sequence key={scene.id} from={start} durationInFrames={duration}>
              <SceneFrame lesson={lesson} sceneIndex={index} durationInFrames={duration}>
                {(clock) =>
                  scene.id === "working" ? (
                    <WorkingScene lesson={lesson} clock={clock} />
                  ) : scene.id === "arrows" ? (
                    <ArrowsScene lesson={lesson} clock={clock} />
                  ) : (
                    <CheckScene lesson={lesson} clock={clock} />
                  )
                }
              </SceneFrame>
            </Sequence>
          );
        })}
      </ThemeRoot>
    </VarContext.Provider>
  );
};
