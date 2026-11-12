/* 3-4-5 right triangle: 9 + 16 unit squares slide into the 25 square. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  var TH = Math.atan2(3, 4) * 180 / Math.PI;           // 36.87 degrees
  var O = [11, 2];                                      // corner of the big square
  function hypPos(n) {                                  // n = 0..24, cell position inside the 5x5 square
    var i = n % 5, j = Math.floor(n / 5);
    return [O[0] + 0.8 * i - 0.6 * j, O[1] + 0.6 * i + 0.8 * j];
  }
  function cellTf(x, y, r) { return "translate(" + x + "px," + y + "px) rotate(" + r + "deg)"; }

  K.define({
    id: "pyth-squares", title: "The right-angle rule", w: 20, h: 15, durationMs: 39000,
    build: function (S) {
      var c = {};
      c.tri = K.poly(S, [[8, 6], [8, 9], [12, 9]], "t-shape");
      K.mark(S, 8, 9, [1, 0], [0, -1], 0.5).classList.add("on");
      // outlines of the three squares
      c.oLeft = K.poly(S, [[5, 6], [8, 6], [8, 9], [5, 9]], "t-ghost t-fade");
      c.oBot = K.poly(S, [[8, 9], [12, 9], [12, 13], [8, 13]], "t-ghost t-fade");
      c.oHyp = K.poly(S, [[11, 2], [15, 5], [12, 9], [8, 6]], "t-outline t-fade");
      // cells
      c.a = []; c.b = [];
      var i, j, e;
      for (j = 0; j < 3; j++) for (i = 0; i < 3; i++) {
        e = K.rect(S, 0, 0, 1, 1, "t-cell-a t-fade t-mv");
        K.tf(e, cellTf(5 + i, 6 + j, 0), 0, 0); c.a.push(e);
      }
      for (j = 0; j < 4; j++) for (i = 0; i < 4; i++) {
        e = K.rect(S, 0, 0, 1, 1, "t-cell-b t-fade t-mv");
        K.tf(e, cellTf(8 + i, 9 + j, 0), 0, 0); c.b.push(e);
      }
      // side labels
      c.s3 = K.text(S, 8.7, 7.9, "3", "t-fade");
      c.s4 = K.text(S, 10.2, 8.5, "4", "t-fade");
      c.s5 = K.text(S, 10.9, 6.6, "5", "t-fade");
      // square labels
      c.q3 = K.text(S, 6.5, 7.5, "3² = 9", "t-sm t-acc t-fade");
      c.q4 = K.text(S, 10, 11, "4² = 16", "t-sm t-acc t-fade");
      c.q5 = K.text(S, 11.5, 5.5, "5² = 25", "t-sm t-acc t-fade");
      // sums
      c.sum = K.text(S, 0.8, 1.4, "9 + 16 = 25", "t-start t-big t-fade");
      c.eq = K.text(S, 0.8, 2.9, "a² + b² = c²", "t-start t-big t-acc t-fade");
      c.eq2 = K.text(S, 0.8, 4.2, "3² + 4² = 5²", "t-start t-soft t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "Here is a right-angled triangle. Its sides are 3, 4 and 5 centimetres long." },
      { at: 1500, run: function (c) { K.on(c.s3); K.on(c.s4, 300); K.on(c.s5, 600); } },
      { at: 5000, caption: "Build a square on each side. The side of length 3 makes a 3 by 3 square.",
        run: function (c) { K.on(c.oLeft); K.onAll(c.a, 70); K.on(c.q3, 700); } },
      { at: 9000, caption: "The side of length 4 makes a 4 by 4 square.",
        run: function (c) { K.on(c.oBot); K.onAll(c.b, 50); K.on(c.q4, 900); } },
      { at: 13000, caption: "The longest side, 5, makes a big 5 by 5 square. It is empty for now.",
        run: function (c) { K.on(c.oHyp); K.on(c.q5, 500); } },
      { at: 17500, caption: "Count the little squares: 9 in the first, 16 in the second, 25 in the big one." },
      { at: 21000, caption: "Now slide the 9 small squares into the big square.",
        run: function (c) {
          c.a.forEach(function (e, n) {
            var p = hypPos(n);
            e.style.transitionDelay = (n * 120) + "ms";
            e.style.transform = cellTf(p[0], p[1], TH);
          });
        } },
      { at: 26000, caption: "Then slide in the 16. They fill it exactly, with no gaps and no overlap.",
        run: function (c) {
          c.b.forEach(function (e, n) {
            var p = hypPos(9 + n);
            e.style.transitionDelay = (n * 90) + "ms";
            e.style.transform = cellTf(p[0], p[1], TH);
          });
          K.off(c.q5);
        } },
      { at: 31000, caption: "So 9 + 16 = 25. The two small squares add up to the big one.",
        run: function (c) { K.on(c.sum); } },
      { at: 35000, caption: "That is the right-angle rule: a² + b² = c².",
        run: function (c) { K.on(c.eq); K.on(c.eq2, 500); } },
    ],
  });
})();
