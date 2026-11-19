/* Cogna.lesson — interactive, voice-paced lessons (orchestrator).
   Registers into Cogna.anims[id] with the same contract as every animation:
     mount(stageEl, { onBeat(caption, voiceDone), onEnd }) -> { play, pause, replay, destroy }
   so the session player needs no special case.

   define({ id, title, w, h, durationMs, build(svg, L) -> c, frame?(c, L), steps: [Step] })
   Step = { caption?, run?(c, L), hold?: ms, gap?: ms, task?(c, L, done) }
        | { branch(c, L) -> index, options: [Step, ...] }
   A step moves on only when ALL of these are true:
     - its caption has been spoken to the end (or, with sound off, the time it takes to read it)
     - `hold` ms have passed
     - every tween started during the step has finished
     - its task (if any) has called done(value)  — the student did the thing
   Time is "lesson time": it stops while paused, so Pause freezes everything. */
(function () {
  "use strict";
  var C = window.Cogna, S = C.svg, h = C.h;
  if (window.gsap && window.Draggable) window.gsap.registerPlugin(window.Draggable);

  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
  }
  function readMs(text) { return 1000 + String(text).split(/\s+/).length * 330; }
  var EASE = {
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    back: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    linear: function (t) { return t; },
  };

  /* ---------- small geometry kit (used by lessons for water, labels, drag) ---------- */
  var G = {
    area: function (P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; },
    /** keep the part of polygon P where keep(p) >= 0 ; f is linear in p */
    clip: function (P, f) {
      var out = [];
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length], fa = f(a), fb = f(b);
        if (fa >= 0) out.push(a);
        if ((fa >= 0) !== (fb >= 0)) { var t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    },
    below: function (P, y) { return G.clip(P, function (p) { return p[1] - y; }); },   // SVG y grows downward
    above: function (P, y) { return G.clip(P, function (p) { return y - p[1]; }); },
    /** water level y so that the part of P below it has area V */
    level: function (P, V) {
      var ys = P.map(function (p) { return p[1]; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      if (V <= 1e-6) return hi;
      if (V >= G.area(P) - 1e-6) return lo;
      for (var k = 0; k < 40; k++) { var m = (lo + hi) / 2; if (G.area(G.below(P, m)) > V) lo = m; else hi = m; }
      return (lo + hi) / 2;
    },
    pts: function (P) { return P.map(function (p) { return p[0].toFixed(3) + "," + p[1].toFixed(3); }).join(" "); },
  };

  function define(spec) {
    C.anims[spec.id] = {
      title: spec.title, durationMs: spec.durationMs || 90000, interactive: true,
      mount: function (el, o) {
        o = o || {};
        var reduced = reducedMotion();
        var wrap = h("div", { class: "t-lesson " + (spec.cls || "") });
        var svg = S("svg", { "class": "t-anim t-lesson-svg", viewBox: "0 0 " + spec.w + " " + spec.h, role: "img", "aria-label": spec.title, preserveAspectRatio: "xMidYMid meet" });
        var board = h("div", { class: "t-lesson-board math", "aria-live": "polite" });
        var bar = h("div", { class: "t-lesson-task", hidden: true });
        wrap.appendChild(svg); wrap.appendChild(board); wrap.appendChild(bar);
        el.appendChild(wrap);

        var now = 0, last = 0, raf = 0, playing = false, dead = false, ended = false, started = false;
        var timers = [], tweens = [], gen = 0, idx = -1, cur = null, wantNext = false, c = null;
        var L = { G: G, ease: EASE, svg: svg, state: {}, reduced: reduced };
        var gs = [], drags = [], offs = [];   // GSAP tweens, Draggables and listeners made by this lesson (paused, resumed and removed with it)
        function gsPause() { gs = gs.filter(function (t) { return t.progress() < 1; }); gs.forEach(function (t) { t.pause(); }); }
        function gsResume() { gs.forEach(function (t) { t.resume(); }); }
        function gsKill() {
          gs.forEach(function (t) { t.kill(); }); drags.forEach(function (d) { d.kill(); });
          offs.forEach(function (off) { try { off(); } catch (e) { /* ignore */ } });
          gs = []; drags = []; offs = [];
        }

        /* ----- clock ----- */
        function wait(ms, fn) { timers.push({ at: now + (ms || 0), fn: fn, gen: gen }); }
        function tween(ms, fn, opt) {
          opt = opt || {};
          var tw = { t0: now + (opt.delay || 0), ms: reduced ? 0 : ms, fn: fn, ease: EASE[opt.ease || "inOut"] || EASE.inOut, release: opt.free ? null : hold(), then: opt.then };
          tweens.push(tw);
          if (!playing) step(tw, now); // paint the start state at once
          return tw;
        }
        function step(tw, t) {
          var p = tw.ms <= 0 ? (t >= tw.t0 ? 1 : 0) : Math.max(0, Math.min(1, (t - tw.t0) / tw.ms));
          if (t < tw.t0 && p === 0) return false;
          try { tw.fn(tw.ease(p), p); } catch (e) { console.error("[lesson tween]", e); }
          return p >= 1;
        }
        function tick(t) {
          if (!playing || dead) return;
          var dt = t - last; last = t; if (dt > 250) dt = 250; if (dt < 0) dt = 0;
          now += dt;
          var due = timers.filter(function (x) { return x.at <= now; });
          timers = timers.filter(function (x) { return x.at > now; });
          due.forEach(function (x) { try { x.fn(); } catch (e) { console.error("[lesson timer]", e); } });
          var done = [];
          tweens = tweens.filter(function (tw) { if (step(tw, now)) { done.push(tw); return false; } return true; });
          done.forEach(function (tw) { if (tw.then) try { tw.then(); } catch (e) { console.error(e); } if (tw.release) tw.release(); });
          if (spec.frame) try { spec.frame(c, L); } catch (e) { console.error("[lesson frame]", e); }
          raf = requestAnimationFrame(tick);
        }

        /* ----- steps ----- */
        function hold() {
          var g = gen, r = cur, off = false;
          if (!r) return function () {};
          r.holds++;
          return function () { if (off || g !== gen) return; off = true; r.holds--; maybeNext(); };
        }
        function maybeNext() { if (cur && cur.holds === 0) { if (playing) next(); else wantNext = true; } }
        function next() { wantNext = false; startStep(idx + 1); }
        function narrate(text) {
          var release = hold(), g = gen, answered = false;
          wait(readMs(text) * 2 + 5000, release); // safety net if the voice never reports back
          function voiceDone(spoken) {
            if (answered || g !== gen) return;
            answered = true;
            if (spoken) wait(250, release); else wait(readMs(text), release);
          }
          if (o.onBeat) o.onBeat(text, voiceDone); else voiceDone(false);
        }
        function startStep(i) {
          gen++; idx = i;
          if (i >= spec.steps.length) { finish(); return; }
          var s = spec.steps[i];
          if (s.branch) s = s.options[s.branch(c, L)] || s.options[0];
          cur = { holds: 1 };
          var me = cur;
          if (s.run) try { s.run(c, L); } catch (e) { console.error("[lesson step]", i, e); }
          if (s.caption) narrate(s.caption);
          wait(s.gap != null ? s.gap : 450, hold());
          if (s.hold) wait(s.hold, hold());
          if (s.task) { var rel = hold(); try { s.task(c, L, function (v) { L.state.last = v; rel(); }); } catch (e) { console.error("[lesson task]", e); rel(); } }
          me.holds--; maybeNext();
        }
        function finish() {
          if (ended) return;
          ended = true; playing = false;
          if (raf) cancelAnimationFrame(raf); raf = 0;
          if (o.onEnd) try { o.onEnd(); } catch (e) { console.error(e); }
        }

        /* ----- task bar + board helpers ----- */
        L.wait = wait; L.tween = tween; L.hold = hold;
        L.isPlaying = function () { return playing; };
        L.board = function (html) {
          board.innerHTML = html || "";
          board.classList.toggle("is-empty", !html);
          board.classList.remove("is-new"); void board.offsetWidth; board.classList.add("is-new");
        };
        /** update the board without the entrance animation (live values while dragging) */
        L.boardLive = function (html) { board.innerHTML = html || ""; board.classList.toggle("is-empty", !html); board.classList.remove("is-new"); };
        L.clearBar = function () { bar.innerHTML = ""; bar.hidden = true; };
        /** choices: [{label, value}] -> cb(value) once */
        L.ask = function (prompt, choices, cb) {
          L.clearBar(); bar.hidden = false;
          if (prompt) bar.appendChild(h("span", { class: "t-lesson-ask" }, prompt));
          var row = h("div", { class: "t-lesson-choices" });
          choices.forEach(function (ch) {
            var b = h("button", { type: "button", class: "btn btn-ghost t-lesson-choice" }, ch.label);
            b.addEventListener("click", function () {
              Array.prototype.forEach.call(row.children, function (x) { x.disabled = true; });
              b.classList.add("is-picked");
              setTimeout(function () { if (!dead) { L.clearBar(); cb(ch.value); } }, 450);
            });
            row.appendChild(b);
          });
          bar.appendChild(row);
          var first = row.querySelector("button"); if (first) try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        };
        L.button = function (label, cb, cls) {
          L.clearBar(); bar.hidden = false;
          var b = h("button", { type: "button", class: "btn btn-primary t-lesson-go " + (cls || "") }, label);
          b.addEventListener("click", function () { b.disabled = true; L.clearBar(); cb(); });
          bar.appendChild(b);
          try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
          return b;
        };
        /** Type a number. check(value) -> true to accept (bar closes, cb(value)), or a message string to show and let them try again. */
        L.number = function (prompt, check, cb) {
          L.clearBar(); bar.hidden = false;
          var id = "t-lesson-num-" + Math.random().toString(36).slice(2, 8);
          if (prompt) bar.appendChild(h("label", { class: "t-lesson-ask", for: id }, prompt));
          var inp = h("input", { id: id, class: "input t-lesson-num", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "?" });
          var go = h("button", { type: "button", class: "btn btn-primary" }, "Check");
          var msg = h("p", { class: "t-lesson-msg", role: "status", "aria-live": "polite" });
          function submit() {
            var raw = String(inp.value).trim().replace(/[^\d.\-]/g, "");
            if (!raw) { inp.focus(); return; }
            var v = Number(raw), r = check(v);
            if (r === true) { inp.disabled = true; go.disabled = true; setTimeout(function () { if (!dead) { L.clearBar(); cb(v); } }, 450); return; }
            msg.textContent = r || "Not quite. Try again.";
            inp.select();
          }
          go.addEventListener("click", submit);
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
          bar.appendChild(inp); bar.appendChild(go); bar.appendChild(msg);
          try { inp.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        };
        L.controls = function (nodes) { L.clearBar(); bar.hidden = false; nodes.forEach(function (n) { bar.appendChild(n); }); };
        /** A reaction line inside a task (not a step of its own): shown and spoken now; cb runs once it has been heard. */
        L.say = function (text, cb) {
          var g = gen, fired = false;
          function fire() { if (fired || g !== gen) return; fired = true; if (cb) try { cb(); } catch (e) { console.error(e); } }
          wait(readMs(text) * 2 + 4000, fire);
          if (o.onBeat) o.onBeat(text, function (spoken) { wait(spoken ? 200 : readMs(text), fire); });
          else wait(readMs(text), fire);
        };
        /** GSAP tween that pauses with the lesson and, unless free, holds the step until it ends. */
        L.to = function (target, vars, free) {
          vars = Object.assign({}, vars);
          if (reduced) {
            vars.duration = 0; vars.delay = 0; vars.repeat = 0; vars.yoyo = false; vars.stagger = 0;
            if (Array.isArray(vars.keyframes)) vars.keyframes = vars.keyframes.map(function (k) { return Object.assign({}, k, { duration: 0, delay: 0 }); });
          }
          var rel = free ? null : hold(), oc = vars.onComplete;
          vars.onComplete = function () { if (oc) try { oc.apply(this, arguments); } catch (e) { console.error(e); } if (rel) rel(); };
          if (!window.gsap) { console.error("[lesson] GSAP missing"); vars.onComplete(); return null; }
          var tw = window.gsap.to(target, vars);
          gs.push(tw);
          if (!playing) tw.pause();
          return tw;
        };
        L.set = function (target, vars) { if (window.gsap) window.gsap.set(target, vars); };
        /** Stop a tween made with L.to for good (it will not come back on the next play). Only for free tweens. */
        L.kill = function (tw) { if (!tw) return; var i = gs.indexOf(tw); if (i !== -1) gs.splice(i, 1); tw.kill(); };
        /** addEventListener that is removed when the lesson is replayed or closed. Returns a function that removes it now. */
        L.listen = function (el, type, fn, opt) {
          el.addEventListener(type, fn, opt);
          var off = function () { el.removeEventListener(type, fn, opt); };
          offs.push(off); return off;
        };
        /** fn runs on every animation frame until the returned function is called, or the lesson is replayed or closed. */
        L.ticker = function (fn) {
          if (!window.gsap) return function () {};
          window.gsap.ticker.add(fn);
          var off = function () { window.gsap.ticker.remove(fn); };
          offs.push(off); return off;
        };
        /** GSAP Draggable, killed with the lesson. */
        L.draggable = function (target, vars) {
          if (!window.Draggable) { console.error("[lesson] Draggable missing"); return null; }
          var d = window.Draggable.create(target, vars)[0]; drags.push(d); return d;
        };
        L.sfx = function (name, arg) { if (C.sfx && C.sfx[name]) C.sfx[name](arg); };
        /** pointer position in viewBox units */
        L.point = function (ev) {
          var m = svg.getScreenCTM(); if (!m) return [0, 0];
          var p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
          var q = p.matrixTransform(m.inverse()); return [q.x, q.y];
        };

        function build() {
          while (svg.firstChild) svg.removeChild(svg.firstChild);
          L.clearBar(); L.board(""); L.state = {};
          c = spec.build(svg, L) || {};
          if (spec.frame) spec.frame(c, L);
        }
        build();

        function play() {
          if (dead || playing) return;
          if (ended) { replay(); return; }
          playing = true; last = performance.now();
          raf = requestAnimationFrame(tick);
          gsResume();
          if (!started) { started = true; startStep(0); }
          else if (wantNext) next();
        }
        function pause() { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; gsPause(); }
        function replay() {
          if (dead) return;
          pause(); gsKill();
          gen++; timers = []; tweens = []; now = 0; idx = -1; cur = null; wantNext = false; ended = false; started = false;
          build();
          play();
        }
        function destroy() { dead = true; pause(); gsKill(); gen++; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
        return { play: play, pause: pause, replay: replay, destroy: destroy };
      },
    };
  }

  C.lesson = { define: define, G: G, ease: EASE };
})();
