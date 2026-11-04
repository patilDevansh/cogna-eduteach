// ============================================================
// Generic game widgets. Each takes theme words + hooks for theme art;
// all of them report through the shared evidence readers in E.
// ============================================================
const W = {};

// ---- allocate four tokens across four answers ----
W.allocate = (w, api, c) => {
  const O = E.PAIR_OPTS;
  w.innerHTML = `<p class="q">${c.prompt}</p><div class="big">x² + 3x − 4</div>
    <div class="g-alloc" id="ga"><div class="g-items">${O.map((o, i) => `<button class="g-item" type="button" data-i="${i}">${c.item ? c.item(o, i) : `<span class="m">${o.t}</span>`}<span class="g-cnt"></span></button>`).join("")}</div>
      <div class="g-tray"><span>${c.trayLabel}</span>${'<i class="g-spot"></i>'.repeat(4)}</div><div class="g-tokens"></div></div>
    <div class="row"><button class="btn primary" id="gdone" type="button" disabled>${c.doneLabel}</button><span class="label" id="gleft">4 left</span></div>`;
  const box = $("#ga", w), items = $$(".g-item", w), spots = $$(".g-spot", w), layer = $(".g-tokens", w);
  const toks = Array.from({ length: 4 }, () => ({ at: -1, x: 0, y: 0, el: html(`<button class="g-token" type="button" aria-label="${c.noun}">${c.token}</button>`) }));
  toks.forEach((t) => layer.appendChild(t.el));
  const rel = (e) => { const a = e.getBoundingClientRect(), b = box.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; };
  const OFF = [[0, 0], [16, -10], [-16, -8], [2, -20]];
  const target = (t) => { if (t.at < 0) return rel(spots[toks.filter((d) => d.at < 0).indexOf(t)]); const r = rel($(".g-anchor", items[t.at]) || items[t.at]), k = toks.filter((d) => d.at === t.at).indexOf(t); return { x: r.x + OFF[k][0], y: r.y + OFF[k][1] }; };
  function fly(t, instant) {
    const to = target(t); if (t.tw) { t.tw.kill(); t.x = gsap.getProperty(t.el, "x"); t.y = gsap.getProperty(t.el, "y"); }
    const from = { x: t.x, y: t.y }; t.x = to.x; t.y = to.y;
    if (instant || RM) return gsap.set(t.el, { x: to.x, y: to.y });
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 100 }, o = { p: 0 };
    t.tw = gsap.to(o, { p: 1, duration: .6, ease: "power2.inOut", onUpdate() { const p = o.p, q = 1 - p; gsap.set(t.el, { x: q * q * from.x + 2 * q * p * ctrl.x + p * p * to.x, y: q * q * from.y + 2 * q * p * ctrl.y + p * p * to.y, rotation: c.spin ? p * 360 : 0 }); }, onComplete() { gsap.fromTo(t.el, { scaleY: .7, scaleX: 1.15 }, { scaleY: 1, scaleX: 1, duration: .5, ease: "elastic.out(1.1,.4)" }); c.onLand && t.at >= 0 && c.onLand(items[t.at]); } });
  }
  const layout = (i) => toks.forEach((t) => fly(t, i));
  const counts = () => O.map((_, i) => toks.filter((t) => t.at === i).length);
  function refresh() { const n = counts(), placed = n.reduce((a, b) => a + b, 0); items.forEach((it, i) => { it.classList.toggle("has", n[i] > 0); $(".g-cnt", it).textContent = n[i] ? `${n[i]}` : ""; }); $("#gdone", w).disabled = placed < 4; $("#gleft", w).textContent = placed < 4 ? `${4 - placed} left` : "All placed"; }
  items.forEach((it, i) => it.addEventListener("click", () => { const t = toks.find((d) => d.at < 0); if (!t) return; t.at = i; api.note(`${c.verbPlace || "Placed"} on ${O[i].t}`); layout(); refresh(); }));
  toks.forEach((t) => t.el.addEventListener("click", (e) => { e.stopPropagation(); if (t.at < 0) return; api.note(`Took one back from ${O[t.at].t}`, "warn"); t.at = -1; layout(); refresh(); }));
  $("#gdone", w).addEventListener("click", () => { const r = E.pairsRead(counts(), c.noun); api.noticed(r.text); api.learn("PAIR", r.cert); });
  requestAnimationFrame(() => { toks.forEach((t) => { const p = target(t); t.x = p.x; t.y = p.y - 40; }); layout(); });
  const onR = () => layout(true); addEventListener("resize", onR);
  return () => removeEventListener("resize", onR);
};

// ---- judge eight claims ----
W.judge = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="g-judge"><div class="g-desk" id="gd"></div><div class="g-tally" id="gt">${c.buttons.map((b) => `<span data-v="${b.v}"><b>0</b>${b.label}</span>`).join("")}</div></div>
    <div class="row g-jbtns">${c.buttons.map((b) => `<button class="btn ${b.cls || ""}" type="button" data-v="${b.v}">${b.label}</button>`).join("")}</div><div class="g-fams" id="gf"></div>`;
  const desk = $("#gd", w), answers = [], times = []; let i = 0, shown = 0, busy = false, card = null;
  function deal() {
    if (i >= E.CLAIMS.length) return finish();
    card = html(c.card(E.CLAIMS[i].c, i, E.CLAIMS.length)); desk.appendChild(card);
    if (!RM) gsap.from(card, c.enter || { y: -30, opacity: 0, duration: .45, ease: "power3.out" });
    shown = performance.now() + 400;
  }
  function decide(v) {
    if (busy || !card) return; busy = true;
    const t = Math.max(.2, (performance.now() - shown) / 1000); answers[i] = v; times[i] = t;
    const b = c.buttons.find((x) => x.v === String(v)), mark = $(".g-mark", card);
    if (mark) { mark.textContent = b.mark || b.label; mark.dataset.v = String(v); }
    const tal = $(`#gt span[data-v="${String(v)}"] b`, w); tal.textContent = +tal.textContent + 1;
    api.note(`Claim ${i + 1}: ${b.label.toLowerCase()} after ${t.toFixed(1)}s`);
    const f = card; card = null;
    const tl = gsap.timeline({ onComplete: () => f.remove() });
    if (mark) tl.fromTo(mark, { opacity: 0, scale: 2 }, { opacity: 1, scale: 1, duration: RM ? 0 : .22, ease: "power4.in" });
    tl.to(f, { ...(c.exit ? c.exit(v) : { x: v === null ? 0 : v ? 60 : -60, y: v === null ? 40 : 10, opacity: 0 }), duration: RM ? 0 : .45, delay: .3 });
    setTimeout(() => { i++; busy = false; deal(); }, RM ? 50 : 850);
  }
  function finish() {
    desk.innerHTML = `<div class="g-done">${c.doneText || "All done"}</div>`;
    const r = E.claimsRead(answers, times);
    $("#gf", w).innerHTML = r.rows.map((x) => `<div class="g-fam"><span>${x.name}</span><span class="g-dots">${x.hits.map((h) => `<i class="${h}"></i>`).join("")}</span><p>${x.verdict}</p></div>`).join("");
    r.rows.forEach((x) => api.learn(x.skill, x.cert));
    api.noticed(`Eight claims, grouped by the mistake each one tests. ${r.slowText}`);
  }
  $$(".g-jbtns button", w).forEach((b) => b.addEventListener("click", () => decide(b.dataset.v === "null" ? null : b.dataset.v === "true")));
  deal();
  return () => {};
};

// ---- tiles into a rectangle ----
W.tiles = (w, api, c) => {
  const X = 130, U = 32, OX = 80, OY = 64;
  w.innerHTML = `<p class="q">${c.prompt}</p><svg viewBox="0 0 560 400" class="g-tiles" id="gtl"></svg>
    <div class="row"><span class="label">${c.controlLabel}</span><div class="seg" id="gs">${[0, 1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === 0}">${n}</button>`).join("")}</div><button class="btn primary" id="gk" type="button" disabled>${c.commitLabel}</button></div>`;
  const svg = $("#gtl", w), V = (n) => css(n);
  svg.innerHTML = `<g id="holes"></g>`;
  el("rect", { x: OX, y: OY, width: X, height: X, rx: c.rx ?? 6, fill: V("--t-sq"), stroke: V("--t-line"), "stroke-width": 2 }, svg);
  el("text", { x: OX + X / 2, y: OY + X / 2 + 8, "text-anchor": "middle", "font-size": 24, fill: V("--t-sq-ink") }, svg).textContent = "x²";
  const bars = Array.from({ length: 5 }, () => el("rect", { x: OX, y: OY + X, width: X, height: U, rx: (c.rx ?? 6) / 2, fill: V("--t-bar"), stroke: V("--t-line"), "stroke-width": 1.5 }, svg));
  const pool = (k) => ({ x: 450 + (k % 2) * 40, y: 64 + Math.floor(k / 2) * 40 });
  const units = Array.from({ length: 6 }, (_, k) => el("rect", { ...pool(k), width: U, height: U, rx: (c.rx ?? 6) / 2, fill: V("--t-unit"), stroke: V("--t-line"), "stroke-width": 1.5 }, svg));
  const dims = el("g", { opacity: 0 }, svg);
  let cur = 0; const tries = [];
  function lay(a, instant) {
    const b = 5 - a, d = instant || RM ? 0 : 1;
    bars.forEach((r, k) => gsap.to(r, { attr: k < a ? { x: OX + X + k * U, y: OY, width: U, height: X } : { x: OX, y: OY + X + (k - a) * U, width: X, height: U }, duration: (c.dur || .6) * d, delay: k * .05 * d, ease: c.ease || "power3.inOut" }));
    const cells = []; for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) cells.push({ x: OX + X + i * U, y: OY + X + j * U });
    units.forEach((u, k) => gsap.to(u, { attr: k < cells.length ? cells[k] : pool(k - cells.length), duration: (c.dur || .55) * d, delay: (.3 + k * .05) * d, ease: c.ease || "power3.inOut" }));
    const holes = $("#holes", svg); holes.innerHTML = "";
    cells.slice(6).forEach((cc) => el("rect", { x: cc.x + 4, y: cc.y + 4, width: U - 8, height: U - 8, fill: "none", stroke: V("--t-hole"), "stroke-width": 1.5, "stroke-dasharray": "4 3" }, holes));
    gsap.to(dims, { opacity: 0, duration: .15 });
    if (a * b === 6) {
      const ww = X + a * U, h = X + b * U, ink = V("--t-dim");
      dims.innerHTML = `<line x1="${OX}" y1="${OY - 22}" x2="${OX + ww}" y2="${OY - 22}" stroke="${ink}"/><text x="${OX + ww / 2}" y="${OY - 30}" text-anchor="middle" font-size="19" fill="${ink}">x + ${a}</text><line x1="${OX - 22}" y1="${OY}" x2="${OX - 22}" y2="${OY + h}" stroke="${ink}"/><text transform="translate(${OX - 30} ${OY + h / 2}) rotate(-90)" text-anchor="middle" font-size="19" fill="${ink}">x + ${b}</text><text x="${OX + ww / 2}" y="${OY + h + 34}" text-anchor="middle" font-size="17" fill="${ink}">${c.fitLabel || ""}(x + ${a})(x + ${b})</text>`;
      gsap.to(dims, { opacity: 1, duration: .5, delay: d });
      c.onFit && c.onFit(svg, { OX, OY, ww, h }, d);
    }
  }
  $$("#gs button", w).forEach((b) => b.addEventListener("click", () => {
    const a = +b.dataset.n; if (a === cur) return; cur = a; lay(a); tries.push(a);
    $$("#gs button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const need = a * (5 - a); api.note(`Split ${a} | ${5 - a}: ${need === 6 ? "closes" : need > 6 ? `${need - 6} gap${need - 6 > 1 ? "s" : ""}` : `${6 - need} spare`}`, need === 6 ? "good" : "");
    $("#gk", w).disabled = false;
  }));
  $("#gk", w).addEventListener("click", () => { const r = E.rectRead(tries, cur * (5 - cur) === 6); api.noticed(r.text); api.learn("PAIR", r.cert); $("#gk", w).disabled = true; });
  lay(0, true);
  return () => gsap.killTweensOf([...bars, ...units, dims]);
};

// ---- replay Sam's working and stop at the error ----
W.replay = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p><div class="g-replay"><svg viewBox="0 0 600 250" id="grs"></svg>${c.overlay || ""}</div>
    <div class="g-scrub"><button class="btn" id="gpp" type="button" aria-label="${c.playLabel}">▶</button><input type="range" id="gsc" min="0" max="1000" value="0" aria-label="Scrub"></div><div class="g-marks" id="gmk"></div>
    <div class="row"><button class="btn danger" id="gstop" type="button">${c.stopLabel}</button><button class="btn" id="gfine" type="button" disabled>${c.fineLabel}</button></div>`;
  const svg = $("#grs", w), INK = css("--r-ink"), SOFT = css("--r-soft");
  const T = (x, y, s, size = 30, fill = INK, extra = {}) => { const e = el("text", { x, y, "text-anchor": "middle", "font-size": size, fill, class: "g-rt", ...extra }, svg); e.textContent = s; return e; };
  T(300, 70, "(x − 3)(x + 2)", 32);
  const stepL = T(300, 26, "", 14, SOFT, { class: "g-step" });
  const POS = [[140, 140], [225, 140], [325, 140], [425, 140]];
  const terms = POS.map(([x, y], k) => T(x, y, E.TAPE[k].term, 30));
  const eq = T(80, 140, "=", 30, SOFT), fin = T(300, 210, "= x² − x + 6", 30), tick = T(480, 210, "✓", 30, css("--r-ok"));
  [...terms, eq, fin, tick].forEach((t) => gsap.set(t, { opacity: 0 }));
  const cursor = c.cursor ? el("circle", { r: 6, cx: 60, cy: 150, class: "g-cursor" }, svg) : null;
  const tl = gsap.timeline({ paused: true, onUpdate: () => ($("#gsc", w).value = Math.round(tl.progress() * 1000)), onComplete: () => { $("#gfine", w).disabled = false; $("#gpp", w).textContent = "↺"; } });
  const steps = []; let t = .3;
  tl.to(eq, { opacity: 1, duration: .3 }, t);
  E.TAPE.slice(0, 4).forEach((s, k) => {
    steps.push({ ...s, t }); tl.set(stepL, { textContent: `Step ${s.label} · ${s.text}` }, t);
    if (cursor) tl.to(cursor, { attr: { cx: POS[k][0], cy: POS[k][1] + 10 }, duration: .5, ease: "power2.inOut" }, t);
    tl.fromTo(terms[k], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .5, ease: "back.out(2)" }, t + .5);
    t += 1.8;
  });
  steps.push({ ...E.TAPE[4], t }); tl.set(stepL, { textContent: `Step E · ${E.TAPE[4].text}` }, t).to([terms[1], terms[2]], { opacity: .25, duration: .4 }, t + .3);
  if (cursor) tl.to(cursor, { attr: { cx: 300, cy: 220 }, duration: .5 }, t);
  t += 1.6; steps.push({ ...E.TAPE[5], t }); tl.set(stepL, { textContent: "Step F · Sam's answer" }, t).fromTo(fin, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .5 }, t).to(tick, { opacity: 1, duration: .3 }, t + .6).to({}, { duration: .8 });
  const D = tl.duration(); $("#gmk", w).innerHTML = steps.map((s) => `<span style="left:${(s.t / D) * 100}%">${s.label}</span>`).join("");
  const stepAt = (x) => [...steps].reverse().find((s) => x >= s.t) ?? steps[0], dStart = steps.find((s) => s.label === "D").t;
  $("#gpp", w).addEventListener("click", () => { if (tl.progress() >= 1) { tl.restart(); api.note("Replayed"); } else if (tl.paused() || !tl.isActive()) { tl.play(); api.note(tl.time() < .1 ? "Started" : "Resumed"); } else { tl.pause(); api.note(`Paused at ${tl.time().toFixed(1)}s`); } $("#gpp", w).textContent = tl.paused() ? "▶" : "❚❚"; c.onPlay && c.onPlay(!tl.paused()); });
  $("#gsc", w).addEventListener("input", (e) => { tl.pause(); tl.progress(e.target.value / 1000); $("#gpp", w).textContent = "▶"; });
  $("#gstop", w).addEventListener("click", () => { tl.pause(); $("#gpp", w).textContent = "▶"; c.onPlay && c.onPlay(false); const x = tl.time(), s = stepAt(x), r = E.stopRead(s.label, x - (dStart + .5), s.text); api.noticed(r.text); api.note(`${c.stopLabel} at ${x.toFixed(1)}s, step ${s.label}`, r.good ? "good" : "warn"); api.learn("CHECK", r.cert); });
  $("#gfine", w).addEventListener("click", () => { api.noticed("<b>Said it all looks right.</b> Either they'd make Sam's sign slip themselves, or they don't check each part. One follow-up tells which."); api.note("Passed a wrong working", "warn"); api.learn("SIGNS", .75); });
  return () => tl.kill();
};

// ---- order three steps from six ----
W.order = (w, api, c) => {
  const order = [3, 0, 5, 2, 1, 4];
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="g-order"><div class="g-slots ${c.reverse ? "rev" : ""}">${c.slotLabels.map((l, i) => `<div class="g-slot" data-s="${i}"><span class="g-slotlab">${l}</span></div>`).join("")}</div>
      <div class="g-pool" id="gpool"><span class="label">${c.poolLabel}</span>${order.map((k) => `<button class="g-piece" type="button" data-id="${E.STEPS[k].id}"><span class="m">${E.STEPS[k].t}</span></button>`).join("")}</div></div>
    <div class="row"><button class="btn primary" id="gok" type="button" disabled>${c.doneLabel}</button></div>`;
  const pool = $("#gpool", w), slots = $$(".g-slot", w), ever = new Set();
  w.addEventListener("click", (e) => {
    const p = e.target.closest(".g-piece"); if (!p || !w.contains(p)) return;
    const st = Flip.getState($$(".g-piece", w)), s = E.STEPS.find((x) => x.id === p.dataset.id);
    if (p.parentElement.classList.contains("g-slot")) { pool.appendChild(p); api.note(`Took back ${s.t}`, s.bad ? "good" : "warn"); }
    else { const free = slots.find((x) => !$(".g-piece", x)); if (!free) return; free.appendChild(p); ever.add(s.id); api.note(`${c.slotLabels[+free.dataset.s]}: ${s.t}`); }
    Flip.from(st, { duration: RM ? 0 : .55, ease: "power3.inOut", absolute: true, scale: true });
    $("#gok", w).disabled = slots.some((x) => !$(".g-piece", x));
  });
  $("#gok", w).addEventListener("click", () => { const r = E.parsonsRead(slots.map((x) => $(".g-piece", x).dataset.id), ever); c.onDone && c.onDone(w); api.noticed(r.text); api.learn("GROUP", r.cert); });
  return () => {};
};

// ---- two numbers with live visual + search log ----
W.dials = (w, api, c) => {
  const st = { p: 1, q: 1 }, tries = []; let settle = null, solved = false;
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="g-dials"><div class="g-vis" id="gv"></div>
      <div class="g-dctl"><div class="g-pq">${["p", "q"].map((k) => `<div class="g-pqi"><span class="label">${c.labels[k]}</span>${picker(k, 1)}</div>`).join("")}</div>
        <div class="g-read" id="gr"></div><div class="g-logwrap"><span class="label">${c.logTitle}</span><svg viewBox="0 0 300 180" class="g-log" id="glog"></svg></div></div></div>`;
  const log = $("#glog", w), mx = (s) => 30 + ((s + 18) / 36) * 260, my = (p) => 95 - (Math.max(-40, Math.min(40, p)) / 40) * 80, LC = css("--l-line"), LA = css("--l-accent");
  log.innerHTML = `<line x1="30" y1="95" x2="290" y2="95" stroke="${LC}"/><line x1="160" y1="10" x2="160" y2="180" stroke="${LC}"/><line x1="30" y1="${my(-12)}" x2="290" y2="${my(-12)}" stroke="${LA}" stroke-dasharray="4 4"/><text x="34" y="${my(-12) + 14}" font-size="11" fill="${LA}">every pair that multiplies to −12</text><text x="288" y="90" text-anchor="end" font-size="11" fill="${LC}">sum →</text><circle cx="${mx(-1)}" cy="${my(-12)}" r="9" fill="none" stroke="${css("--l-ok")}" stroke-width="2"/><polyline id="gpath" fill="none" stroke="${LA}" stroke-width="1.6" points=""/><g id="gdots"></g>`;
  function update() { $("#gr", w).innerHTML = c.readout ? c.readout(st.p, st.q) : `× ${sgn(st.p * st.q)} · + ${sgn(st.p + st.q)}`; c.visual($("#gv", w), st.p, st.q, solved); clearTimeout(settle); settle = setTimeout(record, 600); }
  function record() {
    if (solved) return; const { p, q } = st, last = tries.at(-1); if (last && last.p === p && last.q === q) return;
    tries.push({ p, q }); $("#gpath", log).setAttribute("points", tries.map((t) => `${mx(t.p + t.q)},${my(t.p * t.q)}`).join(" "));
    const d = el("circle", { cx: mx(p + q), cy: my(p * q), r: 4, fill: LA }, $("#gdots", log)); if (!RM) gsap.from(d, { attr: { r: 11 }, opacity: 0, duration: .4 });
    const r = E.lockTry(p, q); api.note(`Tried ${sgn(p)} and ${sgn(q)}${r.slip ? ": the sign slip" : r.pOK ? ": right product" : ""}`, r.slip ? "warn" : r.pOK ? "good" : "");
    if (r.solved) { solved = true; c.visual($("#gv", w), p, q, true); c.onSolve && c.onSolve($("#gv", w)); const f = E.lockFinal(tries); api.noticed(f.text); api.learn("PAIR", f.cert); if (f.slip) api.learn("SIGNS", .6); }
  }
  wirePickers(w, st, update, -9, 9); c.visual($("#gv", w), 1, 1, false, true); update();
  return () => clearTimeout(settle);
};

// ---- compare two formulas as x changes ----
W.compare = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p><div class="g-cmp" id="gc"></div>
    <div class="g-xs"><div class="g-xl"><span>x = <b class="m" id="gxv">0</b></span><span class="label">values checked</span></div><input type="range" id="gx" min="${c.min ?? 0}" max="${c.max ?? 8}" step="1" value="0" aria-label="x"><div class="g-ticks" id="gtk"></div></div>
    <div class="g-verd">${c.verdicts.map((v) => `<button type="button" data-v="${v.v}" aria-pressed="false">${v.label}</button>`).join("")}</div>
    <div class="row"><button class="btn primary" id="gsign" type="button" disabled>${c.signLabel}</button></div>`;
  const tested = new Map(); let pick = null; const lo = c.min ?? 0, hi = c.max ?? 8;
  function show(x) {
    const A = (x + 3) ** 2, B = x * x + 9; $("#gxv", w).textContent = sgn(x); c.visual($("#gc", w), x, A, B);
    if (!tested.has(x)) { tested.set(x, A === B); $("#gtk", w).insertAdjacentHTML("beforeend", `<i class="${A === B ? "eq" : "ne"}" style="left:${((x - lo) / (hi - lo)) * 100}%"></i>`); api.note(`Checked x = ${sgn(x)}: ${A} ${A === B ? "=" : "≠"} ${B}`); }
  }
  $("#gx", w).addEventListener("input", (e) => show(+e.target.value));
  $$(".g-verd button", w).forEach((b) => b.addEventListener("click", () => { pick = b.dataset.v; $$(".g-verd button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); $("#gsign", w).disabled = false; }));
  $("#gsign", w).addEventListener("click", () => { const r = E.auditRead(pick, tested); api.noticed(r.text); api.learn("SQUARES", r.cert); });
  c.visual($("#gc", w), 0, 9, 9, true); show(0);
  return () => {};
};

// ---- two moves, then reveal the hidden layers ----
W.twoMoves = (w, api, c) => {
  const st = { n1: 1, n2: 1, s1: null, s2: null };
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="g-moves"><div class="g-mv"><span class="label">Move 1 · two numbers that multiply to −6 and add to −1</span><div class="row">${picker("n1", 1)}<span>and</span>${picker("n2", 1)}</div></div>
      <div class="g-mv"><span class="label">Move 2 · set each bracket's sign</span><span class="brk">(x <button class="tog" id="s1" type="button">?</button> <span id="m1">1</span>)(x <button class="tog" id="s2" type="button">?</button> <span id="m2">1</span>)</span></div></div>
    <div class="row"><button class="btn primary" id="gperf" type="button" disabled>${c.performLabel}</button><button class="btn danger" id="grev" type="button" disabled>${c.revealLabel}</button></div>
    <div class="g-stage" id="gstg"></div>
    <div style="display:grid;gap:6px"><span class="label">Or watch a student who…</span><div class="chips" id="gas"><button type="button" data-p="right">does it properly</button><button type="button" data-p="double">makes two slips that cancel</button><button type="button" data-p="slip">slips in move 1 only</button><button type="button" data-p="flip">only flips signs</button></div></div>`;
  const mags = () => { $("#m1", w).textContent = Math.abs(st.n1); $("#m2", w).textContent = Math.abs(st.n2); };
  const ready = () => ($("#gperf", w).disabled = !(st.s1 && st.s2));
  wirePickers(w, st, () => { mags(); api.note(`Move 1: ${sgn(st.n1)} and ${sgn(st.n2)}`); }, -6, 6);
  ["s1", "s2"].forEach((k) => $(`#${k}`, w).addEventListener("click", (e) => { st[k] = st[k] === "+" ? "−" : "+"; e.currentTarget.textContent = st[k]; e.currentTarget.classList.add("set"); api.note(`Move 2: bracket ${k === "s1" ? 1 : 2} gets ${st[k]}`); ready(); }));
  const perform = () => { const r = E.xrayRead(st); c.surface($("#gstg", w), r); $("#grev", w).disabled = false; api.note(`Finished: (x ${pm(r.b1)})(x ${pm(r.b2)})`); };
  const reveal = () => { const r = E.xrayRead(st); c.reveal($("#gstg", w), r); api.noticed(r.text); api.note(`Revealed: move 1 ${r.layers[2].ok ? "✓" : "✗"}, move 2 ${r.layers[1].ok ? "✓" : "✗"}, answer ${r.fin ? "✓" : "✗"}`, r.double ? "warn" : "good"); api.learn("PAIR", .85); if (!r.layers[2].ok || !r.layers[1].ok) api.learn("SIGNS", .85); };
  $("#gperf", w).addEventListener("click", perform); $("#grev", w).addEventListener("click", reveal);
  const PRE = { right: [-3, 2, "−", "+"], double: [3, -2, "−", "+"], slip: [3, -2, "+", "−"], flip: [-3, 2, "+", "−"] };
  $$("#gas button", w).forEach((b) => b.addEventListener("click", () => {
    $$("#gas button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const [n1, n2, s1, s2] = PRE[b.dataset.p]; Object.assign(st, { n1, n2, s1, s2 });
    $("#n1", w).textContent = sgn(n1); $("#n2", w).textContent = sgn(n2);
    [["s1", s1], ["s2", s2]].forEach(([k, v]) => { const e = $(`#${k}`, w); e.textContent = v; e.classList.add("set"); });
    mags(); ready(); perform(); setTimeout(reveal, RM ? 0 : 700);
  }));
  c.empty && c.empty($("#gstg", w));
  return () => {};
};
W.layerCards = (box, r) => {
  box.innerHTML = `<div class="g-layers">${r.layers.map((L) => `<div class="g-layer ${L.ok ? "ok" : "bad"}"><small>${L.lab}</small><span class="m">${L.t}</span><span class="v">${L.v}</span></div>`).join("")}</div>`;
  if (!RM) gsap.from($$(".g-layer", box), { y: (i) => -i * 30, opacity: 0, stagger: .12, duration: .5, ease: "power3.out" });
};

// ---- four sign cases ----
W.quad = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="g-quad">${E.QUAD.map((_, i) => `<div class="g-qc" data-i="${i}">${c.art ? c.art(i) : ""}<span class="g-qname">${c.names[i]}</span><span class="m">${E.quadExpr(i)}</span><span class="brk">(x <button class="tog" type="button" data-c="${i}" data-k="0">?</button> 2)(x <button class="tog" type="button" data-c="${i}" data-k="1">?</button> 3)</span></div>`).join("")}</div>
    <div class="row"><button class="btn primary" id="gchk" type="button" disabled>${c.checkLabel}</button></div><div class="g-rules" id="grl"></div>`;
  const picks = E.QUAD.map(() => [null, null]);
  $$(".g-qc .tog", w).forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.c, k = +b.dataset.k; picks[i][k] = picks[i][k] === "+" ? "−" : "+"; b.textContent = picks[i][k]; b.classList.add("set");
    if (!picks[i].includes(null)) { const card = $(`.g-qc[data-i="${i}"]`, w); if (!card.classList.contains("lit")) { card.classList.add("lit"); c.onLit && c.onLit(card); } api.note(`${c.names[i]}: (x ${picks[i][0]} 2)(x ${picks[i][1]} 3)`); }
    $("#gchk", w).disabled = picks.some((p) => p.includes(null));
  }));
  $("#gchk", w).addEventListener("click", () => {
    const r = E.quadRead(picks);
    $("#grl", w).innerHTML = `<span class="label">${c.rulesTitle}</span>` + E.RULES.map((ru, k) => `<div class="g-rule" data-k="${k}"><span>${ru.name}</span><span class="g-dots">${r.scores[k].map((o) => `<i class="${o ? "on" : ""}"></i>`).join("")}</span></div>`).join("");
    if (!RM) gsap.from($$(".g-rule", w), { x: -14, opacity: 0, stagger: .08, duration: .35 });
    if (r.best[0] === 4) setTimeout(() => $(`.g-rule[data-k="${r.best[1]}"]`, w).classList.add("match"), RM ? 0 : 700);
    api.noticed(r.text); api.learn("SIGNS", r.cert);
  });
  return () => {};
};

// ---- predict, then pick ----
W.predict = (w, api, c) => {
  const st = { p1: 1, p2: 1 };
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="g-guess">${c.guessLabel} (x + ${picker("p1", 1)})(x + ${picker("p2", 1)})<button class="btn primary" id="gcm" type="button">${c.commitLabel}</button></div>
    <div class="g-opts" id="gop"><div class="g-cover" id="gcov">${c.coverText}</div>${E.TRACE.map((o, i) => `<button class="g-opt" type="button" data-i="${i}" disabled aria-pressed="false"><span class="m">${o.t}</span><span class="g-exp"></span></button>`).join("")}</div>
    <div class="row"><button class="btn" id="gpk" type="button">▶ ${c.peekLabel}</button></div>`;
  wirePickers(w, st, null, -15, 15);
  let pred = null, tl = null;
  $("#gcm", w).addEventListener("click", () => { pred = { ...st }; $("#gcm", w).disabled = true; $$("[data-np]", w).forEach((b) => (b.disabled = true)); api.note(`Predicted (x ${pm(pred.p1)})(x ${pm(pred.p2)}) first`, "good"); c.uncover ? c.uncover($("#gcov", w), $$(".g-opt", w)) : gsap.to("#gcov", { opacity: 0, duration: RM ? 0 : .7, onComplete: () => ($("#gcov", w).hidden = true) }); $$(".g-opt", w).forEach((b) => (b.disabled = false)); });
  $$(".g-opt", w).forEach((b) => b.addEventListener("click", () => { $$(".g-opt", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); const o = E.TRACE[+b.dataset.i], r = E.traceRead(pred, o); api.noticed(r.text); api.note(`Picked ${o.t} (prediction was ${r.pk})`); api.learn("PAIR", r.cert); }));
  $("#gpk", w).addEventListener("click", () => {
    $("#gcov", w).hidden = true; tl && tl.kill(); const os = $$(".g-opt", w); os.forEach((o) => ($(".g-exp", o).innerHTML = "")); tl = gsap.timeline();
    E.TRACE.slice(0, 3).forEach((o, i) => tl.to(os[i], { y: -6, duration: .25 }).call(() => ($(".g-exp", os[i]).innerHTML = o.k === "right" ? `= ${o.e} ✓` : `<s>= ${o.e}</s>`)).to({}, { duration: .55 }).to(os[i], { y: 0, duration: .2 }));
    tl.call(() => api.noticed("That's checking the options: expand each until one matches. The tick lands on the right answer, and no factorising happened."));
  });
  return () => tl && tl.kill();
};

// ---- four quick ones, the last a look-alike ----
W.rows = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p><div class="g-rows" id="grw"></div>`;
  const box = $("#grw", w), times = [], picks = []; let i = 0, shown = 0;
  function next() {
    if (i >= E.SWITCH.length) { api.noticed(E.switchRead(times, picks)); api.learn("SQUARES", .85); return; }
    const r = E.SWITCH[i], row = html(`<div class="g-row ${r.trap ? "trap" : ""}"><span class="g-rlab">${c.rowLabel(i)}</span><span class="m g-rq">${r.q}</span><div class="g-ro">${r.o.map((o, k) => `<button type="button" data-k="${k}" aria-pressed="false">${o}</button>`).join("")}</div><span class="g-rt"><i class="g-bar"></i><small class="m"></small></span></div>`);
    box.appendChild(row); if (!RM) gsap.from(row, c.enter || { x: 40, opacity: 0, duration: .4, ease: "power3.out" });
    shown = performance.now();
    $$(".g-ro button", row).forEach((b) => b.addEventListener("click", () => {
      const t = Math.max(.3, (performance.now() - shown) / 1000); times.push(t); picks.push(+b.dataset.k);
      $$(".g-ro button", row).forEach((x) => { x.disabled = true; x.setAttribute("aria-pressed", String(x === b)); });
      gsap.to($(".g-bar", row), { width: `${Math.min(100, (t / 8) * 100)}%`, duration: .6, ease: "power3.out" }); $("small", row).textContent = `${t.toFixed(1)}s`;
      api.note(`${c.rowLabel(i)}: ${r.o[+b.dataset.k]} in ${t.toFixed(1)}s`, r.trap ? "warn" : ""); c.onAnswer && c.onAnswer(row, t); i++; setTimeout(next, RM ? 0 : 350);
    }));
  }
  next();
  return () => {};
};

// ---- typing, replayed ----
W.typed = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="row"><input class="g-in" id="gin" autocomplete="off" spellcheck="false" placeholder="(x + ?)(x − ?)" aria-label="Your answer"><button class="btn primary" id="gsub" type="button">${c.submitLabel}</button></div>
    <div class="g-tape" id="gtape"><span class="label">${c.outTitle}</span><div class="g-out" id="gout"></div><div class="g-drafts" id="gdr"></div><div class="g-tl" id="gtline"></div></div>
    <div style="display:grid;gap:6px"><span class="label">${c.samplesLabel}</span><div class="chips" id="gsm"><button type="button" data-p="fix">they fixed a sign</button><button type="button" data-p="clean">they went straight through</button><button type="button" data-p="stuck">they stalled</button></div></div>`;
  const input = $("#gin", w); let hist = [], t0 = null, tl = null;
  input.addEventListener("input", () => { const n = performance.now(); if (t0 === null) t0 = n; hist.push({ t: (n - t0) / 1000, v: input.value }); });
  function play(h, who) {
    tl && tl.kill();
    const out = $("#gout", w), dr = $("#gdr", w), line = $("#gtline", w), T = Math.max(1, h.at(-1).t + .5); out.innerHTML = ""; dr.innerHTML = ""; line.innerHTML = "";
    h.forEach((s, k) => { const p = k ? h[k - 1] : { t: 0, v: "" }, gap = s.t - p.t; if (gap > 1.5) line.insertAdjacentHTML("beforeend", `<b style="left:${(p.t / T) * 100}%;width:${(gap / T) * 100}%"></b>`); line.insertAdjacentHTML("beforeend", `<i class="${s.v.length < p.v.length ? "d" : ""}" style="left:${(s.t / T) * 100}%"></i>`); });
    const tape = []; tl = gsap.timeline();
    h.forEach((s, k) => { const prev = k ? h[k - 1].v : ""; tl.call(() => { let pre = 0; while (pre < prev.length && pre < s.v.length && prev[pre] === s.v[pre]) pre++; for (let n = prev.length - pre; n > 0; n--) for (let j = tape.length - 1; j >= 0; j--) if (!tape[j].del) { tape[j].del = true; break; } for (const ch of s.v.slice(pre)) tape.push({ ch }); out.innerHTML = tape.map((x) => (x.del ? `<span class="del">${esc(x.ch)}</span>` : esc(x.ch))).join("") + `<span class="cur"></span>`; c.onKey && c.onKey(w); }, null, RM ? 0 : s.t / 1.4); });
    tl.call(() => {
      const r = E.revRead(h, c.draftWord);
      dr.innerHTML = [...r.drafts.map((d) => ({ ...d, old: true })), { ...r.fin, old: false }].map((d, k) => `<div class="g-draft ${d.old ? "old" : ""}"><b>${c.draftWord[0].toUpperCase() + c.draftWord.slice(1)} ${k + 1}</b><span class="m">${esc(d.v)}</span><small>${d.t.toFixed(1)}s · ${d.old ? (E.REV.BUGS[E.norm(d.v)] ? `discarded · ${E.REV.BUGS[E.norm(d.v)]}` : "discarded") : "kept"}</small></div>`).join("");
      if (!RM) gsap.from($$(".g-draft", dr), { y: 8, opacity: 0, stagger: .12, duration: .35 });
      api.noticed(r.text); api.note(`${who}: ${r.drafts.length} discarded ${c.draftWord}${r.drafts.length === 1 ? "" : "s"}${r.buggy.length ? ", one matched a known mistake" : ""}`, r.buggy.length ? "warn" : "good"); api.learn("PAIR", r.cert);
    }, null, RM ? 0 : T / 1.4);
  }
  $("#gsub", w).addEventListener("click", () => (hist.length ? play(hist, "Your answer") : input.focus()));
  $$("#gsm button", w).forEach((b) => b.addEventListener("click", () => { $$("#gsm button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); play(E.SAMPLES[b.dataset.p], `Someone where ${b.textContent}`); }));
  return () => tl && tl.kill();
};

// ---- find every b ----
W.findAll = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p><svg viewBox="0 0 640 110" class="g-line" id="gln"></svg>
    <div class="row"><button class="btn primary" id="gfd" type="button" disabled>${c.doneLabel}</button><span class="label" id="gfc">None yet</span></div><div class="g-results" id="gres"></div>`;
  const svg = $("#gln", w), X = (v) => 20 + ((v + 15) / 30) * 600, LI = css("--f-line");
  let s = `<line x1="14" y1="64" x2="626" y2="64" stroke="${LI}" stroke-width="2"/>`;
  for (let v = -15; v <= 15; v++) { const big = v % 5 === 0; s += `<line x1="${X(v)}" y1="58" x2="${X(v)}" y2="${big ? 74 : 68}" stroke="${LI}"/>${big ? `<text x="${X(v)}" y="92" text-anchor="middle" font-size="12" fill="${LI}" class="g-ft">${v}</text>` : ""}`; if (v) s += `<rect class="g-hit" data-v="${v}" x="${X(v) - 9}" y="20" width="18" height="60" fill="transparent" tabindex="0" role="button" aria-label="b = ${v}"/>`; }
  svg.innerHTML = s + `<g id="gmk2"></g>`;
  const picked = [];
  function draw() { $("#gmk2", svg).innerHTML = picked.map((v, k) => `<g transform="translate(${X(v)} 64)" class="g-mkr">${c.marker(k + 1)}</g>`).join(""); $("#gfc", w).textContent = picked.length ? `${picked.length} picked` : "None yet"; $("#gfd", w).disabled = !picked.length; }
  function toggle(v) { const i = picked.indexOf(v); if (i >= 0) { picked.splice(i, 1); api.note(`Removed b = ${sgn(v)}`, "warn"); } else { picked.push(v); api.note(`Picked b = ${sgn(v)}`); } draw(); if (i < 0 && !RM) gsap.from($("#gmk2 g:last-child", svg), { y: -20, opacity: 0, duration: .35, ease: "back.out(2)" }); }
  $$(".g-hit", svg).forEach((r) => { r.addEventListener("click", () => toggle(+r.dataset.v)); r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(+r.dataset.v); } }); });
  $("#gfd", w).addEventListener("click", () => {
    $("#gfd", w).disabled = true; const r = E.lotsRead(picked);
    $("#gres", w).innerHTML = E.LOTS.VALID.map((v) => { const [p, q] = E.LOTS.PAIRS[v], hit = r.found.includes(v); return `<div class="g-res ${hit ? "hit" : "miss"}"><b class="m">b = ${sgn(v)}</b>${c.resultArt ? c.resultArt(v, p, q, hit) : ""}<span class="m">(x ${pm(p)})(x ${pm(q)})</span><small>${hit ? "found" : "missed"}</small></div>`; }).join("");
    if (!RM) gsap.from($$(".g-res", w), { y: 12, opacity: 0, stagger: .1, duration: .4 });
    api.noticed(r.text); api.learn("PAIR", r.cert); if (!r.neg.length) api.learn("SIGNS", .8);
  });
  return () => {};
};

// ---- see the structure ----
W.module = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p><div class="big"><span class="g-chunk" id="gck">(x + 3)</span>² − 16</div>
    <div class="g-routes">${Object.keys(E.MODULE).map((k) => `<button class="g-route" type="button" data-k="${k}" aria-pressed="false">${c.routes[k]}</button>`).join("")}</div>
    <div class="g-modgrid"><div class="g-steps" id="gstp"><span class="label">Working</span></div><div class="g-modvis" id="gmv"></div></div>
    <div class="g-mental" id="gmn" hidden><p class="q">Now in your head: <span class="m">99² − 1</span> = ?</p><div class="row"><input id="gmi" class="g-in" inputmode="numeric" autocomplete="off" aria-label="99 squared minus 1" style="max-width:10rem"><button class="btn primary" id="gms" type="button">Done</button></div></div>`;
  let tl = null, start = 0, chosen = null;
  $$(".g-route", w).forEach((b) => b.addEventListener("click", () => {
    $$(".g-route", w).forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.disabled = true; });
    chosen = b.dataset.k; const p = E.MODULE[chosen], steps = $("#gstp", w);
    steps.innerHTML = `<span class="label">Working</span>` + p.lines.map((l, k) => `<div>${k ? '<span class="eq">=</span>' : ""}${chosen === "block" && c.blockWord ? l.replace(/A/g, c.blockWord) : l}</div>`).join("");
    const rows = $$("div", steps); gsap.set(rows, { opacity: 0, x: -10 }); tl && tl.kill(); tl = gsap.timeline();
    if (chosen === "block") { $("#gck", w).classList.add("on"); c.blockVisual && tl.add(c.blockVisual($("#gmv", w))); }
    rows.forEach((r) => tl.to(r, { opacity: 1, x: 0, duration: RM ? 0 : .4 }, RM ? 0 : ">.15"));
    tl.call(() => { api.noticed(p.t); $("#gmn", w).hidden = false; start = performance.now(); }); if (RM) tl.progress(1);
    api.note(`First move: ${c.routes[chosen]} (${p.lines.length} lines)`, chosen === "block" ? "good" : chosen === "root" ? "warn" : ""); api.learn("SQUARES", p.c);
  }));
  $("#gms", w).addEventListener("click", () => { const v = $("#gmi", w).value.replace(/[^\d-]/g, ""), t = (performance.now() - start) / 1000; api.noticed(`${E.MODULE[chosen].t}<br><br>${E.mentalRead(v, t)}`); api.note(`99² − 1 → ${v || "blank"} in ${t.toFixed(1)}s`); $("#gms", w).disabled = true; });
  c.idle && c.idle($("#gmv", w));
  return () => tl && tl.kill();
};

// ---- what Lotus asks next ----
W.nbq = (w, api, c) => {
  const N = E.nbq(c.names);
  w.innerHTML = `<p class="q">${c.prompt}</p><div class="chips" id="ghid">${N.S.map((s) => `<button type="button" data-s="${s}" aria-pressed="${s === "FLIP"}">${N.NAMES[s]}</button>`).join("")}</div>
    <div class="g-nbq"><table class="g-table"><thead><tr><th>${c.colName}</th><th>Expected · per min</th><th class="g-ig">Value</th><th></th></tr></thead><tbody id="git"></tbody></table><div id="gbel" class="g-bel"></div></div>
    <div class="row"><button class="btn primary" id="gask" type="button">${c.askLabel}</button><button class="btn" id="grs" type="button">Start again</button></div>`;
  let hidden = "FLIP", belief = { ...N.PRIOR }, asked = [], done = false, resp = {};
  function draw() {
    const lead = N.S.reduce((a, s) => (belief[s] > belief[a] ? s : a), N.S[0]);
    $("#gbel", w).innerHTML = `<span class="label">What Lotus believes</span>` + N.S.map((s) => `<div class="g-b ${s === lead ? "lead" : ""}"><span>${N.NAMES[s]}</span><em>${Math.round(belief[s] * 100)}%</em><span class="g-bb"><i data-w="${belief[s]}"></i></span></div>`).join("");
    $$(".g-bb i", w).forEach((i) => gsap.to(i, { width: `${+i.dataset.w * 100}%`, duration: .7 }));
    const sc = N.QS.map((q) => { const g = N.eig(belief, q); return { q, g, pm: g / (q.sec / 60) }; }), best = sc.filter((x) => !asked.includes(x.q.id)).sort((a, b) => b.pm - a.pm)[0], mx = Math.max(.01, ...sc.map((x) => x.pm));
    $("#git", w).innerHTML = sc.map((x) => `<tr class="${x === best && !done ? "best" : ""} ${asked.includes(x.q.id) ? "asked" : ""}"><td>${x.q.name}</td><td class="m">${x.g.toFixed(2)} · ${x.pm.toFixed(2)}</td><td class="g-ig"><i data-w="${x.pm / mx}"></i></td><td class="g-tick">${resp[x.q.id] ? `✓ “${resp[x.q.id]}”` : ""}</td></tr>`).join("");
    $$("td.g-ig i", w).forEach((i) => gsap.to(i, { width: `${+i.dataset.w * 100}%`, duration: .7 }));
    return { best, lead };
  }
  function ask() {
    if (done) return; const { best } = draw(); if (!best || best.g < .05) return stop("Nothing left is worth the student's time.");
    const L = best.q.L[hidden]; let x = Math.random(), acc = 0, r = Object.keys(L).at(-1); for (const [k, p] of Object.entries(L)) { acc += p; if (x <= acc) { r = k; break; } }
    belief = N.post(belief, best.q, r); asked.push(best.q.id); resp[best.q.id] = r; api.note(`Chose ${best.q.name} (${best.g.toFixed(2)} bits expected): “${r}”`);
    const { lead } = draw();
    if (belief[lead] >= .85 && (lead === "M" || lead === "UNK" || asked.length >= 2)) stop(`Sure enough: “${N.NAMES[lead]}” at ${Math.round(belief[lead] * 100)}% after ${asked.length} game${asked.length > 1 ? "s" : ""}.${lead === hidden ? " That's the hidden student." : " Not the hidden student: answers include slips. Start again to retry."}`);
  }
  function stop(why) { done = true; draw(); $("#gask", w).disabled = true; api.noticed(`<b>Lotus stops.</b> ${why} A named mistake always needs a second, different game first.`); }
  function reset() { belief = { ...N.PRIOR }; asked = []; resp = {}; done = false; $("#gask", w).disabled = false; $(".notice.final", w)?.remove(); draw(); }
  $$("#ghid button", w).forEach((b) => b.addEventListener("click", () => { hidden = b.dataset.s; $$("#ghid button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); reset(); }));
  $("#gask", w).addEventListener("click", ask); $("#grs", w).addEventListener("click", reset); draw();
  return () => {};
};

// ---- read back before marking ----
W.readback = (w, api, c) => {
  w.innerHTML = `<p class="q">${c.prompt}</p>
    <div class="g-rb"><div class="g-rbin"><span class="label">${c.inputLabel}</span><input class="g-in" id="grbi" autocomplete="off" spellcheck="false" value="x+2(x+3)" aria-label="Your answer"><div class="chips" id="grbs">${["x+2(x+3)", "(x+2)(x+3", "x2+5x+6", "(x+2)(x+3)", "(x+2)*(x+3)"].map((s) => `<button type="button">${s}</button>`).join("")}</div></div>
      <div class="g-rbout"><span class="label">${c.readTitle}</span><div class="g-read2" id="grd"></div><div id="gfl" class="g-flags"></div><div class="row"><button class="btn primary" id="gyes" type="button">${c.confirmLabel}</button><button class="btn" id="gfix" type="button">${c.fixLabel}</button></div><div class="g-stamp" id="gst">${c.stampHTML}</div></div></div>`;
  const input = $("#grbi", w); let sug = null;
  function render() {
    const r = E.readback(input.value); sug = r.fix; $("#grd", w).textContent = E.pretty(r.s) || " ";
    $("#gfl", w).innerHTML = r.iss.map((t, k) => `<div class="g-flag"><b>${c.flagLabel}-${k + 1}</b><span>${t}</span></div>`).join("");
    $("#gfix", w).hidden = !r.fix; gsap.set("#gst", { opacity: 0 }); if (!RM && r.iss.length) gsap.from($$(".g-flag", w), { opacity: 0, x: -8, stagger: .08, duration: .3 }); return r;
  }
  input.addEventListener("input", render);
  $$("#grbs button", w).forEach((b) => b.addEventListener("click", () => { input.value = b.textContent; const r = render(); api.note(`Wrote “${b.textContent}”: ${r.iss.length ? `${r.iss.length} flag${r.iss.length > 1 ? "s" : ""}` : "clear"}`, r.iss.length ? "warn" : ""); }));
  $("#gfix", w).addEventListener("click", () => { if (!sug) return; input.value = sug; render(); api.note("Took the suggestion: they meant two brackets multiplied", "good"); });
  $("#gyes", w).addEventListener("click", () => {
    const r = E.readback(input.value);
    gsap.fromTo("#gst", { opacity: 0, scale: 2 }, { opacity: 1, scale: 1, rotation: -8, duration: RM ? 0 : .28, ease: "power4.in" });
    api.noticed(r.iss.length ? `<b>Confirmed with ${r.iss.length} flag${r.iss.length > 1 ? "s" : ""} answered.</b> Lotus marks what the student confirmed, ${r.ok ? "which is right" : "which isn't the factorisation"}. The typing problem is logged separately, never as a maths gap.` : `<b>Clean.</b> ${r.ok ? "Right, and read exactly as intended." : "Read exactly as written, then marked as maths."}`);
    api.learn("PAIR", r.ok ? .85 : .6);
  });
  render();
  return () => {};
};
