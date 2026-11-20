/* Day 6 mistake replays: short "watch" clips that play right after a wrong answer in the check questions and
   start from the student's OWN wrong number. Each one is wired to one wrong answer in data/days.js (`replay:`),
   and a fresh question of the same kind follows it (`retry:`).
     trap-fix-100  said 100 for parallel sides 8 and 12, height 5: forgot the half (100 is two trapeziums)
     trap-fix-60   said 60 for the same shape: used only the bottom side (12 × 5 is a bigger rectangle)
     trap-fix-35   said 35 for parallel sides 9 and 5, slanted side 5, height 4: used the slanted side as the height
   Same land look as the lessons (Cogna.landKit) and the helpers in trap-day.js (Cogna.trapKit).
   Every spoken line is a literal `caption:` so tools/record-narration.mjs records it. */
(function () {
  "use strict";
  var C = window.Cogna, K = C.landKit, TK = C.trapKit;
  if (!K || !C.lesson || !TK) { console.error("[trap-fixes] needs land-kit.js, twin.js and trap-day.js first"); return; }
  var W = 800, place = TK.place, popIn = TK.popIn;

  function lab(parent, str, x, y, L, cls) { var t = K.text(parent, str, x, y, "t-pf-lab " + (cls || "")); L.set(t, { opacity: 0 }); return t; }
  function show(L, t, delay) { popIn(L, t, Number(t.getAttribute("x")), Number(t.getAttribute("y")), delay); }
  /** a measuring bracket under the base, with its label (hidden until grown) */
  function bracket(parent, cls) {
    var p = K.add(parent, "path", { "class": "t-pf-bracket " + (cls || "") }); p.style.opacity = 0;
    var t = K.text(parent, "", 0, 0, "t-pf-dim " + (cls || "")); t.style.opacity = 0;
    return { path: p, lab: t };
  }
  function grow(L, b, x0, x1, y, label) {
    b.path.setAttribute("d", "M" + x0 + " " + (y - 9) + "V" + (y + 9) + "M" + x0 + " " + y + "H" + x1 + "M" + x1 + " " + (y - 9) + "V" + (y + 9));
    b.lab.textContent = label; b.lab.setAttribute("x", (x0 + x1) / 2); b.lab.setAttribute("y", y + 26);
    L.set(b.path, { opacity: 1, scaleX: 0, svgOrigin: x0 + " " + y });
    L.set(b.lab, { opacity: 0, scale: 0.4, svgOrigin: (x0 + x1) / 2 + " " + (y + 26) });
    L.to(b.path, { scaleX: 1, duration: 0.6, ease: "power2.inOut" });
    L.to(b.lab, { opacity: 1, scale: 1, duration: 0.4, delay: 0.55, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
  }
  function pulse(L, el) {
    if (L.reduced) return;
    L.to(el, { keyframes: [{ scale: 1.25, duration: 0.18, ease: "power2.out" }, { scale: 1, duration: 0.4, ease: "back.out(3)" }],
      svgOrigin: el.getAttribute("x") + " " + el.getAttribute("y") }, true);
  }

  /* ---------------------------------------------------------- 100: two trapeziums, not one */
  (function () {
    var u = 30, H = 320;
    var P = [[0, 5], [12, 5], [10, 0], [2, 0]], SLOT = [[22, 0], [10, 0], [12, 5], [20, 5]], PARA = [[0, 5], [20, 5], [22, 0], [2, 0]];
    var X0 = (W - 22 * u) / 2, Y0 = 70;
    C.lesson.define({
      id: "trap-fix-100", title: "Where 100 comes from", cls: "t-pf t-tf t-flow t-flow-fix", w: W, h: H, durationMs: 32000,
      build: function (svg, L) {
        var c = K.setup(svg, L);
        c.g = K.add(c.world, "g"); place(c.g, X0, Y0);
        c.field = K.field(c, c.g, P, u, { pad: 1 });
        c.twin = K.twin(c, c.g, { P: P, u: u, pivot: [6, 2.5], knobAt: [8, 3.5], stage: [0, 0], target: [10 * u, 0], slot: SLOT,
          bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, R: {} });
        c.seam = K.seam(c, c.g); c.outline = K.outline(c.g, PARA, u);
        c.top = lab(c.g, "8", 6 * u, -22, L);
        c.bot = lab(c.g, "12", 6 * u, 5 * u + 30, L);
        c.hLine = K.add(c.g, "line", { x1: 2 * u, y1: 0, x2: 2 * u, y2: 5 * u, "class": "t-pf-height" }); c.hLine.style.opacity = 0;
        c.hLab = lab(c.g, "5", 2 * u + 12, 2.5 * u, L, "t-pf-start");
        c.bA = bracket(c.g, ""); c.bB = bracket(c.g, "is-copy");
        c.tagHalf = K.tag(c.g, "half"); c.tagHalf.put(6 * u, 2.6 * u); c.tagHalf.init(L);
        L.set(c.field.g, { opacity: 0 });
        return c;
      },
      steps: [
        { caption: "You said 100. Let's see where 100 comes from.",
          run: function (c, L) {
            K.dropIn(c.field, c.field.g, L, 0.2);
            show(L, c.top, 1.3); show(L, c.bot, 1.6);
            L.to(c.hLine, { opacity: 1, duration: 0.3, delay: 1.9 }); show(L, c.hLab, 1.9);
          } },
        { caption: "Make a copy and turn it round. Two of these trapeziums fit together into a parallelogram.",
          run: function (c, L) {
            L.to([c.bot, c.hLine, c.hLab], { opacity: 0, duration: 0.3 });
            TK.flyIn(c, L, c.twin, [10 * u, 0], function () {
              c.seam.flash(L, [12 * u, 5 * u], [10 * u, 0]);
              c.outline.draw(L, 0.25);
              L.wait(900, function () { L.sfx("chime"); });
            });
          } },
        { caption: "Its base is 12 + 8, which is 20, and its height is 5. So 20 × 5 = 100.",
          run: function (c, L) {
            c.outline.hide(L);
            var y = 5 * u + K.SLAB[1] + 18;
            L.wait(300, function () { grow(L, c.bA, 0, 12 * u, y, "12"); });
            L.wait(1900, function () { grow(L, c.bB, 12 * u, 20 * u, y, "8"); });
            L.wait(3800, function () { L.board("(12 + 8) × 5 = <b>100</b>"); L.sfx("chime"); });
          } },
        { caption: "So 100 is the area of both shapes together. But the question had just one trapezium.",
          run: function (c, L) { K.hop(c.field, L, 0.3); L.wait(900, function () { K.wiggle(c.twin.piece.lift, L, "rotation", 3); }); } },
        { caption: "Take the copy away. One trapezium is half of 100, which is 50 square centimetres.",
          run: function (c, L) {
            L.to([c.bB.path, c.bB.lab], { opacity: 0, duration: 0.3 });
            c.twin.away(L);
            L.wait(1300, function () { c.tagHalf.show(L); L.board("half of 100 = <b>50</b>"); });
            L.wait(3000, function () { L.board('<span class="t-rule">½ × (8 + 12) × 5 = 50 cm²</span><span class="t-rule-note">add the parallel sides, times the height, then halve</span>'); });
          } },
      ],
    });
  })();

  /* ---------------------------------------------------------- 60: the bottom side alone makes a bigger rectangle */
  (function () {
    var u = 40, H = 320;
    var P = [[0, 5], [12, 5], [10, 0], [2, 0]], RECT = [[0, 0], [12, 0], [12, 5], [0, 5]];
    var CL = [[0, 0], [2, 0], [0, 5]], CR = [[10, 0], [12, 0], [12, 5]];
    var X0 = (W - 12 * u) / 2, Y0 = 56;
    C.lesson.define({
      id: "trap-fix-60", title: "Where 60 comes from", cls: "t-pf t-tf t-flow t-flow-fix", w: W, h: H, durationMs: 32000,
      build: function (svg, L) {
        var c = K.setup(svg, L);
        c.g = K.add(c.world, "g"); place(c.g, X0, Y0);
        c.field = K.field(c, c.g, P, u, { pad: 1 });
        c.corners = K.add(c.g, "g", { "class": "t-pf-fx" });
        [CL, CR].forEach(function (Q) { K.add(c.corners, "polygon", { points: K.px(Q, u), "class": "t-pf-brokenbit", fill: "url(#" + c.hatchId + ")" }); });
        L.set(c.corners, { opacity: 0 });
        c.rect = K.add(c.g, "polygon", { points: K.px(RECT, u), "class": "t-flow-rect t-pf-fx" });
        var per = 2 * (12 + 5) * u;
        L.set(c.rect, { opacity: 0, strokeDasharray: per, strokeDashoffset: per });
        c.per = per;
        c.top = lab(c.g, "8", 6 * u, -22, L);
        c.bot = lab(c.g, "12", 6 * u, 5 * u + 30, L);
        c.hLine = K.add(c.g, "line", { x1: 2 * u, y1: 0, x2: 2 * u, y2: 5 * u, "class": "t-pf-height" }); c.hLine.style.opacity = 0;
        c.hLab = lab(c.g, "5", 2 * u + 12, 2.5 * u, L, "t-pf-start");
        L.set(c.field.g, { opacity: 0 });
        return c;
      },
      steps: [
        { caption: "You said 60. That's 12 × 5, the bottom side times the height.",
          run: function (c, L) {
            K.dropIn(c.field, c.field.g, L, 0.2);
            show(L, c.top, 1.3); show(L, c.bot, 1.6);
            L.to(c.hLine, { opacity: 1, duration: 0.3, delay: 1.9 }); show(L, c.hLab, 1.9);
            L.wait(2900, function () { pulse(L, c.bot); pulse(L, c.hLab); });
          } },
        { caption: "12 × 5 is the area of a rectangle, like this one. It's bigger than the trapezium.",
          run: function (c, L) {
            L.set(c.rect, { opacity: 1 });
            L.to(c.rect, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut", onStart: function () { L.sfx("whoosh"); },
              onComplete: function () { L.set(c.rect, { strokeDasharray: "12 8" }); L.sfx("pop"); } });
            L.wait(1500, function () { L.board("12 × 5 = <b>60</b>"); });
          } },
        { caption: "See these two corners? They're inside the rectangle, but they're not part of the shape.",
          run: function (c, L) {
            L.to(c.corners, { opacity: 1, duration: 0.4, delay: 0.3, onStart: function () { L.sfx("oops"); } });
            L.to(c.corners, { opacity: 0.4, duration: 0.42, repeat: 3, yoyo: true, delay: 0.9, ease: "sine.inOut" });
          } },
        { caption: "The top is only 8, so both parallel sides count. Half of (8 + 12) × 5 is 50 square centimetres.",
          run: function (c, L) {
            L.to([c.corners, c.rect], { opacity: 0, duration: 0.5 });
            L.wait(400, function () { pulse(L, c.top); L.sfx("sparkle"); });
            L.wait(1600, function () { L.board('<span class="t-rule">½ × (8 + 12) × 5 = 50 cm²</span><span class="t-rule-note">both parallel sides count: add them, times the height, then halve</span>'); L.sfx("chime"); });
          } },
      ],
    });
  })();

  /* ---------------------------------------------------------- 35: the slanted side is longer than the height */
  (function () {
    var u = 44, H = 340;
    var P = [[0, 4], [9, 4], [8, 0], [3, 0]];
    var X0 = (W - 9 * u) / 2, Y0 = 100, LEAN = -Math.atan2(3, 4) * 180 / Math.PI, STAND = 2.55;
    C.lesson.define({
      id: "trap-fix-35", title: "Where 35 comes from", cls: "t-pf t-tf t-flow t-flow-fix", w: W, h: H, durationMs: 32000,
      build: function (svg, L) {
        var c = K.setup(svg, L);
        c.g = K.add(c.world, "g"); place(c.g, X0, Y0);
        c.field = K.field(c, c.g, P, u, { pad: 1 });
        c.top = lab(c.g, "5", 5.5 * u, -22, L);
        c.bot = lab(c.g, "9", 4.5 * u, 4 * u + 30, L);
        c.slantLab = lab(c.g, "5", 1.5 * u - 18, 2 * u - 6, L, "t-pf-end t-flow-bad");
        c.hLine = K.add(c.g, "line", { x1: 3 * u, y1: 0, x2: 3 * u, y2: 4 * u, "class": "t-pf-height" }); c.hLine.style.opacity = 0;
        c.hLab = lab(c.g, "4", 3 * u + 14, 2 * u, L, "t-pf-start");
        c.hMark = K.add(c.g, "path", { d: "M" + (3 * u + 14) + " " + 4 * u + "V" + (4 * u - 14) + "H" + 3 * u, "class": "t-tf-mark3" });
        L.set(c.hMark, { opacity: 0, scale: 0.2, svgOrigin: 3 * u + " " + 4 * u });
        // the slanted side as a rod you can pick up: it turns about its bottom end
        c.rod = K.add(c.g, "g", { "class": "t-pf-fx" });
        K.add(c.rod, "line", { x1: 4, y1: 4 * u + 8, x2: 3 * u + 4, y2: 8, "class": "t-flow-rod-shadow", filter: "url(#" + c.blurSmallId + ")" });
        K.add(c.rod, "line", { x1: 0, y1: 4 * u, x2: 3 * u, y2: 0, "class": "t-flow-rod" });
        L.set(c.rod, { opacity: 0, svgOrigin: "0 " + 4 * u });
        c.over = K.add(c.g, "line", { x1: STAND * u, y1: 0, x2: STAND * u, y2: -u, "class": "t-flow-over t-pf-fx" });
        c.overLab = lab(c.g, "too long", STAND * u - 16, -u / 2, L, "t-pf-end t-flow-bad");
        L.set(c.over, { opacity: 0 });
        L.set(c.field.g, { opacity: 0 });
        return c;
      },
      steps: [
        { caption: "You said 35. That used the slanted side, 5, as the height.",
          run: function (c, L) {
            K.dropIn(c.field, c.field.g, L, 0.2);
            show(L, c.top, 1.3); show(L, c.bot, 1.6);
            L.to(c.rod, { opacity: 1, duration: 0.35, delay: 2.1, onStart: function () { L.sfx("pop"); } });
            show(L, c.slantLab, 2.3);
          } },
        { caption: "Stand the slanted side up next to the real height. Look, it sticks out above the top!",
          run: function (c, L) {
            L.to(c.slantLab, { opacity: 0, duration: 0.3 });
            L.to(c.hLine, { opacity: 1, duration: 0.3, delay: 0.2 }); show(L, c.hLab, 0.3);
            L.wait(700, function () { L.sfx("pickup"); });
            L.to(c.rod, { scale: 1.03, duration: 0.2, delay: 0.7, ease: "power2.out" });
            L.to(c.rod, { rotation: LEAN, duration: 0.9, delay: 0.95, ease: "power2.inOut", onStart: function () { L.sfx("whoosh"); } });
            L.to(c.rod, { x: STAND * u, duration: 0.7, delay: 1.95, ease: "power2.inOut" });
            L.to(c.rod, { scale: 1, duration: 0.3, delay: 2.65, ease: "back.out(2.6)", onComplete: function () { L.sfx("thud"); } });
            L.wait(3100, function () {
              L.set(c.over, { opacity: 1 }); show(L, c.overLab, 0);
              L.to(c.over, { opacity: 0.35, duration: 0.35, repeat: 3, yoyo: true, ease: "sine.inOut" });
              L.sfx("oops");
            });
          } },
        { caption: "A slanted side leans over, so it's longer than the height. The height is the straight-up 4.",
          run: function (c, L) {
            L.to([c.rod, c.over, c.overLab], { opacity: 0, duration: 0.5, delay: 0.2 });
            L.wait(900, function () { L.sfx("snap"); });
            L.to(c.hMark, { opacity: 1, scale: 1, duration: 0.45, delay: 0.9, ease: "back.out(3)" });
            L.wait(1500, function () { pulse(L, c.hLab); L.sfx("sparkle"); });
          } },
        { caption: "So the area is half of (9 + 5) × 4, which is 28 square centimetres.",
          run: function (c, L) {
            L.wait(300, function () { L.board('<span class="t-rule">½ × (9 + 5) × 4 = 28 cm²</span><span class="t-rule-note">use the straight-up height, never the slanted side</span>'); L.sfx("chime"); });
          } },
      ],
    });
  })();
})();
