/* Cogna.landKit — the hands-on "land" look shared by the Area lessons (tri-field, trap-field).
   Same look and feel as para-field (which keeps its own copy): land is a slab of earth with grass on top and a soft
   shadow on the ground, so a piece can be lifted, carried, spun and set down with a snap. Styles: .t-pf in css/anim.css.
   Every rotate/scale origin is given as a point (svgOrigin), never measured, because lessons are built off-screen. */
(function () {
  "use strict";
  var C = window.Cogna, S = C.svg;
  var SLAB = [4, 10], REST = [3, 8, 0.22], HELD = [12, 28, 0.3];
  var uid = 0;

  function add(p, tag, a) { var e = S(tag, a || {}); p.appendChild(e); return e; }
  function px(P, u) { return P.map(function (p) { return (p[0] * u).toFixed(1) + "," + (p[1] * u).toFixed(1); }).join(" "); }
  function text(p, str, x, y, cls) { var e = add(p, "text", { x: x, y: y, "class": cls || "t-pf-lab" }); e.textContent = str; return e; }
  function shade(s) { return { x: s[0], y: s[1], opacity: s[2] }; }
  function centroid(P) { var x = 0, y = 0; P.forEach(function (p) { x += p[0] / P.length; y += p[1] / P.length; }); return [x, y]; }
  function hull(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), lo = [], up = [], i;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  function slab(P, u, dir) {
    var d = dir || SLAB, a = P.map(function (p) { return [p[0] * u, p[1] * u]; });
    return hull(a.concat(a.map(function (p) { return [p[0] + d[0], p[1] + d[1]]; })))
      .map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
  }

  /** Shared <defs>: blur filters, a hatch for broken squares, a sheen and a finger tail. Returns c with ids filled in. */
  function setup(svg, L) {
    var key = Math.random().toString(36).slice(2, 7), c = { L: L, key: key };
    c.defs = add(svg, "defs");
    c.blurId = "lk-blur-" + key; c.blurSmallId = "lk-blur2-" + key; c.hatchId = "lk-hatch-" + key; c.tailId = "lk-tail-" + key; c.sheenId = "lk-sheen-" + key;
    add(add(c.defs, "filter", { id: c.blurId, x: "-30%", y: "-30%", width: "160%", height: "160%" }), "feGaussianBlur", { stdDeviation: 6 });
    add(add(c.defs, "filter", { id: c.blurSmallId, filterUnits: "userSpaceOnUse", x: -50, y: -50, width: 100, height: 100 }), "feGaussianBlur", { stdDeviation: 4 });
    add(add(c.defs, "pattern", { id: c.hatchId, width: 10, height: 10, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }), "rect", { width: 4, height: 10, "class": "t-pf-hatch" });
    var tg = add(c.defs, "linearGradient", { id: c.tailId, x1: 0, y1: 0, x2: 0, y2: 1 });
    add(tg, "stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0 });
    add(tg, "stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0.9 });
    var sg = add(c.defs, "linearGradient", { id: c.sheenId, x1: 0, y1: 0, x2: 1, y2: 0 });
    add(sg, "stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0 });
    add(sg, "stop", { offset: 0.5, "stop-color": "#fff", "stop-opacity": 0.55 });
    add(sg, "stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 });
    c.world = add(svg, "g");
    return c;
  }

  /** A patch of land of shape P (square units, scale u). opt.cls adds a class (e.g. "is-copy" for the lighter twin).
      Returns { g, lift, shadow, soil, inner, edge, centre, set(P2), setSoil(dir) }. */
  function field(c, parent, P, u, opt) {
    opt = opt || {};
    var id = "lk-clip-" + (++uid) + "-" + c.key;
    var g = add(parent, "g", { "class": "t-pf-piece " + (opt.cls || "") });
    var shadow = add(g, "polygon", { points: px(P, u), "class": "t-pf-shadow", filter: "url(#" + c.blurId + ")" });
    var lift = add(g, "g", { "class": "t-pf-lift" });
    var soil = add(lift, "polygon", { points: slab(P, u), "class": "t-pf-soil" });
    var cp = add(c.defs, "clipPath", { id: id });
    var clipPoly = add(cp, "polygon", { points: px(P, u) });
    var inner = add(lift, "g", { "clip-path": "url(#" + id + ")" });
    var grass = add(inner, "polygon", { points: px(P, u), "class": "t-pf-grass" });
    var stripes = add(inner, "path", { "class": "t-pf-stripe" });
    var grid = add(inner, "path", { "class": "t-pf-grid" });
    var edge = add(lift, "polygon", { points: px(P, u), "class": "t-pf-edge" });
    function paintGrid(P2) {
      var xs = P2.map(function (p) { return p[0]; }), ys = P2.map(function (p) { return p[1]; }), pad = opt.pad || 0;
      var x0 = Math.floor(Math.min.apply(null, xs)) - pad, x1 = Math.ceil(Math.max.apply(null, xs)) + pad;
      var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys)), d = "", st = "", i;
      for (i = x0; i < x1; i++) if (((i % 2) + 2) % 2 === 0) st += "M" + i * u + " " + y0 * u + "h" + u + "V" + y1 * u + "h" + (-u) + "Z";
      for (i = x0; i <= x1; i++) d += "M" + i * u + " " + y0 * u + "V" + y1 * u;
      for (i = y0; i <= y1; i++) d += "M" + x0 * u + " " + i * u + "H" + x1 * u;
      stripes.setAttribute("d", st); grid.setAttribute("d", d);
    }
    paintGrid(P);
    var m = centroid(P);
    c.L.set(shadow, shade(REST));
    return {
      g: g, lift: lift, shadow: shadow, soil: soil, inner: inner, edge: edge, centre: [m[0] * u, m[1] * u],
      set: function (P2) {
        var s = px(P2, u);
        grass.setAttribute("points", s); clipPoly.setAttribute("points", s); edge.setAttribute("points", s); shadow.setAttribute("points", s);
        soil.setAttribute("points", slab(P2, u)); paintGrid(P2);
      },
      /** turned by deg about o (px): the outline, soil and shadow take the turned shape (so the soil still shows down-right
          and the shadow still falls down-right), while the grass texture turns with the piece */
      turn: function (P2, deg, o) {
        var s = px(P2, u);
        grass.setAttribute("points", s); clipPoly.setAttribute("points", s); edge.setAttribute("points", s); shadow.setAttribute("points", s);
        soil.setAttribute("points", slab(P2, u));
        var tf = deg ? "rotate(" + deg.toFixed(2) + " " + o[0].toFixed(1) + " " + o[1].toFixed(1) + ")" : "";
        stripes.setAttribute("transform", tf); grid.setAttribute("transform", tf);
      },
    };
  }

  function liftUp(p, L, dur) {
    L.set(p.lift, { svgOrigin: p.centre[0] + " " + p.centre[1] });
    L.to(p.lift, { y: -12, scale: 1.03, duration: dur || 0.18, ease: "power2.out", overwrite: "auto" }, true);
    L.to(p.shadow, Object.assign(shade(HELD), { duration: dur || 0.18, ease: "power2.out", overwrite: "auto" }), true);
  }
  function setDown(p, L) {
    L.to(p.lift, { y: 0, scale: 1, rotation: 0, duration: 0.34, ease: "back.out(2.6)", overwrite: "auto" }, true);
    L.to(p.shadow, Object.assign(shade(REST), { duration: 0.3, ease: "power2.out", overwrite: "auto" }), true);
  }
  function wiggle(e, L, prop, a) {
    if (L.reduced) return;
    var k = [-a, a * 0.8, -a * 0.45, 0].map(function (v, i) { var o = { duration: i === 3 ? 0.09 : 0.06 }; o[prop] = v; return o; });
    L.to(e, { keyframes: k, overwrite: "auto" }, true);
  }
  function shake(c, L, a) {
    if (L.reduced) return;
    L.to(c.world, { keyframes: [{ x: -a, duration: 0.04 }, { x: a * 0.7, duration: 0.05 }, { x: -a * 0.4, duration: 0.05 }, { x: 0, duration: 0.07 }], overwrite: "auto" }, true);
  }
  /** drop a piece in from above with a bounce (p: a field; grp: the group to fade in) */
  function dropIn(p, grp, L, delay) {
    var d = delay == null ? 0.35 : delay;
    L.set(grp, { opacity: 0 }); L.set(p.lift, { y: -54 }); L.set(p.shadow, shade(HELD));
    L.wait(d * 1000, function () { L.sfx("whoosh"); });
    L.wait(d * 1000 + 350, function () { L.sfx("thud"); });
    L.to(grp, { opacity: 1, duration: 0.25, delay: d });
    L.to(p.lift, { y: 0, duration: 0.95, delay: d, ease: "bounce.out" });
    L.to(p.shadow, Object.assign(shade(REST), { duration: 0.95, delay: d, ease: "bounce.out" }));
  }
  /** a little hop, to say hello */
  function hop(p, L, delay) {
    L.set(p.lift, { svgOrigin: p.centre[0] + " " + p.centre[1] });
    L.wait((delay || 0) * 1000, function () { L.sfx("pop"); });
    L.to(p.lift, { keyframes: [{ y: -18, scaleY: 1.03, duration: 0.24, ease: "power2.out" }, { y: 0, scaleY: 1, duration: 0.6, ease: "bounce.out" }], delay: delay || 0 });
    L.to(p.shadow, { keyframes: [{ x: 9, y: 26, opacity: 0.1, duration: 0.24, ease: "power2.out" }, Object.assign(shade(REST), { duration: 0.6, ease: "bounce.out" })], delay: delay || 0 });
  }

  /** a gold seam of light along a→b (stage units of the parent) */
  function seam(c, parent) {
    var g = add(parent, "g", { "class": "t-pf-fx" }); g.style.opacity = 0;
    var lines = [add(g, "path", { "class": "t-pf-seam-halo" }), add(g, "path", { "class": "t-pf-seam-core" })];
    return {
      flash: function (L, a, b) {
        var len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 2, d = "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1);
        lines.forEach(function (e) { e.setAttribute("d", d); e.style.strokeDasharray = len; e.style.strokeDashoffset = len; });
        g.style.opacity = 1;
        L.to(lines, { strokeDashoffset: 0, duration: 0.38, ease: "power2.out" }, true);
        L.sfx("sparkle");
        L.to(g, { opacity: 0, duration: 0.7, delay: 0.9 }, true);
      },
    };
  }
  /** a gold outline that draws itself round polygon P (square units) */
  function outline(parent, P, u) {
    var e = add(parent, "polygon", { points: px(P, u), "class": "t-pf-outline t-pf-fx" }); e.style.opacity = 0;
    var per = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]) * u; }
    return {
      el: e,
      draw: function (L, delay, hold) {
        e.style.strokeDasharray = per; e.style.strokeDashoffset = per; e.style.opacity = 1;
        return L.to(e, { strokeDashoffset: 0, duration: 0.9, delay: delay || 0, ease: "power2.inOut" }, !hold);
      },
      hide: function (L) { L.to(e, { opacity: 0, duration: 0.3 }, true); },
    };
  }
  /** a label in a gold-edged pill; put(x, y) places it; show/hide pop it */
  function tag(parent, str) {
    var w = str.length * 13 + 34, g = add(parent, "g", { "class": "t-pf-fx" }), inner = add(g, "g");
    add(inner, "rect", { x: -w / 2, y: -20, width: w, height: 40, rx: 20, "class": "t-pf-tagbg" });
    var t = text(inner, str, 0, 1, "t-pf-tagtxt");
    return {
      g: g, inner: inner,
      text: function (s) { t.textContent = s; },
      put: function (x, y) { g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")"); },
      init: function (L) { L.set(inner, { opacity: 0, scale: 0.5, svgOrigin: "0 0" }); },
      show: function (L, delay) { L.to(inner, { opacity: 1, scale: 1, duration: 0.4, delay: delay || 0, ease: "back.out(2.6)", onStart: function () { L.sfx("pop"); } }, true); },
      hide: function (L) { L.to(inner, { opacity: 0, scale: 0.6, duration: 0.25 }, true); },
    };
  }
  /** the LAND sign in the top-right corner */
  function sign(c, W, title) {
    var cx = W - 113, s = add(c.world, "g", { "class": "t-pf-sign" });
    add(s, "rect", { x: W - 204, y: 22, width: 182, height: 86, rx: 16, "class": "t-pf-signshadow", filter: "url(#" + c.blurId + ")" });
    add(s, "rect", { x: W - 206, y: 16, width: 186, height: 86, rx: 16, "class": "t-pf-signbox" });
    var lab = text(s, title || "LAND", cx, 42, "t-pf-signlab");
    var val = text(s, "? squares", cx, 75, "t-pf-signval");
    c.L.set(s, { svgOrigin: cx + " 59" });
    return {
      g: s,
      title: function (t) { lab.textContent = t; },
      unit: null,
      /** unit: e.g. "sq m"; once given it sticks until another is given ("" goes back to squares) */
      set: function (v, L, unit) {
        if (unit != null) this.unit = unit || null;
        var un = this.unit;
        val.textContent = v == null ? "? " + (un || "squares") : v + " " + (un || (v === 1 ? "square" : "squares"));
        if (L && !L.reduced) { L.set(val, { y: 7, opacity: 0.3 }); L.to(val, { y: 0, opacity: 1, duration: 0.2, ease: "power2.out", overwrite: "auto" }, true); }
      },
      pop: function (L) { L.to(s, { keyframes: [{ scale: 1.12, duration: 0.12, ease: "power2.out" }, { scale: 1, duration: 0.34, ease: "back.out(3)" }], overwrite: "auto" }, true); },
      /** count from a to b, one tick per square */
      count: function (L, a, b, secs, then) {
        var self = this, n = { v: a }, lastV = a;
        L.to(n, { v: b, duration: secs || 1.2, ease: "none", onUpdate: function () {
          var v = Math.round(n.v); if (v !== lastV) { lastV = v; self.set(v, L); L.sfx("tick", Math.abs(v - a)); }
        }, onComplete: function () { L.sfx("chime"); self.pop(L); if (then) then(); } }, true);
      },
    };
  }
  function tree(p, x, y, s, L) {
    var g = add(p, "g", { "class": "t-pf-tree" });
    add(g, "ellipse", { cx: x + 8 * s, cy: y + 1, rx: 34 * s, ry: 7 * s, "class": "t-pf-treeshadow" });
    add(g, "rect", { x: x - 5 * s, y: y - 36 * s, width: 10 * s, height: 37 * s, rx: 4 * s, "class": "t-pf-trunk" });
    var crown = add(g, "g");
    add(crown, "circle", { cx: x - 19 * s, cy: y - 46 * s, r: 21 * s, "class": "t-pf-crown is-back" });
    add(crown, "circle", { cx: x + 19 * s, cy: y - 48 * s, r: 22 * s, "class": "t-pf-crown is-back" });
    add(crown, "circle", { cx: x, cy: y - 64 * s, r: 28 * s, "class": "t-pf-crown" });
    add(crown, "circle", { cx: x - 9 * s, cy: y - 73 * s, r: 12 * s, "class": "t-pf-crown-hi" });
    if (L && !L.reduced) {
      L.set(crown, { rotation: -1.6, svgOrigin: x + " " + (y - 34 * s) });
      L.to(crown, { rotation: 1.6, duration: 2.3 + s, repeat: -1, yoyo: true, ease: "sine.inOut" }, true);
    }
    return g;
  }
  /** The parts of grid squares the edges of convex polygon P cut through: [{ poly, area, x, y }] */
  function brokenBits(P) {
    var G = C.lesson.G, n = P.length, cxy = centroid(P), out = [];
    var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
    function inside(a, b) {
      var s = (b[0] - a[0]) * (cxy[1] - a[1]) - (b[1] - a[1]) * (cxy[0] - a[0]) > 0 ? 1 : -1;
      return function (p) { return s * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])); };
    }
    for (var i = Math.floor(Math.min.apply(null, xs)); i < Math.ceil(Math.max.apply(null, xs)); i++) {
      for (var j = Math.floor(Math.min.apply(null, ys)); j < Math.ceil(Math.max.apply(null, ys)); j++) {
        var q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        for (var k = 0; k < n && q.length > 2; k++) q = G.clip(q, inside(P[k], P[(k + 1) % n]));
        var ar = q.length > 2 ? G.area(q) : 0;
        if (ar > 0.02 && ar < 0.98) { var m = centroid(q); out.push({ poly: q, area: ar, x: m[0], y: m[1] }); }
      }
    }
    return out;
  }
  /** hatched broken squares with "?" badges on the bigger bits; show(L) lights them up, hide(L) clears them */
  function broken(c, parent, P, u) {
    var g = add(parent, "g", { "class": "t-pf-broken" }), bits = [], badges = [];
    g.style.opacity = 0;
    var list = brokenBits(P);
    list.forEach(function (b) { bits.push(add(g, "polygon", { points: px(b.poly, u), "class": "t-pf-brokenbit", fill: "url(#" + c.hatchId + ")" })); });
    list.forEach(function (b) {
      if (b.area < 0.5) return;
      var bx = b.x * u, by = b.y * u, bg = add(g, "g", { "class": "t-pf-badge" });
      add(bg, "circle", { cx: bx, cy: by, r: 14 });
      text(bg, "?", bx, by + 1, "t-pf-badgeq");
      c.L.set(bg, { scale: 0, svgOrigin: bx + " " + by });
      badges.push(bg);
    });
    return {
      show: function (L) {
        L.to(g, { opacity: 1, duration: 0.4 });
        L.to(bits, { opacity: 0.45, duration: 0.45, repeat: 3, yoyo: true, ease: "sine.inOut", delay: 0.5 });
        badges.forEach(function (b, i) { L.to(b, { scale: 1, duration: 0.42, ease: "back.out(3)", delay: 1 + i * 0.22, onStart: function () { L.sfx("pop"); } }); });
      },
      hide: function (L) { L.to(g, { opacity: 0, duration: 0.5 }); },
    };
  }
  /** a sheen of light sweeping across a field's grass */
  function sheen(c, L, p, w, h) {
    if (L.reduced) return;
    var s = add(p.inner, "rect", { x: -0.8 * h / 3, y: -h, width: h / 2, height: h * 3, fill: "url(#" + c.sheenId + ")" });
    L.set(s, { x: -h, rotation: 20, svgOrigin: "0 " + h / 2 });
    L.wait(300, function () { L.sfx("whoosh"); });
    L.to(s, { x: w + h, duration: 1.05, delay: 0.3, ease: "power1.inOut", onComplete: function () { if (s.parentNode) s.parentNode.removeChild(s); } }, true);
  }
  /** a ghost fingertip (for "do this" demos) */
  function finger(c, parent) {
    var g = add(parent, "g", { "class": "t-pf-finger2" });
    add(g, "circle", { r: 25, "class": "t-pf-finger-ring" });
    add(g, "circle", { r: 5, "class": "t-pf-finger-dot" });
    c.L.set(g, { opacity: 0 });
    return g;
  }
  /** a gold knob with a soft shadow and a pulsing ring; icon: "spin" (curved arrow) or "slide" (left/right chevrons) */
  function knob(c, parent, icon) {
    var g = add(parent, "g", { "class": "t-pf-handleg" });
    add(g, "ellipse", { cx: 3, cy: 9, rx: 19, ry: 12, "class": "t-pf-handle-shadow", filter: "url(#" + c.blurSmallId + ")" });
    add(g, "circle", { r: 28, "class": "t-pf-handle-ring" });
    var body = add(g, "g");
    add(body, "circle", { r: 18, "class": "t-pf-handle" });
    if (icon === "spin") {
      add(body, "path", { d: "M-8 3A8.5 8.5 0 1 0 -3.2 -7.8", "class": "t-pf-chev" });
      add(body, "path", { d: "M-8.6 -10.4L-2.6 -7.9L-5.6 -2.4", "class": "t-pf-chev" });
    } else {
      add(body, "path", { d: "M-5.5 -6L-11 0L-5.5 6M5.5 -6L11 0L5.5 6", "class": "t-pf-chev" });
    }
    var hit = add(g, "circle", { r: 40, "class": "t-pf-hit", tabindex: "-1" });
    c.L.set(body, { scale: 0, svgOrigin: "0 0" });
    return {
      g: g, body: body, hit: hit,
      show: function (L, delay) { L.to(body, { scale: 1, duration: 0.45, delay: delay || 0, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } }, true); },
      live: function (on) { g.classList.toggle("is-live", on); hit.setAttribute("tabindex", on ? "0" : "-1"); },
      held: function (L, on) { g.classList.toggle("is-held", on); L.to(body, { scale: on ? 1.18 : 1, duration: 0.14, ease: "power2.out", overwrite: "auto" }, true); },
    };
  }

  C.landKit = {
    SLAB: SLAB, REST: REST, HELD: HELD,
    add: add, px: px, text: text, shade: shade, centroid: centroid,
    setup: setup, field: field, liftUp: liftUp, setDown: setDown, wiggle: wiggle, shake: shake, dropIn: dropIn, hop: hop,
    seam: seam, outline: outline, tag: tag, sign: sign, tree: tree, broken: broken, sheen: sheen, finger: finger, knob: knob,
  };
})();
