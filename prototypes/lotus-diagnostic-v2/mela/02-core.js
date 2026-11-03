gsap.registerPlugin(Draggable, Flip);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const sgn = (n) => (n < 0 ? `−${-n}` : `${n}`);
const pm = (n) => (n < 0 ? `− ${-n}` : `+ ${n}`);
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
const html = (s) => { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const SKILLS = { PAIR: ["x² + bx + c", "--marigold"], SQUARES: ["Squares", "--rani"], SIGNS: ["Signs", "--saffron"], CHECK: ["Checking", "--peacock"], GROUP: ["Grouping", "--sky-blue"] };

// ---------- number picker shared by several stalls ----------
function picker(id, v, cls = "") { return `<span class="pick ${cls}"><button type="button" data-np="${id}" data-d="-1" aria-label="less">‹</button><output id="${id}">${sgn(v)}</output><button type="button" data-np="${id}" data-d="1" aria-label="more">›</button></span>`; }
function wirePickers(root, st, onChange, lo = -9, hi = 9) {
  $$("[data-np]", root).forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.np, d = +b.dataset.d;
    let v = st[id] + d; if (v === 0) v += d;
    st[id] = Math.max(lo, Math.min(hi, v));
    const o = $(`#${id}`, root); o.textContent = sgn(st[id]);
    if (!REDUCED) gsap.fromTo(o, { y: d * -10, opacity: .2 }, { y: 0, opacity: 1, duration: .3, ease: "back.out(3)" });
    onChange && onChange(id);
  }));
}

// ---------- the rangoli: progress that grows from what Lotus learns ----------
const Rangoli = (() => {
  const layers = [];
  const motif = (skill, s) => ({
    PAIR: `<ellipse cx="0" cy="${-s}" rx="${s * .45}" ry="${s}"/>`,
    SQUARES: `<path d="M0 ${-2.1 * s} L${s * .62} ${-s} L0 0 L${-s * .62} ${-s}Z"/>`,
    SIGNS: `<path d="M0 0 C${s * .8} ${-s * .6} ${s * .45} ${-s * 1.6} 0 ${-s * 2.1} C${-s * .45} ${-s * 1.6} ${-s * .8} ${-s * .6} 0 0Z"/>`,
    CHECK: `<circle cx="0" cy="${-s}" r="${s * .55}"/>`,
    GROUP: `<rect x="${-s * .5}" y="${-s * 1.6}" width="${s}" height="${s}" rx="${s * .2}" transform="rotate(45 0 ${-s * 1.1})"/>`,
  }[skill]);
  function layerSVG(L, k, gap) {
    const r = 20 + k * gap, n = 8 * (1 + Math.round(L.strength * 2)), s = 4 + L.strength * 4;
    const col = css(SKILLS[L.skill][1]);
    const solid = L.cert >= .55;
    const paint = solid ? `fill="${col}" stroke="#130e2a" stroke-width="1"` : `fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="1.6" stroke-dasharray="2 2.5"`;
    let g = `<g class="rl" data-k="${k}">`;
    for (let i = 0; i < n; i++) g += `<g class="mo" transform="rotate(${(360 / n) * i + k * 7}) translate(0 ${-r})"><g ${paint}>${motif(L.skill, s)}</g></g>`;
    return g + "</g>";
  }
  function render(svg, animate) {
    const gap = Math.min(10, 150 / Math.max(1, layers.length));
    svg.innerHTML = `<circle r="172" fill="#1d1540" stroke="#3d3170" stroke-width="2"/>` +
      layers.map((L, k) => layerSVG(L, k, gap)).join("") +
      `<circle r="11" fill="#ffd36b"/><path d="M0 -26 C6 -18 5 -12 0 -9 C-5 -12 -6 -18 0 -26Z" fill="#ff7a1f"/><circle r="5" fill="#ff7a1f"/>`;
    if (animate && !REDUCED && layers.length) {
      const last = $$(".rl", svg).at(-1);
      gsap.from($$(".mo > g", last), { scale: 0, transformOrigin: "50% 100%", duration: .5, stagger: { each: .025 }, ease: "back.out(2.5)" });
    }
  }
  function add(skill, strength = .6, cert = .7) {
    layers.push({ skill, strength, cert });
    render($("#rgMini"), true);
    if (!$("#rgModal").hidden) render($("#rgBig"), true);
    $("#rgLabel").textContent = `Your rangoli · ${layers.length} ring${layers.length > 1 ? "s" : ""}`;
    if (!REDUCED) gsap.fromTo("#rgOpen", { scale: 1.12 }, { scale: 1, duration: .6, ease: "elastic.out(1,.4)" });
  }
  return { add, render, count: () => layers.length };
})();

// ---------- Lotus's notebook ----------
const Note = (() => {
  const list = $("#nbList"), badge = $("#nbCount");
  let items = [];
  function add(where, text, tone = "") {
    items.unshift({ where, text, tone, at: new Date() });
    list.innerHTML = items.map((i) => `<li class="${i.tone}"><small>${i.where} · ${i.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>${i.text}</li>`).join("");
    badge.textContent = items.length;
    if (!REDUCED) gsap.fromTo(badge, { scale: 1.6 }, { scale: 1, duration: .5, ease: "elastic.out(1,.4)" });
  }
  return { add };
})();

// ---------- stalls ----------
const ICON = {
  coin: `<circle cx="40" cy="34" r="26" fill="#d9a441"/><circle cx="40" cy="34" r="20" fill="#ffd36b" stroke="#a8741c" stroke-width="2"/><text x="40" y="42" text-anchor="middle" font-size="22" font-weight="800" fill="#a8741c" font-family="Baloo 2,sans-serif">₹</text>`,
  parrot: `<circle cx="38" cy="30" r="20" fill="#3fbf55"/><path d="M54 24 C68 24 70 38 58 42 C58 34 56 30 54 30Z" fill="#ff3b3b"/><circle cx="44" cy="24" r="5" fill="#fff"/><circle cx="45" cy="24" r="2.6" fill="#130e2a"/><path d="M22 34 C28 44 42 46 50 40" stroke="#ec3f8c" stroke-width="3.5" fill="none"/><rect x="18" y="52" width="44" height="12" rx="3" fill="#8b5a33"/>`,
  rangoli: `<g transform="translate(40 34)">${Array.from({ length: 8 }, (_, i) => `<ellipse cx="0" cy="-15" rx="6" ry="13" fill="${i % 2 ? "#ec3f8c" : "#ffb21e"}" transform="rotate(${i * 45})"/>`).join("")}<circle r="8" fill="#16c2a3"/><circle r="3" fill="#fff1d6"/></g>`,
  bioscope: `<rect x="12" y="14" width="56" height="38" rx="6" fill="#8b5a33"/><circle cx="40" cy="33" r="13" fill="#d9a441"/><circle cx="40" cy="33" r="8" fill="#130e2a"/><circle cx="37" cy="30" r="2.5" fill="#fff" opacity=".7"/><path d="M20 52 L16 66 M60 52 L64 66 M40 52 V66" stroke="#d9a441" stroke-width="3"/><rect x="26" y="6" width="28" height="8" rx="3" fill="#ec3f8c"/>`,
  train: `<rect x="10" y="24" width="38" height="26" rx="4" fill="#ec3f8c"/><rect x="40" y="14" width="22" height="36" rx="4" fill="#ff7a1f"/><rect x="46" y="20" width="10" height="9" rx="2" fill="#fff1d6"/><rect x="16" y="8" width="8" height="16" fill="#3d3170"/><circle cx="20" cy="54" r="7" fill="#130e2a" stroke="#d9a441" stroke-width="2"/><circle cx="52" cy="54" r="7" fill="#130e2a" stroke="#d9a441" stroke-width="2"/><circle cx="12" cy="4" r="4" fill="#c8bde8" opacity=".6"/>`,
  safe: `<rect x="14" y="8" width="52" height="52" rx="6" fill="#2f6b5c"/><rect x="20" y="14" width="40" height="40" rx="4" fill="#245448" stroke="#d9a441" stroke-width="2"/><circle cx="40" cy="34" r="11" fill="#ffd36b" stroke="#a8741c" stroke-width="2"/><path d="M40 25 V30 M49 34 H44" stroke="#a8741c" stroke-width="2.5"/><rect x="20" y="60" width="8" height="5" fill="#130e2a"/><rect x="52" y="60" width="8" height="5" fill="#130e2a"/>`,
  tarazu: `<path d="M40 10 V58" stroke="#d9a441" stroke-width="4"/><path d="M14 18 H66" stroke="#d9a441" stroke-width="4" stroke-linecap="round"/><path d="M14 18 L6 40 H22Z M66 18 L58 40 H74Z" fill="none" stroke="#c8bde8" stroke-width="1.5"/><path d="M4 40 Q14 50 24 40Z M56 40 Q66 50 76 40Z" fill="#ffb21e"/><rect x="28" y="58" width="24" height="6" rx="2" fill="#8b5a33"/>`,
  jadoo: `<rect x="22" y="12" width="36" height="30" rx="3" fill="#130e2a" stroke="#c8bde8" stroke-width="1.5"/><rect x="22" y="34" width="36" height="6" fill="#ec3f8c"/><rect x="12" y="42" width="56" height="7" rx="3" fill="#130e2a" stroke="#c8bde8" stroke-width="1.5"/><path d="M58 58 L74 44" stroke="#fff1d6" stroke-width="4" stroke-linecap="round"/><path d="M71 40 l3 -5 l3 5 l5 -2 l-3 5 l3 4 l-5 0 l-3 5 l-1 -6 z" fill="#ffd36b"/>`,
  lantern: `<line x1="40" y1="0" x2="40" y2="10" stroke="#c8bde8" stroke-width="1.5"/><path d="M28 10 H52 L56 16 H24Z" fill="#d9a441"/><ellipse cx="40" cy="36" rx="18" ry="20" fill="#ff7a1f"/><ellipse cx="40" cy="36" rx="9" ry="18" fill="#ffd36b" opacity=".8"/><path d="M28 56 H52 L48 62 H32Z" fill="#d9a441"/><path d="M36 62 V70 M40 62 V72 M44 62 V70" stroke="#ec3f8c" stroke-width="2"/>`,
  cloche: `<ellipse cx="40" cy="56" rx="32" ry="7" fill="#d9a441"/><path d="M14 54 C14 30 66 30 66 54Z" fill="#c8cfe0"/><path d="M22 46 C24 38 34 34 40 34" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/><circle cx="40" cy="30" r="4" fill="#c8cfe0"/>`,
  jalebi: `<g fill="none" stroke="#ffb21e" stroke-width="5" stroke-linecap="round"><path d="M40 34 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16"/></g><ellipse cx="40" cy="62" rx="30" ry="5" fill="#16c2a3" opacity=".6"/>`,
  typewriter: `<rect x="22" y="4" width="36" height="22" fill="#fff1d6"/><path d="M26 10 H54 M26 15 H48 M26 20 H52" stroke="#8f84b8" stroke-width="1.5"/><rect x="10" y="24" width="60" height="12" rx="4" fill="#3d3170"/><path d="M8 36 H72 L66 62 H14Z" fill="#2f6b5c"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="${20 + i * 6}" cy="${46 + (i % 2) * 6}" r="2.6" fill="#fff1d6"/>`).join("")}`,
  balloon: `<path d="M24 46 Q22 58 30 66 M42 40 Q44 56 38 68 M58 46 Q60 58 52 66" stroke="#c8bde8" stroke-width="1.2" fill="none"/><ellipse cx="24" cy="30" rx="12" ry="15" fill="#ec3f8c"/><ellipse cx="42" cy="24" rx="13" ry="16" fill="#ffb21e"/><ellipse cx="58" cy="30" rx="12" ry="15" fill="#16c2a3"/><ellipse cx="38" cy="18" rx="3" ry="5" fill="#fff" opacity=".5"/>`,
  tiffin: `<rect x="22" y="14" width="36" height="14" rx="3" fill="#c8cfe0"/><rect x="22" y="30" width="36" height="14" rx="3" fill="#b4bdd2"/><rect x="22" y="46" width="36" height="14" rx="3" fill="#c8cfe0"/><path d="M18 10 V50 M62 10 V50" stroke="#8f84b8" stroke-width="3"/><path d="M18 10 Q40 -6 62 10" stroke="#8f84b8" stroke-width="3" fill="none"/><text x="40" y="41" text-anchor="middle" font-size="11" font-weight="800" fill="#ec3f8c" font-family="Baloo 2,sans-serif">A</text>`,
  map: `<path d="M10 14 L30 8 L50 14 L70 8 V58 L50 64 L30 58 L10 64Z" fill="#fff1d6"/><path d="M30 8 V58 M50 14 V64" stroke="#c9a46a" stroke-width="1.5"/><path d="M18 50 C28 30 42 46 58 24" stroke="#ec3f8c" stroke-width="2.5" stroke-dasharray="3 3" fill="none"/><circle cx="58" cy="22" r="5" fill="#16c2a3"/>`,
  daak: `<rect x="22" y="14" width="36" height="50" rx="16" fill="#e0262b"/><rect x="28" y="28" width="24" height="5" rx="2" fill="#130e2a"/><rect x="30" y="40" width="20" height="12" rx="2" fill="#ffd36b"/><rect x="34" y="62" width="12" height="6" fill="#8b5a33"/><path d="M26 18 Q40 6 54 18" fill="#b81c21"/>`,
};
const STALLS = [
  { id: "sikka", name: "Sikka Toss", hi: "सिक्का", tag: "Four coins, four brass thalis. Toss them where you think the answer is.", a: "#ffb21e", b: "#ec3f8c", icon: "coin", pitch: "Toss four coins. Split them if you're torn." },
  { id: "tota", name: "Mithu's Cards", hi: "तोता", tag: "Mithu picks a fortune card. Is it true, false, or are you not sure?", a: "#3fbf55", b: "#ffb21e", icon: "parrot", pitch: "Let me pick you some fortune cards!" },
  { id: "rangoli", name: "Rangoli Floor", hi: "रंगोली", tag: "Lay the tiles into one perfect rectangle. The edges tell you the factors.", a: "#ec3f8c", b: "#16c2a3", icon: "rangoli", pitch: "Lay tiles into a rectangle. When it fits, the diyas light." },
  { id: "bioscope", name: "Bioscope", hi: "बाइस्कोप", tag: "Sam's working plays like an old film. Shout ROKO the moment it goes wrong.", a: "#ff7a1f", b: "#3d3170", icon: "bioscope", pitch: "An old film! Stop it the moment something goes wrong." },
  { id: "rail", name: "Toy Train", hi: "रेलगाड़ी", tag: "Couple the right coaches, in order, and wave the green flag.", a: "#16c2a3", b: "#ffb21e", icon: "train", pitch: "Couple the coaches in the right order." },
  { id: "tijori", name: "Tijori", hi: "तिजोरी", tag: "Two brass dials. Find the numbers that open the safe.", a: "#2f6b5c", b: "#d9a441", icon: "safe", pitch: "Crack the safe. I'll watch how you hunt." },
  { id: "tarazu", name: "Tarazu", hi: "तराज़ू", tag: "Weigh both sides for different x. Always, sometimes, or never equal?", a: "#d9a441", b: "#8b5a33", icon: "tarazu", pitch: "Balance the tarazu. Is it always equal?" },
  { id: "jadoo", name: "Jadoo Show", hi: "जादू", tag: "Perform a factorising trick, then reveal how it really worked.", a: "#ec3f8c", b: "#130e2a", icon: "jadoo", pitch: "A magic trick, then the reveal." },
  { id: "lantern", name: "Lantern Lane", hi: "लालटेन", tag: "Light four lanterns by choosing their signs.", a: "#ff7a1f", b: "#ffb21e", icon: "lantern", pitch: "Light the lanterns. Four sign puzzles." },
  { id: "mithai", name: "Mithai Covers", hi: "ढक्कन", tag: "Guess what's under the covers before you lift them.", a: "#63b6ff", b: "#fff1d6", icon: "cloche", pitch: "Guess before you lift the covers." },
  { id: "jalebi", name: "Jalebi Belt", hi: "जलेबी", tag: "Quick plates roll past on the belt. Keep up, and watch out.", a: "#ffb21e", b: "#ff7a1f", icon: "jalebi", pitch: "Fast plates! Don't get fooled." },
  { id: "chitthi", name: "Chitthi Wala", hi: "चिट्ठी", tag: "Type your answer. The letter writer replays every keystroke.", a: "#2f6b5c", b: "#fff1d6", icon: "typewriter", pitch: "Type to the letter writer." },
  { id: "gubbara", name: "Gubbara Wall", hi: "गुब्बारा", tag: "Tag every balloon that works. Find all of them.", a: "#ec3f8c", b: "#63b6ff", icon: "balloon", pitch: "Tag every balloon that works!" },
  { id: "tiffin", name: "Tiffin Trick", hi: "डिब्बा", tag: "Pack a bracket into a tiffin and see what happens.", a: "#8f84b8", b: "#c8cfe0", icon: "tiffin", pitch: "Pack a bracket into a tiffin." },
  { id: "naksha", name: "Mithu's Map", hi: "नक्शा", tag: "Watch me choose which stall tells Lotus the most about a student.", a: "#fff1d6", b: "#ec3f8c", icon: "map", pitch: "See how I choose the next stall." },
  { id: "daak", name: "Daakghar", hi: "डाकघर", tag: "Write your answer on a postcard. The postmaster reads it back before stamping.", a: "#e0262b", b: "#ffb21e", icon: "daak", pitch: "Post your answer on a postcard." },
];
const GAMES = {};
const visited = new Set();
const SUGGEST = ["tijori", "sikka", "bioscope", "tota", "rangoli", "tarazu", "jadoo", "lantern", "gubbara", "mithai", "rail", "jalebi", "tiffin", "chitthi", "daak", "naksha"];
const iconSVG = (k, cls = "icon") => `<svg class="${cls}" viewBox="0 0 80 70" aria-hidden="true">${ICON[k]}</svg>`;

function renderMap() {
  const g = $("#grounds");
  g.innerHTML = STALLS.map((s, i) => `<button class="stall ${visited.has(s.id) ? "visited" : ""}" type="button" data-id="${s.id}" style="--a:${s.a};--b:${s.b}">
      <span class="awning"><span class="bulbs">${"<i></i>".repeat(9)}</span></span>
      <span class="no">${String(i + 1).padStart(2, "0")}</span>
      <svg class="done" viewBox="0 0 28 28" aria-hidden="true">${Array.from({ length: 8 }, (_, k) => `<circle cx="${14 + Math.cos(k * Math.PI / 4) * 9}" cy="${14 + Math.sin(k * Math.PI / 4) * 9}" r="4" fill="${k % 2 ? "#ffb21e" : "#ff7a1f"}"/>`).join("")}<circle cx="14" cy="14" r="4" fill="#ec3f8c"/></svg>
      <span class="inner">${iconSVG(s.icon)}</span>
      <span class="sign"><b>${s.name}</b><small>${s.hi}</small></span>
    </button>`).join("");
  $$(".stall", g).forEach((b) => b.addEventListener("click", () => openStall(b.dataset.id)));
  suggest();
}
function suggest() {
  const next = SUGGEST.find((id) => !visited.has(id) && GAMES[id]);
  $$(".stall").forEach((b) => b.classList.toggle("suggested", b.dataset.id === next));
  const s = STALLS.find((x) => x.id === next);
  $("#mithuSays").innerHTML = s ? `${visited.size ? "Shabash! " : "Namaste! I'm Mithu. "}Try <b>${s.name}</b> next. ${s.pitch}<br><button type="button" id="mithuGo">Take me there</button>` : "You've played every stall! Open your rangoli to see it all.<br><button type=\"button\" id=\"mithuGo\">Show my rangoli</button>";
  $("#mithuGo").onclick = () => (s ? openStall(s.id) : openRangoli());
}

let cleanup = null, current = null;
function openStall(id) {
  const s = STALLS.find((x) => x.id === id), game = GAMES[id];
  if (!s || !game) return;
  cleanup && cleanup(); cleanup = null; current = id;
  const scene = $("#scene");
  scene.style.setProperty("--a", s.a); scene.style.setProperty("--b", s.b);
  $("#boothhead").innerHTML = `<div class="awning"><span class="bulbs">${"<i></i>".repeat(16)}</span></div>
    <div class="boothtitle">${iconSVG(s.icon)}<div><h2>${s.name} <span style="font-size:.55em;color:var(--soft);font-weight:600">${s.hi}</span></h2><p>${s.tag}</p></div><button class="back" type="button" id="backBtn">← Back to the fair</button></div>`;
  $("#backBtn").onclick = closeStall;
  const booth = $("#booth"); booth.innerHTML = "";
  $("#map").hidden = true; scene.hidden = false;
  window.scrollTo({ top: 0, behavior: "auto" });
  if (!REDUCED) gsap.fromTo(scene, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .55, ease: "power3.out", clearProps: "transform" });
  const api = {
    note: (t, tone) => Note.add(s.name, t, tone),
    learn: (skill, strength, cert) => { Rangoli.add(skill, strength, cert); visited.add(id); },
    noticed(text) {
      let n = $(".noticed", booth);
      if (!n) { n = document.createElement("div"); n.className = "noticed"; booth.appendChild(n); }
      n.innerHTML = `<span class="from">Lotus noticed</span>${text}`;
      if (!REDUCED) gsap.fromTo(n, { y: 24, opacity: 0, rotation: -5 }, { y: 0, opacity: 1, rotation: -.6, duration: .6, ease: "back.out(2)" });
    },
  };
  cleanup = game.mount(booth, api) || null;
  try { history.replaceState(null, "", `#${id}`); } catch {}
}
function closeStall() {
  cleanup && cleanup(); cleanup = null; current = null;
  gsap.killTweensOf($$("#booth *"));
  $("#scene").hidden = true; $("#map").hidden = false;
  renderMap();
  window.scrollTo({ top: 0, behavior: "auto" });
  if (!REDUCED) gsap.from(".stall", { opacity: 0, y: 20, stagger: .03, duration: .4, ease: "power2.out", clearProps: "opacity,transform" });
  try { history.replaceState(null, "", location.pathname); } catch {}
}
function openRangoli() {
  const m = $("#rgModal"); m.hidden = false;
  Rangoli.render($("#rgBig"), false);
  if (!REDUCED) gsap.from($$("#rgBig .mo > g"), { scale: 0, transformOrigin: "50% 100%", stagger: .004, duration: .4, ease: "back.out(2)" });
  $("#rgText").textContent = Rangoli.count()
    ? `${Rangoli.count()} ring${Rangoli.count() > 1 ? "s" : ""} so far. Colour shows the skill, solid shapes a sure answer, dotted ones a guess, and more petals mean Lotus learned more. Right and wrong look exactly the same.`
    : "Empty for now. Every stall you play adds a ring.";
}

// ---------- ambience ----------
(function ambience() {
  const st = $("#stars");
  st.innerHTML = Array.from({ length: 90 }, () => `<i style="left:${Math.random() * 100}%;top:${Math.random() * 70}%;animation-delay:${(Math.random() * 3).toFixed(2)}s;opacity:${(.2 + Math.random() * .6).toFixed(2)}"></i>`).join("");
  if (!REDUCED) for (let i = 0; i < 7; i++) {
    const k = document.createElement("i"); k.className = "kandil";
    k.style.left = `${5 + Math.random() * 90}%`; k.style.animationDuration = `${22 + Math.random() * 18}s`; k.style.animationDelay = `-${Math.random() * 30}s`;
    k.style.transform = `scale(${.6 + Math.random() * .6})`;
    document.body.appendChild(k);
  }
  const L = $("#lights"), cols = ["#ffb21e", "#ec3f8c", "#16c2a3", "#ff7a1f", "#63b6ff"];
  let s = "";
  for (const [y0, sag] of [[6, 40], [2, 58]]) {
    s += `<path d="M0 ${y0} Q600 ${y0 + sag * 2} 1200 ${y0}" stroke="#3d3170" stroke-width="1.5" fill="none"/>`;
    for (let i = 1; i < 30; i++) {
      const t = i / 30, x = 1200 * t, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0;
      s += `<circle cx="${x}" cy="${y + 5}" r="4" fill="${cols[(i + y0) % 5]}" class="lb" style="filter:drop-shadow(0 0 5px ${cols[(i + y0) % 5]})"/>`;
    }
  }
  L.innerHTML = s;
  if (!REDUCED) gsap.to($$(".lb", L), { opacity: .35, duration: 1.2, repeat: -1, yoyo: true, ease: "sine.inOut", delay: (i) => (i % 9) * .17 });
})();

$("#home").onclick = () => { if (current) closeStall(); };
$("#rgOpen").onclick = openRangoli;
$("#rgClose").onclick = () => ($("#rgModal").hidden = true);
$("#rgModal").addEventListener("click", (e) => { if (e.target.id === "rgModal") $("#rgModal").hidden = true; });
$("#nbOpen").onclick = () => $("#drawer").classList.add("open");
$("#nbClose").onclick = () => $("#drawer").classList.remove("open");
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#rgModal").hidden = true; $("#drawer").classList.remove("open"); } });
