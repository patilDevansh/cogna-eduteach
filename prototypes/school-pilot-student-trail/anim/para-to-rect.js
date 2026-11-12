/* Parallelogram -> rectangle: same base, same height, so area = base x height. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  K.define({
    id: "para-to-rect", title: "A parallelogram becomes a rectangle", w: 14, h: 11, durationMs: 28000,
    build: function (S) {
      var c = {};
      c.para = K.poly(S, [[3, 9], [9, 9], [11, 5], [5, 5]], "t-shape");
      // the two pieces, hidden until the cut
      c.q = K.poly(S, [[5, 5], [5, 9], [9, 9], [11, 5]], "t-shape t-fade");
      c.t = K.poly(S, [[3, 9], [5, 9], [5, 5]], "t-tint t-fade t-mv");
      c.base = K.text(S, 6, 10.2, "base = 6", "t-acc");
      c.hLine = K.height(S, 5, 5, 9);
      c.mk = K.mark(S, 5, 9, [-1, 0], [0, -1], 0.5);
      c.hLab = K.text(S, 5.5, 7, "h = 4", "t-start t-acc t-fade");
      c.rect = K.rect(S, 5, 5, 6, 4, "t-hi t-fade");
      c.wLab = K.text(S, 8, 4.3, "6", "t-acc t-fade");
      c.tLab = K.text(S, 11.7, 7, "4", "t-acc t-fade");
      c.f1 = K.text(S, 7, 1.6, "area = base × height", "t-big t-acc t-fade");
      c.f2 = K.text(S, 7, 3, "6 × 4 = 24 cm²", "t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "This parallelogram has a base of 6 cm and a height of 4 cm." },
      { at: 3000, caption: "Drop a straight line down from the top corner. That is the height.",
        run: function (c) { K.on(c.hLine); K.on(c.mk, 1000); K.on(c.hLab, 1000); } },
      { at: 7500, caption: "Cut along the height. This leaves a small triangle on the left.",
        run: function (c) { K.snap(c.para, false); c.para.style.opacity = 0; K.snap(c.q, true); K.snap(c.t, true); } },
      { at: 11000, caption: "Slide the triangle all the way across to the other end. It fits exactly.",
        run: function (c) { K.tf(c.t, "translate(6px,0px)"); K.off(c.hLine); K.off(c.mk); K.off(c.hLab); } },
      { at: 15500, caption: "The shape is now a rectangle, 6 wide and 4 tall.",
        run: function (c) { K.on(c.rect); K.on(c.wLab, 200); K.on(c.tLab, 400); } },
      { at: 19000, caption: "A rectangle's area is width × height, so 6 × 4 = 24 square centimetres.",
        run: function (c) { K.on(c.f1); K.on(c.f2, 500); } },
      { at: 24000, caption: "We kept the base and the height, so the parallelogram's area is base × height too." },
    ],
  });
})();
