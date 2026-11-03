// =================== 7. Tarazu ===================
GAMES.tarazu = { mount(booth, api) {
  booth.innerHTML = `<p class="ask">Is this always true? Put different values of x on the tarazu and watch which side is heavier.</p>
    <div class="big">(x + 3)² = x² + 9</div>
    <div class="tz"><svg viewBox="0 0 600 340" id="tzs" aria-label="Balance scale"></svg></div>
    <div class="rail"><div class="lbl"><span>x = <b class="m" id="xv">0</b></span><span style="color:var(--soft)">values you've weighed</span></div><input type="range" id="xs" min="-6" max="6" step="1" value="0" aria-label="x"><div class="beads" id="beads"></div></div>
    <div class="banners">${[["Always true", "Hamesha"], ["Sometimes true", "Kabhi-kabhi"], ["Never true", "Kabhi nahi"]].map(([e, h]) => `<button class="banner" type="button" data-a="${e}" aria-pressed="false">${e}<small>${h}</small></button>`).join("")}</div>
    <div class="row"><button class="btn" id="lock" type="button" disabled>Decide</button></div>`;
  const svg = $("#tzs", booth), P = { x: 300, y: 74 }, HALF = 200;
  svg.innerHTML = `<rect x="230" y="300" width="140" height="22" rx="6" fill="#8b5a33"/><rect x="292" y="74" width="16" height="230" rx="4" fill="#d9a441"/><path d="M300 40 l14 34 h-28z" fill="#d9a441"/>
    <g id="beam"><rect x="100" y="68" width="400" height="12" rx="6" fill="#d9a441"/><circle cx="100" cy="74" r="7" fill="#ffd36b"/><circle cx="500" cy="74" r="7" fill="#ffd36b"/></g><circle cx="300" cy="74" r="10" fill="#ffd36b" stroke="#8a5a10" stroke-width="3"/>
    ${["L", "R"].map((s) => `<g id="pan${s}"><path d="M0 0 L-62 112 M0 0 L62 112" stroke="#c8bde8" stroke-width="1.5"/><g id="w${s}"></g><path d="M-76 112 Q0 150 76 112 Z" fill="#ffb21e" stroke="#a86400" stroke-width="2"/><text y="176" text-anchor="middle" font-size="16" fill="#c8bde8" id="t${s}"></text><text y="202" text-anchor="middle" font-size="26" font-weight="600" fill="#fff1d6" id="v${s}"></text></g>`).join("")}`;
  const ang = { a: 0 };
  function drawBeam() {
    const r = ang.a * Math.PI / 180;
    $("#beam", svg).setAttribute("transform", `rotate(${ang.a} ${P.x} ${P.y})`);
    $("#panL", svg).setAttribute("transform", `translate(${P.x - HALF * Math.cos(r)} ${P.y - HALF * Math.sin(r)})`);
    $("#panR", svg).setAttribute("transform", `translate(${P.x + HALF * Math.cos(r)} ${P.y + HALF * Math.sin(r)})`);
  }
  function weights(id, v) {
    const g = $(`#w${id}`, svg), n = Math.min(8, Math.ceil(v / 10));
    g.innerHTML = Array.from({ length: n }, (_, k) => `<path d="M${-26 + (k % 4) * 15} ${106 - Math.floor(k / 4) * 18} h12 l2 -14 h-16z" fill="#8a8fa8" stroke="#3d3170"/>`).join("");
    if (!REDUCED) gsap.from(g.children, { y: -30, opacity: 0, stagger: .04, duration: .35, ease: "bounce.out" });
  }
  const tested = new Map(); let pick = null;
  function show(x) {
    const L = (x + 3) ** 2, R = x * x + 9;
    $("#xv", booth).textContent = sgn(x);
    $("#tL", svg).textContent = `(x + 3)²`; $("#tR", svg).textContent = `x² + 9`;
    $("#vL", svg).textContent = L; $("#vR", svg).textContent = R;
    weights("L", L); weights("R", R);
    gsap.to(ang, { a: Math.max(-1, Math.min(1, (R - L) / 30)) * 16, duration: REDUCED ? 0 : 1.4, ease: "elastic.out(1,.35)", onUpdate: drawBeam });
    if (!tested.has(x)) {
      tested.set(x, L === R);
      const b = document.createElement("i"); b.style.left = `${((x + 6) / 12) * 100}%`; b.style.background = b.style.color = L === R ? css("--peacock") : css("--rani");
      $("#beads", booth).appendChild(b); if (!REDUCED) gsap.from(b, { scale: 0, duration: .4, ease: "back.out(3)" });
      api.note(`Weighed x = ${sgn(x)}: ${L} ${L === R ? "=" : "≠"} ${R}`);
    }
  }
  $("#xs", booth).addEventListener("input", (e) => show(+e.target.value));
  $$(".banner", booth).forEach((b) => b.addEventListener("click", () => { pick = b.dataset.a; $$(".banner", booth).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); $("#lock", booth).disabled = false; }));
  $("#lock", booth).addEventListener("click", () => {
    const n = tested.size, sawNe = [...tested.values()].includes(false);
    let t, cert = .8;
    if (pick === "Always true" && !sawNe) t = `<b>Weighed only ${n === 1 ? "x = 0" : "values that happened to balance"} and said always.</b> Checks one easy case and stops.`;
    else if (pick === "Always true") { t = "<b>Saw the scale tip and still said always.</b> Believes (a + b)² = a² + b² firmly enough to overrule the tarazu. Worth a teacher's attention."; cert = .95; }
    else if (pick === "Never true") t = tested.get(0) ? "<b>Saw it balance at x = 0, but said never.</b> Doesn't count one case as “sometimes”, which is a language gap more than an algebra one." : "<b>Said never without weighing x = 0.</b>";
    else t = `<b>Sometimes, after weighing ${n} value${n > 1 ? "s" : ""}.</b> ${n >= 3 && sawNe ? "Tested like a mathematician." : "Right, but tested very little."}`;
    api.noticed(t); api.note(`Decided “${pick}” after ${n} weighing${n > 1 ? "s" : ""}`, "good");
    api.learn("SQUARES", .7, cert); api.learn("CHECK", .5, cert);
  });
  tested.set(0, true);
  const b0 = document.createElement("i"); b0.style.left = "50%"; b0.style.background = b0.style.color = css("--peacock"); $("#beads", booth).appendChild(b0);
  $("#tL", svg).textContent = "(x + 3)²"; $("#tR", svg).textContent = "x² + 9"; $("#vL", svg).textContent = 9; $("#vR", svg).textContent = 9;
  weights("L", 9); weights("R", 9); drawBeam();
  return () => gsap.killTweensOf(ang);
} };

// =================== 8. Jadoo Show ===================
GAMES.jadoo = { mount(booth, api) {
  const st = { n1: 1, n2: 1, s1: null, s2: null };
  booth.innerHTML = `<div class="show" id="show"><div class="valance"></div><div class="curtain l" id="cl"></div><div class="curtain r" id="cr"></div>
      <p class="ask" style="position:relative;z-index:1;text-align:center">Tonight's trick: factorise <span class="m">x² − x − 6</span> in two moves.</p>
      <div class="trickrow">
        <div class="mcard"><span>Move 1 · two numbers that multiply to −6 and add to −1</span><div class="row">${picker("n1", 1)}<span>and</span>${picker("n2", 1)}</div></div>
        <div class="mcard"><span>Move 2 · tap the cards to set the signs</span><span class="brk" style="color:var(--cream)">(x <button class="tog" id="s1" type="button">?</button> <span id="m1">1</span>)(x <button class="tog" id="s2" type="button">?</button> <span id="m2">1</span>)</span></div>
      </div>
      <div class="row" style="justify-content:center;position:relative;z-index:1"><button class="btn" id="perform" type="button" disabled>Perform the trick</button><button class="btn red" id="rev" type="button" hidden>Reveal how it worked</button></div>
      <div class="reveal" id="res" hidden>
        <div class="marked"><span class="chiplab">The audience sees</span><span class="stampbig" id="oldv"></span><span id="final" class="m" style="font-size:1.2rem"></span></div>
        <div class="xray"><div class="layers" id="layers"></div></div>
      </div>
    </div>
    <div style="display:grid;gap:6px"><span class="chiplab">Or watch a student who…</span><div class="chipset" id="as"><button type="button" data-p="right">does it properly</button><button type="button" data-p="double">makes two slips that cancel</button><button type="button" data-p="slip">slips only in move 1</button><button type="button" data-p="flip">only flips the signs</button></div></div>`;
  const ready = () => ($("#perform", booth).disabled = !(st.s1 && st.s2));
  const mags = () => { $("#m1", booth).textContent = Math.abs(st.n1); $("#m2", booth).textContent = Math.abs(st.n2); };
  wirePickers(booth, st, () => { mags(); api.note(`Move 1: ${sgn(st.n1)} and ${sgn(st.n2)}`); }, -6, 6);
  ["s1", "s2"].forEach((k) => $(`#${k}`, booth).addEventListener("click", (e) => {
    st[k] = st[k] === "+" ? "−" : "+"; const b = e.currentTarget; b.textContent = st[k]; b.classList.add("set");
    if (!REDUCED) gsap.fromTo(b, { rotationY: 180 }, { rotationY: 0, duration: .45, ease: "back.out(2)" });
    api.note(`Move 2: bracket ${k === "s1" ? 1 : 2} gets ${st[k]}`); ready();
  }));
  function analyse() {
    const b1 = (st.s1 === "−" ? -1 : 1) * Math.abs(st.n1), b2 = (st.s2 === "−" ? -1 : 1) * Math.abs(st.n2);
    const nR = st.n1 * st.n2 === -6 && st.n1 + st.n2 === -1, nS = st.n1 * st.n2 === -6 && st.n1 + st.n2 === 1;
    const carried = b1 === st.n1 && b2 === st.n2, flipped = b1 === -st.n1 && b2 === -st.n2, fin = b1 * b2 === -6 && b1 + b2 === -1;
    return { b1, b2, nR, nS, carried, flipped, fin };
  }
  function sparkle(el) {
    if (REDUCED) return;
    const show = $("#show", booth), a = el.getBoundingClientRect(), s = show.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const star = html(`<svg class="star" viewBox="0 0 20 20"><path d="M10 0 L12.5 7.5 L20 10 L12.5 12.5 L10 20 L7.5 12.5 L0 10 L7.5 7.5Z" fill="${["#ffd36b", "#fff1d6", "#ec3f8c"][i % 3]}"/></svg>`);
      show.appendChild(star);
      const x = a.left - s.left + a.width / 2, y = a.top - s.top + a.height / 2, ang = Math.random() * Math.PI * 2, d = 50 + Math.random() * 60;
      gsap.fromTo(star, { x, y, scale: 0, rotation: 0 }, { x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d, scale: 1, rotation: 180, opacity: 0, duration: 1, ease: "power2.out", onComplete: () => star.remove() });
    }
  }
  function perform() {
    const r = analyse();
    $("#res", booth).hidden = false; $("#rev", booth).hidden = false;
    $("#layers", booth).innerHTML = ""; $("#oldv", booth).textContent = r.fin ? "✓" : "✗";
    $("#oldv", booth).style.color = r.fin ? css("--peacock") : css("--rani");
    $("#final", booth).textContent = `(x ${pm(r.b1)})(x ${pm(r.b2)})`;
    sparkle($("#final", booth));
    api.note(`Performed: (x ${pm(r.b1)})(x ${pm(r.b2)}). The audience sees ${r.fin ? "a right answer" : "a wrong answer"}`);
  }
  function reveal() {
    const r = analyse();
    const L = [
      ["Move 1 · the numbers", `${sgn(st.n1)} and ${sgn(st.n2)}`, r.nR ? "✓ multiply to −6, add to −1" : r.nS ? "✗ they add to +1, not −1: a sign slip" : `✗ multiply to ${sgn(st.n1 * st.n2)}, add to ${sgn(st.n1 + st.n2)}`, r.nR],
      ["Move 2 · into the brackets", r.carried ? "carried each sign straight in" : r.flipped ? "flipped both signs on the way in" : "one carried, one flipped", r.carried ? "✓ the taught method" : "✗ the signs changed on the way", r.carried],
      ["What the audience saw", `(x ${pm(r.b1)})(x ${pm(r.b2)})`, r.fin ? "✓ expands to x² − x − 6" : "✗ doesn't expand to x² − x − 6", r.fin],
    ];
    const layers = $("#layers", booth);
    layers.innerHTML = L.map(([lab, t, v, ok]) => `<div class="layer ${ok ? "ok" : "bad"}"><small>${lab}</small><span class="m">${t}</span><span class="v">${v}</span></div>`).join("");
    const els = $$(".layer", layers);
    gsap.set(layers, { rotationX: 0, rotationZ: 0 }); gsap.set(els, { z: 0, y: 0, opacity: (i) => (i === 2 ? 1 : 0) });
    if (REDUCED) { gsap.set(layers, { rotationX: 18, rotationZ: -3 }); gsap.set(els, { opacity: 1, z: (i) => (i - 1) * 40, y: (i) => (1 - i) * 102 }); }
    else gsap.timeline()
      .to(["#cl", "#cr"], { scaleX: 3.2, duration: .45, ease: "power2.in" }, 0)
      .to(["#cl", "#cr"], { scaleX: 1, duration: .6, ease: "power2.out" }, .7)
      .set(els, { opacity: 1 }, .55)
      .to(layers, { rotationX: 18, rotationZ: -3, duration: .9, ease: "power3.inOut" }, .7)
      .to(els, { z: (i) => (i - 1) * 40, y: (i) => (1 - i) * 102, duration: .9, ease: "power3.inOut", stagger: .07 }, .7);
    let t;
    if (r.nR && r.carried) t = "<b>A real trick, done properly.</b> Every layer checks out.";
    else if (r.nS && r.flipped) t = "<b>Two wrongs make a right.</b> The numbers had the wrong signs, and so did the bracket step, so they cancel. An answer-only check marks this correct every time. It falls apart when they split the middle term in Class 9.";
    else if (r.nS) t = "<b>A sign slip in move 1</b>, carried faithfully into the brackets.";
    else if (r.nR && r.flipped) t = "<b>Flips the signs into the brackets.</b> The right numbers, lost in move 2.";
    else t = "<b>The numbers in move 1 don't fit the product–sum rule.</b> Start there.";
    api.noticed(t);
    api.note(`Revealed: move 1 ${L[0][3] ? "✓" : "✗"}, move 2 ${L[1][3] ? "✓" : "✗"}, final ${r.fin ? "✓" : "✗"}`, r.nS && r.flipped ? "warn" : "good");
    api.learn("PAIR", .7, .85); if (!L[0][3] || !L[1][3]) api.learn("SIGNS", .7, .85);
  }
  $("#perform", booth).addEventListener("click", perform);
  $("#rev", booth).addEventListener("click", reveal);
  const PRESETS = { right: [-3, 2, "−", "+"], double: [3, -2, "−", "+"], slip: [3, -2, "+", "−"], flip: [-3, 2, "+", "−"] };
  $$("#as button", booth).forEach((b) => b.addEventListener("click", () => {
    $$("#as button", booth).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const [n1, n2, s1, s2] = PRESETS[b.dataset.p]; Object.assign(st, { n1, n2, s1, s2 });
    $("#n1", booth).textContent = sgn(n1); $("#n2", booth).textContent = sgn(n2);
    [["s1", s1], ["s2", s2]].forEach(([k, v]) => { const e = $(`#${k}`, booth); e.textContent = v; e.classList.add("set"); });
    mags(); ready(); api.note(`Watching a student who ${b.textContent}`);
    perform(); setTimeout(reveal, REDUCED ? 0 : 900);
  }));
  return () => {};
} };

// =================== 9. Lantern Lane ===================
GAMES.lantern = { mount(booth, api) {
  const CARDS = [{ b: 5, c: 6, ok: ["+", "+"], lc: "#ff9a3c" }, { b: -5, c: 6, ok: ["−", "−"], lc: "#ff6fa8" }, { b: 1, c: -6, ok: ["−", "+"], lc: "#5fe0c6" }, { b: -1, c: -6, ok: ["+", "−"], lc: "#ffd36b" }];
  const RULES = [
    { name: "The real rule: the signs multiply to the last sign and add to the middle", pred: CARDS.map((c) => c.ok) },
    { name: "Copy the middle sign into both brackets", pred: [["+", "+"], ["−", "−"], ["+", "+"], ["−", "−"]] },
    { name: "The minus always goes on the smaller number", pred: [["+", "+"], ["−", "−"], ["−", "+"], ["−", "+"]] },
    { name: "First bracket copies the middle sign, second copies the last", pred: [["+", "+"], ["−", "+"], ["+", "−"], ["−", "−"]] },
    { name: "Flip every sign into the brackets", pred: CARDS.map((c) => c.ok.map((s) => (s === "+" ? "−" : "+"))) },
  ];
  const t = (b, c) => `x² ${b < 0 ? "−" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}x ${c < 0 ? "−" : "+"} ${Math.abs(c)}`;
  booth.innerHTML = `<p class="ask">Each lantern factorises with the numbers 2 and 3. Set the two signs to light it.</p>
    <div class="lane"><svg class="rope" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10 Q500 70 1000 10" stroke="#c8bde8" stroke-width="2" fill="none"/></svg>
      <div class="lanterns">${CARDS.map((c, i) => `<div class="lan" data-i="${i}" style="--lc:${c.lc}"><span class="cap"></span><div class="body"><span class="m">${t(c.b, c.c)}</span></div><span class="cap" style="width:50%"></span><span class="tassel"></span><span class="sw">(x <button class="tog" type="button" data-c="${i}" data-k="0">?</button> 2)(x <button class="tog" type="button" data-c="${i}" data-k="1">?</button> 3)</span></div>`).join("")}</div></div>
    <div class="row"><button class="btn" id="see" type="button" disabled>See the pattern</button></div>
    <div class="rules" id="rules"></div>`;
  const picks = CARDS.map(() => [null, null]);
  $$(".lan .tog", booth).forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.c, k = +b.dataset.k;
    picks[i][k] = picks[i][k] === "+" ? "−" : "+"; b.textContent = picks[i][k]; b.classList.add("set");
    if (!REDUCED) gsap.fromTo(b, { rotationX: 180 }, { rotationX: 0, duration: .4, ease: "back.out(2)" });
    const lan = $(`.lan[data-i="${i}"]`, booth), lit = !picks[i].includes(null);
    if (lit && !lan.classList.contains("lit")) { lan.classList.add("lit"); if (!REDUCED) gsap.fromTo($(".body", lan), { scale: .92 }, { scale: 1, duration: .6, ease: "elastic.out(1,.4)" }); }
    if (lit) api.note(`${t(CARDS[i].b, CARDS[i].c)} → (x ${picks[i][0]} 2)(x ${picks[i][1]} 3)`);
    $("#see", booth).disabled = picks.some((p) => p.includes(null));
  }));
  $("#see", booth).addEventListener("click", () => {
    const right = picks.map((p, i) => p[0] === CARDS[i].ok[0] && p[1] === CARDS[i].ok[1]);
    const scores = RULES.map((r) => r.pred.map((p, i) => p[0] === picks[i][0] && p[1] === picks[i][1]));
    const best = scores.map((s, k) => [s.filter(Boolean).length, k]).sort((a, b) => b[0] - a[0])[0];
    $("#rules", booth).innerHTML = RULES.map((r, k) => `<div class="rule" data-k="${k}"><span>${r.name}</span><span class="dots">${scores[k].map((on) => `<i class="${on ? "on" : ""}"></i>`).join("")}</span></div>`).join("");
    if (!REDUCED) gsap.from($$(".rule", booth), { y: -30, opacity: 0, rotationX: -60, stagger: .1, duration: .5, ease: "back.out(1.6)" });
    const nR = right.filter(Boolean).length;
    let txt;
    if (best[0] === 4) {
      setTimeout(() => $(`.rule[data-k="${best[1]}"]`, booth).classList.add("match"), REDUCED ? 0 : 900);
      txt = best[1] === 0 ? "<b>All four lanterns follow the real rule.</b> Not a shortcut." : `<b>Every lantern follows “${RULES[best[1]].name}”.</b> ${nR ? `${nR} of the 4 came out right anyway, so one question could easily have marked this student correct.` : "Consistent, so this is a misconception, not a slip."}`;
    } else txt = `<b>No known rule fits all four</b> (closest: ${best[0]} of 4). Guessing signs: doesn't know yet.`;
    api.noticed(txt); api.note(`Pattern: ${nR}/4 right, best rule ${best[0]}/4`, best[0] === 4 && best[1] !== 0 ? "warn" : "good");
    api.learn("SIGNS", .9, best[0] === 4 ? .9 : .35);
  });
  return () => {};
} };

// =================== 10. Mithai Covers ===================
GAMES.mithai = { mount(booth, api) {
  const OPTS = [{ t: "(x − 5)(x + 3)", e: "x² − 2x − 15", k: "flip" }, { t: "(x + 15)(x − 1)", e: "x² + 14x − 15", k: "prod" }, { t: "(x + 5)(x − 3)", e: "x² + 2x − 15", k: "right" }, { t: "(x − 15)(x + 1)", e: "x² − 14x − 15", k: "prod" }];
  const st = { p1: 1, p2: 1 };
  booth.innerHTML = `<p class="ask">Under each cover is an answer for <span class="m">x² + 2x − 15</span>. Before you lift anything, write your guess on the price tag.</p>
    <div class="guess"><span class="tag">(x + ${picker("p1", 1)})(x + ${picker("p2", 1)})</span><button class="btn" id="commit" type="button">That's my guess</button></div>
    <div class="counter">${OPTS.map((o, i) => `<button class="dish" type="button" data-i="${i}" disabled aria-pressed="false"><span class="plate2"><span class="sweets"><i></i><i></i><i></i></span><span class="m">${o.t}</span><span class="exp"></span></span><span class="dome"></span></button>`).join("")}</div>
    <div class="row"><button class="btn alt" id="peek" type="button">▶ Watch someone peek under every cover</button></div>`;
  wirePickers(booth, st, null, -15, 15);
  let pred = null, tl = null;
  const lift = (i, d = 0) => gsap.to($$(".dome", booth)[i], { y: -96, x: -18, rotation: -16, duration: REDUCED ? 0 : .6, delay: d, ease: "back.out(1.6)" });
  $("#commit", booth).addEventListener("click", () => {
    pred = { ...st }; $("#commit", booth).disabled = true; $$("[data-np]", booth).forEach((b) => (b.disabled = true));
    api.note(`Guessed (x ${pm(pred.p1)})(x ${pm(pred.p2)}) before seeing anything`, "good");
    OPTS.forEach((_, i) => lift(i, i * .12)); $$(".dish", booth).forEach((d) => (d.disabled = false));
  });
  $$(".dish", booth).forEach((d) => d.addEventListener("click", () => {
    if (!pred) return;
    $$(".dish", booth).forEach((x) => x.setAttribute("aria-pressed", String(x === d)));
    const o = OPTS[+d.dataset.i];
    const pk = pred.p1 * pred.p2 === -15 && pred.p1 + pred.p2 === 2 ? "right" : pred.p1 * pred.p2 === -15 && pred.p1 + pred.p2 === -2 ? "flip" : pred.p1 * pred.p2 === -15 ? "prod" : "other";
    let t;
    if (pk === "right" && o.k === "right") t = "<b>Guessed it, then picked it.</b> Real factorising.";
    else if (o.k === "right") t = "<b>The guess was off, but the pick is right.</b> They most likely found it by checking under the covers. That's expanding, which is an easier skill than factorising.";
    else if (pk === o.k) t = `<b>The same mistake twice, independently</b> (${o.k === "flip" ? "signs flipped" : "right product, wrong sum"}). Strong evidence.`;
    else t = "<b>Guess and pick disagree, and both are wrong.</b> Doesn't know yet.";
    api.noticed(t); api.note(`Picked ${o.t} (guess was ${pk})`); api.learn("PAIR", .7, o.k === "right" && pk === "right" ? .9 : .6);
  }));
  $("#peek", booth).addEventListener("click", () => {
    tl && tl.kill(); const dishes = $$(".dish", booth);
    dishes.forEach((d) => ($(".exp", d).innerHTML = ""));
    gsap.set($$(".dome", booth), { y: 0, x: 0, rotation: 0 });
    tl = gsap.timeline();
    OPTS.forEach((o, i) => {
      if (i > 2) return;
      tl.call(() => lift(i)).to({}, { duration: .5 })
        .call(() => ($(".exp", dishes[i]).innerHTML = o.k === "right" ? `= ${o.e} ✓` : `<s>= ${o.e}</s>`)).to({}, { duration: .6 });
    });
    tl.call(() => { api.noticed("That's peeking: expand under each cover until one matches. The tick lands on the right answer, and no factorising happened."); api.note("Demo: someone peeked under the covers"); });
  });
  return () => tl && tl.kill();
} };

// =================== 11. Jalebi Belt ===================
GAMES.jalebi = { mount(booth, api) {
  const CARDS = [
    { q: "x² − 9", o: ["(x − 3)(x + 3)", "(x − 3)²", "(x − 9)(x + 1)"] }, { q: "x² − 25", o: ["(x − 5)²", "(x − 5)(x + 5)", "(x − 25)(x + 1)"] },
    { q: "4x² − 1", o: ["(4x − 1)(x + 1)", "(2x − 1)²", "(2x − 1)(2x + 1)"] }, { q: "x² + 16", o: ["(x − 4)(x + 4)", "(x + 4)²", "It can't be factorised"], sw: true },
  ];
  booth.innerHTML = `<p class="ask">Plates roll down the belt fast. Factorise each one, or say it can't be done.</p>
    <div class="belt" id="belt"><div class="strip2"></div><div class="rollers">${"<i></i>".repeat(10)}</div></div>
    <div class="dhol"><svg viewBox="0 0 520 150" id="rh"></svg></div>`;
  const belt = $("#belt", booth), rh = $("#rh", booth), times = [], picks = [];
  let i = 0, shown = 0, beltT;
  if (!REDUCED) beltT = gsap.timeline({ repeat: -1 }).to($(".strip2", booth), { backgroundPositionX: "-48px", duration: .5, ease: "none" }).to($$(".rollers i", booth), { rotation: 360, duration: .5, ease: "none" }, 0);
  function drum() {
    const max = Math.max(4, ...times) * 1.15;
    rh.innerHTML = `<text x="20" y="16" font-size="12" fill="#8f84b8" font-family="Mukta,sans-serif">seconds per plate</text><line x1="20" y1="118" x2="510" y2="118" stroke="#3d3170"/>` + CARDS.map((c, k) => {
      const x = 80 + k * 120, h = times[k] ? (times[k] / max) * 90 : 0, col = c.sw ? "#ec3f8c" : "#ffb21e";
      return `<rect x="${x - 24}" y="${118 - h}" width="48" height="${h}" rx="8" fill="${col}" class="rb" data-k="${k}"/><ellipse cx="${x}" cy="${118 - h}" rx="24" ry="6" fill="#fff1d6" opacity="${times[k] ? .8 : 0}"/>
        <text x="${x}" y="138" text-anchor="middle" font-size="12" fill="#c8bde8" font-family="IBM Plex Mono,monospace">${c.q}</text>${times[k] ? `<text x="${x}" y="${110 - h}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff1d6" font-family="Mukta,sans-serif">${times[k].toFixed(1)}s</text>` : ""}`;
    }).join("");
    const last = $(`.rb[data-k="${times.length - 1}"]`, rh);
    if (last && !REDUCED) gsap.from(last, { attr: { height: 0, y: 118 }, duration: .7, ease: "elastic.out(1,.5)" });
  }
  function next() {
    if (i >= CARDS.length) return finish();
    const c = CARDS[i], el = html(`<div class="plate3"><span style="font:700 .75rem var(--body);color:#a5865f">PLATE ${i + 1}</span><span class="m q">${c.q}</span><div class="opts">${c.o.map((o, k) => `<button type="button" data-k="${k}">${o}</button>`).join("")}</div></div>`);
    belt.appendChild(el);
    gsap.fromTo(el, { x: 640 }, { x: 0, duration: REDUCED ? 0 : .6, ease: "power3.out", onComplete: () => (shown = performance.now()) });
    shown = performance.now() + 600;
    $$(".opts button", el).forEach((b) => b.addEventListener("click", () => {
      const t = Math.max(.3, (performance.now() - shown) / 1000); times.push(t); picks.push(+b.dataset.k);
      $$(".opts button", el).forEach((x) => (x.disabled = true));
      api.note(`${c.q} → ${c.o[+b.dataset.k]} in ${t.toFixed(1)}s`, c.sw ? "warn" : ""); drum();
      gsap.to(el, { x: -680, duration: REDUCED ? 0 : .5, ease: "power2.in", delay: .2, onComplete: () => el.remove() });
      i++; setTimeout(next, REDUCED ? 50 : 520);
    }));
  }
  function finish() {
    beltT && beltT.pause();
    const base = (times[0] + times[1] + times[2]) / 3, ratio = times[3] / base, p = picks[3];
    let t;
    if (p === 0) t = `<b>Autopilot.</b> Carried the difference-of-squares pattern onto a plus sign${ratio < 1.4 ? `, at their usual pace (${ratio.toFixed(1)}×)` : ""}. Treat the first three right answers with care.`;
    else if (p === 1) t = "<b>Noticed something was different</b>, but thinks x² + 16 = (x + 4)². A sum-of-squares belief, not autopilot.";
    else t = ratio >= 1.4 ? `<b>Noticed the switch.</b> Slowed down (${ratio.toFixed(1)}× their usual time) and checked.` : "<b>Spotted the switch instantly.</b>";
    belt.appendChild(html(`<div class="plate3" style="top:70px"><span style="font-family:var(--hand);font-size:1.3rem">Belt's empty!</span></div>`));
    api.noticed(t); api.note(`Switch plate: ${["autopilot", "sum-of-squares belief", "noticed"][p]} (${ratio.toFixed(1)}× usual time)`, "good");
    api.learn("SQUARES", .8, .85);
  }
  drum(); next();
  return () => beltT && beltT.kill();
} };
