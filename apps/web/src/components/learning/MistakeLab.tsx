"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonalizedVideoLabView } from "@cogna/shared";
import M from "./MistakeLab.module.css";

type LabEvent = { event: "right" | "wrong" | "complete"; step?: number; answer?: string; mistake?: string };
type Num = { value: number; on(cb: () => void): void } | null;
type Str = { value: string; on(cb: () => void): void } | null;

/**
 * The hands-on Rive lab drawn from the student's own wrong answer (signed build in /labs, chapter shell in
 * prototypes/rive-chapter-shell). Embedded, the lab draws only the board; this card draws the title, the task,
 * Kiara's line and Back / Next, and tells the page each checked answer. Those answers are engagement only.
 */
export function MistakeLab({ lab, onEvent, onFinish }: { lab: PersonalizedVideoLabView; onEvent: (e: LabEvent) => void; onFinish: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const vin = useRef<{ lesson: Num; step: Num; muted: { value: boolean } | null } | null>(null);
  const [view, setView] = useState({ title: "Your answer, as a field", task: "", caption: "", step: 1, steps: 3, done: false });
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(false);
  const step = useRef(1);
  const report = useRef(onEvent);
  report.current = onEvent;

  useEffect(() => {
    let r: { cleanup(): void; resizeDrawingSurfaceToCanvas(): void } | null = null;
    let gone = false;
    const resize = new ResizeObserver(() => { try { r?.resizeDrawingSurfaceToCanvas(); } catch { /* not loaded yet */ } });
    void import("@rive-app/webgl2").then((rive) => {
      if (gone || !canvas.current) return;
      rive.RuntimeLoader.setWasmUrl("/labs/rive.wasm"); // served by the app: school networks may block CDNs
      const instance = new rive.Rive({
        src: `/labs/${lab.chapter}.riv`, canvas: canvas.current, autoplay: true, stateMachines: "State Machine 1", autoBind: true,
        layout: new rive.Layout({ fit: rive.Fit.Layout }),
        onLoadError: () => setFailed(true),
        onLoad: () => {
          instance.resizeDrawingSurfaceToCanvas();
          const vm = instance.viewModelInstance;
          if (!vm) return setFailed(true);
          // the student's item first: the lesson reads it as it opens
          for (const [k, v] of Object.entries(lab.inputs)) {
            const p = typeof v === "number" ? vm.number(k) : vm.string(k);
            if (p) (p as { value: unknown }).value = v;
          }
          const out = {
            seq: vm.number("seq") as Num, event: vm.string("event") as Str, atStep: vm.number("atStep") as Num, steps: vm.number("steps") as Num,
            answer: vm.string("answer") as Str, mistake: vm.string("mistake") as Str, title: vm.string("title") as Str,
            task: vm.string("task") as Str, caption: vm.string("caption") as Str, stepDone: vm.boolean("stepDone") as { value: boolean } | null,
          };
          out.caption?.on(() => setView((s) => ({ ...s, caption: out.caption!.value })));
          out.seq?.on(() => {
            const e = out.event?.value;
            setView((s) => ({ ...s, title: out.title?.value || s.title, task: out.task?.value ?? "", step: out.atStep?.value || s.step, steps: out.steps?.value || s.steps, done: Boolean(out.stepDone?.value) }));
            if (e === "right" || e === "wrong" || e === "complete") {
              report.current({ event: e, step: out.atStep?.value, ...(out.answer?.value ? { answer: out.answer.value } : {}), ...(out.mistake?.value ? { mistake: out.mistake.value } : {}) });
            }
          });
          vin.current = { lesson: vm.number("lesson") as Num, step: vm.number("step") as Num, muted: vm.boolean("muted") };
          show();
        },
      });
      r = instance;
      resize.observe(canvas.current);
    }).catch(() => setFailed(true));
    return () => { gone = true; resize.disconnect(); r?.cleanup(); };
    // the same lab again (the page refreshes the lesson) must not restart it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.chapter, lab.lesson, JSON.stringify(lab.inputs)]);

  function show() {
    if (!vin.current?.step || !vin.current.lesson) return;
    vin.current.step.value = step.current; // step first, so the lesson opens straight at it
    vin.current.lesson.value = lab.lesson;
  }
  const last = view.step >= view.steps;
  const next = () => {
    if (last) return onFinish();
    step.current = view.step + 1;
    show();
  };
  const back = () => { if (view.step > 1) { step.current = view.step - 1; show(); } };
  const toggleSound = () => {
    if (!vin.current?.muted) return;
    vin.current.muted.value = !muted;
    setMuted(!muted);
  };

  if (failed) {
    return (
      <section className={M.card}>
        <p className={M.caption}>The hands-on part couldn&apos;t load on this device. Your lesson is just below.</p>
        <button className={M.primary} onClick={onFinish}>On to your lesson →</button>
      </section>
    );
  }
  return (
    <section className={M.card} aria-label="Hands-on: your answer, as a field">
      <p className={M.kicker}>Hands-on · from your own answer</p>
      <h2 className={M.title}>{view.title}</h2>
      {view.task && <p className={M.task} data-done={view.done}><b>{view.done ? "DONE" : "YOUR TURN"}</b> {view.task}</p>}
      <div className={M.stage}>
        <canvas ref={canvas} className={M.canvas} tabIndex={0} aria-label="Hands-on lab. Tap the gold gaps and drag the strips; the keys in each task also work." />
      </div>
      <p className={M.caption} aria-live="polite">{view.caption}</p>
      <div className={M.bar}>
        <span className={M.dots} aria-hidden="true">{Array.from({ length: view.steps }, (_, i) => <i key={i} data-on={i + 1 <= view.step} />)}</span>
        <button className={M.button} onClick={toggleSound} aria-pressed={muted}>{muted ? "Muted" : "Sound"}</button>
        <button className={M.button} onClick={back} disabled={view.step <= 1}>Back</button>
        <button className={M.primary} onClick={next} data-ready={view.done}>{last ? "On to your lesson" : "Next"}</button>
      </div>
      <button className={M.skip} onClick={onFinish}>Skip to the lesson</button>
    </section>
  );
}
