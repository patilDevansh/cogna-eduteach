// ===== Studio: progress = the thinking print, in one accent =====
const Progress = (() => {
  const c = $("#print"), ctx = c.getContext("2d"), D = Math.min(2, devicePixelRatio || 1), S = 260, ring = $("#ring"), C = 2 * Math.PI * 96;
  c.width = S * D; c.height = S * D; ctx.scale(D, D); ring.setAttribute("stroke-dasharray", C); ring.setAttribute("stroke-dashoffset", C);
  const REG = { PAIR: 0, SQUARES: 1, SIGNS: 2, CHECK: 3, GROUP: 4 }, seed = Math.random() * 99; let parts = [], run = false, total = 0;
  const f = (x, y) => Math.sin(x * .016 + seed) * 1.8 + Math.cos(y * .015 - seed) * 1.8;
  function step() { for (let n = 0; n < 2; n++) for (const p of parts) { const a = f(p.x, p.y) + p.t, nx = p.x + Math.cos(a) * p.v, ny = p.y + Math.sin(a) * p.v; if (Math.hypot(nx - S / 2, ny - S / 2) > S / 2 - 3) { p.l = 0; continue; } ctx.strokeStyle = p.c; ctx.globalAlpha = p.al; ctx.lineWidth = p.w; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke(); p.x = nx; p.y = ny; p.l--; } parts = parts.filter((p) => p.l > 0); }
  function frame() { step(); if (parts.length) requestAnimationFrame(frame); else run = false; }
  function add(skill, cert, strength = .7) {
    const col = css("--accent"), ang = REG[skill] * 1.26 + Math.random() * .7, n = Math.round(30 + 70 * strength);
    for (let i = 0; i < n; i++) { const r = 20 + Math.random() * 50; parts.push({ x: S / 2 + Math.cos(ang) * r * Math.random() + (Math.random() - .5) * 36, y: S / 2 + Math.sin(ang) * r * Math.random() + (Math.random() - .5) * 36, v: .9 + Math.random() * .7, t: (Math.random() - .5) * .6, l: 60 + Math.random() * 100, c: col, w: .6 + (1 - cert) * 3, al: .1 + cert * .4 }); }
    total = Math.min(1, total + (.03 + strength * .08) * (.35 + .65 * cert)); gsap.to(ring, { attr: { "stroke-dashoffset": C * (1 - total) }, duration: 1.2, ease: "power3.out" });
    if (RM) { while (parts.length) step(); } else if (!run) { run = true; requestAnimationFrame(frame); }
  }
  return { add };
})();

const same = "The same mechanic with no theme: ";
const SHEETS = [
  { id: "tiles", title: "Tiles", was: "Build the rectangle", now: same + "slide the split and the tiles spring into place.", kept: "First split, order of splits, gaps vs spare pieces." },
  { id: "split", title: "Split your confidence", was: "Split your chips", now: same + "four dots shared across four answers.", kept: "The split: a 2–2 names the exact doubt." },
  { id: "tf", title: "True or false", was: "Swipe the claims", now: same + "eight cards, true / false / not sure.", kept: "Mistake families across 8 claims, plus time on each." },
  { id: "replay", title: "Stop the replay", was: "Stop the tape", now: same + "Sam's working plays; stop it at the error.", kept: "Which step they stop at, and how fast." },
  { id: "steps", title: "Order the steps", was: "Assemble the working", now: same + "three of six steps, in order.", kept: "Which slip step, the order, and swaps." },
  { id: "two", title: "Two numbers", was: "Crack the lock", now: same + "two numbers, with live product and sum bars.", kept: "The search path; the sign slip caught live." },
  { id: "test", title: "Test the claim", was: "Always, sometimes, never", now: same + "two bars for (x + 3)² and x² + 9 as x changes.", kept: "Which values they tested before deciding." },
  { id: "inside", title: "Look inside", was: "X-ray the answer", now: same + "the answer, then the two moves beneath it.", kept: "Two slips that cancel, exposed." },
  { id: "four", title: "Four sign cases", was: "Sign quadrant", now: same + "four cases, matched against known rules.", kept: "The pattern across four sign cases." },
  { id: "commit", title: "Commit, then choose", was: "Predict, then pick", now: same + "commit a guess before the options appear.", kept: "Guess vs pick: checking or factorising." },
  { id: "rapid", title: "Rapid set", was: "The switch-up", now: same + "four quick ones; the last is a look-alike.", kept: "Autopilot vs noticing the switch." },
  { id: "edits", title: "Edit history", was: "Typing replay", now: same + "your typing replayed with deleted drafts.", kept: "Discarded drafts matched to known mistakes." },
  { id: "every", title: "Find every b", was: "Find them all", now: same + "pick every b on a number line.", kept: "Completeness, order, missing negatives." },
  { id: "chunk", title: "Chunk it", was: "See the structure", now: same + "treat (x + 3) as one chunk.", kept: "The route chosen, plus 99² − 1." },
  { id: "next", title: "What Lotus asks next", was: "Next best question", now: same + "Lotus picks the most revealing next game.", kept: "Lotus's side, not a student game." },
  { id: "confirm", title: "Confirm your input", was: "Check what we read", now: same + "see exactly what was read before marking.", kept: "Typing problems kept apart from maths." },
];
const GAMES = {
  tiles: (w, api) => W.tiles(w, api, { prompt: "Make one rectangle with area <span class=\"m\">x² + 5x + 6</span>. How many strips go down the side?", controlLabel: "Strips down the side", commitLabel: "Lock it in", rx: 12, ease: "elastic.out(1,.75)", dur: .9 }),
  split: (w, api) => W.allocate(w, api, { prompt: "Which is the same as this? Share four dots: all on one if you're sure, split them if you're torn.", token: `<span class="tokdot"></span>`, noun: "dots", trayLabel: "Your dots", doneLabel: "Lock it in", verbPlace: "Dot", item: (o) => `<span class="g-anchor" style="height:30px"></span><span class="m" style="font-size:1.05rem">${o.t}</span>` }),
  tf: (w, api) => W.judge(w, api, { prompt: "True or false? Or not sure. Eight quick cards.", card: (c, i, n) => `<div class="cardx"><span class="num">${i + 1} / ${n}</span><span class="m">${c}</span><span class="g-mark"></span></div>`, buttons: [{ v: "false", label: "False" }, { v: "null", label: "Not sure" }, { v: "true", label: "True" }], exit: (v) => ({ x: v === null ? 0 : v ? 300 : -300, y: v === null ? 200 : 20, rotation: v === null ? 0 : v ? 18 : -18, opacity: 0 }), enter: { scale: .92, opacity: 0, duration: .35, ease: "back.out(2)" }, doneText: "All eight done" }),
  replay: (w, api) => W.replay(w, api, { prompt: "Sam checks <span class=\"m\">x² − x − 6</span> by expanding. Stop the replay at the first mistake.", playLabel: "Play", stopLabel: "Stop", fineLabel: "Looks right", cursor: true }),
  steps: (w, api) => W.order(w, api, { prompt: "Factorise <span class=\"m\">6xy − 4y − 9x + 6</span> by grouping. Tap three steps into order. Three of the six contain a slip.", slotLabels: ["Step 1", "Step 2", "Step 3"], poolLabel: "Steps", doneLabel: "Lock it in" }),
  two: (w, api) => W.dials(w, api, { prompt: "Find two numbers that multiply to −12 and add to −1, for <span class=\"m\">x² − x − 12</span>.", labels: { p: "First", q: "Second" }, logTitle: "Your search",
    visual(box, p, q, solved, first) {
      if (first || !$("svg", box)) box.innerHTML = `<svg viewBox="0 0 320 210"><text x="20" y="40" font-size="13" fill="var(--muted)" font-family="Geist Mono">multiply → −12</text><rect x="20" y="52" width="280" height="22" rx="11" fill="var(--panel2)"/><rect id="bp" x="160" y="52" width="0" height="22" rx="11" fill="var(--accent)"/><line x1="${160 - 12 * 2.2}" y1="46" x2="${160 - 12 * 2.2}" y2="80" stroke="var(--ok)" stroke-width="2"/><text x="20" y="120" font-size="13" fill="var(--muted)" font-family="Geist Mono">add → −1</text><rect x="20" y="132" width="280" height="22" rx="11" fill="var(--panel2)"/><rect id="bs" x="160" y="132" width="0" height="22" rx="11" fill="var(--accent)"/><line x1="${160 - 1 * 6}" y1="126" x2="${160 - 1 * 6}" y2="160" stroke="var(--ok)" stroke-width="2"/><text id="big2" x="160" y="196" text-anchor="middle" font-size="18" fill="var(--ink)" font-family="Geist Mono"></text></svg>`;
      const bar = (id, v, k) => { const wv = Math.min(140, Math.abs(v) * k); gsap.to($(id, box), { attr: { x: v < 0 ? 160 - wv : 160, width: wv }, duration: RM ? 0 : .6, ease: "elastic.out(1,.6)" }); };
      bar("#bp", p * q, 2.2); bar("#bs", p + q, 6); $("#big2", box).textContent = solved ? "(x − 4)(x + 3)" : `${sgn(p)} × ${sgn(q)} = ${sgn(p * q)}   ${sgn(p)} + ${sgn(q)} = ${sgn(p + q)}`;
    } }),
  test: (w, api) => W.compare(w, api, { prompt: "Is <span class=\"m\">(x + 3)² = x² + 9</span> true? Test some values of x, then decide.", min: -6, max: 6, verdicts: [{ v: "always", label: "Always true" }, { v: "sometimes", label: "Sometimes true" }, { v: "never", label: "Never true" }], signLabel: "Lock it in",
    visual(box, x, A, B, first) {
      if (first || !$("svg", box)) box.innerHTML = `<svg viewBox="0 0 600 240"><text x="150" y="226" text-anchor="middle" font-size="15" fill="var(--soft)" font-family="Geist Mono">(x + 3)²</text><text x="450" y="226" text-anchor="middle" font-size="15" fill="var(--soft)" font-family="Geist Mono">x² + 9</text><rect id="ba" x="100" y="200" width="100" height="0" rx="12" fill="var(--accent)"/><rect id="bb" x="400" y="200" width="100" height="0" rx="12" fill="var(--t-bar)"/><text id="ta" x="150" y="190" text-anchor="middle" font-size="22" fill="var(--ink)" font-family="Geist Mono"></text><text id="tb" x="450" y="190" text-anchor="middle" font-size="22" fill="var(--ink)" font-family="Geist Mono"></text><text id="rel" x="300" y="120" text-anchor="middle" font-size="54" fill="var(--ok)" font-family="Geist Mono">=</text></svg>`;
      const h = (v) => Math.max(4, (v / 81) * 160);
      gsap.to($("#ba", box), { attr: { height: h(A), y: 200 - h(A) }, duration: RM ? 0 : .7, ease: "elastic.out(1,.55)" }); gsap.to($("#bb", box), { attr: { height: h(B), y: 200 - h(B) }, duration: RM ? 0 : .7, ease: "elastic.out(1,.55)" });
      gsap.to($("#ta", box), { attr: { y: 190 - h(A) }, duration: .5 }); gsap.to($("#tb", box), { attr: { y: 190 - h(B) }, duration: .5 }); $("#ta", box).textContent = A; $("#tb", box).textContent = B;
      const rel = $("#rel", box); rel.textContent = A === B ? "=" : "≠"; rel.setAttribute("fill", A === B ? css("--ok") : css("--bad"));
    } }),
  inside: (w, api) => W.twoMoves(w, api, { prompt: "Factorise <span class=\"m\">x² − x − 6</span> in two moves, then look inside the answer.", performLabel: "Show the answer", revealLabel: "Look inside",
    empty: (box) => (box.innerHTML = `<p style="text-align:center;color:var(--muted);padding:40px 0">The answer appears here.</p>`),
    surface: (box, r) => { box.innerHTML = `<div style="display:grid;place-items:center;padding:30px 0"><span class="m" style="font-size:2.2rem;color:var(--accent)">(x ${pm(r.b1)})(x ${pm(r.b2)})</span></div>`; if (!RM) gsap.from($(".m", box), { yPercent: 60, opacity: 0, duration: .6, ease: "power4.out" }); },
    reveal: (box, r) => W.layerCards(box, r) }),
  four: (w, api) => W.quad(w, api, { prompt: "The numbers are always 2 and 3. Choose the signs for each case.", names: ["Case 1", "Case 2", "Case 3", "Case 4"], checkLabel: "See the pattern", rulesTitle: "Rules students use", onLit: (card) => !RM && gsap.fromTo(card, { scale: .97 }, { scale: 1, duration: .5, ease: "elastic.out(1,.5)" }) }),
  commit: (w, api) => W.predict(w, api, { prompt: "Factorise <span class=\"m\">x² + 2x − 15</span>. Commit your answer first; the options appear after.", guessLabel: "Your answer:", commitLabel: "Commit", coverText: "The options appear after you commit.", peekLabel: "Watch how options get checked" }),
  rapid: (w, api) => W.rows(w, api, { prompt: "Four quick ones. Factorise each, or say it can't be done.", rowLabel: (i) => `${i + 1} of 4`, enter: { y: 16, opacity: 0, duration: .4, ease: "back.out(2)" } }),
  edits: (w, api) => W.typed(w, api, { prompt: "Type the factorisation of <span class=\"m\">x² + 3x − 10</span> (use - for minus). Your edit history replays when you submit.", submitLabel: "Submit", outTitle: "Edit history", draftWord: "draft", samplesLabel: "Or replay a sample student" }),
  every: (w, api) => W.findAll(w, api, { prompt: "<span class=\"m\">x² + bx + 12</span> factorises into two brackets with whole numbers. Pick <b>every</b> b that works.", doneLabel: "That's all of them", marker: (n) => `<circle cy="-18" r="10" fill="var(--accent)"/><text y="-14" text-anchor="middle" font-size="10" fill="var(--accent-ink)" font-family="Geist Mono">${n}</text>`,
    resultArt: (v, p, q, hit) => { const B = 36, k = 2, ww = Math.max(3, B + p * k), hh = Math.max(3, B + q * k); return `<svg viewBox="0 0 80 80"><rect x="10" y="10" width="${B}" height="${B}" rx="4" fill="none" stroke="var(--line)" stroke-dasharray="3 3"/><rect x="10" y="10" width="${ww}" height="${hh}" rx="4" fill="${hit ? "var(--accent)" : "none"}" fill-opacity=".25" stroke="${hit ? "var(--accent)" : "var(--bad)"}" stroke-width="2" ${hit ? "" : 'stroke-dasharray="4 3"'}/></svg>`; } }),
  chunk: (w, api) => W.module(w, api, { prompt: "Factorise this. What's your first move?", routes: { block: "Treat (x + 3) as one chunk", expand: "Expand the bracket first", root: "Square-root each part" },
    idle: (box) => (box.innerHTML = `<p style="color:var(--muted)">A picture of the chunk appears here.</p>`),
    blockVisual(box) { box.innerHTML = `<svg viewBox="0 0 300 260"><rect id="r1" x="30" y="30" width="180" height="116" rx="8" fill="var(--accent)" fill-opacity=".25" stroke="var(--accent)" stroke-width="2"/><rect id="r2" x="30" y="146" width="116" height="64" rx="8" fill="var(--accent)" fill-opacity=".12" stroke="var(--accent)" stroke-width="2"/><rect x="146" y="146" width="64" height="64" rx="8" fill="none" stroke="var(--bad)" stroke-dasharray="4 3"/><text x="120" y="22" text-anchor="middle" font-size="14" fill="var(--ink)" font-family="Geist Mono" id="la">A</text><text x="178" y="234" text-anchor="middle" font-size="12" fill="var(--bad)" font-family="Geist Mono">4 × 4 removed</text></svg>`;
      return gsap.timeline().from(box.querySelectorAll("rect"), { opacity: 0, stagger: .1, duration: .4 }).to($("#r2", box), { attr: { x: 210, y: 30, width: 64, height: 116 }, duration: 1, ease: "elastic.out(1,.7)" }, "+=.3").call(() => ($("#la", box).textContent = "A + 4  by  A − 4")); } }),
  next: (w, api) => W.nbq(w, api, { prompt: "This is Lotus's side, not a student game. Pick a hidden student and watch Lotus choose the most revealing next game.", names: { alloc: "Split your confidence", typed: "Edit history", quad: "Four sign cases", claims: "True or false", lots: "Find every b" }, colName: "Game", askLabel: "Ask the best next game" }),
  confirm: (w, api) => W.readback(w, api, { prompt: "Type the factorisation of <span class=\"m\">x² + 5x + 6</span>. Before marking, you see exactly what was read.", inputLabel: "What you typed", readTitle: "What Lotus read", flagLabel: "CHECK", confirmLabel: "That's what I meant", fixLabel: "Use the suggestion", stampHTML: `<span class="okpill">Confirmed</span>` }),
};
App.init(SHEETS, GAMES, Progress, { prefix: "" });
