/* Day 6 (trapeziums), rebuilt on the animation flow:
     quick reminder -> lesson video with guess stops -> hands-on (trap-field) -> check questions with
     mistake replays (trap-fixes.js) -> progress.
   This file holds the three watch pieces, all in the land look (Cogna.landKit) so the day feels like one story:
     trap-remind    ~15 s  quick reminder: two triangles make a parallelogram, so one triangle is half
     trap-lesson    ~2 min lesson video, Ramesh uncle's third field between a road and a canal. Two guess stops:
                           "tap the height" and "what will two copies make?" (the student finds out by doing it, next)
     trap-progress  ~12 s  progress: the trail stone lights up and the trapezium skill shows where it stands
   Every line the narrator can say is a literal `caption:` so tools/record-narration.mjs records it. */
(function () {
  "use strict";
  var C = window.Cogna, K = C.landKit, h = C.h;
  if (!K || !C.lesson || !K.twin) { console.error("[trap-day] needs lesson.js, land-kit.js and twin.js first"); return; }

  function place(g, x, y) { g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")"); }
  function who() { var p = C.data && C.data.profile; return p && p.id === "aarav" ? 0 : (p && p.id === "riya" ? 1 : 2); }
  /** pop a label (or any element) in at (x, y) */
  function popIn(L, el, x, y, delay) {
    L.set(el, { opacity: 0, scale: 0.4, svgOrigin: x + " " + y });
    L.to(el, { opacity: 1, scale: 1, duration: 0.4, delay: delay || 0, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
  }
  /** The copy lifts off the original, half-turns in the air and lands in its slot: a watch-only version of twin.fit. */
  function flyIn(c, L, tw, target, then) {
    tw.g.style.display = "";
    L.set(tw.g, { x: 0, y: 0, opacity: 1 });
    L.set(tw.knob.g, { opacity: 0 });            // nobody turns this copy by hand, so no knob (or its soft shadow)
    tw.apply(0);
    L.sfx("pop");
    K.liftUp(tw.piece, L, 0.2);
    var pr = { r: 0 };
    L.wait(300, function () { L.sfx("whoosh"); });
    L.to(pr, { r: 180, duration: 1.1, delay: 0.3, ease: "power2.inOut", onUpdate: function () { tw.apply(pr.r); } });
    L.to(tw.g, { x: target[0], duration: 1.1, delay: 0.3, ease: "power2.inOut" });
    L.to(tw.g, { keyframes: [{ y: target[1] - 56, duration: 0.55, ease: "power1.out" }, { y: target[1], duration: 0.55, ease: "power1.in" }], delay: 0.3 });
    L.wait(1450, function () { K.setDown(tw.piece, L); L.sfx("snap"); K.shake(c, L, 2); if (then) then(); });
  }
  C.trapKit = { place: place, popIn: popIn, flyIn: flyIn };

  /* =========================================================== trap-remind (quick reminder) */
  (function () {
    var W = 800, H = 340, U = 52;
    var T = [[0, 4], [6, 4], [2, 0]], SLOT = [[8, 0], [2, 0], [6, 4]], PARA = [[0, 4], [6, 4], [8, 0], [2, 0]];
    var X0 = (W - 8 * U) / 2, Y0 = 72;

    C.lesson.define({
      id: "trap-remind", title: "The triangle trick", cls: "t-pf t-tf t-flow", w: W, h: H, durationMs: 22000,
      build: function (svg, L) {
        var c = K.setup(svg, L);
        K.tree(c.world, 96, 292, 0.75, L);
        c.g = K.add(c.world, "g"); place(c.g, X0, Y0);
        c.field = K.field(c, c.g, T, U);
        c.twin = K.twin(c, c.g, { P: T, u: U, pivot: [3, 2], knobAt: [4.3, 3.05], stage: [0, 0], target: [2 * U, 0], slot: SLOT,
          bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, R: {} });
        c.seam = K.seam(c, c.g);
        c.outline = K.outline(c.g, PARA, U);
        c.tagHalf = K.tag(c.g, "half"); c.tagHalf.put(3.1 * U, 3.0 * U); c.tagHalf.init(L);
        L.set(c.field.g, { opacity: 0 });
        return c;
      },
      steps: [
        { caption: "Quick reminder. Remember the triangle trick?",
          run: function (c, L) { K.dropIn(c.field, c.field.g, L, 0.2); } },
        { caption: "Make a copy, turn it round, and slide it in.",
          run: function (c, L) {
            flyIn(c, L, c.twin, [2 * U, 0], function () {
              c.seam.flash(L, [6 * U, 4 * U], [2 * U, 0]);
              c.outline.draw(L, 0.25);
              L.wait(900, function () { L.sfx("chime"); });
            });
          } },
        { caption: "Two triangles make a parallelogram. So one triangle is exactly half of it.",
          run: function (c, L) { c.outline.hide(L); c.twin.away(L); L.wait(1250, function () { c.tagHalf.show(L); }); } },
        { caption: "Keep that trick ready. You'll need it today.", hold: 300 },
      ],
    });
  })();

  /* =========================================================== trap-lesson (lesson video, 2 guess stops) */
  (function () {
    var W = 800, H = 480, U = 52;
    var P = [[0, 4], [5, 4], [4, 0], [1, 0]];          // the same field as trap-field: top 3, bottom 5, height 4
    var FX0 = (W - 5 * U) / 2, FX = 150, FY = 186;     // the field starts in the middle and moves left for the puzzle
    var ROAD = [112, 146], CANAL = [448, 480];

    var R = {
      tapSlant: { caption: "That's a slanted side. It leans over, so it isn't the height." },
      tapDiag: { caption: "That line goes from corner to corner. It leans too." },
      tapBase: { caption: "That's the bottom side. The height stands up from it." },
      tapHint: { caption: "Look for the line that drops straight down, like a stone on a string." },
      tapRight: { caption: "Yes! It drops straight down and makes a square corner. The height is 4." },
      guessPara: { caption: "Good thinking. Let's test it with your own hands." },
      guessOther: { caption: "Interesting guess. Let's test it with your own hands." },
    };

    function scenery(c, L) {
      // the road along the top
      var road = K.add(c.world, "g", { "class": "t-flow-road" });
      K.add(road, "rect", { x: -20, y: ROAD[0], width: W + 40, height: ROAD[1] - ROAD[0], "class": "t-flow-asphalt" });
      K.add(road, "line", { x1: -20, y1: ROAD[0] + 3, x2: W + 20, y2: ROAD[0] + 3, "class": "t-flow-kerb" });
      K.add(road, "line", { x1: -20, y1: ROAD[1] - 3, x2: W + 20, y2: ROAD[1] - 3, "class": "t-flow-kerb" });
      K.add(road, "line", { x1: -20, y1: (ROAD[0] + ROAD[1]) / 2, x2: W + 20, y2: (ROAD[0] + ROAD[1]) / 2, "class": "t-flow-dash" });
      // a little cart that drives past once
      c.cart = K.add(road, "g", { "class": "t-flow-cart" });
      K.add(c.cart, "rect", { x: -30, y: -15, width: 46, height: 20, rx: 6, "class": "t-flow-cart-body" });
      K.add(c.cart, "path", { d: "M8 -15H20Q28 -15 28 -6V5H8Z", "class": "t-flow-cart-cab" });
      K.add(c.cart, "circle", { cx: -18, cy: 7, r: 6, "class": "t-flow-wheel" });
      K.add(c.cart, "circle", { cx: 16, cy: 7, r: 6, "class": "t-flow-wheel" });
      L.set(c.cart, { x: -80, y: (ROAD[0] + ROAD[1]) / 2 - 2 });
      // the canal along the bottom
      var canal = K.add(c.world, "g", { "class": "t-flow-canal" });
      K.add(canal, "rect", { x: -20, y: CANAL[0], width: W + 40, height: CANAL[1] - CANAL[0], "class": "t-flow-water" });
      var d = "";
      for (var x = -60; x < W + 80; x += 40) d += "M" + x + " " + (CANAL[0] + 15) + "q10 -6 20 0 M" + (x + 20) + " " + (CANAL[0] + 31) + "q10 -6 20 0 ";
      c.ripple = K.add(canal, "path", { d: d, "class": "t-flow-ripple" });
      L.to(c.ripple, { x: -40, duration: 3.2, repeat: -1, ease: "none" }, true);
      // the two edges that run side by side (lit up in step 2)
      c.par = K.add(c.world, "g", { "class": "t-pf-fx" });
      c.parTop = K.add(c.par, "path", { d: "M0 " + ROAD[1] + "H" + W, "class": "t-flow-parline" });
      c.parBot = K.add(c.par, "path", { d: "M0 " + CANAL[0] + "H" + W, "class": "t-flow-parline" });
      [ROAD[1], CANAL[0]].forEach(function (y) {
        [110, 690].forEach(function (x) {
          K.add(c.par, "path", { d: "M" + (x - 9) + " " + (y - 9) + "L" + x + " " + y + "L" + (x - 9) + " " + (y + 9) + "M" + (x + 4) + " " + (y - 9) + "L" + (x + 13) + " " + y + "L" + (x + 4) + " " + (y + 9), "class": "t-flow-parchev" });
        });
      });
      L.set([c.parTop, c.parBot], { strokeDasharray: W, strokeDashoffset: W });
      L.set(c.par, { opacity: 0 });
    }

    /** three small pieces of land we already know, each with a tick */
    function known(c, L) {
      var g = K.add(c.world, "g", { "class": "t-flow-known" }), u = 18, items = [];
      [[[[0, 3], [4, 3], [4, 0], [0, 0]], "rectangle", 490], [[[0, 3], [4, 3], [1, 0]], "triangle", 600], [[[0, 3], [3, 3], [4, 0], [1, 0]], "parallelogram", 715]]
        .forEach(function (d) {
          var gi = K.add(g, "g"); place(gi, d[2] - 2 * u, 236);
          K.field(c, gi, d[0], u);
          K.text(gi, d[1], 2 * u, 3 * u + 30, "t-flow-mini");
          var tick = K.add(gi, "g", { "class": "t-flow-tick" });
          K.add(tick, "circle", { cx: 2 * u, cy: -22, r: 13 });
          K.add(tick, "path", { d: "M" + (2 * u - 6) + " -22l4 4 8 -9" });
          L.set(gi, { opacity: 0 }); L.set(tick, { scale: 0, svgOrigin: 2 * u + " -22" });
          items.push({ g: gi, tick: tick });
        });
      var q = K.add(c.gF, "g", { "class": "t-pf-badge t-flow-q" });
      K.add(q, "circle", { cx: 2.5 * U, cy: 2 * U, r: 26 });
      K.text(q, "?", 2.5 * U, 2 * U + 2, "t-pf-badgeq t-flow-qmark");
      L.set(q, { scale: 0, svgOrigin: 2.5 * U + " " + 2 * U });
      return { g: g, items: items, q: q };
    }

    /** the lines to tap when finding the height (field coordinates) */
    function heightLines(c, L) {
      var lines = {};
      [["base", [0, 4], [5, 4]], ["slant", [0, 4], [1, 0]], ["diag", [0, 4], [4, 0]], ["drop", [1, 0], [1, 4]]].forEach(function (d) {
        var a = [d[1][0] * U, d[1][1] * U], b = [d[2][0] * U, d[2][1] * U];
        var g = K.add(c.gF, "g", { "class": "t-tf-pick is-" + d[0] + (d[0] === "diag" ? " is-shown" : "") });
        var vis = K.add(g, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "class": "t-tf-line" });
        var hit = K.add(g, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "class": "t-tf-hitline", tabindex: "-1", role: "button",
          "aria-label": d[0] === "drop" ? "the dashed line that drops straight down" : d[0] === "slant" ? "the left slanted side"
            : d[0] === "diag" ? "the dotted line from corner to corner" : "the bottom side" });
        L.set(g, { opacity: 0 });
        lines[d[0]] = { g: g, vis: vis, hit: hit };
      });
      // a stone on a string, for the right answer
      c.plumb = K.add(c.gF, "g", { "class": "t-flow-plumb" });
      c.plumbStr = K.add(c.plumb, "line", { x1: U, y1: 0, x2: U, y2: 0, "class": "t-flow-string" });
      c.plumbStone = K.add(c.plumb, "circle", { cx: U, cy: 0, r: 9, "class": "t-flow-stone" });
      L.set(c.plumb, { opacity: 0 });
      c.hMark = K.add(c.gF, "path", { d: "M" + (U + 14) + " " + 4 * U + "V" + (4 * U - 14) + "H" + U, "class": "t-tf-mark3" });
      L.set(c.hMark, { opacity: 0, scale: 0.2, svgOrigin: U + " " + 4 * U });
      c.hLab = K.text(c.gF, "height 4", U + 16, 2 * U, "t-pf-lab t-pf-start");
      L.set(c.hLab, { opacity: 0 });
      return lines;
    }

    C.lesson.define({
      id: "trap-lesson", title: "Meet the trapezium", cls: "t-pf t-tf t-flow", w: W, h: H, durationMs: 150000,

      build: function (svg, L) {
        var c = K.setup(svg, L);
        scenery(c, L);
        K.tree(c.world, 64, 110, 0.75, L);                 // a tree on the roadside
        c.sign = K.sign(c, W);
        L.set(c.sign.g, { opacity: 0 });

        c.fx = { x: FX0 };
        c.gF = K.add(c.world, "g"); place(c.gF, FX0, FY);
        c.field = K.field(c, c.gF, P, U, { pad: 1 });       // in view before Play: a real opening picture, not an empty box
        c.seamTop = K.seam(c, c.gF); c.seamBot = K.seam(c, c.gF);
        c.arrows = K.add(c.gF, "g", { "class": "t-tp-par" });
        [[2.5 * U, 0], [2.5 * U, 4 * U]].forEach(function (q) {
          K.add(c.arrows, "path", { d: "M" + (q[0] - 8) + " " + (q[1] - 8) + "L" + q[0] + " " + q[1] + "L" + (q[0] - 8) + " " + (q[1] + 8), "class": "t-tp-arrow" });
          K.add(c.arrows, "path", { d: "M" + (q[0] + 4) + " " + (q[1] - 8) + "L" + (q[0] + 12) + " " + q[1] + "L" + (q[0] + 4) + " " + (q[1] + 8), "class": "t-tp-arrow" });
        });
        L.set(c.arrows, { opacity: 0 });
        c.tagName = K.tag(c.gF, "trapezium"); c.tagName.put(2.5 * U, 2.1 * U); c.tagName.init(L);
        c.topLab = K.text(c.gF, "top 3", 2.5 * U, -22);
        c.botLab = K.text(c.gF, "bottom 5", 2.5 * U, 4 * U + 36);
        L.set([c.topLab, c.botLab], { opacity: 0 });
        c.lines = heightLines(c, L);
        c.known = known(c, L);
        // "two copies?": a dashed ghost of the field beside it
        c.ghost = K.add(c.world, "polygon", { points: K.px(P, U), "class": "t-pf-ghost t-flow-ghost" });
        place(c.ghost, FX + 5.9 * U, FY);
        L.set(c.ghost, { opacity: 0 });
        c.ghostTag = K.tag(c.world, "a copy?"); c.ghostTag.put(FX + 8.4 * U, FY + 2 * U); c.ghostTag.init(L);
        return c;
      },

      steps: [
        /* ---- the field, the road and the canal ---- */
        { branch: who,
          options: [
            { caption: "Aarav, this is Ramesh uncle's third field. A road runs along the top of it, and a canal along the bottom.", run: arrive },
            { caption: "Riya, this is Ramesh uncle's third field. A road runs along the top of it, and a canal along the bottom.", run: arrive },
            { caption: "This is Ramesh uncle's third field. A road runs along the top of it, and a canal along the bottom.", run: arrive },
          ] },
        { caption: "The road and the canal run side by side and never meet. They are parallel.",
          run: function (c, L) {
            L.to(c.par, { opacity: 1, duration: 0.3 });
            L.to(c.parTop, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut" });
            L.to(c.parBot, { strokeDashoffset: 0, duration: 1.3, delay: 0.5, ease: "power2.inOut", onComplete: function () { L.sfx("sparkle"); } });
          } },
        { caption: "So the top and the bottom of the field are parallel too. A shape with a pair of parallel sides is called a trapezium.",
          run: function (c, L) {
            L.to(c.par, { opacity: 0.35, duration: 0.6 });
            c.seamTop.flash(L, [U, 0], [4 * U, 0]);
            L.wait(700, function () { c.seamBot.flash(L, [0, 4 * U], [5 * U, 4 * U]); });
            L.to(c.arrows, { opacity: 1, duration: 0.4, delay: 1.3 });
            L.wait(3400, function () { c.tagName.show(L); });
          } },
        { caption: "Ramesh uncle wants to sow seeds here. To buy the right amount, he needs to know how much land there is.",
          run: function (c, L) {
            c.tagName.hide(L);
            L.to(c.par, { opacity: 0, duration: 0.5 });
            L.to(c.sign.g, { opacity: 1, duration: 0.3, delay: 0.6, onStart: function () { L.sfx("pop"); } });
            L.wait(700, function () { c.sign.pop(L); });
            L.wait(1600, function () { K.sheen(c, L, c.field, 5 * U, 4 * U); });
          } },
        { caption: "Its top is 3, and its bottom is 5.",
          run: function (c, L) {
            popIn(L, c.topLab, 2.5 * U, -22, 0.5);
            popIn(L, c.botLab, 2.5 * U, 4 * U + 36, 1.6);
          } },

        /* ---- guess stop 1: which line is the height? ---- */
        { caption: "Now the height. Tap the line that shows the height of this field.",
          run: function (c, L) {
            L.to(c.arrows, { opacity: 0, duration: 0.3 });
            L.to(Object.keys(c.lines).map(function (k) { return c.lines[k].g; }), { opacity: 1, duration: 0.4, delay: 0.3 });
          },
          task: function (c, L, done) {
            var over = false, misses = 0;
            Object.keys(c.lines).forEach(function (k) {
              var ln = c.lines[k];
              ln.g.classList.add("is-live"); ln.hit.setAttribute("tabindex", "0");
              function pick(ev) {
                if (over) return;
                if (ev) ev.preventDefault();
                if (k === "drop") { win(); return; }
                misses++; L.sfx("oops"); K.shake(c, L, 3);
                ln.g.classList.add("is-wrong");
                L.wait(900, function () { ln.g.classList.remove("is-wrong"); });
                L.say((k === "slant" ? R.tapSlant : k === "diag" ? R.tapDiag : R.tapBase).caption, function () {
                  if (misses >= 2 && !over) { c.lines.drop.g.classList.add("is-hint"); L.say(R.tapHint.caption); }
                });
              }
              L.listen(ln.hit, "click", pick);
              L.listen(ln.hit, "keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") pick(ev); });
            });
            function win() {
              over = true;
              Object.keys(c.lines).forEach(function (k) { var ln = c.lines[k]; ln.g.classList.remove("is-live", "is-hint"); ln.hit.setAttribute("tabindex", "-1"); });
              L.to(["slant", "diag", "base"].map(function (k) { return c.lines[k].g; }), { opacity: 0, duration: 0.3 });
              c.lines.drop.g.classList.add("is-correct");
              L.sfx("pickup");
              // the stone drops on its string, straight down the height
              L.set(c.plumb, { opacity: 1 });
              var pr = { y: 0 };
              L.to(pr, { y: 4 * U - 9, duration: 0.9, ease: "bounce.out", onUpdate: function () {
                c.plumbStr.setAttribute("y2", pr.y.toFixed(1)); c.plumbStone.setAttribute("cy", pr.y.toFixed(1));
              } }, true);
              L.wait(420, function () { L.sfx("thud"); });
              L.wait(1000, function () {
                L.sfx("snap");
                L.to(c.hMark, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(3)" }, true);
                L.to(c.hLab, { opacity: 1, duration: 0.3, delay: 0.2 }, true);
                L.to(c.plumb, { opacity: 0, duration: 0.5, delay: 0.6 }, true);
                L.sfx("chime");
              });
              L.wait(1100, function () { L.say(R.tapRight.caption, function () { done("drop"); }); });
            }
          } },

        /* ---- the puzzle ---- */
        { caption: "We know the area of rectangles, triangles and parallelograms. But this field is none of them.",
          run: function (c, L) {
            L.to([c.topLab, c.botLab], { opacity: 0.35, duration: 0.4 });
            L.to([c.hLab, c.hMark], { opacity: 0, duration: 0.4 });
            L.to(c.lines.drop.g, { opacity: 0.4, duration: 0.4 });
            // the field slides left to make room for the shapes we already know
            L.to(c.fx, { x: FX, duration: 0.8, ease: "power2.inOut", onUpdate: function () { place(c.gF, c.fx.x, FY); } });
            c.known.items.forEach(function (it, i) {
              L.to(it.g, { opacity: 1, duration: 0.35, delay: 0.9 + i * 0.9, onStart: function () { L.sfx("pop"); } });
              L.to(it.tick, { scale: 1, duration: 0.4, delay: 1.25 + i * 0.9, ease: "back.out(3)", onStart: function () { L.sfx("tick", 6 + i * 3); } });
            });
            L.to(c.known.q, { scale: 1, duration: 0.45, delay: 4.1, ease: "back.out(3)", onStart: function () { L.sfx("oops"); } });
          } },

        /* ---- guess stop 2: what will two copies make? ---- */
        { caption: "Think back to the triangle trick. What do you think two copies of this field will make?",
          run: function (c, L) {
            L.to(c.known.g, { opacity: 0, duration: 0.5 });
            L.to(c.known.q, { scale: 0, duration: 0.3, ease: "power2.in" });
            L.to(c.ghost, { opacity: 1, duration: 0.5, delay: 0.5 });
            c.ghostTag.show(L, 0.9);
            if (!L.reduced) L.to(c.ghost, { y: "-=6", duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1 }, true);
          },
          task: function (c, L, done) {
            L.ask("Two copies of this field make…", [
              { label: "A rectangle", value: "rect" }, { label: "A parallelogram", value: "para" }, { label: "A triangle", value: "tri" },
            ], function (v) {
              L.sfx(v === "para" ? "chime" : "pop");
              L.say((v === "para" ? R.guessPara : R.guessOther).caption, function () { done(v); });
            });
          } },
        { caption: "Let's find out. On the next screen, make the copy yourself.",
          run: function (c, L) { c.ghostTag.hide(L); L.to(c.ghost, { opacity: 0.25, duration: 0.6 }); }, hold: 400 },
      ],
    });

    function arrive(c, L) {
      L.to(c.cart, { x: W + 80, duration: 4.2, delay: 0.4, ease: "none", onStart: function () { L.sfx("whoosh"); } }, true);
      K.hop(c.field, L, 0.6);
    }
  })();

  /* =========================================================== trap-progress (end of the day) */
  (function () {
    var W = 800, H = 196, R0 = 24;
    function stoneXY(i) { return [70 + i * 73, 98 + 30 * Math.sin(i * 0.95)]; }
    function status() {
      try { var s = C.state && C.state.get().skills; return (s && s.a4 && s.a4.status) || "untaught"; } catch (e) { return "untaught"; }
    }
    function dayDone(n) { try { return C.state ? C.state.isDayDone(n) : n < 6; } catch (e) { return n < 6; } }
    function chip(L) {
      var st = status(), el = C.toneChip ? C.toneChip(st) : null;
      L.board('<span class="t-flow-skill"><span class="t-flow-skill-name">Trapeziums</span>' + (el ? el.outerHTML : "") + "</span>");
    }

    C.lesson.define({
      id: "trap-progress", title: "Your trail", cls: "t-pf t-flow t-flow-prog", w: W, h: H, durationMs: 16000,
      build: function (svg, L) {
        var c = K.setup(svg, L), d = "";
        for (var i = 0; i < 10; i++) { var p = stoneXY(i); d += (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }
        K.add(c.world, "path", { d: d, "class": "t-flow-path" });
        c.walked = K.add(c.world, "path", { d: d, "class": "t-flow-path is-walked" });
        var len = 0; for (var j = 1; j < 10; j++) { var a = stoneXY(j - 1), b = stoneXY(j); len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
        c.len = len; c.seg = len / 9;
        L.set(c.walked, { strokeDasharray: len, strokeDashoffset: len - 4 * c.seg });
        c.stones = [];
        for (var n = 1; n <= 10; n++) {
          var q = stoneXY(n - 1), g = K.add(c.world, "g", { "class": "t-flow-stone2 " + (n < 6 && dayDone(n) ? "is-done" : n === 6 ? "is-today" : "is-later") });
          K.add(g, "ellipse", { cx: q[0] + 3, cy: q[1] + 8, rx: R0, ry: 9, "class": "t-flow-stone-shadow" });
          K.add(g, "circle", { cx: q[0], cy: q[1], r: R0, "class": "t-flow-stone-face" });
          K.add(g, "path", { d: "M" + (q[0] - 8) + " " + q[1] + "l6 6 11 -12", "class": "t-flow-stone-check" });
          K.text(g, String(n), q[0], q[1] + 1, "t-flow-stone-num");
          L.set(g, { opacity: 0, scale: 0.5, svgOrigin: q[0] + " " + q[1] });
          c.stones.push(g);
        }
        var s6 = stoneXY(5);
        c.ring = K.add(c.world, "circle", { cx: s6[0], cy: s6[1], r: R0, "class": "t-flow-ring" });
        L.set(c.ring, { opacity: 0, scale: 1, svgOrigin: s6[0] + " " + s6[1] });
        return c;
      },
      steps: [
        { caption: "Day 6 done!",
          run: function (c, L) {
            c.stones.forEach(function (g, i) {
              L.to(g, { opacity: 1, scale: 1, duration: 0.35, delay: 0.1 + i * 0.09, ease: "back.out(2.6)", onStart: function () { L.sfx("tick", i); } });
            });
            L.to(c.walked, { strokeDashoffset: c.len - 5 * c.seg, duration: 0.7, delay: 1.1, ease: "power2.inOut" });
            L.wait(1700, function () {
              var g = c.stones[5];
              g.classList.remove("is-today"); g.classList.add("is-done", "is-new");
              L.sfx("chime");
              L.to(g, { keyframes: [{ scale: 1.3, duration: 0.16, ease: "power2.out" }, { scale: 1, duration: 0.5, ease: "back.out(3)" }] });
              L.set(c.ring, { opacity: 0.9, scale: 1 });
              L.to(c.ring, { opacity: 0, scale: 2.3, duration: 0.9, ease: "power2.out" });
            });
          } },
        { branch: function () { var st = status(); return st === "secure" ? 0 : st === "shaky" ? 1 : 2; },
          options: [
            { caption: "Trapeziums are secure now. You got two right in a row.", run: function (c, L) { chip(L); L.sfx("sparkle"); } },
            { caption: "Trapeziums are shaky for now. One more right answer tomorrow makes them secure.", run: function (c, L) { chip(L); } },
            { caption: "Trapeziums need a bit more practice, so they'll come back tomorrow.", run: function (c, L) { chip(L); } },
          ] },
        { caption: "Tomorrow, a field with lots of corners. We'll split it into pieces.",
          run: function (c, L) {
            var g = c.stones[6], q = stoneXY(6);
            L.set(g, { svgOrigin: q[0] + " " + q[1] });
            L.to(g, { keyframes: [{ y: -10, duration: 0.25, ease: "power2.out" }, { y: 0, duration: 0.55, ease: "bounce.out" }], delay: 0.4 });
            L.wait(400, function () { L.sfx("pop"); });
          },
          hold: 300 },
      ],
    });
  })();
})();
