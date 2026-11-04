gsap.registerPlugin(Draggable, Flip);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const NS = "http://www.w3.org/2000/svg";
const el = (t, a = {}, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); p && p.appendChild(e); return e; };
const html = (s) => { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const sgn = (n) => (n < 0 ? `−${-n}` : `${n}`);
const pm = (n) => (n < 0 ? `− ${-n}` : `+ ${n}`);
const W = "rgba(244,248,255,.88)", FAINT = "rgba(244,248,255,.22)";
function picker(id, v) { return `<span class="pick"><button type="button" data-np="${id}" data-d="-1" aria-label="less">‹</button><output id="${id}">${sgn(v)}</output><button type="button" data-np="${id}" data-d="1" aria-label="more">›</button></span>`; }
function wirePickers(root, st, onChange, lo = -9, hi = 9) {
  $$("[data-np]", root).forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.np, d = +b.dataset.d; let v = st[id] + d; if (v === 0) v += d;
    st[id] = Math.max(lo, Math.min(hi, v)); $(`#${id}`, root).textContent = sgn(st[id]);
    if (!RM) gsap.fromTo($(`#${id}`, root), { y: -d * 8, opacity: .3 }, { y: 0, opacity: 1, duration: .25 });
    onChange && onChange(id);
  }));
}

// ---------- the building (progress) ----------
const Building = (() => {
  const svg = $("#bld"), rooms = [];
  const SPOTS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [2, 0, 0], [0, 1, 1], [2, 1, 0], [1, 1, 1], [0, 0, 2], [1, 0, 2], [2, 0, 1], [0, 2, 0], [1, 2, 0], [0, 1, 2], [2, 1, 1], [1, 1, 2], [2, 2, 0], [0, 0, 3]];
  const COL = { PAIR: "--amber", SIGNS: "--red", SQUARES: "--sky", CHECK: "--mint", GROUP: "--lilac" };
  const iso = (x, y, z) => [(x - y) * 40, (x + y) * 23 - z * 46];
  function draw(animateLast) {
    svg.innerHTML = `<ellipse cx="0" cy="66" rx="170" ry="42" fill="none" stroke="${FAINT}" stroke-dasharray="3 6"/>`;
    const order = rooms.map((r, i) => ({ ...r, i, s: SPOTS[i % SPOTS.length] })).sort((a, b) => a.s[2] - b.s[2] || (a.s[0] + a.s[1]) - (b.s[0] + b.s[1]));
    for (const r of order) {
      const [x, y, z] = r.s, c = css(COL[r.skill]), p = (dx, dy, dz) => iso(x + dx, y + dy, z + dz).join(",");
      const g = el("g", {}, svg), sure = r.cert >= .55;
      const sk = sure ? { stroke: "#f4f8ff", "stroke-width": 1.5 } : { stroke: "#f4f8ff", "stroke-width": 1, "stroke-dasharray": "3 2.5", opacity: .8 };
      el("polygon", { points: [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)].join(" "), fill: c, "fill-opacity": sure ? .45 : .12, ...sk }, g);
      el("polygon", { points: [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)].join(" "), fill: c, "fill-opacity": sure ? .25 : .07, ...sk }, g);
      el("polygon", { points: [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)].join(" "), fill: c, "fill-opacity": sure ? .14 : .04, ...sk }, g);
      if (animateLast && r.i === rooms.length - 1 && !RM) gsap.from(g, { y: -70, opacity: 0, duration: .9, ease: "bounce.out" });
    }
    $("#rooms").textContent = rooms.length;
  }
  function add(skill, cert) { rooms.push({ skill, cert }); draw(true); }
  draw(false);
  return { add };
})();

// ---------- redline log ----------
const Log = (() => {
  const ol = $("#log"); let items = [];
  function add(where, text, tone = "") {
    items.unshift({ where, text, tone, t: new Date() });
    ol.innerHTML = items.slice(0, 60).map((i) => `<li class="${i.tone}"><small>${i.where} · ${i.t.toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}</small>${i.text}</li>`).join("");
    if (!RM) gsap.from(ol.firstElementChild, { x: 10, opacity: 0, duration: .3 });
  }
  return { add };
})();

// ---------- the drawing set ----------
const SHEETS = [
  { id: "plan", title: "Floor plan", was: "Build the rectangle", now: "Split the wall strips until the room closes; a fit gets real dimension lines.", kept: "First split, order of splits, holes vs spare pieces." },
  { id: "pins", title: "Pin the drawings", was: "Split your chips", now: "Four pushpins on four tracing sheets of the room. Pin all on one, or split if torn.", kept: "The split itself: a 2–2 between two sheets names the exact doubt." },
  { id: "submittal", title: "Submittal review", was: "Swipe the claims", now: "Stamp each submitted claim Approved, Rejected, or Revise & resubmit.", kept: "Mistake families across 8 claims, plus time on each." },
  { id: "plotter", title: "Plotter check", was: "Stop the tape", now: "A pen plotter draws Sam's working term by term. Hit STOP PLOT at the error.", kept: "Which step they stop at, and how fast after the slip appears." },
  { id: "floors", title: "Stack the floors", was: "Assemble the working", now: "A building section. Lift three of six floor slabs into place, ground floor first.", kept: "Which slip slab they pick, the order, and slabs swapped out." },
  { id: "setout", title: "Set out the room", was: "Crack the lock", now: "Two scale rules set a room x + p by x + q. The room resizes live; tries go in the survey log.", kept: "The search path, and the sign slip caught as it happens." },
  { id: "audit", title: "Area audit", was: "Always, sometimes, never", now: "Two architects' formulas for a square room's area, drawn side by side as the room grows.", kept: "Which sizes they checked before deciding." },
  { id: "section", title: "Section cut", was: "X-ray the answer", now: "Cut through the wall: the facade is the answer, the section shows the two moves inside.", kept: "Two slips that cancel, exposed layer by layer." },
  { id: "elev", title: "Four elevations", was: "Sign quadrant", now: "North, east, south and west elevations, one sign case each, checked against the spec.", kept: "The pattern across four cases, matched to known rules." },
  { id: "trace", title: "Sketch, then trace", was: "Predict, then pick", now: "Sketch your answer first. Only then do the tracing overlays clear.", kept: "Sketch vs pick: found it by checking, or by factorising." },
  { id: "schedule", title: "Door schedule", was: "The switch-up", now: "Fill a schedule row by row. Row D is a look-alike; time per row shows as a Gantt bar.", kept: "Autopilot vs noticing the switch." },
  { id: "revisions", title: "Revision table", was: "Typing replay", now: "Every edit becomes a revision, clouded and logged in the revision table.", kept: "Deleted drafts matched to known mistakes, and long pauses." },
  { id: "lots", title: "Every room of area 12", was: "Find them all", now: "Flag every b on the scale rule. Each valid b draws its room; negative b rooms sit inside x².", kept: "Completeness, listing order, missing negatives." },
  { id: "module", title: "Module", was: "See the structure", now: "Block (x + 3) as one module. The difference of squares redraws as an L-shape folding into a rectangle.", kept: "The route chosen, plus 99² − 1 in their head." },
  { id: "inspect", title: "Inspection route", was: "Next best question", now: "The inspector chooses which sheet to check next by what it will reveal, and stops when sure.", kept: "Same choice rule; this is Lotus's side, not a student game." },
  { id: "ifc", title: "Issued for construction", was: "Check what we read", now: "The drafter letters your answer back. Ambiguities get RFI flags before the stamp.", kept: "Typing problems kept apart from maths." },
];
const GAMES = {}, done = new Set();
let cleanup = null, current = null;
function renderIndex() {
  $("#index").innerHTML = SHEETS.map((s, i) => `<li><button type="button" data-id="${s.id}" class="${done.has(s.id) ? "done" : ""}" aria-current="${s.id === current}"><span class="no">A-${String(i + 1).padStart(2, "0")}</span><span>${s.title}</span><span class="dot"></span></button></li>`).join("");
  $$("#index button").forEach((b) => b.addEventListener("click", () => openSheet(b.dataset.id)));
  const cur = $('#index button[aria-current="true"]'), nav = $(".index");
  if (cur && nav) nav.scrollTo({ left: cur.offsetLeft - nav.clientWidth / 2 + cur.clientWidth / 2, behavior: RM ? "auto" : "smooth" });
}
function openSheet(id) {
  const i = SHEETS.findIndex((s) => s.id === id), s = SHEETS[i];
  if (!s || !GAMES[id]) return;
  cleanup && cleanup(); cleanup = null; current = id;
  gsap.killTweensOf($$("#work *"));
  $("#xWas").textContent = s.was; $("#xNow").textContent = s.now; $("#xKept").textContent = s.kept;
  $("#tTitle").textContent = s.title; $("#tNo").textContent = `A-${String(i + 1).padStart(2, "0")}`;
  const work = $("#work"); work.innerHTML = "";
  const api = {
    note: (t, tone) => Log.add(s.title, t, tone),
    learn: (skill, cert) => { Building.add(skill, cert); done.add(id); renderIndex(); },
    noticed(t) { let n = $(".redline.final", work); if (!n) { n = html(`<p class="redline final"></p>`); work.appendChild(n); } n.innerHTML = `<span class="from">Lotus noticed</span>${t}`; if (!RM) gsap.fromTo(n, { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: .4 }); },
  };
  cleanup = GAMES[id].mount(work, api) || null;
  renderIndex();
  if (!RM) gsap.fromTo(".sheet", { opacity: .3 }, { opacity: 1, duration: .35 });
  try { history.replaceState(null, "", `#${id}`); } catch {}
}
