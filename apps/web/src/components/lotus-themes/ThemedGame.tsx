"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  LOTUS_GAME_MAX_TRIES,
  type CommitThenChooseGame,
  type LotusClaimVerdict,
  type LotusGameConfig,
  type LotusGameResponse,
  type LotusTheme,
  type TrueFalseGame,
  type TwoNumbersGame,
  type TwoNumbersTry,
} from "@cogna/shared";
import { prettyAlgebra } from "@/components/games/TileGame";
import { GAME_WORDS } from "./themed-game-words";
import styles from "./themed-game.module.css";

/**
 * One host for the themed Lotus games. The server issued the game from the
 * checked question and will read the play itself, so this component never
 * decides right or wrong, shows no verdict, and the theme only changes the
 * words (themed-game-words.ts) and the art. The play it reports is the same
 * whichever theme is on screen.
 */
export interface ThemedGameProps {
  theme: LotusTheme;
  game: LotusGameConfig;
  disabled?: boolean;
  /** The play so far, or null while it is not yet a complete answer. */
  onChange: (response: LotusGameResponse | null) => void;
}

const SETTLE_MS = 600;

const signed = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

/** Steps a whole number up or down, skipping 0 (a bracket of x + 0 is not an answer here). */
function Stepper({ label, value, range, disabled, onChange }: { label: string; value: number; range: number; disabled?: boolean; onChange: (next: number) => void }) {
  const step = (d: number) => {
    let next = value + d;
    if (next === 0) next += d;
    onChange(Math.max(-range, Math.min(range, next)));
  };
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <span className={styles.stepLabel}>{label}</span>
      <div className={styles.stepRow}>
        <button type="button" className={styles.stepBtn} disabled={disabled || value <= -range} onClick={() => step(-1)} aria-label={`${label}: lower`}>‹</button>
        <output className={styles.stepValue} aria-live="polite">{signed(value)}</output>
        <button type="button" className={styles.stepBtn} disabled={disabled || value >= range} onClick={() => step(1)} aria-label={`${label}: higher`}>›</button>
      </div>
    </div>
  );
}

// ---------- Two numbers ----------

/** Theme art that redraws from the two numbers. It only shows their sum and product, never a verdict. */
function TwoNumbersArt({ theme, p, q }: { theme: LotusTheme; p: number; q: number }): ReactElement {
  const prod = p * q;
  const sum = p + q;
  if (theme === "drafting") {
    // A plan: a room whose sides are (x + p) by (x + q) around a fixed x square.
    const base = 46;
    const w = Math.max(10, base + p * 3);
    const h = Math.max(10, base + q * 3);
    return (
      <svg viewBox="0 0 220 160" className={styles.art} aria-hidden="true">
        <rect x="20" y="20" width={base} height={base} fill="none" stroke="var(--line-strong)" strokeDasharray="4 3" />
        <rect x="20" y="20" width={w} height={h} fill="var(--accent-wash)" stroke="var(--accent)" strokeWidth="1.6" className={styles.move} />
        <text x={20 + w / 2} y="14" textAnchor="middle" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-math)">x {p < 0 ? "−" : "+"} {Math.abs(p)}</text>
        <text x={Math.min(150, 20 + w + 6)} y={20 + h / 2} fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-math)">x {q < 0 ? "−" : "+"} {Math.abs(q)}</text>
      </svg>
    );
  }
  if (theme === "cabinet") {
    const dial = (n: number, cx: number) => {
      const angle = (n / 12) * 150;
      return (
        <g key={cx} transform={`translate(${cx} 70)`}>
          <circle r="46" fill="rgba(0,0,0,.25)" stroke="var(--accent)" strokeWidth="3" />
          {Array.from({ length: 25 }, (_, i) => <line key={i} x1="0" y1="-42" x2="0" y2={i % 6 === 0 ? -34 : -38} stroke="var(--ink-soft)" strokeWidth="1" transform={`rotate(${-150 + i * 12.5})`} />)}
          <line x1="0" y1="0" x2="0" y2="-34" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${angle})`} className={styles.move} />
          <circle r="4" fill="var(--accent)" />
          <text y="62" textAnchor="middle" fontSize="13" fill="var(--ink)" fontFamily="var(--font-math)">{signed(n)}</text>
        </g>
      );
    };
    return <svg viewBox="0 0 240 150" className={styles.art} aria-hidden="true">{dial(p, 65)}{dial(q, 175)}</svg>;
  }
  if (theme === "soundlab") {
    // Two oscillators drawn at a frequency set by each number; negative numbers are inverted waves.
    const wave = (n: number, y: number, color: string) => {
      const f = Math.min(8, Math.abs(n)) / 2 + 0.6;
      const d = Array.from({ length: 81 }, (_, i) => `${i ? "L" : "M"}${10 + i * 2.5} ${y - Math.sin((i / 80) * Math.PI * 2 * f) * 16 * (n < 0 ? -1 : 1)}`).join(" ");
      return <path d={d} fill="none" stroke={color} strokeWidth="2" className={styles.move} />;
    };
    return (
      <svg viewBox="0 0 220 120" className={styles.art} aria-hidden="true">
        <line x1="10" y1="30" x2="210" y2="30" stroke="var(--line)" /><line x1="10" y1="85" x2="210" y2="85" stroke="var(--line)" />
        {wave(p, 30, "var(--accent)")}{wave(q, 85, "var(--caution)")}
      </svg>
    );
  }
  // Studio: two plain bars, one for the product and one for the sum.
  const bar = (v: number, k: number) => {
    const wv = Math.min(100, Math.abs(v) * k);
    return v < 0 ? { x: 110 - wv, w: wv } : { x: 110, w: wv };
  };
  const a = bar(prod, 2.2);
  const b = bar(sum, 6);
  return (
    <svg viewBox="0 0 220 120" className={styles.art} aria-hidden="true">
      <line x1="110" y1="8" x2="110" y2="112" stroke="var(--line-strong)" />
      <rect x={a.x} y="22" width={a.w} height="18" rx="9" fill="var(--accent)" className={styles.move} />
      <rect x={b.x} y="72" width={b.w} height="18" rx="9" fill="var(--accent)" className={styles.move} />
    </svg>
  );
}

function TwoNumbers({ theme, game, disabled, onChange }: { theme: LotusTheme; game: TwoNumbersGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.TWO_NUMBERS[theme];
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

  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    report.current(touched ? { kind: "TWO_NUMBERS", tries, final: { p: pair.p, q: pair.q } } : null);
  }, [touched, tries, pair]);

  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.twoGrid}>
        <TwoNumbersArt theme={theme} p={pair.p} q={pair.q} />
        <div className={styles.controls}>
          <p className={styles.frame} aria-live="polite">(x <b>{pair.p < 0 ? "−" : "+"} {Math.abs(pair.p)}</b>)(x <b>{pair.q < 0 ? "−" : "+"} {Math.abs(pair.q)}</b>)</p>
          <div className={styles.steppers}>
            <Stepper label={words.first} value={pair.p} range={game.range} disabled={disabled} onChange={(v) => set("p", v)} />
            <Stepper label={words.second} value={pair.q} range={game.range} disabled={disabled} onChange={(v) => set("q", v)} />
          </div>
          <p className={styles.readout}>
            <span>{words.product}: <b>{signed(pair.p * pair.q)}</b></span>
            <span>{words.sum}: <b>{signed(pair.p + pair.q)}</b></span>
          </p>
        </div>
      </div>
    </>
  );
}

// ---------- Commit, then choose ----------

function CommitThenChoose({ theme, game, disabled, onChange }: { theme: LotusTheme; game: CommitThenChooseGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.COMMIT_THEN_CHOOSE[theme];
  const [guess, setGuess] = useState({ p: 1, q: 1 });
  const [touched, setTouched] = useState(false);
  const [committedAt, setCommittedAt] = useState<number | null>(null);
  const [pick, setPick] = useState<{ index: number; at: number } | null>(null);
  const committed = committedAt !== null;

  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    report.current(committed && pick ? { kind: "COMMIT_THEN_CHOOSE", guess: { p: guess.p, q: guess.q }, pick: pick.index, chooseMs: Math.max(0, pick.at - committedAt!) } : null);
  }, [committed, committedAt, guess, pick]);

  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.guessRow}>
        <span className={styles.stepLabel}>{words.guess}</span>
        <span className={styles.frame}>
          <span className={styles.bracketGroup}>(x <b>{guess.p < 0 ? "−" : "+"}</b> <Stepper label="First number" value={guess.p} range={game.range} disabled={disabled || committed} onChange={(v) => { setTouched(true); setGuess((g) => ({ ...g, p: v })); }} />)</span>
          <span className={styles.bracketGroup}>(x <b>{guess.q < 0 ? "−" : "+"}</b> <Stepper label="Second number" value={guess.q} range={game.range} disabled={disabled || committed} onChange={(v) => { setTouched(true); setGuess((g) => ({ ...g, q: v })); }} />)</span>
        </span>
        <button type="button" className={styles.primary} disabled={disabled || committed || !touched} onClick={() => setCommittedAt(Date.now())}>{words.commit}</button>
      </div>
      <div className={styles.options} data-covered={!committed || undefined} aria-label={words.options}>
        {!committed && <div className={styles.cover}>{words.cover}</div>}
        <div className={styles.optionList} role="group" aria-label={words.options} aria-hidden={!committed}>
          {game.options.map((option, index) => (
            <button key={option} type="button" className={styles.option} aria-pressed={pick?.index === index} disabled={disabled || !committed} tabIndex={committed ? 0 : -1}
              onClick={() => setPick({ index, at: Date.now() })}>
              {prettyAlgebra(option)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- True or false ----------

function TrueFalse({ theme, game, disabled, onChange }: { theme: LotusTheme; game: TrueFalseGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.TRUE_FALSE[theme];
  const n = game.claims.length;
  const [verdicts, setVerdicts] = useState<Array<LotusClaimVerdict | null>>(() => Array(n).fill(null));
  const [times, setTimes] = useState<number[]>(() => Array(n).fill(0));
  const shownAt = useRef(Date.now());
  const index = verdicts.findIndex((v) => v === null);
  const finished = index === -1;

  useEffect(() => { shownAt.current = Date.now(); }, [index]);

  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    report.current(finished ? { kind: "TRUE_FALSE", verdicts: verdicts as LotusClaimVerdict[], cardMs: times } : null);
  }, [finished, verdicts, times]);

  const decide = (verdict: LotusClaimVerdict) => {
    if (finished) return;
    const spent = Math.max(200, Date.now() - shownAt.current);
    setVerdicts((cur) => cur.map((v, i) => (i === index ? verdict : v)));
    setTimes((cur) => cur.map((t, i) => (i === index ? spent : t)));
  };
  const back = () => {
    const last = finished ? n - 1 : index - 1;
    if (last < 0) return;
    setVerdicts((cur) => cur.map((v, i) => (i === last ? null : v)));
  };
  const label: Record<LotusClaimVerdict, string> = { true: words.yes, false: words.no, unsure: words.unsure };

  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.deck} data-theme-card={theme}>
        {finished ? (
          <div className={styles.card} role="status">
            <span className={styles.cardNo}>{words.done}</span>
            <ul className={styles.tally}>{verdicts.map((v, i) => <li key={i}>{i + 1}. {label[v!]}</li>)}</ul>
          </div>
        ) : (
          <div className={styles.card} key={index}>
            <span className={styles.cardNo}>{words.card} {index + 1} / {n}</span>
            <p className={styles.claim}>{prettyAlgebra(game.expression)} = {prettyAlgebra(game.claims[index]!)}</p>
            <span className={styles.cardArt} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className={styles.verdicts}>
        {(["false", "unsure", "true"] as const).map((v) => (
          <button key={v} type="button" className={styles.verdict} data-verdict={v} disabled={disabled || finished} onClick={() => decide(v)}>{label[v]}</button>
        ))}
        <button type="button" className={styles.link} disabled={disabled || (!finished && index === 0)} onClick={back}>Back</button>
      </div>
    </>
  );
}

export function ThemedGame({ theme, game, disabled, onChange }: ThemedGameProps) {
  const words = GAME_WORDS[game.kind][theme];
  return (
    <section className={styles.game} data-game={game.kind} data-art={theme} aria-label={words.title}>
      <h3 className={styles.title}>{words.title}</h3>
      {game.kind === "TWO_NUMBERS" && <TwoNumbers theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "COMMIT_THEN_CHOOSE" && <CommitThenChoose theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "TRUE_FALSE" && <TrueFalse theme={theme} game={game} disabled={disabled} onChange={onChange} />}
    </section>
  );
}
