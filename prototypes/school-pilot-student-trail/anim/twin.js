/* Cogna.landKit.twin — "make a copy, spin it, slide it in": the move behind the triangle and trapezium rules.
   A twin is a lighter copy of a piece of land that the student can:
     - drag by its body (it lifts, tilts with the motion, and is pulled in near the slot), and
     - spin by its gold knob (drag the knob round; it settles on a quarter turn with a click). Keyboard: Tab to the
       knob, Enter or the arrow keys turn it a quarter; Tab to the piece, the arrow keys move it.
   It fits only the right way up, in the right place. Wrong attempts get a spoken reaction and a spring back.

   twin(c, parent, opt) with opt = {
     P: shape in squares, u: px per square, pivot: [x, y] squares (turning about it keeps the grid on whole squares),
     knobAt: [x, y] squares (where the knob sits before any turn), stage: [x, y] px (where it waits),
     target: [x, y] px (its place in the slot, after a half turn), slot: slot shape in squares (for the ghost),
     bounds: { minX, maxX, minY, maxY } px, R: { wrongWay, dropWrong, dropHint } reaction lines }
   Returns { g, piece, knob, ghost, appear(L, then), fit(L, done), away(L), turnTo(L, deg, then) } */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, K = C.landKit;

  function rot(P, deg, o) {
    var a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    return P.map(function (p) { var x = p[0] - o[0], y = p[1] - o[1]; return [o[0] + x * cs - y * sn, o[1] + x * sn + y * cs]; });
  }
  function norm(d) { return ((Math.round(d) % 360) + 360) % 360; }

  K.twin = function (c, parent, opt) {
    var u = opt.u, L = c.L;
    var ghost = K.add(parent, "polygon", { points: K.px(opt.slot, u), "class": "t-pf-ghost" }); ghost.style.opacity = 0;
    var g = K.add(parent, "g", { "class": "t-pf-twin" });
    var piece = K.field(c, g, opt.P, u, { cls: "is-copy", pad: 3 });
    var kn = K.knob(c, g, "spin");
    var st = { r: 0 }, pv = [opt.pivot[0] * u, opt.pivot[1] * u];
    g.style.display = "none";

    function apply(r) {
      st.r = r;
      piece.turn(rot(opt.P, r, opt.pivot), r, pv);
      var k = rot([opt.knobAt], r, opt.pivot)[0];
      kn.g.setAttribute("transform", "translate(" + (k[0] * u).toFixed(1) + " " + (k[1] * u).toFixed(1) + ")");
    }
    apply(0);

    /** turn to deg (animated), then call then() */
    function turnTo(L, deg, then) {
      var from = st.r, pr = { r: from };
      L.sfx("whoosh");
      L.to(pr, { r: deg, duration: 0.45, ease: "back.out(1.6)", overwrite: "auto", onUpdate: function () { apply(pr.r); },
        onComplete: function () { apply(deg); L.sfx("snap"); if (then) then(); } }, true);
    }

    return {
      g: g, piece: piece, knob: kn, ghost: ghost, state: st, apply: apply, turnTo: turnTo,

      /** the copy peels off the original (which sits at translation 0,0) and glides to its waiting place */
      appear: function (L, then) {
        g.style.display = "";
        L.set(g, { x: 0, y: 0 });
        L.sfx("pop");
        K.liftUp(piece, L, 0.2);
        L.wait(200, function () { L.sfx("whoosh"); });
        L.to(g, { x: opt.stage[0], duration: 0.95, delay: 0.2, ease: "power2.inOut" });
        L.to(g, { keyframes: [{ y: opt.stage[1] - 40, duration: 0.47, ease: "power1.out" }, { y: opt.stage[1], duration: 0.48, ease: "power1.in" }], delay: 0.2 });
        L.wait(1200, function () { K.setDown(piece, L); L.sfx("thud"); kn.show(L, 0.15); if (then) then(); });
      },

      /** the task: fit it into the slot. done("fit") once it clicks in. */
      fit: function (L, done) {
        var won = false, misses = 0, hinted = false, hot = false, bob = null, offTilt = null, lastX = 0, spun = false, d;
        var tx = opt.target[0], ty = opt.target[1], svg = L.svg;
        g.classList.add("is-movable"); piece.g.classList.add("is-movable"); svg.classList.add("is-dragging-ok");
        piece.lift.setAttribute("tabindex", "0"); piece.lift.setAttribute("role", "button");
        piece.lift.setAttribute("aria-label", "The copy. Drag it, or move it with the arrow keys.");
        kn.live(true); kn.hit.setAttribute("role", "button"); kn.hit.setAttribute("aria-label", "Spin the copy. Press Enter to turn it a quarter turn.");
        if (!L.reduced) { L.set(piece.lift, { svgOrigin: piece.centre[0] + " " + piece.centre[1] }); bob = L.to(piece.lift, { y: -6, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" }, true); }
        function stopBob() { if (bob) { L.kill(bob); bob = null; } }
        function right() { return norm(st.r) === 180; }
        function pos() { return [window.gsap.getProperty(g, "x"), window.gsap.getProperty(g, "y")]; }
        function near(x, y, r) { return Math.hypot(x - tx, y - ty) < r; }
        function glow(x, y) {
          if (!right()) { if (hinted) { ghost.style.opacity = 0.35; } else ghost.style.opacity = 0; ghost.classList.remove("is-hot"); hot = false; return; }
          var dd = Math.hypot(x - tx, y - ty);
          ghost.style.opacity = dd < 3 * u ? Math.min(1, Math.max(hinted ? 0.35 : 0.12, 1.3 - dd / (2.6 * u))) : (hinted ? 0.35 : 0);
          var nowHot = dd < 2; if (nowHot && !hot) L.sfx("pop");
          hot = nowHot; ghost.classList.toggle("is-hot", hot);
        }
        function home() { L.to(g, { x: opt.stage[0], y: opt.stage[1], duration: 0.8, ease: "elastic.out(1, 0.55)", overwrite: "auto", onComplete: function () { if (d) d.update(); } }, true); }
        function miss(line) {
          misses++; L.sfx("oops");
          K.wiggle(piece.lift, L, "rotation", 5);
          home();
          L.say(line);
          if (misses >= 2) hint();
        }
        function hint() {
          if (hinted || won) return; hinted = true;
          ghost.style.opacity = 0.35;
          L.to(ghost, { opacity: 0.9, duration: 0.5, repeat: 5, yoyo: true }, true);
          L.controls([h("button", { type: "button", class: "btn btn-ghost", on: { click: auto } }, "Do it for me")]);
        }
        function release(x, y) {
          if (won) return;
          if (near(x, y, 1.5 * u)) {
            if (right()) { snap(); return; }
            miss(opt.R.wrongWay.caption); return;
          }
          K.setDown(piece, L); ghost.classList.remove("is-hot"); hot = false; glow(x, y);
          if (Math.hypot(x - opt.stage[0], y - opt.stage[1]) < 24) return;   // a tap, not a move
          if (!right()) { miss(opt.R.wrongWay.caption); return; }
          miss(misses === 0 ? opt.R.dropWrong.caption : opt.R.dropHint.caption);
        }
        d = L.draggable(g, {
          type: "x,y", trigger: piece.lift, bounds: opt.bounds,
          liveSnap: { points: function (p) { return right() && Math.hypot(p.x - tx, p.y - ty) < 0.7 * u ? { x: tx, y: ty } : p; } },
          onPress: function () {
            if (won) return;
            stopBob(); L.sfx("pickup"); K.liftUp(piece, L);
            lastX = this.x;
            if (window.gsap && !L.reduced) {
              var tilt = window.gsap.quickTo(piece.lift, "rotation", { duration: 0.3, ease: "power3.out" });
              offTilt = L.ticker(function () { if (!d) return; var vx = d.x - lastX; lastX = d.x; tilt(Math.max(-8, Math.min(8, vx * 0.8))); });
            }
          },
          onDrag: function () { glow(this.x, this.y); },
          onRelease: function () { if (offTilt) { offTilt(); offTilt = null; } release(this.x, this.y); },
        });

        /* spinning: drag the knob round the pivot */
        var spin = null;
        function pivotScreen() {
          var m = g.getScreenCTM(); if (!m) return [0, 0];
          var p = svg.createSVGPoint(); p.x = pv[0]; p.y = pv[1]; var q = p.matrixTransform(m); return [q.x, q.y];
        }
        function ang(ev, o) { return Math.atan2(ev.clientY - o[1], ev.clientX - o[0]) * 180 / Math.PI; }
        L.listen(kn.hit, "pointerdown", function (ev) {
          if (won) return;
          ev.preventDefault(); ev.stopPropagation(); stopBob();
          var o = pivotScreen();
          spin = { o: o, a0: ang(ev, o), r0: st.r, tickAt: Math.round(st.r / 15) };
          kn.held(L, true); L.sfx("pickup"); K.liftUp(piece, L);
          try { kn.hit.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        });
        L.listen(kn.hit, "pointermove", function (ev) {
          if (!spin || won) return;
          var da = ang(ev, spin.o) - spin.a0;
          if (da > 180) da -= 360; if (da < -180) da += 360;
          spin.a0 += da; var r = st.r + da;
          apply(r);
          var t = Math.round(r / 15); if (t !== spin.tickAt) { spin.tickAt = t; L.sfx("tick", ((t % 12) + 12) % 12); }
          var p = pos(); glow(p[0], p[1]);
        });
        function endSpin() {
          if (!spin) return;
          spin = null; kn.held(L, false);
          var to = Math.round(st.r / 90) * 90;
          turnTo(L, to, afterTurn);
          K.setDown(piece, L);
        }
        L.listen(kn.hit, "pointerup", endSpin); L.listen(kn.hit, "pointercancel", endSpin);
        L.listen(kn.hit, "keydown", function (ev) {
          if (won) return;
          var k = ev.key;
          if (k === "Enter" || k === " " || k === "ArrowRight" || k === "ArrowLeft") {
            ev.preventDefault(); stopBob();
            turnTo(L, Math.round(st.r / 90) * 90 + (k === "ArrowLeft" ? -90 : 90), afterTurn);
          }
        });
        function afterTurn() {
          var p = pos(); glow(p[0], p[1]);
          if (right() && !spun) { spun = true; L.sfx("sparkle"); }
          if (right() && near(p[0], p[1], 0.6 * u)) snap();
        }
        L.listen(piece.lift, "keydown", function (ev) {
          if (won || !window.gsap) return;
          var dx = ev.key === "ArrowRight" ? u / 2 : ev.key === "ArrowLeft" ? -u / 2 : 0, dy = ev.key === "ArrowDown" ? u / 2 : ev.key === "ArrowUp" ? -u / 2 : 0;
          if (!dx && !dy) return;
          ev.preventDefault(); stopBob();
          var b = opt.bounds, p = pos();
          var gx = Math.max(b.minX, Math.min(b.maxX, p[0] + dx)), gy = Math.max(b.minY, Math.min(b.maxY, p[1] + dy));
          L.sfx("tick", Math.round(gx / u) + 4);
          L.to(g, { x: gx, y: gy, duration: 0.16, ease: "power2.out", overwrite: "auto", onComplete: function () {
            if (d) d.update(); glow(gx, gy);
            if (near(gx, gy, 0.6 * u)) { if (right()) snap(); else miss(opt.R.wrongWay.caption); }
          } }, true);
        });

        function auto() {
          if (won) return;
          stopBob(); L.clearBar(); if (d) d.disable();
          function slide() {
            K.liftUp(piece, L);
            L.to(g, { x: tx, y: ty, duration: 1.0, ease: "power2.inOut", overwrite: "auto", onUpdate: function () { var p = pos(); glow(p[0], p[1]); }, onComplete: snap }, true);
          }
          if (right()) slide(); else turnTo(L, 180, function () { L.wait(250, slide); });
        }
        function snap() {
          if (won) return; won = true;
          stopBob(); if (offTilt) { offTilt(); offTilt = null; }
          if (d) d.disable();
          kn.live(false);
          L.to(kn.body, { scale: 0, duration: 0.25, ease: "power2.in" }, true);
          L.to(kn.g, { opacity: 0, duration: 0.25 }, true);
          g.classList.remove("is-movable"); piece.g.classList.remove("is-movable"); svg.classList.remove("is-dragging-ok");
          ["tabindex", "role", "aria-label"].forEach(function (a) { piece.lift.removeAttribute(a); });
          L.clearBar();
          ghost.classList.add("is-hot");
          L.to(g, { x: tx, y: ty, duration: 0.18, ease: "power3.out", overwrite: "auto" }, true);
          K.setDown(piece, L);
          L.wait(170, function () {
            L.sfx("snap"); K.shake(c, L, 2);
            L.to(ghost, { opacity: 0, duration: 0.25, overwrite: "auto" }, true);
            done("fit");
          });
        }
        L.wait(18000, function () { if (!won) { if (!right()) L.say(opt.R.wrongWay.caption); hint(); } });
      },

      /** the copy lifts off and floats away */
      away: function (L) {
        K.liftUp(piece, L, 0.25);
        L.wait(200, function () { L.sfx("whoosh"); });
        L.to(g, { x: "+=" + 3 * u, y: "-=" + 1.2 * u, opacity: 0, duration: 1.0, delay: 0.25, ease: "power2.in", onComplete: function () { g.style.display = "none"; } });
      },
    };
  };
})();
