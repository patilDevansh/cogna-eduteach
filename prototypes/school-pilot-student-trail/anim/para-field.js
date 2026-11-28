/* Ramesh uncle's wonky field — a hands-on lesson: the area of a parallelogram is base × height.
   The student does the maths with their hands and the narrator reacts:
     1. swipe to cut the field (a slanted or short cut gets a reaction and another go)
     2. pick up the cut piece and set it down at the other end; it clicks in and the land is counted, square by square
     3. lean a second field with a handle: the slanted side changes, the land never does
     4. watch the bit that sticks out get cut off, carried across and set into the gap, then work out a third field on their own
   It is told as a story: Maji presents (Cogna.lesson's presenter), Ramesh uncle walks on with his problem, the student
   guesses first, does the cutting and moving, then TELLS RAMESH UNCLE the answer and how they knew. He thanks them and
   leaves before the lesson moves from his field to any parallelogram.
   Land is drawn as a slab of earth (grass on top, soil underneath, a soft shadow on the ground) so a cut piece can be
   lifted, carried and set down. Built on Cogna.lesson (voice-paced steps) with GSAP for motion, drag and snap, and
   Cogna.sfx for sound. Every line the narrator can say is a literal `caption:` so tools/record-narration.mjs records it.
   Note: lessons are built before the page shows them, so every rotate/scale origin is given as a point (svgOrigin),
   never measured from the drawing. */
(function () {
  "use strict";
  var C = window.Cogna, S = C.svg, h = C.h, K = C.story;
  var W = 800, H = 470, U = 60;                    // drawing size; one square of land = U units
  var SLAB = [4, 10];                              // how far the soil shows under the grass (light from the top left)
  var REST = [3, 8, 0.22], HELD = [12, 28, 0.3];   // a piece's shadow (x, y, opacity): on the ground / while held up
  var WONKY = [[0, 4], [6, 4], [8, 0], [2, 0]];
  var uid = 0;

  /* reaction lines (spoken inside a task) */
  var R = {
    cutShort: { caption: "Go all the way across, from the top edge to the bottom edge." },
    cutSlant: { caption: "Ooh, a slanted cut. Slanted edges won't make a square corner. Try cutting straight down." },
    cutGood: { caption: "Clean cut. Nice!" },
    dropWrong: { caption: "Hmm, not there. Try the other end of the field." },
    dropHint: { caption: "Psst. Look at the two slanted edges. They match." },
    dropGood: { caption: "Click! A perfect fit." },
    leanHint: { caption: "Go on, drag the gold handle left and right. Lean it a lot!" },
    leanDone: { caption: "See that? The slanted side keeps changing, but the land stays 18." },
    n35: { caption: "That used the slanted side, 5. Land goes straight up, so use the height, 4." },
    n24: { caption: "24 is the fence all the way round. We want the land inside." },
    n11: { caption: "That's 7 + 4. For land, we multiply." },
    n20: { caption: "That's 5 × 4. Use the base, 7, with the height, 4." },
    nOther: { caption: "Use the base times the height." },
    nRight: { caption: "28! You've got it." },
    guessed: { caption: "Good. Hold on to that guess, and let's find out for sure." },
    noGuess: { caption: "That's fine. Let's find out together." },
    tellWrong: { caption: "Look at the rectangle we made. 6 along and 4 up." },
    tellRight: { caption: "He says thank you! Now he knows exactly how much seed to buy." },
    tellRightGuess: { caption: "He says thank you! And 24 was your guess at the start. Spot on." },
    tellRightOther: { caption: "He says thank you! Your first guess wasn't far off, and now you know for sure." },
  };

  /* ---------- drawing helpers ---------- */
  function add(p, tag, a) { var e = S(tag, a || {}); p.appendChild(e); return e; }
  function px(P, u) { u = u || U; return P.map(function (p) { return (p[0] * u).toFixed(1) + "," + (p[1] * u).toFixed(1); }).join(" "); }
  function text(p, str, x, y, cls) { var e = add(p, "text", { x: x, y: y, "class": cls || "t-pf-lab" }); e.textContent = str; return e; }
  function line(e, a, b) { e.setAttribute("x1", a[0].toFixed(1)); e.setAttribute("y1", a[1].toFixed(1)); e.setAttribute("x2", b[0].toFixed(1)); e.setAttribute("y2", b[1].toFixed(1)); }
  function shade(s) { return { x: s[0], y: s[1], opacity: s[2] }; }
  function mid(P) { var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; }); return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2]; }

  /** convex hull of points (monotone chain) */
  function hull(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), lo = [], up = [], i;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  /** the soil under a patch of grass: the patch swept down and to the right by SLAB */
  function slab(P, u) {
    var a = P.map(function (p) { return [p[0] * u, p[1] * u]; });
    return hull(a.concat(a.map(function (p) { return [p[0] + SLAB[0], p[1] + SLAB[1]]; })))
      .map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
  }

  /** A patch of land in the shape P (square units): a soft shadow, a slab of soil, then grass with mown stripes and a grid.
      g: the whole piece (x/y moves it; Draggable drives it) · lift: the part that rises when it is picked up ·
      shadow: stays on the ground and spreads while the piece is held up */
  function field(c, parent, P, u, opt) {
    opt = opt || {}; u = u || U;
    var id = "pf-clip-" + (++uid) + "-" + c.key;
    var g = add(parent, "g", { "class": "t-pf-piece" });
    var shadow = add(g, "polygon", { points: px(P, u), "class": "t-pf-shadow", filter: "url(#" + c.blurId + ")" });
    var lift = add(g, "g", { "class": "t-pf-lift" });
    var soil = add(lift, "polygon", { points: slab(P, u), "class": "t-pf-soil" });
    var cp = add(c.defs, "clipPath", { id: id });
    var clipPoly = add(cp, "polygon", { points: px(P, u) });
    var inner = add(lift, "g", { "clip-path": "url(#" + id + ")" });
    var grass = add(inner, "polygon", { points: px(P, u), "class": "t-pf-grass" });
    var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; }), pad = opt.pad || 0;
    var x0 = Math.floor(Math.min.apply(null, xs)) - pad, x1 = Math.ceil(Math.max.apply(null, xs)) + pad;
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var d = "", st = "", i;
    for (i = x0; i < x1; i++) if (((i % 2) + 2) % 2 === 0) st += "M" + i * u + " " + y0 * u + "h" + u + "V" + y1 * u + "h" + (-u) + "Z";   // mown stripes
    for (i = x0; i <= x1; i++) d += "M" + i * u + " " + y0 * u + "V" + y1 * u;
    for (i = y0; i <= y1; i++) d += "M" + x0 * u + " " + i * u + "H" + x1 * u;
    add(inner, "path", { d: st, "class": "t-pf-stripe" });
    add(inner, "path", { d: d, "class": "t-pf-grid" });
    var edge = add(lift, "polygon", { points: px(P, u), "class": "t-pf-edge" });
    var m = mid(P);
    c.L.set(shadow, shade(REST));
    return {
      g: g, lift: lift, shadow: shadow, soil: soil, inner: inner, edge: edge, centre: [m[0] * u, m[1] * u],
      set: function (P2) {
        var s = px(P2, u);
        grass.setAttribute("points", s); clipPoly.setAttribute("points", s); edge.setAttribute("points", s); shadow.setAttribute("points", s);
        soil.setAttribute("points", slab(P2, u));
      },
    };
  }
  /** pick a piece up: it rises a little, grows a touch, and its shadow spreads */
  function liftUp(p, L, dur) {
    L.set(p.lift, { svgOrigin: p.centre[0] + " " + p.centre[1] });
    L.to(p.lift, { y: -12, scale: 1.03, duration: dur || 0.18, ease: "power2.out", overwrite: "auto" }, true);
    L.to(p.shadow, Object.assign(shade(HELD), { duration: dur || 0.18, ease: "power2.out", overwrite: "auto" }), true);
  }
  /** set it down again, with a small settle */
  function setDown(p, L) {
    L.to(p.lift, { y: 0, scale: 1, rotation: 0, duration: 0.34, ease: "back.out(2.6)", overwrite: "auto" }, true);
    L.to(p.shadow, Object.assign(shade(REST), { duration: 0.3, ease: "power2.out", overwrite: "auto" }), true);
  }
  /** a quick "no" wiggle */
  function wiggle(e, L, prop, a) {
    if (L.reduced) return;
    var k = [-a, a * 0.8, -a * 0.45, 0].map(function (v, i) { var o = { duration: i === 3 ? 0.09 : 0.06 }; o[prop] = v; return o; });
    L.to(e, { keyframes: k, overwrite: "auto" }, true);
  }
  /** a small jolt of the whole picture */
  function shake(c, L, a) {
    if (L.reduced) return;
    L.to(c.world, { keyframes: [{ x: -a, duration: 0.04 }, { x: a * 0.7, duration: 0.05 }, { x: -a * 0.4, duration: 0.05 }, { x: 0, duration: 0.07 }], overwrite: "auto" }, true);
  }

  function tree(p, x, y, s) {
    var g = add(p, "g", { "class": "t-pf-tree" });
    add(g, "ellipse", { cx: x + 8 * s, cy: y + 1, rx: 34 * s, ry: 7 * s, "class": "t-pf-treeshadow" });
    add(g, "rect", { x: x - 5 * s, y: y - 36 * s, width: 10 * s, height: 37 * s, rx: 4 * s, "class": "t-pf-trunk" });
    var crown = add(g, "g");
    add(crown, "circle", { cx: x - 19 * s, cy: y - 46 * s, r: 21 * s, "class": "t-pf-crown is-back" });
    add(crown, "circle", { cx: x + 19 * s, cy: y - 48 * s, r: 22 * s, "class": "t-pf-crown is-back" });
    add(crown, "circle", { cx: x, cy: y - 64 * s, r: 28 * s, "class": "t-pf-crown" });
    add(crown, "circle", { cx: x - 9 * s, cy: y - 73 * s, r: 12 * s, "class": "t-pf-crown-hi" });
    return { g: g, crown: crown, base: [x, y - 34 * s] };
  }

  /** The parts of grid squares that the edges of a (convex) field cut through: [{ poly, area, x, y }] in square units. */
  function brokenBits(P) {
    var G = C.lesson.G, n = P.length, cx = 0, cy = 0, out = [];
    P.forEach(function (p) { cx += p[0] / n; cy += p[1] / n; });
    var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
    function inside(a, b) {   // linear test that is >= 0 on the field's side of edge a-b
      var s = (b[0] - a[0]) * (cy - a[1]) - (b[1] - a[1]) * (cx - a[0]) > 0 ? 1 : -1;
      return function (p) { return s * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])); };
    }
    for (var i = Math.floor(Math.min.apply(null, xs)); i < Math.ceil(Math.max.apply(null, xs)); i++) {
      for (var j = Math.floor(Math.min.apply(null, ys)); j < Math.ceil(Math.max.apply(null, ys)); j++) {
        var q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        for (var k = 0; k < n && q.length > 2; k++) q = G.clip(q, inside(P[k], P[(k + 1) % n]));
        var ar = q.length > 2 ? G.area(q) : 0;
        if (ar > 0.02 && ar < 0.98) {
          var mx = 0, my = 0;
          q.forEach(function (p) { mx += p[0] / q.length; my += p[1] / q.length; });
          out.push({ poly: q, area: ar, x: mx, y: my });
        }
      }
    }
    return out;
  }

  /* ---------- the land sign (top right) ---------- */
  var SIGN = [W - 113, 59];   // its centre
  function setSign(c, v, L) {
    c.signVal.textContent = v == null ? "? squares" : v + (v === 1 ? " square" : " squares");
    if (L && !L.reduced) { L.set(c.signVal, { y: 7, opacity: 0.3 }); L.to(c.signVal, { y: 0, opacity: 1, duration: 0.2, ease: "power2.out", overwrite: "auto" }, true); }
  }
  function popSign(c, L) {
    L.to(c.sign, { keyframes: [{ scale: 1.12, duration: 0.12, ease: "power2.out" }, { scale: 1, duration: 0.34, ease: "back.out(3)" }], overwrite: "auto" }, true);
  }

  /* ---------- field 1: cut and slide ---------- */
  function place1(c) { c.gF1.setAttribute("transform", "translate(" + c.p1.x.toFixed(1) + " " + c.p1.y.toFixed(1) + ")"); }

  /** the field says hello: a little hop, and the sign pops */
  function hello(c, L) {
    var p = c.whole;
    L.set(p.lift, { svgOrigin: 4 * U + " " + 4 * U });
    L.wait(150, function () { L.sfx("pop"); });
    L.to(p.lift, { keyframes: [{ y: -18, scaleY: 1.03, duration: 0.24, ease: "power2.out" }, { y: 0, scaleY: 1, duration: 0.6, ease: "bounce.out" }], delay: 0.15 });
    L.to(p.shadow, { keyframes: [{ x: 9, y: 26, opacity: 0.1, duration: 0.24, ease: "power2.out" }, Object.assign(shade(REST), { duration: 0.6, ease: "bounce.out" })], delay: 0.15 });
    L.wait(700, function () { popSign(c, L); });
  }
  /** the broken squares along the slanted edges light up, with a question mark on the bigger bits */
  function showBroken(c, L) {
    L.to(c.gBroken, { opacity: 1, duration: 0.4 });
    L.to(c.bits, { opacity: 0.45, duration: 0.45, repeat: 3, yoyo: true, ease: "sine.inOut", delay: 0.5 });
    c.badges.forEach(function (b, i) {
      L.to(b, { scale: 1, duration: 0.42, ease: "back.out(3)", delay: 1 + i * 0.22, onStart: function () { L.sfx("pop"); } });
    });
  }
  /** a sheen of light sweeps across the grass: something clever is coming */
  function sheen(c, L) {
    if (L.reduced) return;
    var s = add(c.whole.inner, "rect", { x: -0.8 * U, y: -2 * U, width: 1.6 * U, height: 8 * U, fill: "url(#" + c.sheenId + ")" });
    L.set(s, { x: -2 * U, rotation: 20, svgOrigin: "0 " + 2 * U });
    L.wait(650, function () { L.sfx("whoosh"); });
    L.to(s, { x: 10 * U, duration: 1.05, delay: 0.65, ease: "power1.inOut", onComplete: function () { if (s.parentNode) s.parentNode.removeChild(s); } }, true);
  }
  /** a ghost finger shows the swipe, drawing the cut line behind it, over and over until the student starts */
  function fingerHint(c, L) {
    if (L.reduced) return null;
    var ln = c.hintLine, top = -46;
    line(ln, [4 * U, top], [4 * U, top]);
    L.set(c.finger, { x: 4 * U, y: top, opacity: 0 });
    return L.to(c.finger, { keyframes: [
      { opacity: 1, duration: 0.25, ease: "none" },
      { y: 4 * U + 46, duration: 1.0, ease: "power1.inOut" },
      { opacity: 0, duration: 0.3, ease: "none" },
      { opacity: 0, duration: 0.75 },
    ], repeat: -1, delay: 0.9, onUpdate: function () {
      ln.setAttribute("y2", window.gsap.getProperty(c.finger, "y"));
      ln.style.opacity = window.gsap.getProperty(c.finger, "opacity");
    } }, true);
  }
  /** bits of grass fly out of the cut */
  function clippings(c, L, X, parent, hU) {
    if (L.reduced) return;
    parent = parent || c.gFx; hU = hU || 4;   // which group they fly in, and how many squares tall the cut is
    for (var i = 0; i < 16; i++) {
      var side = i % 2 ? 1 : -1, y = (0.15 + Math.random() * (hU - 0.3)) * U;
      var bit = add(parent, "rect", { x: -3, y: -7, width: 6, height: 14, rx: 3, "class": "t-pf-bit" + (i % 2 ? " is-light" : "") });
      L.set(bit, { x: X, y: y, rotation: Math.random() * 180, transformOrigin: "50% 50%" });
      L.to(bit, { x: X + side * (16 + Math.random() * 52), rotation: "+=" + side * (160 + Math.random() * 260), duration: 0.85, ease: "power2.out" }, true);
      L.to(bit, { keyframes: [{ y: y - 12 - Math.random() * 30, duration: 0.26, ease: "power2.out" }, { y: y + 36 + Math.random() * 40, duration: 0.56, ease: "power2.in" }] }, true);
      L.to(bit, { opacity: 0, duration: 0.3, delay: 0.55, onComplete: function () { var t = this.targets()[0]; if (t && t.parentNode) t.parentNode.removeChild(t); } }, true);
    }
  }
  /** the cut: the stroke straightens onto a grid line, a blade of light runs down it, and the field comes apart */
  function doCut(c, L, x, then) {
    c.cutX = x;
    var k = c.knife, X = x * U, top = -26, bot = 4 * U + 26;
    k.style.opacity = 1;
    k.setAttribute("class", "t-pf-knife is-ready");
    L.to(k, { attr: { x1: X, y1: top, x2: X, y2: bot }, duration: 0.14, ease: "power2.out", onComplete: slice }, true);
    function slice() {
      L.sfx("slice");
      L.set(c.blade, { x: X, y: top, opacity: 1 });
      L.to(c.blade, { y: bot + 56, duration: 0.22, ease: "power2.in", onComplete: split }, true);
    }
    function split() {
      c.blade.style.opacity = 0;
      k.setAttribute("class", "t-pf-knife is-cut");
      c.whole.g.style.display = "none";
      c.pR = field(c, c.gPieces, [[x, 4], [6, 4], [8, 0], [x, 0]], U);
      c.pL = field(c, c.gPieces, [[0, 4], [x, 4], [x, 0], [2, 0]], U);
      c.matchL = add(c.pL.lift, "path", { d: "M0 " + 4 * U + "L" + 2 * U + " 0", "class": "t-pf-match" });
      c.ghost.setAttribute("points", px([[6, 4], [x + 6, 4], [x + 6, 0], [8, 0]]));
      c.gPieces.appendChild(c.ghost);
      clippings(c, L, X);
      shake(c, L, 4);
      L.to(c.pL.g, { x: -16, duration: 0.5, ease: "back.out(3)" }, true);
      L.to(c.pR.g, { keyframes: [{ x: 7, duration: 0.1, ease: "power2.out" }, { x: 0, duration: 0.6, ease: "elastic.out(1, 0.45)" }] }, true);
      L.to(k, { opacity: 0, duration: 0.45, delay: 0.1 }, true);
      L.to(c.p1, { x: (W - (x + 6) * U) / 2, duration: 0.9, delay: 0.55, ease: "power2.inOut", onUpdate: function () { place1(c); }, onComplete: then }, true);
    }
  }
  /** gold light runs up the seam where the two slanted edges meet */
  function seamFlash(c, L) {
    var len = Math.hypot(2 * U, 4 * U) + 2;
    c.seam.style.opacity = 1;
    c.seamLines.forEach(function (e) { e.style.strokeDasharray = len; e.style.strokeDashoffset = len; });
    L.to(c.seamLines, { strokeDashoffset: 0, duration: 0.38, ease: "power2.out" }, true);
    L.sfx("sparkle");
    L.to(c.seam, { opacity: 0, duration: 0.7, delay: 0.9 }, true);
  }
  /** a gold outline draws itself round the new rectangle */
  function drawOutline(c, L, x) {
    var o = c.outline, per = 2 * (6 * U + 4 * U);
    o.setAttribute("x", x * U); o.setAttribute("y", 0); o.setAttribute("width", 6 * U); o.setAttribute("height", 4 * U);
    o.style.strokeDasharray = per; o.style.strokeDashoffset = per; o.style.opacity = 1;
    L.to(o, { strokeDashoffset: 0, duration: 0.9, delay: 0.2, ease: "power2.inOut" });
  }
  /** 24 tiles for counting, bottom row first (6 along the bottom, then up) */
  function makeCells(c, x) {
    while (c.gCells.firstChild) c.gCells.removeChild(c.gCells.firstChild);
    c.gCells.style.opacity = 1;
    c.cells = []; c.cellNums = [];
    for (var i = 0; i < 24; i++) {
      var col = i % 6, row = 3 - Math.floor(i / 6), cx = (x + col + 0.5) * U, cy = (row + 0.5) * U;
      var g = add(c.gCells, "g", { "class": "t-pf-cell" });
      add(g, "rect", { x: cx - U / 2 + 5, y: cy - U / 2 + 5, width: U - 10, height: U - 10, rx: 9 });
      c.cellNums.push(text(g, String(i + 1), cx, cy + 1, "t-pf-cellnum"));
      c.L.set(g, { scale: 0.4, opacity: 0, svgOrigin: cx + " " + cy });
      c.cells.push(g);
    }
  }

  /* ---------- field 2: lean it ---------- */
  function lean2(l) { return [[0, 3], [6, 3], [6 + l, 0], [l, 0]]; }
  function update2(c, l) {
    c.l = l;
    c.f2.set(lean2(l));
    var miss, extra;
    if (l >= 0) { miss = [[0, 0], [l, 0], [0, 3]]; extra = [[6, 0], [6 + l, 0], [6, 3]]; }
    else { miss = [[6 + l, 0], [6, 0], [6, 3]]; extra = [[l, 0], [0, 0], [0, 3]]; }
    c.gap.setAttribute("points", px(miss)); c.extra.setAttribute("points", px(extra));
    var hx = (3 + l / 2) * U;
    c.hLine.setAttribute("x1", hx); c.hLine.setAttribute("x2", hx);
    c.hMark.setAttribute("d", "M" + hx + " " + (3 * U - 14) + "h14v14");
    c.hLab.setAttribute("x", hx - 14);
    var len = Math.sqrt(l * l + 9), nx = 3 / len, ny = l / len, mx = 6 + l / 2, my = 1.5;
    c.sLab.setAttribute("x", Math.min((mx + nx * 0.55) * U, W - c.f2x - 210).toFixed(1)); c.sLab.setAttribute("y", ((my + ny * 0.55) * U).toFixed(1));
    c.sLab.textContent = "slanted side " + (Math.round(len * 10) / 10);
    L2board(c);
  }
  function L2board(c) { if (c.L && c.leanLive) c.L.boardLive("base 6 × height 3 = <b>18</b>"); }

  /** a small label with a gold outline that pops in over a bit of the picture; give it a place with putTag() */
  function tag(parent, str) {
    var w = str.length * 13.5 + 34, g = add(parent, "g"), inner = add(g, "g");
    add(inner, "rect", { x: -w / 2, y: -20, width: w, height: 40, rx: 20, "class": "t-pf-tagbg" });
    text(inner, str, 0, 1, "t-pf-tagtxt");
    return { g: g, inner: inner };
  }
  function putTag(t, x, y) { t.g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")"); }
  /** gold light runs along the line a to b, where two pieces meet */
  function flashLine(c, L, a, b) {
    var len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 2, d = "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1);
    c.seamLines2.forEach(function (e) { e.setAttribute("d", d); e.style.strokeDasharray = len; e.style.strokeDashoffset = len; });
    c.seam2.style.opacity = 1;
    L.to(c.seamLines2, { strokeDashoffset: 0, duration: 0.38, ease: "power2.out" }, true);
    L.sfx("sparkle");
    L.to(c.seam2, { opacity: 0, duration: 0.7, delay: 0.9 }, true);
  }

  function putHandle(c, L, l) { L.set(c.handle, { x: (3 + l) * U }); }
  /** the handle is held: a touch bigger, and its ring stops pulsing */
  function grab(c, L, on) {
    c.handle.classList.toggle("is-held", on);
    L.to([c.knob, c.chev], { scale: on ? 1.18 : 1, duration: 0.14, ease: "power2.out", overwrite: "auto" }, true);
  }

  /** the second field drops in and settles with a bounce; once it has landed the sign changes, the labels fade in and the handle pops up */
  function field2In(c, L) {
    var p = c.f2;
    c.gF2.style.display = ""; L.set(c.gF2, { opacity: 0 });
    L.set(p.lift, { y: -54 }); L.set(p.shadow, shade(HELD));
    L.wait(350, function () { L.sfx("whoosh"); });
    L.wait(700, function () { L.sfx("thud"); });
    L.to(c.gF2, { opacity: 1, duration: 0.25, delay: 0.35 });
    L.to(p.lift, { y: 0, duration: 0.95, delay: 0.35, ease: "bounce.out" });
    L.to(p.shadow, Object.assign(shade(REST), { duration: 0.95, delay: 0.35, ease: "bounce.out" }));
    L.wait(950, function () { setSign(c, 18, L); popSign(c, L); });
    L.wait(1300, function () { c.leanLive = true; L.board("base 6 × height 3 = <b>18</b>"); });
    L.to([c.rg2, c.gOver2, c.gLab2, c.base2], { opacity: 1, duration: 0.4, delay: 1.3 });
    L.to(c.handle, { opacity: 1, duration: 0.2, delay: 1.5 });
    L.to([c.knob, c.chev], { scale: 1, duration: 0.45, delay: 1.5, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
  }

  /** a ghost finger leans the field a little each way, over and over, until the student does it themselves.
      Returns the two tweens to stop (or null when motion is reduced). */
  function leanDemo(c, L) {
    if (L.reduced) return null;
    var base = c.l, pr = { l: base };
    L.set(c.finger2, { x: (3 + base) * U, y: 0, opacity: 0 });
    var move = L.to(pr, { keyframes: [
      { l: base + 1.3, duration: 0.75, ease: "power2.inOut" },
      { l: base - 1.5, duration: 1.15, ease: "power2.inOut" },
      { l: base, duration: 0.75, ease: "power2.inOut" },
      { l: base, duration: 2.15 },
    ], repeat: -1, delay: 3, onUpdate: function () { update2(c, pr.l); putHandle(c, L, pr.l); L.set(c.finger2, { x: (3 + pr.l) * U }); } }, true);
    var show = L.to(c.finger2, { keyframes: [
      { opacity: 1, duration: 0.25, ease: "none" },
      { opacity: 1, duration: 2.15 },
      { opacity: 0, duration: 0.3, ease: "none" },
      { opacity: 0, duration: 2.1 },
    ], repeat: -1, delay: 3 }, true);
    return [move, show];
  }

  /** "Here's why": the bit that sticks out is cut off, carried across and set down in the gap, and the field is a rectangle */
  function whyMove(c, L) {
    var rel = L.hold(), over = false;
    function end() { if (over) return; over = true; rel(); }
    // the handle and the live measurements step aside
    c.handle.style.pointerEvents = "none";
    L.to([c.handle, c.gLab2], { opacity: 0, duration: 0.3 }, true);
    if (Math.abs(c.l) < 1.5) {   // leaned too little to see: lean it for them
      var pr = { l: c.l }, to = c.l < 0 ? -2 : 2.5;
      L.to(pr, { l: to, duration: 0.7, ease: "power2.inOut", onUpdate: function () { update2(c, pr.l); }, onComplete: function () { update2(c, to); begin(); } }, true);
    } else begin();

    function begin() {
      var l = c.l, right = l >= 0;
      var T = right ? [[6, 0], [6 + l, 0], [6, 3]] : [[l, 0], [0, 0], [0, 3]];                       // the bit that sticks out
      var rest = right ? [[0, 3], [6, 3], [6, 0], [l, 0]] : [[0, 3], [6, 3], [6 + l, 0], [0, 0]];    // the field without it
      var X = (right ? 6 : 0) * U, dx = (right ? -6 : 6) * U;                                         // where to cut, and how far it travels
      var seam = right ? [[l * U, 0], [0, 3 * U]] : [[(6 + l) * U, 0], [6 * U, 3 * U]];               // the line where it will meet the rest
      var midOut = right ? 6 + l / 3 : l / 3, midGap = right ? l / 3 : 6 + l / 3;                      // middle of each bit, in squares
      // 1. name the two bits
      putTag(c.tagOut, midOut * U, U); putTag(c.tagGap, midGap * U, U);
      L.sfx("pop");
      L.to([c.tagOut.inner, c.tagGap.inner], { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.6)", stagger: 0.2 }, true);
      L.to([c.extra, c.gap], { opacity: 0.45, duration: 0.4, repeat: 1, yoyo: true, delay: 0.5, ease: "sine.inOut", onComplete: guide }, true);

      // 2. a dotted line shows where, then a blade runs down it
      function guide() {
        c.guide2.setAttribute("x1", X); c.guide2.setAttribute("x2", X);
        L.to(c.guide2, { opacity: 1, duration: 0.18, onComplete: blade }, true);
      }
      function blade() {
        L.sfx("slice");
        L.set(c.blade2, { x: X, y: -26, opacity: 1 });
        L.to(c.blade2, { y: 3 * U + 26 + 56, duration: 0.24, ease: "power2.in", onComplete: split }, true);
      }
      // 3. the field comes apart: the cut-off bit nudges away, grass flies
      function split() {
        L.set(c.blade2, { opacity: 0 });
        L.to(c.guide2, { opacity: 0, duration: 0.3 }, true);
        c.f2.set(rest);
        L.set(c.extra, { opacity: 0 });
        c.wedge = field(c, c.gW2, T, U);
        L.to(c.tagOut.inner, { opacity: 0, scale: 0.6, duration: 0.25 }, true);
        clippings(c, L, X, c.gFx2, 3);
        shake(c, L, 4);
        var away = right ? 16 : -16;
        L.to(c.wedge.g, { x: away, duration: 0.5, ease: "back.out(3)", onComplete: carry }, true);
        L.to(c.f2.g, { keyframes: [{ x: -away / 2, duration: 0.1, ease: "power2.out" }, { x: 0, duration: 0.6, ease: "elastic.out(1, 0.45)" }] }, true);
      }
      // 4. picked up, carried over the field in an arc, tilting a little
      function carry() {
        L.sfx("pickup"); liftUp(c.wedge, L);
        L.to(c.tagGap.inner, { opacity: 0, scale: 0.6, duration: 0.25 }, true);   // the label would sit on top of the piece as it lands
        L.wait(220, function () { L.sfx("whoosh"); });
        L.to(c.wedge.g, { x: dx, duration: 1.05, delay: 0.25, ease: "power2.inOut", onComplete: land }, true);
        L.to(c.wedge.g, { keyframes: [{ y: -44, duration: 0.52, ease: "power1.out" }, { y: 0, duration: 0.53, ease: "power1.in" }], delay: 0.25 }, true);
        L.to(c.wedge.lift, { keyframes: [{ rotation: right ? -5 : 5, duration: 0.52, ease: "power1.out" }, { rotation: 0, duration: 0.53, ease: "power1.in" }], delay: 0.25 }, true);
      }
      // 5. set down in the gap: click, a flash along the join
      function land() {
        // the soil shows down and to the right of a piece; set down on the left it would stripe across the join, so it goes
        if (right) L.set(c.wedge.soil, { opacity: 0 });
        setDown(c.wedge, L);
        L.sfx("snap"); shake(c, L, 2);
        L.to(c.gap, { opacity: 0, duration: 0.25 }, true);
        flashLine(c, L, seam[0], seam[1]);
        L.wait(420, outline);
      }
      // 6. a gold outline draws itself round the rectangle it has become
      function outline() {
        var o = c.outline2, per = 2 * (6 * U + 3 * U);
        o.style.strokeDasharray = per; o.style.strokeDashoffset = per; o.style.opacity = 1;
        L.to(c.rg2, { opacity: 0, duration: 0.3 }, true);
        L.to(o, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut", onComplete: function () {
          L.sfx("chime"); popSign(c, L); L.wait(450, end);
        } }, true);
      }
    }
  }

  /** measuring lines round the finished rectangle: 6 along the bottom, 3 up the side */
  function measure2(c, L) {
    var X0 = 0, X1 = 6 * U, yb = 3 * U + SLAB[1] + 18, xl = -26;
    c.bBottom2.setAttribute("d", "M" + X0 + " " + (yb - 9) + "V" + (yb + 9) + "M" + X0 + " " + yb + "H" + X1 + "M" + X1 + " " + (yb - 9) + "V" + (yb + 9));
    c.bLeft2.setAttribute("d", "M" + (xl - 9) + " " + 3 * U + "H" + (xl + 9) + "M" + xl + " " + 3 * U + "V0M" + (xl - 9) + " 0H" + (xl + 9));
    c.l6b.setAttribute("x", (X0 + X1) / 2); c.l6b.setAttribute("y", yb + 26);
    c.l3b.setAttribute("x", xl - 26); c.l3b.setAttribute("y", 1.5 * U);
    L.set(c.bBottom2, { opacity: 1, scaleX: 0, svgOrigin: X0 + " " + yb });
    L.set(c.bLeft2, { opacity: 1, scaleY: 0, svgOrigin: xl + " " + 3 * U });
    L.set(c.l6b, { opacity: 0, scale: 0.4, svgOrigin: (X0 + X1) / 2 + " " + (yb + 26) });
    L.set(c.l3b, { opacity: 0, scale: 0.4, svgOrigin: (xl - 26) + " " + 1.5 * U });
    L.to(c.base2, { opacity: 0, duration: 0.25 });
    L.to(c.bBottom2, { scaleX: 1, duration: 0.7, delay: 0.4, ease: "power2.inOut" });
    L.to(c.l6b, { opacity: 1, scale: 1, duration: 0.4, delay: 1.05, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
    L.to(c.bLeft2, { scaleY: 1, duration: 0.6, delay: 1.7, ease: "power2.inOut" });
    L.to(c.l3b, { opacity: 1, scale: 1, duration: 0.4, delay: 2.25, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
  }

  C.lesson.define({
    id: "para-field", title: "Ramesh uncle's wonky field", cls: "t-pf", w: W, h: H, durationMs: 180000,
    presenter: { x: W - 100, y: H - 110, h: 106 },   // Maji tells the lesson from the bottom right corner

    build: function (svg, L) {
      var key = Math.random().toString(36).slice(2, 7);
      var c = { L: L, key: key, p1: { x: (W - 8 * U) / 2, y: 150 }, l: 2 };
      c.defs = add(svg, "defs");
      c.blurId = "pf-blur-" + key; c.hatchId = "pf-hatch-" + key; c.tailId = "pf-tail-" + key; c.sheenId = "pf-sheen-" + key; c.blurSmallId = "pf-blur2-" + key;
      add(add(c.defs, "filter", { id: c.blurId, x: "-30%", y: "-30%", width: "160%", height: "160%" }), "feGaussianBlur", { stdDeviation: 6 });
      add(add(c.defs, "filter", { id: c.blurSmallId, filterUnits: "userSpaceOnUse", x: -50, y: -50, width: 100, height: 100 }), "feGaussianBlur", { stdDeviation: 4 });   // for small things, like the handle
      add(add(c.defs, "pattern", { id: c.hatchId, width: 10, height: 10, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }), "rect", { width: 4, height: 10, "class": "t-pf-hatch" });
      var tg = add(c.defs, "linearGradient", { id: c.tailId, x1: 0, y1: 0, x2: 0, y2: 1 });
      add(tg, "stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0 });
      add(tg, "stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0.9 });
      var sg = add(c.defs, "linearGradient", { id: c.sheenId, x1: 0, y1: 0, x2: 1, y2: 0 });
      add(sg, "stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0 });
      add(sg, "stop", { offset: 0.5, "stop-color": "#fff", "stop-opacity": 0.55 });
      add(sg, "stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 });

      c.world = add(svg, "g");
      K.scene(svg, L, { w: W, h: H, hutX: 218, sunX: 330, before: c.world });   // the farm it all happens on, alive behind everything

      // scenery: two trees in the corner, clear of everywhere the land goes; they sway a little
      c.trees = [tree(c.world, 66, 128, 0.95), tree(c.world, 132, 112, 0.62)];
      if (!L.reduced) c.trees.forEach(function (t, i) {
        L.set(t.crown, { rotation: -1.6, svgOrigin: t.base[0] + " " + t.base[1] });
        L.to(t.crown, { rotation: 1.6, duration: 2.3 + i * 0.6, repeat: -1, yoyo: true, ease: "sine.inOut" }, true);
      });

      // the land sign
      c.sign = add(c.world, "g", { "class": "t-pf-sign" });
      add(c.sign, "rect", { x: W - 204, y: 22, width: 182, height: 86, rx: 16, "class": "t-pf-signshadow", filter: "url(#" + c.blurId + ")" });
      add(c.sign, "rect", { x: W - 206, y: 16, width: 186, height: 86, rx: 16, "class": "t-pf-signbox" });
      text(c.sign, "LAND", SIGN[0], 42, "t-pf-signlab");
      c.signVal = text(c.sign, "? squares", SIGN[0], 75, "t-pf-signval");
      L.set(c.sign, { svgOrigin: SIGN[0] + " " + SIGN[1] });

      // Ramesh uncle waits off to the left until the story brings him on (drawn under the land, so pieces pass over him)
      c.uncle = K.person(c.world, L, { x: 74, y: 420, look: "uncle" });

      // field 1: whole to begin with; cut into two pieces later
      c.gF1 = add(c.world, "g");
      c.gPieces = add(c.gF1, "g");
      c.whole = field(c, c.gPieces, WONKY, U);
      c.ghost = add(c.gPieces, "polygon", { "class": "t-pf-ghost" }); c.ghost.style.opacity = 0;

      // the broken bits of squares along the slanted edges
      c.gBroken = add(c.gF1, "g", { "class": "t-pf-broken" }); c.gBroken.style.opacity = 0;
      c.bits = []; c.badges = [];
      brokenBits(WONKY).forEach(function (b) {
        c.bits.push(add(c.gBroken, "polygon", { points: px(b.poly), "class": "t-pf-brokenbit", fill: "url(#" + c.hatchId + ")" }));
      });
      brokenBits(WONKY).forEach(function (b) {
        if (b.area < 0.5) return;
        var bx = b.x * U, by = b.y * U, g = add(c.gBroken, "g", { "class": "t-pf-badge" });
        add(g, "circle", { cx: bx, cy: by, r: 14 });
        text(g, "?", bx, by + 1, "t-pf-badgeq");
        L.set(g, { scale: 0, svgOrigin: bx + " " + by });
        c.badges.push(g);
      });

      c.gCells = add(c.gF1, "g", { "class": "t-pf-cells" });
      c.gMarks = add(c.gF1, "g", { "class": "t-pf-marks" });
      c.outline = add(c.gMarks, "rect", { rx: 3, "class": "t-pf-outline" }); c.outline.style.opacity = 0;
      var seamD = "M" + 6 * U + " " + 4 * U + "L" + 8 * U + " 0";
      c.seam = add(c.gMarks, "g"); c.seam.style.opacity = 0;
      c.seamLines = [add(c.seam, "path", { d: seamD, "class": "t-pf-seam-halo" }), add(c.seam, "path", { d: seamD, "class": "t-pf-seam-core" })];
      c.matchR = add(c.gMarks, "path", { d: seamD, "class": "t-pf-match" });
      c.bBottom = add(c.gMarks, "path", { "class": "t-pf-bracket" }); c.bBottom.style.opacity = 0;
      c.bLeft = add(c.gMarks, "path", { "class": "t-pf-bracket" }); c.bLeft.style.opacity = 0;
      c.l6 = text(c.gMarks, "6", 0, 0, "t-pf-dim"); c.l6.style.opacity = 0;
      c.l4 = text(c.gMarks, "4", 0, 0, "t-pf-dim"); c.l4.style.opacity = 0;

      // the knife and its helpers (field-1 coordinates, so they travel with the field)
      c.gFx = add(c.gF1, "g", { "class": "t-pf-fx" });
      c.guide = add(c.gFx, "line", { x1: 0, y1: -24, x2: 0, y2: 4 * U + 24, "class": "t-pf-guide" }); c.guide.style.opacity = 0;
      c.knife = add(c.gFx, "line", { "class": "t-pf-knife" }); c.knife.style.opacity = 0;
      c.blade = add(c.gFx, "g"); c.blade.style.opacity = 0;
      add(c.blade, "line", { x1: 0, y1: -56, x2: 0, y2: 0, "class": "t-pf-blade-halo" });
      add(c.blade, "line", { x1: 0, y1: -56, x2: 0, y2: 0, "class": "t-pf-blade-core" });
      c.hintLine = add(c.gFx, "line", { "class": "t-pf-hintline" }); c.hintLine.style.opacity = 0;
      c.finger = add(c.gFx, "g", { "class": "t-pf-finger" }); c.finger.style.opacity = 0;
      add(c.finger, "rect", { x: -7, y: -80, width: 14, height: 80, rx: 7, fill: "url(#" + c.tailId + ")" });
      add(c.finger, "circle", { r: 17, "class": "t-pf-finger-pad" });
      add(c.finger, "circle", { r: 5, "class": "t-pf-finger-dot" });
      c.cutHit = add(c.gFx, "rect", { x: -12, y: -30, width: 8 * U + 24, height: 4 * U + 60, "class": "t-pf-cuthit",
        role: "slider", "aria-valuemin": 2, "aria-valuemax": 6, "aria-label": "Where to cut the field. Use the left and right arrow keys, then press Enter to cut." });
      c.cutHit.style.display = "none";
      place1(c);

      // field 2 (hidden until its scene)
      c.f2x = W / 2 - 4 * U;
      c.gF2 = add(c.world, "g", { transform: "translate(" + c.f2x + " 160)" });
      c.gF2.style.display = "none";
      c.rg2 = add(c.gF2, "rect", { x: 0, y: 0, width: 6 * U, height: 3 * U, "class": "t-pf-rectghost" });
      c.f2 = field(c, c.gF2, lean2(2), U, { pad: 4 });
      c.gOver2 = add(c.gF2, "g", { "class": "t-pf-over" });                   // the bit that sticks out, and the gap it would fill
      c.gap = add(c.gOver2, "polygon", { "class": "t-pf-gap" });
      c.extra = add(c.gOver2, "polygon", { "class": "t-pf-extra" });
      c.gW2 = add(c.gF2, "g");                                                // the cut-off bit lives here while it travels
      c.gLab2 = add(c.gF2, "g", { "class": "t-pf-labs" });                    // the live measurements
      c.hLine = add(c.gLab2, "line", { y1: 0, y2: 3 * U, "class": "t-pf-height" });
      c.hMark = add(c.gLab2, "path", { "class": "t-pf-mark" });
      c.hLab = text(c.gLab2, "height 3", 0, 1.5 * U, "t-pf-lab t-pf-end");
      c.sLab = text(c.gLab2, "", 0, 0, "t-pf-lab t-pf-start");
      c.base2 = text(c.gF2, "base 6", 3 * U, 3 * U + 40);
      L.set([c.rg2, c.gOver2, c.gLab2, c.base2], { opacity: 0 });             // they fade in once the field has landed
      // helpers for the "here's why" and measuring steps (field-2 coordinates)
      c.gFx2 = add(c.gF2, "g", { "class": "t-pf-fx" });
      c.guide2 = add(c.gFx2, "line", { x1: 0, y1: -24, x2: 0, y2: 3 * U + 24, "class": "t-pf-guide" }); c.guide2.style.opacity = 0;
      c.tagOut = tag(c.gFx2, "sticks out"); c.tagGap = tag(c.gFx2, "gap");
      L.set([c.tagOut.inner, c.tagGap.inner], { opacity: 0, scale: 0.5, svgOrigin: "0 0" });
      c.seam2 = add(c.gFx2, "g"); c.seam2.style.opacity = 0;
      c.seamLines2 = [add(c.seam2, "path", { "class": "t-pf-seam-halo" }), add(c.seam2, "path", { "class": "t-pf-seam-core" })];
      c.blade2 = add(c.gFx2, "g"); c.blade2.style.opacity = 0;
      add(c.blade2, "line", { x1: 0, y1: -56, x2: 0, y2: 0, "class": "t-pf-blade-halo" });
      add(c.blade2, "line", { x1: 0, y1: -56, x2: 0, y2: 0, "class": "t-pf-blade-core" });
      c.outline2 = add(c.gFx2, "rect", { x: 0, y: 0, width: 6 * U, height: 3 * U, rx: 3, "class": "t-pf-outline" }); c.outline2.style.opacity = 0;
      c.bBottom2 = add(c.gFx2, "path", { "class": "t-pf-bracket" }); c.bBottom2.style.opacity = 0;
      c.bLeft2 = add(c.gFx2, "path", { "class": "t-pf-bracket" }); c.bLeft2.style.opacity = 0;
      c.l6b = text(c.gFx2, "6", 0, 0, "t-pf-dim"); c.l6b.style.opacity = 0;
      c.l3b = text(c.gFx2, "3", 0, 0, "t-pf-dim"); c.l3b.style.opacity = 0;
      // the gold handle: a knob with arrows on it, a soft shadow, and a ring that pulses until it is used
      c.handle = add(c.gF2, "g", { "class": "t-pf-handleg" });
      add(c.handle, "ellipse", { cx: 3, cy: 9, rx: 19, ry: 12, "class": "t-pf-handle-shadow", filter: "url(#" + c.blurSmallId + ")" });
      add(c.handle, "circle", { r: 28, "class": "t-pf-handle-ring" });
      c.knob = add(c.handle, "circle", { r: 17, "class": "t-pf-handle" });
      c.chev = add(c.handle, "path", { d: "M-5.5 -6L-11 0L-5.5 6M5.5 -6L11 0L5.5 6", "class": "t-pf-chev" });
      c.handleHit = add(c.handle, "circle", { r: 48, "class": "t-pf-hit", tabindex: "-1", role: "slider", "aria-label": "Lean the field. Use the left and right arrow keys." });   // generous, for fingers
      L.set(c.handle, { x: 5 * U, y: 0, opacity: 0 });
      L.set([c.knob, c.chev], { scale: 0, svgOrigin: "0 0" });
      c.finger2 = add(c.gF2, "g", { "class": "t-pf-finger2" });
      add(c.finger2, "circle", { r: 25, "class": "t-pf-finger-ring" });
      add(c.finger2, "circle", { r: 5, "class": "t-pf-finger-dot" });
      L.set(c.finger2, { opacity: 0 });
      update2(c, 2);

      // field 3 (the student's own go)
      var u3 = 52;
      c.u3 = u3;
      c.gF3 = add(c.world, "g", { transform: "translate(" + ((W - 10 * u3) / 2 - 40) + " 140)" });
      c.gF3.style.display = "none";
      var g3 = c.gF3in = add(c.gF3, "g");   // animated inside the placed group, so GSAP never fights the placement
      c.f3 = field(c, g3, [[0, 4], [7, 4], [10, 0], [3, 0]], u3);
      c.f3glow = add(g3, "path", { d: "M0 " + 4 * u3 + "H" + 7 * u3 + "M" + 7 * u3 + " 0V" + 4 * u3, "class": "t-pf-glow" }); c.f3glow.style.opacity = 0;
      c.g3lab = add(g3, "g", { "class": "t-pf-labs" });   // its labels appear once it has landed
      add(c.g3lab, "line", { x1: 7 * u3, y1: 0, x2: 7 * u3, y2: 4 * u3, "class": "t-pf-height" });
      add(c.g3lab, "path", { d: "M" + (7 * u3 - 14) + " " + (4 * u3) + "v-14h14", "class": "t-pf-mark" });
      text(c.g3lab, "height 4 m", 7 * u3 - 14, 2 * u3, "t-pf-lab t-pf-end");
      text(c.g3lab, "slanted side 5 m", (8.5 + 0.8 * 0.55) * u3, (2 + 0.6 * 0.55) * u3, "t-pf-lab t-pf-start");
      text(c.g3lab, "base 7 m", 3.5 * u3, 4 * u3 + 40);
      L.set(c.g3lab, { opacity: 0 });
      return c;
    },

    steps: [
      /* ---- 0. the story: someone needs help ---- */
      { beat: "story", caption: "This is Ramesh uncle. Tomorrow he is planting his whole field, and seed is sold by the square.",
        run: function (c, L) { K.enter(c.uncle, L); } },

      /* ---- 1. meet the field ---- */
      { branch: function () { var p = C.data && C.data.profile; return p && p.id === "aarav" ? 0 : (p && p.id === "riya" ? 1 : 2); },
        options: [
          { caption: "Aarav, meet Ramesh uncle's field. It's a bit wonky, isn't it?", run: function (c, L) { hello(c, L); } },
          { caption: "Riya, meet Ramesh uncle's field. It's a bit wonky, isn't it?", run: function (c, L) { hello(c, L); } },
          { caption: "Meet Ramesh uncle's field. It's a bit wonky, isn't it?", run: function (c, L) { hello(c, L); } },
        ] },
      { caption: "He wants to know how much land he has. But look at these slanted edges. The squares there are all broken.",
        run: function (c, L) { showBroken(c, L); K.puzzled(c.uncle, L, true); } },
      // a guess before anything is taught: nothing is marked right or wrong here
      K.guessStep({ caption: "Before we help him, have a guess. How many squares of land do you think he has?",
        choices: [{ label: "20", value: 20 }, { label: "24", value: 24 }, { label: "28", value: 28 }, { label: "No idea yet", value: 0 }],
        guessed: R.guessed, none: R.noGuess }),
      { caption: "So here's a trick. Let's turn it into a rectangle, without losing a single bit of land.",
        run: function (c, L) { K.puzzled(c.uncle, L, false); L.to(c.gBroken, { opacity: 0, duration: 0.5 }); sheen(c, L); } },

      /* ---- 2. cut ---- */
      { beat: "hands", caption: "Swipe down across the field to cut it. Anywhere you like.",
        task: function (c, L, done) {
          var svg = L.svg, start = null, misses = 0, over = false, k = c.knife, kx = 4, hint = fingerHint(c, L), offs = [];
          svg.classList.add("is-dragging-ok", "is-cutting");
          c.cutHit.style.display = ""; c.cutHit.setAttribute("tabindex", "0"); c.cutHit.setAttribute("aria-valuenow", kx);
          function local(p) { return [p[0] - c.p1.x, p[1] - c.p1.y]; }   // stage point -> field-1 coordinates
          function slanted(a, b) { return Math.atan2(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 180 / Math.PI > 14; }
          function judge(a, b) {
            var dy = Math.abs(b[1] - a[1]) / U, top = Math.min(a[1], b[1]) / U, bot = Math.max(a[1], b[1]) / U;
            if (dy < 2.4 || top > 1.3 || bot < 2.7) return "short";
            return slanted(a, b) ? "slant" : "ok";
          }
          function at(a, b) { return Math.max(2, Math.min(6, Math.round((a[0] + b[0]) / 2 / U))); }   // the grid line the cut lands on
          function showGuide(x) { c.guide.setAttribute("x1", x * U); c.guide.setAttribute("x2", x * U); c.guide.style.opacity = 1; }
          function hideGuide() { c.guide.style.opacity = 0; }
          function stopHint() { if (hint) { L.kill(hint); hint = null; L.to([c.finger, c.hintLine], { opacity: 0, duration: 0.15, overwrite: "auto" }, true); } }
          function down(ev) {
            if (over) return;
            stopHint();
            start = local(L.point(ev));
            k.setAttribute("class", "t-pf-knife");
            line(k, start, start); L.set(k, { x: 0 }); k.style.opacity = 1;
            try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
            ev.preventDefault();
          }
          function move(ev) {
            if (!start || over) return;
            var p = local(L.point(ev)), j = judge(start, p), long = Math.hypot(p[0] - start[0], p[1] - start[1]) > U;
            line(k, start, p);
            k.setAttribute("class", "t-pf-knife" + (j === "ok" ? " is-ready" : (long && slanted(start, p) ? " is-bad" : "")));
            if (j === "ok") showGuide(at(start, p)); else hideGuide();
          }
          function up(ev) {
            if (!start || over) return;
            var a = start, b = local(L.point(ev)), j = judge(a, b);
            start = null; hideGuide();
            if (j === "ok") { finish(at(a, b)); return; }
            line(k, a, b);
            k.setAttribute("class", "t-pf-knife" + (j === "slant" ? " is-bad" : ""));
            miss(j === "slant" ? R.cutSlant.caption : R.cutShort.caption);
          }
          function cancel() { if (!start) return; start = null; hideGuide(); L.to(k, { opacity: 0, duration: 0.2 }, true); }
          function miss(said) {
            misses++; L.sfx("oops");
            wiggle(k, L, "x", 6);
            L.to(k, { opacity: 0, duration: 0.5, delay: 0.5 }, true);
            L.say(said);
            if (misses === 2) L.controls([h("button", { type: "button", class: "btn btn-ghost", on: { click: function () { finish(4); } } }, "Cut it for me")]);
          }
          function finish(x) {
            if (over) return; over = true;
            L.clearBar(); stopHint(); hideGuide();
            offs.forEach(function (off) { off(); });
            svg.classList.remove("is-dragging-ok", "is-cutting");
            c.cutHit.removeAttribute("tabindex"); c.cutHit.style.display = "none";
            doCut(c, L, x, function () { L.say(R.cutGood.caption, function () { done(x); }); });
          }
          offs.push(L.listen(svg, "pointerdown", down), L.listen(svg, "pointermove", move), L.listen(svg, "pointerup", up), L.listen(svg, "pointercancel", cancel));
          // keyboard: Tab to the field, choose the line with the arrow keys, Enter to cut
          L.listen(c.cutHit, "focus", function () { if (!over) { stopHint(); showGuide(kx); } });
          L.listen(c.cutHit, "blur", function () { if (!over) hideGuide(); });
          L.listen(c.cutHit, "keydown", function (ev) {
            if (over) return;
            if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
              ev.preventDefault();
              kx = Math.max(2, Math.min(6, kx + (ev.key === "ArrowLeft" ? -1 : 1)));
              c.cutHit.setAttribute("aria-valuenow", kx); showGuide(kx); L.sfx("tick", kx * 2);
            } else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); finish(kx); }
          });
        } },

      /* ---- 3. slide ---- */
      { caption: "Now drag the left piece. Where can it go to make a rectangle?",
        task: function (c, L, done) {
          var p = c.pL, g = p.g, x = c.cutX, tx = 6 * U, home = -16, misses = 0, won = false, hinted = false, hot = false;
          var bob = null, pulse = null, offTilt = null, lastX = 0;
          var lim = { minX: 8 - c.p1.x, maxX: W - 8 - c.p1.x - x * U, minY: 24 - c.p1.y, maxY: H - 8 - c.p1.y - 4 * U - SLAB[1] };
          g.classList.add("is-movable"); L.svg.classList.add("is-dragging-ok");   // on a touch screen, a drag here must not scroll the page
          g.setAttribute("tabindex", "0"); g.setAttribute("role", "button");
          g.setAttribute("aria-label", "The piece you cut off. Drag it, or move it with the arrow keys.");
          L.set(p.lift, { svgOrigin: p.centre[0] + " " + p.centre[1] });
          if (!L.reduced) bob = L.to(p.lift, { y: -6, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" }, true);   // "pick me up"
          function stopBob() { if (bob) { L.kill(bob); bob = null; } }
          function glow(gx, gy) {   // the slot shows more strongly as the piece gets close
            var dd = Math.hypot(gx - tx, gy);
            c.ghost.style.opacity = dd < 2.8 * U ? Math.min(1, Math.max(0.12, 1.3 - dd / (2.4 * U))) : 0;
            var nowHot = dd < 2;
            if (nowHot && !hot) L.sfx("pop");
            hot = nowHot; c.ghost.classList.toggle("is-hot", hot);
          }
          var d = L.draggable(g, {
            type: "x,y", bounds: lim,
            liveSnap: { points: [{ x: tx, y: 0 }], radius: 0.75 * U },   // a gentle magnet near the slot
            onPress: function () {
              if (won) return;
              stopBob(); L.sfx("pickup"); liftUp(p, L);
              lastX = this.x;
              if (window.gsap && !L.reduced) {
                var tilt = window.gsap.quickTo(p.lift, "rotation", { duration: 0.3, ease: "power3.out" });
                offTilt = L.ticker(function () { if (!d) return; var vx = d.x - lastX; lastX = d.x; tilt(Math.max(-10, Math.min(10, vx * 0.9))); });
              }
            },
            onDrag: function () { glow(this.x, this.y); },
            onRelease: function () {
              if (offTilt) { offTilt(); offTilt = null; }
              if (won) return;
              if (Math.hypot(this.x - tx, this.y) < 1.6 * U) { snap(); return; }
              setDown(p, L);
              c.ghost.style.opacity = 0; c.ghost.classList.remove("is-hot"); hot = false;
              if (Math.hypot(this.x - home, this.y) < 24) return;   // a tap, not a move
              misses++; L.sfx("oops");
              L.to(g, { x: home, y: 0, duration: 0.8, ease: "elastic.out(1, 0.55)" }, true);
              wiggle(p.lift, L, "rotation", 5);
              if (misses === 1) L.say(R.dropWrong.caption); else hint();
            },
          });
          function snap() {
            if (won) return; won = true;
            stopBob(); if (offTilt) { offTilt(); offTilt = null; }
            if (d) d.disable();
            if (pulse) { L.kill(pulse); pulse = null; }
            g.classList.remove("is-movable"); L.svg.classList.remove("is-dragging-ok"); ["tabindex", "role", "aria-label"].forEach(function (a) { g.removeAttribute(a); });
            L.clearBar();
            c.ghost.classList.add("is-hot");
            L.to(g, { x: tx, y: 0, duration: 0.18, ease: "power3.out", overwrite: "auto" }, true);
            setDown(p, L);
            L.wait(170, function () {
              L.sfx("snap"); shake(c, L, 2);
              L.to(c.ghost, { opacity: 0, duration: 0.25, overwrite: "auto" }, true);
              seamFlash(c, L);
              L.say(R.dropGood.caption, function () { done("fit"); });
            });
          }
          function hint() {
            if (hinted || won) return; hinted = true;
            L.say(R.dropHint.caption);
            pulse = L.to(c.ghost, { opacity: 0.9, duration: 0.5, repeat: 5, yoyo: true }, true);
            L.to([c.matchL, c.matchR], { opacity: 1, duration: 0.45, repeat: 5, yoyo: true, ease: "sine.inOut" }, true);
            L.controls([h("button", { type: "button", class: "btn btn-ghost", on: { click: auto } }, "Move it for me")]);
          }
          function auto() {
            if (won) return;
            stopBob(); L.clearBar(); liftUp(p, L);
            if (d) d.disable();
            L.to(g, { x: tx, y: 0, duration: 1.0, ease: "power2.inOut", overwrite: "auto", onUpdate: function () { glow(window.gsap.getProperty(g, "x"), window.gsap.getProperty(g, "y")); }, onComplete: snap }, true);
          }
          // keyboard: Tab to the piece, arrow keys move it a square at a time
          L.listen(g, "keydown", function (ev) {
            if (won || !window.gsap) return;
            var dx = ev.key === "ArrowRight" ? U : ev.key === "ArrowLeft" ? -U : 0, dy = ev.key === "ArrowDown" ? U / 2 : ev.key === "ArrowUp" ? -U / 2 : 0;
            if (!dx && !dy) return;
            ev.preventDefault(); stopBob();
            var gx = Math.max(lim.minX, Math.min(lim.maxX, window.gsap.getProperty(g, "x") + dx));
            var gy = Math.max(lim.minY, Math.min(lim.maxY, window.gsap.getProperty(g, "y") + dy));
            L.sfx("tick", Math.round(gx / U) + 4);
            L.to(g, { x: gx, y: gy, duration: 0.16, ease: "power2.out", overwrite: "auto", onComplete: function () {
              if (d) d.update(); glow(gx, gy);
              if (Math.hypot(gx - tx, gy) < 0.6 * U) snap();
            } }, true);
          });
          L.wait(16000, hint);
        } },

      /* ---- 4. count ---- */
      { caption: "Look, a rectangle! Let's count the land.",
        run: function (c, L) {
          var x = c.cutX, rel = L.hold(), T0 = 1100, DT = 105;
          L.to(c.p1, { x: (W - 6 * U) / 2 - x * U, duration: 0.8, ease: "power2.inOut", onUpdate: function () { place1(c); } });
          drawOutline(c, L, x);
          makeCells(c, x);
          c.cells.forEach(function (cell, i) {
            L.wait(T0 + i * DT, function () {
              L.to(cell, { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(2.4)" }, true);
              L.sfx("tick", i); setSign(c, i + 1, L);
            });
          });
          L.wait(T0 + 24 * DT + 250, function () {
            L.sfx("chime"); popSign(c, L);
            L.to(c.cells, { scale: 1.1, duration: 0.13, yoyo: true, repeat: 1, ease: "power1.inOut", stagger: 0.022 }, true);
            L.wait(800, rel);
          });
        } },
      { caption: "24 squares. 6 along the bottom, 4 going up. 6 × 4 is 24.",
        run: function (c, L) {
          var x = c.cutX, X0 = x * U, X1 = (x + 6) * U, yb = 4 * U + SLAB[1] + 18, xl = X0 - 24;
          L.to(c.cellNums, { opacity: 0, duration: 0.35 });
          // measuring lines: one grows along the bottom, one up the side
          c.bBottom.setAttribute("d", "M" + X0 + " " + (yb - 9) + "V" + (yb + 9) + "M" + X0 + " " + yb + "H" + X1 + "M" + X1 + " " + (yb - 9) + "V" + (yb + 9));
          c.bLeft.setAttribute("d", "M" + (xl - 9) + " " + 4 * U + "H" + (xl + 9) + "M" + xl + " " + 4 * U + "V0M" + (xl - 9) + " 0H" + (xl + 9));
          c.l6.setAttribute("x", (X0 + X1) / 2); c.l6.setAttribute("y", yb + 26);
          c.l4.setAttribute("x", xl - 28); c.l4.setAttribute("y", 2 * U);
          L.set(c.bBottom, { opacity: 1, scaleX: 0, svgOrigin: X0 + " " + yb });
          L.set(c.bLeft, { opacity: 1, scaleY: 0, svgOrigin: xl + " " + 4 * U });
          L.set(c.l6, { opacity: 0, scale: 0.4, svgOrigin: (X0 + X1) / 2 + " " + (yb + 26) });
          L.set(c.l4, { opacity: 0, scale: 0.4, svgOrigin: (xl - 28) + " " + 2 * U });
          L.to(c.bBottom, { scaleX: 1, duration: 0.7, delay: 0.45, ease: "power2.inOut" });
          L.to(c.cells.slice(0, 6), { scale: 1.12, duration: 0.15, yoyo: true, repeat: 1, stagger: 0.1, delay: 0.45 });
          L.to(c.l6, { opacity: 1, scale: 1, duration: 0.4, delay: 1.15, ease: "back.out(3)" });
          L.to(c.bLeft, { scaleY: 1, duration: 0.6, delay: 2.0, ease: "power2.inOut" });
          L.to([c.cells[0], c.cells[6], c.cells[12], c.cells[18]], { scale: 1.12, duration: 0.15, yoyo: true, repeat: 1, stagger: 0.14, delay: 2.0 });
          L.to(c.l4, { opacity: 1, scale: 1, duration: 0.4, delay: 2.6, ease: "back.out(3)" });
          L.wait(3200, function () { L.board("6 × 4 = <b>24</b>"); });
        } },
      { caption: "And we didn't lose any land. So the wonky field had 24 squares too.",
        run: function (c, L) {
          var p = c.pL;
          L.to([c.gCells, c.bBottom, c.bLeft, c.l6, c.l4, c.outline], { opacity: 0, duration: 0.4 });
          L.wait(350, function () { L.sfx("whoosh"); liftUp(p, L, 0.25); });
          L.to(p.g, { x: 0, duration: 1.0, delay: 0.45, ease: "power2.inOut" });
          L.to(p.g, { keyframes: [{ y: -44, duration: 0.5, ease: "power1.out" }, { y: 0, duration: 0.5, ease: "power1.in" }], delay: 0.45 });
          L.to(c.p1, { x: (W - 8 * U) / 2, duration: 1.0, delay: 0.45, ease: "power2.inOut", onUpdate: function () { place1(c); } });
          L.wait(1450, function () { setDown(p, L); L.sfx("snap"); popSign(c, L); L.board("wonky field = <b>24</b> squares"); });
        } },

      /* ---- 4b. tell Ramesh uncle: the answer, then how you knew ---- */
      K.tellStep({ who: function (c) { return c.uncle; }, skill: "a2", qid: "pf-tell",
        caption: "Ramesh uncle is waiting. Tell him how many squares of land he has.",
        prompt: "Tell Ramesh uncle. Squares of land:", answer: 24, other: R.tellWrong,
        thanks: ["24 squares!", "Thank you!"], same: R.tellRightGuess, close: R.tellRightOther, plain: R.tellRight }),
      K.howStep({ who: function (c) { return c.uncle; }, skill: "a2", qid: "pf-how", leave: true,
        caption: "He has one more question. How did you know, without counting every broken square?",
        prompt: "Tell him how:", bubble: ["How did", "you know?"],
        choices: [
          { label: "We measured the slanted edge", value: "slant", mixup: "slant",
            caption: "Not the slanted edge. We cut the field and made a rectangle, 6 along and 4 up. Off he goes to buy his seed." },
          { label: "We made a rectangle: 6 along, 4 up", value: "rect", correct: true,
            caption: "Exactly. Same land, tidier shape. Off he goes to buy his seed." },
          { label: "We added up all the sides", value: "perim", mixup: "perim",
            caption: "Adding the sides gives the fence, not the land. We made a rectangle, 6 along and 4 up. Off he goes to buy his seed." },
        ] }),

      /* ---- 5. lean ---- */
      { beat: "rule", caption: "Here's another field. Grab the gold handle and lean it. Keep your eye on the land.",
        run: function (c, L) {
          L.board("");
          L.to(c.gF1, { opacity: 0, duration: 0.4, onComplete: function () { c.gF1.style.display = "none"; } });
          field2In(c, L);
        },
        task: function (c, L, done) {
          var moved = 0, last = c.l, finished = false, hit = c.handleHit, tickAt = Math.round(c.l * 2), svg = L.svg;
          c.handle.classList.add("is-live"); hit.setAttribute("tabindex", "0");
          svg.classList.add("is-dragging-ok");   // on a touch screen, a drag here must not scroll the page
          var demo = leanDemo(c, L);
          function stopDemo() {
            if (!demo) return;
            demo.forEach(function (t) { L.kill(t); }); demo = null;
            L.to(c.finger2, { opacity: 0, duration: 0.15, overwrite: "auto" }, true);
          }
          var d = L.draggable(c.handle, {
            type: "x", bounds: { minX: 1 * U, maxX: 7 * U },
            onPress: function () { stopDemo(); last = c.l; tickAt = Math.round(c.l * 2); L.sfx("pickup"); grab(c, L, true); },
            onDrag: function () {
              var l = this.x / U - 3; moved += Math.abs(l - last); last = l; update2(c, l);
              var s = Math.round(l * 2); if (s !== tickAt) { tickAt = s; L.sfx("tick", s + 6); }   // a tick every half square
            },
            onRelease: function () { grab(c, L, false); L.sfx("pop"); popSign(c, L); check(); },
          });
          L.listen(hit, "keydown", function (ev) {
            if (finished || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
            ev.preventDefault(); stopDemo();
            var l = Math.max(-2, Math.min(4, c.l + (ev.key === "ArrowLeft" ? -0.5 : 0.5)));
            moved += Math.abs(l - c.l); last = l;
            putHandle(c, L, l); if (d) d.update(); update2(c, l); L.sfx("tick", Math.round(l * 2) + 6); check();
          });
          function check() {
            if (finished || moved < 2.5) return;
            finished = true; if (d) d.disable();
            stopDemo(); svg.classList.remove("is-dragging-ok");
            c.handle.classList.remove("is-live"); hit.setAttribute("tabindex", "-1");
            L.sfx("chime"); popSign(c, L);
            L.say(R.leanDone.caption, function () { done("leaned"); });
          }
          L.wait(11000, function () { if (!finished && moved < 0.5) L.say(R.leanHint.caption); });
        } },
      { caption: "Here's why. The bit that sticks out on one side fits exactly into the gap on the other.",
        run: function (c, L) { whyMove(c, L); } },
      { caption: "So leaning doesn't change the land. Only the base and the straight-up height matter.",
        run: function (c, L) {
          c.leanLive = false;
          measure2(c, L);
          L.wait(2800, function () { L.board('<span class="t-rule">area = base × height</span><span class="t-rule-note">6 × 3 = 18 squares</span>'); });
        } },

      /* ---- 6. your turn ---- */
      { caption: "Your turn. How much land is in this field?",
        run: function (c, L) {
          L.board(""); setSign(c, null, L); popSign(c, L);
          L.to(c.gF2, { opacity: 0, duration: 0.4, onComplete: function () { c.gF2.style.display = "none"; } });
          // the new field drops in like the others; its labels follow once it has landed
          c.gF3.style.display = "";
          L.set(c.gF3in, { opacity: 0 }); L.set(c.f3.lift, { y: -46 }); L.set(c.f3.shadow, shade(HELD));
          L.wait(450, function () { L.sfx("whoosh"); });
          L.wait(800, function () { L.sfx("thud"); });
          L.to(c.gF3in, { opacity: 1, duration: 0.25, delay: 0.4 });
          L.to(c.f3.lift, { y: 0, duration: 0.9, delay: 0.4, ease: "bounce.out" });
          L.to(c.f3.shadow, Object.assign(shade(REST), { duration: 0.9, delay: 0.4, ease: "bounce.out" }));
          L.to(c.g3lab, { opacity: 1, duration: 0.4, delay: 1.3 });
        },
        task: function (c, L, done) {
          L.number("Land in square metres:", function (v) {
            if (v === 28) return true;
            var r = v === 35 ? R.n35 : v === 24 ? R.n24 : v === 11 ? R.n11 : v === 20 ? R.n20 : R.nOther;
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function () {
            var n = { v: 0 }, lastV = 0;
            L.to(n, { v: 28, duration: 1.4, ease: "none", onUpdate: function () {
              var v = Math.round(n.v); if (v !== lastV) { lastV = v; setSign(c, v, L); L.sfx("tick", v); }
            }, onComplete: function () { L.sfx("chime"); popSign(c, L); L.say(R.nRight.caption, function () { done(28); }); } }, true);
          });
        } },
      { caption: "That's the rule for every parallelogram: area = base × height.",
        run: function (c, L) {
          L.to(c.f3glow, { opacity: 1, duration: 0.5, repeat: 3, yoyo: true });
          L.board('<span class="t-rule">area = base × height</span><span class="t-rule-note">7 × 4 = 28 square metres</span>');
        } },
      { caption: "Next time, we'll try the same trick on triangles.", hold: 600 },
    ],
  });
})();
