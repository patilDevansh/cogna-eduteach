/* Why adding the short sides fails: 3 + 4 = 7, but a ruler along the long side reads 5. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  var P = [5, 6], Q = [5, 9], R = [9, 9];             // 3-4-5 triangle, right angle at Q
  var D = [0.8, 0.6], N = [0.6, -0.8];                // along the long side, and outward from it
  function at(k, off) { return [P[0] + D[0] * k + N[0] * off, P[1] + D[1] * k + N[1] * off]; }

  K.define({
    id: "pyth-why-not-add", title: "Why we do not just add the sides", w: 20, h: 15, durationMs: 27000,
    build: function (S) {
      var c = {}, i, a, b, t;
      c.tri = K.poly(S, [P, Q, R], "t-shape");
      K.mark(S, Q[0], Q[1], [1, 0], [0, -1], 0.5).classList.add("on");
      c.s3 = K.text(S, 4.4, 7.5, "3", "t-fade");
      c.s4 = K.text(S, 7, 9.7, "4", "t-fade");
      c.sum = K.text(S, 10.8, 3.5, "3 + 4 = 7", "t-start t-big t-fade");
      // ruler: dashed line, ticks every unit, reading 5
      a = at(0, 0.9); b = at(5, 0.9);
      c.ruler = K.line(S, a[0], a[1], b[0], b[1], "t-height t-fade");
      c.ticks = [];
      for (i = 0; i <= 5; i++) {
        t = at(i, 0.9);
        c.ticks.push(K.line(S, t[0] - N[0] * 0.25, t[1] - N[1] * 0.25, t[0] + N[0] * 0.25, t[1] + N[1] * 0.25, "t-mark t-fade"));
      }
      t = at(2.5, 1.7);
      c.read = K.text(S, t[0], t[1], "5", "t-big t-acc t-fade");
      c.strike = K.draw(S, "M10.6,3.5 L15.5,3.5", "t-bad");
      // square first
      c.l1 = K.text(S, 10, 11.6, "3² + 4² = 9 + 16 = 25", "t-big t-fade");
      c.l2 = K.text(S, 10, 13.2, "√25 = 5", "t-big t-acc t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "Here is a right triangle. Its two short sides are 3 and 4.",
        run: function (c) { K.on(c.s3, 300); K.on(c.s4, 600); } },
      { at: 4500, caption: "A common idea is to add the short sides: 3 + 4 = 7.",
        run: function (c) { K.on(c.sum); } },
      { at: 8500, caption: "Let's test it. Lay a ruler along the long side.",
        run: function (c) { K.on(c.ruler); K.onAll(c.ticks, 250, 600); } },
      { at: 13000, caption: "The long side measures 5, not 7.",
        run: function (c) { K.on(c.read); } },
      { at: 16500, caption: "So 7 cannot be right. Adding the sides does not give the long side.",
        run: function (c) { K.on(c.strike); c.sum.classList.add("t-badtext"); } },
      { at: 20500, caption: "Square first: 9 + 16 = 25, then take the square root: √25 = 5.",
        run: function (c) { K.on(c.l1); K.on(c.l2, 1200); } },
    ],
  });
})();
