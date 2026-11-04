// =================== 12. Chitthi Wala ===================
GAMES.chitthi = { mount(booth, api) {
  const RIGHT = ["(x+5)(x-2)", "(x-2)(x+5)"], BUGS = { "(x-5)(x+2)": "the sign-flipped answer", "(x+2)(x-5)": "the sign-flipped answer", "(x+10)(x-1)": "a right-product, wrong-sum answer", "(x-10)(x+1)": "a right-product, wrong-sum answer" };
  const ROWS = ["1234567890", "QWERTYUIOP", "ASDFGHJKL+", "ZXCVBNM()-"];
  booth.innerHTML = `<p class="ask">The letter writer types out your answer to <span class="m">x² + 3x − 10</span>. Type it below (use - for minus). Then watch every keystroke replayed on paper.</p>
    <div class="tw"><span class="bell" id="bell">ding!</span><div class="paper"><div class="hd">To: Lotus, Maths Mela</div><div class="pline" id="pl"><span class="cur"></span></div></div>
      <div class="machine"><div class="roller"></div>${ROWS.map((r) => `<div class="krow">${[...r].map((k) => `<i data-k="${k}">${k}</i>`).join("")}</div>`).join("")}</div></div>
    <div class="row"><input class="typein" id="ti" autocomplete="off" spellcheck="false" placeholder="(x + ?)(x − ?)" aria-label="Your answer"><button class="btn" id="post" type="button">Give it to the letter writer</button></div>
    <div class="tickertape"><div class="tline" id="tl"><span class="head" id="hd" style="left:0"></span></div><div class="legend"><span>▮ a key</span><span style="color:var(--rani)">▮ a deletion</span><span style="color:var(--marigold)">▬ a pause over 1.5s</span></div></div>
    <div style="display:grid;gap:6px"><span class="chiplab">Or read someone else's letter</span><div class="chipset" id="as"><button type="button" data-p="fix">they fixed a sign</button><button type="button" data-p="clean">they typed it straight</button><button type="button" data-p="stuck">they stalled</button></div></div>`;
  const input = $("#ti", booth); let hist = [], t0 = null, tl = null;
  input.addEventListener("input", () => { const now = performance.now(); if (t0 === null) t0 = now; hist.push({ t: (now - t0) / 1000, v: input.value }); });
  const norm = (s) => s.replace(/\s+/g, "").replace(/[−–]/g, "-").toLowerCase();
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function script(ops) { const h = []; let t = 0, v = ""; for (const o of ops) { if (o.type) for (const ch of o.type) { t += o.d ?? .2; v += ch; h.push({ t, v }); } if (o.wait) t += o.wait; if (o.back) for (let k = 0; k < o.back; k++) { t += .1; v = v.slice(0, -1); h.push({ t, v }); } } return h; }
  const SAMPLES = { fix: script([{ type: "(x-5)(x+2)" }, { wait: 2.6 }, { back: 8 }, { type: "+5)(x-2)" }]), clean: script([{ wait: 1.2 }, { type: "(x+5)(x-2)", d: .16 }]), stuck: script([{ type: "(x+" }, { wait: 4.2 }, { type: "10)(x-1)", d: .24 }]) };
  function analyse(h) {
    const fin = norm(h.at(-1)?.v ?? ""), drafts = [];
    h.forEach((s, k) => { const nx = h[k + 1]; if (nx && nx.v.length < s.v.length) drafts.push(norm(s.v)); });
    const buggy = [...new Set(drafts)].map((d) => BUGS[d]).filter(Boolean);
    const dels = h.filter((s, k) => k && s.v.length < h[k - 1].v.length).length;
    let longest = { gap: 0, at: "" };
    h.forEach((s, k) => { const gap = s.t - (k ? h[k - 1].t : 0); if (gap > longest.gap) longest = { gap, at: k ? h[k - 1].v : "" }; });
    const right = RIGHT.includes(fin);
    let t;
    if (right && buggy.length) t = `<b>The final letter is right, but the first draft was ${buggy[0]}.</b> They caught it this time. The mistake is still there, so Lotus keeps watching for it.`;
    else if (right && !dels) t = "<b>Typed it straight through.</b> Fluent and sure.";
    else if (right) t = `<b>Right, after ${dels} deletion${dels > 1 ? "s" : ""}.</b> None of the deleted drafts matched a known mistake.`;
    else if (BUGS[fin]) t = `<b>Sent ${BUGS[fin]}.</b>`;
    else t = "<b>Not the right factorisation.</b>";
    if (longest.gap > 1.5) t += ` Longest pause: ${longest.gap.toFixed(1)}s${longest.at ? `, after “${esc(longest.at)}”` : " before starting"}.`;
    return { t, right, buggy, dels, longest };
  }
  function replay(h) {
    tl && tl.kill();
    const T = Math.max(1, h.at(-1).t + .6), line = $("#tl", booth), pl = $("#pl", booth);
    line.querySelectorAll("i,b").forEach((e) => e.remove());
    h.forEach((s, k) => { const p = k ? h[k - 1] : { t: 0, v: "" }, gap = s.t - p.t; if (gap > 1.5) line.insertAdjacentHTML("beforeend", `<b style="left:${(p.t / T) * 100}%;width:${(gap / T) * 100}%"></b>`); line.insertAdjacentHTML("beforeend", `<i class="${s.v.length < p.v.length ? "d" : ""}" style="left:${(s.t / T) * 100}%"></i>`); });
    const tape = []; pl.innerHTML = `<span class="cur"></span>`;
    tl = gsap.timeline();
    tl.fromTo($("#hd", booth), { left: "0%" }, { left: "100%", duration: T / 1.4, ease: "none" }, 0);
    h.forEach((s, k) => {
      const prev = k ? h[k - 1].v : "";
      tl.call(() => {
        let pre = 0; while (pre < prev.length && pre < s.v.length && prev[pre] === s.v[pre]) pre++;
        for (let n = prev.length - pre; n > 0; n--) { for (let j = tape.length - 1; j >= 0; j--) if (!tape[j].del) { tape[j].del = true; break; } }
        for (const ch of s.v.slice(pre)) tape.push({ ch });
        pl.innerHTML = tape.map((c) => (c.del ? `<span class="del">${esc(c.ch)}</span>` : esc(c.ch))).join("") + `<span class="cur"></span>`;
        const ch = (s.v.slice(pre).at(-1) ?? "X").toUpperCase(), key = $(`.krow i[data-k="${CSS.escape(ch)}"]`, booth) ?? $$(".krow i", booth)[Math.floor(Math.random() * 30)];
        if (key) { key.classList.add("hit"); setTimeout(() => key.classList.remove("hit"), 90); }
        if (!REDUCED) gsap.fromTo(pl, { x: -2 }, { x: 0, duration: .12 });
      }, null, s.t / 1.4);
    });
    tl.call(() => { if (!REDUCED) gsap.fromTo($("#bell", booth), { opacity: 1, y: 0, scale: 1.3 }, { opacity: 0, y: -16, scale: 1, duration: 1.1 }); }, null, T / 1.4);
  }
  function report(h, who) {
    const r = analyse(h); api.noticed(r.t);
    api.note(`${who}: ${r.dels} deletion${r.dels === 1 ? "" : "s"}, longest pause ${r.longest.gap.toFixed(1)}s${r.buggy.length ? ", and a deleted draft matched a known mistake" : ""}`, r.buggy.length ? "warn" : "good");
    api.learn("PAIR", .6, r.buggy.length ? .6 : .85); if (r.buggy.length) api.learn("SIGNS", .5, .7);
  }
  $("#post", booth).addEventListener("click", () => { if (!hist.length) return input.focus(); replay(hist); setTimeout(() => report(hist, "Your letter"), REDUCED ? 0 : hist.at(-1).t / 1.4 * 1000 + 400); });
  $$("#as button", booth).forEach((b) => b.addEventListener("click", () => { $$("#as button", booth).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); const h = SAMPLES[b.dataset.p]; replay(h); setTimeout(() => report(h, `A letter where ${b.textContent}`), REDUCED ? 0 : h.at(-1).t / 1.4 * 1000 + 400); }));
  return () => tl && tl.kill();
} };

// =================== 13. Gubbara Wall ===================
GAMES.gubbara = { mount(booth, api) {
  const VALID = [-13, -8, -7, 7, 8, 13], PAIR = { 13: "1 × 12", 8: "2 × 6", 7: "3 × 4", "-13": "−1 × −12", "-8": "−2 × −6", "-7": "−3 × −4" };
  const NUMS = [...Array.from({ length: 15 }, (_, k) => k - 15), ...Array.from({ length: 15 }, (_, k) => k + 1)];
  const COLS = ["#ec3f8c", "#ffb21e", "#16c2a3", "#63b6ff", "#ff7a1f", "#b27bff"];
  booth.innerHTML = `<p class="ask"><span class="m">x² + bx + 12</span> factorises into two brackets with whole numbers. Tag <b>every</b> balloon whose number works as b.</p>
    <div class="board"><div class="balloons">${NUMS.map((n, i) => `<button class="bl" type="button" data-v="${n}" aria-pressed="false" aria-label="b = ${n}" style="animation-delay:-${(i * .37) % 3}s"><svg viewBox="0 0 50 84"><path d="M25 50 Q20 64 27 82" stroke="#c8bde8" stroke-width="1.2" fill="none"/><ellipse class="skin" cx="25" cy="26" rx="19" ry="23" fill="${COLS[i % 6]}"/><path d="M21 49 h8 l-4 5z" fill="${COLS[i % 6]}"/><ellipse cx="18" cy="16" rx="4" ry="7" fill="#fff" opacity=".35"/><text x="25" y="31" text-anchor="middle" fill="#130e2a">${sgn(n)}</text></svg><span class="pair">${PAIR[n] ?? ""}</span></button>`).join("")}</div></div>
    <div class="row"><button class="btn" id="done" type="button" disabled>I've found them all</button><span id="cnt" style="color:var(--soft)">No balloons tagged yet</span></div>`;
  const picked = [];
  function retag() {
    $$(".tagx", booth).forEach((t) => t.remove());
    picked.forEach((v, k) => $(`.bl[data-v="${v}"]`, booth).insertAdjacentHTML("beforeend", `<span class="tagx">${k + 1}</span>`));
    $("#cnt", booth).textContent = picked.length ? `${picked.length} tagged` : "No balloons tagged yet";
    $("#done", booth).disabled = !picked.length;
  }
  $$(".bl", booth).forEach((b) => b.addEventListener("click", () => {
    const v = +b.dataset.v, at = picked.indexOf(v);
    if (at >= 0) { picked.splice(at, 1); b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); api.note(`Untagged b = ${sgn(v)}`, "warn"); }
    else { picked.push(v); b.classList.add("on"); b.setAttribute("aria-pressed", "true"); api.note(`Tagged b = ${sgn(v)} (tag ${picked.length})`); if (!REDUCED) gsap.fromTo($("svg", b), { scale: 1.25 }, { scale: 1, duration: .5, ease: "elastic.out(1,.35)", transformOrigin: "50% 40%" }); }
    retag();
  }));
  $("#done", booth).addEventListener("click", () => {
    $("#done", booth).disabled = true;
    const found = picked.filter((v) => VALID.includes(v)), wrong = picked.filter((v) => !VALID.includes(v)), neg = found.filter((v) => v < 0), pos = found.filter((v) => v > 0);
    VALID.forEach((v, k) => {
      const b = $(`.bl[data-v="${v}"]`, booth), hit = found.includes(v);
      if (!hit) b.classList.add("miss");
      gsap.to($(".pair", b), { opacity: 1, duration: .4, delay: .1 * k });
      if (!REDUCED) gsap.to(b, hit ? { y: -16, duration: .8, delay: .1 * k, ease: "back.out(2)" } : { rotation: 6, yoyo: true, repeat: 5, duration: .15, delay: .1 * k });
      gsap.set(b, { animation: "none" });
    });
    wrong.forEach((v) => gsap.to(`.bl[data-v="${v}"]`, { scale: .8, opacity: .45, duration: .5 }));
    const ordered = picked.filter((v) => v > 0 && VALID.includes(v)).join();
    let t = found.length === 6 ? "<b>All six.</b>" : pos.length === 3 && !neg.length ? "<b>Found 7, 8 and 13, and no negatives.</b> Forgets that two negatives also multiply to +12. That's the “no negative pairs” mistake, now with solid evidence." : found.length <= 2 ? `<b>Found ${found.length}.</b> Knows an example, not the whole set.` : `<b>Found ${found.length} of 6.</b>`;
    if (ordered === "13,8,7" || ordered === "7,8,13") t += " Listed the pairs in order, which is systematic.";
    if (wrong.some((v) => [12, -12, 1, -1].includes(v))) t += " Tagged 12 or 1, mixing up b with a factor of 12.";
    else if (wrong.length) t += ` ${wrong.length} balloon${wrong.length > 1 ? "s" : ""} that don't work: ${wrong.map(sgn).join(", ")}.`;
    api.noticed(t); api.note(`Done: ${found.length}/6 found, ${wrong.length} wrong, negatives ${neg.length ? "included" : "missing"}`, "good");
    api.learn("PAIR", .8, found.length === 6 ? .9 : .7); if (!neg.length) api.learn("SIGNS", .6, .8);
  });
  return () => {};
} };

// =================== 14. Tiffin Trick ===================
GAMES.tiffin = { mount(booth, api) {
  const MINI = `<svg class="mini" viewBox="0 0 26 30" aria-label="A"><rect x="3" y="6" width="20" height="7" rx="2" fill="#c8cfe0"/><rect x="3" y="14" width="20" height="7" rx="2" fill="#b4bdd2"/><rect x="3" y="22" width="20" height="7" rx="2" fill="#c8cfe0"/><path d="M1 4 Q13 -4 25 4" stroke="#8f84b8" stroke-width="2" fill="none"/><text x="13" y="20" text-anchor="middle" font-size="8" font-weight="800" fill="#ec3f8c" font-family="Baloo 2,sans-serif">A</text></svg>`;
  const PATHS = {
    block: { label: "Pack (x + 3) into a tiffin", lines: [`${MINI}² − 16`, `${MINI}² − 4²`, `(${MINI} − 4)(${MINI} + 4)`, "(x + 3 − 4)(x + 3 + 4)", "(x − 1)(x + 7)"], t: "<b>Packed (x + 3) into one tiffin.</b> Saw A² − 4². That's structure sense, the skill behind spotting a difference of squares wherever it hides.", cert: .9 },
    expand: { label: "Unpack it: expand the bracket", lines: ["(x + 3)² − 16", "x² + 6x + 9 − 16", "x² + 6x − 7", "(x + 7)(x − 1)"], t: "<b>Right, the long way.</b> Four lines and a product–sum hunt. They can do it but didn't see the structure, and an answer-only check would call this full mastery.", cert: .7 },
    root: { label: "Square-root each part", lines: ["(x + 3)² − 16", "(x + 3) − 4", "x − 1"], t: "<b>Square-rooted each part separately.</b> Thinks √(a − b) = √a − √b. A different misconception, worth its own follow-up.", cert: .85 },
  };
  booth.innerHTML = `<div class="tf"><div><p class="ask">Factorise this. What's your first move?</p><div class="big" id="ex"><span class="chunk" id="chunk">(x + 3)</span>² − 16</div></div>
      <svg class="tiffin" id="tif" viewBox="0 0 140 170" aria-hidden="true"><circle id="tglow" cx="70" cy="100" r="70" fill="#ffd36b" opacity="0"/><path d="M14 30 V130 M126 30 V130" stroke="#8f84b8" stroke-width="5"/><path d="M14 30 Q70 -14 126 30" stroke="#8f84b8" stroke-width="5" fill="none"/><rect x="24" y="96" width="92" height="30" rx="6" fill="#c8cfe0"/><rect x="24" y="62" width="92" height="32" rx="6" fill="#b4bdd2"/><g id="tlid"><rect x="24" y="40" width="92" height="22" rx="6" fill="#dde2ee"/><rect x="58" y="34" width="24" height="8" rx="3" fill="#8f84b8"/></g><rect x="24" y="128" width="92" height="30" rx="6" fill="#c8cfe0"/><text id="tA" x="70" y="85" text-anchor="middle" font-size="22" font-weight="800" fill="#ec3f8c" font-family="Baloo 2,sans-serif" opacity="0">A</text></svg></div>
    <div class="moves">${Object.entries(PATHS).map(([k, p]) => `<button class="move" type="button" data-k="${k}">${p.label}</button>`).join("")}</div>
    <div class="route" id="route"><span style="color:var(--faint)">Your route plays out here.</span></div>
    <div class="mental" id="mn" hidden><p class="ask" style="font-size:1rem">Now in your head: <span class="m">99² − 1</span> = ?</p><div class="row"><input id="mi" inputmode="numeric" autocomplete="off" aria-label="99 squared minus 1"><button class="btn" id="ms" type="button">Done</button></div></div>`;
  let tl = null, start = 0;
  function lines(p) {
    const r = $("#route", booth);
    r.innerHTML = p.lines.map((l, k) => `<div class="rl2">${k ? '<span class="eqs">=</span>' : ""}${l}</div>`).join("");
    const rows = $$(".rl2", r); gsap.set(rows, { opacity: 0, x: -14 });
    return rows;
  }
  $$(".move", booth).forEach((b) => b.addEventListener("click", () => {
    $$(".move", booth).forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.disabled = true; });
    const k = b.dataset.k, p = PATHS[k];
    tl && tl.kill(); tl = gsap.timeline();
    if (k === "block" && !REDUCED) {
      const c = $("#chunk", booth).getBoundingClientRect(), t = $("#tif", booth).getBoundingClientRect();
      const fly = html(`<span class="flyer">(x + 3)</span>`); document.body.appendChild(fly);
      gsap.set(fly, { left: c.left, top: c.top });
      tl.to("#tlid", { rotation: -50, svgOrigin: "24 50", duration: .4, ease: "back.out(2)" })
        .to($("#chunk", booth), { opacity: .25, duration: .2 }, 0)
        .to(fly, { left: t.left + t.width / 2 - 40, top: t.top + t.height / 2 - 20, scale: .35, duration: .8, ease: "power3.inOut" }, .1)
        .to(fly, { opacity: 0, duration: .15, onComplete: () => fly.remove() })
        .to("#tlid", { rotation: 0, svgOrigin: "24 50", duration: .45, ease: "bounce.out" })
        .to("#tA", { opacity: 1, duration: .3 }, "<.2")
        .fromTo("#tglow", { opacity: .6 }, { opacity: 0, duration: .9 }, "<");
    }
    const rows = lines(p);
    rows.forEach((r, i) => tl.to(r, { opacity: 1, x: 0, duration: REDUCED ? 0 : .45, ease: "power3.out" }, `>${REDUCED ? 0 : .25}`));
    if (k === "block" && !REDUCED) tl.to("#tlid", { rotation: -50, svgOrigin: "24 50", duration: .4 }, `-=${.7 * 2}`);
    tl.call(() => { api.noticed(p.t); $("#mn", booth).hidden = false; start = performance.now(); });
    api.note(`First move: ${p.label} (${p.lines.length} lines to the answer)`, k === "block" ? "good" : k === "root" ? "warn" : "");
    api.learn("SQUARES", .7, p.cert);
  }));
  $("#ms", booth).addEventListener("click", () => {
    const v = $("#mi", booth).value.replace(/[^\d-]/g, ""), t = (performance.now() - start) / 1000;
    const r = v === "9800" && t <= 12 ? `<b>9800 in ${t.toFixed(0)}s.</b> That fast almost certainly means (99 − 1)(99 + 1) = 98 × 100. The structure carries over to plain numbers.`
      : v === "9800" ? `<b>9800, after ${t.toFixed(0)}s.</b> Probably 99 × 99 = 9801, then minus 1. Right, with no sign of the structure.`
      : `<b>${v || "No answer"}.</b> Not 9800. Lotus would check for an arithmetic slip first.`;
    api.noticed(`${PATHS[$(".move[aria-pressed='true']", booth)?.dataset.k ?? "expand"].t}<br><br>${r}`);
    api.note(`99² − 1 → ${v || "blank"} in ${t.toFixed(1)}s`, v === "9800" && t <= 12 ? "good" : ""); $("#ms", booth).disabled = true;
  });
  return () => { tl && tl.kill(); $$(".flyer").forEach((f) => f.remove()); };
} };

// =================== 15. Mithu's Map ===================
GAMES.naksha = { mount(booth, api) {
  const S = ["M", "FLIP", "PROD", "SWAP", "UNK"];
  const NAMES = { M: "Knows it", FLIP: "Flips signs into the brackets", PROD: "Matches the product, ignores the sum", SWAP: "Mixes up product and sum", UNK: "Doesn't know yet" };
  const COL = { M: "#16c2a3", FLIP: "#ff7a1f", PROD: "#ffb21e", SWAP: "#b27bff", UNK: "#8f84b8" };
  const u = (ks) => Object.fromEntries(ks.map((k) => [k, 1 / ks.length]));
  const sl = (m, ks, p = .92) => Object.fromEntries(ks.map((k) => [k, k === m ? p : (1 - p) / (ks.length - 1)]));
  const QS = [
    { id: "fire", name: "Fireflies (today's game)", x: 90, y: 255, sec: 20, L: { M: sl("r", ["r", "s", "o", "p"]), FLIP: sl("r", ["r", "s", "o", "p"]), PROD: { r: .31, s: .31, o: .31, p: .07 }, SWAP: u(["r", "s", "o", "p"]), UNK: u(["r", "s", "o", "p"]) } },
    { id: "sikka", name: "Sikka Toss", x: 95, y: 90, sec: 30, L: { M: sl("right", ["right", "sw", "ps", "po"]), FLIP: sl("sw", ["right", "sw", "ps", "po"]), PROD: { right: .31, sw: .31, po: .31, ps: .07 }, SWAP: sl("ps", ["right", "sw", "ps", "po"]), UNK: u(["right", "sw", "ps", "po"]) } },
    { id: "chitthi", name: "Chitthi Wala", x: 260, y: 58, sec: 40, L: { M: { right: .92, other: .08 }, FLIP: { flip: .88, other: .12 }, PROD: { right: .5, prod: .45, other: .05 }, SWAP: { swap: .85, other: .15 }, UNK: { dunno: .5, other: .4, right: .1 } } },
    { id: "lantern", name: "Lantern Lane", x: 430, y: 100, sec: 60, L: { M: { all: .9, none: .1 }, FLIP: { flipped: .85, none: .15 }, PROD: { all: .4, none: .4, copy: .2 }, SWAP: { all: .3, none: .5, copy: .2 }, UNK: { none: .6, copy: .25, all: .1, flipped: .05 } } },
    { id: "tota", name: "Mithu's Cards", x: 425, y: 268, sec: 60, L: Object.fromEntries(S.map((s) => [s, { a: .5, b: .5 }])) },
    { id: "gubbara", name: "Gubbara Wall", x: 255, y: 305, sec: 45, L: { M: { ok: .9, no: .1 }, FLIP: { ok: .7, no: .3 }, PROD: { ok: .6, no: .4 }, SWAP: { ok: .5, no: .5 }, UNK: { ok: .25, no: .75 } } },
  ];
  for (const q of QS) { const R = [...new Set(S.flatMap((s) => Object.keys(q.L[s])))]; for (const s of S) q.L[s] = Object.fromEntries(R.map((r) => [r, .94 * (q.L[s][r] ?? 0) + .06 / R.length])); }
  const PRIOR = { M: .35, FLIP: .2, PROD: .15, SWAP: .1, UNK: .2 };
  booth.innerHTML = `<p class="ask">I'm Mithu, and I plan the route through the fair. Pick a hidden student. I'll fly to whichever stall tells Lotus the most about them, and stop once Lotus is sure.</p>
    <div style="display:grid;gap:6px"><span class="chiplab">Hidden student</span><div class="chipset" id="hid">${S.map((s) => `<button type="button" data-s="${s}" aria-pressed="${s === "FLIP"}">${NAMES[s]}</button>`).join("")}</div></div>
    <div class="mapgrid"><div class="parch"><svg viewBox="0 0 520 360" id="pmap" aria-label="Map of the fair"></svg></div>
      <div class="ribbons" id="rib"></div></div>
    <div class="row"><button class="btn" id="ask" type="button">Fly to the best stall</button><button class="btn alt" id="rs" type="button">Start again</button></div>
    <div class="hist" id="hist"></div>`;
  const svg = $("#pmap", booth), C0 = { x: 260, y: 185 };
  svg.innerHTML = `${QS.map((q) => `<path d="M${C0.x} ${C0.y} Q${(C0.x + q.x) / 2 + 30} ${(C0.y + q.y) / 2 - 30} ${q.x} ${q.y}" stroke="#a5865f" stroke-width="2" stroke-dasharray="5 6" fill="none"/>`).join("")}
    <circle cx="${C0.x}" cy="${C0.y}" r="16" fill="#e7cf9c" stroke="#a5865f" stroke-width="2"/><text x="${C0.x}" y="${C0.y + 34}" text-anchor="middle" font-size="12" fill="#6b4a2a" font-family="Kalam,cursive">entrance</text>
    ${QS.map((q) => `<g class="pin" data-id="${q.id}"><circle class="halo" cx="${q.x}" cy="${q.y}" r="8" fill="#ffb21e" opacity=".35"/><circle cx="${q.x}" cy="${q.y}" r="10" fill="#ec3f8c" stroke="#fff6e2" stroke-width="3"/><text x="${q.x}" y="${q.y + 30}" text-anchor="middle" font-size="13" font-weight="700" fill="#3b2414" font-family="Baloo 2,sans-serif">${q.name}</text><text class="bits" x="${q.x}" y="${q.y + 45}" text-anchor="middle" font-size="11" fill="#6b4a2a" font-family="IBM Plex Mono,monospace"></text><text class="flag" x="${q.x}" y="${q.y - 18}" text-anchor="middle" font-size="12" fill="#a8164f" font-family="Kalam,cursive" font-weight="700"></text></g>`).join("")}
    <g id="bird" transform="translate(${C0.x} ${C0.y})"><circle r="11" fill="#3fbf55"/><path d="M8 -4 C16 -4 17 4 10 6Z" fill="#ff3b3b"/><circle cx="4" cy="-4" r="3" fill="#fff"/><circle cx="4.6" cy="-4" r="1.6" fill="#130e2a"/><path d="M-6 6 C-14 14 -18 6 -16 2" fill="#2d8f3f"/></g>`;
  let hidden = "FLIP", belief = { ...PRIOR }, asked = [], done = false, at = { ...C0 };
  const H = (d) => -Object.values(d).reduce((t, p) => t + (p > 0 ? p * Math.log2(p) : 0), 0);
  const post = (b, q, r) => { const o = {}; let z = 0; for (const s of S) { o[s] = b[s] * (q.L[s][r] ?? 0); z += o[s]; } for (const s of S) o[s] = z ? o[s] / z : b[s]; return o; };
  const eig = (b, q) => { const rs = [...new Set(S.flatMap((s) => Object.keys(q.L[s])))]; let e = 0; for (const r of rs) { const pr = S.reduce((t, s) => t + b[s] * (q.L[s][r] ?? 0), 0); if (pr > 0) e += pr * H(post(b, q, r)); } return Math.max(0, H(b) - e); };
  function draw() {
    const lead = S.reduce((a, s) => (belief[s] > belief[a] ? s : a), S[0]);
    $("#rib", booth).innerHTML = `<span class="chiplab">What Lotus believes</span>` + S.map((s) => `<div class="rib ${s === lead ? "lead" : ""}" style="--c:${COL[s]}"><span>${NAMES[s]}</span><em>${Math.round(belief[s] * 100)}%</em><span class="bar"><i data-w="${belief[s]}"></i></span></div>`).join("");
    $$(".rib .bar i", booth).forEach((i) => gsap.to(i, { width: `${+i.dataset.w * 100}%`, duration: .8, ease: "power3.out" }));
    const sc = QS.map((q) => { const g = eig(belief, q); return { q, g, pm: g / (q.sec / 60) }; });
    sc.forEach(({ q, g, pm: p }) => { const pin = $(`.pin[data-id="${q.id}"]`, svg); gsap.to($(".halo", pin), { attr: { r: 10 + Math.min(40, p * 30) }, opacity: asked.includes(q.id) ? .12 : .4, duration: .8, ease: "elastic.out(1,.5)" }); $(".bits", pin).textContent = `${g.toFixed(2)} bits · ${p.toFixed(2)}/min`; });
    return { best: sc.filter((x) => !asked.includes(x.q.id)).sort((a, b) => b.pm - a.pm)[0], lead };
  }
  function ask() {
    if (done) return;
    const { best } = draw();
    if (!best || best.g < .05) return stop("No stall left is worth the student's time.");
    const q = best.q, L = q.L[hidden];
    let u2 = Math.random(), acc = 0, r = Object.keys(L).at(-1);
    for (const [k, p] of Object.entries(L)) { acc += p; if (u2 <= acc) { r = k; break; } }
    const mid = { x: (at.x + q.x) / 2, y: Math.min(at.y, q.y) - 60 };
    $("#ask", booth).disabled = true;
    gsap.timeline({ onComplete: () => {
      at = { x: q.x, y: q.y };
      $(".flag", $(`.pin[data-id="${q.id}"]`, svg)).textContent = `“${r}”`;
      belief = post(belief, q, r); asked.push(q.id);
      $("#hist", booth).insertAdjacentHTML("beforeend", `<span>${asked.length}. ${q.name} → “${r}”</span>`);
      api.note(`Mithu chose ${q.name} (${best.g.toFixed(2)} bits expected). The answer was “${r}”`);
      const { lead } = draw(); $("#ask", booth).disabled = false;
      if (belief[lead] >= .85 && (lead === "M" || lead === "UNK" || asked.length >= 2)) stop(`Sure enough: “${NAMES[lead]}” at ${Math.round(belief[lead] * 100)}%, after ${asked.length} stall${asked.length > 1 ? "s" : ""}.${lead === hidden ? " That's the hidden student." : " Not the hidden student, though. Answers include slips, so press Start again to retry."}`);
    } })
      .to("#bird", { x: mid.x, y: mid.y, duration: REDUCED ? 0 : .5, ease: "power1.out" })
      .to("#bird", { x: q.x, y: q.y - 4, duration: REDUCED ? 0 : .5, ease: "power1.in" })
      .fromTo($(`.pin[data-id="${q.id}"] .halo`, svg), { attr: { r: 50 } }, { attr: { r: 14 }, duration: REDUCED ? 0 : .5 });
  }
  function stop(why) { done = true; draw(); $("#ask", booth).disabled = true; api.noticed(`<b>Mithu stops.</b> ${why} A fixed route would keep sending the student to more stalls. A named mistake always needs a second, different stall first.`); api.note("Stopped: Lotus is sure enough", "good"); }
  function reset() { belief = { ...PRIOR }; asked = []; done = false; at = { ...C0 }; gsap.set("#bird", { x: C0.x, y: C0.y }); $$(".flag", svg).forEach((f) => (f.textContent = "")); $("#hist", booth).innerHTML = ""; $("#ask", booth).disabled = false; $(".noticed", booth)?.remove(); draw(); }
  $$("#hid button", booth).forEach((b) => b.addEventListener("click", () => { hidden = b.dataset.s; $$("#hid button", booth).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); api.note(`Hidden student: ${NAMES[hidden]}`); reset(); }));
  $("#ask", booth).addEventListener("click", ask); $("#rs", booth).addEventListener("click", reset);
  gsap.set("#bird", { x: C0.x, y: C0.y }); draw();
  return () => {};
} };

// =================== 16. Daakghar ===================
GAMES.daak = { mount(booth, api) {
  booth.innerHTML = `<p class="ask">Write your factorisation of <span class="m">x² + 5x + 6</span> on the postcard. Before anything gets marked, the postmaster reads it back to you.</p>
    <div class="post">
      <div class="card2" id="pc"><div class="msg"><span>Dear Lotus, my answer is:</span><input id="ri" autocomplete="off" spellcheck="false" value="x+2(x+3)" aria-label="Your answer"></div>
        <div class="addr"><small>To: Lotus, Maths Mela</small><i></i><i></i><i></i></div>
        <div class="stampbox"><div>कमल<br>₹5</div></div>
        <div class="postmark" id="pmk"><div>READ &amp; CONFIRMED<span>Mela Daakghar</span></div></div></div>
      <div class="slip"><h4>The postmaster reads it as</h4><div class="read" id="rd"></div><div id="iss" style="display:grid;gap:6px"></div>
        <div class="row"><button class="btn" id="yes" type="button">Yes, stamp it</button><button class="btn alt" id="fix" type="button">Use the suggestion</button></div></div>
    </div>
    <div style="display:grid;gap:6px"><span class="chiplab">Try another card</span><div class="envs">${["x+2(x+3)", "(x+2)(x+3", "x2+5x+6", "(x+2)(x+3)", "(x+2)*(x+3)"].map((s) => `<button type="button">${s}</button>`).join("")}</div></div>`;
  const input = $("#ri", booth); let sug = null;
  const pretty = (s) => s.replace(/\^2/g, "²").replace(/\*/g, " · ").replace(/-/g, " − ").replace(/\+/g, " + ");
  function analyse(raw) {
    let s = raw.replace(/\s+/g, "").replace(/[−–]/g, "-"); const iss = []; let fix = null;
    const o = (s.match(/\(/g) || []).length, c = (s.match(/\)/g) || []).length;
    if (/x2(?!\d)/.test(s) && !s.includes("^")) { iss.push("“x2” could mean x² or x × 2. I read it as x²."); s = s.replace(/x2(?!\d)/g, "x^2"); }
    if (o > c) { iss.push(`${o - c === 1 ? "A bracket is" : `${o - c} brackets are`} still open. I closed it at the end.`); s += ")".repeat(o - c); }
    if (c > o) iss.push("There's an extra closing bracket.");
    const m = /^(x[+-]\d+)\((x[+-]\d+)\)$/.exec(s);
    if (m) { iss.push(`This reads as a sum, not two brackets multiplied. Did you mean (${pretty(m[1])})(${pretty(m[2])})?`); fix = `(${m[1]})(${m[2]})`; }
    if (/\^2/.test(s) && !/\(/.test(s)) iss.push("This is the expression itself, not factorised.");
    return { s, iss, fix };
  }
  function render() {
    const r = analyse(input.value); sug = r.fix;
    $("#rd", booth).textContent = pretty(r.s) || " ";
    $("#iss", booth).innerHTML = r.iss.map((t) => `<span class="flag">${t}</span>`).join("");
    $("#fix", booth).hidden = !r.fix;
    if (!REDUCED && r.iss.length) gsap.from($$(".flag", booth), { opacity: 0, x: -8, stagger: .08, duration: .3 });
    gsap.set("#pmk", { opacity: 0 });
    return r;
  }
  input.addEventListener("input", render);
  $$(".envs button", booth).forEach((b) => b.addEventListener("click", () => { input.value = b.textContent; const r = render(); api.note(`Wrote “${b.textContent}”: ${r.iss.length ? `${r.iss.length} thing${r.iss.length > 1 ? "s" : ""} to check` : "clear"}`, r.iss.length ? "warn" : ""); }));
  $("#fix", booth).addEventListener("click", () => { if (!sug) return; input.value = sug; render(); api.note("Took the postmaster's suggestion: the student meant two brackets multiplied", "good"); });
  $("#yes", booth).addEventListener("click", () => {
    const r = analyse(input.value), ok = ["(x+2)(x+3)", "(x+3)(x+2)", "(x+2)*(x+3)", "(x+3)*(x+2)"].includes(r.s);
    if (REDUCED) gsap.set("#pmk", { opacity: .85, rotation: -12 });
    else gsap.timeline().fromTo("#pmk", { opacity: 0, scale: 2.4, rotation: -30 }, { opacity: .85, scale: 1, rotation: -12, duration: .28, ease: "power4.in" }).fromTo("#pc", { x: 0 }, { x: 4, yoyo: true, repeat: 3, duration: .05 });
    api.noticed(r.iss.length ? `<b>Stamped, with ${r.iss.length} flag${r.iss.length > 1 ? "s" : ""}.</b> Lotus now marks what the student confirmed, ${ok ? "which is right" : "which isn't the factorisation"}. The typing problem is logged separately and never counted as a maths gap.` : `<b>Clear card.</b> ${ok ? "Right, and read exactly as intended." : "Read exactly as written, then marked as maths."}`);
    api.note(`Stamped “${pretty(r.s)}”`, ok ? "good" : ""); api.learn("PAIR", .4, ok ? .85 : .6);
  });
  render();
  return () => {};
} };
