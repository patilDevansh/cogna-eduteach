// ============================================================
// Shared across every theme: helpers, the app shell, the evidence
// readers (what an answer means), and generic game widgets that a
// theme skins with its own words, art and CSS. The diagnosis is the
// same in every theme; only the world around it changes.
// ============================================================
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
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function picker(id, v) { return `<span class="pick"><button type="button" data-np="${id}" data-d="-1" aria-label="less">‹</button><output id="${id}">${sgn(v)}</output><button type="button" data-np="${id}" data-d="1" aria-label="more">›</button></span>`; }
function wirePickers(root, st, onChange, lo = -9, hi = 9) {
  $$("[data-np]", root).forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.np, d = +b.dataset.d; let v = st[id] + d; if (v === 0) v += d;
    st[id] = Math.max(lo, Math.min(hi, v)); $(`#${id}`, root).textContent = sgn(st[id]);
    if (!RM) gsap.fromTo($(`#${id}`, root), { y: -d * 8, opacity: .3 }, { y: 0, opacity: 1, duration: .25 });
    onChange && onChange(id);
  }));
}

// ---------- notes + app shell ----------
const Notes = (() => {
  let items = [];
  function add(where, text, tone = "") {
    items.unshift({ where, text, tone, t: new Date() });
    const ol = $("#log"); if (!ol) return;
    ol.innerHTML = items.slice(0, 60).map((i) => `<li class="${i.tone}"><small>${esc(i.where)} · ${i.t.toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}</small>${i.text}</li>`).join("");
    if (!RM) gsap.from(ol.firstElementChild, { x: 10, opacity: 0, duration: .3 });
  }
  return { add };
})();
const App = (() => {
  let SHEETS = [], GAMES = {}, Progress = null, cleanup = null, current = null, opts = {};
  const done = new Set();
  function renderIndex() {
    $("#index").innerHTML = SHEETS.map((s, i) => `<li><button type="button" data-id="${s.id}" class="${done.has(s.id) ? "done" : ""}" aria-current="${s.id === current}"><span class="no">${String(i + 1).padStart(2, "0")}</span><span>${s.title}</span><span class="dot"></span></button></li>`).join("");
    $$("#index button").forEach((b) => b.addEventListener("click", () => open(b.dataset.id)));
    const cur = $('#index button[aria-current="true"]'), nav = $(".index");
    if (cur && nav) nav.scrollTo({ left: cur.offsetLeft - nav.clientWidth / 2 + cur.clientWidth / 2, behavior: RM ? "auto" : "smooth" });
  }
  function open(id) {
    const i = SHEETS.findIndex((s) => s.id === id), s = SHEETS[i];
    if (!s || !GAMES[id]) return;
    cleanup && cleanup(); cleanup = null; current = id;
    gsap.killTweensOf($$("#work *"));
    $("#xWas").textContent = s.was; $("#xNow").textContent = s.now; $("#xKept").textContent = s.kept;
    $("#tTitle").textContent = s.title; $("#tNo").textContent = (opts.prefix || "") + String(i + 1).padStart(2, "0");
    // A fresh container per sheet: any timer left over from the previous game touches only the detached old one.
    const prev = $("#work"), work = prev.cloneNode(false); prev.replaceWith(work);
    const api = {
      note: (t, tone) => Notes.add(s.title, t, tone),
      learn: (skill, cert) => { Progress.add(skill, cert); done.add(id); renderIndex(); },
      noticed(t) { let n = $(".notice.final", work); if (!n) { n = html(`<div class="notice final"></div>`); work.appendChild(n); } n.innerHTML = `<span class="from">${opts.noticedLabel || "Lotus noticed"}</span>${t}`; if (!RM) gsap.fromTo(n, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .4 }); },
    };
    cleanup = GAMES[id](work, api) || null;
    renderIndex();
    if (!RM) gsap.fromTo(".sheet", { opacity: .4 }, { opacity: 1, duration: .35 });
    try { history.replaceState(null, "", `#${id}`); } catch {}
  }
  function init(sheets, games, progress, o = {}) { SHEETS = sheets; GAMES = games; Progress = progress; opts = o; const h = (location.hash || "").slice(1); open(GAMES[h] ? h : SHEETS[0].id); }
  return { init, open };
})();

// ---------- the evidence readers (identical in every theme) ----------
const E = {};
E.PAIR_OPTS = [{ t: "(x − 3)(x − 1)", p: -3, q: -1, k: "ps", name: "product and sum swapped" }, { t: "(x − 1)(x + 4)", p: -1, q: 4, k: "right", name: "the right one" }, { t: "(x − 2)(x + 2)", p: -2, q: 2, k: "po", name: "right product, wrong sum" }, { t: "(x − 4)(x + 1)", p: -4, q: 1, k: "sw", name: "right numbers, signs flipped" }];
E.pairsRead = (counts, noun = "tokens") => {
  const PAIRS = { "right|sw": "the signs inside the brackets", "po|right": "whether the numbers must also add to 3", "ps|right": "which number is the product and which the sum", "po|sw": "both the sum and the signs", "ps|sw": "the product–sum rule itself", "po|ps": "the product–sum rule itself" };
  const O = E.PAIR_OPTS, order = counts.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), [[n1, i1], [, i2]] = order, shape = order.map(([v]) => v).filter(Boolean).join("–");
  let text;
  if (n1 === 4) text = O[i1].k === "right" ? `<b>All four ${noun} on the right answer.</b> Confident and correct.` : `<b>All four ${noun} on “${O[i1].name}”.</b> Confident, so this is a misconception and not a guess.`;
  else if (shape === "2–2") text = `<b>Split 2–2.</b> The two answers differ only in <b>${PAIRS[[O[i1].k, O[i2].k].sort().join("|")]}</b>. That's exactly where the doubt is.`;
  else if (shape === "3–1") text = `<b>Mostly “${O[i1].name}”</b>, with a doubt about “${O[i2].name}”.`;
  else if (shape === "1–1–1–1") text = "<b>Spread evenly.</b> Doesn't know yet, which is not a misconception.";
  else text = `<b>Leans “${O[i1].name}”</b>, but unsure.`;
  return { text, shape, cert: shape === "4" ? .95 : shape === "3–1" ? .7 : shape === "2–2" ? .55 : .2 };
};
E.CLAIMS = [{ c: "x² − 9 = (x − 3)(x + 3)", truth: true }, { c: "(x + 5)² = x² + 25", truth: false }, { c: "x² + 2x − 8 = (x − 4)(x + 2)", truth: false }, { c: "(x + 2)² = x² + 4x + 4", truth: true }, { c: "x² + 9 = (x + 3)(x + 3)", truth: false }, { c: "x² − 2x − 8 = (x − 4)(x + 2)", truth: true }, { c: "(x − 4)² = x² − 16", truth: false }, { c: "x² − 6x + 9 = (x − 3)²", truth: true }];
E.FAMS = { SPREAD: { name: "Squares a bracket term by term: (a + b)² = a² + b²", idx: [1, 3, 6], skill: "SQUARES" }, SIGN: { name: "Flips the signs into the brackets", idx: [2, 5], skill: "SIGNS" }, SUMSQ: { name: "Thinks x² + 9 factorises", idx: [4], skill: "SQUARES" }, DS: { name: "Control claims", idx: [0, 7], skill: "SQUARES" } };
E.claimsRead = (answers, times) => {
  const med = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
  const rows = Object.entries(E.FAMS).map(([key, f]) => {
    const hits = f.idx.map((k) => answers[k] === null ? "uns" : answers[k] === E.CLAIMS[k].truth ? "ok" : "hit"), nh = hits.filter((h) => h === "hit").length, n = f.idx.length;
    const verdict = key === "DS" ? (nh ? "Missed a control, so read the rest with care." : "Both controls right, so the rest isn't random.") : nh === n && n >= 2 ? `Consistent: all ${n} match this mistake.` : nh === n ? "One points to this. Worth a second look." : nh ? `Matches ${nh} of ${n}. Could be a slip.` : hits.includes("uns") ? "Marked unsure: doesn't know yet." : "No sign of it.";
    return { name: f.name, hits, verdict, skill: f.skill, cert: hits.includes("uns") ? .25 : .75 };
  });
  const slow = times.map((t, k) => [t, k]).filter(([t]) => t > med * 1.8).map(([, k]) => `number ${k + 1}`);
  return { rows, slowText: slow.length ? `Took much longer on ${slow.join(", ")}.` : "Steady pace throughout." };
};
E.rectRead = (tries, fit) => {
  const ordered = tries.every((t, k) => !k || Math.abs(t - tries[k - 1]) === 1);
  const text = fit ? (tries.length === 1 ? "<b>Fitted on the first try.</b> Fluent with product and sum." : `<b>Fitted in ${tries.length} tries</b>, ${ordered ? "stepping one at a time: a systematic search" : "jumping around: the corner isn't linked to the 6 yet"}.`) : "<b>Settled on a shape that doesn't close.</b> The corner and the 6 aren't linked yet.";
  return { text, cert: tries.length <= 1 ? .95 : ordered ? .75 : .4 };
};
E.TAPE = [{ label: "A", text: "x × x", term: "x²" }, { label: "B", text: "x × (+2)", term: "+ 2x" }, { label: "C", text: "(−3) × x", term: "− 3x" }, { label: "D", text: "(−3) × (+2)", term: "+ 6" }, { label: "E", text: "collect like terms", term: "− x" }, { label: "F", text: "Sam's answer", term: "x² − x + 6" }];
E.stopRead = (label, late, text) => {
  if (label === "D") return { text: `<b>Stopped at step D</b>, ${Math.max(0, late).toFixed(1)}s after −3 × +2 became +6. ${late < 1.2 ? "Fast: fluent." : "Got there, after a moment."}`, cert: .8, good: true };
  if (label === "E" || label === "F") return { text: label === "E" && late < 2.8 ? `<b>Probably meant step D</b>, a little late (${late.toFixed(1)}s).` : `<b>Stopped at step ${label}</b> (${text}), not at D. Missed the sign error.`, cert: .55 };
  return { text: `<b>False alarm at step ${label}</b> (${text}). That step looks wrong to them, which is a gap of its own.`, cert: .6 };
};
E.STEPS = [{ id: "L1", t: "(6xy − 4y) − (9x − 6)", ok: 0 }, { id: "D1", t: "(6xy − 4y) − (9x + 6)", bad: "kept the + inside after taking out −" }, { id: "L2", t: "2y(3x − 2) − 3(3x − 2)", ok: 1 }, { id: "D2", t: "2y(3x − 2) − 3(3x + 2)", bad: "didn't flip the sign when taking out −3" }, { id: "L3", t: "(3x − 2)(2y − 3)", ok: 2 }, { id: "D3", t: "(3x − 2)(2y + 3)", bad: "lost the minus in the last bracket" }];
E.parsonsRead = (ids, ever) => {
  const ch = ids.map((id) => E.STEPS.find((x) => x.id === id)), slips = ch.filter((c) => c.bad), set = ch.every((c) => c.ok !== undefined), ord = set && ch.every((c, k) => c.ok === k);
  const fixed = [...ever].filter((id) => id.startsWith("D") && !ids.includes(id));
  let text = ord ? "<b>All three steps right, in order.</b> As strong as typed working." : set ? "<b>Right steps, wrong order.</b> Knows the moves, not the shape of the method." : `<b>${slips.length} step${slips.length > 1 ? "s" : ""} with a slip:</b> ${slips.map((s) => s.bad).join("; ")}.`;
  if (fixed.length) text += ` They also swapped out ${fixed.length} slip${fixed.length > 1 ? "s" : ""} before finishing, so they caught their own slip.`;
  return { text, cert: ord ? .9 : .7, slips: slips.length };
};
E.LOCK = { TP: -12, TS: -1, expr: "x² − x − 12" };
E.lockTry = (p, q) => { const pOK = p * q === E.LOCK.TP, slip = pOK && p + q === -E.LOCK.TS; return { pOK, slip, solved: pOK && p + q === E.LOCK.TS }; };
E.lockFinal = (tries) => {
  const on = tries.filter((t) => t.p * t.q === E.LOCK.TP).length, slip = tries.some((t) => t.p * t.q === E.LOCK.TP && t.p + t.q === -E.LOCK.TS);
  const style = tries.length <= 2 ? "Straight there: fluent." : on / tries.length >= .5 ? `${on} of ${tries.length} tries had the right product: a systematic search.` : `Only ${on} of ${tries.length} tries had the right product: trial and error.`;
  return { text: `<b>Solved: (x − 4)(x + 3).</b> ${style}${slip ? " On the way they hit 4 and −3 (the classic sign slip) and fixed it themselves." : ""}`, cert: tries.length <= 2 ? .95 : .7, slip };
};
E.auditRead = (pick, tested) => {
  const n = tested.size, sawNe = [...tested.values()].includes(false);
  if (pick === "always" && !sawNe) return { text: `<b>Checked only ${n === 1 ? "x = 0" : "values that happened to match"} and said always.</b> Checks one easy case and stops.`, cert: .8 };
  if (pick === "always") return { text: "<b>Saw them differ and still said always.</b> Believes (a + b)² = a² + b² firmly enough to overrule the evidence.", cert: .95 };
  if (pick === "never") return { text: tested.get(0) ? "<b>Saw them match at x = 0 but said never.</b> Doesn't count one case as “sometimes”." : "<b>Said never without checking x = 0.</b>", cert: .8 };
  return { text: `<b>Sometimes, after checking ${n} value${n > 1 ? "s" : ""}.</b> ${n >= 3 && sawNe ? "Tested like a mathematician." : "Right, but checked very little."}`, cert: .8 };
};
E.xrayRead = (st) => {
  const b1 = (st.s1 === "−" ? -1 : 1) * Math.abs(st.n1), b2 = (st.s2 === "−" ? -1 : 1) * Math.abs(st.n2);
  const nR = st.n1 * st.n2 === -6 && st.n1 + st.n2 === -1, nS = st.n1 * st.n2 === -6 && st.n1 + st.n2 === 1, car = b1 === st.n1 && b2 === st.n2, fl = b1 === -st.n1 && b2 === -st.n2, fin = b1 * b2 === -6 && b1 + b2 === -1;
  const layers = [
    { lab: "What everyone sees: the answer", t: `(x ${pm(b1)})(x ${pm(b2)})`, v: fin ? "✓ expands to x² − x − 6" : "✗ doesn't expand to x² − x − 6", ok: fin },
    { lab: "Move 2: into the brackets", t: car ? "signs carried straight in" : fl ? "both signs flipped on the way in" : "one carried, one flipped", v: car ? "✓ the taught method" : "✗ the signs changed on the way", ok: car },
    { lab: "Move 1: the numbers", t: `${sgn(st.n1)} and ${sgn(st.n2)}`, v: nR ? "✓ multiply to −6, add to −1" : nS ? "✗ add to +1, not −1: a sign slip" : `✗ multiply to ${sgn(st.n1 * st.n2)}, add to ${sgn(st.n1 + st.n2)}`, ok: nR },
  ];
  const text = nR && car ? "<b>Sound all the way through.</b>" : nS && fl ? "<b>Two wrongs make a right.</b> The numbers had the wrong signs, and so did the bracket step, so they cancel. An answer-only check passes this every time. It fails when they split the middle term in Class 9." : nS ? "<b>A sign slip in move 1</b>, carried faithfully into the brackets." : nR && fl ? "<b>Flips the signs into the brackets.</b> The right numbers, lost in move 2." : "<b>Move 1 doesn't fit the product–sum rule.</b> Start there.";
  return { b1, b2, layers, text, fin, double: nS && fl };
};
E.QUAD = [{ b: 5, c: 6, ok: ["+", "+"] }, { b: -5, c: 6, ok: ["−", "−"] }, { b: 1, c: -6, ok: ["−", "+"] }, { b: -1, c: -6, ok: ["+", "−"] }];
E.RULES = [{ name: "The real rule: signs multiply to the last sign and add to the middle", pred: E.QUAD.map((c) => c.ok) }, { name: "Copy the middle sign into both brackets", pred: [["+", "+"], ["−", "−"], ["+", "+"], ["−", "−"]] }, { name: "The minus always goes on the smaller number", pred: [["+", "+"], ["−", "−"], ["−", "+"], ["−", "+"]] }, { name: "First bracket copies the middle sign, second the last", pred: [["+", "+"], ["−", "+"], ["+", "−"], ["−", "−"]] }, { name: "Flip every sign into the brackets", pred: E.QUAD.map((c) => c.ok.map((s) => (s === "+" ? "−" : "+"))) }];
E.quadExpr = (i) => { const { b, c } = E.QUAD[i]; return `x² ${b < 0 ? "−" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}x ${c < 0 ? "−" : "+"} ${Math.abs(c)}`; };
E.quadRead = (picks) => {
  const scores = E.RULES.map((r) => r.pred.map((p, i) => p[0] === picks[i][0] && p[1] === picks[i][1])), best = scores.map((s, k) => [s.filter(Boolean).length, k]).sort((a, b) => b[0] - a[0])[0];
  const nR = picks.filter((p, i) => p[0] === E.QUAD[i].ok[0] && p[1] === E.QUAD[i].ok[1]).length;
  const text = best[0] === 4 ? (best[1] === 0 ? "<b>All four follow the real rule.</b> Not a shortcut." : `<b>All four follow “${E.RULES[best[1]].name}”.</b> ${nR ? `${nR} of 4 came out right anyway, so a single question could have marked this student correct.` : "Consistent, so this is a misconception."}`) : `<b>No known rule fits all four</b> (closest ${best[0]} of 4). Guessing signs: doesn't know yet.`;
  return { scores, best, text, cert: best[0] === 4 ? .9 : .35 };
};
E.TRACE = [{ t: "(x − 5)(x + 3)", e: "x² − 2x − 15", k: "flip" }, { t: "(x + 15)(x − 1)", e: "x² + 14x − 15", k: "prod" }, { t: "(x + 5)(x − 3)", e: "x² + 2x − 15", k: "right" }, { t: "(x − 15)(x + 1)", e: "x² − 14x − 15", k: "prod" }];
E.traceRead = (pred, o) => {
  const pk = pred.p1 * pred.p2 === -15 && pred.p1 + pred.p2 === 2 ? "right" : pred.p1 * pred.p2 === -15 && pred.p1 + pred.p2 === -2 ? "flip" : pred.p1 * pred.p2 === -15 ? "prod" : "other";
  const text = pk === "right" && o.k === "right" ? "<b>Predicted it, then picked it.</b> Real factorising." : o.k === "right" ? "<b>The prediction was off, but the pick is right.</b> They most likely found it by checking the options. That's expanding, an easier skill." : pk === o.k ? `<b>The same mistake twice, independently</b> (${o.k === "flip" ? "signs flipped" : "right product, wrong sum"}). Strong evidence.` : "<b>Prediction and pick disagree, and both are wrong.</b> Doesn't know yet.";
  return { text, pk, cert: o.k === "right" && pk === "right" ? .9 : .6 };
};
E.SWITCH = [{ q: "x² − 9", o: ["(x − 3)(x + 3)", "(x − 3)²", "(x − 9)(x + 1)"] }, { q: "x² − 25", o: ["(x − 5)²", "(x − 5)(x + 5)", "(x − 25)(x + 1)"] }, { q: "4x² − 1", o: ["(4x − 1)(x + 1)", "(2x − 1)²", "(2x − 1)(2x + 1)"] }, { q: "x² + 16", o: ["(x − 4)(x + 4)", "(x + 4)²", "Can't be factorised"], trap: true }];
E.switchRead = (times, picks) => {
  const base = (times[0] + times[1] + times[2]) / 3, ratio = times[3] / base, p = picks[3];
  return p === 0 ? `<b>Autopilot on the fourth.</b> Carried the difference-of-squares pattern onto a plus sign${ratio < 1.4 ? `, at their usual pace (${ratio.toFixed(1)}×)` : ""}. Treat the first three with care.` : p === 1 ? "<b>Noticed the fourth was different</b>, but thinks x² + 16 = (x + 4)². A sum-of-squares belief." : ratio >= 1.4 ? `<b>Noticed the switch.</b> Slowed down (${ratio.toFixed(1)}× usual) and checked.` : "<b>Spotted the switch instantly.</b>";
};
E.REV = { RIGHT: ["(x+5)(x-2)", "(x-2)(x+5)"], BUGS: { "(x-5)(x+2)": "the sign-flipped answer", "(x+2)(x-5)": "the sign-flipped answer", "(x+10)(x-1)": "a right-product, wrong-sum answer", "(x-10)(x+1)": "a right-product, wrong-sum answer" } };
E.norm = (s) => s.replace(/\s+/g, "").replace(/[−–]/g, "-").toLowerCase();
E.script = (ops) => { const h = []; let t = 0, v = ""; for (const o of ops) { if (o.type) for (const ch of o.type) { t += o.d ?? .2; v += ch; h.push({ t, v }); } if (o.wait) t += o.wait; if (o.back) for (let k = 0; k < o.back; k++) { t += .1; v = v.slice(0, -1); h.push({ t, v }); } } return h; };
E.SAMPLES = { fix: E.script([{ type: "(x-5)(x+2)" }, { wait: 2.6 }, { back: 8 }, { type: "+5)(x-2)" }]), clean: E.script([{ wait: 1.2 }, { type: "(x+5)(x-2)", d: .16 }]), stuck: E.script([{ type: "(x+" }, { wait: 4.2 }, { type: "10)(x-1)", d: .24 }]) };
E.revRead = (h, draftWord = "draft") => {
  const drafts = []; h.forEach((s, k) => { const nx = h[k + 1], pv = h[k - 1]; if (nx && nx.v.length < s.v.length && (!pv || pv.v.length <= s.v.length)) drafts.push(s); });
  const fin = h.at(-1), buggy = drafts.map((d) => E.REV.BUGS[E.norm(d.v)]).filter(Boolean), right = E.REV.RIGHT.includes(E.norm(fin.v));
  let lg = { gap: 0, at: "" }; h.forEach((s, k) => { const gap = s.t - (k ? h[k - 1].t : 0); if (gap > lg.gap) lg = { gap, at: k ? h[k - 1].v : "" }; });
  let text = right && buggy.length ? `<b>Finished right, but the first ${draftWord} was ${buggy[0]}.</b> They caught it this time. The mistake is still live, so Lotus keeps watching for it.` : right && !drafts.length ? "<b>Straight through, no changes.</b> Fluent." : right ? `<b>Right, after ${drafts.length} discarded ${draftWord}${drafts.length > 1 ? "s" : ""}.</b> None matched a known mistake.` : E.REV.BUGS[E.norm(fin.v)] ? `<b>Finished with ${E.REV.BUGS[E.norm(fin.v)]}.</b>` : "<b>Finished with something that isn't the factorisation.</b>";
  if (lg.gap > 1.5) text += ` Longest pause: ${lg.gap.toFixed(1)}s${lg.at ? ` after “${esc(lg.at)}”` : " before starting"}.`;
  return { drafts, fin, buggy, text, cert: buggy.length ? .6 : .85 };
};
E.LOTS = { VALID: [-13, -8, -7, 7, 8, 13], PAIRS: { 13: [1, 12], 8: [2, 6], 7: [3, 4], "-13": [-1, -12], "-8": [-2, -6], "-7": [-3, -4] } };
E.lotsRead = (picked) => {
  const found = picked.filter((v) => E.LOTS.VALID.includes(v)), wrong = picked.filter((v) => !E.LOTS.VALID.includes(v)), neg = found.filter((v) => v < 0);
  let text = found.length === 6 ? "<b>All six.</b>" : found.length === 3 && !neg.length ? "<b>Found 7, 8 and 13, and none of the negatives.</b> Forgets that two negatives also multiply to +12 (the “no negative pairs” mistake), now with solid evidence." : found.length <= 2 ? `<b>Found ${found.length}.</b> Knows an example, not the whole set.` : `<b>Found ${found.length} of 6.</b>`;
  const pos = picked.filter((v) => v > 0 && E.LOTS.VALID.includes(v)).join(); if (pos === "13,8,7" || pos === "7,8,13") text += " Listed them in order, which is systematic.";
  if (wrong.some((v) => [12, -12, 1, -1].includes(v))) text += " Picked 12 or 1, mixing up b with a factor of 12."; else if (wrong.length) text += ` ${wrong.length} that don't work: ${wrong.map(sgn).join(", ")}.`;
  return { found, wrong, neg, text, cert: found.length === 6 ? .9 : .7 };
};
E.MODULE = {
  block: { lines: ["(x + 3)² − 16", "A² − 4²", "(A − 4)(A + 4)", "(x + 3 − 4)(x + 3 + 4)", "(x − 1)(x + 7)"], t: "<b>Treated (x + 3) as one block.</b> Saw A² − 4². That's structure sense: spotting a difference of squares wherever it hides.", c: .9 },
  expand: { lines: ["(x + 3)² − 16", "x² + 6x + 9 − 16", "x² + 6x − 7", "(x + 7)(x − 1)"], t: "<b>Right, the long way.</b> Four lines and a product–sum search. They can do it but didn't see the structure, and an answer-only check would call this full mastery.", c: .7 },
  root: { lines: ["(x + 3)² − 16", "(x + 3) − 4", "x − 1"], t: "<b>Square-rooted each part.</b> Thinks √(a − b) = √a − √b. A different misconception, worth its own follow-up.", c: .85 },
};
E.mentalRead = (v, t) => v === "9800" && t <= 12 ? `<b>9800 in ${t.toFixed(0)}s.</b> That fast almost certainly means 98 × 100: the structure carries over to plain numbers.` : v === "9800" ? `<b>9800 after ${t.toFixed(0)}s.</b> Probably 9801 − 1, the long way.` : `<b>${esc(v) || "No answer"}.</b> Not 9800; check for an arithmetic slip first.`;
E.nbq = (names) => {
  const S = ["M", "FLIP", "PROD", "SWAP", "UNK"], NAMES = { M: "Knows it", FLIP: "Flips signs into the brackets", PROD: "Matches the product, ignores the sum", SWAP: "Mixes up product and sum", UNK: "Doesn't know yet" };
  const u = (ks) => Object.fromEntries(ks.map((k) => [k, 1 / ks.length])), sl = (m, ks, p = .92) => Object.fromEntries(ks.map((k) => [k, k === m ? p : (1 - p) / (ks.length - 1)]));
  const QS = [
    { id: "alloc", name: names.alloc, sec: 30, L: { M: sl("right", ["right", "sw", "ps", "po"]), FLIP: sl("sw", ["right", "sw", "ps", "po"]), PROD: { right: .31, sw: .31, po: .31, ps: .07 }, SWAP: sl("ps", ["right", "sw", "ps", "po"]), UNK: u(["right", "sw", "ps", "po"]) } },
    { id: "typed", name: names.typed, sec: 40, L: { M: { right: .92, other: .08 }, FLIP: { flip: .88, other: .12 }, PROD: { right: .5, prod: .45, other: .05 }, SWAP: { swap: .85, other: .15 }, UNK: { dunno: .5, other: .4, right: .1 } } },
    { id: "quad", name: names.quad, sec: 60, L: { M: { all: .9, none: .1 }, FLIP: { flipped: .85, none: .15 }, PROD: { all: .4, none: .4, copy: .2 }, SWAP: { all: .3, none: .5, copy: .2 }, UNK: { none: .6, copy: .25, all: .1, flipped: .05 } } },
    { id: "claims", name: names.claims, sec: 60, L: Object.fromEntries(S.map((s) => [s, { a: .5, b: .5 }])) },
    { id: "lots", name: names.lots, sec: 45, L: { M: { ok: .9, no: .1 }, FLIP: { ok: .7, no: .3 }, PROD: { ok: .6, no: .4 }, SWAP: { ok: .5, no: .5 }, UNK: { ok: .25, no: .75 } } },
    { id: "old", name: "Fireflies (today's game)", sec: 20, L: { M: sl("r", ["r", "s", "o", "p"]), FLIP: sl("r", ["r", "s", "o", "p"]), PROD: { r: .31, s: .31, o: .31, p: .07 }, SWAP: u(["r", "s", "o", "p"]), UNK: u(["r", "s", "o", "p"]) } },
  ];
  for (const q of QS) { const R = [...new Set(S.flatMap((s) => Object.keys(q.L[s])))]; for (const s of S) q.L[s] = Object.fromEntries(R.map((r) => [r, .94 * (q.L[s][r] ?? 0) + .06 / R.length])); }
  const H = (d) => -Object.values(d).reduce((t, p) => t + (p > 0 ? p * Math.log2(p) : 0), 0);
  const post = (b, q, r) => { const o = {}; let z = 0; for (const s of S) { o[s] = b[s] * (q.L[s][r] ?? 0); z += o[s]; } for (const s of S) o[s] = z ? o[s] / z : b[s]; return o; };
  const eig = (b, q) => { const rs = [...new Set(S.flatMap((s) => Object.keys(q.L[s])))]; let e = 0; for (const r of rs) { const pr = S.reduce((t, s) => t + b[s] * (q.L[s][r] ?? 0), 0); if (pr > 0) e += pr * H(post(b, q, r)); } return Math.max(0, H(b) - e); };
  return { S, NAMES, QS, PRIOR: { M: .35, FLIP: .2, PROD: .15, SWAP: .1, UNK: .2 }, post, eig };
};
E.pretty = (s) => s.replace(/\^2/g, "²").replace(/\*/g, " · ").replace(/-/g, " − ").replace(/\+/g, " + ");
E.readback = (raw) => {
  let s = raw.replace(/\s+/g, "").replace(/[−–]/g, "-"); const iss = []; let fix = null;
  const o = (s.match(/\(/g) || []).length, c = (s.match(/\)/g) || []).length;
  if (/x2(?!\d)/.test(s) && !s.includes("^")) { iss.push("“x2” could be x² or x × 2. Read as x²."); s = s.replace(/x2(?!\d)/g, "x^2"); }
  if (o > c) { iss.push(`${o - c === 1 ? "A bracket is" : "Brackets are"} left open. Closed at the end.`); s += ")".repeat(o - c); }
  if (c > o) iss.push("An extra closing bracket.");
  const m = /^(x[+-]\d+)\((x[+-]\d+)\)$/.exec(s);
  if (m) { iss.push(`This reads as a sum, not two brackets multiplied. Did you mean (${E.pretty(m[1])})(${E.pretty(m[2])})?`); fix = `(${m[1]})(${m[2]})`; }
  if (/\^2/.test(s) && !/\(/.test(s)) iss.push("This is the expression itself, not factorised.");
  return { s, iss, fix, ok: ["(x+2)(x+3)", "(x+3)(x+2)", "(x+2)*(x+3)", "(x+3)*(x+2)"].includes(s) };
};
