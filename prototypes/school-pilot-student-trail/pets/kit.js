/* Cogna pets — the shared kit every pet is built on.
   A stage (SVG with soft shadows and filters), actors moved by plain state objects (so GSAP tweens
   them predictably), speech bubbles and chips over the stage, dragging in stage coordinates,
   sounds that only play once the student has touched that card, and a self-playing demo that
   pauses while the student plays and comes back after they stop.
   Pets register with Cogna.petKit.register(id, meta, mount); mount(parts) -> { destroy }. */
(function () {
  "use strict";
  var C = window.Cogna, S = C.svg, h = C.h;
  C.pets = C.pets || {};
  var order = [];
  var seq = 0;
  function uid(p) { seq += 1; return (p || "pk") + "-" + seq; }
  function pts(list) { return list.map(function (p) { return (+p[0]).toFixed(1) + "," + (+p[1]).toFixed(1); }).join(" "); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var soundOn = true;
  try { soundOn = window.localStorage.getItem("cogna-pets-sound") !== "off"; } catch (e) { /* ignore */ }

  /** An SVG group moved by a plain state object {x, y, rot, sx, sy, o}. */
  function actor(g, s) {
    var a = { g: g, s: Object.assign({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, o: 1 }, s || {}) };
    a.render = function () {
      var q = a.s;
      g.setAttribute("transform", "translate(" + q.x.toFixed(2) + " " + q.y.toFixed(2) + ") rotate(" + q.rot.toFixed(2) + ") scale(" + q.sx.toFixed(3) + " " + q.sy.toFixed(3) + ")");
      g.style.opacity = q.o >= 0.999 ? "" : String(q.o);
    };
    a.set = function (p) { Object.assign(a.s, p); a.render(); return a; };
    /** props for a timeline step on this actor: tl.to(a.s, a.tw({x: 10, duration: 1})) */
    a.tw = function (p) { var o = Object.assign({}, p), u = o.onUpdate; o.onUpdate = function () { a.render(); if (u) u(); }; return o; };
    a.to = function (p) { return gsap.to(a.s, a.tw(p)); };
    a.render();
    return a;
  }

  function stage(host, o) {
    o = o || {};
    var W = o.w || 420, H = o.h || 260;
    var wrap = h("div", { class: "pk-stage", tabindex: "0", role: "group", "aria-label": o.label || "" });
    var svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "pk-svg", "aria-hidden": "true" });
    var defs = S("defs");
    svg.appendChild(defs);
    var ids = { lift: uid("lift"), soft: uid("soft"), glow: uid("glow") };
    defs.appendChild(S("filter", { id: ids.lift, x: "-50%", y: "-50%", width: "200%", height: "210%" },
      S("feDropShadow", { dx: 0, dy: 6, stdDeviation: 4, "flood-color": "#16241d", "flood-opacity": 0.28 })));
    defs.appendChild(S("filter", { id: ids.soft, x: "-60%", y: "-300%", width: "220%", height: "700%" }, S("feGaussianBlur", { stdDeviation: 3 })));
    defs.appendChild(S("filter", { id: ids.glow, x: "-200%", y: "-200%", width: "500%", height: "500%" }, S("feGaussianBlur", { stdDeviation: 7 })));
    var back = S("g"), mid = S("g"), front = S("g");
    svg.appendChild(back); svg.appendChild(mid); svg.appendChild(front);
    wrap.appendChild(svg);
    host.appendChild(wrap);

    var bubble = h("div", { class: "pk-bubble", hidden: true, role: "status", "aria-live": "polite" });
    wrap.appendChild(bubble);
    var chips = {}, timers = [], demo = null, build = null, reset = null, interacting = false, resumeT = null, visible = false, activeUntil = 0;

    var st = {
      W: W, H: H, svg: svg, defs: defs, wrap: wrap, back: back, mid: mid, front: front,
      lift: "url(#" + ids.lift + ")", soft: "url(#" + ids.soft + ")", glow: "url(#" + ids.glow + ")",
    };

    function gradient(kind, stops, attrs) {
      var id = uid("g");
      var g = S(kind === "radial" ? "radialGradient" : "linearGradient", Object.assign({ id: id }, attrs || {}));
      stops.forEach(function (s) { g.appendChild(S("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] === undefined ? 1 : s[2] })); });
      defs.appendChild(g);
      return "url(#" + id + ")";
    }
    /** radial([[0,'#fff'],[1,'#000']], {cx:'35%', cy:'30%', r:'75%'}) -> 'url(#…)' */
    st.radial = function (stops, a) { return gradient("radial", stops, Object.assign({ cx: "38%", cy: "32%", r: "75%" }, a || {})); };
    st.linear = function (stops, a) { return gradient("linear", stops, Object.assign({ x1: 0, y1: 0, x2: 0, y2: 1 }, a || {})); };

    function placeAt(el, x, y) { el.style.left = (x / W * 100).toFixed(2) + "%"; el.style.top = (y / H * 100).toFixed(2) + "%"; }
    /** keep a centred overlay inside the stage */
    function keepInside(el, x) {
      var ww = wrap.clientWidth, bw = el.offsetWidth;
      if (!ww || !bw) return;
      var cx = Math.max(bw / 2 + 6, Math.min(ww - bw / 2 - 6, x / W * ww));
      el.style.left = cx + "px";
    }
    /** A speech bubble pointing at (x, y) in stage units. tone: 'good' | 'warn' | '' */
    st.say = function (text, x, y, tone) {
      if (!text) { bubble.hidden = true; return; }
      bubble.textContent = text;
      bubble.className = "pk-bubble" + (tone ? " is-" + tone : "");
      placeAt(bubble, x, y);
      bubble.hidden = false;
      keepInside(bubble, x);
      bubble.style.animation = "none"; void bubble.offsetWidth; bubble.style.animation = "";
    };
    st.hush = function () { bubble.hidden = true; };
    /** A small label at (x, y). text null hides it. tone: 'good' | 'warn' | 'gold' */
    st.chip = function (key, text, x, y, tone) {
      var c = chips[key];
      if (!c) { c = chips[key] = h("span", { class: "pk-chip", hidden: true }); wrap.appendChild(c); }
      if (text === null || text === undefined) { c.hidden = true; return c; }
      c.textContent = text;
      c.className = "pk-chip" + (tone ? " is-" + tone : "");
      if (x !== undefined) placeAt(c, x, y);
      c.hidden = false;
      if (x !== undefined) keepInside(c, x);
      return c;
    };
    st.clearChips = function () { Object.keys(chips).forEach(function (k) { chips[k].hidden = true; }); };
    st.toSvg = function (e) {
      var m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
      var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      var q = p.matrixTransform(m.inverse());
      return { x: q.x, y: q.y };
    };
    st.after = function (ms, fn) { var t = setTimeout(fn, ms); timers.push(t); return t; };
    /** Sounds play only after the student has touched this card, never from a demo on its own. */
    st.sfx = function (name, arg) {
      if (!soundOn || Date.now() > activeUntil) return;
      try { if (C.sfx && C.sfx[name]) C.sfx[name](arg); } catch (e) { /* sound is optional */ }
    };
    st.wake = function () { activeUntil = Date.now() + 30000; };

    /* the self-playing demo: build() returns a gsap timeline; reset() puts the scene back */
    function maybePlay() {
      if (!build || interacting || !visible) return;
      if (demo) { demo.play(); return; }
      if (reset) reset();
      demo = build();
      demo.eventCallback("onComplete", function () { demo = null; st.after(300, maybePlay); });
    }
    st.setDemo = function (b, r) { build = b; reset = r; maybePlay(); };
    /** Call on every student action: stops the demo, and brings it back after a quiet spell. */
    st.interact = function () {
      st.wake();
      if (!interacting) {
        interacting = true;
        if (demo) { demo.kill(); demo = null; }
        st.hush(); st.clearChips();
        if (reset) reset();
      }
      clearTimeout(resumeT);
      resumeT = st.after(16000, function () { interacting = false; maybePlay(); });
    };
    st.isInteracting = function () { return interacting; };

    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { visible = en.isIntersecting; if (visible) maybePlay(); else if (demo) demo.pause(); });
    }, { threshold: 0.25 });
    io.observe(wrap);

    /** Drag on an element: fns.start/move/end receive points in stage units. */
    st.drag = function (el, fns) {
      el.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        st.interact();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (fns.start) fns.start(st.toSvg(e), e);
        function mv(ev) { st.interact(); if (fns.move) fns.move(st.toSvg(ev), ev); }
        function up(ev) {
          el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
          if (fns.end) fns.end(st.toSvg(ev), ev);
        }
        el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
      });
    };
    st.tap = function (el, fn) { el.style.cursor = "pointer"; el.addEventListener("click", function (e) { st.interact(); fn(e); }); };
    st.keys = function (fn) { wrap.addEventListener("keydown", function (e) { if (fn(e) === true) { e.preventDefault(); st.interact(); } }); };

    st.destroy = function () {
      io.disconnect(); timers.forEach(clearTimeout); clearTimeout(resumeT);
      if (demo) demo.kill();
      wrap.remove();
    };
    return st;
  }

  /* ---------- small art helpers ---------- */
  function grid(g, x, y, w, hh, cell) {
    var d = "";
    for (var X = x; X <= x + w + 0.01; X += cell) d += "M" + X + " " + y + "V" + (y + hh);
    for (var Y = y; Y <= y + hh + 0.01; Y += cell) d += "M" + x + " " + Y + "H" + (x + w);
    var p = S("path", { d: d, class: "pk-grid-lines" });
    g.appendChild(p);
    return p;
  }
  /** a soft contact shadow on the ground */
  function shadow(st, g, cx, cy, rx, ry, op) {
    var e = S("ellipse", { cx: cx, cy: cy, rx: rx, ry: ry || rx * 0.2, fill: "rgba(22,36,29," + (op || 0.22) + ")", filter: st.soft });
    g.appendChild(e);
    return e;
  }
  /** a pair (or set) of eyes that blink together. o: {sclera, look:[dx,dy], color} */
  function eyes(g, list, r, o) {
    o = o || {};
    var e = S("g", { class: "pk-eye", style: { animationDelay: (-Math.random() * 4.5).toFixed(2) + "s" } });
    var lx = (o.look && o.look[0]) || 0, ly = (o.look && o.look[1]) || 0;
    list.forEach(function (p) {
      if (o.sclera) e.appendChild(S("ellipse", { cx: p[0], cy: p[1], rx: r * 1.45, ry: r * 1.55, fill: "#fff" }));
      e.appendChild(S("ellipse", { cx: p[0] + lx, cy: p[1] + ly, rx: r, ry: r * 1.1, fill: o.color || "#16241d" }));
      e.appendChild(S("circle", { cx: p[0] + lx - r * 0.32, cy: p[1] + ly - r * 0.38, r: Math.max(0.8, r * 0.36), fill: "#fff" }));
    });
    g.appendChild(e);
    return e;
  }
  function blush(g, list, r) {
    list.forEach(function (p) { g.appendChild(S("ellipse", { cx: p[0], cy: p[1], rx: r, ry: r * 0.62, fill: "#f29b8f", opacity: 0.5 })); });
  }

  function register(id, meta, mount) { C.pets[id] = { id: id, meta: meta, mount: mount }; order.push(id); }

  C.petKit = {
    register: register, order: order, stage: stage, actor: actor,
    pts: pts, lerp: lerp, clamp: clamp, uid: uid, grid: grid, shadow: shadow, eyes: eyes, blush: blush, S: S, h: h,
    sound: {
      on: function () { return soundOn; },
      set: function (v) { soundOn = !!v; try { window.localStorage.setItem("cogna-pets-sound", v ? "on" : "off"); } catch (e) { /* ignore */ } },
    },
  };
})();
