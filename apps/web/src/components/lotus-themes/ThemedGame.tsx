"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  prettyReadback,
  readbackTyped,
  LOTUS_EDIT_MAX_LENGTH,
  LOTUS_EDIT_MAX_SAMPLES,
  LOTUS_GAME_MAX_TRIES,
  LOTUS_SPLIT_TOKENS,
  type CommitThenChooseGame,
  type EditHistoryGame,
  type EditHistorySample,
  type ReadbackGame,
  type RectangleGame,
  type FourSignsGame,
  type LotusBracketSign,
  type LotusClaimVerdict,
  type LotusGameConfig,
  type LotusGameResponse,
  type LotusTheme,
  type SplitConfidenceGame,
  type TrueFalseGame,
  type TwoMovesGame,
  type TwoNumbersGame,
  type TwoNumbersTry,
} from "@cogna/shared";
import { prettyAlgebra } from "@/components/games/TileGame";
import { GAME_WORDS } from "./themed-game-words";
import { signed, Stepper } from "./themed-game-parts";
import { ChunkIt, FindEveryB, OrderSteps, RapidSet, Replay, TestClaim } from "./ThemedGameMore";
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
          <span className={styles.bracketGroup}>(x <Stepper label="First number" value={guess.p} range={game.range} showPlus disabled={disabled || committed} onChange={(v) => { setTouched(true); setGuess((g) => ({ ...g, p: v })); }} />)</span>
          <span className={styles.bracketGroup}>(x <Stepper label="Second number" value={guess.q} range={game.range} showPlus disabled={disabled || committed} onChange={(v) => { setTouched(true); setGuess((g) => ({ ...g, q: v })); }} />)</span>
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

// ---------- Split your confidence ----------

function SplitConfidence({ theme, game, disabled, onChange }: { theme: LotusTheme; game: SplitConfidenceGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.SPLIT_CONFIDENCE[theme];
  const [counts, setCounts] = useState<number[]>(() => game.options.map(() => 0));
  const placed = counts.reduce((a, b) => a + b, 0);
  const left = LOTUS_SPLIT_TOKENS - placed;

  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    report.current(left === 0 ? { kind: "SPLIT_CONFIDENCE", counts } : null);
  }, [left, counts]);

  const change = (i: number, by: number) => setCounts((cur) => cur.map((n, k) => (k === i ? n + by : n)));
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.tray} aria-live="polite">
        <span className={styles.stepLabel}>{words.tray}</span>
        <span className={styles.tokens} aria-hidden="true">{Array.from({ length: left }, (_, i) => <i key={i} className={styles.token} />)}</span>
        <b>{left}</b>
      </div>
      <ul className={styles.splitList}>
        {game.options.map((option, i) => (
          <li key={option} className={styles.splitRow} data-has={counts[i]! > 0 || undefined}>
            <span className={styles.splitText}>{prettyAlgebra(option)}</span>
            <span className={styles.tokens} aria-hidden="true">{Array.from({ length: counts[i]! }, (_, k) => <i key={k} className={styles.token} />)}</span>
            <span className={styles.stepRow}>
              <button type="button" className={styles.stepBtn} disabled={disabled || counts[i] === 0} onClick={() => change(i, -1)} aria-label={`${words.takeBack} ${prettyAlgebra(option)}`}>−</button>
              <output className={styles.stepValue} aria-label={`${counts[i]} ${counts[i] === 1 ? words.token : words.tokens} on ${prettyAlgebra(option)}`}>{counts[i]}</output>
              <button type="button" className={styles.stepBtn} disabled={disabled || left === 0} onClick={() => change(i, 1)} aria-label={`${words.place} ${prettyAlgebra(option)}`}>+</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- A sign that starts unset and flips when tapped ----------

function SignToggle({ value, label, disabled, onChange }: { value: LotusBracketSign | null; label: string; disabled?: boolean; onChange: (next: LotusBracketSign) => void }) {
  const shown = value === "-" ? "−" : value === "+" ? "+" : "?";
  return (
    <button type="button" className={styles.signToggle} data-set={value !== null || undefined} disabled={disabled} aria-label={`${label}: ${value === "-" ? "minus" : value === "+" ? "plus" : "not set"}`}
      onClick={() => onChange(value === "+" ? "-" : "+")}>{shown}</button>
  );
}

// ---------- Look inside: two moves ----------

function TwoMoves({ theme, game, disabled, onChange }: { theme: LotusTheme; game: TwoMovesGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.TWO_MOVES[theme];
  const [numbers, setNumbers] = useState({ n1: 1, n2: 1 });
  const [signs, setSigns] = useState<[LotusBracketSign | null, LotusBracketSign | null]>([null, null]);
  const complete = signs[0] !== null && signs[1] !== null;

  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    report.current(complete ? { kind: "TWO_MOVES", numbers, signs: [signs[0]!, signs[1]!] } : null);
  }, [complete, numbers, signs]);

  const bracket = (k: 0 | 1, n: number) => `(x ${signs[k] === "-" ? "−" : signs[k] === "+" ? "+" : "?"} ${Math.abs(n)})`;
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.moves}>
        <div className={styles.move}>
          <span className={styles.moveLabel}>{words.move1}</span>
          <div className={styles.steppers}>
            <Stepper label={words.first} value={numbers.n1} range={game.range} disabled={disabled} onChange={(v) => setNumbers((c) => ({ ...c, n1: v }))} />
            <Stepper label={words.second} value={numbers.n2} range={game.range} disabled={disabled} onChange={(v) => setNumbers((c) => ({ ...c, n2: v }))} />
          </div>
        </div>
        <div className={styles.move}>
          <span className={styles.moveLabel}>{words.move2}</span>
          <p className={styles.frame}>
            <span className={styles.bracketGroup}>(x <SignToggle value={signs[0]} label={`${words.first} bracket sign`} disabled={disabled} onChange={(v) => setSigns((c) => [v, c[1]])} /> {Math.abs(numbers.n1)})</span>
            <span className={styles.bracketGroup}>(x <SignToggle value={signs[1]} label={`${words.second} bracket sign`} disabled={disabled} onChange={(v) => setSigns((c) => [c[0], v])} /> {Math.abs(numbers.n2)})</span>
          </p>
        </div>
      </div>
      <div className={styles.plate} aria-live="polite">
        <span className={styles.stepLabel}>{words.plate}</span>
        <span className={styles.plateText}>{bracket(0, numbers.n1)}{bracket(1, numbers.n2)}</span>
      </div>
    </>
  );
}

// ---------- Four sign cases ----------

/** A small picture on each case: decoration only. It lights up once the case is set, whatever the signs are. */
function CaseArt({ theme, set }: { theme: LotusTheme; set: boolean }): ReactElement | null {
  if (theme === "drafting") return (
    <svg viewBox="0 0 120 60" className={styles.caseArt} aria-hidden="true">
      <path d="M12 56 V26 L60 6 L108 26 V56 Z" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
      {[28, 54, 80].map((x) => <rect key={x} x={x} y="30" width="14" height="16" fill={set ? "var(--accent-wash)" : "none"} stroke={set ? "var(--accent)" : "var(--line-strong)"} />)}
    </svg>
  );
  if (theme === "cabinet") return (
    <svg viewBox="0 0 120 60" className={styles.caseArt} aria-hidden="true">
      <path d="M46 28 V18 a14 14 0 0 1 28 0 V28" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" transform={set ? "translate(0 -5)" : undefined} className={styles.move} />
      <rect x="38" y="27" width="44" height="30" rx="5" fill={set ? "var(--accent-wash)" : "none"} stroke="var(--accent-deep)" strokeWidth="2" />
      <circle cx="60" cy="40" r="4" fill="var(--accent-deep)" />
    </svg>
  );
  if (theme === "soundlab") return (
    <svg viewBox="0 0 120 60" className={styles.caseArt} aria-hidden="true">
      <rect x="34" y="6" width="52" height="48" rx="8" fill={set ? "var(--accent)" : "var(--surface-raised, none)"} stroke="var(--line-strong)" strokeWidth="1.5" className={styles.move} />
    </svg>
  );
  return null;
}

function FourSigns({ theme, game, disabled, onChange }: { theme: LotusTheme; game: FourSignsGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.FOUR_SIGNS[theme];
  const [picks, setPicks] = useState<Array<[LotusBracketSign | null, LotusBracketSign | null]>>(() => game.cases.map(() => [null, null]));
  const complete = picks.every((p) => p[0] !== null && p[1] !== null);

  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    report.current(complete ? { kind: "FOUR_SIGNS", picks: picks as Array<[LotusBracketSign, LotusBracketSign]> } : null);
  }, [complete, picks]);

  const set = (i: number, k: 0 | 1, v: LotusBracketSign) => setPicks((cur) => cur.map((p, c) => (c === i ? (k === 0 ? [v, p[1]] : [p[0], v]) : p)));
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.fourGrid}>
        {game.cases.map((expression, i) => {
          const name = words.cases[i] ?? `Case ${i + 1}`;
          const pick = picks[i]!;
          return (
            <div key={expression} className={styles.fourCase} data-set={(pick[0] !== null && pick[1] !== null) || undefined}>
              <CaseArt theme={theme} set={pick[0] !== null && pick[1] !== null} />
              <span className={styles.stepLabel}>{name}</span>
              <span className={styles.fourExpr}>{prettyAlgebra(expression)}</span>
              <span className={styles.frame}>
                <span className={styles.bracketGroup}>(x <SignToggle value={pick[0]} label={`${name}, sign before ${game.numbers[0]}`} disabled={disabled} onChange={(v) => set(i, 0, v)} /> {game.numbers[0]})</span>
                <span className={styles.bracketGroup}>(x <SignToggle value={pick[1]} label={`${name}, sign before ${game.numbers[1]}`} disabled={disabled} onChange={(v) => set(i, 1, v)} /> {game.numbers[1]})</span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- Edit history ----------

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** ^2 reads as ², as in the ordinary typed answer box. */
const typedMath = (text: string) => text.replace(/[\^ˆ]([0-9]+)/g, (_, digits: string) => [...digits].map((d) => SUPERSCRIPTS[Number(d)]).join(""));
const MATH_KEYS: Array<[string, string]> = [["+", "+"], ["−", "-"], ["(", "("], [")", ")"], ["x²", "²"], ["x³", "³"]];

/**
 * A typing box that keeps every change, with the maths keys of the ordinary
 * answer box. The record it keeps is what the server reads.
 */
function useTypedRecord(onTyped: (value: string, history: EditHistorySample[]) => void, onDraft?: (draft: string) => void) {
  const [value, setValue] = useState("");
  const history = useRef<EditHistorySample[]>([]);
  // Monotonic: the server refuses a record that runs backwards, and the wall clock can jump.
  const startedAt = useRef(performance.now());
  const field = useRef<HTMLInputElement>(null);
  const callbacks = useRef({ onTyped, onDraft });
  callbacks.current = { onTyped, onDraft };

  const type = (raw: string) => {
    const next = typedMath(raw).slice(0, LOTUS_EDIT_MAX_LENGTH);
    const log = history.current;
    const last = log[log.length - 1];
    // Whatever stood in the box when deleting began is a draft (shown back as the student's own words, with no verdict).
    if (last && next.length < last.v.length && (log.length < 2 || log[log.length - 2]!.v.length <= last.v.length) && last.v.trim()) callbacks.current.onDraft?.(last.v);
    const sample = { t: Math.round(performance.now() - startedAt.current), v: next };
    // Past the cap, the newest text overwrites the last slot: the final answer is never lost.
    if (log.length >= LOTUS_EDIT_MAX_SAMPLES) log[log.length - 1] = sample;
    else log.push(sample);
    setValue(next);
    callbacks.current.onTyped(next, [...log]);
  };
  const press = (token: string) => {
    const box = field.current;
    const at = box?.selectionStart ?? value.length;
    const to = box?.selectionEnd ?? value.length;
    type(`${value.slice(0, at)}${token}${value.slice(to)}`);
    window.requestAnimationFrame(() => { box?.focus(); box?.setSelectionRange(at + token.length, at + token.length); });
  };
  return { value, field, type, press };
}

function TypedBox({ label, record, disabled, autoFocus }: { label: string; record: ReturnType<typeof useTypedRecord>; disabled?: boolean; autoFocus?: boolean }) {
  return (
    <>
      <label className={styles.editLabel}>
        <span className={styles.stepLabel}>{label}</span>
        <input ref={record.field} className={styles.editInput} value={record.value} maxLength={LOTUS_EDIT_MAX_LENGTH} disabled={disabled} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} autoFocus={autoFocus}
          placeholder="Type your answer" onChange={(event) => record.type(event.target.value)} />
      </label>
      <div className={styles.mathKeys} role="group" aria-label="Math tools">
        {MATH_KEYS.map(([keyLabel, token]) => (
          <button key={keyLabel} type="button" className={styles.mathKey} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => record.press(token)}>{keyLabel}</button>
        ))}
      </div>
    </>
  );
}

function EditHistory({ theme, disabled, onChange }: { theme: LotusTheme; game: EditHistoryGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.EDIT_HISTORY[theme];
  const [drafts, setDrafts] = useState<string[]>([]);
  const report = useRef(onChange);
  report.current = onChange;
  const record = useTypedRecord((value, history) => report.current(value.trim() ? { kind: "EDIT_HISTORY", history } : null), (draft) => setDrafts((cur) => [...cur, draft]));
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <TypedBox label={words.input} record={record} disabled={disabled} />
      <div className={styles.tape}>
        <span className={styles.stepLabel}>{words.log}</span>
        {drafts.length === 0 ? <p className={styles.tapeEmpty}>{words.empty}</p> : (
          <ol className={styles.tapeList}>
            {drafts.slice(-5).map((draft, i) => <li key={`${draft}-${i}`}><b>{words.draft} {Math.max(0, drafts.length - 5) + i + 1}</b> <s>{prettyAlgebra(draft)}</s></li>)}
          </ol>
        )}
      </div>
    </>
  );
}

// ---------- Confirm your input ----------

function Readback({ theme, disabled, onChange }: { theme: LotusTheme; game: ReadbackGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.READBACK[theme];
  const [confirmed, setConfirmed] = useState(false);
  const [took, setTook] = useState(false);
  const latest = useRef<EditHistorySample[]>([]);
  const report = useRef(onChange);
  report.current = onChange;
  const record = useTypedRecord((_, history) => { latest.current = history; });
  const read = readbackTyped(record.value);
  // Reading changes with every key, so a play is only reported once the student confirms.
  useEffect(() => {
    report.current(confirmed && record.value.trim() ? { kind: "READBACK", history: latest.current, ...(took ? { tookSuggestion: true } : {}) } : null);
  }, [confirmed, took, record.value]);

  const locked = disabled || confirmed;
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <TypedBox label={words.input} record={record} disabled={locked} />
      <div className={styles.readBox} aria-live="polite">
        <span className={styles.stepLabel}>{words.read}</span>
        <span className={styles.readText}>{record.value.trim() ? prettyReadback(read.read) : <i>{words.nothing}</i>}</span>
        {record.value.trim() && read.flags.map((flag, i) => (
          <p key={flag.code} className={styles.flag}><b>{words.flag}-{i + 1}</b> {flag.text}</p>
        ))}
      </div>
      <div className={styles.readButtons}>
        <button type="button" className={styles.primary} disabled={locked || !record.value.trim()} onClick={() => setConfirmed(true)}>{words.confirm}</button>
        {read.suggestion && !confirmed && (
          <button type="button" className={styles.secondary} disabled={disabled} onClick={() => { record.type(read.suggestion!); setTook(true); }}>{words.suggest}</button>
        )}
        {confirmed && <><span className={styles.stamp} role="status">{words.stamp}</span><button type="button" className={styles.link} disabled={disabled} onClick={() => setConfirmed(false)}>{words.change}</button></>}
      </div>
    </>
  );
}

// ---------- Tiles: one rectangle ----------

function Rectangle({ theme, game, disabled, onChange }: { theme: LotusTheme; game: RectangleGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.RECTANGLE[theme];
  const [side, setSide] = useState<number | null>(null);
  const [tries, setTries] = useState<number[]>([]);
  const top = side === null ? 0 : game.strips - side;
  const down = side ?? 0;

  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    report.current(side === null ? null : { kind: "RECTANGLE", tries, final: side });
  }, [side, tries]);

  const choose = (n: number) => {
    if (n === side) return;
    setSide(n);
    setTries((cur) => (cur.length >= LOTUS_GAME_MAX_TRIES ? cur : [...cur, n]));
  };

  // The picture: an x² square, `down` strips along the side, `top` strips along the top, and the unit tiles in the corner.
  // It is the same picture whatever the choice; nothing in it marks a split as the one.
  const U = Math.max(14, Math.min(30, Math.floor(300 / (game.strips + 4))));
  const X = U * 4;
  const cols = top;
  const rows = down;
  const cells = Array.from({ length: rows * cols }, (_, k) => ({ r: Math.floor(k / Math.max(cols, 1)), c: k % Math.max(cols, 1) }));
  const W = X + cols * U;
  const H = X + rows * U;
  const pad = 40;
  const extent = X + game.strips * U;
  const perRow = Math.max(4, game.strips + 4);
  const leftover = Math.max(0, game.units - cells.length);
  const poolRows = Math.ceil(game.units / perRow);
  const poolY = pad + extent + 14;
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.rectWrap}>
        <svg viewBox={`0 0 ${pad + extent + 16} ${poolY + poolRows * (U + 3) + 8}`} className={styles.rectArt} role="img" aria-label={`${words.picture}: ${down} ${down === 1 ? words.strip : `${words.strip}s`} down the side, ${top} along the top`}>
          <rect x={pad} y={pad} width={X} height={X} className={styles.rectSquare} />
          <text x={pad + X / 2} y={pad + X / 2 + 6} textAnchor="middle" className={styles.rectLabel}>{words.square}</text>
          {Array.from({ length: top }, (_, i) => <rect key={`t${i}`} x={pad + X + i * U} y={pad} width={U} height={X} className={styles.rectStrip} />)}
          {Array.from({ length: down }, (_, i) => <rect key={`s${i}`} x={pad} y={pad + X + i * U} width={X} height={U} className={styles.rectStrip} />)}
          {cells.slice(0, game.units).map(({ r, c }, k) => <rect key={`u${k}`} x={pad + X + c * U + 2} y={pad + X + r * U + 2} width={U - 4} height={U - 4} className={styles.rectUnit} />)}
          {cells.slice(game.units).map(({ r, c }, k) => <rect key={`h${k}`} x={pad + X + c * U + 3} y={pad + X + r * U + 3} width={U - 6} height={U - 6} className={styles.rectHole} />)}
          {Array.from({ length: leftover }, (_, k) => <rect key={`p${k}`} x={pad + (k % perRow) * (U + 3)} y={poolY + Math.floor(k / perRow) * (U + 3)} width={U - 4} height={U - 4} className={styles.rectUnit} />)}
          {side !== null && <>
            <text x={pad + W / 2} y={pad - 14} textAnchor="middle" className={styles.rectDim}>x + {top}</text>
            <text transform={`translate(${pad - 14} ${pad + H / 2}) rotate(-90)`} textAnchor="middle" className={styles.rectDim}>x + {down}</text>
          </>}
        </svg>
        <div className={styles.rectControl} role="group" aria-label={words.control}>
          <span className={styles.stepLabel}>{words.control}</span>
          <div className={styles.seg}>
            {Array.from({ length: game.strips + 1 }, (_, n) => (
              <button key={n} type="button" className={styles.segBtn} aria-pressed={side === n} disabled={disabled} onClick={() => choose(n)}>{n}</button>
            ))}
          </div>
          <p className={styles.readout}><span>{words.strip}s: <b>{game.strips}</b></span><span>{words.unit}s: <b>{game.units}</b></span></p>
        </div>
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
      {game.kind === "SPLIT_CONFIDENCE" && <SplitConfidence theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "TWO_MOVES" && <TwoMoves theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "FOUR_SIGNS" && <FourSigns theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "EDIT_HISTORY" && <EditHistory theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "READBACK" && <Readback theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "RECTANGLE" && <Rectangle theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "ORDER_STEPS" && <OrderSteps theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "TEST_CLAIM" && <TestClaim theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "RAPID_SET" && <RapidSet theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "FIND_EVERY_B" && <FindEveryB theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "REPLAY" && <Replay theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "CHUNK_IT" && <ChunkIt theme={theme} game={game} disabled={disabled} onChange={onChange} />}
    </section>
  );
}
