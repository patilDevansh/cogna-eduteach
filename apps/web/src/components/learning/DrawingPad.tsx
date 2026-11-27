"use client";

import { useEffect, useRef, useState } from "react";

/** One pen stroke: points in CSS pixels, `t` in ms since the pad appeared (for replay later). */
export type Stroke = { x: number; y: number; t: number }[];

/** Which sheet is showing and the pad's size in CSS pixels, so another screen can scale the drawing. */
export type PadView = { at: number; width: number; height: number };

export const PAPER: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "14rem",
  color: "var(--ink)",
  background: "var(--surface)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--radius)",
};

export function paint(c: HTMLCanvasElement | null, strokes: Stroke[], scale = 1) {
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.strokeStyle = getComputedStyle(c).color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.beginPath();
    s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y); // a tap leaves a dot
    ctx.stroke();
  }
}

/**
 * Rough-work notepad for finger, stylus or mouse, with sheets the student can flip through.
 * Prototype: sheets stay in the browser and are not sent with the answer (that needs a contract
 * change to LotusStudentResponse).
 */
export function DrawingPad({
  onChange,
  height = "14rem",
}: {
  onChange?: (sheets: Stroke[][], view: PadView) => void;
  height?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const leaf = useRef<HTMLCanvasElement>(null); // the page that turns during a flip
  const sheets = useRef<Stroke[][]>([[]]);
  const at = useRef(0);
  const flipping = useRef(false);
  const start = useRef(performance.now());
  // One finger draws; a second finger turns the touch into a swipe that flips sheets.
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const swipe = useRef<"on" | "used" | null>(null);
  const inking = useRef<number | null>(null); // pointer drawing the current stroke
  const [view, setView] = useState({ at: 0, count: 1, strokes: 0 });

  const current = () => sheets.current[at.current];
  const redraw = () => paint(canvas.current, current());
  const sync = () => setView({ at: at.current, count: sheets.current.length, strokes: current().length });

  // Match both backing stores to the displayed size, so lines stay sharp and land under the finger.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      for (const el of [c, leaf.current]) {
        if (!el) continue;
        el.width = c.clientWidth * dpr;
        el.height = c.clientHeight * dpr;
      }
      redraw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const report = () => {
    const c = canvas.current;
    onChange?.(sheets.current, { at: at.current, width: c?.clientWidth ?? 0, height: c?.clientHeight ?? 0 });
  };

  function changed() {
    redraw();
    sync();
    report();
  }

  /** Notepad turn: going forward the top sheet lifts up and over; going back it comes down again. */
  function flipTo(to: number) {
    const l = leaf.current;
    if (flipping.current || to === at.current || to < 0 || to >= sheets.current.length || !l) return;
    const forward = to > at.current;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      at.current = to;
      changed();
      return;
    }
    flipping.current = true;
    // The leaf shows the sheet that moves: the one leaving (forward) or the one arriving (back).
    paint(l, forward ? current() : sheets.current[to]);
    if (forward) {
      at.current = to;
      changed();
    }
    l.style.visibility = "visible";
    const up = "rotateX(100deg)", flat = "rotateX(0deg)";
    l.animate(
      forward
        ? [{ transform: flat, opacity: 1 }, { transform: up, opacity: 0.4 }]
        : [{ transform: up, opacity: 0.4 }, { transform: flat, opacity: 1 }],
      { duration: 420, easing: forward ? "cubic-bezier(0.5, 0, 0.75, 0)" : "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
    // A timer, not `onfinish`: animation events never fire in a hidden tab, which would lock the pad.
    setTimeout(() => {
      l.style.visibility = "hidden";
      if (!forward) {
        at.current = to;
        changed();
      }
      flipping.current = false;
    }, 420);
  }

  function addSheet() {
    if (flipping.current) return;
    sheets.current.push([]);
    sync();
    flipTo(sheets.current.length - 1);
  }

  function fingerDown(e: React.PointerEvent) {
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId); // so a finger lifting off the pad still reports
    if (fingers.current.size !== 2 || swipe.current) return;
    swipe.current = "on";
    // The first finger already started a stroke; it was the start of a swipe, not ink.
    if (inking.current !== null) {
      inking.current = null;
      current().pop();
      changed();
    }
  }

  function fingerUp(e: React.PointerEvent) {
    const from = fingers.current.get(e.pointerId);
    fingers.current.delete(e.pointerId);
    if (swipe.current === "on" && from) {
      const dx = e.clientX - from.x, dy = e.clientY - from.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        swipe.current = "used"; // the other finger lifting must not flip again
        flipTo(at.current + (dx < 0 ? 1 : -1)); // swipe left = next sheet, like turning a page
      }
    }
    if (!fingers.current.size) swipe.current = null;
  }

  function point(e: { clientX: number; clientY: number }) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: Math.round(performance.now() - start.current) };
  }

  // Sheets still underneath show as paper edges below the pad (up to two).
  const under = Math.min(2, view.count - 1 - view.at);
  const edges = [1, 2]
    .slice(0, under)
    .map((n) => `0 ${n * 4}px 0 -${n}px var(--surface), 0 ${n * 4}px 0 -${n - 1}px var(--line-strong)`)
    .join(", ");

  return (
    <div className="field">
      <label htmlFor="rough-work">Rough work</label>
      <div style={{ position: "relative", perspective: "1400px", marginBottom: under * 4 }}>
        <canvas
          id="rough-work"
          ref={canvas}
          aria-label={`Drawing area for rough work, sheet ${view.at + 1} of ${view.count}. Use a finger, stylus or mouse. Swipe with two fingers to change sheet.`}
          style={{ ...PAPER, height, touchAction: "none", cursor: "crosshair", boxShadow: edges || undefined, transition: "box-shadow var(--dur-fast) var(--ease-settle)" }}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") fingerDown(e);
            if (flipping.current || swipe.current || inking.current !== null) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            inking.current = e.pointerId;
            current().push([point(e)]);
            changed();
          }}
          onPointerMove={(e) => {
            if (inking.current !== e.pointerId) return;
            // Coalesced events keep fast strokes smooth on phones and pens.
            const coalesced = e.nativeEvent.getCoalescedEvents?.();
            const events = coalesced?.length ? coalesced : [e.nativeEvent];
            const s = current()[current().length - 1];
            for (const ev of events) s.push(point(ev));
            redraw();
          }}
          onPointerUp={(e) => {
            if (inking.current === e.pointerId) inking.current = null;
            if (e.pointerType === "touch") fingerUp(e);
            report();
          }}
          onPointerCancel={(e) => {
            if (inking.current === e.pointerId) inking.current = null;
            fingers.current.delete(e.pointerId);
            if (!fingers.current.size) swipe.current = null;
          }}
        />
        <canvas
          ref={leaf}
          aria-hidden="true"
          style={{
            ...PAPER,
            height,
            position: "absolute",
            inset: 0,
            visibility: "hidden",
            pointerEvents: "none",
            transformOrigin: "top center",
            backfaceVisibility: "hidden",
            boxShadow: "0 10px 24px -12px rgba(22, 36, 29, 0.35)",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginTop: "var(--s-2)", flexWrap: "wrap" }}>
        <button type="button" className="btn-quiet" disabled={!view.strokes} onClick={() => { current().pop(); changed(); }}>
          Undo
        </button>
        <button type="button" className="btn-quiet" disabled={!view.strokes} onClick={() => { current().length = 0; changed(); }}>
          Clear
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn-quiet" aria-label="Previous sheet" disabled={view.at === 0} onClick={() => flipTo(at.current - 1)}>
          ‹
        </button>
        <span className="faint" aria-live="polite" style={{ fontSize: "var(--text-xs)", fontVariantNumeric: "tabular-nums" }}>
          Sheet {view.at + 1} of {view.count}
        </span>
        <button type="button" className="btn-quiet" aria-label="Next sheet" disabled={view.at === view.count - 1} onClick={() => flipTo(at.current + 1)}>
          ›
        </button>
        <button type="button" className="btn-quiet" onClick={addSheet}>
          + New sheet
        </button>
      </div>
    </div>
  );
}
