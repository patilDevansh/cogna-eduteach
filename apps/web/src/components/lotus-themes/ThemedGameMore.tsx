"use client";

import { useEffect, useRef, useState } from "react";
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
import { signed, Stepper } from "./themed-game-parts";
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

  const place = (i: number) => {
    if (placed.includes(i) || placed.length >= game.slots) return;
    setPlaced((cur) => [...cur, i]);
    setEver((cur) => (cur.includes(i) ? cur : [...cur, i]));
  };
  const takeBack = (i: number) => setPlaced((cur) => cur.filter((n) => n !== i));
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <p className={styles.stepLabel}>{prettyAlgebra(game.expression)}</p>
      <ol className={styles.orderSlots}>
        {Array.from({ length: game.slots }, (_, k) => {
          const i = placed[k];
          return (
            <li key={k} className={styles.orderSlot} data-filled={i !== undefined || undefined}>
              <span className={styles.stepLabel}>{words.slot} {k + 1}</span>
              {i === undefined ? <span className={styles.orderEmpty}>{words.empty}</span> : (
                <button type="button" className={styles.orderCard} disabled={disabled} onClick={() => takeBack(i)} aria-label={`${words.slot} ${k + 1}: ${prettyAlgebra(game.steps[i]!)}. Tap to take back.`}>{prettyAlgebra(game.steps[i]!)}</button>
              )}
            </li>
          );
        })}
      </ol>
      <span className={styles.stepLabel}>{words.pool}</span>
      <div className={styles.orderPool}>
        {game.steps.map((text, i) => (
          <button key={i} type="button" className={styles.orderCard} disabled={disabled || placed.includes(i) || placed.length >= game.slots} data-used={placed.includes(i) || undefined} onClick={() => place(i)}>{prettyAlgebra(text)}</button>
        ))}
      </div>
    </>
  );
}

// ---------- Test the claim ----------

export function TestClaim({ theme, game, disabled, onChange }: Props<TestClaimGame>) {
  const words = GAME_WORDS.TEST_CLAIM[theme];
  const [x, setX] = useState(1);
  const [touched, setTouched] = useState(false);
  const [tested, setTested] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<number | null>(null);
  const a = (x + game.k) ** 2;
  const b = x * x + game.k * game.k;
  const top = Math.max(a, b, 1);

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

  const bar = (value: number, label: string) => (
    <div className={styles.claimBar} aria-label={`${label}: ${value}`}>
      <span className={styles.claimValue}>{value}</span>
      <i className={styles.claimFill} style={{ height: `${Math.max(4, (value / top) * 100)}%` }} />
      <span className={styles.stepLabel}>{label}</span>
    </div>
  );
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <p className={styles.frame}>{prettyAlgebra(game.expression)}</p>
      <div className={styles.claimGrid}>
        <div className={styles.claimBars}>{bar(a, `${words.sideA}: (x + ${game.k})²`)}{bar(b, `${words.sideB}: x² + ${game.k * game.k}`)}</div>
        <div className={styles.controls}>
          <Stepper label={words.control} value={x} range={game.max} min={game.min} allowZero disabled={disabled} onChange={(v) => { setTouched(true); setX(v); }} />
          <p className={styles.readout}><span>x = <b>{signed(x)}</b></span></p>
          <p className={styles.readout} aria-live="polite"><span>{words.tried}: <b>{tested.length}</b></span></p>
        </div>
      </div>
      <div className={styles.verdictRow} role="group" aria-label={words.decide}>
        {game.options.map((option, i) => (
          <button key={option} type="button" className={styles.option} aria-pressed={verdict === i} disabled={disabled} onClick={() => setVerdict(i)}>{option}</button>
        ))}
      </div>
    </>
  );
}

// ---------- Rapid set ----------

export function RapidSet({ theme, game, disabled, onChange }: Props<RapidSetGame>) {
  const words = GAME_WORDS.RAPID_SET[theme];
  const [picks, setPicks] = useState<number[]>([]);
  const [times, setTimes] = useState<number[]>([]);
  const shownAt = useRef(performance.now());
  const row = picks.length;
  const finished = row >= game.rows.length;

  useEffect(() => { shownAt.current = performance.now(); }, [row]);
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
      {finished ? <p className={styles.frame} role="status">{words.done}</p> : (
        <div className={styles.rapidRow} key={row}>
          <span className={styles.cardNo}>{words.row} {row + 1} / {game.rows.length}</span>
          <p className={styles.claim}>{prettyAlgebra(game.rows[row]!.q)}</p>
          <div className={styles.rapidOptions}>
            {game.rows[row]!.options.map((option, k) => <button key={option} type="button" className={styles.option} disabled={disabled} onClick={() => choose(k)}>{prettyAlgebra(option)}</button>)}
          </div>
        </div>
      )}
      <ol className={styles.rapidTrail} aria-hidden="true">{game.rows.map((_, i) => <li key={i} data-done={i < row || undefined} />)}</ol>
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
      <p className={styles.frame}>{prettyAlgebra(game.expression)}</p>
      <div className={styles.numberGrid} role="group" aria-label={`Choose every ${words.unit}`}>
        {values.map((n) => (
          <button key={n} type="button" className={styles.numberKey} aria-pressed={picked.includes(n)} disabled={disabled} onClick={() => toggle(n)}>{signed(n)}</button>
        ))}
      </div>
      <p className={styles.readout} aria-live="polite"><span>{words.picked}: <b>{picked.length ? [...picked].sort((x, y) => x - y).map(signed).join(", ") : words.none}</b></span></p>
    </>
  );
}

// ---------- Stop the replay ----------

export function Replay({ theme, game, disabled, onChange }: Props<ReplayGame>) {
  const words = GAME_WORDS.REPLAY[theme];
  const instant = reducedMotion();
  const [shown, setShown] = useState(instant ? game.lines.length : 0);
  const [playing, setPlaying] = useState(false);
  const [stopped, setStopped] = useState<{ line: number; lateMs: number } | null>(null);
  const appearedAt = useRef(performance.now());

  useEffect(() => {
    if (!playing || stopped) return;
    if (shown >= game.lines.length) { setPlaying(false); return; }
    const timer = window.setTimeout(() => { appearedAt.current = performance.now(); setShown((n) => n + 1); }, shown === 0 ? 300 : game.stepMs);
    return () => window.clearTimeout(timer);
  }, [playing, shown, stopped, game.lines.length, game.stepMs]);

  const report = useLatest(onChange);
  useEffect(() => {
    report.current(stopped ? { kind: "REPLAY", stopped: stopped.line, lateMs: stopped.lateMs } : null);
  }, [stopped, report]);

  const stopAt = (line: number) => {
    setPlaying(false);
    // How long after that line appeared: only meaningful for the line currently on screen.
    setStopped({ line, lateMs: line === shown - 1 ? Math.round(performance.now() - appearedAt.current) : 0 });
  };
  const start = () => { setStopped(null); setShown(0); appearedAt.current = performance.now(); setPlaying(true); };
  return (
    <>
      <p className={styles.intro}>{words.intro}</p>
      <p className={styles.frame}>{prettyAlgebra(game.claim)}</p>
      <ol className={styles.tape}>
        {game.lines.slice(0, shown).map((line, i) => (
          <li key={i} className={styles.tapeLine} data-stopped={stopped?.line === i || undefined}>
            <span className={styles.stepLabel}>{words.line} {i + 1}</span>
            <span className={styles.tapeText}>{prettyAlgebra(line)}</span>
            <button type="button" className={styles.link} disabled={disabled} onClick={() => stopAt(i)}>{words.stopHere}</button>
          </li>
        ))}
        {shown === 0 && <li className={styles.tapeEmpty}>—</li>}
      </ol>
      <div className={styles.readButtons}>
        {!instant && !playing && !stopped && shown < game.lines.length && <button type="button" className={styles.primary} disabled={disabled} onClick={start}>{words.play}</button>}
        {playing && !stopped && <button type="button" className={styles.primary} disabled={disabled} onClick={() => stopAt(Math.max(0, shown - 1))}>{words.stop}</button>}
        {!instant && (stopped || shown >= game.lines.length) && <button type="button" className={styles.secondary} disabled={disabled} onClick={start}>{words.again}</button>}
        {stopped && <span className={styles.stamp} role="status">{words.stoppedAt} {stopped.line + 1}</span>}
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
      <p className={styles.frame}>{prettyAlgebra(game.expression)}</p>
      <div className={styles.routes} role="group" aria-label={words.title}>
        {game.routes.map((r, i) => (
          <button key={r.move} type="button" className={styles.option} aria-pressed={route === i} disabled={disabled} onClick={() => setRoute(i)}>{prettyAlgebra(label(r.move))}</button>
        ))}
      </div>
      {route !== null && (
        <div className={styles.working}>
          <span className={styles.stepLabel}>{words.working}</span>
          <ol className={styles.tapeList}>{game.routes[route]!.lines.map((line, i) => <li key={i}>{prettyAlgebra(line)}</li>)}</ol>
        </div>
      )}
    </>
  );
}
