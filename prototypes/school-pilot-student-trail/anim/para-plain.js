/* Ramesh uncle's slanted field — the area of a parallelogram is base × height.
   The story carries the lesson (he needs seed, sold by the square metre; his brother thinks a longer side means more
   land; Meena aunty's field is the student's own turn), and the student still does the maths by hand: move the cut
   piece, lean the field, work one out. It is drawn as ink on paper: no scenery, one stroke weight. Only the geometry
   moves, on one curve that never overshoots.
   Built on Cogna.lesson. Every line the narrator can say is a literal `caption:` so tools/record-narration.mjs records it. */
(function () {
  "use strict";
  var C = window.Cogna, S = C.svg;
  var W = 800, H = 430;
  var EASE = "power3.out", ENTER = 0.42, TRAVEL = 0.72;   // the web app's --ease-settle family and durations

  var R = {
    dropWrong: { caption: "Not there. Try the other end of the field." },
    dropGood: { caption: "It fits. The field is a rectangle now." },
    leanHint: { caption: "Drag the round handle left and right." },
    leanDone: { caption: "The slanted side kept changing. The land stayed 18 square metres." },
    n35: { caption: "That used the slanted side, 5. Land is measured straight up, so use the height, 4." },
    n24: { caption: "24 is the fence all the way round. Seed goes on the land inside." },
    n11: { caption: "That is 7 + 4. For land, multiply." },
    n20: { caption: "That is 5 × 4. Use the base, 7, with the height, 4." },
    nOther: { caption: "Multiply the base by the height." },
    nRight: { caption: "28 square metres. Meena aunty can buy her seed." },
  };


  function add(p, tag, a) { var e = S(tag, a || {}); p.appendChild(e); return e; }
  /** a frame of reference: unit size and where (0,0) sits */
  function frame(u, ox, oy) {
    var f = function (p) { return [ox + p[0] * u, oy + p[1] * u]; };
    f.pts = function (P) { return P.map(function (p) { var q = f(p); return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" "); };
    f.u = u; f.ox = ox; f.oy = oy;
    return f;
  }
  function label(p, str, at, cls) { var e = add(p, "text", { x: at[0], y: at[1], "class": "t-pp-lab " + (cls || ""), opacity: 0 }); e.textContent = str; return e; }
  function seg(p, a, b, cls) { return add(p, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "class": cls, pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }); }
  function show(L, els, delay) { return L.to(els, { opacity: 1, duration: ENTER, ease: EASE, delay: delay || 0, stagger: 0.08 }); }
  function hide(L, els) { return L.to(els, { opacity: 0, duration: 0.24, ease: EASE }); }
  function draw(L, el, delay, dur) { return L.to(el, { attr: { "stroke-dashoffset": 0 }, duration: dur || TRAVEL, ease: EASE, delay: delay || 0 }); }

  function meet(c, L) { draw(L, c.whole, 0.1, 1.3); L.to(c.whole, { attr: { "fill-opacity": 1 }, duration: ENTER, ease: EASE, delay: 1.0 }); }

  C.lesson.define({
    id: "para-plain", title: "Ramesh uncle's slanted field", cls: "t-pp", w: W, h: H, durationMs: 100000,

    build: function (svg) {
      var c = {};

      /* ----- 1. the parallelogram that becomes a rectangle: base 6, height 4 ----- */
      var f = c.f = frame(64, 144, 70);
      c.one = add(svg, "g");
      c.grid = add(c.one, "g", { "class": "t-pp-grid", opacity: 0 });
      for (var x = 0; x <= 8; x++) add(c.grid, "line", { x1: f([x, 0])[0], y1: f([x, 0])[1], x2: f([x, 4])[0], y2: f([x, 4])[1] });
      for (var y = 0; y <= 4; y++) add(c.grid, "line", { x1: f([0, y])[0], y1: f([0, y])[1], x2: f([8, y])[0], y2: f([8, y])[1] });
      c.whole = add(c.one, "polygon", { points: f.pts([[0, 4], [6, 4], [8, 0], [2, 0]]), "class": "t-pp-shape", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1, "fill-opacity": 0 });
      c.body = add(c.one, "polygon", { points: f.pts([[2, 0], [2, 4], [6, 4], [8, 0]]), "class": "t-pp-shape", opacity: 0 });
      c.tri = add(c.one, "polygon", { points: f.pts([[0, 4], [2, 4], [2, 0]]), "class": "t-pp-shape t-pp-piece", opacity: 0 });
      c.cut = seg(c.one, f([2, 0]), f([2, 4]), "t-pp-cut");
      c.seam = seg(c.one, f([6, 4]), f([8, 0]), "t-pp-seam");   // where the triangle will sit, hinted while it is being dragged
      c.base = label(c.one, "6 m", f([5, 4.55]));
      c.height = label(c.one, "4 m", f([8.5, 2.12]));
      label(c.one, "Ramesh uncle's field", f([0, -0.4]), "t-pp-name").setAttribute("opacity", 1);

      /* ----- 2. the one you lean: base 6, height 3 ----- */
      var g = c.g = frame(64, 176, 110);
      c.two = add(svg, "g", { opacity: 0 });
      c.lean = add(c.two, "polygon", { "class": "t-pp-shape" });
      c.leanH = add(c.two, "line", { "class": "t-pp-dash" });
      label(c.two, "Suresh's field", g([-0.5, -0.9]), "t-pp-name").setAttribute("opacity", 1);
      c.leanBase = label(c.two, "base 6 m", g([4, 3.55])); c.leanBase.setAttribute("opacity", 1);
      c.leanHt = label(c.two, "height 3 m", [0, 0], "t-pp-start"); c.leanHt.setAttribute("opacity", 1);
      c.leanSide = label(c.two, "", [0, 0], "t-pp-end t-pp-quiet"); c.leanSide.setAttribute("opacity", 1);
      c.handle = add(c.two, "g", { "class": "t-pp-handle", tabindex: 0, role: "slider", "aria-label": "Lean the parallelogram", "aria-valuemin": 0, "aria-valuemax": 3 });
      add(c.handle, "circle", { r: 26, "class": "t-pp-hit" });
      add(c.handle, "circle", { r: 9 });
      c.setLean = function (s) {
        c.s = s;
        c.lean.setAttribute("points", g.pts([[1, 3], [7, 3], [7 + s, 0], [1 + s, 0]]));
        var top = g([1 + s, 0]), foot = g([1 + s, 3]), midSide = g([1 + s / 2, 1.5]);
        c.leanH.setAttribute("x1", top[0]); c.leanH.setAttribute("y1", top[1]); c.leanH.setAttribute("x2", foot[0]); c.leanH.setAttribute("y2", foot[1]);
        c.leanHt.setAttribute("x", top[0] + 12); c.leanHt.setAttribute("y", (top[1] + foot[1]) / 2 + 6);
        c.leanSide.setAttribute("x", midSide[0] - 14); c.leanSide.setAttribute("y", midSide[1] + 6);
        c.leanSide.textContent = "slanted " + Math.sqrt(s * s + 9).toFixed(1) + " m";
        c.leanH.setAttribute("opacity", s > 0.35 ? 1 : 0); c.leanSide.setAttribute("opacity", s > 0.35 ? 1 : 0);
        c.handle.setAttribute("transform", "translate(" + top[0] + "," + top[1] + ")");
        c.handle.setAttribute("aria-valuenow", s.toFixed(1));
      };
      c.setLean(1.5);

      /* ----- 3. your turn: base 7, height 4, slanted side 5 ----- */
      var k = frame(52, 140, 84);
      c.three = add(svg, "g", { opacity: 0 });
      add(c.three, "polygon", { points: k.pts([[0, 4], [7, 4], [10, 0], [3, 0]]), "class": "t-pp-shape" });
      var dash = add(c.three, "line", { "class": "t-pp-dash" }), a = k([3, 0]), b = k([3, 4]);
      dash.setAttribute("x1", a[0]); dash.setAttribute("y1", a[1]); dash.setAttribute("x2", b[0]); dash.setAttribute("y2", b[1]);
      label(c.three, "Meena aunty's field", k([0, -0.55]), "t-pp-name").setAttribute("opacity", 1);
      label(c.three, "7 m", k([3.5, 4.62])).setAttribute("opacity", 1);
      label(c.three, "4 m", [a[0] + 12, (a[1] + b[1]) / 2 + 6], "t-pp-start").setAttribute("opacity", 1);
      label(c.three, "5 m", [k([1.5, 2])[0] - 14, k([1.5, 2])[1] + 6], "t-pp-end").setAttribute("opacity", 1);
      return c;
    },

    steps: [
      { branch: function () { var p = C.data && C.data.profile; return p && p.id === "aarav" ? 0 : (p && p.id === "riya" ? 1 : 2); },
        options: [
          { caption: "Aarav, this is Ramesh uncle's field. The road runs past at a slant, so the field leans.", run: meet },
          { caption: "Riya, this is Ramesh uncle's field. The road runs past at a slant, so the field leans.", run: meet },
          { caption: "This is Ramesh uncle's field. The road runs past at a slant, so the field leans.", run: meet },
        ] },

      { caption: "He is buying seed, and seed is sold by the square metre. So he needs to know how much land he has." },

      { caption: "Each small square is one square metre. Along the slanted sides the squares are cut, so counting them is messy.",
        run: function (c, L) { show(L, c.grid); } },

      { caption: "Ramesh uncle has an idea. Cut straight down from this corner. That leaves a triangle of land.",
        run: function (c, L) {
          draw(L, c.cut, 0.2);
          L.wait(1000, function () { L.set([c.tri, c.body], { opacity: 1 }); L.set(c.whole, { opacity: 0 }); c.tri.classList.add("is-live"); });
        } },

      { caption: "Drag the triangle to the other end of the field.",
        task: function (c, L, done) {
          var home = 6 * c.f.u;
          L.svg.classList.add("is-dragging-ok");
          draw(L, c.seam, 0, ENTER);
          function settle() {
            L.svg.classList.remove("is-dragging-ok"); c.tri.classList.remove("is-live");
            hide(L, [c.cut, c.seam]);
            L.say(R.dropGood.caption, done);
          }
          var d = L.draggable(c.tri, {
            type: "x,y",
            onDragEnd: function () {
              if (Math.abs(this.x - home) < 70 && Math.abs(this.y) < 70) {
                d.disable();
                L.to(c.tri, { x: home, y: 0, duration: ENTER, ease: EASE, onComplete: settle });
              } else {
                L.to(c.tri, { x: 0, y: 0, duration: ENTER, ease: EASE }, true);
                L.say(R.dropWrong.caption);
              }
            },
          });
          // Keyboard: Enter or Space moves it for you.
          c.tri.setAttribute("tabindex", 0); c.tri.setAttribute("role", "button"); c.tri.setAttribute("aria-label", "Move the triangle to the other end");
          L.listen(c.tri, "keydown", function (e) {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault(); if (d) d.disable();
            L.to(c.tri, { x: home, y: 0, duration: TRAVEL, ease: EASE, onComplete: settle });
          });
        } },

      { caption: "A rectangle is easy. 6 metres along the base, 4 metres up. 6 × 4 is 24 square metres.",
        run: function (c, L) { show(L, [c.base, c.height]); L.wait(1400, function () { L.board('<span class="t-pp-sum">6 × 4 = 24 m²</span>'); }); } },

      { caption: "No land was added and none was lost. So the slanted field was 24 square metres all along.",
        run: function (c, L) { L.to(c.tri, { x: 0, y: 0, duration: TRAVEL, ease: EASE, delay: 0.5 }); L.to(c.tri, { x: 6 * c.f.u, duration: TRAVEL, ease: EASE, delay: 2.6 }); } },

      { caption: "Next door is his brother Suresh's field. Suresh says his is bigger, because its side is longer. Drag the top corner to lean it, and watch the land.",
        run: function (c, L) { hide(L, c.one); show(L, c.two, 0.25); L.board(""); },
        task: function (c, L, done) {
          var travelled = 0, grab = null, finished = false;
          function board() { L.boardLive('<span class="t-pp-sum">6 × 3 = 18 m²</span><span class="t-rule-note">slanted side ' + Math.sqrt(c.s * c.s + 9).toFixed(1) + ' m</span>'); }
          function move(s) { s = Math.max(0, Math.min(3, s)); travelled += Math.abs(s - c.s); c.setLean(s); board(); }
          function finish() { if (finished || travelled < 2.5) return; finished = true; L.svg.classList.remove("is-dragging-ok"); c.handle.classList.add("is-done"); L.say(R.leanDone.caption, done); }
          L.svg.classList.add("is-dragging-ok"); board();
          L.listen(c.handle, "pointerdown", function (e) { grab = L.point(e)[0] / c.g.u - c.s; c.handle.setPointerCapture(e.pointerId); });
          L.listen(c.handle, "pointermove", function (e) { if (grab !== null) move(L.point(e)[0] / c.g.u - grab); });
          L.listen(c.handle, "pointerup", function () { grab = null; finish(); });
          L.listen(c.handle, "keydown", function (e) {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault(); move(c.s + (e.key === "ArrowRight" ? 0.25 : -0.25)); finish();
          });
          L.wait(9000, function () { if (travelled === 0) L.say(R.leanHint.caption); });
        } },

      { caption: "So Suresh is wrong. A longer slanted side does not mean more land. Only the base and the straight-up height count." },

      { caption: "Your turn. Meena aunty wants seed for this field. How many square metres is it?",
        run: function (c, L) { hide(L, c.two); show(L, c.three, 0.25); L.board(""); },
        task: function (c, L, done) {
          L.number("Area in m²", function (v) {
            if (v === 28) return true;
            var r = v === 35 ? R.n35 : v === 24 ? R.n24 : v === 11 ? R.n11 : v === 20 ? R.n20 : R.nOther;
            L.say(r.caption);
            return "Not yet. Try again.";
          }, function () { L.board('<span class="t-pp-sum">7 × 4 = 28 m²</span>'); L.say(R.nRight.caption, done); });
        } },

      { caption: "That works for every parallelogram: area = base × height.", hold: 900,
        run: function (c, L) { L.board('<span class="t-rule t-pp-ruled">area = base × height</span>'); } },
    ],
  });
})();
