// ===== Sound Lab: progress = a 16-step track, one row per skill. Sound is off until switched on. =====
const SK = [["PAIR", "x²+bx+c", "#ff6a1a"], ["SIGNS", "Signs", "#ffd23f"], ["SQUARES", "Squares", "#ff4f8b"], ["CHECK", "Checking", "#3ee0b4"], ["GROUP", "Grouping", "#6ab0ff"]];
const Snd = (() => {
  let ac = null, on = false;
  function blip(f, d = .12, type = "triangle", g = .06) { if (!on || !ac) return; const o = ac.createOscillator(), v = ac.createGain(); o.type = type; o.frequency.value = f; v.gain.setValueAtTime(g, ac.currentTime); v.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.connect(v).connect(ac.destination); o.start(); o.stop(ac.currentTime + d + .02); }
  $("#snd").addEventListener("click", () => { on = !on; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch { on = false; } $("#snd").setAttribute("aria-pressed", String(on)); $("#snd").textContent = on ? "♪ Sound on" : "♪ Sound off"; blip(440); });
  return { blip };
})();
const Progress = (() => {
  const seq = $("#seq"); let col = 0, takes = 0;
  seq.insertAdjacentHTML("beforeend", SK.map(([k, n, c]) => `<div class="srow" data-k="${k}" style="--c:${c}"><span>${n}</span>${'<i class="pad"></i>'.repeat(16)}</div>`).join(""));
  function add(skill, cert) {
    const row = $(`.srow[data-k="${skill}"]`, seq), pads = $$(".pad", row), p = pads[col % 16];
    p.classList.add(cert >= .55 ? "on" : "soft"); if (!RM) gsap.fromTo(p, { scale: 1.6 }, { scale: 1, duration: .5, ease: "elastic.out(1,.4)" });
    Snd.blip(220 * Math.pow(2, (SK.findIndex((s) => s[0] === skill) * 2) / 12), .15);
    col++; takes++; $("#takes").textContent = takes;
  }
  const SCALE = [261.6, 293.7, 329.6, 392, 440];
  $("#play").addEventListener("click", () => {
    const ph = $("#ph"), rows = $$(".srow", seq), base = seq.getBoundingClientRect(), tl = gsap.timeline();
    tl.set(ph, { opacity: 1 });
    for (let s = 0; s < 16; s++) tl.call(() => {
      const r = $$(".pad", rows[0])[s].getBoundingClientRect(); gsap.set(ph, { x: r.left - base.left + r.width / 2 });
      rows.forEach((row, ri) => { const p = $$(".pad", row)[s]; if (p.classList.contains("on") || p.classList.contains("soft")) { p.classList.add("hit"); setTimeout(() => p.classList.remove("hit"), 140); Snd.blip(SCALE[ri] * (p.classList.contains("on") ? 1 : .5), .18, p.classList.contains("on") ? "sawtooth" : "sine", p.classList.contains("on") ? .04 : .025); } });
    }, null, s * .16);
    tl.to(ph, { opacity: 0, duration: .2 }, 16 * .16);
  });
  return { add };
})();

const SHEETS = [
  { id: "padgrid", title: "Pad grid", was: "Build the rectangle", now: "Light up a rectangle of pads: one big pad, five strips and six small pads. The edges are the factors.", kept: "First split, order of splits, gaps vs spare pads." },
  { id: "mixer", title: "Mixing desk", was: "Split your chips", now: "Four channels, four levels of volume to share. Push one fader all the way if sure; split the levels if torn.", kept: "The split: a 2–2 mix names the exact doubt." },
  { id: "keepdrop", title: "Keep or drop", was: "Swipe the claims", now: "Each pad holds a claim. Keep it (true), drop it (false), or mark it ? (not sure).", kept: "Mistake families across 8 claims, plus time on each." },
  { id: "scrub", title: "Scrub the take", was: "Stop the tape", now: "Sam's working plays back like a recorded take. Hit STOP on the wrong beat.", kept: "Which step they stop at, and how fast after the slip." },
  { id: "arrange", title: "Arrange the track", was: "Assemble the working", now: "Drop three of six clips into bars 1, 2 and 3. Three clips carry a slip.", kept: "Which slip clip, the order, and clips swapped out." },
  { id: "tune", title: "Tune two oscillators", was: "Crack the lock", now: "Two knobs. Tune both waves onto their ghost waves: one is the product, one the sum.", kept: "The search path on the XY log; the sign slip caught live." },
  { id: "ab", title: "A/B compare", was: "Always, sometimes, never", now: "Two signals, (x + 3)² and x² + 9, on level meters as x changes.", kept: "Which values they checked before deciding." },
  { id: "stems", title: "Solo the stems", was: "X-ray the answer", now: "The mix (your answer) plays; then solo each stem to hear the two moves underneath.", kept: "Two slips that cancel, exposed stem by stem." },
  { id: "pads4", title: "Four pads", was: "Sign quadrant", now: "Four drum pads, each set by two sign switches; then the pattern is matched to known rules.", kept: "The pattern across four sign cases." },
  { id: "hum", title: "Hum it first", was: "Predict, then pick", now: "Record your take before the presets unlock.", kept: "Take vs pick: found by checking, or by factorising." },
  { id: "beat", title: "Keep the beat", was: "The switch-up", now: "Four quick ones on the beat. The fourth is a look-alike.", kept: "Autopilot vs noticing the switch." },
  { id: "takes", title: "Take history", was: "Typing replay", now: "Every edit becomes a take; discarded takes stay in the history.", kept: "Discarded takes matched to known mistakes, and pauses." },
  { id: "notes", title: "Find every note", was: "Find them all", now: "Light every key b that works on a 30-key strip.", kept: "Completeness, order, missing negatives." },
  { id: "bus", title: "Bus it", was: "See the structure", now: "Route (x + 3) to a single bus and treat it as one signal.", kept: "The route chosen, plus 99² − 1." },
  { id: "producer", title: "Producer's next track", was: "Next best question", now: "The producer picks which instrument to try next, and stops when sure.", kept: "Lotus's side, not a student game." },
  { id: "export", title: "Export check", was: "Check what we read", now: "Before export, the engineer reads back what you typed and flags anything that would clip.", kept: "Typing problems kept apart from maths." },
];

// The mixer is Sound Lab's own take on the four-token split: levels instead of tokens.
function mixer(w, api) {
  const O = E.PAIR_OPTS, lv = [0, 0, 0, 0];
  w.innerHTML = `<p class="q">Which channel is the same as <span class="m">x² + 3x − 4</span>? You have four levels of volume to share. Push one fader all the way if you're sure, or split the levels if you're torn.</p>
    <div class="mixer">${O.map((o, i) => `<div class="ch"><span class="label">CH ${i + 1}</span><div class="track"><div class="lv">${'<i></i>'.repeat(4)}</div></div><div class="pm"><button type="button" data-i="${i}" data-d="-1" aria-label="down">−</button><button type="button" data-i="${i}" data-d="1" aria-label="up">+</button></div><span class="m">${o.t}</span></div>`).join("")}</div>
    <div class="row"><span class="budget" id="bud">4 levels left</span><button class="btn primary" id="mx" type="button" disabled>Print the mix</button></div>`;
  function draw(i) {
    $$(".ch", w).forEach((ch, k) => $$(".lv i", ch).forEach((b, j) => b.classList.toggle("on", 3 - j < lv[k])));
    const left = 4 - lv.reduce((a, b) => a + b, 0); $("#bud", w).textContent = left ? `${left} level${left > 1 ? "s" : ""} left` : "Mix full"; $("#mx", w).disabled = !!left;
    if (i !== undefined && !RM) gsap.fromTo($$(".ch", w)[i].querySelector(".track"), { scaleY: 1.04 }, { scaleY: 1, duration: .4, ease: "elastic.out(1,.4)" });
  }
  $$(".pm button", w).forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.i, d = +b.dataset.d, used = lv.reduce((a, c) => a + c, 0);
    if (d > 0 && (used >= 4 || lv[i] >= 4)) return; if (d < 0 && !lv[i]) return;
    lv[i] += d; Snd.blip(330 + lv[i] * 60, .08); api.note(`${d > 0 ? "Raised" : "Lowered"} CH ${i + 1} (${O[i].t}) to ${lv[i]}`, d < 0 ? "warn" : ""); draw(i);
  }));
  $("#mx", w).addEventListener("click", () => { const r = E.pairsRead(lv, "levels"); api.noticed(r.text); api.learn("PAIR", r.cert); });
  draw();
}
const sine = (y0, amp, f, w = 300) => { let d = ""; for (let x = 0; x <= w; x += 3) d += `${x ? "L" : "M"}${10 + x} ${y0 + Math.sin((x / w) * Math.PI * 2 * f) * amp} `; return d; };
const GAMES = {
  padgrid: (w, api) => W.tiles(w, api, { prompt: "Light up one rectangle of pads with area <span class=\"m\">x² + 5x + 6</span>. How many strip pads go down the side?", controlLabel: "Strip pads down the side", commitLabel: "Lock the pattern", rx: 4, onFit: (svg) => Snd.blip(523, .2) }),
  mixer,
  keepdrop: (w, api) => W.judge(w, api, { prompt: "Each pad holds a claim. <b>Keep</b> it if it's always true, <b>drop</b> it if it isn't, or mark it <b>?</b> if you're not sure.", card: (c, i, n) => `<div class="padcard"><span class="num">PAD ${String(i + 1).padStart(2, "0")}/${n}</span><span class="m">${c}</span><span class="g-mark"></span></div>`, buttons: [{ v: "false", label: "Drop", mark: "DROPPED" }, { v: "null", label: "?", mark: "NOT SURE" }, { v: "true", label: "Keep", mark: "KEPT" }], exit: (v) => ({ x: v === null ? 0 : v ? 200 : -200, y: v === null ? 120 : 0, scale: .6, opacity: 0 }), enter: { scale: .85, opacity: 0, duration: .3, ease: "back.out(2)" }, doneText: "All pads played" }),
  scrub: (w, api) => W.replay(w, api, { prompt: "Sam's check of <span class=\"m\">x² − x − 6</span> plays back like a recorded take. Hit <b>STOP</b> on the beat where it goes wrong.", playLabel: "Play the take", stopLabel: "STOP", fineLabel: "Take sounds right", cursor: true, onPlay: (p) => p && Snd.blip(392, .1) }),
  arrange: (w, api) => W.order(w, api, { prompt: "Factorise <span class=\"m\">6xy − 4y − 9x + 6</span> by grouping. Drop three clips into bars 1–3, in order. Three of the six clips carry a slip.", slotLabels: ["Bar 1", "Bar 2", "Bar 3"], poolLabel: "Clip library", doneLabel: "Bounce the arrangement", onDone: () => Snd.blip(523, .25, "sawtooth", .04) }),
  tune: (w, api) => W.dials(w, api, { prompt: "Tune two oscillators for <span class=\"m\">x² − x − 12</span>. One wave shows your numbers multiplied, the other added. Lock both onto their ghost waves.", labels: { p: "Knob A", q: "Knob B" }, logTitle: "XY log: every setting you tried",
    readout: (p, q) => `A × B = ${sgn(p * q)} <span style="color:var(--muted)">(ghost −12)</span> · A + B = ${sgn(p + q)} <span style="color:var(--muted)">(ghost −1)</span>`,
    visual(box, p, q, solved, first) {
      if (first || !$("svg", box)) box.innerHTML = `<svg viewBox="0 0 320 210"><path d="${sine(55, 30, 12 / 2)}" fill="none" stroke="rgba(255,138,61,.22)" stroke-width="6"/><path id="wP" fill="none" stroke="#ff8a3d" stroke-width="2"/><path d="${sine(155, 30, 1.5)}" fill="none" stroke="rgba(255,138,61,.22)" stroke-width="6"/><path id="wS" fill="none" stroke="#ff8a3d" stroke-width="2"/><text x="12" y="18" font-size="16" fill="#ff8a3d" font-family="VT323">× WAVE</text><text x="12" y="118" font-size="16" fill="#ff8a3d" font-family="VT323">+ WAVE</text></svg>`;
      const fp = Math.abs(p * q) / 2 || .25, fs = Math.abs(p + q) + .5, okP = p * q === -12, okS = p + q === -1;
      $("#wP", box).setAttribute("d", sine(55, p * q < 0 ? 30 : -30, fp)); $("#wS", box).setAttribute("d", sine(155, p + q < 0 ? 30 : -30, fs));
      $("#wP", box).setAttribute("stroke", okP ? "#fff3e6" : "#ff8a3d"); $("#wS", box).setAttribute("stroke", okS ? "#fff3e6" : "#ff8a3d");
      if (!first) Snd.blip(180 * Math.pow(2, Math.min(24, Math.abs(p * q)) / 12), .08);
    }, onSolve: () => Snd.blip(660, .3, "sawtooth", .04) }),
  ab: (w, api) => W.compare(w, api, { prompt: "Two signals claim to be the same: <span class=\"m\">(x + 3)²</span> and <span class=\"m\">x² + 9</span>. Change x and watch the meters. Always equal?", min: -6, max: 6, verdicts: [{ v: "always", label: "Always equal" }, { v: "sometimes", label: "Sometimes equal" }, { v: "never", label: "Never equal" }], signLabel: "Log the verdict",
    visual(box, x, A, B, first) {
      const seg = (v) => Math.round((v / 81) * 20);
      if (first || !$(".meters", box)) box.innerHTML = `<div class="meters" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;justify-items:center;padding:8px 0"><div style="display:grid;gap:6px;justify-items:center"><span class="label">A · (x + 3)²</span><div class="mt" id="mA" style="display:grid;gap:3px;width:60px"></div><b class="m" id="vA" style="color:#ff8a3d;font-size:1.4rem"></b></div><div style="display:grid;gap:6px;justify-items:center"><span class="label">B · x² + 9</span><div class="mt" id="mB" style="display:grid;gap:3px;width:60px"></div><b class="m" id="vB" style="color:#ff8a3d;font-size:1.4rem"></b></div></div><p id="eqm" style="text-align:center;font:400 1.6rem VT323,monospace"></p>`;
      const fill = (id, v) => { const n = seg(v); $(id, box).innerHTML = Array.from({ length: 20 }, (_, k) => { const lvl = 19 - k, on = lvl < n; return `<i style="display:block;height:7px;border-radius:2px;background:${on ? (lvl > 15 ? "#ff4f6b" : lvl > 11 ? "#ffd23f" : "#3ee0b4") : "#2a2b30"}"></i>`; }).join(""); };
      fill("#mA", A); fill("#mB", B); $("#vA", box).textContent = A; $("#vB", box).textContent = B;
      const e = $("#eqm", box); e.textContent = A === B ? "A = B · LOCKED" : "A ≠ B"; e.style.color = A === B ? "#3ee0b4" : "#ff4f6b";
      if (!first) Snd.blip(220 + A * 4, .08, "sine");
    } }),
  stems: (w, api) => W.twoMoves(w, api, { prompt: "Factorise <span class=\"m\">x² − x − 6</span> in two moves. Bounce the mix, then solo each stem to hear what's underneath.", performLabel: "Bounce the mix", revealLabel: "Solo the stems",
    empty: (box) => (box.innerHTML = `<p style="text-align:center;color:var(--muted);padding:40px 0;font:400 1.3rem VT323,monospace">NO MIX YET</p>`),
    surface: (box, r) => { box.innerHTML = `<div style="display:grid;justify-items:center;gap:8px;padding:24px 0"><span class="label">Master mix</span><span class="m" style="font-size:2rem;color:#ff8a3d">(x ${pm(r.b1)})(x ${pm(r.b2)})</span><span style="font:400 1.3rem VT323,monospace;color:${r.fin ? "#3ee0b4" : "#ff4f6b"}">${r.fin ? "MASTER CHECK: OK" : "MASTER CHECK: OFF"}</span></div>`; Snd.blip(r.fin ? 523 : 311, .25); },
    reveal: (box, r) => { W.layerCards(box, r); $$(".g-layer", box).forEach((l, i) => { l.insertAdjacentHTML("afterbegin", `<small style="color:#ff8a3d">SOLO ${["MASTER", "STEM 2", "STEM 1"][i]}</small>`); }); r.layers.forEach((L, i) => setTimeout(() => Snd.blip(L.ok ? 440 : 233, .2, L.ok ? "triangle" : "square", .04), i * 300)); } }),
  pads4: (w, api) => W.quad(w, api, { prompt: "Each pad factorises with the numbers 2 and 3. Flip the two sign switches to arm it.", names: ["Pad 1", "Pad 2", "Pad 3", "Pad 4"], art: (i) => `<svg viewBox="0 0 120 70"><rect class="dp" x="20" y="8" width="80" height="54" rx="10" fill="#2a2b30" stroke="#3a3b40" stroke-width="2"/><circle cx="60" cy="35" r="10" fill="#1b1c20"/></svg>`, onLit: (card) => { gsap.to($(".dp", card), { attr: { fill: "#ff6a1a" }, duration: .3 }); Snd.blip(196 + Math.random() * 200, .15, "square", .04); }, checkLabel: "Play the pattern", rulesTitle: "Patterns students play" }),
  hum: (w, api) => W.predict(w, api, { prompt: "Factorise <span class=\"m\">x² + 2x − 15</span>. Record your take first. The presets unlock after.", guessLabel: "Your take:", commitLabel: "● Record take", coverText: "Presets locked until you record your take.", peekLabel: "Watch someone audition every preset" }),
  beat: (w, api) => W.rows(w, api, { prompt: "Four quick ones, on the beat. Factorise each, or say it can't be done.", rowLabel: (i) => `Beat ${i + 1}`, enter: { x: 60, opacity: 0, duration: .25, ease: "power4.out" }, onAnswer: () => Snd.blip(330, .06, "square", .04) }),
  takes: (w, api) => W.typed(w, api, { prompt: "Type the factorisation of <span class=\"m\">x² + 3x − 10</span> (use - for minus). Every edit becomes a take.", submitLabel: "Stop recording", outTitle: "Take history", draftWord: "take", samplesLabel: "Or play back someone else's session", onKey: () => Snd.blip(880, .03, "square", .02) }),
  notes: (w, api) => W.findAll(w, api, { prompt: "<span class=\"m\">x² + bx + 12</span> factorises into two brackets with whole numbers. Light <b>every</b> key b that works.", doneLabel: "Play every note", marker: (n) => `<rect x="-8" y="-40" width="16" height="30" rx="3" fill="#ff6a1a"/><text y="-20" text-anchor="middle" font-size="11" fill="#1a0a00" font-family="IBM Plex Mono">${n}</text>`,
    resultArt: (v, p, q, hit) => { const B = 36, k = 2, ww = Math.max(3, B + p * k), hh = Math.max(3, B + q * k); return `<svg viewBox="0 0 80 80"><rect x="10" y="10" width="${B}" height="${B}" rx="3" fill="none" stroke="#4a4b51" stroke-dasharray="3 3"/><rect x="10" y="10" width="${ww}" height="${hh}" rx="3" fill="${hit ? "rgba(255,106,26,.3)" : "none"}" stroke="${hit ? "#ff6a1a" : "#ff4f6b"}" stroke-width="2" ${hit ? "" : 'stroke-dasharray="4 3"'}/></svg>`; } }),
  bus: (w, api) => W.module(w, api, { prompt: "Factorise this. What's your first move?", routes: { block: "Route (x + 3) to one bus", expand: "Expand the bracket first", root: "Square-root each part" },
    idle: (box) => (box.innerHTML = `<p style="font:400 1.3rem VT323,monospace;color:var(--muted)">ROUTING VIEW</p>`),
    blockVisual(box) { box.innerHTML = `<svg viewBox="0 0 300 170"><rect x="14" y="30" width="70" height="34" rx="6" fill="#2a2b30" stroke="#4a4b51"/><text x="49" y="52" text-anchor="middle" font-size="14" fill="#ecebe6" font-family="IBM Plex Mono">x</text><rect x="14" y="100" width="70" height="34" rx="6" fill="#2a2b30" stroke="#4a4b51"/><text x="49" y="122" text-anchor="middle" font-size="14" fill="#ecebe6" font-family="IBM Plex Mono">+ 3</text><path id="c1" d="M84 47 C140 47 140 85 190 85" fill="none" stroke="#ff6a1a" stroke-width="3"/><path id="c2" d="M84 117 C140 117 140 85 190 85" fill="none" stroke="#ff6a1a" stroke-width="3"/><rect x="190" y="62" width="96" height="46" rx="8" fill="#ff6a1a"/><text x="238" y="91" text-anchor="middle" font-size="18" fill="#1a0a00" font-family="VT323">BUS A</text></svg>`;
      const L1 = $("#c1", box).getTotalLength(); return gsap.timeline().fromTo(["#c1", "#c2"], { strokeDasharray: L1, strokeDashoffset: L1 }, { strokeDashoffset: 0, duration: .8, ease: "power2.inOut" }).from($$("rect", box).at(-1), { scale: .6, transformOrigin: "50% 50%", opacity: 0, duration: .4, ease: "back.out(2)" }).call(() => Snd.blip(392, .2)); } }),
  producer: (w, api) => W.nbq(w, api, { prompt: "This is Lotus's side, not a student game. Pick a hidden student. The producer tries whichever instrument will reveal the most, and stops when sure.", names: { alloc: "Mixing desk", typed: "Take history", quad: "Four pads", claims: "Keep or drop", lots: "Find every note" }, colName: "Instrument", askLabel: "Try the best instrument" }),
  export: (w, api) => W.readback(w, api, { prompt: "Type the factorisation of <span class=\"m\">x² + 5x + 6</span>. Before export, the engineer reads it back and flags anything that would clip.", inputLabel: "Your input", readTitle: "The engineer hears", flagLabel: "CLIP", confirmLabel: "Export", fixLabel: "Take the engineer's fix", stampHTML: `<span class="export">EXPORTED ✓</span>` }),
};
App.init(SHEETS, GAMES, Progress, { prefix: "T-" });
