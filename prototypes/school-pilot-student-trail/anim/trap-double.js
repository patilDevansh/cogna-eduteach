/* Trapezium: two copies make a parallelogram with base (a + b). */
(function () {
  "use strict";
  var K = Cogna.animKit;
  K.define({
    id: "trap-double", title: "The trapezium formula", w: 18, h: 12, durationMs: 33000,
    build: function (S) {
      var c = {};
      c.orig = K.poly(S, [[2, 9], [9, 9], [8, 5], [5, 5]], "t-shape");
      c.copy = K.poly(S, [[2, 9], [9, 9], [8, 5], [5, 5]], "t-copy t-fade t-rot");
      c.copy.style.transformOrigin = "8.5px 7px";
      c.par = K.poly(S, [[2, 9], [12, 9], [15, 5], [5, 5]], "t-hi t-fade");
      c.aLab = K.text(S, 6.5, 4.3, "a = 3", "t-acc t-fade on");
      c.bLab = K.text(S, 5.5, 9.9, "b = 7", "t-acc t-fade");
      c.hLine = K.height(S, 5, 5, 9);
      c.mk = K.mark(S, 5, 9, [1, 0], [0, -1], 0.5);
      c.hLab = K.text(S, 4.5, 7, "h", "t-end t-acc t-fade");
      c.dim = K.line(S, 2, 10.4, 12, 10.4, "t-dim t-fade");
      c.dimLab = K.text(S, 7, 11.1, "a + b = 3 + 7 = 10", "t-acc t-fade");
      c.t1 = K.text(S, 9.5, 1.6, "parallelogram: 10 × 4 = 40", "t-fade");
      c.f1 = K.text(S, 9, 1.6, "½ × (a + b) × h", "t-big t-acc t-fade");
      c.f2 = K.text(S, 9, 2.9, "½ × 10 × 4 = 20 cm²", "t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "A trapezium has one pair of parallel sides. The short top is a = 3 and the long bottom is b = 7." },
      { at: 3500, caption: "The height h joins the two parallel sides at 90 degrees. Here h = 4.",
        run: function (c) { K.on(c.bLab); K.on(c.hLine); K.on(c.mk, 1000); K.on(c.hLab, 1000); } },
      { at: 8000, caption: "Make an exact copy of the trapezium.",
        run: function (c) { K.on(c.copy); } },
      { at: 11000, caption: "Turn the copy upside down, a half turn, and fit it against the slanted side.",
        run: function (c) { c.copy.setAttribute("class", "t-plain t-rot on"); K.tf(c.copy, "rotate(180deg)"); } },
      { at: 15500, caption: "Together they make a parallelogram.",
        run: function (c) { K.on(c.par); K.off(c.bLab); K.off(c.aLab); K.off(c.hLine); K.off(c.mk); K.off(c.hLab); } },
      { at: 19000, caption: "Its base is a + b, which is 3 + 7 = 10. The height is still 4.",
        run: function (c) { K.on(c.dim); K.on(c.dimLab, 300); } },
      { at: 23000, caption: "The parallelogram's area is 10 × 4 = 40.",
        run: function (c) { K.on(c.t1); } },
      { at: 26500, caption: "Our trapezium is only half of it. Half of 40 is 20, so the area is ½ × (a + b) × h.",
        run: function (c) { K.off(c.t1); K.off(c.par); K.off(c.dim); K.off(c.dimLab); K.on(c.f1, 300); K.on(c.f2, 800); } },
    ],
  });
})();
