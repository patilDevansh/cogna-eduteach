// ===== A-01 Floor plan =====
GAMES.plan = { mount(w, api) {
  w.innerHTML = `<p class="q">Draw one rectangular room with area <span class="m">x² + 5x + 6</span>. How many strips go along the east wall?</p>
    <svg viewBox="0 0 560 400" id="plan" aria-label="Floor plan" style="width:100%;height:auto"></svg>
    <div class="row"><span class="label">East-wall strips</span><div class="seg" id="seg">${[0, 1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === 0}">${n}</button>`).join("")}</div><button class="btn solid" id="ink" type="button" disabled>Ink the drawing</button></div>`;
  const plan = $("#plan", w), X = 130, U = 32, OX = 80, OY = 70;
  plan.innerHTML = `<defs><pattern id="h1" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(244,248,255,.28)" stroke-width="1.2"/></pattern><pattern id="h2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(244,248,255,.18)"/></pattern><pattern id="h3" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0 L6 6 M6 0 L0 6" stroke="rgba(255,209,102,.45)"/></pattern></defs>
    <text x="470" y="40" font-size="13" fill="${FAINT}" text-anchor="middle">margin</text><line x1="430" y1="50" x2="430" y2="380" stroke="${FAINT}" stroke-dasharray="4 6"/><g id="holes"></g>
    <g transform="translate(500 340)"><circle r="16" fill="none" stroke="${W}" stroke-width="1.2"/><path d="M0 -14 L5 4 L0 0 L-5 4Z" fill="${W}"/><text y="-22" text-anchor="middle" font-size="12" fill="${W}">N</text></g>`;
  el("rect", { x: OX, y: OY, width: X, height: X, fill: "url(#h1)", stroke: W, "stroke-width": 2 }, plan);
  el("text", { x: OX + X / 2, y: OY + X / 2 + 6, "text-anchor": "middle", "font-size": 22, fill: W }, plan).textContent = "x²";
  const strips = Array.from({ length: 5 }, () => el("rect", { x: OX, y: OY + X, width: X, height: U, fill: "url(#h2)", stroke: W, "stroke-width": 1.5 }, plan));
  const pool = (k) => ({ x: 446 + (k % 2) * 38, y: 70 + Math.floor(k / 2) * 38 });
  const units = Array.from({ length: 6 }, (_, k) => el("rect", { ...pool(k), width: U, height: U, fill: "url(#h3)", stroke: "#ffd166", "stroke-width": 1.5 }, plan));
  const dims = el("g", { opacity: 0, fill: W, stroke: W }, plan);
  let cur = 0; const tries = [];
  function lay(a, instant) {
    const b = 5 - a, d = instant || RM ? 0 : 1;
    strips.forEach((s, k) => gsap.to(s, { attr: k < a ? { x: OX + X + k * U, y: OY, width: U, height: X } : { x: OX, y: OY + X + (k - a) * U, width: X, height: U }, duration: .6 * d, delay: k * .05 * d, ease: "power3.inOut" }));
    const cells = []; for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) cells.push({ x: OX + X + i * U, y: OY + X + j * U });
    units.forEach((u, k) => gsap.to(u, { attr: k < cells.length ? cells[k] : pool(k - cells.length), duration: .55 * d, delay: (.3 + k * .05) * d, ease: "power3.inOut" }));
    const holes = $("#holes", plan); holes.innerHTML = "";
    cells.slice(6).forEach((c) => el("rect", { x: c.x + 4, y: c.y + 4, width: U - 8, height: U - 8, fill: "none", stroke: "#ff7b66", "stroke-width": 1.5, "stroke-dasharray": "4 3" }, holes));
    gsap.to(dims, { opacity: 0, duration: .15 });
    if (a * b === 6) {
      const ww = X + a * U, h = X + b * U, t = (x, y) => `<path d="M${x - 5} ${y + 5} L${x + 5} ${y - 5}" stroke-width="1.6"/>`;
      dims.innerHTML = `<line x1="${OX}" y1="${OY - 24}" x2="${OX + ww}" y2="${OY - 24}"/>${t(OX, OY - 24)}${t(OX + ww, OY - 24)}<text x="${OX + ww / 2}" y="${OY - 32}" text-anchor="middle" font-size="20" stroke="none">x + ${a}</text>
        <line x1="${OX - 24}" y1="${OY}" x2="${OX - 24}" y2="${OY + h}"/>${t(OX - 24, OY)}${t(OX - 24, OY + h)}<text transform="translate(${OX - 32} ${OY + h / 2}) rotate(-90)" text-anchor="middle" font-size="20" stroke="none">x + ${b}</text>
        <text x="${OX + ww / 2}" y="${OY + h + 34}" text-anchor="middle" font-size="16" stroke="none">ROOM 01 · (x + ${a})(x + ${b})</text>`;
      gsap.to(dims, { opacity: 1, duration: .5, delay: d });
    }
  }
  $$("#seg button", w).forEach((b) => b.addEventListener("click", () => {
    const a = +b.dataset.n; if (a === cur) return; cur = a; lay(a); tries.push(a);
    $$("#seg button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const need = a * (5 - a); api.note(`Split ${a} | ${5 - a}: ${need === 6 ? "closes" : need > 6 ? `${need - 6} gap${need - 6 > 1 ? "s" : ""}` : `${6 - need} spare`}`, need === 6 ? "good" : "");
    $("#ink", w).disabled = false;
  }));
  $("#ink", w).addEventListener("click", () => {
    const fit = cur * (5 - cur) === 6, ordered = tries.every((t, k) => !k || Math.abs(t - tries[k - 1]) === 1);
    api.noticed(fit ? (tries.length === 1 ? "<b>Closed on the first split.</b> Fluent with product and sum." : `<b>Closed in ${tries.length} splits</b>, ${ordered ? "stepping one at a time: a systematic search" : "jumping around: the corner isn't linked to the 6 yet"}.`) : "<b>Inked a room that doesn't close.</b> The corner and the 6 aren't linked yet.");
    api.learn("PAIR", tries.length <= 1 ? .95 : ordered ? .75 : .4); $("#ink", w).disabled = true;
  });
  lay(0, true);
  return () => gsap.killTweensOf([...strips, ...units, dims]);
} };

// ===== A-02 Pin the drawings =====
GAMES.pins = { mount(w, api) {
  const OPTS = [{ t: "(x − 3)(x − 1)", p: -3, q: -1, k: "ps", name: "product and sum swapped" }, { t: "(x − 1)(x + 4)", p: -1, q: 4, k: "right", name: "the right drawing" }, { t: "(x − 2)(x + 2)", p: -2, q: 2, k: "po", name: "right product, wrong sum" }, { t: "(x − 4)(x + 1)", p: -4, q: 1, k: "sw", name: "right numbers, signs flipped" }];
  const PAIRS = { "right|sw": "the signs inside the brackets", "po|right": "whether the numbers must also add to 3", "ps|right": "which number is the product and which the sum", "po|sw": "both the sum and the signs", "ps|sw": "the product–sum rule itself", "po|ps": "the product–sum rule itself" };
  const sketch = (p, q) => { const ww = 70 + p * 9, hh = 70 + q * 9; return `<svg viewBox="0 0 150 130"><rect x="32" y="22" width="70" height="70" fill="none" stroke="${FAINT}" stroke-dasharray="3 3"/><rect x="32" y="22" width="${ww}" height="${hh}" fill="rgba(244,248,255,.07)" stroke="${W}" stroke-width="1.5"/><text x="${32 + ww / 2}" y="16" text-anchor="middle" font-size="13" fill="${W}">x ${pm(p)}</text><text transform="translate(24 ${22 + hh / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${W}">x ${pm(q)}</text></svg>`; };
  w.innerHTML = `<p class="q">Which tracing sheet shows a room of area <span class="m">x² + 3x − 4</span>? You have four pushpins. Pin all four on one sheet if you're sure, or split them if you're torn.</p>
    <div class="pinwrap" id="pw"><div class="tsheets">${OPTS.map((o, i) => `<button class="tsheet" type="button" data-i="${i}" style="--r:${[-1.5, 1, -.5, 1.8][i]}deg">${sketch(o.p, o.q)}<span class="m">${o.t}</span><span class="cnt"></span></button>`).join("")}</div>
      <div class="tray"><span>Pins</span>${"<i></i>".repeat(4)}</div><div class="pins"></div></div>
    <div class="row"><button class="btn solid" id="lock" type="button" disabled>Done pinning</button><span class="label" id="left">4 pins left</span></div>`;
  const pw = $("#pw", w), layer = $(".pins", w), sheets = $$(".tsheet", w), spots = $$(".tray i", w);
  const PIN = `<svg viewBox="0 0 26 34" width="26" height="34"><line x1="13" y1="16" x2="13" y2="33" stroke="#c9d6ea" stroke-width="2"/><circle cx="13" cy="11" r="10" fill="#ff7b66" stroke="#f4f8ff" stroke-width="1.5"/><circle cx="10" cy="8" r="3" fill="#ffd1c7"/></svg>`;
  const pins = Array.from({ length: 4 }, () => ({ at: -1, x: 0, y: 0, el: html(`<button class="pin" type="button" aria-label="pushpin">${PIN}</button>`) }));
  pins.forEach((p) => layer.appendChild(p.el));
  const rel = (e) => { const a = e.getBoundingClientRect(), b = pw.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; };
  const OFF = [[-22, -18], [18, -14], [-8, 10], [22, 16]];
  const target = (p) => { if (p.at < 0) { const r = rel(spots[pins.filter((d) => d.at < 0).indexOf(p)]); return { x: r.x, y: r.y + 14 }; } const s = rel($("svg", sheets[p.at])), k = pins.filter((d) => d.at === p.at).indexOf(p); return { x: s.x + OFF[k][0], y: s.y + OFF[k][1] }; };
  function place(p, instant) {
    const to = target(p); if (p.tw) p.tw.kill();
    if (instant || RM) { p.x = to.x; p.y = to.y; return gsap.set(p.el, { x: to.x, y: to.y, scale: 1 }); }
    p.tw = gsap.timeline().to(p.el, { x: to.x, y: to.y - 40, scale: 1.5, duration: .45, ease: "power2.out" }).to(p.el, { y: to.y, scale: 1, duration: .25, ease: "power4.in" });
    p.x = to.x; p.y = to.y;
  }
  const layout = (i) => pins.forEach((p) => place(p, i));
  function refresh() {
    const n = OPTS.map((_, i) => pins.filter((p) => p.at === i).length), placed = n.reduce((a, b) => a + b, 0);
    sheets.forEach((s, i) => ($(".cnt", s).textContent = n[i] ? `${n[i]} pin${n[i] > 1 ? "s" : ""}` : ""));
    $("#lock", w).disabled = placed < 4; $("#left", w).textContent = placed < 4 ? `${4 - placed} pin${4 - placed > 1 ? "s" : ""} left` : "All pinned";
    return n;
  }
  sheets.forEach((s, i) => s.addEventListener("click", () => { const p = pins.find((d) => d.at < 0); if (!p) return; p.at = i; api.note(`Pinned ${OPTS[i].t}`); layout(); refresh(); }));
  pins.forEach((p) => p.el.addEventListener("click", (e) => { e.stopPropagation(); if (p.at < 0) return; api.note(`Pulled a pin from ${OPTS[p.at].t}`, "warn"); p.at = -1; layout(); refresh(); }));
  $("#lock", w).addEventListener("click", () => {
    const n = refresh(), order = n.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), [[n1, i1], [, i2]] = order, shape = order.map(([v]) => v).filter(Boolean).join("–");
    let t;
    if (n1 === 4) t = OPTS[i1].k === "right" ? "<b>All four pins on the right sheet.</b> Confident and correct." : `<b>All four pins on “${OPTS[i1].name}”.</b> Confident, so this is a misconception, not a guess.`;
    else if (shape === "2–2") t = `<b>Pinned 2–2.</b> The two sheets differ only in <b>${PAIRS[[OPTS[i1].k, OPTS[i2].k].sort().join("|")]}</b>. That's exactly the doubt.`;
    else if (shape === "3–1") t = `<b>Mostly “${OPTS[i1].name}”</b>, one pin of doubt on “${OPTS[i2].name}”.`;
    else if (shape === "1–1–1–1") t = "<b>One pin per sheet.</b> Doesn't know yet, which is not a misconception.";
    else t = `<b>Leans “${OPTS[i1].name}”</b>, but unsure.`;
    api.noticed(t); api.learn("PAIR", shape === "4" ? .95 : shape === "3–1" ? .7 : shape === "2–2" ? .55 : .2);
  });
  requestAnimationFrame(() => layout(true));
  const onR = () => layout(true); addEventListener("resize", onR);
  return () => removeEventListener("resize", onR);
} };

// ===== A-03 Submittal review =====
GAMES.submittal = { mount(w, api) {
  const CARDS = [{ c: "x² − 9 = (x − 3)(x + 3)", truth: true }, { c: "(x + 5)² = x² + 25", truth: false }, { c: "x² + 2x − 8 = (x − 4)(x + 2)", truth: false }, { c: "(x + 2)² = x² + 4x + 4", truth: true }, { c: "x² + 9 = (x + 3)(x + 3)", truth: false }, { c: "x² − 2x − 8 = (x − 4)(x + 2)", truth: true }, { c: "(x − 4)² = x² − 16", truth: false }, { c: "x² − 6x + 9 = (x − 3)²", truth: true }];
  const FAMS = { SPREAD: { name: "Squares a bracket term by term: (a + b)² = a² + b²", idx: [1, 3, 6], skill: "SQUARES" }, SIGN: { name: "Flips the signs into the brackets", idx: [2, 5], skill: "SIGNS" }, SUMSQ: { name: "Thinks x² + 9 factorises", idx: [4], skill: "SQUARES" }, DS: { name: "Control claims", idx: [0, 7], skill: "SQUARES" } };
  const STAMP = { true: ["Approved", "#7cf2c9"], false: ["Rejected", "#ff7b66"], null: ["Revise & resubmit", "#ffd166"] };
  w.innerHTML = `<p class="q">Eight claims have come in for review. Stamp each one: <b>Approved</b> if it's always true, <b>Rejected</b> if it isn't, <b>Revise & resubmit</b> if you're not sure.</p>
    <div class="subwrap"><div style="display:grid;gap:10px"><div class="subdesk" id="desk"></div><div class="stamps"><button class="btn" data-v="true" type="button" style="border-color:#7cf2c9;color:#7cf2c9">Approved</button><button class="btn" data-v="false" type="button" style="border-color:#ff7b66;color:#ff7b66">Rejected</button><button class="btn" data-v="null" type="button" style="border-color:#ffd166;color:#ffd166">Revise & resubmit</button></div></div>
      <div class="reviewed" id="rev"><span class="label">Review log</span></div></div>
    <div class="fams" id="fams"></div>`;
  const desk = $("#desk", w), answers = [], times = []; let i = 0, shown = 0, busy = false, form = null;
  function deal() {
    if (i >= CARDS.length) return finish();
    form = html(`<div class="form"><header><span>Submittal ${String(i + 1).padStart(2, "0")} / 08</span><span>For review</span></header><div class="claim">${CARDS[i].c}</div><div class="fields"><span>Project: factorisation</span><span>Spec section: 08</span></div><span class="stampmark"></span></div>`);
    desk.appendChild(form); if (!RM) gsap.from(form, { y: -40, rotation: -3, opacity: 0, duration: .45, ease: "power3.out" });
    shown = performance.now() + 450;
  }
  function decide(v) {
    if (busy || !form) return; busy = true;
    const t = Math.max(.2, (performance.now() - shown) / 1000); answers[i] = v; times[i] = t;
    const [label, col] = STAMP[String(v)], f = form, mark = $(".stampmark", f);
    mark.textContent = label; mark.style.color = mark.style.borderColor = col;
    api.note(`Submittal ${i + 1}: ${label.toLowerCase()} after ${t.toFixed(1)}s`);
    $("#rev", w).insertAdjacentHTML("beforeend", `<span style="--c:${col}">${String(i + 1).padStart(2, "0")} · ${label}</span>`);
    const tl = gsap.timeline({ onComplete: () => f.remove() });
    tl.fromTo(mark, { opacity: 0, scale: 2.2 }, { opacity: .9, scale: 1, duration: RM ? 0 : .22, ease: "power4.in" }).to(f, { x: 30, y: 12, rotation: 4, opacity: 0, duration: RM ? 0 : .4, delay: .35 });
    setTimeout(() => { i++; busy = false; deal(); }, RM ? 50 : 900);
  }
  function finish() {
    form = null; desk.innerHTML = `<div class="form" style="place-content:center"><div class="claim" style="font-family:var(--hand)">All submittals reviewed</div></div>`;
    const med = [...times].sort((a, b) => a - b)[4];
    $("#fams", w).innerHTML = Object.entries(FAMS).map(([key, f]) => {
      const hits = f.idx.map((k) => answers[k] === null ? "uns" : answers[k] === CARDS[k].truth ? "ok" : "hit"), nh = hits.filter((h) => h === "hit").length, n = f.idx.length;
      const v = key === "DS" ? (nh ? "Missed a control claim, so read the rest with care." : "Both controls right, so the rest isn't random.") : nh === n && n >= 2 ? `Consistent: all ${n} claims match this mistake.` : nh === n ? "One claim points to this. Worth a second look." : nh ? `Matches ${nh} of ${n}. Could be a slip.` : hits.includes("uns") ? "Sent back for revision: doesn't know yet." : "No sign of it.";
      api.learn(f.skill, hits.includes("uns") ? .25 : .75);
      return `<div class="fam"><span>${f.name}</span><span class="dots">${hits.map((h) => `<i class="${h}"></i>`).join("")}</span><p>${v}</p></div>`;
    }).join("");
    const slow = times.map((t, k) => [t, k]).filter(([t]) => t > med * 1.8).map(([, k]) => `submittal ${k + 1}`);
    api.noticed(`Eight claims, grouped by the mistake they test. ${slow.length ? `Took much longer on ${slow.join(", ")}.` : "Steady pace throughout."}`);
  }
  $$(".stamps button", w).forEach((b) => b.addEventListener("click", () => decide(b.dataset.v === "null" ? null : b.dataset.v === "true")));
  deal();
  return () => {};
} };

// ===== A-04 Plotter check =====
GAMES.plotter = { mount(w, api) {
  w.innerHTML = `<p class="q">The pen plotter is drawing Sam's check of <span class="m">x² − x − 6</span>. Press <b>STOP PLOT</b> the moment the drawing goes wrong.</p>
    <div class="plot"><svg viewBox="0 0 600 270" id="ps"></svg></div>
    <div class="scrub"><button class="btn" id="pp" type="button" aria-label="Start or pause the plotter">▶</button><input type="range" id="sc" min="0" max="1000" value="0" aria-label="Scrub the plot"></div>
    <div class="marks" id="mk"></div>
    <div class="row"><button class="btn red" id="stop" type="button">Stop plot</button><button class="btn" id="fine" type="button" disabled>Plot looks right</button></div>`;
  const svg = $("#ps", w);
  svg.innerHTML = `<rect x="10" y="10" width="580" height="250" fill="rgba(244,248,255,.03)" stroke="${FAINT}"/><line x1="10" y1="40" x2="590" y2="40" stroke="${FAINT}" stroke-dasharray="2 4"/>
    <text x="300" y="98" text-anchor="middle" font-size="30" fill="${W}">(x − 3)(x + 2)</text><text id="stepl" x="580" y="30" text-anchor="end" font-size="13" fill="rgba(244,248,255,.6)" font-family="Architects Daughter"></text>
    <g id="carr"><rect x="10" y="34" width="580" height="4" fill="${FAINT}"/></g><g id="pen"><rect x="-7" y="30" width="14" height="10" fill="${W}"/><line x1="0" y1="40" x2="0" y2="140" stroke="${W}" stroke-width="1"/><circle cx="0" cy="140" r="3.5" fill="#ffd166"/></g>`;
  const TERMS = [{ s: "=", x: 90, y: 165, lab: null }, { s: "x²", x: 140, y: 165, lab: "A · x × x" }, { s: "+ 2x", x: 215, y: 165, lab: "B · x × (+2)" }, { s: "− 3x", x: 315, y: 165, lab: "C · (−3) × x" }, { s: "+ 6", x: 415, y: 165, lab: "D · (−3) × (+2)" }, { s: "= x² − x + 6", x: 140, y: 225, lab: "E · collect like terms" }, { s: "✓", x: 400, y: 225, lab: "F · Sam's answer" }];
  const defs = el("defs", {}, svg);
  const items = TERMS.map((t, k) => {
    const cp = el("clipPath", { id: `cp${k}` }, defs), r = el("rect", { x: t.x - 4, y: t.y - 34, width: 0, height: 46 }, cp);
    const tx = el("text", { x: t.x, y: t.y, "font-size": 30, fill: k === 6 ? "#7cf2c9" : W, "clip-path": `url(#cp${k})` }, svg); tx.textContent = t.s;
    return { r, tx, w: tx.getBBox().width + 8, ...t };
  });
  const pen = $("#pen", svg);
  gsap.set(pen, { x: 60, y: 0 });
  const tl = gsap.timeline({ paused: true, onUpdate: () => ($("#sc", w).value = Math.round(tl.progress() * 1000)), onComplete: () => { $("#fine", w).disabled = false; $("#pp", w).textContent = "↺"; } });
  const steps = []; let t = .3;
  items.forEach((it, k) => {
    if (it.lab) { steps.push({ label: it.lab[0], text: it.lab.slice(4), t }); tl.set($("#stepl", svg), { textContent: `Step ${it.lab}` }, t); }
    tl.to(pen, { x: it.x, y: it.y - 140 + 4, duration: .5, ease: "power2.inOut" }, t)
      .to(it.r, { attr: { width: it.w }, duration: k === 5 ? 1.4 : .9, ease: "none" }, t + .5)
      .to(pen, { x: it.x + it.w, duration: k === 5 ? 1.4 : .9, ease: "none" }, t + .5);
    t += k === 5 ? 2.3 : 1.8;
  });
  tl.to(pen, { x: 540, y: -90, duration: .6 }, t);
  const D = tl.duration();
  $("#mk", w).innerHTML = steps.map((s) => `<span style="left:${(s.t / D) * 100}%">${s.label}</span>`).join("");
  const stepAt = (x) => [...steps].reverse().find((s) => x >= s.t) ?? steps[0], dStart = steps.find((s) => s.label === "D").t;
  $("#pp", w).addEventListener("click", () => { if (tl.progress() >= 1) { tl.restart(); api.note("Re-plotted"); } else if (tl.paused() || !tl.isActive()) { tl.play(); api.note(tl.time() < .1 ? "Started the plot" : "Resumed"); } else { tl.pause(); api.note(`Paused at ${tl.time().toFixed(1)}s`); } $("#pp", w).textContent = tl.paused() ? "▶" : "❚❚"; });
  $("#sc", w).addEventListener("input", (e) => { tl.pause(); tl.progress(e.target.value / 1000); $("#pp", w).textContent = "▶"; });
  $("#stop", w).addEventListener("click", () => {
    tl.pause(); $("#pp", w).textContent = "▶";
    const x = tl.time(), s = stepAt(x), late = x - (dStart + .5); let r, c = .8;
    if (s.label === "D") r = `<b>Stopped the plot in step D</b>, ${Math.max(0, late).toFixed(1)}s after −3 × +2 was drawn as +6. ${late < 1.2 ? "Fast: fluent." : "Got there, after a moment."}`;
    else if (s.label === "E" || s.label === "F") { r = s.label === "E" && late < 2.8 ? `<b>Probably meant step D</b>, a little late (${late.toFixed(1)}s).` : `<b>Stopped at step ${s.label}</b> (${s.text}), not at D. Missed the sign error.`; c = .55; }
    else { r = `<b>False alarm at step ${s.label}</b> (${s.text}). That step looks wrong to them, which is a gap of its own.`; c = .6; }
    api.noticed(r); api.note(`STOP at ${x.toFixed(1)}s, step ${s.label}`, s.label === "D" ? "good" : "warn"); api.learn("CHECK", c);
  });
  $("#fine", w).addEventListener("click", () => { api.noticed("<b>Signed off the plot.</b> Either they'd make Sam's sign slip themselves, or they don't check each part. One follow-up tells which."); api.note("Signed off a wrong plot", "warn"); api.learn("SIGNS", .75); });
  return () => tl.kill();
} };

// ===== A-05 Stack the floors =====
GAMES.floors = { mount(w, api) {
  const SLABS = [{ id: "L1", t: "(6xy − 4y) − (9x − 6)", ok: 0 }, { id: "D1", t: "(6xy − 4y) − (9x + 6)", bad: "kept the + inside after taking out −" }, { id: "L2", t: "2y(3x − 2) − 3(3x − 2)", ok: 1 }, { id: "D2", t: "2y(3x − 2) − 3(3x + 2)", bad: "didn't flip the sign when taking out −3" }, { id: "L3", t: "(3x − 2)(2y − 3)", ok: 2 }, { id: "D3", t: "(3x − 2)(2y + 3)", bad: "lost the minus in the last bracket" }];
  const order = [3, 0, 5, 2, 1, 4];
  w.innerHTML = `<p class="q">Factorise <span class="m">6xy − 4y − 9x + 6</span> by grouping. Lift three slabs into the building, ground floor first. Three slabs in the yard have a slip in them.</p>
    <div class="section"><div style="display:grid;gap:0"><div class="roof" id="roof"></div><div class="levels" id="lv">${[1, 2, 3].map((n) => `<div class="lvl" data-s="${n - 1}"><span>Level ${n}</span></div>`).join("")}</div></div>
      <div class="yard" id="yard"><span class="label">Laydown yard</span>${order.map((k) => `<button class="slab" type="button" data-id="${SLABS[k].id}"><span class="m">${SLABS[k].t}</span></button>`).join("")}</div></div>
    <div class="row"><button class="btn solid" id="top" type="button" disabled>Top out</button></div>`;
  const yard = $("#yard", w), lv = $$(".lvl", w), ever = new Set();
  w.addEventListener("click", (e) => {
    const s = e.target.closest(".slab"); if (!s || !w.contains(s)) return;
    const st = Flip.getState($$(".slab", w)), slab = SLABS.find((x) => x.id === s.dataset.id);
    if (s.parentElement.classList.contains("lvl")) { yard.appendChild(s); api.note(`Lowered ${slab.t}`, slab.bad ? "good" : "warn"); }
    else { const free = lv.find((l) => !$(".slab", l)); if (!free) return; free.appendChild(s); ever.add(slab.id); api.note(`Level ${+free.dataset.s + 1}: ${slab.t}`); }
    Flip.from(st, { duration: RM ? 0 : .6, ease: "power3.inOut", absolute: true, scale: true });
    $("#top", w).disabled = lv.some((l) => !$(".slab", l));
  });
  $("#top", w).addEventListener("click", () => {
    const ch = lv.map((l) => SLABS.find((x) => x.id === $(".slab", l).dataset.id)), slips = ch.filter((c) => c.bad), set = ch.every((c) => c.ok !== undefined), ord = set && ch.every((c, k) => c.ok === k);
    const fixed = [...ever].filter((id) => id.startsWith("D") && !ch.some((c) => c.id === id));
    gsap.to("#roof", { opacity: 1, y: 0, duration: RM ? 0 : .6, ease: "bounce.out", startAt: { y: -30 } });
    let t = ord ? "<b>Topped out: all three slabs right, in order.</b> As strong as typed working." : set ? "<b>Right slabs, wrong order.</b> Knows the moves, not the shape of the method." : `<b>${slips.length} slab${slips.length > 1 ? "s" : ""} with a slip:</b> ${slips.map((s) => s.bad).join("; ")}.`;
    if (fixed.length) t += ` They also swapped out ${fixed.length} slip slab${fixed.length > 1 ? "s" : ""} before topping out.`;
    api.noticed(t); api.learn("GROUP", ord ? .9 : .7);
  });
  return () => {};
} };

// ===== A-06 Set out the room =====
GAMES.setout = { mount(w, api) {
  const TP = -12, TS = -1, U = 12, B = 160;
  w.innerHTML = `<p class="q">Set out a room of area <span class="m">x² − x − 12</span>. Slide the two scale rules to set each side: x plus or minus something. The room redraws as you go.</p>
    <div class="setout">
      <div style="display:grid;gap:12px"><svg viewBox="0 0 420 330" id="room" style="width:100%;height:auto"></svg><div class="arearead"><small>This room's area</small><span id="area"></span></div></div>
      <div style="display:grid;gap:14px">
        ${["p", "q"].map((k) => `<div class="rule"><div class="rl"><span>${k === "p" ? "Width: x + p" : "Depth: x + q"}</span><b id="${k}v">+1</b></div><div class="scale" id="sc${k}"><span class="nums">${[-9, -6, -3, 0, 3, 6, 9].map((n) => `<span style="left:${((n + 9) / 18) * 100}%">${n}</span>`).join("")}</span><span class="cur" id="cur${k}" tabindex="0" role="slider" aria-valuemin="-9" aria-valuemax="9" aria-label="${k}"></span></div><div class="row"><button class="btn" type="button" data-k="${k}" data-d="-1">‹</button><button class="btn" type="button" data-k="${k}" data-d="1">›</button></div></div>`).join("")}
        <div><span class="label">Survey log</span><svg viewBox="0 0 300 180" id="log2" style="width:100%;height:auto"></svg></div>
      </div></div>`;
  const room = $("#room", w), log2 = $("#log2", w), st = { p: 1, q: 1 }, tries = []; let settle = null, solved = false;
  room.innerHTML = `<rect x="70" y="70" width="${B}" height="${B}" fill="none" stroke="${FAINT}" stroke-dasharray="4 4"/><text x="${70 + B / 2}" y="${70 + B / 2}" text-anchor="middle" font-size="14" fill="${FAINT}">x × x</text><rect id="rm" x="70" y="70" width="${B}" height="${B}" fill="rgba(244,248,255,.06)" stroke="${W}" stroke-width="2"/><text id="dw" x="0" y="54" text-anchor="middle" font-size="16" fill="${W}"></text><text id="dd" font-size="16" fill="${W}" text-anchor="middle"></text>`;
  const mx = (s) => 30 + ((s + 18) / 36) * 260, my = (p) => 95 - (Math.max(-40, Math.min(40, p)) / 40) * 80;
  log2.innerHTML = `<line x1="30" y1="95" x2="290" y2="95" stroke="${FAINT}"/><line x1="160" y1="10" x2="160" y2="180" stroke="${FAINT}"/><line x1="30" y1="${my(TP)}" x2="290" y2="${my(TP)}" stroke="#ff7b66" stroke-dasharray="4 4"/><text x="34" y="${my(TP) + 14}" font-size="11" fill="#ff7b66">every room whose last number is −12</text><text x="288" y="90" text-anchor="end" font-size="11" fill="${FAINT}">x-term →</text><circle cx="${mx(TS)}" cy="${my(TP)}" r="9" fill="none" stroke="#7cf2c9" stroke-width="2"/><polyline id="path" fill="none" stroke="#ffd166" stroke-width="1.6" points=""/><g id="dots"></g>`;
  const step = (k) => $(`#sc${k}`, w).clientWidth / 18;
  function draw() {
    const p = st.p, q = st.q, ww = B + p * U, hh = B + q * U;
    gsap.to($("#rm", room), { attr: { width: ww, height: hh }, duration: RM ? 0 : .5, ease: "power3.out" });
    const dw = $("#dw", room), dd = $("#dd", room);
    dw.textContent = `x ${pm(p)}`; gsap.to(dw, { attr: { x: 70 + ww / 2 }, duration: .5 });
    dd.textContent = `x ${pm(q)}`; gsap.to(dd, { attr: { transform: `translate(54 ${70 + hh / 2}) rotate(-90)` }, duration: 0 });
    $("#pv", w).textContent = (p > 0 ? "+" : "") + sgn(p); $("#qv", w).textContent = (q > 0 ? "+" : "") + sgn(q);
    $("#area", w).textContent = `x² ${pm(p + q).replace("+ 0", "")}${p + q ? "x" : ""} ${pm(p * q)}`.replace("+ 1x", "+ x").replace("− 1x", "− x").replace(/\s+/g, " ");
    ["p", "q"].forEach((k) => gsap.to(`#cur${k}`, { left: `${((st[k] + 9) / 18) * 100}%`, duration: .3 }));
    clearTimeout(settle); settle = setTimeout(record, 600);
  }
  function record() {
    if (solved) return; const p = st.p, q = st.q, last = tries.at(-1); if (last && last.p === p && last.q === q) return;
    tries.push({ p, q });
    $("#path", log2).setAttribute("points", tries.map((t) => `${mx(t.p + t.q)},${my(t.p * t.q)}`).join(" "));
    const d = el("circle", { cx: mx(p + q), cy: my(p * q), r: 4, fill: "#ffd166" }, $("#dots", log2)); if (!RM) gsap.from(d, { attr: { r: 11 }, opacity: 0, duration: .4 });
    const pOK = p * q === TP, slip = pOK && p + q === -TS;
    api.note(`Set out x ${pm(p)} by x ${pm(q)}${slip ? ": the sign slip (x-term +1)" : pOK ? ": on the −12 line" : ""}`, slip ? "warn" : pOK ? "good" : "");
    if (pOK && p + q === TS) {
      solved = true; const on = tries.filter((t) => t.p * t.q === TP).length, hadSlip = tries.some((t) => t.p * t.q === TP && t.p + t.q === -TS);
      gsap.to($("#rm", room), { attr: { fill: "rgba(255,209,102,.16)", stroke: "#ffd166" }, duration: .4 });
      const style = tries.length <= 2 ? "Straight there: fluent." : on / tries.length >= .5 ? `${on} of ${tries.length} tries on the −12 line: a systematic search.` : `Only ${on} of ${tries.length} tries on the −12 line: trial and error.`;
      api.noticed(`<b>Room set out: (x − 4)(x + 3).</b> ${style}${hadSlip ? " On the way they set out x + 4 by x − 3 (the classic sign slip) and fixed it themselves." : ""}`);
      api.learn("PAIR", tries.length <= 2 ? .95 : .7); if (hadSlip) api.learn("SIGNS", .6);
    }
  }
  function set(k, v) { st[k] = Math.max(-9, Math.min(9, v)); draw(); }
  $$(".rule .btn", w).forEach((b) => b.addEventListener("click", () => { let v = st[b.dataset.k] + +b.dataset.d; if (v === 0) v += +b.dataset.d; set(b.dataset.k, v); }));
  const drags = ["p", "q"].map((k) => Draggable.create(`#cur${k}`, { type: "left", bounds: `#sc${k}`, onDrag() { const sc = $(`#sc${k}`, w), v = Math.round((parseFloat(this.target.style.left) / sc.clientWidth) * 18 - 9); if (v && v !== st[k]) set(k, v); }, onRelease() { draw(); } })[0]);
  $$(".cur", w).forEach((c) => c.addEventListener("keydown", (e) => { const k = c.id.slice(3); if (e.key === "ArrowRight") { let v = st[k] + 1; if (!v) v++; set(k, v); } if (e.key === "ArrowLeft") { let v = st[k] - 1; if (!v) v--; set(k, v); } }));
  draw();
  return () => { drags.forEach((d) => d.kill()); clearTimeout(settle); };
} };
