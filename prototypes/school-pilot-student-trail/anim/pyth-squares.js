/* The right-angle rule — an interactive, narrated Cogna lesson.
   One picture all the way through: the school ground, then the triangle and its squares.
   Numbers before letters; a, b, c arrive only with the rule. Four student actions:
     1. guess the shortcut (5, 6 or 7 m)
     2. predict: will the 9 and the 16 fill the square on the shortcut?
     3. type the side of the 25-square (5)
     4. tap the longest side on the turned triangle
   Local units: 1 = one small square. Right angle R at (0,0), short side up to A(0,-3), short side right to B(4,0). */
(function () {
  "use strict";
  var C = window.Cogna, S = C.svg, G = C.lesson.G;
  var R = [0, 0], A = [0, -3], B = [4, 0];
  var N = [0.6, -0.8], D = [0.8, 0.6];       // N: away from the triangle across the long side; D: along it, A -> B
  var PV = [2, -1.5];                         // pivot of the figure
  var K_GROUND = 1.9, K_SQ = 1, K_RULE = 1.6, TURN = 160;

  /* ---------- helpers ---------- */
  function add(p, tag, attrs) { var e = S(tag, attrs || {}); p.appendChild(e); return e; }
  function op(e, v) { if (!e) return; e._op = v; e.style.opacity = v; }
  function fade(L, list, to, ms, o) {
    o = o || {};
    (Array.isArray(list) ? list : [list]).forEach(function (e, i) {
      if (!e) return;
      var from = e._op == null ? 1 : e._op;
      L.tween(ms == null ? 600 : ms, function (t) { op(e, from + (to - from) * t); }, { delay: (o.delay || 0) + i * (o.stagger || 0), ease: "out" });
    });
  }
  function plus(p, v, s) { return [p[0] + v[0] * s, p[1] + v[1] * s]; }
  function lerp(p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }
  function world(f, p) {
    var t = f.th * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t), x = (p[0] - PV[0]) * f.k, y = (p[1] - PV[1]) * f.k;
    return [f.x + x * cs - y * sn, f.y + x * sn + y * cs];
  }
  function label(c, text, at, cls, dx, dy) {
    var e = add(c.gLab, "text", { "class": "t-lab " + (cls || "") });
    e.textContent = text; op(e, 0);
    c.labels.push({ el: e, at: at, dx: dx || 0, dy: dy || 0 });
    return e;
  }
  function sqPts(which, s) {
    if (which === "a") return [R, A, plus(A, [-1, 0], 3 * s), plus(R, [-1, 0], 3 * s)];
    if (which === "b") return [R, B, plus(B, [0, 1], 4 * s), plus(R, [0, 1], 4 * s)];
    return [A, B, plus(B, N, 5 * s), plus(A, N, 5 * s)];
  }
  /** cell n (0..24) of the square on the long side, filled row by row from the shortcut outward */
  function cQuad(n) {
    var i = n % 5, j = Math.floor(n / 5);
    var p = plus(plus(A, D, i), N, j);
    return [p, plus(p, D, 1), plus(plus(p, D, 1), N, 1), plus(p, N, 1)];
  }
  function cells(c, x0, y0, n, cls) {
    var out = [];
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      var q = [[x0 + i, y0 + j], [x0 + i + 1, y0 + j], [x0 + i + 1, y0 + j + 1], [x0 + i, y0 + j + 1]];
      var e = add(c.gCells, "polygon", { points: G.pts(q), "class": cls });
      e._home = q; e._mid = [x0 + i + 0.5, y0 + j + 0.5]; op(e, 0); out.push(e);
    }
    return out;
  }
  function popCells(L, list, stagger) {
    list.forEach(function (e, i) {
      L.tween(280, function (t) {
        op(e, Math.min(1, t * 1.5));
        var s = 0.3 + 0.7 * t, m = e._mid;
        e.setAttribute("transform", "translate(" + m[0] + " " + m[1] + ") scale(" + s.toFixed(3) + ") translate(" + (-m[0]) + " " + (-m[1]) + ")");
      }, { delay: i * stagger, ease: "back" });
    });
  }
  function countUp(L, el, n, ms) {
    el.textContent = "0"; op(el, 1);
    L.tween(ms, function (t, raw) { el.textContent = String(Math.max(1, Math.round(raw * n))); }, { ease: "linear" });
  }
  function fitDone(c, L) {
    c.nC.textContent = "25"; fade(L, c.nC, 1, 400);
    L.tween(1600, function (t) { op(c.glow, Math.abs(Math.sin(t * Math.PI * 2))); }, { then: function () { op(c.glow, 0.6); } });
    L.board(K.a + "9" + K.x + " + " + K.b + "16" + K.x + " = " + K.c + "25" + K.x);
  }
  var K = { a: '<span class="t-ka">', b: '<span class="t-kb">', c: '<span class="t-kc">', x: "</span>" };

  C.lesson.define({
    id: "pyth-squares", title: "The right-angle rule", w: 16, h: 12, durationMs: 110000,

    build: function (svg, L) {
      var c = { fig: { x: 8, y: 6, th: 0, k: K_GROUND }, labels: [] };
      var gf = c.gFig = add(svg, "g", { "class": "t-figg" });

      // the school ground
      c.gGround = add(gf, "g");
      c.ground = add(c.gGround, "rect", { x: 0, y: -3, width: 4, height: 3, rx: 0.12, "class": "t-ground" });
      c.trail = add(c.gGround, "path", { d: "M0,-3 L0,0 L4,0", pathLength: 1, "class": "t-trail" });
      c.flag = add(c.gGround, "g", { "class": "t-flag" });
      add(c.flag, "line", { x1: 4, y1: 0, x2: 4, y2: -1.15, "class": "t-pole" });
      add(c.flag, "polygon", { points: "4,-1.15 4.75,-0.92 4,-0.68", "class": "t-flagcloth" });
      c.walker = add(c.gGround, "circle", { cx: 0, cy: -3, r: 0.2, "class": "t-walker" });
      c.short = add(gf, "path", { d: "M0,-3 L4,0", pathLength: 1, "class": "t-short" });

      // squares and their small squares
      c.gSq = add(gf, "g");
      c.sqA = add(c.gSq, "polygon", { points: G.pts(sqPts("a", 0)), "class": "t-sq t-sq-a" });
      c.sqB = add(c.gSq, "polygon", { points: G.pts(sqPts("b", 0)), "class": "t-sq t-sq-b" });
      c.sqC = add(c.gSq, "polygon", { points: G.pts(sqPts("c", 0)), "class": "t-sq t-sq-c" });
      c.glow = add(c.gSq, "polygon", { points: G.pts(sqPts("c", 1)), "class": "t-glow" });
      c.gCells = add(c.gSq, "g");
      c.cellsA = cells(c, -3, -3, 3, "t-cellc-a");
      c.cellsB = cells(c, 0, 0, 4, "t-cellc-b");

      // the triangle on top
      c.gTri = add(gf, "g");
      c.tri = add(c.gTri, "polygon", { points: G.pts([R, A, B]), "class": "t-tri" });
      c.legA = add(c.gTri, "line", { x1: 0, y1: 0, x2: 0, y2: -3, "class": "t-leg-a" });
      c.legB = add(c.gTri, "line", { x1: 0, y1: 0, x2: 4, y2: 0, "class": "t-leg-b" });
      c.hyp = add(c.gTri, "line", { x1: 0, y1: -3, x2: 4, y2: 0, "class": "t-leg-c" });
      c.edge = add(c.gTri, "line", { x1: 0, y1: -3, x2: 4, y2: 0, "class": "t-edge-lit" });
      c.mark = add(c.gTri, "path", { d: "M0.45,0 L0.45,-0.45 L0,-0.45", "class": "t-mark2" });
      // tap targets for "which side is c?" (keyboard: Tab to a side, Enter to pick)
      c.hits = [
        { el: add(c.gTri, "line", { x1: 0, y1: 0, x2: 0, y2: -3, "class": "t-hitline" }), longest: false, name: "a short side" },
        { el: add(c.gTri, "line", { x1: 0, y1: 0, x2: 4, y2: 0, "class": "t-hitline" }), longest: false, name: "the other short side" },
        { el: add(c.gTri, "line", { x1: 0, y1: -3, x2: 4, y2: 0, "class": "t-hitline" }), longest: true, name: "the side facing the right angle" },
      ];
      c.hits.forEach(function (hd) {
        var e = hd.el;
        e.style.display = "none";
        e.setAttribute("role", "button"); e.setAttribute("aria-label", "Pick " + hd.name);
        function pick(ev) { if (ev) ev.preventDefault(); if (c.onTap) c.onTap(hd); }
        e.addEventListener("pointerdown", pick);
        e.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") pick(ev); });
      });

      [c.short, c.sqA, c.sqB, c.sqC, c.glow, c.tri, c.legA, c.legB, c.hyp, c.edge, c.mark].forEach(function (e) { op(e, 0); });
      c.trail.style.strokeDashoffset = 1; c.short.style.strokeDashoffset = 1;

      // labels: screen space, always upright
      c.gLab = add(svg, "g", { "class": "t-labg" });
      c.l3 = label(c, "3 m", [0, -1.5], "", -0.75, 0);
      c.l4 = label(c, "4 m", [2, 0], "", 0, 0.62);
      c.lQ = label(c, "? m", [2, -1.5], "t-lab-acc", 0.75, -0.6);
      c.n3 = label(c, "3", [0.45, -1.5], "t-lab-a");
      c.n4 = label(c, "4", [2, -0.4], "t-lab-b");
      c.n9 = label(c, "9", [-1.5, -1.5], "t-lab-big t-lab-a");
      c.n16 = label(c, "16", [2, 2], "t-lab-big t-lab-b");
      c.nC = label(c, "?", [3.5, -3.5], "t-lab-big t-lab-c");
      c.la = label(c, "a", [0.45, -1.4], "t-lab-a t-lab-l");
      c.lb = label(c, "b", [1.8, -0.4], "t-lab-b t-lab-l");
      c.lc = label(c, "c", [2.35, -1.95], "t-lab-c t-lab-l");   // just outside the long side
      return c;
    },

    frame: function (c) {
      var f = c.fig;
      c.gFig.setAttribute("transform", "translate(" + f.x + " " + f.y + ") rotate(" + f.th + ") scale(" + f.k + ") translate(" + (-PV[0]) + " " + (-PV[1]) + ")");
      c.labels.forEach(function (l) {
        var w = world(f, l.at);
        l.el.setAttribute("x", (w[0] + l.dx).toFixed(3)); l.el.setAttribute("y", (w[1] + l.dy).toFixed(3));
      });
    },

    steps: [
      /* ---- 1. the shortcut ---- */
      { caption: "You're at one corner of the school ground. The flag is at the far corner.",
        run: function (c, L) { L.board("Start → flag"); } },
      { caption: "Along the edges it is 3 metres, then 4 metres. That is 7 metres.",
        run: function (c, L) {
          L.tween(3600, function (t) {
            var d = 7 * t, p = d <= 3 ? [0, -3 + d] : [d - 3, 0];
            c.walker.setAttribute("cx", p[0]); c.walker.setAttribute("cy", p[1]);
            c.trail.style.strokeDashoffset = 1 - t;
            if (d >= 1.5 && !c.l3._op) op(c.l3, 1);
            if (d >= 5 && !c.l4._op) op(c.l4, 1);
          }, { ease: "inOut", delay: 300 });
          L.board("3 m + 4 m = " + K.c + "7 m" + K.x + ", the long way");
        } },
      { caption: "Cutting straight across is shorter. How long is the shortcut? Make a guess.",
        run: function (c, L) {
          op(c.short, 1);
          L.tween(1200, function (t) { c.short.style.strokeDashoffset = 1 - t; });
          fade(L, c.lQ, 1, 400, { delay: 1000 });
          L.board("Shortcut = " + K.c + "?" + K.x);
        },
        task: function (c, L, done) {
          L.ask("Your guess:", [{ label: "5 m", value: 5 }, { label: "6 m", value: 6 }, { label: "7 m", value: 7 }], function (v) {
            L.state.guess = v; c.lQ.textContent = v + " m?";
            L.board("Your guess: " + K.c + v + " m" + K.x);
            done(v);
          });
        } },
      { branch: function (c, L) { return L.state.guess === 7 ? 0 : 1; }, options: [
        { caption: "7 metres is the long way round. The shortcut has to be shorter." },
        { caption: "Let's find out if you're right." },
      ] },

      /* ---- 2. the triangle and the squares on the short sides ---- */
      { caption: "The edges and the shortcut make a triangle, with a right angle in the corner.",
        run: function (c, L) {
          L.tween(1800, function (t) { c.fig.k = K_GROUND + (K_SQ - K_GROUND) * t; });
          fade(L, [c.gGround, c.l3, c.l4, c.lQ], 0, 700);
          fade(L, [c.tri, c.legA, c.legB, c.hyp], 1, 700, { delay: 600 });
          fade(L, c.short, 0, 500, { delay: 900 });
          fade(L, [c.mark, c.n3, c.n4], 1, 500, { delay: 1500 });
          L.board("");
        } },
      { caption: "Build a square on each short side.",
        run: function (c, L) {
          ["a", "b"].forEach(function (w, i) {
            var el = w === "a" ? c.sqA : c.sqB;
            op(el, 1);
            L.tween(1100, function (t) { el.setAttribute("points", G.pts(sqPts(w, t))); }, { delay: i * 450, ease: "back" });
          });
        } },
      { caption: "3 × 3 is 9 small squares.",
        run: function (c, L) {
          popCells(L, c.cellsA, 150);
          L.wait(150, function () { countUp(L, c.n9, 9, 1350); });
          L.board(K.a + "3 × 3 = 9" + K.x);
        } },
      { caption: "4 × 4 is 16 small squares.",
        run: function (c, L) {
          popCells(L, c.cellsB, 100);
          L.wait(150, function () { countUp(L, c.n16, 16, 1600); });
          L.board(K.b + "4 × 4 = 16" + K.x);
        } },

      /* ---- 3. the square on the shortcut: predict, then watch ---- */
      { caption: "Now build a square on the shortcut.",
        run: function (c, L) {
          fade(L, [c.n3, c.n4], 0, 400);
          op(c.sqC, 1);
          L.tween(1100, function (t) { c.sqC.setAttribute("points", G.pts(sqPts("c", t))); }, { ease: "back" });
          fade(L, c.nC, 1, 400, { delay: 1000 });
          L.board(K.c + "?" + K.x);
        } },
      { caption: "Will the 9 and the 16 fill this square exactly?",
        run: function (c, L) { L.board(K.a + "9" + K.x + " + " + K.b + "16" + K.x + " → " + K.c + "?" + K.x); },
        task: function (c, L, done) {
          L.ask("Your prediction:", [{ label: "Spill over", value: "over" }, { label: "Fit exactly", value: "fit" }, { label: "Leave a gap", value: "gap" }], function (v) {
            L.state.predict = v; done(v);
          });
        } },
      { caption: "Watch them move across, one at a time.",
        run: function (c, L) {
          fade(L, [c.n9, c.n16, c.nC], 0, 300);
          var all = c.cellsA.concat(c.cellsB), landed = 0;
          L.boardLive("Squares in: " + K.c + "0" + K.x);
          all.forEach(function (e, n) {
            e.removeAttribute("transform");
            var from = e._home, to = cQuad(n);
            L.tween(700, function (t, raw) {
              var lift = Math.sin(Math.PI * raw) * 0.9;
              e.setAttribute("points", G.pts(from.map(function (p, k) { var q = lerp(p, to[k], t); return [q[0], q[1] - lift]; })));
            }, { delay: 300 + n * 130, then: function () { landed++; L.boardLive("Squares in: " + K.c + landed + K.x); } });
          });
        } },
      { branch: function (c, L) { return L.state.predict === "fit" ? 0 : 1; }, options: [
        { caption: "9 + 16 is 25. They fit exactly, just as you said.",
          run: function (c, L) { fitDone(c, L); } },
        { caption: "9 + 16 is 25. They fit exactly, with nothing left over.",
          run: function (c, L) { fitDone(c, L); } },
      ] },

      /* ---- 4. from 25 back to the side ---- */
      { caption: "25 small squares make one big square. How long is its side?",
        run: function (c, L) {
          fade(L, [c.sqA, c.sqB, c.glow], 0, 500);
          fade(L, c.edge, 1, 500, { delay: 300 });
          L.board(K.c + "25" + K.x + " squares. One side = ?");
        },
        task: function (c, L, done) {
          var misses = 0;
          L.number("Length of the lit side:", function (v) {
            if (v === 5) return true;
            misses++;
            if (misses >= 2) return "Count the squares along the lit side: 1, 2, 3, 4, 5. Type 5.";
            if (v === 25) return "25 is how many small squares there are. Count the squares along the lit side.";
            if (v === 7) return "7 is the long way round. Count the squares along the lit side.";
            return "Count the small squares along the lit side.";
          }, function (v) { done(v); });
        } },
      { caption: "Yes, 5, because 5 × 5 is 25. So the shortcut is 5 metres, not 7.",
        run: function (c, L) {
          fade(L, [c.gSq, c.nC, c.edge, c.mark, c.tri, c.legA, c.legB, c.hyp], 0, 600);
          L.tween(1600, function (t) { c.fig.k = K_SQ + (K_GROUND - K_SQ) * t; }, { delay: 400 });
          c.lQ.textContent = "5 m";
          c.short.style.strokeDashoffset = 0;
          fade(L, [c.gGround, c.short, c.l3, c.l4, c.lQ], 1, 700, { delay: 1200 });
          L.board("Shortcut = " + K.c + "5 m" + K.x + ", not 7 m" + (L.state.guess === 5 ? " · your guess was right!" : ""));
        } },

      /* ---- 5. the rule, with letters at last ---- */
      { caption: "That is the right-angle rule: a² + b² = c².",
        run: function (c, L) {
          fade(L, [c.gGround, c.short, c.l3, c.l4, c.lQ], 0, 500);
          L.tween(1200, function (t) { c.fig.k = K_GROUND + (K_RULE - K_GROUND) * t; }, { delay: 300 });
          fade(L, [c.tri, c.legA, c.legB, c.hyp, c.mark], 1, 600, { delay: 600 });
          fade(L, [c.la, c.lb, c.lc], 1, 400, { delay: 1200, stagger: 300 });
          L.board('<span class="t-rule">' + K.a + "a²" + K.x + " + " + K.b + "b²" + K.x + " = " + K.c + "c²" + K.x + "</span>");
        } },
      { caption: "c is always the longest side, facing the right angle.",
        run: function (c, L) {
          L.tween(1400, function (t) { op(c.edge, Math.abs(Math.sin(t * Math.PI * 2))); }, { then: function () { op(c.edge, 0); } });
        } },
      { caption: "Here is the triangle turned round. Tap side c.",
        run: function (c, L) {
          fade(L, [c.la, c.lb, c.lc], 0, 300);
          L.tween(1500, function (t) { c.fig.th = TURN * t; }, { delay: 300 });
          L.board("Which side is " + K.c + "c" + K.x + "?");
        },
        task: function (c, L, done) {
          // all three sides the same colour, so colour can't give the answer away
          c.legA.setAttribute("class", "t-leg-c"); c.legB.setAttribute("class", "t-leg-c");
          c.hits.forEach(function (hd) { hd.el.style.display = ""; hd.el.setAttribute("tabindex", "0"); hd.el.classList.remove("is-wrong"); });
          L.svg.classList.add("is-dragging-ok");
          c.onTap = function (hd) {
            if (!hd.longest) {
              hd.el.classList.add("is-wrong");
              L.board("That side touches the right angle. " + K.c + "c" + K.x + " faces it.");
              return;
            }
            c.onTap = null;
            L.svg.classList.remove("is-dragging-ok");
            c.hits.forEach(function (x) { x.el.style.display = "none"; x.el.removeAttribute("tabindex"); });
            c.legA.setAttribute("class", "t-leg-a"); c.legB.setAttribute("class", "t-leg-b");
            op(c.edge, 1); fade(L, c.lc, 1, 400);
            L.board("Yes: " + K.c + "c" + K.x + " is the longest side.");
            L.wait(900, function () { op(c.edge, 0); done("c"); });
          };
        } },
      { caption: "More than 2,500 years ago, Baudhāyana wrote this rule down in the Śulba Sūtras, guides for building fire altars.",
        hold: 1200,
        run: function (c, L) {
          L.tween(1200, function (t) { c.fig.th = TURN * (1 - t); });
          fade(L, [c.la, c.lb], 1, 400, { delay: 1000 });
          L.board('<span class="t-rule">' + K.a + "a²" + K.x + " + " + K.b + "b²" + K.x + " = " + K.c + "c²" + K.x + '</span><span class="t-rule-note">Baudhāyana · Śulba Sūtras · over 2,500 years ago</span>');
        } },
    ],
  });
})();
