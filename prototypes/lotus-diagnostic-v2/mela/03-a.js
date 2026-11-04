// =================== 1. Sikka Toss ===================
GAMES.sikka = { mount(booth, api) {
  const OPTS = [
    { t: "(x − 3)(x − 1)", k: "ps", name: "product and sum swapped" },
    { t: "(x − 1)(x + 4)", k: "right", name: "the correct one" },
    { t: "(x − 2)(x + 2)", k: "po", name: "right product, wrong sum" },
    { t: "(x − 4)(x + 1)", k: "sw", name: "right numbers, signs flipped" },
  ];
  const PAIRS = { "right|sw": "the signs inside the brackets", "po|right": "whether the numbers must also add to 3", "ps|right": "which number is the product and which the sum", "po|sw": "both the sum and the signs", "ps|sw": "the product–sum rule itself", "po|ps": "the product–sum rule itself" };
  booth.innerHTML = `<p class="ask">Which thali holds the same thing as this? You have four coins. Put them all on one if you're sure, or split them if you're torn.</p>
    <div class="big">x² + 3x − 4</div>
    <div class="cloth" id="cloth">
      <div class="thalis">${OPTS.map((o, i) => `<button class="thali" type="button" data-i="${i}" aria-label="Toss a coin onto ${o.t}"><span class="plate"></span><span class="lbl">${o.t}</span><span class="cnt"></span></button>`).join("")}</div>
      <div class="pouch"><span>Your coins</span>${'<i class="spot"></i>'.repeat(4)}</div>
      <div class="coins"></div>
    </div>
    <div class="row"><button class="btn" id="lock" type="button" disabled>Done tossing</button><span id="left" style="color:var(--soft)">4 coins left</span></div>`;
  const cloth = $("#cloth", booth), layer = $(".coins", booth), plates = $$(".thali", booth), spots = $$(".spot", booth);
  const coins = Array.from({ length: 4 }, () => ({ at: -1, x: 0, y: 0, el: html(`<button class="coin" type="button" aria-label="coin">₹</button>`) }));
  coins.forEach((c) => layer.appendChild(c.el));
  const rel = (el) => { const a = el.getBoundingClientRect(), b = cloth.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; };
  const STACK = [[0, 0], [14, -8], [-14, -6], [2, -18]];
  function target(c) {
    if (c.at < 0) return rel(spots[coins.filter((d) => d.at < 0).indexOf(c)]);
    const p = rel($(".plate", plates[c.at])), k = coins.filter((d) => d.at === c.at).indexOf(c);
    return { x: p.x + STACK[k][0], y: p.y + STACK[k][1] };
  }
  function fly(c, instant) {
    const to = target(c);
    if (c.tw) { c.tw.kill(); c.x = gsap.getProperty(c.el, "x"); c.y = gsap.getProperty(c.el, "y"); }
    const from = { x: c.x, y: c.y };
    c.x = to.x; c.y = to.y;
    if (instant || REDUCED) return gsap.set(c.el, { x: to.x, y: to.y, scaleX: 1 });
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 120 }, o = { p: 0 };
    c.tw = gsap.to(o, { p: 1, duration: .7, ease: "power1.inOut", onUpdate() { const p = o.p, q = 1 - p; gsap.set(c.el, { x: q * q * from.x + 2 * q * p * ctrl.x + p * p * to.x, y: q * q * from.y + 2 * q * p * ctrl.y + p * p * to.y, scaleX: .2 + .8 * Math.abs(Math.cos(p * Math.PI * 4)) }); },
      onComplete() {
        gsap.set(c.el, { scaleX: 1 });
        gsap.fromTo(c.el, { scaleY: .6 }, { scaleY: 1, duration: .5, ease: "elastic.out(1.2,.35)" });
        if (c.at >= 0) {
          gsap.fromTo($(".plate", plates[c.at]), { rotation: -4 }, { rotation: 0, duration: .6, ease: "elastic.out(1,.3)" });
          for (let i = 0; i < 6; i++) { const s = html(`<i class="spark"></i>`); layer.appendChild(s); const a = (i / 6) * Math.PI * 2; gsap.fromTo(s, { x: to.x, y: to.y, rotation: (a * 180) / Math.PI + 90, opacity: 1 }, { x: to.x + Math.cos(a) * 34, y: to.y + Math.sin(a) * 34, opacity: 0, duration: .5, ease: "power2.out", onComplete: () => s.remove() }); }
        }
      } });
  }
  const layout = (instant) => coins.forEach((c) => fly(c, instant));
  function counts() { return OPTS.map((_, i) => coins.filter((c) => c.at === i).length); }
  function refresh() {
    const n = counts(), placed = n.reduce((a, b) => a + b, 0);
    plates.forEach((p, i) => { p.classList.toggle("has", n[i] > 0); $(".cnt", p).textContent = `${n[i]} coin${n[i] > 1 ? "s" : ""}`; });
    $("#lock", booth).disabled = placed < 4;
    $("#left", booth).textContent = placed < 4 ? `${4 - placed} coin${4 - placed > 1 ? "s" : ""} left` : "All four tossed";
  }
  plates.forEach((p, i) => p.addEventListener("click", () => {
    const c = coins.find((d) => d.at < 0);
    if (!c) return;
    c.at = i; api.note(`Tossed a coin onto ${OPTS[i].t}`); layout(); refresh();
  }));
  coins.forEach((c) => c.el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (c.at < 0) return;
    api.note(`Took a coin back from ${OPTS[c.at].t}`, "warn"); c.at = -1; layout(); refresh();
  }));
  $("#lock", booth).addEventListener("click", () => {
    const n = counts(), order = n.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const [[n1, i1], [n2, i2]] = order, shape = order.map(([v]) => v).filter(Boolean).join("–");
    let t;
    if (n1 === 4) t = OPTS[i1].k === "right" ? "<b>All four coins on the right thali.</b> Confident and correct." : `<b>All four on “${OPTS[i1].name}”.</b> Confident, so this is a misconception, not a guess.`;
    else if (shape === "2–2") t = `<b>Split 2–2.</b> The two thalis differ only in <b>${PAIRS[[OPTS[i1].k, OPTS[i2].k].sort().join("|")]}</b>. That's exactly where the doubt is.`;
    else if (shape === "3–1") t = `<b>Mostly “${OPTS[i1].name}”</b>, with a doubt about “${OPTS[i2].name}”.`;
    else if (shape === "1–1–1–1") t = "<b>One coin on every thali.</b> Doesn't know yet. Lotus won't call that a misconception.";
    else t = `<b>Leans “${OPTS[i1].name}”</b>, but unsure.`;
    api.noticed(t); api.note(`Done: ${shape} split`, "good");
    const cert = shape === "4" ? .95 : shape === "3–1" ? .7 : shape === "2–2" ? .55 : .2;
    api.learn("PAIR", .8, cert); if (n[3]) api.learn("SIGNS", .4, cert);
  });
  requestAnimationFrame(() => { coins.forEach((c) => { const t = target(c); c.x = t.x; c.y = t.y - 60; }); layout(); });
  const onR = () => layout(true); addEventListener("resize", onR);
  return () => removeEventListener("resize", onR);
} };

// =================== 2. Mithu's Cards ===================
GAMES.tota = { mount(booth, api) {
  const CARDS = [
    { c: "x² − 9 = (x − 3)(x + 3)", truth: true, fam: "DS" }, { c: "(x + 5)² = x² + 25", truth: false, fam: "SPREAD" },
    { c: "x² + 2x − 8 = (x − 4)(x + 2)", truth: false, fam: "SIGN" }, { c: "(x + 2)² = x² + 4x + 4", truth: true, fam: "SPREAD" },
    { c: "x² + 9 = (x + 3)(x + 3)", truth: false, fam: "SUMSQ" }, { c: "x² − 2x − 8 = (x − 4)(x + 2)", truth: true, fam: "SIGN" },
    { c: "(x − 4)² = x² − 16", truth: false, fam: "SPREAD" }, { c: "x² − 6x + 9 = (x − 3)²", truth: true, fam: "DS" },
  ];
  const FAMS = {
    SPREAD: { name: "Squares a bracket term by term: (a + b)² = a² + b²", bug: [true, false, true], idx: [1, 3, 6], skill: "SQUARES" },
    SIGN: { name: "Flips the signs into the brackets", bug: [true, false], idx: [2, 5], skill: "SIGNS" },
    SUMSQ: { name: "Thinks x² + 9 factorises", bug: [true], idx: [4], skill: "SQUARES" },
    DS: { name: "Control cards", bug: [false, false], idx: [0, 7], skill: "SQUARES" },
  };
  booth.innerHTML = `<p class="ask">Mithu pulls a fortune card for you. Drag it into <b>Sach</b> if it's always true, <b>Jhooth</b> if it isn't, or tap “Not sure”.</p>
    <div class="fortune">
      <div class="perch">
        <svg viewBox="0 0 150 140" aria-hidden="true"><g id="mbody"><path d="M70 132 L64 140 M84 132 L90 140" stroke="#d9a441" stroke-width="4" stroke-linecap="round"/><path d="M76 130 C46 128 36 96 46 70 C52 50 70 42 86 48 C104 54 106 82 100 102 C94 120 90 130 76 130Z" fill="#3fbf55"/><path d="M84 130 C94 108 116 104 124 134 C112 128 98 134 84 130Z" fill="#2d8f3f"/><path d="M52 78 C62 94 84 96 94 86 C88 108 70 114 56 102Z" fill="#2d8f3f"/></g><g id="mhead" style="transform-origin:80px 46px"><circle cx="80" cy="34" r="24" fill="#3fbf55"/><path d="M60 40 C66 52 82 54 94 46" stroke="#ec3f8c" stroke-width="4" fill="none"/><path d="M98 26 C114 26 118 42 104 48 C104 40 102 34 98 34Z" fill="#ff3b3b"/><circle cx="88" cy="26" r="6" fill="#fff"/><circle cx="89.5" cy="26" r="3.2" fill="#130e2a"/></g><rect x="20" y="132" width="110" height="8" rx="4" fill="#8b5a33"/></svg>
        <div class="cardbox" id="cbox">${[-8, 4, -2, 10, -6].map((r) => `<i style="--r:${r}deg"></i>`).join("")}</div>
      </div>
      <div class="fstage">
        <div class="table3"><div class="basket f" id="bF"><b>Jhooth</b><small>false</small><span class="n">0</span></div><div class="deck" id="deck" tabindex="0" aria-label="Fortune card. Left arrow false, right arrow true, down arrow not sure."></div><div class="basket t" id="bT"><b>Sach</b><small>true</small><span class="n">0</span></div></div>
        <div class="row" style="justify-content:center"><button class="btn alt" id="kF" type="button">← Jhooth</button><button class="btn alt unsure" id="kU" type="button">Not sure</button><button class="btn alt" id="kT" type="button">Sach →</button></div>
        <div class="fams" id="fams"></div>
      </div>
    </div>`;
  const deck = $("#deck", booth), answers = [], times = [];
  let i = 0, shown = 0, drag = null, busy = false, card = null;
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function deal() {
    if (i >= CARDS.length) return finish();
    card = html(`<div class="fcard"><span class="num">Card ${i + 1} of ${CARDS.length}</span><span class="m">${CARDS[i].c}</span><span class="orn">~ Mithu's fortune ~</span><span class="fstamp t">SACH</span><span class="fstamp f">JHOOTH</span><span class="fstamp u">PATA NAHI</span></div>`);
    deck.appendChild(card);
    const a = center($("#cbox", booth)), b = center(deck);
    if (!REDUCED) {
      gsap.timeline().to("#mhead", { rotation: 22, duration: .25, ease: "power2.in" }).to("#mhead", { rotation: 0, duration: .5, ease: "elastic.out(1,.4)" });
      gsap.from(card, { x: a.x - b.x, y: a.y - b.y, scale: .15, rotation: -40, duration: .75, ease: "back.out(1.3)", delay: .15 });
    }
    shown = performance.now() + 700;
    drag = Draggable.create(card, { type: "x,y",
      onDrag() { gsap.set(card, { rotation: this.x / 14 }); $(".fstamp.t", card).style.opacity = Math.max(0, this.x / 110); $(".fstamp.f", card).style.opacity = Math.max(0, -this.x / 110); $("#bT", booth).classList.toggle("hot", this.x > 110); $("#bF", booth).classList.toggle("hot", this.x < -110); },
      onRelease() { $$(".basket", booth).forEach((b) => b.classList.remove("hot")); if (this.x > 110) decide(true); else if (this.x < -110) decide(false); else gsap.to(card, { x: 0, y: 0, rotation: 0, duration: .7, ease: "elastic.out(1,.45)", onComplete: () => $$(".fstamp", card).forEach((s) => (s.style.opacity = 0)) }); } })[0];
  }
  function decide(v) {
    if (busy || !card) return; busy = true;
    const t = Math.max(.2, (performance.now() - shown) / 1000);
    answers[i] = v; times[i] = t;
    api.note(`Card ${i + 1}: ${v === null ? "not sure" : v ? "Sach (true)" : "Jhooth (false)"}, after ${t.toFixed(1)}s`);
    drag && drag.kill();
    const c = card;
    $(`.fstamp.${v === null ? "u" : v ? "t" : "f"}`, c).style.opacity = 1;
    if (v === null) gsap.to(c, { y: 260, scale: .4, opacity: 0, rotation: 8, duration: .5, ease: "power2.in", onComplete: () => c.remove() });
    else {
      const bk = $(v ? "#bT" : "#bF", booth), a = center(bk), b = center(deck);
      gsap.to(c, { x: a.x - b.x, y: a.y - b.y, scale: .2, rotation: v ? 30 : -30, opacity: .2, duration: .55, ease: "power2.in", onComplete: () => { c.remove(); const n = $(".n", bk); n.textContent = +n.textContent + 1; gsap.fromTo(bk, { scale: 1.1 }, { scale: 1, duration: .5, ease: "elastic.out(1,.4)" }); } });
    }
    setTimeout(() => { i++; busy = false; deal(); }, REDUCED ? 60 : 600);
  }
  function finish() {
    card = null;
    const med = [...times].sort((a, b) => a - b)[4];
    const rows = Object.entries(FAMS).map(([key, f]) => {
      const hits = f.idx.map((k, j) => answers[k] === null ? "uns" : answers[k] === CARDS[k].truth ? "ok" : "hit");
      const nHit = hits.filter((h) => h === "hit").length, n = f.idx.length;
      let v;
      if (key === "DS") v = nHit ? "Missed a control card, so read the rest with care." : "Both control cards right, so the other answers aren't random.";
      else if (nHit === n && n >= 2) v = `<b>Consistent:</b> all ${n} cards match this mistake.`;
      else if (nHit === n) v = "One card points to this. Worth a second look.";
      else if (nHit) v = `Matches ${nHit} of ${n}. Could be a slip.`;
      else if (hits.includes("uns")) v = "Unsure here: doesn't know yet.";
      else v = "No sign of it.";
      api.learn(f.skill, key !== "DS" && nHit === n && n >= 2 ? .9 : .4, hits.includes("uns") ? .25 : .75);
      return `<div class="fam"><span>${f.name}</span><span class="dots">${hits.map((h) => `<i class="${h}"></i>`).join("")}</span><p>${v}</p></div>`;
    });
    $("#fams", booth).innerHTML = rows.join("");
    if (!REDUCED) gsap.from($$(".fam", booth), { opacity: 0, y: 12, stagger: .08, duration: .4 });
    const slow = times.map((t, k) => [t, k]).filter(([t]) => t > med * 1.8).map(([, k]) => `card ${k + 1}`);
    deck.innerHTML = `<div class="fcard" style="cursor:default"><span class="m" style="font-family:var(--hand);font-size:1.4rem">Mithu is out of cards!</span></div>`;
    api.noticed(`Eight fortune cards, sorted into families (dots: <span style="color:#a8164f">●</span> matches the mistake, <span style="color:#0d7a63">●</span> right, <span style="color:#b5780c">●</span> not sure). ${slow.length ? `Took much longer on ${slow.join(", ")}.` : "Steady pace throughout."}`);
    api.note("All 8 cards sorted", "good");
  }
  $("#kF", booth).onclick = () => decide(false); $("#kT", booth).onclick = () => decide(true); $("#kU", booth).onclick = () => decide(null);
  deck.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") decide(false); else if (e.key === "ArrowRight") decide(true); else if (e.key === "ArrowDown") { e.preventDefault(); decide(null); } });
  deal();
  return () => drag && drag.kill();
} };

// =================== 3. Rangoli Floor ===================
GAMES.rangoli = { mount(booth, api) {
  const X = 120, U = 30, OX = 70, OY = 62, UNITS = 6, BARS = 5;
  booth.innerHTML = `<p class="ask">Lay these tiles into one perfect rectangle. How many long tiles go down the side?</p>
    <div class="big">x² + 5x + 6</div>
    <div class="floor"><svg viewBox="0 0 560 380" id="fsvg" aria-label="Rangoli tiles"></svg></div>
    <div class="knobs"><span>Long tiles down the side</span>${[0, 1, 2, 3, 4, 5].map((n) => `<button class="knob" type="button" data-n="${n}" aria-pressed="${n === 0}">${n}</button>`).join("")}</div>
    <div class="trail" id="trail"></div>`;
  const svg = $("#fsvg", booth);
  svg.innerHTML = `<defs><radialGradient id="dg"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ff9a1f"/><stop offset="1" stop-color="#ff7a1f" stop-opacity="0"/></radialGradient></defs><g id="holes"></g>`;
  const big = svgEl("g", {}, svg);
  svgEl("rect", { x: OX, y: OY, width: X, height: X, rx: 8, fill: "#ec3f8c" }, big);
  for (let k = 0; k < 8; k++) svgEl("ellipse", { cx: OX + X / 2, cy: OY + X / 2 - 24, rx: 9, ry: 22, fill: k % 2 ? "#ffb21e" : "#fff1d6", transform: `rotate(${k * 45} ${OX + X / 2} ${OY + X / 2})`, opacity: .9 }, big);
  svgEl("circle", { cx: OX + X / 2, cy: OY + X / 2, r: 10, fill: "#16c2a3" }, big);
  const bars = Array.from({ length: BARS }, () => { const o = svgEl("rect", { x: OX, y: OY, width: X, height: U, rx: 5, fill: "#16c2a3", stroke: "#0b6e5c", "stroke-width": 2 }, svg); const i2 = svgEl("rect", { x: OX + 4, y: OY + 4, width: X - 8, height: U - 8, rx: 3, fill: "none", stroke: "#e8fff9", "stroke-width": 1.5, "stroke-dasharray": "5 4", opacity: .7 }, svg); return [o, i2]; });
  const units = Array.from({ length: UNITS }, () => { const g = svgEl("g", {}, svg); svgEl("rect", { x: 0, y: 0, width: U, height: U, rx: 5, fill: "#ffb21e", stroke: "#a86400", "stroke-width": 2 }, g); svgEl("path", { d: `M${U / 2} 7 C${U / 2 + 5} 13 ${U / 2 + 4} 19 ${U / 2} 21 C${U / 2 - 4} 19 ${U / 2 - 5} 13 ${U / 2} 7Z`, fill: "#ff3d00" }, g); return g; });
  const outline = svgEl("rect", { x: OX - 4, y: OY - 4, width: 10, height: 10, rx: 12, fill: "none", stroke: "#f4efe6", "stroke-width": 3, "stroke-dasharray": "8 6", opacity: 0 }, svg);
  const dims = svgEl("g", { opacity: 0, fill: "#f4efe6", "font-family": "Kalam, cursive", "font-size": 22, "font-weight": 700 }, svg);
  const diyas = svgEl("g", {}, svg);
  const answer = svgEl("text", { x: 470, y: 210, "text-anchor": "middle", "font-family": "IBM Plex Mono, monospace", "font-size": 22, "font-weight": 600, fill: "#fff1d6", opacity: 0 }, svg);
  const pool = (k) => ({ x: 450 + (k % 2) * 38, y: 70 + Math.floor(k / 2) * 38 });
  const tries = []; let cur = -1;
  function place(a, instant) {
    const b = BARS - a, need = a * b, d = instant || REDUCED ? 0 : 1;
    bars.forEach(([o, i2], k) => {
      const side = k < a, to = side ? { x: OX + X + k * U, y: OY, width: U, height: X } : { x: OX, y: OY + X + (k - a) * U, width: X, height: U };
      gsap.to(o, { attr: to, duration: .6 * d, delay: k * .05 * d, ease: "back.out(1.3)" });
      gsap.to(i2, { attr: { x: to.x + 4, y: to.y + 4, width: to.width - 8, height: to.height - 8 }, duration: .6 * d, delay: k * .05 * d, ease: "back.out(1.3)" });
    });
    const cells = [];
    for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) cells.push({ x: OX + X + i * U, y: OY + X + j * U });
    units.forEach((u, k) => {
      gsap.killTweensOf(u);
      if (k < cells.length) gsap.to(u, { x: cells[k].x, y: cells[k].y, rotation: 0, duration: .55 * d, delay: (.35 + k * .06) * d, ease: "back.out(1.6)", transformOrigin: "50% 50%" });
      else { const p = pool(k - cells.length); gsap.to(u, { x: p.x, y: p.y, duration: .6 * d, delay: (.35 + k * .05) * d, ease: "bounce.out" }); if (d) gsap.to(u, { rotation: 7, yoyo: true, repeat: -1, duration: .35, delay: 1.1, ease: "sine.inOut", transformOrigin: "50% 50%" }); }
    });
    const holes = $("#holes", svg); gsap.killTweensOf([...holes.children]); holes.innerHTML = "";
    cells.slice(UNITS).forEach((c, k) => { const h = svgEl("rect", { x: c.x + 3, y: c.y + 3, width: U - 6, height: U - 6, rx: 4, fill: "none", stroke: "#f4efe6", "stroke-width": 2, "stroke-dasharray": "3 3" }, holes); gsap.fromTo(h, { opacity: 0 }, { opacity: 1, duration: .3, delay: .9 * d + k * .05, onComplete: () => d && gsap.to(h, { opacity: .25, yoyo: true, repeat: -1, duration: .6 }) }); });
    gsap.to([outline, dims, answer], { opacity: 0, duration: .2 }); diyas.innerHTML = "";
    if (need === UNITS && a && b) {
      const w = X + a * U, hgt = X + b * U;
      gsap.set(outline, { attr: { width: w + 8, height: hgt + 8 } });
      dims.innerHTML = `<text x="${OX + w / 2}" y="${OY - 16}" text-anchor="middle">x + ${a}</text><text transform="translate(${OX - 18} ${OY + hgt / 2}) rotate(-90)" text-anchor="middle">x + ${b}</text>`;
      answer.textContent = `(x + ${a})(x + ${b})`;
      for (const [cx, cy] of [[OX - 4, OY - 4], [OX + w + 4, OY - 4], [OX - 4, OY + hgt + 4], [OX + w + 4, OY + hgt + 4]]) {
        const g = svgEl("g", { transform: `translate(${cx} ${cy})` }, diyas);
        svgEl("circle", { r: 22, fill: "url(#dg)", class: "glow", opacity: 0 }, g);
        svgEl("path", { d: "M-11 2 Q0 14 11 2 Z", fill: "#c8742a" }, g);
        svgEl("path", { d: "M0 -14 C5 -8 4 -3 0 -1 C-4 -3 -5 -8 0 -14Z", fill: "#ffd36b", class: "flame" }, g);
      }
      const L = 2 * (w + hgt + 16);
      gsap.timeline({ delay: 1.1 * d })
        .fromTo(outline, { opacity: 1, attr: { "stroke-dashoffset": L } }, { attr: { "stroke-dashoffset": 0 }, duration: .9 * d + .01, ease: "power2.inOut" })
        .from($$("g > g", diyas), { scale: 0, transformOrigin: "50% 50%", stagger: .12, duration: .4, ease: "back.out(3)" })
        .to($$(".glow", diyas), { opacity: 1, duration: .4 }, "<.2")
        .to(dims, { opacity: 1, duration: .5 })
        .fromTo(answer, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .5, ease: "back.out(2)" });
      if (d) gsap.to($$(".flame", diyas), { scaleY: 1.2, transformOrigin: "50% 100%", yoyo: true, repeat: -1, duration: .3, ease: "sine.inOut", stagger: .07, delay: 2 });
    }
  }
  function choose(a) {
    if (a === cur) return; cur = a;
    $$(".knob", booth).forEach((k) => k.setAttribute("aria-pressed", String(+k.dataset.n === a)));
    place(a);
    const b = BARS - a, need = a * b, fits = need === UNITS;
    tries.push({ a, b, fits });
    $("#trail", booth).innerHTML = tries.map((t) => `<span class="${t.fits ? "fit" : ""}">${t.a}|${t.b}</span>`).join("");
    api.note(`Split ${a} | ${b}: corner needs ${need}, ${fits ? "fits exactly" : need > UNITS ? `${need - UNITS} hole${need - UNITS > 1 ? "s" : ""}` : `${UNITS - need} left over`}`, fits ? "good" : "");
    if (fits) {
      const ordered = tries.every((t, k) => k === 0 || Math.abs(t.a - tries[k - 1].a) === 1);
      const t = tries.length === 1 ? "<b>Fit on the first try.</b> Fluent with the product–sum idea." : ordered ? `<b>Found it in ${tries.length} tries</b>, stepping one at a time: a systematic search.` : `<b>Found it in ${tries.length} tries</b>, jumping around. Not yet linking the corner to the 6.`;
      setTimeout(() => api.noticed(t), REDUCED ? 0 : 2400);
      api.learn("PAIR", .8, tries.length === 1 ? .95 : ordered ? .75 : .45);
    }
  }
  $$(".knob", booth).forEach((k) => k.addEventListener("click", () => choose(+k.dataset.n)));
  units.forEach((u, k) => gsap.set(u, pool(k)));
  cur = 0; place(0, true);
  return () => gsap.killTweensOf([...units, ...bars.flat(), outline, dims, answer]);
} };

// =================== 4. Bioscope ===================
GAMES.bioscope = { mount(booth, api) {
  booth.innerHTML = `<p class="ask">Sam is checking <span class="m">x² − x − 6</span> by expanding. Turn the crank to play the film, and press <b>ROKO!</b> the moment something goes wrong.</p>
    <div class="bio">
      <div class="bioframe"><div class="lens"><svg viewBox="0 0 560 250" id="lsv"></svg><div class="grain"></div><div class="flick" id="flick" hidden></div></div></div>
      <div class="biobar"><button class="crank" id="crank" type="button" aria-label="Play or pause the film"></button><div class="strip"><span class="fill" id="fill"></span><span class="marks" id="marks"></span><input type="range" id="sc" min="0" max="1000" value="0" aria-label="Scrub the film"></div></div>
      <div class="row"><button class="btn red" id="roko" type="button">ROKO! That's wrong</button><button class="btn alt" id="fine" type="button" disabled>Sab theek hai · looks right</button></div>
    </div>`;
  const svg = $("#lsv", booth), INK = "#3b2414", SOFT = "#8a6a4a";
  const T = (x, y, s, size = 34, fill = INK, extra = {}) => { const e = svgEl("text", { x, y, "text-anchor": "middle", "font-size": size, fill, "font-weight": 600, ...extra }, svg); e.textContent = s; return e; };
  const stepLabel = T(280, 32, "", 15, SOFT, { "font-weight": 600, "font-family": "Kalam, cursive" });
  [["(", 182], [")", 280], ["(", 312], [")", 412]].forEach(([s, x]) => T(x, 102, s, 36, SOFT));
  const F = { a1: T(205, 102, "x"), a2: T(250, 102, "−3"), b1: T(337, 102, "x"), b2: T(384, 102, "+2") };
  svgEl("line", { x1: 100, x2: 460, y1: 150, y2: 150, stroke: "#c9a46a", "stroke-width": 2 }, svg);
  const terms = { s1: T(0, 0, "x²"), s2: T(0, 0, "+ 2x"), s3: T(0, 0, "− 3x"), s4: T(0, 0, "+ 6"), comb: T(0, 0, "− x"), check: T(430, 208, "✓", 38, "#0d7a63") };
  Object.values(terms).forEach((t) => gsap.set(t, { opacity: 0 }));
  const COLORS = ["#2d5fa8", "#0d7a63", "#7a3fb0", "#b5420c"];
  const arcs = [["a1", "b1"], ["a1", "b2"], ["a2", "b1"], ["a2", "b2"]].map(([p, q], k) => {
    const x1 = +F[p].getAttribute("x"), x2 = +F[q].getAttribute("x");
    const e = svgEl("path", { d: `M${x1} 72 Q${(x1 + x2) / 2} ${10 - k * 4} ${x2} 72`, fill: "none", stroke: COLORS[k], "stroke-width": 3, "stroke-linecap": "round" }, svg);
    const L = e.getTotalLength(); e.style.strokeDasharray = L; e.style.strokeDashoffset = L; return e;
  });
  const tl = gsap.timeline({ paused: true, onUpdate: () => { $("#sc", booth).value = Math.round(tl.progress() * 1000); $("#fill", booth).style.width = `${tl.progress() * 100}%`; },
    onComplete: () => { $("#fine", booth).disabled = false; $("#crank", booth).classList.remove("spin"); $("#flick", booth).hidden = true; } });
  const steps = [];
  function mult(label, text, p, q, term, x, k, t) {
    steps.push({ label, text, t });
    tl.addLabel(label, t).set(stepLabel, { textContent: `Step ${label}: ${text}` }, t)
      .to(arcs[k], { strokeDashoffset: 0, duration: .6, ease: "power2.inOut" }, t)
      .to([F[p], F[q]], { fill: COLORS[k], duration: .2 }, t)
      .fromTo(term, { attr: { x: (+F[p].getAttribute("x") + +F[q].getAttribute("x")) / 2, y: 62 }, opacity: 0 }, { opacity: 1, duration: .25 }, t + .6)
      .to(term, { attr: { x, y: 205 }, duration: .75, ease: "power3.inOut" }, t + .8)
      .to(arcs[k], { opacity: 0, duration: .3 }, t + 1.5).to([F[p], F[q]], { fill: INK, duration: .3 }, t + 1.5);
  }
  mult("A", "x × x", "a1", "b1", terms.s1, 140, 0, .5); mult("B", "x × (+2)", "a1", "b2", terms.s2, 230, 1, 2.5);
  mult("C", "(−3) × x", "a2", "b1", terms.s3, 320, 2, 4.5); mult("D", "(−3) × (+2)", "a2", "b2", terms.s4, 410, 3, 6.5);
  steps.push({ label: "E", text: "collect the x terms", t: 8.5 });
  tl.addLabel("E", 8.5).set(stepLabel, { textContent: "Step E: collect the x terms" }, 8.5)
    .to([terms.s2, terms.s3], { attr: { x: 275 }, duration: .6, ease: "power3.in" }, 8.6).to([terms.s2, terms.s3], { opacity: 0, duration: .15 }, 9.15)
    .fromTo(terms.comb, { attr: { x: 275, y: 205 }, opacity: 0 }, { opacity: 1, duration: .3, ease: "back.out(3)" }, 9.2);
  steps.push({ label: "F", text: "Sam's answer", t: 10.2 });
  tl.addLabel("F", 10.2).set(stepLabel, { textContent: "Step F: Sam's answer, x² − x + 6" }, 10.2)
    .to(terms.s1, { attr: { x: 190 }, duration: .5 }, 10.2).to(terms.comb, { attr: { x: 265 }, duration: .5 }, 10.2).to(terms.s4, { attr: { x: 340 }, duration: .5 }, 10.2)
    .fromTo(terms.check, { opacity: 0, attr: { y: 218 } }, { opacity: 1, attr: { y: 208 }, duration: .4, ease: "back.out(3)" }, 10.8).to({}, { duration: .8 });
  const D = tl.duration();
  $("#marks", booth).innerHTML = steps.map((s) => `<span style="left:${(s.t / D) * 100}%"><b>${s.label}</b></span>`).join("");
  const stepAt = (t) => [...steps].reverse().find((s) => t >= s.t) ?? steps[0];
  function playing(on) { $("#crank", booth).classList.toggle("spin", on); $("#flick", booth).hidden = !on || REDUCED; }
  $("#crank", booth).addEventListener("click", () => {
    if (tl.progress() >= 1) { tl.restart(); playing(true); api.note("Rewound and replayed the film"); }
    else if (tl.paused() || !tl.isActive()) { tl.play(); playing(true); api.note(tl.time() < .1 ? "Started the film" : "Kept cranking"); }
    else { tl.pause(); playing(false); api.note(`Paused at ${tl.time().toFixed(1)}s`); }
  });
  $("#sc", booth).addEventListener("input", (e) => { tl.pause(); playing(false); tl.progress(e.target.value / 1000); });
  $("#sc", booth).addEventListener("change", () => api.note(`Scrubbed to step ${stepAt(tl.time()).label}`));
  $("#roko", booth).addEventListener("click", () => {
    tl.pause(); playing(false);
    const t = tl.time(), s = stepAt(t), late = t - 7.1;
    let r, cert = .8;
    if (s.label === "D") r = `<b>Shouted ROKO in step D</b>, ${Math.max(0, late).toFixed(1)}s after −3 × +2 became +6. ${late < 1.2 ? "Fast: this is fluent." : "Got there, but it took a moment."}`;
    else if (s.label === "E" || s.label === "F") { r = s.label === "E" && late < 2.6 ? `<b>Probably meant step D</b>, just a little late (${late.toFixed(1)}s).` : `<b>Stopped at step ${s.label}</b> (${s.text}), not at D. Missed the sign error.`; cert = .55; }
    else { r = `<b>False alarm at step ${s.label}</b> (${s.text}). That step looks wrong to them, which is a gap of its own.`; cert = .6; }
    api.noticed(r + " <span style='color:#8a6a4a'>(Scrub to adjust, then press ROKO again.)</span>");
    api.note(`ROKO at ${t.toFixed(1)}s, step ${s.label}`, s.label === "D" ? "good" : "warn");
    api.learn("CHECK", .6, cert); if (s.label === "D") api.learn("SIGNS", .5, cert);
  });
  $("#fine", booth).addEventListener("click", () => {
    api.noticed("<b>Said it all looks right.</b> Either they'd make Sam's sign slip themselves, or they don't check every part. One follow-up would tell which.");
    api.note("Said the film looked right", "warn"); api.learn("CHECK", .6, .75); api.learn("SIGNS", .5, .7);
  });
  return () => tl.kill();
} };

// =================== 5. Toy Train ===================
GAMES.rail = { mount(booth, api) {
  const CARDS = [
    { id: "L1", t: "= (6xy − 4y) − (9x − 6)", ok: 0 }, { id: "D1", t: "= (6xy − 4y) − (9x + 6)", bad: "kept the + inside after taking out −" },
    { id: "L2", t: "= 2y(3x − 2) − 3(3x − 2)", ok: 1 }, { id: "D2", t: "= 2y(3x − 2) − 3(3x + 2)", bad: "didn't flip the sign when taking out −3" },
    { id: "L3", t: "= (3x − 2)(2y − 3)", ok: 2 }, { id: "D3", t: "= (3x − 2)(2y + 3)", bad: "lost the minus in the last bracket" },
  ];
  const COLS = [["#ffd36b", "#e0a01a"], ["#ff9ac4", "#e24f8c"], ["#7fe0cf", "#16a58b"], ["#a8d4ff", "#4f95e0"], ["#ffb27a", "#e8691a"], ["#c9b8ff", "#8a6ad8"]];
  const order = [3, 0, 5, 2, 1, 4];
  booth.innerHTML = `<p class="ask">Factorise <span class="m">6xy − 4y − 9x + 6</span> by grouping. Couple three coaches to the engine, in order. Careful: three of the coaches carry a slip.</p>
    <div class="yard" id="yard"><p>The siding: tap a coach to couple it to the train</p>${order.map((k, j) => `<button class="coach" type="button" data-id="${CARDS[k].id}" style="--c1:${COLS[j][0]};--c2:${COLS[j][1]}"><span class="win"><i></i><i></i><i></i><i></i></span><span class="m">${CARDS[k].t}</span></button>`).join("")}</div>
    <div class="trackwrap"><div class="track" id="track">
      <svg class="engine" viewBox="0 0 120 86" aria-hidden="true"><rect x="8" y="34" width="70" height="34" rx="6" fill="#e0262b"/><rect x="58" y="14" width="44" height="54" rx="6" fill="#ff7a1f"/><rect x="66" y="22" width="26" height="16" rx="3" fill="#fff1d6"/><rect id="chim" x="18" y="12" width="14" height="22" fill="#3d3170"/><rect x="14" y="8" width="22" height="6" rx="2" fill="#3d3170"/><path d="M0 64 L10 52 V68Z" fill="#d9a441"/>${[22, 54, 88].map((x) => `<g class="wh" style="transform-origin:${x}px 72px"><circle cx="${x}" cy="72" r="12" fill="#130e2a" stroke="#d9a441" stroke-width="3"/><path d="M${x - 10} 72 H${x + 10} M${x} 62 V82" stroke="#d9a441" stroke-width="2"/></g>`).join("")}</svg>
      ${[1, 2, 3].map((n) => `<div class="slot" data-s="${n - 1}"><span>Coach ${n}</span></div>`).join("")}
    </div></div>
    <div class="row"><button class="btn" id="go" type="button" disabled>Wave the green flag</button></div>`;
  const yard = $("#yard", booth), slots = $$(".slot", booth), placedEver = new Set();
  function move(c) {
    const state = Flip.getState($$(".coach", booth));
    const card = CARDS.find((x) => x.id === c.dataset.id);
    if (c.parentElement.classList.contains("slot")) { yard.appendChild(c); api.note(`Uncoupled ${card.t.slice(2)}`, card.bad ? "good" : "warn"); }
    else {
      const free = slots.find((s) => !$(".coach", s)); if (!free) return;
      free.appendChild(c); placedEver.add(card.id); api.note(`Coach ${+free.dataset.s + 1}: ${card.t.slice(2)}`);
    }
    Flip.from(state, { duration: REDUCED ? 0 : .65, ease: "power3.inOut", absolute: true, scale: true, onComplete: () => !REDUCED && gsap.fromTo(c, { x: -6 }, { x: 0, duration: .4, ease: "elastic.out(1.2,.3)" }) });
    $("#go", booth).disabled = slots.some((s) => !$(".coach", s));
  }
  booth.addEventListener("click", (e) => { const c = e.target.closest(".coach"); if (c && booth.contains(c)) move(c); });
  $("#go", booth).addEventListener("click", () => {
    const chosen = slots.map((s) => CARDS.find((c) => c.id === $(".coach", s).dataset.id));
    const slips = chosen.filter((c) => c.bad), rightSet = chosen.every((c) => c.ok !== undefined), rightOrder = rightSet && chosen.every((c, k) => c.ok === k);
    const fixed = [...placedEver].filter((id) => id.startsWith("D") && !chosen.some((c) => c.id === id));
    let t = rightOrder ? "<b>All three coaches right, in order.</b> As strong as typed working." : rightSet ? "<b>Right coaches, wrong order.</b> Knows the moves, not yet the shape of the method." : `<b>Coupled ${slips.length} coach${slips.length > 1 ? "es" : ""} with a slip:</b> ${slips.map((s) => s.bad).join("; ")}.`;
    if (fixed.length) t += ` They also uncoupled ${fixed.length} slip coach${fixed.length > 1 ? "es" : ""} before leaving, so they caught their own slip.`;
    $("#go", booth).disabled = true;
    const track = $("#track", booth), w = track.parentElement.clientWidth + 200;
    const tl = gsap.timeline({ onComplete: () => { api.noticed(t); $("#go", booth).disabled = false; } });
    if (!REDUCED) {
      tl.to($$(".wh", track), { rotation: 720, duration: 2.4, ease: "power1.in" }, 0)
        .to(track, { x: w, duration: 1.8, ease: "power2.in" }, .3)
        .set(track, { x: -track.scrollWidth - 40 })
        .to(track, { x: 0, duration: 1.4, ease: "power3.out" })
        .to($$(".wh", track), { rotation: 1440, duration: 1.4, ease: "power3.out" }, "<");
      for (let i = 0; i < 6; i++) tl.call(() => { const p = html(`<i class="puff"></i>`); track.appendChild(p); gsap.fromTo(p, { x: 18, y: 0, scale: .4, opacity: .8 }, { x: -30 - Math.random() * 20, y: -50 - Math.random() * 20, scale: 1.8, opacity: 0, duration: 1.1, onComplete: () => p.remove() }); }, null, i * .25);
    }
    api.note(`Train left: ${chosen.map((c) => c.id).join(" → ")}`, "good");
    api.learn("GROUP", .8, rightOrder ? .9 : .7); if (slips.length) api.learn("SIGNS", .6, .8);
  });
  return () => {};
} };

// =================== 6. Tijori ===================
GAMES.tijori = { mount(booth, api) {
  const NUMS = [...Array.from({ length: 12 }, (_, k) => k - 12), ...Array.from({ length: 12 }, (_, k) => k + 1)];
  const ROW = 52, TP = -12, TS = -1;
  booth.innerHTML = `<p class="ask">The tijori opens for <span class="m">x² − x − 12</span>. Find two numbers that multiply to <b>−12</b> and add to <b>−1</b>. Drag the brass wheels or tap the arrows.</p>
    <div class="tij">
      <div style="display:grid;gap:12px">
        <div class="gauges">${[["prod", "multiply → −12", TP, 60], ["sum", "add → −1", TS, 24]].map(([id, lab, tgt, R]) => `<div class="gauge"><span class="lab">${lab}</span><svg viewBox="0 0 200 112"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#3d3170" stroke-width="14" stroke-linecap="round"/>${Array.from({ length: 11 }, (_, i) => { const a = (-90 + i * 18) * Math.PI / 180; return `<line x1="${100 + 66 * Math.sin(a)}" y1="${100 - 66 * Math.cos(a)}" x2="${100 + 74 * Math.sin(a)}" y2="${100 - 74 * Math.cos(a)}" stroke="#8f84b8" stroke-width="2"/>`; }).join("")}<line x1="100" y1="100" x2="${100 + 84 * Math.sin((tgt / R) * Math.PI / 2)}" y2="${100 - 84 * Math.cos((tgt / R) * Math.PI / 2)}" stroke="#ffb21e" stroke-width="4" stroke-dasharray="3 4"/><line id="n${id}" x1="100" y1="100" x2="100" y2="28" stroke="#fff1d6" stroke-width="4" stroke-linecap="round"/><circle cx="100" cy="100" r="9" fill="#d9a441"/></svg><span class="val" id="v${id}">1</span></div>`).join("")}</div>
        <div class="safe" id="safe"><div class="inside"><div><span style="font-family:var(--hand);font-size:1.1rem">Unlocked!</span><br><b>(x − 4)(x + 3)</b></div></div>
          <div class="door" id="door"><div class="rivets"></div>
            <div class="wheels">${["p", "q"].map((r, k) => `${k ? '<span style="font:800 1.4rem var(--display);color:#d9a441">&amp;</span>' : ""}<div class="wheel"><button type="button" data-r="${r}" data-d="-1" aria-label="up">▲</button><div class="wwin" id="w${r}"><div class="band"></div><div class="wlist" id="l${r}">${NUMS.map((n) => `<div>${sgn(n)}</div>`).join("")}</div></div><button type="button" data-r="${r}" data-d="1" aria-label="down">▼</button></div>`).join("")}</div>
            <svg class="handle" id="handle" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="8" fill="#d9a441"/>${[0, 120, 240].map((a) => `<g transform="rotate(${a} 30 30)"><rect x="27" y="4" width="6" height="22" rx="3" fill="#d9a441"/><circle cx="30" cy="6" r="5" fill="#ffd36b"/></g>`).join("")}</svg>
          </div></div>
      </div>
      <div class="notebook"><h4>The safecracker's notebook</h4><svg viewBox="0 0 300 190" id="tmap"></svg><p style="font-family:var(--hand);font-size:.95rem" id="nbtext">Every pair you try gets a dot. The dashed line is every pair that multiplies to −12.</p></div>
    </div>`;
  const map = $("#tmap", booth), INK = "#3b2414";
  const mx = (s) => 30 + ((s + 24) / 48) * 260, my = (p) => 95 - (Math.max(-40, Math.min(40, p)) / 40) * 80;
  map.innerHTML = `<line x1="30" y1="95" x2="290" y2="95" stroke="#c9a46a"/><line x1="160" y1="10" x2="160" y2="180" stroke="#c9a46a"/><line x1="30" y1="${my(TP)}" x2="290" y2="${my(TP)}" stroke="#a8164f" stroke-dasharray="4 4"/>
    <text x="290" y="90" text-anchor="end" font-size="11" fill="${INK}" font-family="Kalam,cursive">add →</text><text x="164" y="20" font-size="11" fill="${INK}" font-family="Kalam,cursive">multiply</text>
    <circle cx="${mx(TS)}" cy="${my(TP)}" r="10" fill="none" stroke="#0d7a63" stroke-width="2.5"/><polyline id="path" fill="none" stroke="#2d5fa8" stroke-width="2" stroke-linejoin="round" points=""/><g id="dots"></g>`;
  const idx = { p: NUMS.indexOf(1), q: NUMS.indexOf(1) }, tries = [];
  let settleT = null, solved = false;
  const val = (r) => NUMS[idx[r]];
  const needle = (id, v, R) => { gsap.to(`#n${id}`, { rotation: Math.max(-1, Math.min(1, v / R)) * 90, svgOrigin: "100 100", duration: 1, ease: "elastic.out(1,.4)" }); $(`#v${id}`, booth).textContent = sgn(v); };
  function update() { const p = val("p"), q = val("q"); needle("prod", p * q, 60); needle("sum", p + q, 24); clearTimeout(settleT); settleT = setTimeout(() => settle(p, q), 550); }
  function settle(p, q) {
    if (solved) return;
    const last = tries.at(-1); if (last && last.p === p && last.q === q) return;
    tries.push({ p, q });
    $("#path", map).setAttribute("points", tries.map((t) => `${mx(t.p + t.q)},${my(t.p * t.q)}`).join(" "));
    const d = svgEl("circle", { cx: mx(p + q), cy: my(p * q), r: 4.5, fill: "#2d5fa8" }, $("#dots", map));
    gsap.from(d, { attr: { r: 12 }, opacity: 0, duration: .5, ease: "back.out(3)" });
    const pOK = p * q === TP, slip = pOK && p + q === -TS;
    api.note(`Tried ${sgn(p)} and ${sgn(q)}: multiply ${sgn(p * q)}, add ${sgn(p + q)}${slip ? ". The classic sign slip." : pOK ? ". On the product line." : ""}`, slip ? "warn" : pOK ? "good" : "");
    if (pOK && p + q === TS) {
      solved = true;
      const on = tries.filter((t) => t.p * t.q === TP).length, hadSlip = tries.some((t) => t.p * t.q === TP && t.p + t.q === -TS);
      const style = tries.length <= 2 ? "Straight there: fluent." : on / tries.length >= .5 ? `${on} of ${tries.length} tries on the product line: a systematic hunt.` : `Only ${on} of ${tries.length} tries on the product line: trial and error.`;
      if (!REDUCED) gsap.timeline().to("#handle", { rotation: 300, svgOrigin: "30 30", duration: .8, ease: "power2.inOut" }).to("#door", { rotationY: -108, duration: 1.4, ease: "power3.inOut" }, "+=.1");
      else gsap.set("#door", { rotationY: -108 });
      $("#nbtext", booth).textContent = `${tries.length} tries. ${style}`;
      setTimeout(() => api.noticed(`<b>Safe open.</b> ${style}${hadSlip ? " On the way they hit 4 and −3, the classic sign slip, and fixed it themselves." : ""}`), REDUCED ? 0 : 1800);
      api.learn("PAIR", .8, tries.length <= 2 ? .95 : .7); if (hadSlip) api.learn("SIGNS", .6, .6);
    }
  }
  const drags = ["p", "q"].map((r) => {
    const list = $(`#l${r}`, booth); gsap.set(list, { y: ROW - idx[r] * ROW });
    return Draggable.create(list, { type: "y", trigger: $(`#w${r}`, booth), bounds: { minY: ROW - (NUMS.length - 1) * ROW, maxY: ROW }, liveSnap: { y: (v) => Math.round(v / ROW) * ROW }, onDrag() { idx[r] = Math.round((ROW - this.y) / ROW); update(); } })[0];
  });
  $$(".wheel button", booth).forEach((b) => b.addEventListener("click", () => {
    const r = b.dataset.r; idx[r] = Math.max(0, Math.min(NUMS.length - 1, idx[r] + +b.dataset.d));
    gsap.to(`#l${r}`, { y: ROW - idx[r] * ROW, duration: .35, ease: "back.out(2)", onComplete: () => drags[r === "p" ? 0 : 1].update() });
    update();
  }));
  needle("prod", 1, 60); needle("sum", 2, 24);
  return () => { drags.forEach((d) => d.kill()); clearTimeout(settleT); };
} };
