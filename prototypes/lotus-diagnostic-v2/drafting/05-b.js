// ===== A-07 Area audit =====
GAMES.audit = { mount(w, api) {
  const S = 18;
  w.innerHTML = `<p class="q">Two architects give formulas for the area of a square room with side <span class="m">x + 3</span>. One writes <span class="m">(x + 3)²</span>, the other <span class="m">x² + 9</span>. Change the room size and audit them.</p>
    <div class="audit"><svg viewBox="0 0 640 300" id="au"></svg></div>
    <div class="xs"><div class="lbl"><span>x = <b class="m" id="xv">0</b></span><span class="label">sizes audited</span></div><input type="range" id="xr" min="0" max="8" step="1" value="0" aria-label="x"><div class="ticks" id="tk"></div></div>
    <div class="verdicts">${["Always equal", "Sometimes equal", "Never equal"].map((v) => `<button type="button" data-v="${v}" aria-pressed="false">${v}</button>`).join("")}</div>
    <div class="row"><button class="btn solid" id="sign" type="button" disabled>Sign the audit</button></div>`;
  const svg = $("#au", w);
  svg.innerHTML = `<g transform="translate(40 30)"><text x="0" y="-8" font-size="15" fill="${W}">Architect 1: (x + 3)²</text><rect id="a1" x="0" y="0" width="54" height="54" fill="rgba(244,248,255,.07)" stroke="${W}" stroke-width="1.8"/><text id="a1v" x="0" y="250" font-size="18" fill="#ffd166" font-family="IBM Plex Mono"></text></g>
    <g transform="translate(340 30)"><text x="0" y="-8" font-size="15" fill="${W}">Architect 2: x² + 9</text><rect id="b1" x="0" y="0" width="0" height="0" fill="rgba(244,248,255,.07)" stroke="${W}" stroke-width="1.8"/><rect id="b2" x="0" y="0" width="54" height="54" fill="rgba(255,209,102,.12)" stroke="#ffd166" stroke-width="1.5"/><text id="b1v" x="0" y="250" font-size="18" fill="#ffd166" font-family="IBM Plex Mono"></text></g>
    <text id="rel" x="320" y="150" text-anchor="middle" font-size="44" fill="#7cf2c9" font-family="IBM Plex Mono">=</text>`;
  const tested = new Map(); let pick = null;
  function show(x) {
    const A = (x + 3) ** 2, Bv = x * x + 9, d = RM ? 0 : .6;
    $("#xv", w).textContent = x;
    gsap.to($("#a1", svg), { attr: { width: (x + 3) * S, height: (x + 3) * S }, duration: d, ease: "power3.out" });
    gsap.to($("#b1", svg), { attr: { width: x * S, height: x * S }, duration: d, ease: "power3.out" });
    gsap.to($("#b2", svg), { attr: { x: x * S + (x ? 6 : 0), y: 0 }, duration: d, ease: "power3.out" });
    $("#a1v", svg).textContent = `area ${A}`; $("#b1v", svg).textContent = `area ${Bv}`;
    const r = $("#rel", svg); r.textContent = A === Bv ? "=" : "≠"; r.setAttribute("fill", A === Bv ? "#7cf2c9" : "#ff7b66");
    if (!tested.has(x)) { tested.set(x, A === Bv); $("#tk", w).insertAdjacentHTML("beforeend", `<i style="left:${(x / 8) * 100}%;border-color:${A === Bv ? "#7cf2c9" : "#ff7b66"}"></i>`); api.note(`Audited x = ${x}: ${A} ${A === Bv ? "=" : "≠"} ${Bv}`); }
  }
  $("#xr", w).addEventListener("input", (e) => show(+e.target.value));
  $$(".verdicts button", w).forEach((b) => b.addEventListener("click", () => { pick = b.dataset.v; $$(".verdicts button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); $("#sign", w).disabled = false; }));
  $("#sign", w).addEventListener("click", () => {
    const n = tested.size, sawNe = [...tested.values()].includes(false);
    let t, c = .8;
    if (pick === "Always equal" && !sawNe) t = `<b>Audited only ${n === 1 ? "x = 0" : "sizes that happened to match"} and signed “always”.</b> Checks one easy case and stops.`;
    else if (pick === "Always equal") { t = "<b>Saw the areas differ and still signed “always”.</b> Believes (a + b)² = a² + b² firmly enough to overrule the drawing."; c = .95; }
    else if (pick === "Never equal") t = tested.get(0) ? "<b>Saw them match at x = 0 but signed “never”.</b> Doesn't count one case as “sometimes”." : "<b>Signed “never” without checking x = 0.</b>";
    else t = `<b>Sometimes, after auditing ${n} size${n > 1 ? "s" : ""}.</b> ${n >= 3 && sawNe ? "Tested like a mathematician." : "Right, but checked very little."}`;
    api.noticed(t); api.learn("SQUARES", c);
  });
  show(0);
  return () => {};
} };

// ===== A-08 Section cut =====
GAMES.section = { mount(w, api) {
  const st = { n1: 1, n2: 1, s1: null, s2: null };
  w.innerHTML = `<p class="q">Factorise <span class="m">x² − x − 6</span> in two moves. The finished answer goes on the facade. Then cut a section through the wall to see what's inside.</p>
    <div class="sec"><div class="moves2">
        <div><span class="lab">Move 1 · two numbers that multiply to −6 and add to −1</span><div class="row">${picker("n1", 1)}<span>and</span>${picker("n2", 1)}</div></div>
        <div><span class="lab">Move 2 · set each bracket's sign</span><span class="brk">(x <button class="tog" id="s1" type="button">?</button> <span id="m1">1</span>)(x <button class="tog" id="s2" type="button">?</button> <span id="m2">1</span>)</span></div>
        <div class="row"><button class="btn solid" id="build" type="button" disabled>Build the facade</button><button class="btn red" id="cut" type="button" disabled>Cut section A–A</button></div>
        <div style="display:grid;gap:4px"><span class="label">Or watch a student who…</span><div class="chips" id="as"><button type="button" data-p="right">does it properly</button><button type="button" data-p="double">makes two slips that cancel</button><button type="button" data-p="slip">slips in move 1 only</button><button type="button" data-p="flip">only flips signs</button></div></div>
      </div>
      <div class="secsvg"><svg viewBox="0 0 420 330" id="sv"></svg></div></div>`;
  const svg = $("#sv", w);
  const mags = () => { $("#m1", w).textContent = Math.abs(st.n1); $("#m2", w).textContent = Math.abs(st.n2); };
  const ready = () => ($("#build", w).disabled = !(st.s1 && st.s2));
  wirePickers(w, st, () => { mags(); api.note(`Move 1: ${sgn(st.n1)} and ${sgn(st.n2)}`); }, -6, 6);
  ["s1", "s2"].forEach((k) => $(`#${k}`, w).addEventListener("click", (e) => { st[k] = st[k] === "+" ? "−" : "+"; e.currentTarget.textContent = st[k]; e.currentTarget.classList.add("set"); api.note(`Move 2: bracket ${k === "s1" ? 1 : 2} gets ${st[k]}`); ready(); }));
  const an = () => {
    const b1 = (st.s1 === "−" ? -1 : 1) * Math.abs(st.n1), b2 = (st.s2 === "−" ? -1 : 1) * Math.abs(st.n2);
    const nR = st.n1 * st.n2 === -6 && st.n1 + st.n2 === -1, nS = st.n1 * st.n2 === -6 && st.n1 + st.n2 === 1, car = b1 === st.n1 && b2 === st.n2, fl = b1 === -st.n1 && b2 === -st.n2, fin = b1 * b2 === -6 && b1 + b2 === -1;
    return { b1, b2, nR, nS, car, fl, fin };
  };
  function facade() {
    const r = an();
    svg.innerHTML = `<rect x="40" y="40" width="340" height="250" fill="rgba(244,248,255,.05)" stroke="${W}" stroke-width="2"/>${[0, 1, 2].map((i) => `<rect x="${80 + i * 100}" y="80" width="60" height="70" fill="none" stroke="${FAINT}"/>`).join("")}<rect x="180" y="200" width="60" height="90" fill="none" stroke="${FAINT}"/>
      <rect x="90" y="160" width="240" height="34" fill="rgba(13,53,99,.9)" stroke="${W}"/><text x="210" y="184" text-anchor="middle" font-size="20" fill="#f4f8ff" font-family="IBM Plex Mono">(x ${pm(r.b1)})(x ${pm(r.b2)})</text>
      <text x="210" y="28" text-anchor="middle" font-size="14" fill="${r.fin ? "#7cf2c9" : "#ff7b66"}">Facade check: ${r.fin ? "expands to x² − x − 6 ✓" : "doesn't expand to x² − x − 6 ✗"}</text>
      <line id="cl" x1="20" y1="230" x2="20" y2="230" stroke="#ff7b66" stroke-width="2" stroke-dasharray="10 4 2 4"/><g id="secg"></g>`;
    $("#cut", w).disabled = false;
    api.note(`Built the facade: (x ${pm(r.b1)})(x ${pm(r.b2)})`);
  }
  function cut() {
    const r = an(), g = $("#secg", svg);
    const L = [["Finish · the answer people see", `(x ${pm(r.b1)})(x ${pm(r.b2)})`, r.fin], ["Structure · move 2, into the brackets", r.car ? "signs carried straight in" : r.fl ? "both signs flipped on the way in" : "one carried, one flipped", r.car], ["Foundation · move 1, the numbers", `${sgn(st.n1)} and ${sgn(st.n2)}: add to ${sgn(st.n1 + st.n2)}`, r.nR]];
    g.innerHTML = `<rect x="40" y="40" width="340" height="250" fill="#0d3563" stroke="${W}" stroke-width="2"/>` + L.map(([lab, t, ok], i) => {
      const y = 52 + i * 80, pat = ["rgba(244,248,255,.1)", "rgba(255,209,102,.14)", "rgba(244,248,255,.04)"][i];
      return `<g class="ly"><rect x="56" y="${y}" width="308" height="68" fill="${pat}" stroke="${ok ? "#7cf2c9" : "#ff7b66"}" stroke-width="2"/>${i === 2 ? `<path d="M56 ${y + 68} l10 -10 m10 10 l10 -10 m10 10 l10 -10 m10 10 l10 -10 m10 10 l10 -10" stroke="${FAINT}"/>` : ""}<text x="68" y="${y + 22}" font-size="12" fill="rgba(244,248,255,.62)" font-family="IBM Plex Sans Condensed">${lab.toUpperCase()}</text><text x="68" y="${y + 50}" font-size="17" fill="#f4f8ff" font-family="IBM Plex Mono">${t}</text><text x="352" y="${y + 44}" text-anchor="end" font-size="26" fill="${ok ? "#7cf2c9" : "#ff7b66"}">${ok ? "✓" : "✗"}</text></g>`;
    }).join("");
    if (!RM) gsap.timeline().to($("#cl", svg), { attr: { x2: 400 }, duration: .5, ease: "power2.inOut" }).from($$(".ly", svg), { x: -30, opacity: 0, stagger: .15, duration: .45, ease: "power3.out" });
    let t;
    if (r.nR && r.car) t = "<b>Sound all the way down.</b> Every layer checks out.";
    else if (r.nS && r.fl) t = "<b>A sound facade on a cracked structure.</b> The numbers had the wrong signs, and so did the bracket step, so they cancel. An answer-only check passes this every time. It fails when they split the middle term in Class 9.";
    else if (r.nS) t = "<b>The foundation is off:</b> a sign slip in move 1, carried faithfully upward.";
    else if (r.nR && r.fl) t = "<b>Good foundation, failed structure:</b> the right numbers, flipped on the way into the brackets.";
    else t = "<b>The foundation doesn't hold:</b> the numbers don't fit the product–sum rule.";
    api.noticed(t); api.note(`Section: foundation ${L[2][2] ? "✓" : "✗"}, structure ${L[1][2] ? "✓" : "✗"}, finish ${r.fin ? "✓" : "✗"}`, r.nS && r.fl ? "warn" : "good");
    api.learn("PAIR", .85); if (!L[2][2] || !L[1][2]) api.learn("SIGNS", .85);
  }
  $("#build", w).addEventListener("click", facade); $("#cut", w).addEventListener("click", cut);
  const PRE = { right: [-3, 2, "−", "+"], double: [3, -2, "−", "+"], slip: [3, -2, "+", "−"], flip: [-3, 2, "+", "−"] };
  $$("#as button", w).forEach((b) => b.addEventListener("click", () => {
    $$("#as button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const [n1, n2, s1, s2] = PRE[b.dataset.p]; Object.assign(st, { n1, n2, s1, s2 });
    $("#n1", w).textContent = sgn(n1); $("#n2", w).textContent = sgn(n2);
    [["s1", s1], ["s2", s2]].forEach(([k, v]) => { const e = $(`#${k}`, w); e.textContent = v; e.classList.add("set"); });
    mags(); ready(); facade(); setTimeout(cut, RM ? 0 : 700);
  }));
  svg.innerHTML = `<rect x="40" y="40" width="340" height="250" fill="none" stroke="${FAINT}" stroke-dasharray="6 6"/><text x="210" y="170" text-anchor="middle" font-size="16" fill="${FAINT}">facade goes here</text>`;
  return () => {};
} };

// ===== A-09 Four elevations =====
GAMES.elev = { mount(w, api) {
  const C = [{ n: "North", b: 5, c: 6, ok: ["+", "+"] }, { n: "East", b: -5, c: 6, ok: ["−", "−"] }, { n: "South", b: 1, c: -6, ok: ["−", "+"] }, { n: "West", b: -1, c: -6, ok: ["+", "−"] }];
  const RULES = [{ name: "The real rule: signs multiply to the last sign and add to the middle", pred: C.map((c) => c.ok) }, { name: "Copy the middle sign into both brackets", pred: [["+", "+"], ["−", "−"], ["+", "+"], ["−", "−"]] }, { name: "The minus always goes on the smaller number", pred: [["+", "+"], ["−", "−"], ["−", "+"], ["−", "+"]] }, { name: "First bracket copies the middle sign, second the last", pred: [["+", "+"], ["−", "+"], ["+", "−"], ["−", "−"]] }, { name: "Flip every sign into the brackets", pred: C.map((c) => c.ok.map((s) => (s === "+" ? "−" : "+"))) }];
  const ex = (b, c) => `x² ${b < 0 ? "−" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}x ${c < 0 ? "−" : "+"} ${Math.abs(c)}`;
  const house = (i) => `<svg viewBox="0 0 220 150"><path d="M30 60 L110 18 L190 60" fill="none" stroke="${W}" stroke-width="1.6"/><rect x="40" y="60" width="140" height="80" fill="rgba(244,248,255,.04)" stroke="${W}" stroke-width="1.6"/>${[0, 1].map((k) => `<rect class="win" x="${58 + k * 74}" y="76" width="30" height="26" fill="transparent" stroke="${FAINT}"/>`).join("")}<rect x="96" y="104" width="28" height="36" fill="none" stroke="${FAINT}"/><line x1="10" y1="140" x2="210" y2="140" stroke="${W}"/><text x="110" y="52" text-anchor="middle" font-size="12" fill="${FAINT}">${C[i].n.toUpperCase()} ELEVATION</text></svg>`;
  w.innerHTML = `<p class="q">Each elevation factorises with the numbers 2 and 3. Set the two signs for each. The windows light up when an elevation is done.</p>
    <div class="elevs">${C.map((c, i) => `<div class="elev" data-i="${i}">${house(i)}<span class="m">${ex(c.b, c.c)}</span><span class="brk">(x <button class="tog" type="button" data-c="${i}" data-k="0">?</button> 2)(x <button class="tog" type="button" data-c="${i}" data-k="1">?</button> 3)</span></div>`).join("")}</div>
    <div class="row"><button class="btn solid" id="chk" type="button" disabled>Check against the spec</button></div><div class="spec" id="spec"></div>`;
  const picks = C.map(() => [null, null]);
  $$(".elev .tog", w).forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.c, k = +b.dataset.k; picks[i][k] = picks[i][k] === "+" ? "−" : "+"; b.textContent = picks[i][k]; b.classList.add("set");
    if (!picks[i].includes(null)) { gsap.to($$(`.elev[data-i="${i}"] .win`, w), { attr: { fill: "rgba(255,209,102,.35)" }, duration: .5, stagger: .1 }); api.note(`${C[i].n}: (x ${picks[i][0]} 2)(x ${picks[i][1]} 3)`); }
    $("#chk", w).disabled = picks.some((p) => p.includes(null));
  }));
  $("#chk", w).addEventListener("click", () => {
    const sc = RULES.map((r) => r.pred.map((p, i) => p[0] === picks[i][0] && p[1] === picks[i][1])), best = sc.map((s, k) => [s.filter(Boolean).length, k]).sort((a, b) => b[0] - a[0])[0];
    const nR = picks.filter((p, i) => p[0] === C[i].ok[0] && p[1] === C[i].ok[1]).length;
    $("#spec", w).innerHTML = `<span class="label">Spec notes</span>` + RULES.map((r, k) => `<div class="specrow" data-k="${k}"><span>${r.name}</span><span class="dots">${sc[k].map((o) => `<i class="${o ? "on" : ""}"></i>`).join("")}</span></div>`).join("");
    if (!RM) gsap.from($$(".specrow", w), { x: -16, opacity: 0, stagger: .08, duration: .35 });
    let t;
    if (best[0] === 4) { setTimeout(() => $(`.specrow[data-k="${best[1]}"]`, w).classList.add("match"), RM ? 0 : 700); t = best[1] === 0 ? "<b>All four elevations follow the real rule.</b>" : `<b>Every elevation follows “${RULES[best[1]].name}”.</b> ${nR ? `${nR} of 4 came out right anyway, so a single question could have marked this student correct.` : "Consistent, so this is a misconception."}`; }
    else t = `<b>No known rule fits all four</b> (closest ${best[0]} of 4). Guessing signs: doesn't know yet.`;
    api.noticed(t); api.learn("SIGNS", best[0] === 4 ? .9 : .35);
  });
  return () => {};
} };

// ===== A-10 Sketch, then trace =====
GAMES.trace = { mount(w, api) {
  const O = [{ t: "(x − 5)(x + 3)", e: "x² − 2x − 15", k: "flip" }, { t: "(x + 15)(x − 1)", e: "x² + 14x − 15", k: "prod" }, { t: "(x + 5)(x − 3)", e: "x² + 2x − 15", k: "right" }, { t: "(x − 15)(x + 1)", e: "x² − 14x − 15", k: "prod" }];
  const st = { p1: 1, p2: 1 };
  w.innerHTML = `<p class="q">Factorise <span class="m">x² + 2x − 15</span>. Sketch your answer freehand first. The tracing overlays stay frosted until you do.</p>
    <div class="sketch">Your sketch: (x + ${picker("p1", 1)})(x + ${picker("p2", 1)})<button class="btn solid" id="commit" type="button">Commit sketch</button></div>
    <div class="overlays" id="ovs"><div class="frost" id="fr">Overlays clear after you commit your sketch</div>${O.map((o, i) => `<button class="ov" type="button" data-i="${i}" disabled aria-pressed="false"><span class="m">${o.t}</span><span class="exp"></span></button>`).join("")}</div>
    <div class="row"><button class="btn" id="peek" type="button">▶ Watch someone trace every overlay</button></div>`;
  wirePickers(w, st, null, -15, 15);
  let pred = null, tl = null;
  $("#commit", w).addEventListener("click", () => {
    pred = { ...st }; $("#commit", w).disabled = true; $$("[data-np]", w).forEach((b) => (b.disabled = true));
    api.note(`Sketched (x ${pm(pred.p1)})(x ${pm(pred.p2)}) before seeing the overlays`, "good");
    gsap.to("#fr", { opacity: 0, duration: RM ? 0 : .7, onComplete: () => ($("#fr", w).hidden = true) }); $$(".ov", w).forEach((b) => (b.disabled = false));
  });
  $$(".ov", w).forEach((b) => b.addEventListener("click", () => {
    $$(".ov", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const o = O[+b.dataset.i], pk = pred.p1 * pred.p2 === -15 && pred.p1 + pred.p2 === 2 ? "right" : pred.p1 * pred.p2 === -15 && pred.p1 + pred.p2 === -2 ? "flip" : pred.p1 * pred.p2 === -15 ? "prod" : "other";
    const t = pk === "right" && o.k === "right" ? "<b>Sketched it, then traced it.</b> Real factorising." : o.k === "right" ? "<b>The sketch was off, but the trace is right.</b> They most likely found it by checking the overlays. That's expanding, an easier skill." : pk === o.k ? `<b>The same mistake twice, independently</b> (${o.k === "flip" ? "signs flipped" : "right product, wrong sum"}).` : "<b>Sketch and trace disagree, and both are wrong.</b> Doesn't know yet.";
    api.noticed(t); api.note(`Traced ${o.t} (sketch was ${pk})`); api.learn("PAIR", o.k === "right" && pk === "right" ? .9 : .6);
  }));
  $("#peek", w).addEventListener("click", () => {
    $("#fr", w).hidden = true; tl && tl.kill(); const ovs = $$(".ov", w); ovs.forEach((o) => ($(".exp", o).innerHTML = "")); tl = gsap.timeline();
    O.slice(0, 3).forEach((o, i) => tl.to(ovs[i], { y: -8, duration: .25 }).call(() => ($(".exp", ovs[i]).innerHTML = o.k === "right" ? `= ${o.e} ✓` : `<s>= ${o.e}</s>`)).to({}, { duration: .55 }).to(ovs[i], { y: 0, duration: .2 }));
    tl.call(() => api.noticed("That's tracing: lay each overlay on the target until one matches. The tick lands on the right answer and no factorising happened."));
  });
  return () => tl && tl.kill();
} };

// ===== A-11 Door schedule =====
GAMES.schedule = { mount(w, api) {
  const R = [{ mk: "A", q: "x² − 9", o: ["(x − 3)(x + 3)", "(x − 3)²", "(x − 9)(x + 1)"] }, { mk: "B", q: "x² − 25", o: ["(x − 5)²", "(x − 5)(x + 5)", "(x − 25)(x + 1)"] }, { mk: "C", q: "4x² − 1", o: ["(4x − 1)(x + 1)", "(2x − 1)²", "(2x − 1)(2x + 1)"] }, { mk: "D", q: "x² + 16", o: ["(x − 4)(x + 4)", "(x + 4)²", "Can't be factorised"], trap: true }];
  w.innerHTML = `<p class="q">Complete the door schedule. Factorise each door's size, or mark it as one that can't be factorised. Work quickly.</p>
    <div class="schedwrap"><table class="sched"><thead><tr><th>Mark</th><th>Size</th><th>Factorised as</th><th>Time</th></tr></thead><tbody id="tb"></tbody></table></div>`;
  const tb = $("#tb", w), times = [], picks = []; let i = 0, shown = 0;
  function next() {
    if (i >= R.length) return finish();
    const r = R[i], tr = html(`<table><tbody><tr class="${r.trap ? "trap" : ""}"><td class="mk">${r.mk}</td><td class="m">${r.q}</td><td><div class="opts">${r.o.map((o, k) => `<button type="button" data-k="${k}" aria-pressed="false">${o}</button>`).join("")}</div></td><td class="gantt"><div class="bar"></div><small class="m"></small></td></tr></tbody></table>`).querySelector("tr");
    tb.appendChild(tr); if (!RM) gsap.from(tr, { x: 40, opacity: 0, duration: .4, ease: "power3.out" });
    shown = performance.now();
    $$(".opts button", tr).forEach((b) => b.addEventListener("click", () => {
      const t = Math.max(.3, (performance.now() - shown) / 1000); times.push(t); picks.push(+b.dataset.k);
      $$(".opts button", tr).forEach((x) => { x.disabled = true; x.setAttribute("aria-pressed", String(x === b)); });
      gsap.to($(".bar", tr), { width: `${Math.min(100, (t / 8) * 100)}%`, duration: .6, ease: "power3.out" }); $("small", tr).textContent = `${t.toFixed(1)}s`;
      api.note(`Door ${r.mk}: ${r.o[+b.dataset.k]} in ${t.toFixed(1)}s`, r.trap ? "warn" : ""); i++; setTimeout(next, RM ? 0 : 350);
    }));
  }
  function finish() {
    const base = (times[0] + times[1] + times[2]) / 3, ratio = times[3] / base, p = picks[3];
    const t = p === 0 ? `<b>Autopilot on door D.</b> Carried the difference-of-squares pattern onto a plus sign${ratio < 1.4 ? `, at their usual pace (${ratio.toFixed(1)}×)` : ""}. Treat rows A–C with care.` : p === 1 ? "<b>Noticed door D was different</b>, but thinks x² + 16 = (x + 4)². A sum-of-squares belief." : ratio >= 1.4 ? `<b>Noticed the switch.</b> Slowed down on door D (${ratio.toFixed(1)}× usual) and checked.` : "<b>Spotted door D instantly.</b>";
    api.noticed(t); api.learn("SQUARES", .85);
  }
  next();
  return () => {};
} };
