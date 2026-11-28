/* A house shape is split into a rectangle and a triangle; the areas add up. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  K.define({
    id: "poly-split", title: "Split any shape into easy ones", w: 17, h: 12, durationMs: 27000,
    build: function (S) {
      var c = {};
      c.whole = K.poly(S, [[3, 6], [3, 10], [9, 10], [9, 6], [6, 3]], "t-plain");
      c.rect = K.poly(S, [[3, 6], [9, 6], [9, 10], [3, 10]], "t-shape t-fade");
      c.tri = K.poly(S, [[3, 6], [9, 6], [6, 3]], "t-tint t-fade");
      c.outline = K.poly(S, [[3, 6], [3, 10], [9, 10], [9, 6], [6, 3]], "t-outline");
      c.cut = K.draw(S, "M3,6 L9,6", "t-hi");
      c.wLab = K.text(S, 6, 10.8, "6", "t-acc");
      c.hLab = K.text(S, 2.4, 8, "4", "t-acc");
      c.rLab = K.text(S, 6, 8.1, "24", "t-big t-acc t-fade");
      c.tLab = K.text(S, 4.8, 5.3, "9", "t-big t-acc t-fade");
      c.rf = K.text(S, 10, 8.1, "rectangle 6 × 4 = 24", "t-start t-sm t-fade");
      c.tf = K.text(S, 10, 5.1, "triangle ½ × 6 × 3 = 9", "t-start t-sm t-fade");
      c.th = K.height(S, 6, 3, 6);
      c.thLab = K.text(S, 6.3, 4.1, "3", "t-start t-acc t-fade");
      c.sum = K.text(S, 10, 9.6, "24 + 9 = 33 cm²", "t-start t-acc t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "This house shape is not a rectangle or a triangle. But it is made of shapes we know." },
      { at: 4000, caption: "Draw a line to split it: a triangle on top and a rectangle below.",
        run: function (c) { K.on(c.cut); } },
      { at: 8500, caption: "The rectangle is 6 by 4, so its area is 6 × 4 = 24.",
        run: function (c) { K.on(c.rect); K.on(c.rLab, 300); K.on(c.rf, 300); } },
      { at: 13500, caption: "The triangle has base 6 and height 3, so its area is ½ × 6 × 3 = 9.",
        run: function (c) { K.on(c.th); K.on(c.thLab, 800); K.on(c.tri); K.on(c.tLab, 300); K.on(c.tf, 300); } },
      { at: 19000, caption: "Add the pieces: 24 + 9 = 33. The whole shape is 33 square centimetres.",
        run: function (c) { K.on(c.sum); } },
      { at: 23500, caption: "For any shape: split it, find each piece, then add." },
    ],
  });
})();
