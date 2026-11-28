/* Which side is c? The one opposite the right angle. Then a missing short leg: take away. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  function rightHi(S, x, y, a, b, s) {
    var d = "M" + (x + a[0] * s) + "," + (y + a[1] * s) + " L" + (x + (a[0] + b[0]) * s) + "," + (y + (a[1] + b[1]) * s) +
      " L" + (x + b[0] * s) + "," + (y + b[1] * s);
    return K.path(S, d, "t-hi t-fade");
  }
  /* one triangle group: pts, corner of right angle with directions, leg labels, hypotenuse ends + label spot */
  function tri(S, o) {
    var g = K.g(S, "t-fade"), r = {};
    K.poly(g, o.pts, "t-shape");
    K.mark(g, o.rx, o.ry, o.a, o.b, 0.5).classList.add("on");
    o.legs.forEach(function (l) { K.text(g, l[0], l[1], l[2]); });
    r.g = g;
    r.pulse = rightHi(g, o.rx, o.ry, o.a, o.b, 0.8);
    r.hyp = K.line(g, o.h[0], o.h[1], o.h[2], o.h[3], "t-hi t-fade");
    r.lab = K.text(g, o.lx, o.ly, o.label || "c (longest)", "t-acc t-fade");
    return r;
  }
  function cycle(t, key, intro, lit) {
    return [
      { at: t, caption: intro, run: function (c) { if (c.prev) K.off(c.prev.g); K.on(c[key].g); c.prev = c[key]; } },
      { at: t + 900, run: function (c) { K.on(c[key].pulse); } },
      { at: t + 1500, run: function (c) { K.off(c[key].pulse); } },
      { at: t + 2000, run: function (c) { K.on(c[key].pulse); } },
      { at: t + 3300, caption: lit, run: function (c) { K.on(c[key].hyp); K.on(c[key].lab, 300); } },
    ];
  }

  K.define({
    id: "pyth-which-c", title: "Which side is c?", w: 20, h: 15, durationMs: 29500,
    build: function (S) {
      var c = {};
      c.t1 = tri(S, { pts: [[6, 6], [6, 9], [10, 9]], rx: 6, ry: 9, a: [1, 0], b: [0, -1],
        legs: [[5.4, 7.5, "3"], [8, 9.6, "4"]], h: [6, 6, 10, 9], lx: 9.2, ly: 5.9 });
      c.t2 = tri(S, { pts: [[10, 4], [14, 4], [14, 7]], rx: 14, ry: 4, a: [-1, 0], b: [0, 1],
        legs: [[12, 3.4, "4"], [14.6, 5.5, "3"]], h: [10, 4, 14, 7], lx: 10.8, ly: 7.1 });
      c.t3 = tri(S, { pts: [[5, 9], [15, 9], [8.6, 4.2]], rx: 8.6, ry: 4.2, a: [-0.6, 0.8], b: [0.8, 0.6],
        legs: [[6.2, 6.1, "6"], [12.3, 6, "8"]], h: [5, 9, 15, 9], lx: 10, ly: 10.3 });
      // last beat: the longest side is known, one short side is missing
      c.t4 = tri(S, { pts: [[5, 9], [15, 9], [8.6, 4.2]], rx: 8.6, ry: 4.2, a: [-0.6, 0.8], b: [0.8, 0.6],
        legs: [[6.2, 6.1, "6"]], h: [5, 9, 15, 9], lx: 10, ly: 10.1, label: "c = 10" });
      c.q = K.text(c.t4.g, 12.3, 6, "?", "t-big t-acc");
      c.miss = K.line(c.t4.g, 8.6, 4.2, 15, 9, "t-hi t-fade");
      c.e1 = K.text(S, 10, 12, "10² − 6² = 100 − 36 = 64", "t-big t-fade");
      c.e2 = K.text(S, 10, 13.2, "√64 = 8", "t-big t-acc t-fade");
      c.warn = K.text(S, 10, 14.4, "When the missing side is short, take away", "t-badtext t-fade");
      return c;
    },
    beats: [].concat(
      cycle(0, "t1", "Find the right angle first. It is the corner with the little square.",
        "The side opposite the right angle is c. It is the longest side."),
      cycle(6000, "t2", "Turn the triangle round. Where is the right angle now?",
        "Opposite the right angle again: that is c, the longest side."),
      cycle(12000, "t3", "Once more, with a different tilt. Find the right angle.",
        "The side across from it is c. The other two are the short sides."),
      [
        { at: 18000, caption: "Now the other way round. The longest side c is 10, and one short side is 6.",
          run: function (c) { K.off(c.t3.g); K.on(c.t4.g); K.on(c.t4.hyp); K.on(c.t4.lab, 200); } },
        { at: 21500, caption: "We want the other short side. Take away: 10² − 6² = 100 − 36 = 64.",
          run: function (c) { K.on(c.miss); K.on(c.e1); } },
        { at: 24000, caption: "Then the square root: √64 = 8.",
          run: function (c) { K.on(c.e2); c.q.textContent = "8"; } },
        { at: 26000, caption: "When the missing side is short, take away.",
          run: function (c) { K.on(c.warn); } },
      ]),
  });
})();
