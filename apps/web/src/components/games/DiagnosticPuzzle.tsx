"use client";

import { useRef, useState, type PointerEvent } from "react";
import { assembleTileAnswer, INTERACTION_FORMATS, type TileBuildInteraction } from "@cogna/shared";
import { prettyAlgebra, type TileGameState } from "./TileGame";
import styles from "./diagnostic-puzzles.module.css";

/** No correctness checks here: the scene records choices, never teaches the solution. Remount per question ID. */
export function DiagnosticPuzzle({ interaction, disabled = false, onChange }: {
  interaction: TileBuildInteraction; disabled?: boolean; onChange: (state: TileGameState) => void;
}) {
  const [picks, setPicks] = useState<Array<number | null>>(() => Array(interaction.slots).fill(null));
  const [active, setActive] = useState(0);
  const [focusClue, setFocusClue] = useState<number | null>(null);
  const changes = useRef(0);
  const dragged = useRef<number | null>(null);
  const crossword = interaction.format === "FACTOR_CROSSWORD";
  const spec = INTERACTION_FORMATS[interaction.format];
  const labels = crossword ? ["Row A", "Row B", "Column C", "Column D"] : ["Length", "Height"];

  function update(next: Array<number | null>) {
    setPicks(next);
    onChange({ picks: next, changes: changes.current, answer: assembleTileAnswer(interaction, next) });
  }
  function place(tile: number, slot = active) {
    if (disabled || picks.includes(tile)) return;
    if (picks[slot] !== null) changes.current++;
    const next = [...picks]; next[slot] = tile; update(next);
    const empty = next.indexOf(null); if (empty >= 0) setActive(empty);
  }
  function clear(slot: number) {
    if (disabled) return;
    setActive(slot);
    if (picks[slot] === null) return;
    changes.current++;
    const next = [...picks]; next[slot] = null; update(next);
  }
  function slot(index: number) {
    const selectedClue = focusClue === null ? undefined : interaction.crossword?.[focusClue];
    const linked = selectedClue && (selectedClue.row === index || selectedClue.column === index);
    return <button type="button" className={`${styles.slot} ${active === index ? styles.active : ""} ${linked ? styles.linked : ""}`}
      aria-pressed={active === index} aria-label={`${labels[index]}: ${picks[index] === null ? "empty, choose a factor" : `${prettyAlgebra(interaction.tiles[picks[index]!]!)}, select to remove`}`}
      disabled={disabled} onClick={() => clear(index)}
      onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); if (dragged.current !== null) place(dragged.current, index); dragged.current = null; }}>
      <span className={styles.slotLabel}>{labels[index]}</span>
      <span className={styles.factor}>{picks[index] === null ? "+ factor" : prettyAlgebra(interaction.tiles[picks[index]!]!)}</span>
    </button>;
  }

  return <section className={styles.puzzle} aria-label={spec.title}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>{crossword ? "THE SHARED-FACTOR PUZZLE" : "THE AREA PUZZLE"}</span><h3>{spec.title}</h3></div>
      <span className={styles.count} aria-live="polite">{picks.filter((p) => p !== null).length} / {interaction.slots} chosen</span>
    </header>
    <p className={styles.guide}>{spec.instruction}</p>
    {crossword ? <div className={styles.crossGrid}>
      <div className={styles.multiply} aria-hidden="true">×</div>{slot(2)}{slot(3)}
      {[0, 1].map((row) => <div className={styles.gridRow} key={row}>
        {slot(row)}
        {interaction.crossword?.filter((clue) => clue.row === row).map((clue) => {
          const index = interaction.crossword!.indexOf(clue);
          return <button type="button" key={clue.column} className={`${styles.clue} ${focusClue === index ? styles.clueActive : ""}`}
            disabled={disabled} aria-pressed={focusClue === index} onClick={() => setFocusClue(focusClue === index ? null : index)}>
            <span className={styles.slotLabel}>{labels[row]} × {labels[clue.column]}</span>
            <span className={styles.expression}>{prettyAlgebra(clue.expression)}</span>
          </button>;
        })}
      </div>)}
    </div> : <>
      <CutBuildBoard interaction={interaction} disabled={disabled} />
      <div className={styles.sides}>{slot(0)}<span aria-hidden="true">×</span>{slot(1)}</div>
    </>}
    <div className={styles.trayHeader}><span>FACTOR TILES</span><span>Choose a box, then a tile. Tap a filled box to undo.</span></div>
    <div className={styles.tray} aria-label="Factor tiles">
      {interaction.tiles.map((tile, index) => <button type="button" key={index} className={styles.tile}
        draggable={!disabled && !picks.includes(index)} disabled={disabled || picks.includes(index)}
        onDragStart={() => { dragged.current = index; }} onDragEnd={() => { dragged.current = null; }}
        onClick={() => place(index)}>{prettyAlgebra(tile)}</button>)}
    </div>
    <p className={styles.note}>{crossword ? "Tap an expression to highlight the two factors it connects." : "The pieces are a scratchpad. Only your two selected side lengths are submitted."} No answers are checked until you submit.</p>
  </section>;
}

function CutBuildBoard({ interaction, disabled }: { interaction: TileBuildInteraction; disabled: boolean }) {
  const [phase, setPhase] = useState(0);
  const [angle, setAngle] = useState(0);
  const [position, setPosition] = useState({ x: 88, y: 158 });
  const board = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const { variable = "x", removedSide = 4 } = interaction.cutBuild ?? {};
  function move(x: number, y: number) { setPosition({ x: Math.max(48, Math.min(352, x)), y: Math.max(48, Math.min(172, y)) }); }
  function point(event: PointerEvent<SVGGElement>) {
    const bounds = board.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * 400 / bounds.width, y: (event.clientY - bounds.top) * 220 / bounds.height };
  }
  function rotate() { if (!disabled && phase === 2) setAngle((value) => (value + 90) % 360); }
  const messages = [
    `Start with a ${variable} by ${variable} square. Remove the ${removedSide} by ${removedSide} corner.`,
    "Cut along the dotted seam to separate the remaining area into two pieces.",
    "Rotate and move B to make a rectangle with A. Then choose the rectangle’s length and height.",
  ];
  return <div className={styles.studio}>
    <ol className={styles.stages} aria-label="Construction progress">{["Remove", "Cut", "Rearrange"].map((name, i) => <li key={name} aria-current={i === phase ? "step" : undefined}><span>{i + 1}</span>{name}</li>)}</ol>
    <p className={styles.studioGuide} aria-live="polite">{messages[phase]}</p>
    <svg ref={board} viewBox="0 0 400 220" className={styles.board} aria-label={`Area workspace. Assume ${variable} is greater than ${removedSide}. Drawing is not to scale.`}>
      <text x="120" y="20" textAnchor="middle" className={styles.dimension}>{variable}</text>
      <text x="22" y="113" textAnchor="middle" className={styles.dimension}>{variable}</text>
      <rect x="40" y="30" width="160" height="96" rx="3" fill="#b8d9cc" stroke="#387566" strokeWidth="1.5" />
      <text x="120" y="83" textAnchor="middle" className={styles.pieceLetter}>A</text>
      {phase < 2 ? <>
        <rect x="40" y="126" width="96" height="64" fill="#e7c589" stroke="#9f7133" strokeWidth="1.5" />
        <text x="88" y="164" textAnchor="middle" className={styles.pieceLetter}>B</text>
      </> : <g role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label="Piece B. Drag to move; arrow keys move; R rotates." className={styles.movable}
        transform={`translate(${position.x} ${position.y}) rotate(${angle})`}
        onPointerDown={(event) => { if (disabled) return; const p = point(event); drag.current = { id: event.pointerId, dx: p.x - position.x, dy: p.y - position.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (disabled || drag.current?.id !== event.pointerId) return; const p = point(event); move(p.x - drag.current.dx, p.y - drag.current.dy); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(event) => { if (disabled) return; const delta: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }; if (delta[event.key]) { event.preventDefault(); const [dx, dy] = delta[event.key]!; move(position.x + dx, position.y + dy); } else if (event.key.toLowerCase() === "r") { event.preventDefault(); rotate(); } }}>
        <rect x="-48" y="-32" width="96" height="64" rx="3" fill="#e7c589" stroke="#9f7133" strokeWidth="1.5" />
        <text x="0" y="6" textAnchor="middle" className={styles.pieceLetter} transform={`rotate(${-angle})`}>B</text>
      </g>}
      {phase < 2 && <>
        <rect x="136" y="126" width="64" height="64" rx="3" fill={phase === 0 ? "#efd9da" : "none"} stroke="#ad7479" strokeDasharray={phase === 1 ? "4 4" : undefined} />
        <text x="168" y="160" textAnchor="middle" className={styles.corner}>{phase === 0 ? `${removedSide} × ${removedSide}` : "removed"}</text>
      </>}
      {phase === 1 && <path d="M40 126H136" stroke="#234d43" strokeWidth="2.5" strokeDasharray="4 4" />}
      <text x="394" y="211" textAnchor="end" className={styles.caption}>Not to scale · {variable} &gt; {removedSide}</text>
    </svg>
    <div className={styles.controls}>
      {phase < 2 ? <button type="button" disabled={disabled} onClick={() => setPhase(phase + 1)}>{phase === 0 ? "Remove corner" : "Cut along seam"} <span aria-hidden="true">→</span></button> : <>
        <button type="button" disabled={disabled} onClick={rotate}>Rotate B ↻</button>
        <button type="button" disabled={disabled} onClick={() => move(position.x > 200 ? 88 : 232, position.x > 200 ? 158 : 78)}>Move B {position.x > 200 ? "back" : "beside A"}</button>
      </>}
      <button type="button" disabled={disabled} onClick={() => { setPhase(0); setAngle(0); setPosition({ x: 88, y: 158 }); }}>Reset pieces</button>
    </div>
  </div>;
}
