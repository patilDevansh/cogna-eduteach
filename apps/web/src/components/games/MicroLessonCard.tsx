"use client";

import { useEffect, useRef, useState } from "react";
import type { MicroAction, MicroCheckResult, MicroLessonView, MicroToken } from "@cogna/shared";
import styles from "./micro-lesson.module.css";

/**
 * A 15–25 second narrated micro-lesson on the student's own mistake: the
 * dark card, the maths moving while the voice talks, then one quick check.
 * The script comes from the server (built by code, every expression checked);
 * this component only plays it.
 *
 * Built imperatively inside one container (tokens fly between rows and
 * arrows are drawn from measured positions), like a tiny animation engine.
 */

const ARROW_COLOURS = { mint: "#9fd8c0", violet: "#b9a6f0" } as const;
const RM = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function MicroLessonCard({
  lesson,
  onCheck,
  onFinished,
}: {
  lesson: MicroLessonView;
  onCheck: (option: number) => Promise<MicroCheckResult>;
  onFinished?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const tokens = useRef<Record<string, HTMLSpanElement>>({});
  const rows = useRef<HTMLDivElement[]>([]);
  const downs = useRef<HTMLDivElement[]>([]);
  const arcs = useRef<SVGSVGElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(100);
  const [level, setLevel] = useState(0);
  const [checkState, setCheckState] = useState<{ picked: number | null; result: MicroCheckResult | null; solved: boolean }>({ picked: null, result: null, solved: false });

  // Build the rows of maths. Poster = the finished frame (like a thumbnail).
  function build(poster: boolean) {
    const stage = stageRef.current;
    if (!stage) return;
    stage.innerHTML = "";
    tokens.current = {};
    rows.current = [];
    downs.current = [];
    if (pillsRef.current) pillsRef.current.innerHTML = "";
    lesson.rows.forEach((row, ri) => {
      if (ri) {
        const d = document.createElement("div");
        d.className = `${styles.down}${poster ? "" : ` ${styles.off}`}`;
        const colour = ARROW_COLOURS[lesson.arrow];
        d.innerHTML = `<svg viewBox="0 0 20 40" aria-hidden="true"><path d="M10 2v26" style="stroke:${colour}" stroke-width="2.8" stroke-linecap="round"/><path d="M3 25l7 12 7-12z" style="fill:${colour};stroke:${colour}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
        stage.append(d);
        downs.current.push(d);
      }
      const line = document.createElement("div");
      line.className = styles.expr;
      if (lesson.size) line.style.fontSize = `${lesson.size}cqi`;
      row.forEach((item: MicroToken, k) => {
        const [id, text, posterClass] = typeof item === "string" ? [`${ri}_${k}`, item, ""] : [item[0], item[1], item[2] ?? ""];
        const t = document.createElement("span");
        t.className = styles.tok;
        t.textContent = text.replace(/ /g, " ");
        if (poster && posterClass) posterClass.split(" ").forEach((c) => c && t.classList.add(styles[c] ?? c));
        if (!poster && ri > 0) t.classList.add(styles.ghost!);
        tokens.current[id] = t;
        line.append(t);
      });
      stage.append(line);
      rows.current.push(line);
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", styles.arcs!);
    svg.setAttribute("aria-hidden", "true");
    stage.append(svg);
    arcs.current = svg;
  }

  useEffect(() => {
    build(true);
    return () => {
      runRef.current += 1;
      audioRef.current?.pause();
    };
  }, [lesson]);

  const rel = (node: Element) => {
    const a = node.getBoundingClientRect();
    const b = stageRef.current!.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  };

  function act(action: MicroAction) {
    const t = (id: string) => tokens.current[id];
    switch (action.op) {
      case "pill": {
        const pill = document.createElement("span");
        pill.className = `${styles.pill} ${action.tone ? styles[action.tone] ?? "" : ""}`;
        pill.textContent = action.text;
        pillsRef.current?.append(pill);
        return;
      }
      case "clearPills":
        if (pillsRef.current) pillsRef.current.innerHTML = "";
        return;
      case "add":
        action.cls.forEach((c) => t(action.id)?.classList.add(styles[c] ?? c));
        return;
      case "rm":
        action.cls.forEach((c) => t(action.id)?.classList.remove(styles[c] ?? c));
        return;
      case "show":
        action.ids.forEach((id) => t(id)?.classList.remove(styles.ghost!));
        return;
      case "pulse":
        action.ids.forEach((id) => {
          const n = t(id);
          if (!n) return;
          n.classList.remove(styles.pulse!);
          void n.offsetWidth;
          n.classList.add(styles.pulse!);
        });
        return;
      case "down":
        downs.current[action.index]?.classList.remove(styles.off!);
        return;
      case "arc": {
        const from = t(action.from), to = t(action.to);
        if (!from || !to || !arcs.current) return;
        const a = rel(from), b = rel(to);
        const x1 = a.x + a.w / 2, x2 = b.x + b.w / 2, y = a.y + a.h * 0.08;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - Math.max(22, (x2 - x1) * 0.42)} ${x2} ${y}`);
        path.style.transitionDelay = `${action.delayMs ?? 0}ms`;
        arcs.current.append(path);
        path.getBoundingClientRect();
        path.classList.add(styles.arcOn!);
        return;
      }
      case "fly": {
        const src = t(action.from), dst = t(action.to), stage = stageRef.current;
        if (!src || !dst || !stage) return;
        const a = rel(src), b = rel(dst), cs = getComputedStyle(src);
        const clone = src.cloneNode(true) as HTMLSpanElement;
        clone.classList.remove(styles.ghost!, styles.dim!, styles.pulse!);
        Object.assign(clone.style, {
          position: "absolute", left: `${a.x}px`, top: `${a.y}px`, margin: "0",
          fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
          whiteSpace: "nowrap", transition: "transform .95s cubic-bezier(.2,.8,.2,1)", zIndex: "3",
        });
        stage.append(clone);
        clone.getBoundingClientRect();
        clone.style.transform = `translate(${b.x - a.x}px, ${b.y - a.y}px)`;
        setTimeout(() => { dst.classList.remove(styles.ghost!); clone.remove(); }, RM ? 30 : 950);
        return;
      }
      case "later":
        setTimeout(() => act(action.then), action.ms);
        return;
    }
  }

  /** Plays one line: the server's Cartesia clip when there is one, otherwise the caption alone for its length. */
  function speak(url: string | undefined, seconds: number, onTick: (t: number) => void, my: number): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      let raf = 0;
      const tick = () => {
        if (my !== runRef.current) return;
        const t = audioRef.current && url ? audioRef.current.currentTime : (performance.now() - start) / 1000;
        onTick(t);
        raf = requestAnimationFrame(tick);
      };
      let settled = false;
      let safety = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        cancelAnimationFrame(raf);
        clearTimeout(safety);
        resolve();
      };
      const silent = () => setTimeout(finish, seconds * 1000);
      if (url) {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = finish;
        audio.onerror = silent;
        audio.play().catch(silent);
        // A clip that stalls (slow network, blocked autoplay) never fires "ended": move on after its length plus a margin.
        safety = window.setTimeout(finish, seconds * 1000 + 3000);
      } else {
        audioRef.current = null;
        silent();
      }
      tick();
    });
  }

  async function play() {
    const my = ++runRef.current;
    audioRef.current?.pause();
    setPlaying(true);
    setCheckState({ picked: null, result: null, solved: false });
    build(false);
    const total = lesson.steps.reduce((n, s) => n + s.seconds + 0.3, 0);
    let done = 0;
    for (const step of lesson.steps) {
      if (my !== runRef.current) return;
      step.actions.forEach(act);
      setCaption(step.say);
      await speak(step.audioUrl, step.seconds, (t) => {
        setProgress(Math.min(100, ((done + Math.min(t, step.seconds)) / total) * 100));
        setLevel(0.35 + 0.65 * Math.abs(Math.sin(t * 9) * Math.cos(t * 2.3)));
      }, my);
      if (my !== runRef.current) return;
      done += step.seconds + 0.3;
      await wait(300);
    }
    setProgress(100);
    setLevel(0);
    setCaption("");
    setPlaying(false);
    setPlayed(true);
    onFinished?.();
  }

  async function pick(i: number) {
    if (checkState.solved) return;
    const result = await onCheck(i);
    setCheckState({ picked: i, result, solved: result.correct });
  }

  const bars = Array.from({ length: 44 }, (_, i) => {
    const rest = 16 + 64 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.55));
    return playing ? 10 + 90 * level * Math.abs(Math.sin(i * 0.9 + level * 6)) : rest;
  });

  return (
    <article className={styles.card}>
      <div className={styles.screen}>
        <p className={styles.who}>{lesson.who}&apos;s lesson</p>
        <div className={styles.stage} ref={stageRef} />
        <p className={styles.sub} aria-live="polite">{caption}</p>
        <div className={styles.wave} aria-hidden="true">{bars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
        <div className={styles.prog}><i style={{ width: `${progress}%` }} /></div>
        <div className={styles.pills} ref={pillsRef} />
        {!playing && (
          <button type="button" className={styles.play} onClick={() => void play()} aria-label={played ? `Replay ${lesson.who}'s lesson` : `Play ${lesson.who}'s lesson`}>
            {played ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1.5L6.5 6 12 10.5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
            )}
          </button>
        )}
      </div>
      <h3 className={styles.takeaway}>{lesson.takeaway}</h3>
      <p className={styles.note}>Narrated · made for {lesson.who}&apos;s gap · {lesson.gap}</p>
      {played && (
        <div className={styles.check}>
          <p>Quick check: <span className={styles.math}>{lesson.check.prompt}</span></p>
          <div className={styles.options}>
            {lesson.check.options.map((o, i) => (
              <button
                key={o}
                type="button"
                className={styles.option}
                data-state={checkState.picked === i ? (checkState.result?.correct ? "right" : "wrong") : undefined}
                disabled={checkState.solved}
                onClick={() => void pick(i)}
              >
                {o}
              </button>
            ))}
          </div>
          {checkState.result && <p className={styles.feedback} data-ok={checkState.result.correct || undefined} role="status">{checkState.result.feedback}</p>}
        </div>
      )}
    </article>
  );
}
