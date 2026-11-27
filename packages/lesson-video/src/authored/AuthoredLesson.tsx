import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { carry, tokenize } from "../morph";
import {
  C,
  CarryLine,
  MathText,
  SceneFrame,
  Svg,
  ThemeRoot,
  UI_FONT,
  MATH_FONT,
  VarContext,
  WIDTH,
  beatP,
  beatPop,
  currentBeat,
  mathWidth,
  type BeatClock,
} from "../lesson-kit";
import { prettyMath, type AuthoredLessonProps, type AuthoredVisual } from "./build";
import { gridExtent, pieSlices, polygonCorners, slicePath, towardCentre } from "./figures";

/**
 * Plays an AI-authored lesson. Each beat shows one visual from the fixed
 * catalogue; this file only places and times what the verified draft says.
 * Visuals animate against their own beat (0 → 1 across the beat), so they
 * keep pace with whatever narration length the clip turns out to be.
 */

const STAGE_TOP = 170;
const STAGE_BOTTOM = 590;
const MID_Y = (STAGE_TOP + STAGE_BOTTOM) / 2;

type VisualProps<T extends AuthoredVisual["type"]> = { v: Extract<AuthoredVisual, { type: T }>; clock: BeatClock; beat: number };

const p = (clock: BeatClock, beat: number, from: number, to: number) => beatP(clock, beat, from, to);

/** A centred row. It arrives by coming into focus as its opacity rises. */
function Centered({ y, children, opacity = 1 }: { y: number; children: React.ReactNode; opacity?: number }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", opacity, transform: `translateY(${(1 - opacity) * 10}px)`, filter: opacity < 1 ? `blur(${(1 - opacity) * 6}px)` : undefined }}>
      {children}
    </div>
  );
}

function Pill({ text, color, bg, opacity = 1 }: { text: string; color: string; bg: string; opacity?: number }) {
  return (
    <span style={{ fontFamily: UI_FONT, fontSize: 20, fontWeight: 600, color, background: bg, borderRadius: 8, padding: "5px 14px", opacity }}>
      {text}
    </span>
  );
}

// ---------- visuals ----------

function TitleVisual({ v, clock, beat }: VisualProps<"title">) {
  const pop = beatPop(clock, beat, 0.05);
  return (
    <Centered y={MID_Y - 60} opacity={Math.min(1, pop)}>
      <div style={{ maxWidth: 980, textAlign: "center", fontFamily: UI_FONT, fontSize: 52, fontWeight: 800, color: C.ink, lineHeight: 1.2 }}>
        {/* Titles are sentences: they wrap (MathText alone keeps maths on one line). */}
        <MathText text={v.text.replace(/\^2/g, "²")} style={{ fontFamily: UI_FONT, whiteSpace: "normal" }} />
      </div>
    </Centered>
  );
}

/** Splits text into highlighted and plain runs (highlights matched on the pretty form). */
function runs(text: string, highlights: string[]): Array<{ text: string; hi: number }> {
  const out: Array<{ text: string; hi: number }> = [];
  let rest = text;
  const marks = highlights.map((h) => prettyMath(h).trim()).filter(Boolean);
  while (rest) {
    let best: { at: number; len: number; hi: number } | null = null;
    marks.forEach((m, hi) => {
      const at = rest.indexOf(m);
      if (at >= 0 && (!best || at < best.at)) best = { at, len: m.length, hi };
    });
    if (!best) {
      out.push({ text: rest, hi: -1 });
      break;
    }
    const b = best as { at: number; len: number; hi: number };
    if (b.at > 0) out.push({ text: rest.slice(0, b.at), hi: -1 });
    out.push({ text: rest.slice(b.at, b.at + b.len), hi: b.hi });
    rest = rest.slice(b.at + b.len);
  }
  return out;
}

function ExpressionVisual({ v, clock, beat }: VisualProps<"expression">) {
  const pop = beatPop(clock, beat, 0.04);
  const pretty = prettyMath(v.expr);
  const parts = runs(pretty, v.highlight ?? []);
  const lit = (hi: number) => (hi >= 0 ? p(clock, beat, 0.25 + hi * 0.15, 0.4 + hi * 0.15) : 0);
  const focus = Math.max(0, ...parts.map((part) => lit(part.hi)));
  return (
    <>
      <Centered y={MID_Y - 70} opacity={Math.min(1, pop)}>
        <div style={{ fontSize: 84, color: C.ink, display: "flex", alignItems: "baseline" }}>
          {parts.map((part, i) => (
            <span key={i} style={{ position: "relative", opacity: part.hi >= 0 ? 1 : 1 - 0.6 * focus }}>
              <MathText text={part.text} />
              {part.hi >= 0 && <span style={{ position: "absolute", left: 0, right: 0, bottom: 4, height: 3, background: C.fix, transform: `scaleX(${lit(part.hi)})`, transformOrigin: "left" }} />}
            </span>
          ))}
        </div>
      </Centered>
      {v.caption && (
        <Centered y={MID_Y + 60} opacity={p(clock, beat, 0.35, 0.55)}>
          <div style={{ fontFamily: UI_FONT, fontSize: 28, color: C.muted }}>{v.caption}</div>
        </Centered>
      )}
    </>
  );
}

function StepsVisual({ v, clock, beat }: VisualProps<"steps">) {
  const n = v.steps.length;
  const size = n > 4 ? 44 : 54;
  const gap = size * 1.5;
  const top = MID_Y - ((n - 1) * gap) / 2 - 30;
  const lines = v.steps.map(prettyMath);
  const arrive = (i: number) => p(clock, beat, 0.06 + (i * 0.72) / n, 0.06 + ((i + 0.82) * 0.72) / n);
  return (
    <>
      {lines.map((line, i) => {
        const t = arrive(i);
        const last = i === n - 1;
        // A line steps back once the next one has left it.
        const older = last ? 0 : arrive(i + 1);
        return (
          <div key={i} style={{ position: "absolute", left: WIDTH / 2 - 380, top: top + i * gap, display: "flex", alignItems: "baseline", gap: 18, opacity: 1 - 0.45 * older }}>
            <span style={{ width: 50, textAlign: "right", fontFamily: MATH_FONT, fontSize: size, color: C.muted, opacity: Math.min(1, t * 3) }}>{i === 0 ? "" : "="}</span>
            <CarryLine text={line} from={lines[i - 1]} size={size} t={t} rise={gap} color={last ? C.green : C.ink} ruled={last ? p(clock, beat, 0.84, 0.96) : 0} />
          </div>
        );
      })}
      {v.caption && (
        <div style={{ position: "absolute", left: WIDTH / 2 - 312, top: top + n * gap + 14, fontFamily: UI_FONT, fontSize: 24, color: C.muted, opacity: p(clock, beat, 0.9, 0.98) }}>{v.caption}</div>
      )}
    </>
  );
}

/** Lays out inline tokens centred on a row; returns each token's centre and width. */
function layout(tokens: string[], size: number, y: number) {
  const widths = tokens.map((t) => mathWidth(t, size) + size * 0.22);
  let x = WIDTH / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  return tokens.map((t, i) => {
    const cell = { text: t, cx: x + widths[i]! / 2, width: widths[i]!, y };
    x += widths[i]!;
    return cell;
  });
}

/** "−5" after the first term reads "− 5" with the sign as part of the term. */
const signed = (term: string, first: boolean) => {
  const pretty = prettyMath(term);
  if (first) return pretty;
  return pretty.startsWith("−") ? `− ${pretty.slice(1)}` : `+ ${pretty}`;
};

function DistributeVisual({ v, clock, beat }: VisualProps<"distribute">) {
  const size = 72;
  const y = STAGE_TOP + 150;
  const tokens = [prettyMath(v.outside), "(", ...v.inside.map((t, i) => signed(t, i === 0)), ")"];
  const cells = layout(tokens, size, y);
  const outside = cells[0]!;
  const inside = cells.slice(2, 2 + v.inside.length);
  const n = v.inside.length;
  const results = layout(["=", ...v.result.map((r, i) => signed(r, i === 0))], 64, y + 190);
  return (
    <>
      {cells.map((c, i) => (
        <div key={i} style={{ position: "absolute", left: c.cx - c.width / 2, width: c.width, top: y - size * 0.6, textAlign: "center", fontSize: size, color: C.ink, opacity: p(clock, beat, 0, 0.1) }}>
          <MathText text={c.text} />
        </div>
      ))}
      {inside.map((c, i) => {
        // A copy of the outside term lifts off, arcs over to this term, and hands over to the product below.
        const t = p(clock, beat, 0.12 + (i * 0.6) / n, 0.3 + (i * 0.6) / n);
        const lift = Math.sin(Math.PI * t) * (34 + Math.abs(c.cx - outside.cx) * 0.08);
        return (
          <div key={`t${i}`} style={{ position: "absolute", left: outside.cx - outside.width / 2 + (c.cx - c.width / 2 - outside.width * 0.55 - (outside.cx - outside.width / 2)) * t, width: outside.width, top: y - size * 0.6 - lift, textAlign: "center", fontSize: size, color: C.green, opacity: t <= 0 ? 0 : Math.min(1, t * 6) * (1 - Math.max(0, (t - 0.8) / 0.2)) }}>
            <MathText text={outside.text} />
          </div>
        );
      })}
      {results.map((c, i) => {
        const appear = i === 0 ? p(clock, beat, 0.12, 0.2) : p(clock, beat, 0.26 + ((i - 1) * 0.6) / n, 0.36 + ((i - 1) * 0.6) / n);
        return (
          <div key={`r${i}`} style={{ position: "absolute", left: c.cx - c.width / 2, width: c.width, top: c.y - 40, textAlign: "center", fontSize: 64, color: i === 0 ? C.muted : C.green, opacity: appear, transform: `translateY(${(1 - appear) * 8}px)`, filter: appear < 1 ? `blur(${(1 - appear) * 6}px)` : undefined }}>
            <MathText text={c.text} />
          </div>
        );
      })}
    </>
  );
}

function AreaVisual({ v, clock, beat }: VisualProps<"area">) {
  const cellW = 210;
  const cellH = v.rows.length > 2 ? 90 : 110;
  const left = WIDTH / 2 - (v.cols.length * cellW) / 2 + 40;
  const top = STAGE_TOP + 70;
  const cellsTotal = v.rows.length * v.cols.length;
  return (
    <>
      {v.cols.map((c, j) => (
        <div key={`c${j}`} style={{ position: "absolute", left: left + j * cellW, width: cellW, top: top - 56, textAlign: "center", fontSize: 40, color: C.blue, opacity: p(clock, beat, 0, 0.12) }}>
          <MathText text={prettyMath(c)} />
        </div>
      ))}
      {v.rows.map((r, i) => (
        <div key={`r${i}`} style={{ position: "absolute", left: left - 110, width: 96, top: top + i * cellH + cellH / 2 - 26, textAlign: "right", fontSize: 40, color: C.blue, opacity: p(clock, beat, 0, 0.12) }}>
          <MathText text={prettyMath(r)} />
        </div>
      ))}
      {v.rows.map((_, i) =>
        v.cols.map((__, j) => {
          const k = i * v.cols.length + j;
          const grow = p(clock, beat, 0.12 + (k * 0.65) / cellsTotal, 0.24 + (k * 0.65) / cellsTotal);
          const soft = [C.greenSoft, C.blueSoft, C.fixSoft][(i + j) % 3];
          return (
            <div key={`${i}-${j}`} style={{ position: "absolute", left: left + j * cellW + 4, top: top + i * cellH + 4, width: (cellW - 8) * grow, height: cellH - 8, background: soft, border: `2px solid ${C.line}`, borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: C.ink }}>
              {grow > 0.6 && <MathText text={prettyMath(v.cells[i]![j]!)} />}
            </div>
          );
        }),
      )}
    </>
  );
}

function PairSearchVisual({ v, clock, beat }: VisualProps<"pair-search">) {
  const n = v.pairs.length;
  const isAnswer = (a: number, b: number) => (a === v.answer[0] && b === v.answer[1]) || (a === v.answer[1] && b === v.answer[0]);
  const fmt = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
  const cardW = Math.min(240, (WIDTH - 200) / n - 20);
  const startX = WIDTH / 2 - (n * (cardW + 20)) / 2 + 10;
  return (
    <>
      <Centered y={STAGE_TOP + 10} opacity={p(clock, beat, 0, 0.1)}>
        <div style={{ display: "flex", gap: 18, fontFamily: UI_FONT, fontSize: 30, color: C.ink }}>
          <Pill text={`multiply to ${fmt(v.product)}`} color={C.blue} bg={C.blueSoft} />
          <Pill text={`add to ${fmt(v.sum)}`} color={C.fix} bg={C.fixSoft} />
        </div>
      </Centered>
      {v.pairs.map(([a, b], i) => {
        const appear = beatPop(clock, beat, 0.1 + (i * 0.5) / n);
        const judged = p(clock, beat, 0.2 + (i * 0.5) / n, 0.28 + (i * 0.5) / n);
        const win = isAnswer(a, b);
        const finale = win ? p(clock, beat, 0.78, 0.9) : 0;
        return (
          <div key={i} style={{ position: "absolute", left: startX + i * (cardW + 20), top: STAGE_TOP + 110, width: cardW, height: 230, borderRadius: 20, background: C.surface, border: `2px solid ${finale ? C.green : C.line}`, transform: `translateY(${(1 - Math.min(1, appear)) * 10}px)`, opacity: Math.min(1, appear) * (win ? 1 : 1 - 0.55 * p(clock, beat, 0.78, 0.9)), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: UI_FONT }}>
            <div style={{ fontSize: 46, fontWeight: 800, color: C.ink }}>{fmt(a)} , {fmt(b)}</div>
            <div style={{ fontSize: 22, color: C.blue, opacity: judged }}>× → {fmt(a * b)} ✓</div>
            <div style={{ fontSize: 22, color: a + b === v.sum ? C.green : C.miss, opacity: judged }}>+ → {fmt(a + b)} {a + b === v.sum ? "✓" : "✗"}</div>
          </div>
        );
      })}
    </>
  );
}

function CommonFactorVisual({ v, clock, beat }: VisualProps<"common-factor">) {
  const size = 66;
  const top = STAGE_TOP + 90;
  const terms = layout(v.terms.map((t, i) => signed(t, i === 0)), size, top);
  const pull = p(clock, beat, 0.2, 0.45);
  const result = p(clock, beat, 0.5, 0.75);
  const factored = `${prettyMath(v.factor)}(${v.remaining.map((r, i) => signed(r, i === 0)).join(" ")})`;
  return (
    <>
      {terms.map((c, i) => (
        <div key={i} style={{ position: "absolute", left: c.cx - c.width / 2, width: c.width, top: c.y - size * 0.6, textAlign: "center", fontSize: size, color: C.ink, opacity: 1 - 0.5 * result }}>
          <MathText text={c.text} />
          <div style={{ position: "absolute", left: 0, right: 0, top: -50, opacity: pull * (1 - result) }}>
            <Pill text={prettyMath(v.factor)} color={C.blue} bg={C.blueSoft} />
          </div>
        </div>
      ))}
      <Centered y={top + 120} opacity={result}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 70 }}>
          <span style={{ color: C.green, fontWeight: 700 }}>=</span>
          <MathText text={factored} style={{ color: C.green }} />
        </div>
      </Centered>
      <Centered y={top + 230} opacity={p(clock, beat, 0.8, 0.92)}>
        <Pill text={`${prettyMath(v.factor)} is in every term, and nothing more is shared inside`} color={C.green} bg={C.greenSoft} />
      </Centered>
    </>
  );
}

/** The lens: the student's own line, one hairline under what went wrong, then the right line carried out of it. */
function MistakeVisual({ v, clock, beat }: VisualProps<"mistake">) {
  // An unfinished answer is equal to the expression: "keep going", never a cross or a strike-through.
  const unfinished = v.wrongKind === "unfinished";
  const wrong = prettyMath(v.wrong), right = prettyMath(v.right);
  const wrongTokens = tokenize(wrong);
  const kept = new Set(carry(wrongTokens, tokenize(right)));
  // What the right answer does not keep is what went wrong. If it keeps everything, nothing is singled out.
  const marks = wrongTokens.map((tok, i) => tok.trim() !== "" && !kept.has(i));
  const label = (text: string, y: number, opacity: number) => (
    <Centered y={y} opacity={opacity}>
      <div style={{ fontFamily: UI_FONT, fontSize: 20, fontWeight: 600, color: C.muted }}>{text}</div>
    </Centered>
  );
  const top = STAGE_TOP + 104;
  const rise = 156;
  return (
    <>
      <Centered y={STAGE_TOP + 10} opacity={p(clock, beat, 0, 0.1)}>
        <div style={{ fontSize: 40, color: C.ink, display: "flex", gap: 16, alignItems: "baseline" }}>
          <span style={{ fontFamily: UI_FONT, fontSize: 24, color: C.muted, textTransform: "capitalize" }}>{v.task}</span>
          <MathText text={prettyMath(v.expr)} />
        </div>
      </Centered>
      {label(unfinished ? "Your answer: equal, not finished" : "Your answer", top, p(clock, beat, 0.08, 0.18))}
      <div style={{ position: "absolute", left: 0, right: 0, top: top + 30, display: "flex", justifyContent: "center" }}>
        <CarryLine text={wrong} size={64} t={p(clock, beat, 0.08, 0.2)} marks={marks.some(Boolean) ? marks : undefined} markP={p(clock, beat, 0.26, 0.38)} />
      </div>
      {label("Right answer", top + rise, p(clock, beat, 0.44, 0.54))}
      <div style={{ position: "absolute", left: 0, right: 0, top: top + rise + 30, display: "flex", justifyContent: "center" }}>
        <CarryLine text={right} from={wrong} size={64} t={p(clock, beat, 0.46, 0.64)} rise={rise} align="center" color={C.green} ruled={p(clock, beat, 0.66, 0.78)} />
      </div>
      <Centered y={top + rise * 2 + 14} opacity={p(clock, beat, 0.8, 0.92)}>
        <div style={{ maxWidth: 900, textAlign: "center", fontFamily: UI_FONT, fontSize: 26, lineHeight: 1.35, color: C.ink }}>{v.note}</div>
      </Centered>
    </>
  );
}

function RuleVisual({ v, clock, beat }: VisualProps<"rule">) {
  const appear = beatPop(clock, beat, 0.03);
  return (
    <Centered y={STAGE_TOP + 10} opacity={Math.min(1, appear)}>
      <div style={{ width: 860, background: C.surface, borderRadius: 24, border: `1px solid ${C.line}`, borderTop: `2px solid ${C.green}`, padding: "26px 38px", fontFamily: UI_FONT }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: 1.4, textTransform: "uppercase" }}>{v.heading}</div>
        {v.lines.map((line, i) => {
          const lp = p(clock, beat, 0.15 + i * 0.16, 0.27 + i * 0.16);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18, opacity: lp, transform: `translateX(${(1 - lp) * 20}px)` }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: C.green, color: C.onAccent, fontWeight: 800, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
              <div style={{ fontSize: 30, fontWeight: 600, color: C.ink }}>{line}</div>
            </div>
          );
        })}
      </div>
    </Centered>
  );
}

/** Algebra tiles: one x² square, b strips and c small squares slide from a loose pile into one rectangle. */
function TilesVisual({ v, clock, beat }: VisualProps<"tiles">) {
  const x = 150;
  const u = Math.min(52, Math.max(30, 300 / Math.max(v.b, 4)));
  const [m, n] = v.sides;
  const ox = WIDTH / 2 - (x + m * u) / 2 + 40;
  const oy = STAGE_TOP + 40;
  const move = p(clock, beat, 0.3, 0.62);
  const labels = p(clock, beat, 0.68, 0.8);
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const at = (sx: number, sy: number, tx: number, ty: number) => ({ left: sx + (tx - sx) * ease(move), top: sy + (ty - sy) * ease(move) });
  const tile = (key: string, w: number, h: number, bg: string, pos: { left: number; top: number }, appear: number, text?: string) => (
    <div key={key} style={{ position: "absolute", ...pos, width: w - 4, height: h - 4, background: bg, border: `2px solid ${C.line}`, borderRadius: 8, opacity: appear, transform: `scale(${0.7 + 0.3 * appear})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: C.ink }}>
      {text ? <MathText text={text} /> : null}
    </div>
  );
  const pile = (i: number, cols: number, baseX: number, baseY: number, gap: number) => ({ x: baseX + (i % cols) * gap, y: baseY + Math.floor(i / cols) * gap });
  return (
    <>
      {tile("sq", x, x, C.blueSoft, at(80, STAGE_TOP + 30, ox, oy), p(clock, beat, 0, 0.1), "x²")}
      {Array.from({ length: v.b }, (_, i) => {
        const onSide = i < m;
        const from = pile(i, 6, 300, STAGE_TOP + 20, u + 10);
        return onSide
          ? tile(`b${i}`, u, x, C.greenSoft, at(from.x, from.y, ox + x + i * u, oy), p(clock, beat, 0.05 + i * 0.01, 0.15 + i * 0.01))
          : tile(`b${i}`, x, u, C.greenSoft, at(from.x, from.y + 160, ox, oy + x + (i - m) * u), p(clock, beat, 0.05 + i * 0.01, 0.15 + i * 0.01));
      })}
      {Array.from({ length: v.c }, (_, i) => {
        const from = pile(i, 6, WIDTH - 360, STAGE_TOP + 260, u + 6);
        return tile(`c${i}`, u, u, C.fixSoft, at(from.x, from.y, ox + x + (i % m) * u, oy + x + Math.floor(i / m) * u), p(clock, beat, 0.1 + i * 0.01, 0.2 + i * 0.01));
      })}
      <div style={{ position: "absolute", left: ox + (x + m * u) / 2 - 60, width: 120, top: oy - 58, textAlign: "center", fontSize: 40, color: C.green, opacity: labels }}>
        <MathText text={`x + ${m}`} />
      </div>
      <div style={{ position: "absolute", left: ox - 150, width: 130, top: oy + (x + n * u) / 2 - 26, textAlign: "right", fontSize: 40, color: C.green, opacity: labels }}>
        <MathText text={`x + ${n}`} />
      </div>
    </>
  );
}

/** A number line: a dot starts at `start` and hops for each move, left for negative, right for positive. */
function NumberLineVisual({ v, clock, beat }: VisualProps<"number-line">) {
  const all = [v.start];
  for (const move of v.moves) all.push(all[all.length - 1]! + move);
  const lo = Math.min(-8, ...all) - 1, hi = Math.max(8, ...all) + 1;
  const left = 120, right = WIDTH - 120, y = STAGE_TOP + 250;
  const px = (n: number) => left + ((n - lo) / (hi - lo)) * (right - left);
  const n = v.moves.length;
  const fmt = (k: number) => (k < 0 ? `−${-k}` : `${k}`);
  let dotX = px(v.start);
  const hops = v.moves.map((move, i) => {
    const from = all[i]!, to = all[i + 1]!;
    const t = p(clock, beat, 0.15 + (i * 0.6) / n, 0.15 + ((i + 0.85) * 0.6) / n);
    if (t > 0) dotX = px(from) + (px(to) - px(from)) * t;
    return { from, to, t, move };
  });
  return (
    <>
      <Centered y={STAGE_TOP + 40} opacity={p(clock, beat, 0, 0.1)}>
        <div style={{ fontSize: 56, color: C.ink }}><MathText text={[fmt(v.start), ...v.moves.map((m) => (m < 0 ? `+ (${fmt(m)})` : `+ ${m}`))].join(" ")} /></div>
      </Centered>
      <Svg>
        <line x1={left} x2={right} y1={y} y2={y} stroke={C.line} strokeWidth={3} />
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((k) => (
          <g key={k}>
            <line x1={px(k)} x2={px(k)} y1={y - 10} y2={y + 10} stroke={C.line} strokeWidth={2} />
            <text x={px(k)} y={y + 40} textAnchor="middle" fontSize={20} fill={C.ink} fontFamily={UI_FONT}>{fmt(k)}</text>
          </g>
        ))}
        {hops.map(({ from, to, t }, i) => {
          if (t <= 0) return null;
          const x1 = px(from), x2 = px(to), mid = (x1 + x2) / 2;
          const d = `M ${x1} ${y - 14} Q ${mid} ${y - 110} ${x2} ${y - 14}`;
          return <path key={i} d={d} fill="none" stroke={to < from ? C.miss : C.blue} strokeWidth={4} strokeLinecap="round" strokeDasharray={600} strokeDashoffset={600 * (1 - t)} />;
        })}
        <circle cx={dotX} cy={y} r={14} fill={C.miss} />
      </Svg>
      {v.caption && (
        <Centered y={y + 110} opacity={p(clock, beat, 0.8, 0.92)}>
          <div style={{ fontSize: 32, color: C.green, fontFamily: UI_FONT, fontWeight: 600 }}>{v.caption}</div>
        </Centered>
      )}
    </>
  );
}

function Visual({ v, clock, beat }: { v: AuthoredVisual; clock: BeatClock; beat: number }) {
  switch (v.type) {
    case "title": return <TitleVisual v={v} clock={clock} beat={beat} />;
    case "expression": return <ExpressionVisual v={v} clock={clock} beat={beat} />;
    case "steps": return <StepsVisual v={v} clock={clock} beat={beat} />;
    case "distribute": return <DistributeVisual v={v} clock={clock} beat={beat} />;
    case "area": return <AreaVisual v={v} clock={clock} beat={beat} />;
    case "pair-search": return <PairSearchVisual v={v} clock={clock} beat={beat} />;
    case "common-factor": return <CommonFactorVisual v={v} clock={clock} beat={beat} />;
    case "mistake": return <MistakeVisual v={v} clock={clock} beat={beat} />;
    case "rule": return <RuleVisual v={v} clock={clock} beat={beat} />;
    case "tiles": return <TilesVisual v={v} clock={clock} beat={beat} />;
    case "number-line": return <NumberLineVisual v={v} clock={clock} beat={beat} />;
    case "shape": return <ShapeVisual v={v} clock={clock} beat={beat} />;
    case "chart": return <ChartVisual v={v} clock={clock} beat={beat} />;
    case "grid": return <GridVisual v={v} clock={clock} beat={beat} />;
  }
}

const FIGURE_COLOURS = ["#2f7d63", "#e3a33b", "#4f7fc0", "#c4584b", "#7d5fb0", "#5aa6a0"];
const FIG = { cx: WIDTH / 2, cy: STAGE_TOP + 230 };

function FigureCaption({ text, clock, beat }: { text?: string; clock: BeatClock; beat: number }) {
  if (!text) return null;
  return (
    <Centered y={FIG.cy + 230} opacity={p(clock, beat, 0.6, 0.75)}>
      <div style={{ fontSize: 28, color: C.muted, fontFamily: UI_FONT }}>{text}</div>
    </Centered>
  );
}

function ShapeVisual({ v, clock, beat }: VisualProps<"shape">) {
  const corners = polygonCorners(v.angles.length, FIG.cx, FIG.cy, 190);
  return (
    <>
      <Svg>
        <path d={`M ${corners.map((q) => `${q.x} ${q.y}`).join(" L ")} Z`} pathLength={1} fill="none" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - p(clock, beat, 0, 0.3)} />
        <text x={FIG.cx + 260} y={FIG.cy + 200} textAnchor="end" fontSize={20} fill={C.muted} fontFamily={UI_FONT}>Not to scale</text>
        {corners.map((q, i) => {
          const at = towardCentre(q, FIG.cx, FIG.cy, 74);
          const a = v.angles[i];
          return <text key={i} x={at.x} y={at.y} textAnchor="middle" dominantBaseline="middle" fontSize={a === null ? 40 : 32} fontWeight={600} fill={a === null ? C.green : C.ink} fontFamily={UI_FONT} opacity={p(clock, beat, 0.3 + i * 0.08, 0.42 + i * 0.08)}>{a === null ? "?" : `${a}°`}</text>;
        })}
        {v.sides?.map((label, i) => {
          const a = corners[i]!, b = corners[(i + 1) % corners.length]!;
          const mid = towardCentre({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, FIG.cx, FIG.cy, -34);
          return <text key={`s${i}`} x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fontSize={26} fill={C.muted} fontFamily={UI_FONT} opacity={p(clock, beat, 0.6, 0.72)}>{label}</text>;
        })}
      </Svg>
      <FigureCaption text={v.caption} clock={clock} beat={beat} />
    </>
  );
}

function ChartVisual({ v, clock, beat }: VisualProps<"chart">) {
  const max = Math.max(...v.values, 1);
  const colour = (i: number) => FIGURE_COLOURS[i % FIGURE_COLOURS.length]!;
  return (
    <>
      <Svg>
        {v.kind === "bar"
          ? v.values.map((value, i) => {
              const w = 900 / v.values.length, x = FIG.cx - 450 + i * w, base = FIG.cy + 170;
              const h = (value / max) * 340 * p(clock, beat, 0.05 + i * 0.08, 0.3 + i * 0.08);
              return (
                <g key={i}>
                  <rect x={x + w * 0.15} y={base - h} width={w * 0.7} height={h} rx={8} fill={colour(i)} />
                  <text x={x + w / 2} y={base - h - 20} textAnchor="middle" fontSize={30} fontWeight={700} fill={C.ink} fontFamily={UI_FONT}>{value}</text>
                  <text x={x + w / 2} y={base + 36} textAnchor="middle" fontSize={26} fill={C.muted} fontFamily={UI_FONT}>{v.labels[i]}</text>
                </g>
              );
            })
          : pieSlices(v.values).map((slice, i) => (
              <g key={i} opacity={p(clock, beat, i * 0.1, 0.15 + i * 0.1)}>
                <path d={slicePath(FIG.cx - 200, FIG.cy, 200, slice.start, slice.end)} fill={colour(i)} stroke="#fff" strokeWidth={4} />
                <rect x={FIG.cx + 80} y={FIG.cy - 150 + i * 56} width={28} height={28} rx={6} fill={colour(i)} />
                <text x={FIG.cx + 124} y={FIG.cy - 128 + i * 56} fontSize={30} fill={C.ink} fontFamily={UI_FONT}>{v.labels[i]} · {v.values[i]}</text>
              </g>
            ))}
      </Svg>
      <FigureCaption text={v.caption} clock={clock} beat={beat} />
    </>
  );
}

function GridVisual({ v, clock, beat }: VisualProps<"grid">) {
  const n = gridExtent(v.points), size = 420, step = size / n, ox = FIG.cx - size / 2, oy = FIG.cy + size / 2;
  const at = (x: number, y: number) => ({ x: ox + x * step, y: oy - y * step });
  const end = v.line ? Math.min(n, v.line.m > 0 ? (n - v.line.c) / v.line.m : n) : 0;
  return (
    <>
      <Svg>
        {Array.from({ length: n + 1 }, (_, i) => (
          <g key={i}>
            <line x1={at(i, 0).x} y1={oy} x2={at(i, n).x} y2={at(i, n).y} stroke={C.line} strokeWidth={2} />
            <line x1={ox} y1={at(0, i).y} x2={at(n, i).x} y2={at(n, i).y} stroke={C.line} strokeWidth={2} />
            <text x={at(i, 0).x} y={oy + 30} textAnchor="middle" fontSize={20} fill={C.muted} fontFamily={UI_FONT}>{i}</text>
            {i > 0 && <text x={ox - 22} y={at(0, i).y + 7} textAnchor="middle" fontSize={20} fill={C.muted} fontFamily={UI_FONT}>{i}</text>}
          </g>
        ))}
        {v.line && end > 0 && (
          <line x1={at(0, v.line.c).x} y1={at(0, v.line.c).y} x2={at(end, v.line.m * end + v.line.c).x} y2={at(end, v.line.m * end + v.line.c).y} stroke={C.fix} strokeWidth={4} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p(clock, beat, 0.5, 0.75)} />
        )}
        {v.points.map((pt, i) => (
          <g key={pt.label} opacity={p(clock, beat, 0.1 + i * 0.1, 0.25 + i * 0.1)}>
            <circle cx={at(pt.x, pt.y).x} cy={at(pt.x, pt.y).y} r={11} fill={C.green} stroke="#fff" strokeWidth={3} />
            <text x={at(pt.x, pt.y).x + 18} y={at(pt.x, pt.y).y - 16} fontSize={26} fontWeight={700} fill={C.ink} fontFamily={UI_FONT}>{pt.label}({pt.x}, {pt.y})</text>
          </g>
        ))}
      </Svg>
      <FigureCaption text={v.caption} clock={clock} beat={beat} />
    </>
  );
}

export const AuthoredLesson: React.FC<AuthoredLessonProps> = (lesson) => {
  const { fps } = useVideoConfig();
  if (!lesson.scenes?.length) return <AbsoluteFill style={{ background: C.paper }} />;
  let from = 0;
  return (
    <VarContext.Provider value={lesson.variable || "x"}>
      <ThemeRoot theme={lesson.theme}>
        {lesson.scenes.map((scene, index) => {
          const duration = scene.beats.reduce((s, b) => s + Math.round(b.seconds * fps), 0);
          const start = from;
          from += duration;
          return (
            <Sequence key={scene.id} from={start} durationInFrames={duration}>
              <SceneFrame lesson={lesson} sceneIndex={index} durationInFrames={duration}>
                {(clock) => {
                  const beat = currentBeat(clock);
                  const fade = beatP(clock, beat, 0, 0.06);
                  return (
                    <div style={{ position: "absolute", inset: 0, opacity: beat === 0 ? 1 : fade }}>
                      <Visual v={scene.beats[beat]!.visual} clock={clock} beat={beat} />
                    </div>
                  );
                }}
              </SceneFrame>
            </Sequence>
          );
        })}
      </ThemeRoot>
    </VarContext.Provider>
  );
};
