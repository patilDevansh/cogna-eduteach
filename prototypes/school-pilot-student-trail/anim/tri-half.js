/* A triangle is exactly half of a parallelogram made from two copies. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  K.define({
    id: "tri-half", title: "A triangle is half a parallelogram", w: 14, h: 11, durationMs: 31000,
    build: function (S) {
      var c = {};
      c.orig = K.poly(S, [[3, 9], [9, 9], [5, 5]], "t-shape");
      c.copy = K.poly(S, [[3, 9], [9, 9], [5, 5]], "t-copy t-fade t-rot");
      c.copy.style.transformOrigin = "7px 7px";
      c.par = K.poly(S, [[3, 9], [9, 9], [11, 5], [5, 5]], "t-hi t-fade");
      c.base = K.text(S, 6, 10.2, "base = 6", "t-acc");
      c.hLine = K.height(S, 5, 5, 9);
      c.mk = K.mark(S, 5, 9, [-1, 0], [0, -1], 0.5);
      c.hLab = K.text(S, 5.3, 7.4, "h = 4", "t-start t-acc t-fade");
      c.total = K.text(S, 7, 2.6, "parallelogram: 6 × 4 = 24", "t-fade");
      c.half = K.text(S, 7, 1.4, "triangle: half of 24 = 12", "t-acc t-fade");
      c.f1 = K.text(S, 7, 2.6, "½ × base × height", "t-big t-acc t-fade");
      c.f2 = K.text(S, 7, 3.9, "½ × 6 × 4 = 12 cm²", "t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "A triangle with a base of 6 cm. Let's find its area." },
      { at: 2500, caption: "Its height is 4 cm. The height drops straight down, at 90 degrees to the base.",
        run: function (c) { K.on(c.hLine); K.on(c.mk, 1000); K.on(c.hLab, 1000); } },
      { at: 7000, caption: "Make an exact copy of the triangle.",
        run: function (c) { K.on(c.copy); } },
      { at: 10000, caption: "Turn the copy upside down, a half turn, and fit it against the long slanted side.",
        run: function (c) { c.copy.setAttribute("class", "t-plain t-rot on"); K.tf(c.copy, "rotate(180deg)"); } },
      { at: 14500, caption: "Together the two triangles make a parallelogram.",
        run: function (c) { K.on(c.par); K.off(c.hLine); K.off(c.mk); K.off(c.hLab); } },
      { at: 18000, caption: "Its base is 6 and its height is 4, so its area is 6 × 4 = 24.",
        run: function (c) { K.on(c.total); } },
      { at: 21500, caption: "Our first triangle is exactly one of the two equal halves. Half of 24 is 12.",
        run: function (c) { K.off(c.total); K.on(c.half, 300); K.off(c.par); c.orig.setAttribute("class", "t-shape"); K.on(c.hLine); } },
      { at: 26500, caption: "So a triangle's area is ½ × base × height.",
        run: function (c) { K.off(c.half); K.on(c.f1, 300); K.on(c.f2, 800); K.off(c.hLine); } },
    ],
  });
})();
