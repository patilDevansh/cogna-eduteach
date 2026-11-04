// ===== A-12 Revision table =====
GAMES.revisions = { mount(w, api) {
  const RIGHT = ["(x+5)(x-2)", "(x-2)(x+5)"], BUGS = { "(x-5)(x+2)": "the sign-flipped answer", "(x+2)(x-5)": "the sign-flipped answer", "(x+10)(x-1)": "a right-product, wrong-sum answer", "(x-10)(x+1)": "a right-product, wrong-sum answer" };
  w.innerHTML = `<p class="q">Letter the factorisation of <span class="m">x² + 3x − 10</span> (use - for minus). When you issue the drawing, every change you made shows up as a revision.</p>
    <div class="row"><input class="letterin" id="li" autocomplete="off" spellcheck="false" placeholder="(x + ?)(x − ?)" aria-label="Your answer"><button class="btn solid" id="issue" type="button">Issue drawing</button></div>
    <div class="drawarea" id="da"><span class="label">Drawing</span></div>
    <table class="revtable"><thead><tr><th>Rev</th><th>Time</th><th>Lettering</th><th>Status</th></tr></thead><tbody id="rt"></tbody></table>
    <div class="tline" id="tl"></div>
    <div style="display:grid;gap:4px"><span class="label">Or issue someone else's drawing</span><div class="chips" id="as"><button type="button" data-p="fix">they fixed a sign</button><button type="button" data-p="clean">they lettered it straight</button><button type="button" data-p="stuck">they stalled</button></div></div>`;
  const input = $("#li", w); let hist = [], t0 = null, timers = [];
  input.addEventListener("input", () => { const n = performance.now(); if (t0 === null) t0 = n; hist.push({ t: (n - t0) / 1000, v: input.value }); });
  const norm = (s) => s.replace(/\s+/g, "").replace(/[−–]/g, "-").toLowerCase(), esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const script = (ops) => { const h = []; let t = 0, v = ""; for (const o of ops) { if (o.type) for (const ch of o.type) { t += o.d ?? .2; v += ch; h.push({ t, v }); } if (o.wait) t += o.wait; if (o.back) for (let k = 0; k < o.back; k++) { t += .1; v = v.slice(0, -1); h.push({ t, v }); } } return h; };
  const SAMPLES = { fix: script([{ type: "(x-5)(x+2)" }, { wait: 2.6 }, { back: 8 }, { type: "+5)(x-2)" }]), clean: script([{ wait: 1.2 }, { type: "(x+5)(x-2)", d: .16 }]), stuck: script([{ type: "(x+" }, { wait: 4.2 }, { type: "10)(x-1)", d: .24 }]) };
  function cloudPath(wd, ht) { const r = 8; let d = `M${r} 0`; for (let x = r; x < wd - r; x += 2 * r) d += ` a${r} ${r} 0 0 1 ${2 * r} 0`; for (let y = 0; y < ht; y += 2 * r) d += ` a${r} ${r} 0 0 1 0 ${2 * r}`; for (let x = wd - r; x > r; x -= 2 * r) d += ` a${r} ${r} 0 0 1 ${-2 * r} 0`; for (let y = ht; y > 0; y -= 2 * r) d += ` a${r} ${r} 0 0 1 0 ${-2 * r}`; return d; }
  function issue(h, who) {
    timers.forEach(clearTimeout); timers = [];
    const da = $("#da", w), rt = $("#rt", w), tl = $("#tl", w); da.innerHTML = `<span class="label">Drawing</span>`; rt.innerHTML = ""; tl.innerHTML = "";
    const drafts = []; h.forEach((s, k) => { const nx = h[k + 1], pv = h[k - 1]; if (nx && nx.v.length < s.v.length && (!pv || pv.v.length <= s.v.length)) drafts.push(s); });
    const fin = h.at(-1), revs = [...drafts.map((d) => ({ ...d, old: true })), { ...fin, old: false }], T = Math.max(1, fin.t + .5);
    h.forEach((s, k) => { const p = k ? h[k - 1] : { t: 0, v: "" }, gap = s.t - p.t; if (gap > 1.5) tl.insertAdjacentHTML("beforeend", `<b style="left:${(p.t / T) * 100}%;width:${(gap / T) * 100}%"></b>`); tl.insertAdjacentHTML("beforeend", `<i class="${s.v.length < p.v.length ? "d" : ""}" style="left:${(s.t / T) * 100}%"></i>`); });
    revs.forEach((r, k) => timers.push(setTimeout(() => {
      const letter = String.fromCharCode(65 + k), row = html(`<div class="revrow ${r.old ? "old" : ""}"><span class="tri">${letter}</span><span class="t">${esc(r.v)}</span></div>`);
      da.appendChild(row); if (!RM) gsap.from(row, { opacity: 0, x: -10, duration: .35 });
      if (r.old) { const b = row.getBoundingClientRect(), cw = b.width + 36, ch = b.height + 24, svg = html(`<svg class="cloud" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none"><path d="${cloudPath(cw - 2, ch - 2)}" transform="translate(1 1)" fill="none" stroke="#ff7b66" stroke-width="1.6"/></svg>`); row.appendChild(svg); const p = $("path", svg), L = p.getTotalLength(); if (!RM) gsap.fromTo(p, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: .8, ease: "power2.inOut" }); }
      rt.insertAdjacentHTML("beforeend", `<tr><td>${letter}</td><td class="m">0:${r.t.toFixed(1).padStart(4, "0")}</td><td class="m">${esc(r.v)}</td><td>${r.old ? (BUGS[norm(r.v)] ? `<span style="color:#ff7b66">Superseded · ${BUGS[norm(r.v)]}</span>` : "Superseded") : "Issued"}</td></tr>`);
    }, RM ? 0 : k * 900)));
    timers.push(setTimeout(() => {
      const buggy = drafts.map((d) => BUGS[norm(d.v)]).filter(Boolean), dels = h.filter((s, k) => k && s.v.length < h[k - 1].v.length).length, right = RIGHT.includes(norm(fin.v));
      let lg = { gap: 0, at: "" }; h.forEach((s, k) => { const gap = s.t - (k ? h[k - 1].t : 0); if (gap > lg.gap) lg = { gap, at: k ? h[k - 1].v : "" }; });
      let t = right && buggy.length ? `<b>Issued right, but Rev A was ${buggy[0]}.</b> They caught it this time. The mistake is still live, so Lotus keeps watching for it.` : right && !dels ? "<b>Lettered straight through, with one revision.</b> Fluent." : right ? `<b>Right, after ${drafts.length} superseded revision${drafts.length === 1 ? "" : "s"}.</b> None matched a known mistake.` : BUGS[norm(fin.v)] ? `<b>Issued ${BUGS[norm(fin.v)]}.</b>` : "<b>Issued a lettering that isn't the factorisation.</b>";
      if (lg.gap > 1.5) t += ` Longest pause: ${lg.gap.toFixed(1)}s${lg.at ? ` after “${esc(lg.at)}”` : " before starting"}.`;
      api.noticed(t); api.note(`${who}: ${revs.length} revision${revs.length > 1 ? "s" : ""}${buggy.length ? ", a superseded one matched a known mistake" : ""}`, buggy.length ? "warn" : "good");
      api.learn("PAIR", buggy.length ? .6 : .85);
    }, RM ? 0 : revs.length * 900 + 200));
  }
  $("#issue", w).addEventListener("click", () => (hist.length ? issue(hist, "Your drawing") : input.focus()));
  $$("#as button", w).forEach((b) => b.addEventListener("click", () => { $$("#as button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); issue(SAMPLES[b.dataset.p], `A drawing where ${b.textContent}`); }));
  return () => timers.forEach(clearTimeout);
} };

// ===== A-13 Every room of area 12 =====
GAMES.lots = { mount(w, api) {
  const VALID = [-13, -8, -7, 7, 8, 13], PAIRS = { 13: [1, 12], 8: [2, 6], 7: [3, 4], "-13": [-1, -12], "-8": [-2, -6], "-7": [-3, -4] };
  w.innerHTML = `<p class="q">A room has area <span class="m">x² + bx + 12</span>, with sides of the form x plus or minus a whole number. Flag <b>every</b> value of b on the scale rule that gives a real room.</p>
    <div class="lots"><svg viewBox="0 0 640 110" id="rule"></svg></div>
    <div class="row"><button class="btn solid" id="done" type="button" disabled>That's every room</button><span class="label" id="cnt">No flags yet</span></div>
    <div class="lots"><svg viewBox="0 0 640 190" id="rooms2"></svg></div>`;
  const rule = $("#rule", w), X = (v) => 20 + ((v + 15) / 30) * 600;
  let s = `<rect x="10" y="40" width="620" height="44" fill="rgba(244,248,255,.05)" stroke="${W}" stroke-width="1.5"/>`;
  for (let v = -15; v <= 15; v++) { const big = v % 5 === 0; s += `<line x1="${X(v)}" y1="40" x2="${X(v)}" y2="${big ? 60 : 52}" stroke="${W}" stroke-width="${big ? 1.5 : 1}"/>${big ? `<text x="${X(v)}" y="76" text-anchor="middle" font-size="12" fill="${W}" font-family="IBM Plex Mono">${v}</text>` : ""}`; if (v) s += `<rect class="flagbtn" data-v="${v}" x="${X(v) - 9}" y="30" width="18" height="56" fill="transparent" tabindex="0" role="button" aria-label="b = ${v}"/>`; }
  rule.innerHTML = s + `<g id="flags"></g>`;
  const picked = [];
  function flags() { $("#flags", rule).innerHTML = picked.map((v, k) => `<g transform="translate(${X(v)} 40)"><line x1="0" y1="0" x2="0" y2="-34" stroke="#ffd166" stroke-width="1.5"/><path d="M0 -34 L16 -28 L0 -22Z" fill="#ffd166"/><text x="2" y="-38" font-size="10" fill="#ffd166" font-family="IBM Plex Mono">${k + 1}</text></g>`).join(""); $("#cnt", w).textContent = picked.length ? `${picked.length} flagged` : "No flags yet"; $("#done", w).disabled = !picked.length; }
  function toggle(v) { const i = picked.indexOf(v); if (i >= 0) { picked.splice(i, 1); api.note(`Removed flag b = ${sgn(v)}`, "warn"); } else { picked.push(v); api.note(`Flagged b = ${sgn(v)}`); } flags(); if (!RM && i < 0) gsap.from($("#flags g:last-child", rule), { y: -20, opacity: 0, duration: .35, ease: "bounce.out" }); }
  $$(".flagbtn", rule).forEach((r) => { r.addEventListener("click", () => toggle(+r.dataset.v)); r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(+r.dataset.v); } }); });
  $("#done", w).addEventListener("click", () => {
    $("#done", w).disabled = true;
    const found = picked.filter((v) => VALID.includes(v)), wrong = picked.filter((v) => !VALID.includes(v)), neg = found.filter((v) => v < 0);
    const r2 = $("#rooms2", w), B = 40, k = 2.2;
    r2.innerHTML = VALID.map((v, i) => {
      const [p, q] = PAIRS[v], hit = found.includes(v), cx = 20 + i * 104, ww = B + p * k, hh = B + q * k, col = hit ? "#ffd166" : "#ff7b66";
      return `<g class="rc" transform="translate(${cx} 30)"><rect x="20" y="40" width="${B}" height="${B}" fill="none" stroke="${FAINT}" stroke-dasharray="3 3"/><rect x="20" y="40" width="${Math.max(3, ww)}" height="${Math.max(3, hh)}" fill="${hit ? "rgba(255,209,102,.15)" : "none"}" stroke="${col}" stroke-width="1.6" ${hit ? "" : 'stroke-dasharray="4 3"'}/><text x="40" y="20" text-anchor="middle" font-size="14" fill="${col}" font-family="IBM Plex Mono">b = ${sgn(v)}</text><text x="40" y="150" text-anchor="middle" font-size="12" fill="${W}" font-family="IBM Plex Mono">(x ${pm(p)})(x ${pm(q)})</text>${v < 0 ? `<text x="40" y="168" text-anchor="middle" font-size="11" fill="${FAINT}">inside x²</text>` : ""}</g>`;
    }).join("");
    if (!RM) gsap.from($$(".rc", r2), { opacity: 0, y: 14, stagger: .12, duration: .4 });
    let t = found.length === 6 ? "<b>All six rooms.</b>" : found.length === 3 && !neg.length ? "<b>Found the three rooms bigger than x², and none of the rooms that fit inside it.</b> Forgets that two negatives also multiply to +12 (the “no negative pairs” mistake), now with solid evidence." : found.length <= 2 ? `<b>Found ${found.length}.</b> Knows an example, not the whole set.` : `<b>Found ${found.length} of 6.</b>`;
    const pos = picked.filter((v) => v > 0 && VALID.includes(v)).join(); if (pos === "13,8,7" || pos === "7,8,13") t += " Listed them in order, which is systematic.";
    if (wrong.some((v) => [12, -12, 1, -1].includes(v))) t += " Flagged 12 or 1, mixing up b with a factor of 12."; else if (wrong.length) t += ` ${wrong.length} flag${wrong.length > 1 ? "s" : ""} that give no room: ${wrong.map(sgn).join(", ")}.`;
    api.noticed(t); api.learn("PAIR", found.length === 6 ? .9 : .7); if (!neg.length) api.learn("SIGNS", .8);
  });
  return () => {};
} };

// ===== A-14 Module =====
GAMES.module = { mount(w, api) {
  const P = {
    block: { label: "Block (x + 3) as one module", lines: ["(x + 3)² − 16", "A² − 4²", "(A − 4)(A + 4)", "(x + 3 − 4)(x + 3 + 4)", "(x − 1)(x + 7)"], t: "<b>Blocked (x + 3) as one module.</b> Saw A² − 4². That's structure sense: spotting a difference of squares wherever it hides.", c: .9 },
    expand: { label: "Expand the bracket first", lines: ["(x + 3)² − 16", "x² + 6x + 9 − 16", "x² + 6x − 7", "(x + 7)(x − 1)"], t: "<b>Right, the long way.</b> Four lines and a product–sum search. They can do it but didn't see the structure, and an answer-only check would call this full mastery.", c: .7 },
    root: { label: "Square-root each part", lines: ["(x + 3)² − 16", "(x + 3) − 4", "x − 1"], t: "<b>Square-rooted each part.</b> Thinks √(a − b) = √a − √b. A different misconception, worth its own follow-up.", c: .85 },
  };
  w.innerHTML = `<div class="modq"><p class="q">Factorise this. What's your first move?</p><div class="big"><span class="chunk" id="ck">(x + 3)</span>² − 16</div>
    <div class="mvs">${Object.entries(P).map(([k, p]) => `<button class="mv" type="button" data-k="${k}" aria-pressed="false">${p.label}</button>`).join("")}</div></div>
    <div class="modgrid"><div class="steps" id="steps"><span class="label">Working</span></div><svg viewBox="0 0 320 300" id="ls" style="width:100%;height:auto"></svg></div>
    <div class="mental" id="mn" hidden><p class="q">Now in your head: <span class="m">99² − 1</span> = ?</p><div class="row"><input id="mi" inputmode="numeric" autocomplete="off" aria-label="99 squared minus 1"><button class="btn solid" id="ms" type="button">Done</button></div></div>`;
  const ls = $("#ls", w); let tl = null, start = 0, chosen = null;
  ls.innerHTML = `<text x="160" y="150" text-anchor="middle" font-size="14" fill="${FAINT}">the module drawing appears here</text>`;
  function lshape() {
    const A = 180, F = 64, x0 = 30, y0 = 40;
    ls.innerHTML = `<defs><pattern id="hx" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,123,102,.5)"/></pattern></defs>
      <rect id="cutq" x="${x0 + A - F}" y="${y0 + A - F}" width="${F}" height="${F}" fill="url(#hx)" stroke="#ff7b66" stroke-dasharray="4 3"/>
      <rect id="r1" x="${x0}" y="${y0}" width="${A}" height="${A - F}" fill="rgba(255,209,102,.14)" stroke="#ffd166" stroke-width="1.6"/>
      <rect id="r2" x="${x0}" y="${y0 + A - F}" width="${A - F}" height="${F}" fill="rgba(154,209,255,.16)" stroke="#9ad1ff" stroke-width="1.6"/>
      <text id="lA" x="${x0 + A / 2}" y="${y0 - 10}" text-anchor="middle" font-size="16" fill="${W}">A</text><text id="l4" x="${x0 + A - F / 2}" y="${y0 + A + 18}" text-anchor="middle" font-size="14" fill="#ff7b66">4 × 4 cut out</text>
      <text id="lW" x="${x0 + (A + F) / 2}" y="${y0 - 10}" text-anchor="middle" font-size="16" fill="#ffd166" opacity="0">A + 4</text><text id="lH" transform="translate(${x0 - 10} ${y0 + (A - F) / 2}) rotate(-90)" text-anchor="middle" font-size="16" fill="#ffd166" opacity="0">A − 4</text>`;
    return gsap.timeline().from(ls.children, { opacity: 0, duration: .4, stagger: .1 })
      .to("#cutq", { opacity: .25, duration: .4 }, "+=.4")
      .to("#r2", { attr: { x: x0 + A, y: y0, width: F, height: A - F }, duration: 1.1, ease: "power3.inOut" }, "+=.2")
      .to(["#lA", "#l4"], { opacity: 0, duration: .3 }, "<").to(["#lW", "#lH"], { opacity: 1, duration: .4 });
  }
  $$(".mv", w).forEach((b) => b.addEventListener("click", () => {
    $$(".mv", w).forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.disabled = true; });
    chosen = b.dataset.k; const p = P[chosen], steps = $("#steps", w);
    steps.innerHTML = `<span class="label">Working</span>` + p.lines.map((l, k) => `<div>${k ? '<span class="eq">=</span>' : ""}${l}</div>`).join("");
    const rows = $$("div", steps); gsap.set(rows, { opacity: 0, x: -10 });
    tl && tl.kill(); tl = gsap.timeline();
    if (chosen === "block") { $("#ck", w).classList.add("boxed"); tl.add(lshape()); }
    rows.forEach((r) => tl.to(r, { opacity: 1, x: 0, duration: RM ? 0 : .4 }, RM ? 0 : ">.15"));
    tl.call(() => { api.noticed(p.t); $("#mn", w).hidden = false; start = performance.now(); });
    if (RM) tl.progress(1);
    api.note(`First move: ${p.label} (${p.lines.length} lines)`, chosen === "block" ? "good" : chosen === "root" ? "warn" : "");
    api.learn("SQUARES", p.c);
  }));
  $("#ms", w).addEventListener("click", () => {
    const v = $("#mi", w).value.replace(/[^\d-]/g, ""), t = (performance.now() - start) / 1000;
    const r = v === "9800" && t <= 12 ? `<b>9800 in ${t.toFixed(0)}s.</b> That fast almost certainly means 98 × 100: the module idea carries over to plain numbers.` : v === "9800" ? `<b>9800 after ${t.toFixed(0)}s.</b> Probably 9801 − 1, the long way.` : `<b>${v || "No answer"}.</b> Not 9800; check for an arithmetic slip first.`;
    api.noticed(`${P[chosen].t}<br><br>${r}`); api.note(`99² − 1 → ${v || "blank"} in ${t.toFixed(1)}s`); $("#ms", w).disabled = true;
  });
  return () => tl && tl.kill();
} };

// ===== A-15 Inspection route =====
GAMES.inspect = { mount(w, api) {
  const S = ["M", "FLIP", "PROD", "SWAP", "UNK"], NAMES = { M: "Knows it", FLIP: "Flips signs into the brackets", PROD: "Matches the product, ignores the sum", SWAP: "Mixes up product and sum", UNK: "Doesn't know yet" };
  const u = (ks) => Object.fromEntries(ks.map((k) => [k, 1 / ks.length])), sl = (m, ks, p = .92) => Object.fromEntries(ks.map((k) => [k, k === m ? p : (1 - p) / (ks.length - 1)]));
  const QS = [
    { id: "A-02", name: "Pin the drawings", sec: 30, L: { M: sl("right", ["right", "sw", "ps", "po"]), FLIP: sl("sw", ["right", "sw", "ps", "po"]), PROD: { right: .31, sw: .31, po: .31, ps: .07 }, SWAP: sl("ps", ["right", "sw", "ps", "po"]), UNK: u(["right", "sw", "ps", "po"]) } },
    { id: "A-12", name: "Revision table", sec: 40, L: { M: { right: .92, other: .08 }, FLIP: { flip: .88, other: .12 }, PROD: { right: .5, prod: .45, other: .05 }, SWAP: { swap: .85, other: .15 }, UNK: { dunno: .5, other: .4, right: .1 } } },
    { id: "A-09", name: "Four elevations", sec: 60, L: { M: { all: .9, none: .1 }, FLIP: { flipped: .85, none: .15 }, PROD: { all: .4, none: .4, copy: .2 }, SWAP: { all: .3, none: .5, copy: .2 }, UNK: { none: .6, copy: .25, all: .1, flipped: .05 } } },
    { id: "A-03", name: "Submittal review", sec: 60, L: Object.fromEntries(S.map((s) => [s, { a: .5, b: .5 }])) },
    { id: "A-13", name: "Every room of area 12", sec: 45, L: { M: { ok: .9, no: .1 }, FLIP: { ok: .7, no: .3 }, PROD: { ok: .6, no: .4 }, SWAP: { ok: .5, no: .5 }, UNK: { ok: .25, no: .75 } } },
    { id: "old", name: "Fireflies (today's game)", sec: 20, L: { M: sl("r", ["r", "s", "o", "p"]), FLIP: sl("r", ["r", "s", "o", "p"]), PROD: { r: .31, s: .31, o: .31, p: .07 }, SWAP: u(["r", "s", "o", "p"]), UNK: u(["r", "s", "o", "p"]) } },
  ];
  for (const q of QS) { const R = [...new Set(S.flatMap((s) => Object.keys(q.L[s])))]; for (const s of S) q.L[s] = Object.fromEntries(R.map((r) => [r, .94 * (q.L[s][r] ?? 0) + .06 / R.length])); }
  const PRIOR = { M: .35, FLIP: .2, PROD: .15, SWAP: .1, UNK: .2 };
  w.innerHTML = `<p class="q">This sheet is Lotus's side, not a student game. Pick a hidden student. The inspector checks whichever sheet will reveal the most about them, and stops once sure.</p>
    <div class="chips" id="hid">${S.map((s) => `<button type="button" data-s="${s}" aria-pressed="${s === "FLIP"}">${NAMES[s]}</button>`).join("")}</div>
    <div class="insp"><table class="itable"><thead><tr><th>Sheet</th><th>Expected · per min</th><th class="ig">Value</th><th></th></tr></thead><tbody id="it"></tbody></table><div id="bel" style="display:grid;gap:6px;align-content:start"></div></div>
    <div class="row"><button class="btn solid" id="ask" type="button">Inspect the best sheet</button><button class="btn" id="rs" type="button">Start again</button></div>`;
  let hidden = "FLIP", belief = { ...PRIOR }, asked = [], done = false, resp = {};
  const H = (d) => -Object.values(d).reduce((t, p) => t + (p > 0 ? p * Math.log2(p) : 0), 0);
  const post = (b, q, r) => { const o = {}; let z = 0; for (const s of S) { o[s] = b[s] * (q.L[s][r] ?? 0); z += o[s]; } for (const s of S) o[s] = z ? o[s] / z : b[s]; return o; };
  const eig = (b, q) => { const rs = [...new Set(S.flatMap((s) => Object.keys(q.L[s])))]; let e = 0; for (const r of rs) { const pr = S.reduce((t, s) => t + b[s] * (q.L[s][r] ?? 0), 0); if (pr > 0) e += pr * H(post(b, q, r)); } return Math.max(0, H(b) - e); };
  function draw() {
    const lead = S.reduce((a, s) => (belief[s] > belief[a] ? s : a), S[0]);
    $("#bel", w).innerHTML = `<span class="label">What Lotus believes</span>` + S.map((s) => `<div class="belief ${s === lead ? "lead" : ""}"><span>${NAMES[s]}</span><em>${Math.round(belief[s] * 100)}%</em><span class="bb"><i data-w="${belief[s]}"></i></span></div>`).join("");
    $$(".belief .bb i", w).forEach((i) => gsap.to(i, { width: `${+i.dataset.w * 100}%`, duration: .7 }));
    const sc = QS.map((q) => { const g = eig(belief, q); return { q, g, pm: g / (q.sec / 60) }; }), best = sc.filter((x) => !asked.includes(x.q.id)).sort((a, b) => b.pm - a.pm)[0], mx = Math.max(.01, ...sc.map((x) => x.pm));
    $("#it", w).innerHTML = sc.map((x) => `<tr class="${x === best && !done ? "best" : ""} ${asked.includes(x.q.id) ? "asked" : ""}"><td><span class="m" style="font-size:.78rem">${x.q.id}</span> ${x.q.name}</td><td class="m" style="font-size:.8rem">${x.g.toFixed(2)} · ${x.pm.toFixed(2)}</td><td class="ig"><i data-w="${x.pm / mx}"></i></td><td class="tick">${resp[x.q.id] ? `✓ “${resp[x.q.id]}”` : ""}</td></tr>`).join("");
    $$(".itable .ig i", w).forEach((i) => gsap.to(i, { width: `${+i.dataset.w * 100}%`, duration: .7 }));
    return { best, lead };
  }
  function ask() {
    if (done) return; const { best } = draw();
    if (!best || best.g < .05) return stop("No sheet left is worth the student's time.");
    const L = best.q.L[hidden]; let x = Math.random(), acc = 0, r = Object.keys(L).at(-1);
    for (const [k, p] of Object.entries(L)) { acc += p; if (x <= acc) { r = k; break; } }
    belief = post(belief, best.q, r); asked.push(best.q.id); resp[best.q.id] = r;
    api.note(`Inspected ${best.q.name} (${best.g.toFixed(2)} bits expected): “${r}”`);
    const { lead } = draw();
    if (belief[lead] >= .85 && (lead === "M" || lead === "UNK" || asked.length >= 2)) stop(`Sure enough: “${NAMES[lead]}” at ${Math.round(belief[lead] * 100)}% after ${asked.length} sheet${asked.length > 1 ? "s" : ""}.${lead === hidden ? " That's the hidden student." : " Not the hidden student: answers include slips. Start again to retry."}`);
  }
  function stop(why) { done = true; draw(); $("#ask", w).disabled = true; api.noticed(`<b>The inspector stops.</b> ${why} A named mistake always needs a second, different sheet first.`); }
  function reset() { belief = { ...PRIOR }; asked = []; resp = {}; done = false; $("#ask", w).disabled = false; $(".redline.final", w)?.remove(); draw(); }
  $$("#hid button", w).forEach((b) => b.addEventListener("click", () => { hidden = b.dataset.s; $$("#hid button", w).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); reset(); }));
  $("#ask", w).addEventListener("click", ask); $("#rs", w).addEventListener("click", reset);
  draw();
  return () => {};
} };

// ===== A-16 Issued for construction =====
GAMES.ifc = { mount(w, api) {
  w.innerHTML = `<p class="q">Letter your factorisation of <span class="m">x² + 5x + 6</span> on the drawing. Before it's issued, the drafter letters it back and raises an RFI for anything unclear.</p>
    <div class="ifc"><div class="dimstring"><span class="label">Your lettering</span><input id="ri" autocomplete="off" spellcheck="false" value="x+2(x+3)" aria-label="Your answer"><div class="samples">${["x+2(x+3)", "(x+2)(x+3", "x2+5x+6", "(x+2)(x+3)", "(x+2)*(x+3)"].map((s) => `<button type="button">${s}</button>`).join("")}</div></div>
      <div class="dimstring"><span class="label">The drafter reads it as</span><div class="readback" id="rd"></div><div id="rfis" style="display:grid;gap:6px"></div><div class="row"><button class="btn solid" id="yes" type="button">Yes, issue it</button><button class="btn" id="fix" type="button">Take the drafter's fix</button></div><div class="ifcstamp" id="st">Issued for construction<small>read back · confirmed</small></div></div></div>`;
  const input = $("#ri", w); let sug = null;
  const pretty = (s) => s.replace(/\^2/g, "²").replace(/\*/g, " · ").replace(/-/g, " − ").replace(/\+/g, " + ");
  function an(raw) {
    let s = raw.replace(/\s+/g, "").replace(/[−–]/g, "-"); const iss = []; let fix = null;
    const o = (s.match(/\(/g) || []).length, c = (s.match(/\)/g) || []).length;
    if (/x2(?!\d)/.test(s) && !s.includes("^")) { iss.push("“x2” could be x² or x × 2. Read as x²."); s = s.replace(/x2(?!\d)/g, "x^2"); }
    if (o > c) { iss.push(`${o - c === 1 ? "A bracket is" : "Brackets are"} left open. Closed at the end.`); s += ")".repeat(o - c); }
    if (c > o) iss.push("An extra closing bracket.");
    const m = /^(x[+-]\d+)\((x[+-]\d+)\)$/.exec(s);
    if (m) { iss.push(`This reads as a sum, not two brackets multiplied. Did you mean (${pretty(m[1])})(${pretty(m[2])})?`); fix = `(${m[1]})(${m[2]})`; }
    if (/\^2/.test(s) && !/\(/.test(s)) iss.push("This is the expression itself, not factorised.");
    return { s, iss, fix };
  }
  function render() {
    const r = an(input.value); sug = r.fix; $("#rd", w).textContent = pretty(r.s) || " ";
    $("#rfis", w).innerHTML = r.iss.map((t, k) => `<div class="rfi"><b>RFI-${String(k + 1).padStart(2, "0")}</b><span>${t}</span></div>`).join("");
    $("#fix", w).hidden = !r.fix; gsap.set("#st", { opacity: 0 });
    if (!RM && r.iss.length) gsap.from($$(".rfi", w), { opacity: 0, x: -8, stagger: .08, duration: .3 });
    return r;
  }
  input.addEventListener("input", render);
  $$(".samples button", w).forEach((b) => b.addEventListener("click", () => { input.value = b.textContent; const r = render(); api.note(`Lettered “${b.textContent}”: ${r.iss.length ? `${r.iss.length} RFI${r.iss.length > 1 ? "s" : ""}` : "clear"}`, r.iss.length ? "warn" : ""); }));
  $("#fix", w).addEventListener("click", () => { if (!sug) return; input.value = sug; render(); api.note("Took the drafter's fix: they meant two brackets multiplied", "good"); });
  $("#yes", w).addEventListener("click", () => {
    const r = an(input.value), ok = ["(x+2)(x+3)", "(x+3)(x+2)", "(x+2)*(x+3)", "(x+3)*(x+2)"].includes(r.s);
    gsap.fromTo("#st", { opacity: 0, scale: 2 }, { opacity: .95, scale: 1, rotation: -8, duration: RM ? 0 : .28, ease: "power4.in" });
    api.noticed(r.iss.length ? `<b>Issued with ${r.iss.length} RFI${r.iss.length > 1 ? "s" : ""} answered.</b> Lotus marks what the student confirmed, ${ok ? "which is right" : "which isn't the factorisation"}. The lettering problem is logged separately, never as a maths gap.` : `<b>Clean issue.</b> ${ok ? "Right, and read exactly as intended." : "Read exactly as lettered, then marked as maths."}`);
    api.learn("PAIR", ok ? .85 : .6);
  });
  render();
  return () => {};
} };
