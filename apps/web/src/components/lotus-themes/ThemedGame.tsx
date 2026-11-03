"use client";

import { useEffect, useRef, useState } from "react";
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
import { GAME_WORDS, type TrueFalseWords } from "./themed-game-words";
import { signed, Stepper } from "./themed-game-parts";
import { CaseArt, Token, TwoNumbersArt } from "./themed-game-art";
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
  /** A game played row by row says which row is on screen, and clears it when it leaves. */
  onRowChange?: (row: number | undefined) => void;
}

const SETTLE_MS = 600;

// ---------- Two numbers ----------

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
        <div className={styles.stage}>
          <TwoNumbersArt theme={theme} p={pair.p} q={pair.q} productLabel={words.product} sumLabel={words.sum} />
        </div>
        <div className={styles.controls}>
          <p className={styles.math} aria-live="polite">(x <b>{pair.p < 0 ? "−" : "+"} {Math.abs(pair.p)}</b>)(x <b>{pair.q < 0 ? "−" : "+"} {Math.abs(pair.q)}</b>)</p>
          <div className={styles.steppers}>
            <Stepper label={words.first} value={pair.p} range={game.range} disabled={disabled} onChange={(v) => set("p", v)} />
            <Stepper label={words.second} value={pair.q} range={game.range} disabled={disabled} onChange={(v) => set("q", v)} />
          </div>
          <p className={styles.readouts}>
            <span className={styles.readout}>{words.product} <b>{signed(pair.p * pair.q)}</b></span>
            <span className={styles.readout}>{words.sum} <b>{signed(pair.p + pair.q)}</b></span>
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
      <div className={styles.stage}>
        <div className={styles.guessRow}>
          <span className={styles.label}>{words.guess}</span>
          <span className={styles.math}>
            <span className={styles.bracket}>(x <Stepper label="First number" value={guess.p} range={game.range} showPlus disabled={disabled || committed} onChange={(v) => { setTouched(true); setGuess((g) => ({ ...g, p: v })); }} />)</span>
            <span className={styles.bracket}>(x <Stepper label="Second number" value={guess.q} range={game.range} showPlus disabled={disabled || committed} onChange={(v) => { setTouched(true); setGuess((g) => ({ ...g, q: v })); }} />)</span>
          </span>
          <button type="button" className={styles.primary} disabled={disabled || committed || !touched} onClick={() => setCommittedAt(Date.now())}>{words.commit}</button>
        </div>
      </div>
      <div className={styles.options} data-covered={!committed || undefined}>
        {!committed && <div className={styles.cover}>{words.cover}</div>}
        <div className={styles.choiceGrid} role="group" aria-label={words.options} aria-hidden={!committed}>
          {game.options.map((option, index) => (
            <button key={option} type="button" className={styles.choice} aria-pressed={pick?.index === index} disabled={disabled || !committed} tabIndex={committed ? 0 : -1}
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

function ClaimFace({ words, card, n, text, foot }: { words: TrueFalseWords; card: number; n: number; text: string; foot: boolean }) {
  const [left, right] = text.split(" = ");
  return (
    <>
      <div className={styles.sheetHead}><span>{words.card} {card + 1} / {n}</span>{words.tag && <span>{words.tag}</span>}</div>
      <p className={styles.sheetClaim}><span>{left} =</span> <span>{right}</span></p>
      {foot ? <div className={styles.sheetFoot}><span>Project: factorisation</span><span>Spec section: 08</span></div> : <span />}
    </>
  );
}

function ClaimSheet(props: { words: TrueFalseWords; card: number; n: number; text: string; foot: boolean }) {
  return <div className={styles.sheet}><ClaimFace {...props} /></div>;
}

function TrueFalse({ theme, game, disabled, onChange }: { theme: LotusTheme; game: TrueFalseGame; disabled?: boolean; onChange: ThemedGameProps["onChange"] }) {
  const words = GAME_WORDS.TRUE_FALSE[theme];
  const n = game.claims.length;
  const [verdicts, setVerdicts] = useState<Array<LotusClaimVerdict | null>>(() => Array(n).fill(null));
  const [times, setTimes] = useState<number[]>(() => Array(n).fill(0));
  const shownAt = useRef(Date.now());
  const index = verdicts.findIndex((v) => v === null);
  const finished = index === -1;
  // The judged card stays a moment under its stamp, then leaves. The next one is already live beneath it.
  const [leaving, setLeaving] = useState<{ card: number; verdict: LotusClaimVerdict } | null>(null);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), 520);
    return () => window.clearTimeout(timer);
  }, [leaving]);

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
    setLeaving({ card: index, verdict });
  };
  const back = () => {
    const last = finished ? n - 1 : index - 1;
    if (last < 0) return;
    setVerdicts((cur) => cur.map((v, i) => (i === last ? null : v)));
  };
  const label: Record<LotusClaimVerdict, string> = { true: words.yes, false: words.no, unsure: words.unsure };
  const claimText = (card: number) => `${prettyAlgebra(game.expression)} = ${prettyAlgebra(game.claims[card]!)}`;

  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.deckRow}>
        <div className={styles.deck} data-theme-card={theme}>
          {finished ? (
            <div className={styles.sheet} role="status">
              <div className={styles.sheetHead}><span>{words.done}</span></div>
              <ul className={styles.doneList}>{verdicts.map((v, i) => <li key={i}>{i + 1}. {label[v!]}</li>)}</ul>
            </div>
          ) : (
            <ClaimSheet key={index} words={words} card={index} n={n} text={claimText(index)} foot={theme === "drafting"} />
          )}
          {leaving && (
            <div className={`${styles.sheet} ${styles.leaving}`} data-v={leaving.verdict} aria-hidden="true">
              <ClaimFace words={words} card={leaving.card} n={n} text={claimText(leaving.card)} foot={theme === "drafting"} />
              <span className={styles.seal}>{label[leaving.verdict]}</span>
            </div>
          )}
        </div>
        <ul className={styles.tally} aria-label="Your choices so far">
          {(["false", "unsure", "true"] as const).map((v) => <li key={v}><b>{verdicts.filter((c) => c === v).length}</b>{label[v]}</li>)}
        </ul>
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
      <div className={styles.stage}>
        <ul className={styles.splitGrid} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {game.options.map((option, i) => {
            const [one, two] = prettyAlgebra(option).split(")(");
            return (
              <li key={option} className={styles.splitCol} data-has={counts[i]! > 0 || undefined}>
                <span className={styles.splitSlot} aria-hidden="true">{Array.from({ length: counts[i]! }, (_, k) => <Token key={k} theme={theme} />)}</span>
                <span className={styles.splitText}>{two === undefined ? one : <><span>{one})</span><span>({two}</span></>}</span>
                <span className={styles.splitCtl}>
                  <button type="button" className={styles.splitBtn} disabled={disabled || counts[i] === 0} onClick={() => change(i, -1)} aria-label={`${words.takeBack} ${prettyAlgebra(option)}`}>−</button>
                  <output className={styles.splitCount} aria-label={`${counts[i]} ${counts[i] === 1 ? words.token : words.tokens} on ${prettyAlgebra(option)}`}>{counts[i]}</output>
                  <button type="button" className={styles.splitBtn} disabled={disabled || left === 0} onClick={() => change(i, 1)} aria-label={`${words.place} ${prettyAlgebra(option)}`}>+</button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className={styles.trayRow} aria-live="polite">
          <span className={styles.label}>{words.tray}</span>
          <span className={styles.trayTokens} aria-hidden="true">{Array.from({ length: left }, (_, i) => <Token key={i} theme={theme} />)}</span>
          <b>{left}</b>
        </div>
      </div>
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
      <div className={styles.movesGrid}>
        <div className={styles.moves}>
          <div className={styles.moveCard}>
            <span className={styles.moveLabel}>{words.move1}</span>
            <div className={styles.steppers}>
              <Stepper label={words.first} value={numbers.n1} range={game.range} disabled={disabled} onChange={(v) => setNumbers((c) => ({ ...c, n1: v }))} />
              <Stepper label={words.second} value={numbers.n2} range={game.range} disabled={disabled} onChange={(v) => setNumbers((c) => ({ ...c, n2: v }))} />
            </div>
          </div>
          <div className={styles.moveCard}>
            <span className={styles.moveLabel}>{words.move2}</span>
            <p className={styles.math}>
              <span className={styles.bracket}>(x <SignToggle value={signs[0]} label={`${words.first} bracket sign`} disabled={disabled} onChange={(v) => setSigns((c) => [v, c[1]])} /> {Math.abs(numbers.n1)})</span>
              <span className={styles.bracket}>(x <SignToggle value={signs[1]} label={`${words.second} bracket sign`} disabled={disabled} onChange={(v) => setSigns((c) => [c[0], v])} /> {Math.abs(numbers.n2)})</span>
            </p>
          </div>
        </div>
        <div className={`${styles.stage} ${styles.plate}`} aria-live="polite">
          <span className={styles.label}>{words.plate}</span>
          <span className={styles.plateText}><span>{bracket(0, numbers.n1)}</span><span>{bracket(1, numbers.n2)}</span></span>
        </div>
      </div>
    </>
  );
}

// ---------- Four sign cases ----------

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
      <div className={styles.stage}>
        <div className={styles.fourGrid}>
          {game.cases.map((expression, i) => {
            const name = words.cases[i] ?? `Case ${i + 1}`;
            const pick = picks[i]!;
            return (
              <div key={expression} className={styles.fourCase} data-set={(pick[0] !== null && pick[1] !== null) || undefined}>
                <CaseArt theme={theme} set={pick[0] !== null && pick[1] !== null} />
                <span className={styles.label}>{name}</span>
                <span className={styles.fourExpr}>{prettyAlgebra(expression)}</span>
                <span className={styles.math}>
                  <span className={styles.bracket}>(x <SignToggle value={pick[0]} label={`${name}, sign before ${game.numbers[0]}`} disabled={disabled} onChange={(v) => set(i, 0, v)} /> {game.numbers[0]})</span>
                  <span className={styles.bracket}>(x <SignToggle value={pick[1]} label={`${name}, sign before ${game.numbers[1]}`} disabled={disabled} onChange={(v) => set(i, 1, v)} /> {game.numbers[1]})</span>
                </span>
              </div>
            );
          })}
        </div>
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
    <div className={styles.typedRow}>
      <label className={styles.typedRow}>
        <span className={styles.label}>{label}</span>
        <input ref={record.field} className={styles.editInput} value={record.value} maxLength={LOTUS_EDIT_MAX_LENGTH} disabled={disabled} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} autoFocus={autoFocus}
          placeholder="(x + ?)(x − ?)" onChange={(event) => record.type(event.target.value)} />
      </label>
      <div className={styles.mathKeys} role="group" aria-label="Math tools">
        {MATH_KEYS.map(([keyLabel, token]) => (
          <button key={keyLabel} type="button" className={styles.mathKey} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => record.press(token)}>{keyLabel}</button>
        ))}
      </div>
    </div>
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
      <div className={`${styles.stage} ${styles.log}`}>
        <span className={styles.label}>{words.log}</span>
        {drafts.length === 0 ? <p className={styles.logEmpty}>{words.empty}</p> : (
          <ol className={styles.logList}>
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
      <div className={styles.readGrid}>
        <TypedBox label={words.input} record={record} disabled={locked} />
        <div className={styles.stage} aria-live="polite">
          <span className={styles.label}>{words.read}</span>
          <span className={styles.readText}>{record.value.trim() ? prettyReadback(read.read) : <i>{words.nothing}</i>}</span>
          {record.value.trim() && read.flags.map((flag, i) => (
            <p key={flag.code} className={styles.flag}><b>{words.flag}-{i + 1}</b> {flag.text}</p>
          ))}
        </div>
      </div>
      <div className={styles.actions}>
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

  // The picture: an x² square, then every strip and unit tile as one piece that moves. Loose pieces wait in the margin.
  // It is the same picture whatever the choice; nothing in it marks a split as the one.
  const U = 28;
  const X = U * 4;
  const pad = 44;
  const rows = down;
  const cols = top;
  const cells = Array.from({ length: rows * cols }, (_, k) => ({ r: Math.floor(k / Math.max(cols, 1)), c: k % Math.max(cols, 1) }));
  const extent = X + game.strips * U;
  const marginX = pad + extent + 26;
  const perRow = Math.max(3, Math.ceil(Math.sqrt(game.units)));
  const looseStrip = U * 0.5;
  const stripScale = 0.62;
  const stripRows = side === null ? game.strips : 0;
  const unitTop = pad + stripRows * (looseStrip + 4) + (stripRows ? 14 : 0);
  const width = marginX + Math.max(perRow * (U + 3), X * stripScale) + 8;
  const height = Math.max(pad + extent + 10, unitTop + Math.ceil(game.units / perRow) * (U + 3) + 8);
  const stripAt = (i: number) => {
    if (side === null) return `translate(${marginX}px, ${pad + i * (looseStrip + 4)}px) scale(${stripScale}, ${looseStrip / U})`;
    if (i < down) return `translate(${pad}px, ${pad + X + i * U}px)`;
    return `translate(${pad + X + (i - down) * U + U}px, ${pad}px) rotate(90deg)`;
  };
  const unitAt = (k: number) => {
    const cell = cells[k];
    if (side !== null && cell) return `translate(${pad + X + cell.c * U + 2}px, ${pad + X + cell.r * U + 2}px)`;
    const loose = side !== null ? k - cells.length : k;
    return `translate(${marginX + (loose % perRow) * (U + 3)}px, ${unitTop + Math.floor(loose / perRow) * (U + 3)}px)`;
  };
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.stage}>
        <svg viewBox={`0 0 ${width} ${height}`} className={styles.tileArt} role="img" aria-label={side === null ? words.picture : `${words.picture}: ${down} ${down === 1 ? words.strip : `${words.strip}s`} down the side, ${top} along the top`}>
          <rect x={pad} y={pad} width={X} height={X} className={styles.tileSquare} />
          <text x={pad + X / 2} y={pad + X / 2 + 7} textAnchor="middle" className={styles.tileLabel}>{words.square}</text>
          {side !== null && cells.slice(game.units).map(({ r, c }, k) => <rect key={`h${k}`} x={pad + X + c * U + 3} y={pad + X + r * U + 3} width={U - 6} height={U - 6} className={styles.tileHole} />)}
          {Array.from({ length: game.strips }, (_, i) => <rect key={`s${i}`} width={X} height={U} className={`${styles.tilePiece} ${styles.tileStrip}`} style={{ transform: stripAt(i) }} />)}
          {Array.from({ length: game.units }, (_, k) => <rect key={`u${k}`} width={U - 4} height={U - 4} className={`${styles.tilePiece} ${styles.tileUnit}`} style={{ transform: unitAt(k) }} />)}
          {side !== null && <>
            <text x={pad + (X + top * U) / 2} y={pad - 14} textAnchor="middle" className={styles.tileDim}>x + {top}</text>
            <text transform={`translate(${pad - 14} ${pad + (X + down * U) / 2}) rotate(-90)`} textAnchor="middle" className={styles.tileDim}>x + {down}</text>
          </>}
        </svg>
      </div>
      <div className={styles.segRow} role="group" aria-label={words.control}>
        <span className={styles.label}>{words.control}</span>
        <div className={styles.seg}>
          {Array.from({ length: game.strips + 1 }, (_, n) => (
            <button key={n} type="button" className={styles.segBtn} aria-pressed={side === n} disabled={disabled} onClick={() => choose(n)}>{n}</button>
          ))}
        </div>
      </div>
    </>
  );
}

export function ThemedGame({ theme, game, disabled, onChange, onRowChange }: ThemedGameProps) {
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
      {game.kind === "RAPID_SET" && <RapidSet theme={theme} game={game} disabled={disabled} onChange={onChange} onRowChange={onRowChange} />}
      {game.kind === "FIND_EVERY_B" && <FindEveryB theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "REPLAY" && <Replay theme={theme} game={game} disabled={disabled} onChange={onChange} />}
      {game.kind === "CHUNK_IT" && <ChunkIt theme={theme} game={game} disabled={disabled} onChange={onChange} />}
    </section>
  );
}
