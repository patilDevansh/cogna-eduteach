"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  ChunkItGame,
  FindEveryBGame,
  LotusGameResponse,
  LotusTheme,
  OrderStepsGame,
  RapidSetGame,
  ReplayGame,
  TestClaimGame,
} from "@cogna/shared";
import { prettyAlgebra } from "@/components/games/TileGame";
import { GAME_WORDS } from "./themed-game-words";
import { signed } from "./themed-game-parts";
import { ChunkArt, CompareArt, StepMark } from "./themed-game-art";
import styles from "./themed-game.module.css";

/**
 * The second family of themed games. Same rules as the first: the server issued
 * the game and reads the play itself, nothing here says right or wrong, and the
 * theme only changes the words and the art.
 */
interface Props<G> {
  theme: LotusTheme;
  game: G;
  disabled?: boolean;
  onChange: (response: LotusGameResponse | null) => void;
}

const SETTLE_MS = 600;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Keeps the latest callback without re-running effects each render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// ---------- Order the steps ----------

export function OrderSteps({ theme, game, disabled, onChange }: Props<OrderStepsGame>) {
  const words = GAME_WORDS.ORDER_STEPS[theme];
  const [placed, setPlaced] = useState<number[]>([]);
  const [ever, setEver] = useState<number[]>([]);
  const report = useLatest(onChange);
  useEffect(() => {
    report.current(placed.length === game.slots ? { kind: "ORDER_STEPS", placed, ever } : null);
  }, [placed, ever, game.slots, report]);

  const area = useRef<HTMLDivElement>(null);
  /** A pressed card turns disabled, which would drop keyboard focus to the page: move it to the next card still on offer. */
  const pendingFocus = useRef<{ selector: string; last: boolean } | null>(null);
  const focusNext = (selector: string, last = false) => { pendingFocus.current = { selector, last }; };
  // Runs once the cards have been redrawn, so the card to focus exists and the pressed one is already disabled.
  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    const found = area.current?.querySelectorAll<HTMLButtonElement>(want.selector);
    (want.last ? found?.[found.length - 1] : found?.[0])?.focus();
  }, [placed]);
  const place = (i: number) => {
    if (placed.includes(i) || placed.length >= game.slots) return;
    setPlaced((cur) => [...cur, i]);
    setEver((cur) => (cur.includes(i) ? cur : [...cur, i]));
    if (placed.length + 1 >= game.slots) focusNext("[data-slotcard]", true);
    else focusNext("[data-poolcard]:not(:disabled)");
  };
  const takeBack = (i: number) => {
    setPlaced((cur) => cur.filter((n) => n !== i));
    focusNext(`[data-poolcard="${i}"]`);
  };
  return (
    <div ref={area}>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.orderGrid}>
        <div>
          <span className={styles.label}>{words.slot}s</span>
          <ol className={styles.orderSlots}>
            {Array.from({ length: game.slots }, (_, k) => {
              const i = placed[k];
              return (
                <li key={k} className={styles.orderSlot} data-filled={i !== undefined || undefined}>
                  <span className={styles.label}>{words.slot} {k + 1}</span>
                  {i === undefined ? <span className={styles.orderEmpty}>{words.empty}</span> : (
                    <button type="button" className={styles.orderCard} data-slotcard disabled={disabled} onClick={() => takeBack(i)} aria-label={`${words.slot} ${k + 1}: ${prettyAlgebra(game.steps[i]!)}. Tap to take back.`}><StepMark theme={theme} /><span>{prettyAlgebra(game.steps[i]!)}</span></button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <div>
          <span className={styles.label}>{words.pool}</span>
          <div className={styles.orderPool}>
            {game.steps.map((text, i) => (
              <button key={i} type="button" className={styles.orderCard} data-poolcard={i} disabled={disabled || placed.includes(i) || placed.length >= game.slots} data-used={placed.includes(i) || undefined} onClick={() => place(i)}><StepMark theme={theme} /><span>{prettyAlgebra(text)}</span></button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Test the claim ----------

export function TestClaim({ theme, game, disabled, onChange }: Props<TestClaimGame>) {
  const words = GAME_WORDS.TEST_CLAIM[theme];
  const [x, setX] = useState(1);
  const [touched, setTouched] = useState(false);
  const [tested, setTested] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<number | null>(null);
  const sliderId = useId();
  const a = (x + game.k) ** 2;
  const b = x * x + game.k * game.k;

  // A value counts as tried once the student pauses on it.
  useEffect(() => {
    if (!touched) return;
    const timer = window.setTimeout(() => setTested((cur) => (cur.includes(x) ? cur : [...cur, x])), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [x, touched]);

  const report = useLatest(onChange);
  useEffect(() => {
    report.current(verdict === null ? null : { kind: "TEST_CLAIM", tested, verdict });
  }, [verdict, tested, report]);

  const labelA = `(x + ${game.k})²`;
  const labelB = `x² + ${game.k * game.k}`;
  const at = (value: number) => ((value - game.min) / Math.max(1, game.max - game.min)) * 100;
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.stage}>
        <CompareArt theme={theme} a={a} b={b} labelA={labelA} labelB={labelB} />
      </div>
      <div className={styles.sliderRow}>
        <div className={styles.sliderHead}>
          <label htmlFor={sliderId} className={styles.label}>{words.control}</label>
          <b>x = {signed(x)}</b>
          <span className={styles.label} aria-live="polite">{words.tried}: {tested.length}</span>
        </div>
        <input id={sliderId} type="range" className={styles.slider} min={game.min} max={game.max} step={1} value={x} disabled={disabled}
          aria-valuetext={`x = ${x}. ${words.sideA} ${a}, ${words.sideB} ${b}`} onChange={(event) => { setTouched(true); setX(Number(event.target.value)); }} />
        <div className={styles.sliderTried} aria-hidden="true">{tested.map((value) => <i key={value} style={{ left: `${at(value)}%` }} />)}</div>
      </div>
      <div className={styles.verdictGrid} role="group" aria-label={words.decide}>
        {game.options.map((option, i) => (
          <button key={option} type="button" className={styles.choice} aria-pressed={verdict === i} disabled={disabled} onClick={() => setVerdict(i)}>{option}</button>
        ))}
      </div>
    </>
  );
}

// ---------- Rapid set ----------

export function RapidSet({ theme, game, disabled, onChange, onRowChange }: Props<RapidSetGame> & { onRowChange?: (row: number | undefined) => void }) {
  const words = GAME_WORDS.RAPID_SET[theme];
  const [picks, setPicks] = useState<number[]>([]);
  const [times, setTimes] = useState<number[]>([]);
  const shownAt = useRef(performance.now());
  const row = picks.length;
  const finished = row >= game.rows.length;

  const region = useRef<HTMLDivElement>(null);
  const doneNote = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    shownAt.current = performance.now();
    // The row is replaced after each answer; keep keyboard focus with the game instead of dropping it to the page.
    if (row === 0) return;
    if (row >= game.rows.length) doneNote.current?.focus();
    else region.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [row, game.rows.length]);
  const rowReport = useLatest(onRowChange);
  useEffect(() => { rowReport.current?.(row); }, [row, rowReport]);
  useEffect(() => () => rowReport.current?.(undefined), [rowReport]);
  const report = useLatest(onChange);
  useEffect(() => {
    report.current(finished ? { kind: "RAPID_SET", picks, times } : null);
  }, [finished, picks, times, report]);

  const choose = (k: number) => {
    if (finished) return;
    setTimes((cur) => [...cur, Math.max(300, Math.round(performance.now() - shownAt.current))]);
    setPicks((cur) => [...cur, k]);
  };
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.stage}>
        <ol className={styles.rapidTrail} aria-hidden="true">{game.rows.map((_, i) => <li key={i} data-done={i < row || undefined} data-now={i === row || undefined} />)}</ol>
        {picks.length > 0 && (
          <ul className={styles.rapidPast}>
            {picks.map((pick, i) => <li key={i}><span className={styles.label}>{words.row} {i + 1}</span><span>{prettyAlgebra(game.rows[i]!.q)}</span><span>{prettyAlgebra(game.rows[i]!.options[pick]!)}</span></li>)}
          </ul>
        )}
        {finished ? <p className={styles.heroMath} role="status" tabIndex={-1} ref={doneNote}>{words.done}</p> : (
          <div className={styles.rapidNow} key={row} ref={region}>
            <div className={styles.rapidNowHead}><span className={styles.label}>{words.row} {row + 1} / {game.rows.length}</span></div>
            <p className={styles.heroMath}>{prettyAlgebra(game.rows[row]!.q)}</p>
            <div className={styles.choiceGrid}>
              {game.rows[row]!.options.map((option, k) => <button key={option} type="button" className={styles.choice} disabled={disabled} onClick={() => choose(k)}>{prettyAlgebra(option)}</button>)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Find every b ----------

export function FindEveryB({ theme, game, disabled, onChange }: Props<FindEveryBGame>) {
  const words = GAME_WORDS.FIND_EVERY_B[theme];
  const [picked, setPicked] = useState<number[]>([]);
  const report = useLatest(onChange);
  useEffect(() => {
    report.current(picked.length ? { kind: "FIND_EVERY_B", picked } : null);
  }, [picked, report]);
  const values = Array.from({ length: 2 * game.range + 1 }, (_, i) => i - game.range).filter((n) => n !== 0);
  const toggle = (n: number) => setPicked((cur) => (cur.includes(n) ? cur.filter((m) => m !== n) : [...cur, n]));
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.stage} role="group" aria-label={`Choose every ${words.unit}`}>
        {[values.filter((n) => n < 0), values.filter((n) => n > 0)].map((rule, r) => (
          <div key={r} className={styles.ruleRow}>
            {rule.map((n) => (
              <button key={n} type="button" className={styles.key} aria-pressed={picked.includes(n)} disabled={disabled} onClick={() => toggle(n)}><i aria-hidden="true" />{signed(n)}</button>
            ))}
          </div>
        ))}
      </div>
      <p className={styles.pickedRow} aria-live="polite"><span className={styles.label}>{words.picked}</span> <b>{picked.length ? [...picked].sort((x, y) => x - y).map(signed).join(", ") : words.none}</b></p>
    </>
  );
}

// ---------- Stop the replay ----------

export function Replay({ theme, game, disabled, onChange }: Props<ReplayGame>) {
  const words = GAME_WORDS.REPLAY[theme];
  const instant = reducedMotion();
  const [shown, setShown] = useState(instant ? game.lines.length : 0);
  const [playing, setPlaying] = useState(false);
  const [stopped, setStopped] = useState<{ line: number; lateMs?: number } | null>(null);
  const appearedAt = useRef<number[]>([]);
  const stopButton = useRef<HTMLButtonElement>(null);
  const stoppedNote = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!playing || stopped) return;
    if (shown >= game.lines.length) { setPlaying(false); return; }
    const timer = window.setTimeout(() => { appearedAt.current[shown] = performance.now(); setShown((n) => n + 1); }, shown === 0 ? 300 : game.stepMs);
    return () => window.clearTimeout(timer);
  }, [playing, shown, stopped, game.lines.length, game.stepMs]);

  const report = useLatest(onChange);
  useEffect(() => {
    report.current(stopped ? { kind: "REPLAY", stopped: stopped.line, ...(stopped.lateMs !== undefined ? { lateMs: stopped.lateMs } : {}) } : null);
  }, [stopped, report]);

  const stopAt = (line: number) => {
    setPlaying(false);
    // How long after that line appeared, whichever line it is: stopping on an old line after the tape has run on is late, not instant.
    const at = appearedAt.current[line];
    // No tape, no timing (reduced motion shows every line at once): then there is nothing to report, not a fast stop.
    setStopped({ line, ...(at === undefined ? {} : { lateMs: Math.round(performance.now() - at) }) });
  };
  const start = () => { setStopped(null); setShown(0); appearedAt.current = []; setPlaying(true); };
  // Play is replaced by Stop; keep keyboard focus on the control that matters most here.
  useEffect(() => { if (playing) stopButton.current?.focus(); }, [playing]);
  // Stop is removed once pressed; say where it stopped and keep focus there.
  useEffect(() => { if (stopped) stoppedNote.current?.focus(); }, [stopped]);
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={styles.bed} style={{ ["--at" as string]: Math.max(0, shown - 1) }}>
        <p className={styles.bedClaim}>{prettyAlgebra(game.claim)}</p>
        <ol className={styles.bedLines}>
          {game.lines.map((line, i) => i < shown ? (
            <li key={i} className={styles.bedLine} data-stopped={stopped?.line === i || undefined}>
              <button type="button" className={styles.bedBtn} disabled={disabled} onClick={() => stopAt(i)} aria-label={`${words.stopHere}: ${words.line} ${i + 1}, ${prettyAlgebra(line)}`}>
                <span className={styles.label}>{words.line} {i + 1}</span>
                <span className={styles.bedText}>{prettyAlgebra(line)}</span>
                <span className={styles.bedStop}>{words.stopHere}</span>
              </button>
            </li>
          ) : <li key={i} className={styles.bedGhost} aria-hidden="true" />)}
        </ol>
      </div>
      <div className={styles.transport}>
        {!instant && !playing && !stopped && shown < game.lines.length && <button type="button" className={styles.primary} disabled={disabled} onClick={start}>▶ {words.play}</button>}
        {playing && !stopped && <button type="button" className={`${styles.primary} ${styles.stopBtn}`} ref={stopButton} disabled={disabled} onClick={() => stopAt(Math.max(0, shown - 1))}>■ {words.stop}</button>}
        {!instant && (stopped || shown >= game.lines.length) && <button type="button" className={styles.secondary} disabled={disabled} onClick={start}>{words.again}</button>}
        <ol className={styles.rail} aria-hidden="true">{game.lines.map((_, i) => <li key={i} data-done={i < shown || undefined} data-stopped={stopped?.line === i || undefined} />)}</ol>
        {stopped && <span className={styles.stamp} role="status" tabIndex={-1} ref={stoppedNote}>{words.stoppedAt} {stopped.line + 1}</span>}
      </div>
    </>
  );
}

// ---------- Chunk it ----------

export function ChunkIt({ theme, game, disabled, onChange }: Props<ChunkItGame>) {
  const words = GAME_WORDS.CHUNK_IT[theme];
  const [route, setRoute] = useState<number | null>(null);
  const report = useLatest(onChange);
  useEffect(() => {
    report.current(route === null ? null : { kind: "CHUNK_IT", route });
  }, [route, report]);
  const label = (move: ChunkItGame["routes"][number]["move"]) => (move === "CHUNK" ? words.chunk.replace("{chunk}", game.chunk) : move === "EXPAND" ? words.expand : words.root);
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <div className={`${styles.stage} ${styles.chunkHero}`}>
        <p className={styles.heroMath}>{prettyAlgebra(game.expression)}</p>
      </div>
      <div className={styles.routes} role="group" aria-label={words.title}>
        {game.routes.map((r, i) => (
          <button key={r.move} type="button" className={styles.choice} aria-pressed={route === i} disabled={disabled} onClick={() => setRoute(i)}>{prettyAlgebra(label(r.move))}</button>
        ))}
      </div>
      {route !== null && (
        <div className={styles.chunkGrid} key={route} data-solo={game.routes[route]!.move !== "CHUNK" || undefined}>
          <div className={styles.stage}>
            <span className={styles.label}>{words.working}</span>
            <ol className={styles.workingList}>{game.routes[route]!.lines.map((line, i) => <li key={i}>{prettyAlgebra(line)}</li>)}</ol>
          </div>
          {game.routes[route]!.move === "CHUNK" && <div className={styles.stage}><ChunkArt theme={theme} chunk={game.chunk} /></div>}
        </div>
      )}
    </>
  );
}
