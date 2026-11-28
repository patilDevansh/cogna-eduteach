/* OWNER: Agent D (animations).
   Cogna.timeline(beats, {onBeat, onEnd, reset, getCtx, endAt}) -> {play, pause, replay, destroy}
   beats = [{at: ms, run(ctx), caption?}]
   Also Cogna.animKit: tiny SVG helpers + define() shared by every animation file. */
(function () {
  "use strict";

  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (e) { return false; }
  }

  function timeline(beats, opts) {
    opts = opts || {};
    var list = beats.slice().sort(function (a, b) { return a.at - b.at; });
    var endAt = opts.endAt != null ? opts.endAt : (list.length ? list[list.length - 1].at + 2500 : 0);
    var idx = 0, elapsed = 0, last = 0, raf = 0, playing = false, ended = false, dead = false;
    // Voice pacing: after a spoken caption, the clock will not reach the next beat until the line has been heard.
    var run = 0, waitingVoice = false, waitedMs = 0;

    function fire(b) {
      try { if (b.run) b.run(opts.getCtx ? opts.getCtx() : null); } catch (e) { console.error("[anim beat]", e); }
      if (b.caption != null && opts.onBeat) {
        var me = run; waitingVoice = true; waitedMs = 0;
        try { opts.onBeat(b.caption, function () { if (me === run) waitingVoice = false; }); } catch (e) { console.error(e); waitingVoice = false; }
      }
    }
    function finish() {
      if (ended) return;
      ended = true; playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (opts.onEnd) { try { opts.onEnd(); } catch (e) { console.error(e); } }
    }
    function tick(now) {
      if (!playing || dead) return;
      var dt = now - last; last = now;
      if (dt > 250) dt = 250; // tab was in the background; do not skip beats
      if (dt < 0) dt = 0;
      var nextT = elapsed + dt;
      if (waitingVoice) {
        waitedMs += dt;
        if (waitedMs > 15000) waitingVoice = false; // never stall for good
        var limit = (idx < list.length ? list[idx].at : endAt) - 1;
        if (nextT > limit) nextT = Math.max(elapsed, limit);
      }
      elapsed = nextT;
      while (idx < list.length && list[idx].at <= elapsed) fire(list[idx++]);
      if (idx >= list.length && elapsed >= endAt) { finish(); return; }
      raf = requestAnimationFrame(tick);
    }
    function jumpToEnd() {
      while (idx < list.length) fire(list[idx++]);
      elapsed = endAt;
      finish();
    }
    function play() {
      if (dead || playing) return;
      if (ended) { replay(); return; }
      if (reducedMotion()) { jumpToEnd(); return; }
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function pause() {
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function replay() {
      if (dead) return;
      pause();
      idx = 0; elapsed = 0; ended = false; run++; waitingVoice = false;
      if (opts.reset) opts.reset();
      play();
    }
    function destroy() { dead = true; pause(); }
    return { play: play, pause: pause, replay: replay, destroy: destroy };
  }

  /* ---------------- SVG helpers ---------------- */
  var S = Cogna.svg;
  function cls(c) { return c ? { "class": c } : {}; }
  function withCls(c, extra) {
    var a = extra || {};
    if (c) a["class"] = c;
    return a;
  }
  var K = {
    root: function (w, h, label) {
      return S("svg", { "class": "t-anim", viewBox: "0 0 " + w + " " + h, role: "img", "aria-label": label, preserveAspectRatio: "xMidYMid meet" });
    },
    grid: function (p, w, h) {
      var g = S("g", { "class": "t-grid" });
      for (var x = 0; x <= w; x++) g.appendChild(S("line", { x1: x, y1: 0, x2: x, y2: h }));
      for (var y = 0; y <= h; y++) g.appendChild(S("line", { x1: 0, y1: y, x2: w, y2: y }));
      p.appendChild(g);
      return g;
    },
    g: function (p, c) { var e = S("g", cls(c)); p.appendChild(e); return e; },
    poly: function (p, pts, c) {
      var e = S("polygon", withCls(c, { points: pts.map(function (q) { return q[0] + "," + q[1]; }).join(" ") }));
      p.appendChild(e); return e;
    },
    rect: function (p, x, y, w, h, c) {
      var e = S("rect", withCls(c, { x: x, y: y, width: w, height: h })); p.appendChild(e); return e;
    },
    line: function (p, x1, y1, x2, y2, c) {
      var e = S("line", withCls(c, { x1: x1, y1: y1, x2: x2, y2: y2 })); p.appendChild(e); return e;
    },
    path: function (p, d, c) {
      var e = S("path", withCls(c, { d: d })); p.appendChild(e); return e;
    },
    /** A path that can be "drawn" (stroke-dashoffset) when .on is added. */
    draw: function (p, d, c) {
      var e = S("path", withCls("t-draw " + (c || ""), { d: d, pathLength: 1 })); p.appendChild(e); return e;
    },
    text: function (p, x, y, str, c) {
      var e = S("text", withCls(c, { x: x, y: y })); e.textContent = str; p.appendChild(e); return e;
    },
    /** right-angle mark at corner (x,y); a = direction along the base, b = direction up the height */
    mark: function (p, x, y, a, b, s) {
      s = s || 0.5;
      var d = "M" + (x + a[0] * s) + "," + (y + a[1] * s) +
        " L" + (x + (a[0] + b[0]) * s) + "," + (y + (a[1] + b[1]) * s) +
        " L" + (x + b[0] * s) + "," + (y + b[1] * s);
      return K.path(p, d, "t-mark t-fade");
    },
    on: function (el, delay) {
      if (!el) return;
      if (delay != null) el.style.transitionDelay = delay + "ms";
      el.classList.add("on");
    },
    off: function (el, delay) {
      if (!el) return;
      if (delay != null) el.style.transitionDelay = delay + "ms";
      el.classList.remove("on");
    },
    onAll: function (arr, step, base) {
      arr.forEach(function (el, i) { K.on(el, (base || 0) + i * (step || 0)); });
    },
    /** change on/off with no transition (hard swap between two drawings) */
    snap: function (el, on) {
      el.style.transition = "none";
      el.classList[on ? "add" : "remove"]("on");
      el.getBoundingClientRect();
      el.style.transition = "";
    },
    tf: function (el, str, ox, oy) {
      if (ox != null) el.style.transformOrigin = ox + "px " + oy + "px";
      el.style.transform = str;
    },
    /** vertical dashed line that grows downward from (x,y1) to (x,y2) */
    height: function (p, x, y1, y2) {
      var e = K.line(p, x, y1, x, y2, "t-height t-grow");
      e.style.transformOrigin = x + "px " + y1 + "px";
      return e;
    },
    define: function (spec) {
      Cogna.anims[spec.id] = {
        title: spec.title,
        durationMs: spec.durationMs,
        mount: function (el, o) {
          o = o || {};
          var svg = K.root(spec.w, spec.h, spec.title);
          var ctx = null;
          function build() {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            K.grid(svg, spec.w, spec.h);
            ctx = spec.build(svg, K) || {};
            svg.getBoundingClientRect(); // commit the start state so transitions run
          }
          el.appendChild(svg);
          build();
          var tl = timeline(spec.beats, {
            onBeat: o.onBeat, onEnd: o.onEnd, reset: build,
            getCtx: function () { return ctx; }, endAt: spec.durationMs,
          });
          return {
            play: tl.play, pause: tl.pause, replay: tl.replay,
            destroy: function () { tl.destroy(); if (svg.parentNode) svg.parentNode.removeChild(svg); },
          };
        },
      };
    },
  };

  Cogna.timeline = timeline;
  Cogna.animKit = K;
})();
