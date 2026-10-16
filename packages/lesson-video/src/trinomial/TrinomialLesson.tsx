import React, { useContext } from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import {
  Arrow,
  C,
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
import { expandPair, formatNumber, formatPair, formatTrinomial, type TrinomialLessonProps } from "./trinomial";

/**
 * Renders a TrinomialLessonProps. Strings come from the verified lesson
 * (trinomial.ts); this file only places and times them.
 */

const sgn = (n: number) => (n < 0 ? "−" : "+");
/** "+ 4x", "− x", "+ 12" */
const termText = (coef: number, power: 0 | 1 | 2, v: string, leading = false) => {
  const body = power === 0 ? `${Math.abs(coef)}` : `${Math.abs(coef) === 1 ? "" : Math.abs(coef)}${v}${power === 2 ? "²" : ""}`;
  return leading ? `${coef < 0 ? "−" : ""}${body}` : `${sgn(coef)} ${body}`;
};

interface Cell {
  id: string;
  text: string;
  cx: number;
  width: number;
}

function layoutRow(items: Array<{ id: string; text: string; pad?: number }>, size: number, centerX = WIDTH / 2): Cell[] {
  const widths = items.map((it) => textWidth(it.text, size) + (it.pad ?? 0.14) * size * 2);
  let left = centerX - widths.reduce((a, b) => a + b, 0) / 2;
  return items.map((it, i) => {
    const cell = { id: it.id, text: it.text, cx: left + widths[i]! / 2, width: widths[i]! };
    left += widths[i]!;
    return cell;
  });
}

const at = (cells: Cell[], id: string) => cells.find((c) => c.id === id)!;

function Row({ cells, y, size, p, colorOf }: { cells: Cell[]; y: number; size: number; p: (i: number) => number; colorOf?: (c: Cell) => string | undefined }) {
  return (
    <>
      {cells.map((cell, i) => (
        <div
          key={cell.id}
          style={{
            position: "absolute",
            left: cell.cx - cell.width / 2,
            width: cell.width,
            top: y - size * 0.62,
            height: size * 1.24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size,
            color: colorOf?.(cell) ?? C.ink,
            opacity: p(i),
            transform: `translateY(${(1 - p(i)) * 16}px)`,
          }}
        >
          <MathText text={cell.text} />
        </div>
      ))}
    </>
  );
}

function Label({ x, y, text, p }: { x: number; y: number; text: string; p: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translateY(-50%)",
        fontFamily: UI_FONT,
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: C.muted,
        opacity: p,
      }}
    >
      {text}
    </div>
  );
}

// ---------- scene 1: expand the student's own answer ----------
// Beats: 0 the question · 1 expand, term by term · 2 compare with the question.

const Q_Y = 172;
const ANS_Y = 300;
const ANS_SIZE = 64;
const PROD_Y = 450;
const CMP_Y = 548;

function CheckScene({ lesson, clock }: { lesson: TrinomialLessonProps; clock: BeatClock }) {
  const v = useContext(VarContext);
  const t = lesson.trinomial;
  const [p, q] = lesson.student;
  const theirs = lesson.studentExpansion;

  const ans = layoutRow(
    [
      { id: "o1", text: "(", pad: 0.02 },
      { id: "a1", text: v },
      { id: "a2", text: `${sgn(p)} ${Math.abs(p)}` },
      { id: "c1", text: ")", pad: 0.02 },
      { id: "o2", text: "(", pad: 0.02 },
      { id: "b1", text: v },
      { id: "b2", text: `${sgn(q)} ${Math.abs(q)}` },
      { id: "c2", text: ")", pad: 0.02 },
    ],
    ANS_SIZE,
  );
  const top = (id: string) => ({ x: at(ans, id).cx, y: ANS_Y - ANS_SIZE * 0.55 });
  const bottom = (id: string) => ({ x: at(ans, id).cx, y: ANS_Y + ANS_SIZE * 0.55 });

  // First·First, Outer, Inner, Last — each product with its sign carried.
  const products = [
    { from: "a1", to: "b1", text: `${v}²`, below: false },
    { from: "a1", to: "b2", text: termText(q, 1, v), below: false },
    { from: "a2", to: "b1", text: termText(p, 1, v), below: true },
    { from: "a2", to: "b2", text: termText(p * q, 0, v), below: true },
  ];
  const prodCells = layoutRow(products.map((pr, i) => ({ id: `p${i}`, text: pr.text, pad: 0.3 })), 48);

  const cmpLeft = layoutRow(
    [
      { id: "eq", text: "=" },
      { id: "l2", text: `${v}²` },
      { id: "l1", text: termText(theirs.b, 1, v) },
      { id: "l0", text: termText(theirs.c, 0, v) },
    ],
    46,
    WIDTH / 2 - 250,
  );
  const cmpRight = layoutRow(
    [
      { id: "r2", text: `${v}²` },
      { id: "r1", text: termText(t.b, 1, v) },
      { id: "r0", text: termText(t.c, 0, v) },
    ],
    46,
    WIDTH / 2 + 250,
  );
  const cmpP = beatP(clock, 2, 0.05, 0.25);
  const wrong = beatPop(clock, 2, 0.35);
  const bad = (id: string) =>
    (id.endsWith("1") && theirs.b !== t.b) || (id.endsWith("0") && theirs.c !== t.c);

  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: Q_Y - 30, display: "flex", justifyContent: "center", gap: 18, alignItems: "baseline", opacity: beatP(clock, 0, 0.05, 0.25) }}>
        <span style={{ fontFamily: UI_FONT, fontSize: 22, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Factorise</span>
        <MathText text={formatTrinomial(t)} style={{ fontSize: 46, color: C.ink }} />
      </div>
      <Label x={64} y={ANS_Y} text={lesson.studentName ? `${lesson.studentName}'s answer` : "Your answer"} p={beatP(clock, 0, 0.4, 0.55)} />
      <Row cells={ans} y={ANS_Y} size={ANS_SIZE} p={(i) => beatP(clock, 0, 0.4 + i * 0.03, 0.55 + i * 0.03)} />
      <Svg>
        {products.map((pr, i) => {
          const a = 0.2 + i * 0.17;
          return (
            <Arrow
              key={i}
              from={pr.below ? bottom(pr.from) : top(pr.from)}
              to={pr.below ? bottom(pr.to) : top(pr.to)}
              progress={beatP(clock, 1, a, a + 0.1)}
              color={C.green}
              below={pr.below}
              width={3}
            />
          );
        })}
      </Svg>
      {prodCells.map((cell, i) => (
        <PopMath key={cell.id} x={cell.cx} y={PROD_Y} p={beatPop(clock, 1, 0.3 + i * 0.17)} size={48} text={cell.text} />
      ))}

      <Row cells={cmpLeft} y={CMP_Y} size={46} p={() => cmpP} colorOf={(c) => (bad(c.id) && wrong > 0.3 ? C.miss : undefined)} />
      <div style={{ position: "absolute", left: WIDTH / 2 - 30, width: 60, top: CMP_Y - 30, textAlign: "center", fontSize: 46, color: C.miss, opacity: Math.min(1, wrong) }}>
        <MathText text="≠" />
      </div>
      <Row cells={cmpRight} y={CMP_Y} size={46} p={() => beatP(clock, 2, 0.2, 0.35)} colorOf={(c) => (bad(c.id) && wrong > 0.3 ? C.green : undefined)} />
      {[...cmpLeft, ...cmpRight]
        .filter((c) => bad(c.id))
        .map((c) => (
          <Ring key={c.id} cx={c.cx} cy={CMP_Y} w={c.width + 10} h={64} p={wrong} scale={pulse(clock, Math.min(1, wrong))} />
        ))}
      <Tag x={at(ans, "c2").cx + 190} y={ANS_Y} p={beatPop(clock, 2, 0.7)} text="numbers right · signs wrong" color={C.miss} bg={C.surface} />
    </>
  );
}

// ---------- scene 2: read the signs ----------
// Beats: 0 the last term → same/different · 1 the middle term → which sign.

function SignsScene({ lesson, clock }: { lesson: TrinomialLessonProps; clock: BeatClock }) {
  const v = useContext(VarContext);
  const t = lesson.trinomial;
  const size = 84;
  const y = 290;
  const cells = layoutRow(
    [
      { id: "t2", text: `${v}²` },
      { id: "t1", text: termText(t.b, 1, v) },
      { id: "t0", text: termText(t.c, 0, v) },
    ],
    size,
  );
  const c0 = at(cells, "t0");
  const c1 = at(cells, "t1");
  const r0 = beatPop(clock, 0, 0.25);
  const r1 = beatPop(clock, 1, 0.2);
  const focus0 = beatP(clock, 0, 0.1, 0.3) * (1 - beatP(clock, 1, 0.0, 0.15));
  return (
    <>
      <Row
        cells={cells}
        y={y}
        size={size}
        p={(i) => beatP(clock, 0, i * 0.03, 0.08 + i * 0.03)}
        colorOf={(c) => (c.id === "t0" && focus0 > 0.5 ? C.fix : c.id === "t1" && r1 > 0.3 ? C.fix : undefined)}
      />
      <Ring cx={c0.cx} cy={y} w={c0.width + 4} h={size * 1.35} p={focus0} scale={pulse(clock, focus0)} />
      <Ring cx={c1.cx} cy={y} w={c1.width + 4} h={size * 1.35} p={r1} scale={pulse(clock, Math.min(1, r1))} />
      <svg width={WIDTH} height={720} style={{ position: "absolute", inset: 0 }}>
        <line x1={c0.cx} y1={y + size * 0.7} x2={c0.cx} y2={418} stroke={C.fix} strokeWidth={3} strokeDasharray="6 6" opacity={Math.min(1, r0)} />
        <line x1={c1.cx} y1={y + size * 0.7} x2={c1.cx} y2={508} stroke={C.fix} strokeWidth={3} strokeDasharray="6 6" opacity={Math.min(1, r1)} />
      </svg>
      <Tag x={c0.cx} y={440} p={r0} text={lesson.rules.constant} color={C.fix} bg={C.surface} />
      <Tag x={c1.cx} y={530} p={r1} text={lesson.rules.middle} color={C.fix} bg={C.surface} />
    </>
  );
}

// ---------- scene 3: find the pair, check, routine ----------
// Beats: 0 tiles with signs · 1 sums, the match lights · 2 the answer + expand check · 3 routine.

function PairScene({ lesson, clock }: { lesson: TrinomialLessonProps; clock: BeatClock }) {
  const v = useContext(VarContext);
  const t = lesson.trinomial;
  const n = lesson.tiles.length;
  const gap = 24;
  const tileW = Math.min(220, (1120 - gap * (n - 1)) / n);
  const rowW = n * tileW + (n - 1) * gap;
  const sumsP = beatP(clock, 1, 0.1, 0.3);
  const lockP = beatPop(clock, 1, 0.55);
  const answerP = beatPop(clock, 2, 0.1);
  const checkP = beatP(clock, 2, 0.55, 0.7);
  const routineP = beatPop(clock, 3, 0.04);
  const correctExp = expandPair(lesson.correct);

  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 138, display: "flex", justifyContent: "center", gap: 16, alignItems: "baseline", opacity: beatP(clock, 0, 0, 0.1) }}>
        <MathText text={formatTrinomial(t)} style={{ fontSize: 40, color: C.ink }} />
        <span style={{ fontFamily: UI_FONT, fontSize: 18, fontWeight: 700, color: C.fix }}>{lesson.rules.constant} · {lesson.rules.middle}</span>
      </div>
      {lesson.tiles.map((tile, i) => {
        const p = beatPop(clock, 0, 0.2 + (i * 0.5) / n);
        const dim = tile.match ? 1 : 1 - 0.55 * Math.min(1, lockP);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (WIDTH - rowW) / 2 + i * (tileW + gap),
              top: 212,
              width: tileW,
              height: 170,
              borderRadius: 18,
              background: C.surface,
              border: `3px solid ${tile.match && lockP > 0.3 ? C.green : C.line}`,
              boxShadow: tile.match && lockP > 0.3 ? "0 10px 30px rgba(31,138,110,0.25)" : "0 6px 18px rgba(11,59,51,0.06)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: Math.min(1, p) * dim,
              transform: `scale(${0.85 + 0.15 * Math.min(1, p) + (tile.match ? 0.06 * Math.min(1, lockP) : 0)})`,
            }}
          >
            <MathText text={`${formatNumber(tile.pair[0])} , ${formatNumber(tile.pair[1])}`} style={{ fontSize: 38, color: C.ink }} />
            <span style={{ fontFamily: UI_FONT, fontSize: 18, color: C.muted, fontWeight: 600 }}>
              <MathText text={`× = ${formatNumber(t.c)}`} style={{ fontFamily: UI_FONT }} />
            </span>
            <span style={{ fontFamily: UI_FONT, fontSize: 22, fontWeight: 800, color: tile.match ? C.green : C.miss, opacity: sumsP }}>
              <MathText text={`+ = ${formatNumber(tile.sum)}`} style={{ fontFamily: UI_FONT }} />
            </span>
            {tile.match && <div style={{ position: "absolute", top: -14, right: -14 }}><div style={{ position: "relative" }}><Tick x={0} y={0} p={lockP} /></div></div>}
          </div>
        );
      })}

      <div style={{ position: "absolute", left: 0, right: 0, top: 432, display: "flex", justifyContent: "center", opacity: Math.min(1, answerP), transform: `scale(${0.9 + 0.1 * Math.min(1, answerP)})` }}>
        <div style={{ border: `3px solid ${C.green}`, borderRadius: 16, background: C.surface, padding: "4px 22px" }}>
          <MathText text={`${formatTrinomial(t)} = ${formatPair(lesson.correct, v)}`} style={{ fontSize: 50, color: C.green, fontWeight: 700 }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 528, display: "flex", justifyContent: "center", gap: 36, opacity: checkP }}>
        <MathText text={`check: ${formatPair(lesson.correct, v)} = ${formatTrinomial({ ...correctExp, v })} ✓`} style={{ fontSize: 28, color: C.green }} />
        <MathText text={`earlier: ${formatPair(lesson.student, v)} = ${formatTrinomial({ ...lesson.studentExpansion, v })} ✗`} style={{ fontSize: 28, color: C.miss }} />
      </div>

      {routineP > 0.01 && (
        <AbsoluteFill style={{ background: C.paperAlpha(0.9 * Math.min(1, routineP)), alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: 820,
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
            {["Read the signs: last term, then the middle", "Find the pair that multiplies and adds", "Expand to check"].map((step, i) => {
              const p = beatP(clock, 3, 0.12 + i * 0.13, 0.22 + i * 0.13);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18, opacity: p, transform: `translateX(${(1 - p) * 20}px)` }}>
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: C.green, color: C.onAccent, fontWeight: 800, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                  <div style={{ fontSize: 30, fontWeight: 600, color: C.ink }}>{step}</div>
                </div>
              );
            })}
            <div style={{ marginTop: 26, display: "inline-block", background: C.ink, color: C.paper, fontSize: 24, fontWeight: 700, borderRadius: 999, padding: "10px 26px", opacity: beatP(clock, 3, 0.62, 0.74) }}>
              Your turn →
            </div>
          </div>
        </AbsoluteFill>
      )}
    </>
  );
}

export const TrinomialLesson: React.FC<TrinomialLessonProps> = (lesson) => {
  const { fps } = useVideoConfig();
  if (!lesson.scenes?.length) return <AbsoluteFill style={{ background: C.paper }} />;
  let from = 0;
  return (
    <VarContext.Provider value={lesson.trinomial.v}>
      <ThemeRoot theme={lesson.theme}>
        {lesson.scenes.map((scene, index) => {
          const duration = scene.beats.reduce((s, b) => s + Math.round(b.seconds * fps), 0);
          const start = from;
          from += duration;
          return (
            <Sequence key={scene.id} from={start} durationInFrames={duration}>
              <SceneFrame lesson={lesson} sceneIndex={index} durationInFrames={duration}>
                {(clock) =>
                  scene.id === "check" ? (
                    <CheckScene lesson={lesson} clock={clock} />
                  ) : scene.id === "signs" ? (
                    <SignsScene lesson={lesson} clock={clock} />
                  ) : (
                    <PairScene lesson={lesson} clock={clock} />
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
