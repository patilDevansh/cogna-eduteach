"use client";

import { useEffect, useRef } from "react";
import styles from "./class-story.module.css";

/* What each student showed (example numbers for the landing page). */
const GROUPS = [
  { name: "Secure", n: 27, rgb: [44, 155, 120] },
  { name: "Brackets", n: 7, rgb: [224, 160, 32] },
  { name: "Signs", n: 4, rgb: [224, 112, 74] },
  { name: "Balance", n: 2, rgb: [111, 134, 224] },
];
const SEATED = [58, 167, 132];
const BEATS = ["The class", "One student", "The working", "Regrouped", "The teacher"];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const range = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const band = (p: number, a: number, b: number, f = 0.035) => Math.min(range(p, a, a + f), 1 - range(p, b - f, b));

type Light = { gi: number; k: number; slot: number; col: number; row: number; ph: number; sp: number; size: number; home: number[]; cluster: number[] };

/**
 * Forty lights are a class seated in rows. Scrolling brings one forward; it opens into that student's
 * working, Cogna catches the mistake, and the class regroups by what each student needs.
 * Drawn on a 2D canvas (soft orbs need nothing heavier). Reduced motion keeps the beats, drops the drift.
 */
export function ClassStory() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current!;
    const $ = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
    const canvas = $<HTMLCanvasElement>("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

    const lights: Light[] = [];
    GROUPS.forEach((g, gi) => { for (let k = 0; k < g.n; k++) lights.push({ gi, k } as Light); });
    const slots = lights.map((_, i) => i).sort(() => rnd() - 0.5);
    lights.forEach((L, i) => Object.assign(L, { slot: slots[i], ph: rnd() * 10, sp: 0.7 + rnd() * 0.6, size: 0.75 + rnd() * 0.35 }));
    const chosen = lights.find((L) => L.gi === 1)!;

    let narrow = false;
    let centers: number[][] = [];
    function layout() {
      const cols = narrow ? 5 : 8, rows = 40 / cols, gap = narrow ? 1.05 : 1.25;
      centers = narrow ? [[-1.7, 1.9], [1.7, 1.9], [-1.7, -1.6], [1.7, -1.6]] : [[-5.1, -0.3], [-1.5, -0.3], [1.5, -0.3], [4.4, -0.3]];
      lights.forEach((L) => {
        L.col = L.slot % cols; L.row = Math.floor(L.slot / cols);
        L.home = [(L.col - (cols - 1) / 2) * gap, ((rows - 1) / 2 - L.row) * 1.05, 0];
        const n = GROUPS[L.gi].n, c = Math.min(n, n > 12 ? (narrow ? 5 : 6) : n > 4 ? 4 : 2), rs = Math.ceil(n / c);
        const r = Math.floor(L.k / c), inRow = r === rs - 1 ? n - r * c : c;
        L.cluster = [centers[L.gi][0] + ((L.k % c) - (inRow - 1) / 2) * 0.42, centers[L.gi][1] + ((rs - 1) / 2 - r) * 0.42, 0];
      });
    }

    const caps = [...el.querySelectorAll<HTMLElement>("[data-cap]")];
    const rail = [...el.querySelectorAll<HTMLElement>("[data-beat]")];
    const chips = [...el.querySelectorAll<HTMLElement>("[data-chip]")];
    const paper = $("[data-paper]"), dash = $("[data-dash]");
    const [l1, l2, l3] = [1, 2, 3].map((n) => $(`[data-line="${n}"]`));
    const write = (li: HTMLElement, a: number, p: number, len = 0.035) => {
      li.style.opacity = String(range(p, a, a + 0.005));
      (li.firstElementChild as HTMLElement).style.setProperty("--clip", `${100 - range(p, a, a + len) * 100}%`);
    };

    let w = 0, h = 0, mx = 0, my = 0, smx = 0, smy = 0;

    function draw(p: number, t: number) {
      ctx!.clearRect(0, 0, w, h);
      const camZ = (narrow ? 19 : 13) - ease(range(p, 0.1, 0.42)) * 2.6 + ease(range(p, 0.7, 0.86)) * 3.4;
      const lift = ease(range(p, 0.9, 0.95)) * (narrow ? 2.2 : 1.6);
      smx += (mx - smx) * 0.05; smy += (my - smy) * 0.05;
      const cx = smx * 0.8, cy = lift - smy * 0.5;
      const f = h / 2 / Math.tan(((narrow ? 58 : 45) * Math.PI) / 360);
      const proj = (x: number, y: number, z: number) => {
        const dz = camZ - z;
        return dz < 0.1 ? null : { x: w / 2 + ((x - cx) * f) / dz, y: h / 2 - ((y - cy) * f) / dz, k: f / dz };
      };

      const come = ease(range(p, 0.14, 0.45)) * (1 - ease(range(p, 0.7, 0.8)));
      const regroup = ease(range(p, 0.8, 0.9));
      const dim = band(p, 0.18, 0.82, 0.07);
      const orbs = lights.map((L) => {
        const wave = Math.sin(t * 0.9 - L.col * 0.55 - L.row * 0.35);
        const settle = Math.sin(t * 0.9 - L.cluster[0] * 0.8) * 0.03;
        let x = L.home[0] + (L.cluster[0] - L.home[0]) * regroup;
        let y = L.home[1] + wave * 0.06 + (L.cluster[1] + settle - L.home[1] - wave * 0.06) * regroup;
        let z = wave * 0.25 * (1 - regroup);
        const tw = 1 + Math.sin(t * 2 * L.sp + L.ph) * 0.08;
        let size = L.size * tw, alpha = 1 - dim * 0.7;
        if (L === chosen) { x *= 1 - come; y *= 1 - come; z += (camZ - 5 - z) * come; size *= 1 + come * 0.5; alpha = 1; }
        const rgb = SEATED.map((c, i) => Math.round(c + (GROUPS[L.gi].rgb[i] - c) * regroup));
        return { x, y, z, size, alpha, rgb };
      }).sort((m, n) => m.z - n.z);

      for (const o of orbs) {
        const q = proj(o.x, o.y, o.z);
        if (!q) continue;
        const R = o.size * q.k * 0.5, [r, g, b] = o.rgb;
        const grad = ctx!.createRadialGradient(q.x, q.y, 0, q.x, q.y, R);
        [[0, 1], [0.13, 0.95], [0.22, 0.5], [0.4, 0.16], [0.65, 0.04], [1, 0]].forEach(([s, al]) => grad.addColorStop(s, `rgba(${r},${g},${b},${al * o.alpha})`));
        ctx!.fillStyle = grad;
        ctx!.fillRect(q.x - R, q.y - R, R * 2, R * 2);
      }

      // the chosen light opens into paper
      const iris = ease(range(p, 0.43, 0.5)) * (1 - ease(range(p, 0.7, 0.77)));
      paper.style.clipPath = `circle(${iris * 80}% at 50% 50%)`;
      write(l1, 0.52, p);
      write(l2, 0.555, p);
      l2.style.setProperty("--glow", String(range(p, 0.59, 0.605)));
      l2.style.setProperty("--note", String(range(p, 0.6, 0.615)));
      l2.style.setProperty("--strike", `${range(p, 0.625, 0.64) * 100}%`);
      write(l3, 0.645, p, 0.03);

      caps[0].style.opacity = String(band(p, -0.1, 0.13));
      caps[1].style.opacity = String(band(p, 0.17, 0.41));
      caps[2].style.opacity = String(band(p, 0.79, 0.9));
      caps[3].style.opacity = String(range(p, 0.9, 0.93));

      chips.forEach((chip, gi) => {
        const q = proj(centers[gi][0], centers[gi][1] + 0.55 + Math.sqrt(GROUPS[gi].n) * 0.17, 0);
        if (q) chip.style.transform = `translate(${q.x}px, ${q.y}px)`;
        chip.style.opacity = String(range(p, 0.86, 0.89));
      });
      dash.style.opacity = String(range(p, 0.9, 0.93));
      dash.style.transform = `translateY(${(1 - range(p, 0.9, 0.93)) * 14}px)`;
      dash.style.setProperty("--fill", String(ease(range(p, 0.92, 0.97))));

      const beat = p < 0.15 ? 0 : p < 0.45 ? 1 : p < 0.74 ? 2 : p < 0.9 ? 3 : 4;
      rail.forEach((s, i) => (s.dataset.on = String(i === beat)));
    }

    function size() {
      const dpr = Math.min(devicePixelRatio, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      narrow = w / h < 0.8;
      layout();
    }

    const read = () => { const r = el.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight)); };
    let target = read(), cur = target, raf = 0, visible = false;
    const t0 = performance.now();
    const loop = (now: number) => {
      cur += (target - cur) * (calm ? 1 : 0.1);
      if (Math.abs(target - cur) < 0.0003) cur = target;
      draw(cur, calm ? 0 : (now - t0) / 1000);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    // the section's tint fades in over the screen-height before it pins
    const tint = () => el.style.setProperty("--enter", String(clamp(1 - el.getBoundingClientRect().top / innerHeight)));
    const onScroll = () => { target = read(); tint(); };
    const onMove = (e: PointerEvent) => { if (e.pointerType === "mouse" && !calm) { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; } };
    // only animate while the story is on screen
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    const ro = new ResizeObserver(size);
    size(); tint();
    io.observe(el); ro.observe(canvas);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      removeEventListener("scroll", onScroll); removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <section ref={root} className={styles.story} aria-label="How Cogna sees a class">
      <div className={styles.pin}>
        <div className={styles.tint} aria-hidden="true" />
        <canvas className={styles.canvas} aria-hidden="true" />
        <div className={styles.layer} aria-hidden="true">
          {GROUPS.map((g) => (
            <div key={g.name} data-chip className={styles.chip} style={{ "--c": `rgb(${g.rgb.join(",")})` } as React.CSSProperties}>
              <b>{g.n}</b><span>{g.name}</span>
            </div>
          ))}
        </div>

        <div className={styles.layer}>
          <div data-cap className={styles.cap}>
            <h2 className={styles.serif}>A class of forty has to <em>move together.</em></h2>
            <p>One teacher, one board, one pace.</p>
          </div>
          <div data-cap className={styles.cap}>
            <h2 className={styles.serif}>But each one is thinking <em>something different.</em></h2>
          </div>

          <div className={styles.paperWrap}>
            <div data-paper className={styles.paper}>
              <div className={styles.sheet}>
                <div className={styles.rules} />
                <p className={`${styles.say} ${styles.serif}`}>Cogna reads <em>every line.</em></p>
                <div className={styles.q}>Q4. Solve for x</div>
                <ol className={styles.lines}>
                  <li data-line="1"><span className={styles.w}>3(x + 4) = 21</span></li>
                  <li data-line="2" className={styles.flag}>
                    <span className={styles.w}>3x + 4 = 21<span className={styles.strike} /></span>
                    <span className={styles.note}>Caught at line 2 · bracket expansion</span>
                  </li>
                  <li data-line="3" className={styles.fix}><span className={styles.w}>3x + 12 = 21</span></li>
                </ol>
              </div>
            </div>
          </div>

          <div data-cap className={styles.cap}>
            <h2 className={styles.serif}>Then the class regroups <em>by what each one needs.</em></h2>
          </div>
          <div data-cap className={styles.cap}>
            <h2 className={styles.serif}>One lesson for the class. <em>A next step for each student.</em></h2>
          </div>

          <div data-dash className={styles.dash} aria-hidden="true">
            <span>Grade 8 · Section A</span>
            <strong>27 of 40<em>ready to move on</em></strong>
            <span className={styles.bar}><i /></span>
            <p>Next move: reteach <b>bracket expansion</b> to 7 students.</p>
          </div>

          <div className={styles.rail} aria-hidden="true">
            {BEATS.map((b) => <span key={b} data-beat><b>{b}</b></span>)}
          </div>
        </div>
      </div>
    </section>
  );
}
