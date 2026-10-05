"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeAnswer, PracticeCheckResult, PracticeItemView, PracticeSetView } from "@cogna/shared";
import { prettyMath } from "@cogna/lesson-video/player";
import { api } from "@/lib/api";
import styles from "./practice.module.css";
import { FactorSafe, TileGame, type TileGameState } from "@/components/games/TileGame";
import { BracketRush, MarkersDesk, RectangleGame } from "@/components/games/PracticeGames";

/**
 * Independent practice after the targeted lesson. Every answer is checked
 * on the server by the algebra engine (the browser never holds the
 * answers); this component only animates what the server says.
 */

const WORLD = { unit: "stars", icon: "★", done: "Practice complete" };

type Outcome = { firstTry: boolean; correct: boolean };

const num = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
const bracket = (p: number) => (p < 0 ? `(x − ${-p})` : `(x + ${p})`);

export function PracticeArena({
  assignmentId,
  firstName,
  devMode,
  onDone,
}: {
  assignmentId: string;
  firstName: string;
  devMode: boolean;
  onDone: (summary: { correct: number; total: number }) => void;
}) {
  const [set, setSet] = useState<PracticeSetView | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    api
      .getPracticeSet(assignmentId)
      .then(setSet)
      .catch((err) => setError(err instanceof Error ? err.message : "Practice could not be loaded."));
  }, [assignmentId]);

  if (error) {
    return (
      <section className={styles.arena}>
        <p className={styles.note}>{error}</p>
        <button className={styles.primary} onClick={() => onDone({ correct: 0, total: 0 })}>Go to your check →</button>
      </section>
    );
  }
  if (!set) {
    return (
      <section className={styles.arena} aria-busy="true">
        <div className={styles.loadingDots}><span /><span /><span /></div>
      </section>
    );
  }

  const world = WORLD;
  const total = set.items.length;
  const finished = index >= total;
  const earned = outcomes.filter((o) => o.correct).length;

  function record(outcome: Outcome) {
    setOutcomes((prev) => [...prev, outcome]);
    setStreak((s) => (outcome.firstTry ? s + 1 : 0));
  }

  return (
    <section className={styles.arena}>
      <header className={styles.top}>
        <div>
          <p className={styles.eyebrow}>Practice on your own · {set.skillName}</p>
          <h2 className={styles.title}>{finished ? world.done : `Question ${index + 1} of ${total}`}</h2>
        </div>
        <div className={styles.meter} aria-label={`${earned} of ${total} ${world.unit}`}>
          {set.items.map((item, i) => (
            <span key={item.id} className={styles.cell} data-state={i < outcomes.length ? (outcomes[i]!.correct ? (outcomes[i]!.firstTry ? "gold" : "done") : "missed") : i === index ? "now" : "next"}>
              {i < outcomes.length && outcomes[i]!.correct ? world.icon : ""}
            </span>
          ))}
          {streak >= 2 && <span key={streak} className={styles.streak}>{streak} in a row</span>}
        </div>
      </header>

      {finished ? (
        <Finale outcomes={outcomes} firstName={firstName} world={world} onNext={() => onDone({ correct: earned, total })} />
      ) : (
        <ItemCard
          key={set.items[index]!.id}
          assignmentId={assignmentId}
          item={set.items[index]!}
          devMode={devMode}
          onResolved={(outcome) => record(outcome)}
          onNext={() => setIndex((i) => i + 1)}
        />
      )}
      {devMode && <p className={styles.dev}>Dev · practice source {set.source === "AI_VERIFIED" ? "AI-written, verified" : "code-generated"} · answers checked on the server</p>}
    </section>
  );
}

function ItemCard({
  assignmentId,
  item,
  devMode,
  onResolved,
  onNext,
}: {
  assignmentId: string;
  item: PracticeItemView;
  devMode: boolean;
  onResolved: (outcome: Outcome) => void;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PracticeCheckResult | null>(null);
  const [tries, setTries] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState("");
  const [build, setBuild] = useState<TileGameState | null>(null);
  const resolvedRef = useRef(false);
  const [gameDone, setGameDone] = useState(false);

  /** Correct, or revealed after two misses: either way the student can move on. */
  const done = result?.verdict === "CORRECT" || Boolean(result?.reveal) || gameDone;

  async function submit(answer: PracticeAnswer, pickedIndex: number | null) {
    if (busy || result?.verdict === "CORRECT") return;
    setBusy(true);
    setPicked(pickedIndex);
    try {
      const next = await api.checkPracticeAnswer(assignmentId, item.id, answer);
      setResult(next);
      if (next.verdict === "UNREADABLE") return;
      const attempt = tries + 1;
      setTries(attempt);
      if (next.verdict !== "CORRECT") setShakeKey((k) => k + 1);
      if (!resolvedRef.current && (next.verdict === "CORRECT" || next.reveal)) {
        resolvedRef.current = true;
        onResolved({ firstTry: next.verdict === "CORRECT" && attempt === 1, correct: next.verdict === "CORRECT" });
      }
    } catch (err) {
      setResult({ itemId: item.id, verdict: "UNREADABLE", feedback: err instanceof Error ? err.message : "That answer couldn't be checked.", attempt: tries });
    } finally {
      setBusy(false);
    }
  }

  /** Marker's desk and bracket rush run their own rounds; they report once when they finish. */
  function finishGame(outcome: Outcome) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setGameDone(true);
    onResolved(outcome);
  }

  const state = (i: number) =>
    picked !== i || !result ? undefined : result.verdict === "CORRECT" ? "right" : result.verdict === "UNFINISHED" ? "nearly" : "wrong";

  return (
    <div className={styles.card}>
      <p className={styles.prompt}>{prettyText(item.prompt)}</p>

      {item.format === "pair-hunt" && (
        <>
          <div className={styles.bigMath}>{prettyMath(item.expression)}</div>
          <div className={styles.targets}>
            <span className={styles.chipBlue}>× → {num(item.product)}</span>
            <span className={styles.chipAmber}>+ → {num(item.sum)}</span>
          </div>
          <div className={styles.tiles}>
            {item.options.map(([a, b], i) => (
              <button
                key={`${a},${b}`}
                className={styles.tile}
                data-state={state(i)}
                data-shake={state(i) === "wrong" ? shakeKey : undefined}
                disabled={busy || result?.verdict === "CORRECT"}
                onClick={() => void submit({ pair: [a, b] }, i)}
              >
                <strong>{num(a)}, {num(b)}</strong>
                {state(i) && (
                  <span className={styles.tileCheck}>
                    <span data-ok={a * b === item.product}>× {num(a * b)}</span>
                    <span data-ok={a + b === item.sum}>+ {num(a + b)}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          {result?.verdict === "CORRECT" && picked !== null && (
            <div className={styles.snap} aria-live="polite">
              <span className={styles.flyLeft}>{bracket(item.options[picked]![0])}</span>
              <span className={styles.flyRight}>{bracket(item.options[picked]![1])}</span>
            </div>
          )}
        </>
      )}

      {item.format === "spot-mistake" && (
        <ol className={styles.lines}>
          {item.lines.map((line, i) => (
            <li key={i} style={{ animationDelay: `${i * 120}ms` }}>
              <button
                className={styles.line}
                data-state={state(i)}
                data-shake={state(i) === "wrong" ? shakeKey : undefined}
                disabled={busy || result?.verdict === "CORRECT"}
                onClick={() => void submit({ line: i }, i)}
              >
                <span className={styles.lineNo}>{i === 0 ? "" : "="}</span>
                <span className={styles.lineMath}>{prettyMath(line)}</span>
              </button>
              {result?.reveal && i === picked && result.verdict === "CORRECT" && (
                <div className={styles.fix}>
                  <span className={styles.lineNo}>=</span>
                  <span>{prettyMath(result.reveal.answer)}</span>
                  <span className={styles.fixTag}>fixed</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {item.format === "choose" && (
        <>
          <div className={styles.bigMath}>{prettyMath(item.expression)}</div>
          <div className={styles.choices}>
            {item.options.map((option, i) => (
              <button
                key={option}
                className={styles.choice}
                data-state={state(i)}
                data-shake={state(i) === "wrong" ? shakeKey : undefined}
                disabled={busy || result?.verdict === "CORRECT"}
                onClick={() => void submit({ option: i }, i)}
              >
                {prettyMath(option)}
              </button>
            ))}
          </div>
        </>
      )}

      {item.format === "type-answer" && (
        <>
          <div className={styles.bigMath}>{prettyMath(item.expression)}</div>
          <form
            className={styles.typeRow}
            onSubmit={(event) => {
              event.preventDefault();
              if (!text.trim()) {
                setInputError("Type your answer first.");
                return;
              }
              void submit({ text }, 0);
            }}
          >
            <input
              className={styles.input}
              data-state={result && picked === 0 ? (result.verdict === "CORRECT" ? "right" : result.verdict === "UNFINISHED" ? "nearly" : result.verdict === "INCORRECT" ? "wrong" : undefined) : undefined}
              data-shake={result && result.verdict !== "CORRECT" ? shakeKey : undefined}
              value={text}
              disabled={result?.verdict === "CORRECT"}
              onChange={(event) => {
                setText(event.target.value);
                setInputError("");
              }}
              placeholder="(x - 3)(x - 4)"
              aria-label="Your answer"
              aria-invalid={Boolean(inputError)}
            />
            <button className={styles.primary} type="submit" disabled={busy || result?.verdict === "CORRECT"}>
              {busy ? "Checking…" : "Check"}
            </button>
          </form>
          {inputError && <p className={styles.inputError}>{inputError}</p>}
          {text.trim() && !result && <p className={styles.preview}>You wrote: {prettyMath(text)}</p>}
        </>
      )}

      {item.format === "factor-safe" && (
        <FactorSafe
          expression={item.expression}
          product={item.product}
          sum={item.sum}
          disabled={busy || result?.verdict === "CORRECT"}
          unlocked={result?.verdict === "CORRECT"}
          onSubmit={(pair) => void submit({ pair }, 0)}
        />
      )}

      {item.format === "rectangle" && (
        <RectangleGame
          item={item}
          disabled={busy}
          fitted={result?.verdict === "CORRECT"}
          onSubmit={(pair) => void submit({ pair }, 0)}
        />
      )}

      {(item.format === "mark-it" || item.format === "rush") && (
        item.format === "mark-it" ? (
          <MarkersDesk item={item} check={(answer) => api.checkPracticeAnswer(assignmentId, item.id, answer)} onDone={finishGame} />
        ) : (
          <BracketRush item={item} check={(answer) => api.checkPracticeAnswer(assignmentId, item.id, answer)} onDone={finishGame} />
        )
      )}

      {item.format === "build" && (
        <>
          <TileGame
            interaction={item.interaction}
            disabled={busy || result?.verdict === "CORRECT"}
            sealed={result?.verdict === "CORRECT"}
            onChange={setBuild}
          />
          <div className={styles.nextRow}>
            <button
              className={styles.primary}
              disabled={busy || !build?.answer || result?.verdict === "CORRECT"}
              onClick={() => build && void submit({ picks: build.picks }, 0)}
            >
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
        </>
      )}

      {result && result.verdict !== "UNREADABLE" && item.format !== "mark-it" && item.format !== "rush" && (
        <p key={`${result.attempt}-${result.verdict}`} className={styles.feedback} data-verdict={result.verdict} aria-live="polite">
          {result.verdict === "CORRECT" ? "✓ " : result.verdict === "UNFINISHED" ? "◐ " : "↻ "}
          {prettyText(result.feedback)}
        </p>
      )}
      {result?.verdict === "UNREADABLE" && <p className={styles.inputError}>{result.feedback}</p>}

      {result?.reveal && result.reveal.steps.length > 0 && (item.format === "type-answer" || item.format === "pair-hunt" || item.format === "factor-safe" || item.format === "build" || item.format === "rectangle") && (
        <div className={styles.worked}>
          <p className={styles.workedLabel}>{result.verdict === "CORRECT" ? "Check" : "Here's how it goes"}</p>
          {result.reveal.steps.map((step, i) => (
            <div key={i} className={styles.workedStep} style={{ animationDelay: `${i * 450}ms` }}>
              {(item.format === "type-answer" || item.format === "build") && i > 0 && <span className={styles.lineNo}>=</span>}
              {item.format === "type-answer" || item.format === "build" ? prettyMath(step) : step}
            </div>
          ))}
        </div>
      )}

      {done && (
        <div className={styles.nextRow}>
          <button className={styles.primary} onClick={onNext}>
            Next <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
      {devMode && !done && (
        <p className={styles.dev}>Dev · {item.format} · attempt {tries + 1}</p>
      )}
    </div>
  );
}

function Finale({
  outcomes,
  firstName,
  world,
  onNext,
}: {
  outcomes: Outcome[];
  firstName: string;
  world: typeof WORLD;
  onNext: () => void;
}) {
  const correct = outcomes.filter((o) => o.correct).length;
  const firstTry = outcomes.filter((o) => o.firstTry).length;
  const confetti = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 6) * 90, hue: i % 3 })), []);
  return (
    <div className={styles.finale}>
      <div className={styles.confetti} aria-hidden="true">
        {confetti.map((c, i) => (
          <span key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}ms` }} data-hue={c.hue} />
        ))}
      </div>
      <div className={styles.score}>
        <strong>{correct}</strong>
        <span>/ {outcomes.length} {world.unit}</span>
      </div>
      <p className={styles.note}>
        {firstName ? `${firstName}, ` : ""}
        {firstTry === outcomes.length
          ? "every one right first time."
          : `${firstTry} right first time${correct > firstTry ? `, ${correct - firstTry} after a second look` : ""}.`}{" "}
        Now one more on your own, with no hints. That one goes to your teacher.
      </p>
      <button className={styles.primary} onClick={onNext}>
        One on your own <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

/** Prompts and feedback mix words and maths: prettify the powers and minus signs only. */
function prettyText(text: string): string {
  return text.replace(/\^([2-5])/g, (_, d: string) => ({ "2": "²", "3": "³", "4": "⁴", "5": "⁵" })[d]!).replace(/ - /g, " − ").replace(/\(x - /g, "(x − ");
}
