"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  LOTUS_GAME_MAX_TRIES,
  LOTUS_SELECT_SEPARATOR,
  LOTUS_SPLIT_TOKENS,
  type EditHistorySample,
  type FourSignsGame,
  type LotusBracketSign,
  type LotusClaimVerdict,
  type LotusGameResponse,
  type SplitConfidenceGame,
  type TrueFalseGame,
  type TwoNumbersGame,
  type TwoNumbersTry,
} from "@cogna/shared";
import { prettyAlgebra } from "@/components/games/TileGame";
import { GAME_WORDS } from "./themed-game-words";
import { signed } from "./themed-game-parts";
import styles from "./seven-ways.module.css";

/**
 * The Seven Ways games whose object can't be a re-dressed version of the shared
 * ones: chips that fly, a deck that swipes, reels that turn. They report the
 * same plays as the shared games, so the server reads them the same way, and
 * none of them says right or wrong.
 */
interface Props<G> {
  game: G;
  disabled?: boolean;
  onChange: (response: LotusGameResponse | null) => void;
}

const SETTLE_MS = 600;

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// ---------- Split your chips ----------

export function ChipSplit({ game, disabled, onChange }: Props<SplitConfidenceGame>) {
  const words = GAME_WORDS.SPLIT_CONFIDENCE.sevenways;
  // Where each chip is: the index of an answer, or -1 for the tray.
  const [at, setAt] = useState<number[]>(() => Array(LOTUS_SPLIT_TOKENS).fill(-1));
  const [spots, setSpots] = useState<Array<{ x: number; y: number }>>([]);
  const area = useRef<HTMLDivElement>(null);
  const counts = game.options.map((_, i) => at.filter((a) => a === i).length);
  const left = at.filter((a) => a < 0).length;

  const report = useLatest(onChange);
  const key = at.join();
  useEffect(() => {
    report.current(left === 0 ? { kind: "SPLIT_CONFIDENCE", counts } : null);
  }, [key, left, report]);

  // A chip's place is read off the laid-out cards, so it lands right at any width.
  useLayoutEffect(() => {
    const place = () => {
      const box = area.current?.getBoundingClientRect();
      if (!box || !area.current) return;
      const middle = (el: Element | null | undefined) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, h: r.height } : { x: 0, y: 0, h: 0 };
      };
      const slots = area.current.querySelectorAll("[data-slot]");
      const cards = area.current.querySelectorAll("[data-answer]");
      let free = 0;
      setSpots(at.map((where, chip) => {
        if (where < 0) { const m = middle(slots[free++]); return { x: m.x, y: m.y }; }
        const m = middle(cards[where]);
        const below = at.slice(0, chip).filter((a) => a === where).length;
        return { x: m.x, y: m.y + m.h / 2 - 30 - below * 9 };
      }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [key]);

  const drop = (answer: number) => {
    setAt((cur) => {
      const chip = cur.findIndex((a) => a < 0);
      return chip < 0 ? cur : cur.map((a, i) => (i === chip ? answer : a));
    });
  };
  const lift = (chip: number) => setAt((cur) => cur.map((a, i) => (i === chip ? -1 : a)));
  return (
    <>
      <p className={styles.ask}>{words.intro}</p>
      <div className={styles.chipArea} ref={area}>
        <div className={styles.answers}>
          {game.options.map((option, i) => (
            <button key={option} type="button" className={styles.answer} data-answer data-has={counts[i]! > 0 || undefined} disabled={disabled || left === 0}
              aria-label={`${words.place} ${prettyAlgebra(option)}. ${counts[i]} on it.`} onClick={() => drop(i)}>
              <span className={styles.mono}>{prettyAlgebra(option).split(")(").map((part, k, all) => <span key={k}>{k > 0 ? "(" : ""}{part}{k < all.length - 1 ? ")" : ""}</span>)}</span>
              <span className={styles.chipCount}>{counts[i] ? `${counts[i]} ${counts[i] === 1 ? words.token : words.tokens}` : ""}</span>
            </button>
          ))}
        </div>
        <div className={styles.tray}>
          <span>{words.tray}</span>
          <div className={styles.slots} aria-hidden="true">{at.map((_, i) => <i key={i} data-slot />)}</div>
        </div>
        <div className={styles.chipLayer}>
          {spots.length === at.length && at.map((where, chip) => (
            <span key={chip} className={styles.chipX} style={{ transform: `translateX(${spots[chip]!.x}px)` }}>
              <span className={styles.chipY} style={{ transform: `translateY(${spots[chip]!.y}px)` }}>
                <button type="button" className={styles.chip} disabled={disabled || where < 0} tabIndex={where < 0 ? -1 : 0} aria-hidden={where < 0}
                  aria-label={where < 0 ? undefined : `${words.takeBack} ${prettyAlgebra(game.options[where]!)}`} onClick={() => lift(chip)} />
              </span>
            </span>
          ))}
        </div>
      </div>
      <p className={styles.note} aria-live="polite">{left === LOTUS_SPLIT_TOKENS ? "Tap an answer to drop a chip on it. Tap a chip to take it back." : left > 0 ? `Place all four chips. ${left} left.` : "All four chips are placed."}</p>
    </>
  );
}

// ---------- Swipe the claims ----------

const SWIPE_X = 110;
const SWIPE_Y = 90;

export function SwipeDeck({ game, disabled, onChange }: Props<TrueFalseGame>) {
  const words = GAME_WORDS.TRUE_FALSE.sevenways;
  const n = game.claims.length;
  const [verdicts, setVerdicts] = useState<Array<LotusClaimVerdict | null>>(() => Array(n).fill(null));
  const [times, setTimes] = useState<number[]>(() => Array(n).fill(0));
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<{ card: number; verdict: LotusClaimVerdict } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const shownAt = useRef(Date.now());
  const index = verdicts.findIndex((v) => v === null);
  const finished = index === -1;
  const deck = useRef<HTMLDivElement>(null);

  useEffect(() => { shownAt.current = Date.now(); }, [index]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), 480);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const report = useLatest(onChange);
  useEffect(() => {
    report.current(finished ? { kind: "TRUE_FALSE", verdicts: verdicts as LotusClaimVerdict[], cardMs: times } : null);
  }, [finished, verdicts, times, report]);

  const decide = (verdict: LotusClaimVerdict) => {
    if (finished || disabled) return;
    const spent = Math.max(200, Date.now() - shownAt.current);
    setVerdicts((cur) => cur.map((v, i) => (i === index ? verdict : v)));
    setTimes((cur) => cur.map((t, i) => (i === index ? spent : t)));
    setLeaving({ card: index, verdict });
    setDrag(null);
  };
  const back = () => {
    const last = finished ? n - 1 : index - 1;
    if (last >= 0) setVerdicts((cur) => cur.map((v, i) => (i === last ? null : v)));
  };
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY };
    setDrag({ x: 0, y: 0 });
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current) setDrag({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
  };
  const up = () => {
    const at = drag;
    start.current = null;
    if (at && at.x > SWIPE_X) decide("true");
    else if (at && at.x < -SWIPE_X) decide("false");
    else if (at && at.y > SWIPE_Y) decide("unsure");
    else setDrag(null);
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const verdict = ({ ArrowRight: "true", ArrowLeft: "false", ArrowDown: "unsure" } as const)[event.key as "ArrowRight" | "ArrowLeft" | "ArrowDown"];
    if (!verdict) return;
    event.preventDefault();
    decide(verdict);
  };
  const face = (card: number) => (
    <>
      <span className={styles.cardNo}>{words.card} {card + 1} of {n}</span>
      <span className={`${styles.mono} ${styles.cardClaim}`}><span>{prettyAlgebra(game.expression)} =</span> <span>{prettyAlgebra(game.claims[card]!)}</span></span>
    </>
  );
  const stamp = (kind: "true" | "false" | "unsure", opacity: number) => (
    <span className={styles.stamp} data-kind={kind} style={{ opacity }} aria-hidden="true">{kind === "true" ? words.yes : kind === "false" ? words.no : words.unsure}</span>
  );
  return (
    <>
      <p className={styles.ask}>{words.intro}</p>
      <div className={styles.deckWrap}>
        <div className={styles.deck} ref={deck} tabIndex={finished ? -1 : 0} onKeyDown={keys} role="group" aria-label="Claim cards. Right arrow for true, left arrow for false, down arrow for not sure.">
          {finished ? (
            <div className={styles.card} role="status"><span className={styles.cardDone}>{words.done}</span></div>
          ) : (
            <>
              {[2, 1].map((depth) => index + depth < n && (
                <div key={index + depth} className={styles.card} style={{ transform: `translateY(${depth * 14}px) scale(${1 - depth * 0.05})` }} aria-hidden="true">{face(index + depth)}</div>
              ))}
              <div key={index} className={styles.card} data-top data-dragging={drag ? true : undefined} style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 14}deg)` } : undefined}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                {face(index)}
                {stamp("true", Math.max(0, (drag?.x ?? 0) / SWIPE_X))}
                {stamp("false", Math.max(0, -(drag?.x ?? 0) / SWIPE_X))}
                {stamp("unsure", Math.max(0, (drag?.y ?? 0) / SWIPE_Y))}
              </div>
            </>
          )}
          {leaving && <div key={`out-${leaving.card}`} className={styles.card} data-leaving={leaving.verdict} aria-hidden="true">{face(leaving.card)}{stamp(leaving.verdict, 1)}</div>}
        </div>
        <div className={styles.swipeButtons}>
          <button type="button" data-kind="false" disabled={disabled || finished} aria-label={words.no} onClick={() => decide("false")}>✕</button>
          <button type="button" data-kind="unsure" disabled={disabled || finished} aria-label={words.unsure} onClick={() => decide("unsure")}>?</button>
          <button type="button" data-kind="true" disabled={disabled || finished} aria-label={words.yes} onClick={() => decide("true")}>✓</button>
        </div>
        <button type="button" className={styles.backLink} disabled={disabled || (!finished && index === 0)} onClick={back}>Back</button>
      </div>
    </>
  );
}

// ---------- Crack the lock ----------

const ROW = 52;

function Reel({ label, value, range, disabled, onChange }: { label: string; value: number; range: number; disabled?: boolean; onChange: (next: number) => void }) {
  const values = Array.from({ length: 2 * range + 1 }, (_, i) => i - range).filter((n) => n !== 0);
  const index = values.indexOf(value);
  const at = (i: number) => values[Math.max(0, Math.min(values.length - 1, i))]!;
  const grab = useRef<{ y: number; index: number } | null>(null);
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") { event.preventDefault(); onChange(at(index - 1)); }
    if (event.key === "ArrowDown") { event.preventDefault(); onChange(at(index + 1)); }
  };
  return (
    <div className={styles.reel}>
      <button type="button" disabled={disabled || index <= 0} aria-label={`${label}: lower`} onClick={() => onChange(at(index - 1))}>▲</button>
      <div className={styles.reelWindow} role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuenow={value} aria-valuemin={-range} aria-valuemax={range} aria-valuetext={signed(value)} onKeyDown={keys}
        onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); grab.current = { y: event.clientY, index }; }}
        onPointerMove={(event) => { if (!grab.current) return; const next = at(grab.current.index - Math.round((event.clientY - grab.current.y) / ROW)); if (next !== value) onChange(next); }}
        onPointerUp={() => { grab.current = null; }} onPointerCancel={() => { grab.current = null; }}>
        <i className={styles.reelBand} />
        <div className={styles.reelList} style={{ transform: `translateY(${ROW - index * ROW}px)` }}>
          {values.map((n) => <div key={n}>{signed(n)}</div>)}
        </div>
      </div>
      <button type="button" disabled={disabled || index >= values.length - 1} aria-label={`${label}: higher`} onClick={() => onChange(at(index + 1))}>▼</button>
    </div>
  );
}

function Gauge({ label, value, scale }: { label: string; value: number; scale: number }) {
  const angle = Math.tanh(value / scale) * 80;
  return (
    <div className={styles.gauge}>
      <span>{label}</span>
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="var(--line)" strokeWidth="9" strokeLinecap="round" />
        <g className={styles.needle} style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="60" y1="62" x2="60" y2="22" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="60" cy="62" r="5" fill="var(--ink)" />
      </svg>
      <b>{signed(value)}</b>
    </div>
  );
}

export function LockReels({ game, disabled, onChange }: Props<TwoNumbersGame>) {
  const words = GAME_WORDS.TWO_NUMBERS.sevenways;
  const [pair, setPair] = useState({ p: 1, q: 1 });
  const [touched, setTouched] = useState(false);
  const [tries, setTries] = useState<TwoNumbersTry[]>([]);
  const startedAt = useRef(Date.now());
  const set = (key: "p" | "q", value: number) => { setTouched(true); setPair((cur) => ({ ...cur, [key]: value })); };

  // A pair counts as a try once the student pauses on it.
  useEffect(() => {
    if (!touched) return;
    const timer = window.setTimeout(() => {
      setTries((cur) => {
        const last = cur[cur.length - 1];
        if ((last && last.p === pair.p && last.q === pair.q) || cur.length >= LOTUS_GAME_MAX_TRIES) return cur;
        return [...cur, { p: pair.p, q: pair.q, atMs: Date.now() - startedAt.current }];
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [pair, touched]);

  const report = useLatest(onChange);
  useEffect(() => {
    report.current(touched ? { kind: "TWO_NUMBERS", tries, final: { p: pair.p, q: pair.q } } : null);
  }, [touched, tries, pair, report]);

  // Every pair tried, on a map of what they add to and multiply to: the search made visible.
  const plot = (t: { p: number; q: number }) => ({
    x: 150 + Math.tanh((t.p + t.q) / 10) * 130,
    y: 60 - Math.tanh((t.p * t.q) / 30) * 48,
  });
  const trail = [...tries, ...(touched ? [{ p: pair.p, q: pair.q }] : [])].map(plot);
  return (
    <>
      <p className={styles.ask}>{words.intro}</p>
      <div className={styles.lockGrid}>
        <div className={styles.reels}>
          <Reel label={words.first} value={pair.p} range={game.range} disabled={disabled} onChange={(v) => set("p", v)} />
          <span className={styles.reelAnd} aria-hidden="true">&amp;</span>
          <Reel label={words.second} value={pair.q} range={game.range} disabled={disabled} onChange={(v) => set("q", v)} />
          <svg viewBox="0 0 34 44" className={styles.padlock} aria-hidden="true">
            <path d="M9 20 V13 a8 8 0 0 1 16 0 V20" fill="none" stroke="var(--gold)" strokeWidth="4" />
            <rect x="3" y="19" width="28" height="23" rx="6" fill="var(--gold)" />
            <circle cx="17" cy="30" r="3.4" fill="var(--ink)" />
          </svg>
        </div>
        <div className={styles.lockSide}>
          <div className={styles.gauges}>
            <Gauge label={words.product} value={pair.p * pair.q} scale={30} />
            <Gauge label={words.sum} value={pair.p + pair.q} scale={10} />
          </div>
          <div className={styles.lockMap}>
            <svg viewBox="0 0 300 120" role="img" aria-label={`${tries.length} ${tries.length === 1 ? "pair" : "pairs"} tried`}>
              <line x1="16" y1="60" x2="284" y2="60" stroke="var(--line)" />
              <line x1="150" y1="6" x2="150" y2="114" stroke="var(--line)" />
              <text x="282" y="54" textAnchor="end" className={styles.mapLabel}>add →</text>
              <text x="156" y="16" className={styles.mapLabel}>multiply</text>
              {trail.length > 1 && <polyline points={trail.map((t) => `${t.x},${t.y}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeOpacity=".5" />}
              {trail.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={i === trail.length - 1 ? 5 : 3} fill={i === trail.length - 1 ? "var(--accent)" : "var(--violet)"} />)}
            </svg>
          </div>
        </div>
      </div>
      <p className={styles.bracketsNow} aria-live="polite">(x {pair.p < 0 ? "−" : "+"} {Math.abs(pair.p)})(x {pair.q < 0 ? "−" : "+"} {Math.abs(pair.q)})</p>
    </>
  );
}

// ---------- Sign quadrant ----------

/** Which way a case's middle and last terms point, read from its own text. Null if it can't be read. */
function caseSigns(expression: string): { middle: "+" | "−"; last: "+" | "−" } | null {
  const m = /^x\S*\s*([+\-−])\s*\d*x\s*([+\-−])\s*\d+$/.exec(prettyAlgebra(expression).trim());
  return m ? { middle: m[1] === "+" ? "+" : "−", last: m[2] === "+" ? "+" : "−" } : null;
}

export function SignQuadrant({ game, disabled, onChange }: Props<FourSignsGame>) {
  const words = GAME_WORDS.FOUR_SIGNS.sevenways;
  const [picks, setPicks] = useState<Array<[LotusBracketSign | null, LotusBracketSign | null]>>(() => game.cases.map(() => [null, null]));
  const complete = picks.every((p) => p[0] !== null && p[1] !== null);
  const report = useLatest(onChange);
  useEffect(() => {
    report.current(complete ? { kind: "FOUR_SIGNS", picks: picks as Array<[LotusBracketSign, LotusBracketSign]> } : null);
  }, [complete, picks, report]);

  // Laid out by sign so the pattern can be seen; a pick still belongs to its case in the order the server issued.
  const slots: Array<["+" | "−", "+" | "−"]> = [["+", "+"], ["+", "−"], ["−", "+"], ["−", "−"]];
  const signs = game.cases.map(caseSigns);
  const readable = signs.every(Boolean) && slots.every(([last, middle]) => signs.some((s) => s!.last === last && s!.middle === middle));
  const order = readable ? slots.map(([last, middle]) => signs.findIndex((s) => s!.last === last && s!.middle === middle)) : game.cases.map((_, i) => i);
  const flip = (i: number, k: 0 | 1) => setPicks((cur) => cur.map((p, c) => {
    if (c !== i) return p;
    const next: LotusBracketSign = p[k] === "+" ? "-" : "+";
    return k === 0 ? [next, p[1]] : [p[0], next];
  }));
  const cell = (i: number, name: string) => {
    const pick = picks[i]!;
    const signButton = (k: 0 | 1, number: number) => (
      <button type="button" className={styles.signBox} data-set={pick[k] !== null || undefined} disabled={disabled} aria-label={`${name}, sign before ${number}: ${pick[k] === "-" ? "minus" : pick[k] === "+" ? "plus" : "not set"}`} onClick={() => flip(i, k)}>
        {pick[k] === "-" ? "−" : pick[k] === "+" ? "+" : "?"}
      </button>
    );
    return (
      <div key={game.cases[i]} className={styles.quadCard} data-set={(pick[0] !== null && pick[1] !== null) || undefined}>
        <span className={styles.mono}>{prettyAlgebra(game.cases[i]!)}</span>
        <span className={styles.quadBrackets}>(x {signButton(0, game.numbers[0])} {game.numbers[0]})(x {signButton(1, game.numbers[1])} {game.numbers[1]})</span>
      </div>
    );
  };
  return (
    <>
      <p className={styles.ask}>{words.intro}</p>
      {readable ? (
        <div className={styles.quad}>
          <span />
          <span className={styles.quadAxis}>Middle +</span>
          <span className={styles.quadAxis}>Middle −</span>
          <span className={styles.quadAxis} data-side>Last +</span>
          {cell(order[0]!, words.cases[0])}
          {cell(order[1]!, words.cases[1])}
          <span className={styles.quadAxis} data-side>Last −</span>
          {cell(order[2]!, words.cases[2])}
          {cell(order[3]!, words.cases[3])}
        </div>
      ) : <div className={styles.quadPlain}>{order.map((i, slot) => cell(i, words.cases[slot] ?? `Case ${slot + 1}`))}</div>}
    </>
  );
}

// ---------- Typing replay ----------

const PAUSE_MS = 1500;

/** The typing as it happened: every key on a timeline, deletions in red, long pauses marked. It watches, and judges nothing. */
export function TypingScreen({ value, history, drafts, draftWord }: { value: string; history: readonly EditHistorySample[]; drafts: readonly string[]; draftWord: string }) {
  const span = Math.max(1, history[history.length - 1]?.t ?? 1);
  return (
    <div className={styles.screen} aria-hidden="true">
      <div className={styles.screenLine}>{prettyAlgebra(value) || ""}<i className={styles.cursor} /></div>
      <div className={styles.timeline}>
        {history.map((sample, i) => {
          const before = history[i - 1];
          const gap = before ? sample.t - before.t : 0;
          return (
            <span key={i}>
              {gap > PAUSE_MS && <b style={{ left: `${(before!.t / span) * 100}%`, width: `${(gap / span) * 100}%` }} />}
              <i data-deleted={before && sample.v.length < before.v.length ? true : undefined} style={{ left: `${(sample.t / span) * 100}%` }} />
            </span>
          );
        })}
      </div>
      <div className={styles.screenKey}><span>▮ typing</span><span data-deleted>▮ deleting</span><span data-pause>━ pause over 1.5s</span></div>
      {drafts.length > 0 && <ol className={styles.screenDrafts}>{drafts.slice(-3).map((draft, i) => <li key={`${draft}-${i}`}><b>{draftWord} {Math.max(0, drafts.length - 3) + i + 1}</b> <s>{prettyAlgebra(draft)}</s></li>)}</ol>}
    </div>
  );
}

// ---------- Always, sometimes, never ----------

export function ClaimBars({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const top = Math.max(a, b, 1);
  const bar = (value: number, label: string, color: string) => (
    <div className={styles.claimSide}>
      <b>{value}</b>
      <div className={styles.barBox}><i style={{ height: `${Math.max(6, (value / top) * 100)}%`, background: color }} /></div>
      <span className={styles.mono}>{label}</span>
    </div>
  );
  return (
    <div className={styles.versus} role="img" aria-label={`${labelA} is ${a}, ${labelB} is ${b}`}>
      {bar(a, labelA, "var(--accent-deep)")}
      <span className={styles.relation} data-same={a === b || undefined}>{a === b ? "=" : "≠"}</span>
      {bar(b, labelB, "var(--violet)")}
    </div>
  );
}

// ---------- The three older question jobs, kept and redrawn ----------

function ChoiceCard({ pressed, disabled, onClick, children, role }: { pressed: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; role?: "radio" }) {
  return <button type="button" role={role} {...(role ? { "aria-checked": pressed } : { "aria-pressed": pressed })} className={styles.choiceCard} data-on={pressed || undefined} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** Choose one of the forms. */
export function OddOneOut({ options, value, disabled, onChange }: { options: string[]; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <section className={styles.staged} aria-label="Choose one">
      <div className={styles.choiceGrid} role="radiogroup" aria-label="Choose one">
        {options.map((option) => <ChoiceCard key={option} role="radio" pressed={value === option} disabled={disabled} onClick={() => onChange(option)}><span className={styles.mono}>{prettyAlgebra(option)}</span></ChoiceCard>)}
      </div>
    </section>
  );
}

/** Pick every one that fits. */
export function PickEvery({ options, value, disabled, onChange }: { options: string[]; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const picked = new Set(value ? value.split(LOTUS_SELECT_SEPARATOR) : []);
  const toggle = (option: string) => {
    const next = new Set(picked);
    if (next.has(option)) next.delete(option); else next.add(option);
    onChange(options.filter((o) => next.has(o)).join(LOTUS_SELECT_SEPARATOR));
  };
  return (
    <section className={styles.staged} aria-label="Pick every one that fits">
      <div className={styles.choiceGrid} role="group" aria-label="Pick every one that fits">
        {options.map((option) => <ChoiceCard key={option} pressed={picked.has(option)} disabled={disabled} onClick={() => toggle(option)}><span className={styles.mono}>{prettyAlgebra(option)}</span></ChoiceCard>)}
      </div>
    </section>
  );
}

/** Find the first line that goes wrong, or say none does. */
export function FirstWrongLine({ lines, options, value, disabled, onChange }: { lines: string[]; options: string[]; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const nothing = options.find((o) => !/^Line \d+$/.test(o));
  return (
    <section className={styles.staged} aria-label="Find the first wrong line">
      <ol className={styles.lineList}>
        {lines.map((line, i) => {
          const option = `Line ${i}`;
          const pickable = i > 0 && options.includes(option);
          return (
            <li key={i}>
              <button type="button" className={styles.lineButton} data-on={value === option || undefined} disabled={disabled || !pickable} aria-pressed={pickable ? value === option : undefined} onClick={() => onChange(option)}>
                <span>{i === 0 ? "" : i}</span><span className={styles.mono}>{i === 0 ? "" : "= "}{prettyAlgebra(line)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {nothing && <ChoiceCard pressed={value === nothing} disabled={disabled} onClick={() => onChange(nothing)}>{nothing}</ChoiceCard>}
    </section>
  );
}
