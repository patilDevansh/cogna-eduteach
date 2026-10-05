"use client";

import { useEffect, useRef, useState } from "react";
import { assembleTileAnswer, INTERACTION_FORMATS, type TileBuildInteraction } from "@cogna/shared";
import styles from "./tile-game.module.css";

/**
 * Game-like answer entry: the student builds the answer from tiles.
 *
 * The server issued the tiles and will rebuild the answer from the picks
 * itself, so this component never decides right or wrong and shows no
 * feedback. It only reports the picks (and a preview of what they build).
 *
 * Themes follow the format: a bridge for two brackets, a crystal that splits
 * for a full factorisation, lanterns for an expansion.
 */

export interface TileGameState {
  picks: Array<number | null>;
  /** How many times a tile was taken back out. Weak evidence only. */
  changes: number;
  /** The answer the picks build, or null while incomplete. */
  answer: string | null;
}

/** ASCII algebra (x^2, " - ") shown the way a textbook writes it. */
export function prettyAlgebra(text: string): string {
  return text
    .replace(/\^([2-5])/g, (_, d: string) => ({ "2": "²", "3": "³", "4": "⁴", "5": "⁵" })[d]!)
    .replace(/(^|[\s(])-\s?/g, (_, lead: string) => `${lead}−`)
    .replace(/ − (?=\S)/g, " − ")
    .replace(/\*/g, "×");
}

function tileLabel(interaction: TileBuildInteraction, tile: string): string {
  return prettyAlgebra(tile).replace(/^−(?=\d|[a-z])/, "−").replace(/^\+ /, "+ ");
}

export function TileGame({
  interaction,
  disabled = false,
  sealed = false,
  onChange,
}: {
  interaction: TileBuildInteraction;
  disabled?: boolean;
  /** Set once the answer is submitted: the scene plays its finishing move (frog crosses, crystal splits, lanterns light). */
  sealed?: boolean;
  onChange: (state: TileGameState) => void;
}) {
  const [picks, setPicks] = useState<Array<number | null>>(() => Array.from({ length: interaction.slots }, () => null));
  const changesRef = useRef(0);
  const spec = INTERACTION_FORMATS[interaction.format];

  useEffect(() => {
    setPicks(Array.from({ length: interaction.slots }, () => null));
    changesRef.current = 0;
  }, [interaction]);

  function update(next: Array<number | null>) {
    setPicks(next);
    onChange({ picks: next, changes: changesRef.current, answer: assembleTileAnswer(interaction, next) });
  }

  function place(tile: number) {
    if (disabled || picks.includes(tile)) return;
    const box = picks.indexOf(null);
    if (box < 0) return;
    const next = [...picks];
    next[box] = tile;
    update(next);
  }

  function takeOut(box: number) {
    if (disabled || picks[box] === null) return;
    changesRef.current += 1;
    const next = [...picks];
    next[box] = null;
    update(next);
  }

  const theme = interaction.format === "BRACKET_BRIDGE" ? "bridge" : interaction.format === "FACTOR_BUILDER" ? "crystal" : "lantern";
  const filled = picks.filter((p) => p !== null).length;

  return (
    <div className={styles.game} data-theme={theme} data-sealed={sealed || undefined}>
      <p className={styles.title}>
        <strong>{spec.title}</strong> · {spec.instruction}
      </p>
      <div className={styles.scene}>
        <div className={styles.sign}>{prettyAlgebra(interaction.expression)}</div>
        {theme === "bridge" && (
          <>
            <span className={styles.bankLeft} aria-hidden="true" />
            <span className={styles.bankRight} aria-hidden="true" />
            <span className={styles.frog} aria-hidden="true">🐸</span>
          </>
        )}
        <div className={styles.boxes} role="group" aria-label="Your answer">
          {interaction.frame.map((part, i) =>
            "text" in part ? (
              <span key={`t${i}`} className={styles.frameText}>{part.text}</span>
            ) : (
              <button
                key={`s${part.slot}`}
                type="button"
                className={styles.box}
                data-filled={picks[part.slot] !== null || undefined}
                onClick={() => takeOut(part.slot)}
                disabled={disabled}
                aria-label={picks[part.slot] === null ? `Box ${part.slot + 1}, empty` : `Box ${part.slot + 1}: ${interaction.tiles[picks[part.slot]!]}. Tap to take it out.`}
              >
                {picks[part.slot] === null ? (interaction.allowEmpty && filled > 0 ? "—" : "·") : tileLabel(interaction, interaction.tiles[picks[part.slot]!]!)}
              </button>
            ),
          )}
        </div>
        {theme === "lantern" && (
          <div className={styles.lanterns} aria-hidden="true">
            {picks.map((p, i) => <span key={i} className={styles.lantern} data-on={p !== null || undefined} />)}
          </div>
        )}
      </div>
      <div className={styles.bank}>
        {interaction.tiles.map((tile, i) => (
          <button
            key={`${tile}-${i}`}
            type="button"
            className={styles.tile}
            data-used={picks.includes(i) || undefined}
            onClick={() => place(i)}
            disabled={disabled || picks.includes(i)}
          >
            {tileLabel(interaction, tile)}
          </button>
        ))}
      </div>
      {interaction.allowEmpty && <p className={styles.hint}>Leave a box empty if you need fewer parts.</p>}
    </div>
  );
}

/** Two dials for "factor safe" practice: the lamps show the live product and sum, which the expression already gives away. */
export function FactorSafe({
  expression,
  product,
  sum,
  disabled,
  unlocked,
  onSubmit,
}: {
  expression: string;
  product: number;
  sum: number;
  disabled: boolean;
  unlocked: boolean;
  onSubmit: (pair: [number, number], turns: number) => void;
}) {
  const [vals, setVals] = useState<[number, number]>([1, 1]);
  const [turns, setTurns] = useState(0);
  const fmt = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
  const set = (i: 0 | 1, n: number) => {
    if (disabled || n > 12 || n < -12) return;
    const next: [number, number] = [...vals] as [number, number];
    next[i] = n === 0 ? (vals[i] > 0 ? -1 : 1) : n;
    setVals(next);
    setTurns((t) => t + 1);
  };
  const okP = vals[0] * vals[1] === product;
  const okS = vals[0] + vals[1] === sum;
  return (
    <div className={styles.safe} data-open={unlocked || undefined}>
      <div className={styles.sign}>{prettyAlgebra(expression)}</div>
      <div className={styles.dials}>
        {([0, 1] as const).map((i) => (
          <div key={i} className={styles.dial}>
            <button type="button" onClick={() => set(i, vals[i] + 1)} disabled={disabled} aria-label={`Dial ${i + 1} up`}>▲</button>
            <output className={styles.dialWindow} aria-live="polite">{fmt(vals[i])}</output>
            <button type="button" onClick={() => set(i, vals[i] - 1)} disabled={disabled} aria-label={`Dial ${i + 1} down`}>▼</button>
            <button type="button" className={styles.flip} onClick={() => set(i, -vals[i])} disabled={disabled} aria-label={`Flip the sign of dial ${i + 1}`}>± flip</button>
          </div>
        ))}
      </div>
      <div className={styles.lamps}>
        <span className={styles.lamp} data-on={okP || undefined}><i />× {fmt(vals[0] * vals[1])} <small>need {fmt(product)}</small></span>
        <span className={styles.lamp} data-on={okS || undefined}><i />+ {fmt(vals[0] + vals[1])} <small>need {fmt(sum)}</small></span>
      </div>
      <button type="button" className={styles.open} disabled={disabled} onClick={() => onSubmit(vals, turns)}>
        {unlocked ? "Unlocked" : "Try to open"}
      </button>
    </div>
  );
}
