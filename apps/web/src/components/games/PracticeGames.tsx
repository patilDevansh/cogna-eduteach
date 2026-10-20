"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MARK_REASONS, type MarkReason, type PracticeAnswer, type PracticeCheckResult, type PracticeItemView } from "@cogna/shared";
import { prettyAlgebra } from "./TileGame";
import styles from "./practice-games.module.css";

/**
 * Practice games: every answer is checked on the server (the browser holds
 * no answers); these components only animate what the server says.
 */

type Check = (answer: PracticeAnswer) => Promise<PracticeCheckResult>;
type RectangleView = Extract<PracticeItemView, { format: "rectangle" }>;
type DeskView = Extract<PracticeItemView, { format: "mark-it" }>;
type RushView = Extract<PracticeItemView, { format: "rush" }>;

/** Make it a rectangle: move x-strips between the side and the bottom until the corner fits the small squares. */
export function RectangleGame({ item, disabled, fitted, onSubmit }: { item: RectangleView; disabled: boolean; fitted: boolean; onSubmit: (pair: [number, number]) => void }) {
  const [side, setSide] = useState(item.strips);
  const bottom = item.strips - side;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const u = Math.max(16, Math.min(32, Math.floor((width - 80) / (item.strips + 3.6))));
  const x = Math.round(u * 3.4);
  const cap = side * bottom;
  const move = (d: number) => {
    if (disabled || fitted) return;
    setSide((s) => Math.min(item.strips, Math.max(0, s + d)));
  };
  return (
    <div className={styles.rect} ref={box}>
      <div className={styles.board} style={{ width: x + item.strips * u + 2, height: x + bottom * u + 2 }} data-fit={fitted || undefined}>
        <span className={styles.sq} style={{ width: x - 2, height: x - 2 }}>x²</span>
        {Array.from({ length: item.strips }, (_, k) => {
          const onSide = k < side;
          const j = item.strips - 1 - k;
          return (
            <button
              key={k}
              type="button"
              aria-label={onSide ? "x strip on the side: tap to move it to the bottom" : "x strip on the bottom: tap to move it to the side"}
              className={styles.strip}
              disabled={disabled || fitted}
              onClick={() => move(onSide ? -1 : 1)}
              style={onSide ? { left: x + k * u, top: 0, width: u - 3, height: x - 2 } : { left: 0, top: x + j * u, width: x - 2, height: u - 3 }}
            />
          );
        })}
        {Array.from({ length: Math.min(cap, item.units) }, (_, k) => (
          <span key={`u${k}`} className={styles.unit} style={{ left: x + (k % side) * u, top: x + Math.floor(k / side) * u, width: u - 3, height: u - 3 }} />
        ))}
        {Array.from({ length: Math.max(0, cap - item.units) }, (_, n) => {
          const k = item.units + n;
          return <span key={`h${k}`} className={styles.hole} style={{ left: x + (k % side) * u, top: x + Math.floor(k / side) * u, width: u - 3, height: u - 3 }} />;
        })}
        {fitted && <span className={styles.sideTop} style={{ left: (x + side * u) / 2 - 20 }}>x + {side}</span>}
        {fitted && <span className={styles.sideLeft} style={{ top: (x + bottom * u) / 2 - 10 }}>x + {bottom}</span>}
      </div>
      {item.units > cap && (
        <p className={styles.spare}>
          {item.units - cap} spare: {Array.from({ length: item.units - cap }, (_, i) => <i key={i} />)}
        </p>
      )}
      <div className={styles.row}>
        <button type="button" className={styles.btn} onClick={() => move(1)} disabled={disabled || fitted || side >= item.strips}>↑ Strip to the side</button>
        <button type="button" className={styles.btn} onClick={() => move(-1)} disabled={disabled || fitted || side <= 0}>Strip to the bottom ↓</button>
        <button type="button" className={styles.primary} onClick={() => onSubmit([side, bottom])} disabled={disabled || fitted}>Does it fit?</button>
      </div>
    </div>
  );
}

const MOUTHS = { happy: "M20 37 Q30 46 40 37", oops: "M21 42 Q30 35 39 42", calm: "M22 39 H38", wow: "M27 39 a3 3.5 0 1 0 6 0 a3 3.5 0 1 0 -6 0" } as const;
function Bit({ mood }: { mood: keyof typeof MOUTHS }) {
  return (
    <svg viewBox="0 0 60 60" width="54" height="54" aria-hidden="true">
      <line x1="30" y1="5" x2="30" y2="12" stroke="#7d8c84" strokeWidth="2" /><circle cx="30" cy="5" r="3.2" fill="#e9a23b" />
      <rect x="8" y="12" width="44" height="38" rx="12" fill="#e3efe9" stroke="#0e6b54" strokeWidth="2" />
      <circle cx="22" cy="28" r="3.8" fill="#16241d" /><circle cx="38" cy="28" r="3.8" fill="#16241d" />
      <path d={MOUTHS[mood]} fill="none" stroke="#16241d" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Marker's desk: stamp Bit's papers, then name the mistake. Resolves once every paper is marked. */
export function MarkersDesk({ item, check, onDone }: { item: DeskView; check: Check; onDone: (outcome: { firstTry: boolean; correct: boolean }) => void }) {
  const [i, setI] = useState(0);
  const [stamp, setStamp] = useState<"right" | "wrong" | null>(null);
  const [needsReason, setNeedsReason] = useState(false);
  const [line, setLine] = useState("Hi, I'm Bit. I did my homework. Can you mark it?");
  const [mood, setMood] = useState<keyof typeof MOUTHS>("calm");
  const [paperDone, setPaperDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstTryRef = useRef(true);
  const learnedRef = useRef(0);
  const paper = item.papers[i];

  async function send(answer: PracticeAnswer) {
    setBusy(true);
    try {
      return await check(answer);
    } finally {
      setBusy(false);
    }
  }

  async function mark(mark: "right" | "wrong") {
    if (busy || stamp) return;
    setStamp(mark);
    const result = await send({ paper: i, mark });
    setLine(result.feedback);
    if (result.verdict === "CORRECT") { setMood("happy"); setPaperDone(true); return; }
    if (result.verdict === "UNFINISHED") { setMood("oops"); setNeedsReason(true); return; }
    firstTryRef.current = false;
    setMood("wow");
    // The marking was wrong: show the true stamp, and for a wrong paper ask for the mistake.
    setStamp(mark === "right" ? "wrong" : "right");
    if (mark === "right") setNeedsReason(true);
    else setPaperDone(true);
  }

  async function name(reason: MarkReason) {
    if (busy) return;
    const result = await send({ paper: i, mark: "wrong", reason });
    setLine(result.feedback);
    if (result.verdict === "CORRECT") { learnedRef.current += 1; setMood("wow"); setNeedsReason(false); setPaperDone(true); }
    else { firstTryRef.current = false; setMood("calm"); }
  }

  function next() {
    if (i + 1 >= item.papers.length) {
      setLine(`Thank you, teacher! I learned ${learnedRef.current} rule${learnedRef.current === 1 ? "" : "s"}.`);
      setMood("happy");
      setI(i + 1);
      onDone({ firstTry: firstTryRef.current, correct: true });
      return;
    }
    setI(i + 1); setStamp(null); setNeedsReason(false); setPaperDone(false); setMood("calm");
    setLine("Here's my next one. Is it right?");
  }

  return (
    <div className={styles.desk}>
      <div className={styles.bit}><Bit mood={mood} /><p className={styles.bubble} aria-live="polite">{prettyAlgebra(line)}</p></div>
      {paper && (
        <div key={i} className={styles.paper}>
          <span className={styles.by}>— Bit · paper {i + 1} of {item.papers.length}</span>
          <p className={styles.q}>{prettyAlgebra(paper.question)}</p>
          <p className={styles.a}>{prettyAlgebra(paper.bitAnswer)}</p>
          {stamp && <span className={styles.stamp} data-ok={stamp === "right" || undefined}>{stamp === "right" ? "✓" : "✗"}</span>}
        </div>
      )}
      {paper && !stamp && (
        <div className={styles.row}>
          <button type="button" className={styles.stampRight} onClick={() => void mark("right")} disabled={busy}>✓ Right</button>
          <button type="button" className={styles.stampWrong} onClick={() => void mark("wrong")} disabled={busy}>✗ Wrong</button>
        </div>
      )}
      {needsReason && (
        <div className={styles.reasons}>
          <p>What went wrong?</p>
          <div className={styles.row}>
            {MARK_REASONS.map((r) => <button key={r.code} type="button" className={styles.chip} onClick={() => void name(r.code)} disabled={busy}>{r.label}</button>)}
          </div>
        </div>
      )}
      {paperDone && paper && <div className={styles.row}><button type="button" className={styles.primary} onClick={next}>{i + 1 < item.papers.length ? "Next paper →" : "Finish"}</button></div>}
    </div>
  );
}

/** Bracket rush: answers fall; tap the right one before it lands. Misses come back later. Fluency only. */
export function BracketRush({ item, check, onDone }: { item: RushView; check: Check; onDone: (outcome: { firstTry: boolean; correct: boolean }) => void }) {
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [current, setCurrent] = useState<{ round: number; back: boolean } | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [right, setRight] = useState(0);
  const [why, setWhy] = useState("");
  const [left, setLeft] = useState(item.seconds);
  const [y, setY] = useState(0);
  const [locked, setLocked] = useState(false);
  const queueRef = useRef<Array<{ round: number; back: boolean }>>([]);
  const leftRef = useRef(item.seconds);
  const stats = useRef({ cameBack: 0, cameBackRight: 0 });
  const speed = useRef(16);
  const order = useMemo(() => item.rounds.map((_, i) => ({ round: i, back: false })), [item.rounds]);

  function start() {
    queueRef.current = order.slice(1);
    setCurrent(order[0] ?? null); setScore(0); setStreak(0); setRight(0); setWhy("");
    leftRef.current = item.seconds; setLeft(item.seconds); setY(0); speed.current = 16; stats.current = { cameBack: 0, cameBackRight: 0 };
    setPhase("playing");
  }

  /** Next question; a missed one is put back two places later, so it comes back soon. */
  function advance(requeue?: { round: number }) {
    const queue = queueRef.current;
    if (requeue) queue.splice(Math.min(2, queue.length), 0, { round: requeue.round, back: true });
    const head = queue.shift() ?? null;
    if (head?.back) stats.current.cameBack += 1;
    setCurrent(head);
    setY(0);
    if (!head) setPhase("over");
  }

  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      leftRef.current = Math.max(0, leftRef.current - dt);
      setLeft(leftRef.current);
      if (leftRef.current <= 0) { setPhase("over"); return; }
      if (!locked) setY((v) => v + speed.current * dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, locked]);

  // Landing counts as a miss: it comes back later.
  useEffect(() => {
    if (phase === "playing" && current && y > 160 && !locked) {
      setStreak(0);
      setWhy("Too slow: it'll come back.");
      advance({ round: current.round });
    }
  }, [y, phase, current, locked]);

  const doneRef = useRef(false);
  useEffect(() => {
    if (phase === "over" && !doneRef.current) {
      doneRef.current = true;
      onDone({ firstTry: true, correct: right > 0 });
    }
  }, [phase, right, onDone]);

  async function pick(option: number) {
    if (!current || locked || phase !== "playing") return;
    setLocked(true);
    try {
      const result = await check({ round: current.round, option });
      if (result.verdict === "CORRECT") {
        const s = streak + 1;
        setStreak(s); setRight((r) => r + 1); setScore((v) => v + 10 * Math.min(s, 5)); setWhy("");
        if (current.back) stats.current.cameBackRight += 1;
        speed.current = Math.min(60, speed.current * 1.08);
        advance();
      } else {
        setStreak(0);
        setWhy(prettyAlgebra(`${result.feedback} It'll come back.`));
        speed.current = Math.max(14, speed.current * 0.9);
        await new Promise((r) => setTimeout(r, 900));
        advance({ round: current.round });
      }
    } finally {
      setLocked(false);
    }
  }

  if (phase === "ready") {
    return (
      <div className={styles.rushIntro}>
        <p className={styles.rushTitle}>Bracket rush</p>
        <p>Tap the right answer before it lands. Combos speed it up; anything you miss comes back for a second go. {item.seconds} seconds.</p>
        <button type="button" className={styles.primary} onClick={start}>Start</button>
      </div>
    );
  }
  if (phase === "over") {
    return (
      <div className={styles.rushIntro}>
        <p className={styles.rushScore}>{score}</p>
        <p>{right} right in {item.seconds} seconds.</p>
        <p className={styles.muted}>{stats.current.cameBack ? `${stats.current.cameBack} came back; you got ${stats.current.cameBackRight} the second time.` : "Nothing needed a second go."} Speed is practice, never proof of mastery.</p>
      </div>
    );
  }
  const round = current ? item.rounds[current.round] : undefined;
  return (
    <div className={styles.rush}>
      <div className={styles.rushHead}><span>Score {score}</span>{streak > 1 && <b>×{Math.min(streak, 5)} combo</b>}<span>{Math.ceil(left)} s</span></div>
      <div className={styles.timer}><i style={{ width: `${(left / item.seconds) * 100}%` }} /></div>
      <div className={styles.well}>
        {round && <div className={styles.faller} data-back={current?.back || undefined} style={{ top: y }}>{prettyAlgebra(round.expression)}</div>}
        <span className={styles.floor} />
      </div>
      <div className={styles.answers}>
        {round?.options.map((o, i) => <button key={`${current?.round}-${i}`} type="button" className={styles.answer} onClick={() => void pick(i)} disabled={locked}>{prettyAlgebra(o)}</button>)}
      </div>
      <p className={styles.why} aria-live="polite">{why}</p>
    </div>
  );
}
