/* Parallelogram and trapezium: the height drops at 90 degrees; the slanted side is not the height. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  K.define({
    id: "quad-heights", title: "Where is the height?", w: 26, h: 12, durationMs: 30000,
    build: function (S) {
      var c = {};
      c.par = K.poly(S, [[1, 9], [7, 9], [9, 5], [3, 5]], "t-shape");
      c.trap = K.poly(S, [[15, 9], [22, 9], [20, 5], [17, 5]], "t-shape");
      c.nPar = K.text(S, 5, 3.6, "parallelogram", "t-soft");
      c.nTrap = K.text(S, 18.5, 3.6, "trapezium", "t-soft");
      c.bPar = K.line(S, 1, 9, 7, 9, "t-hi t-fade");
      c.bTrap = K.line(S, 15, 9, 22, 9, "t-hi t-fade");
      c.bLabP = K.text(S, 4, 10.1, "base", "t-acc t-fade");
      c.bLabT = K.text(S, 18.5, 10.1, "base", "t-acc t-fade");
      c.hPar = K.height(S, 3, 5, 9);
      c.hTrap = K.height(S, 17, 5, 9);
      c.mPar = K.mark(S, 3, 9, [1, 0], [0, -1], 0.5);
      c.mTrap = K.mark(S, 17, 9, [1, 0], [0, -1], 0.5);
      c.hLabP = K.text(S, 3.4, 7, "h", "t-start t-acc t-fade");
      c.hLabT = K.text(S, 17.4, 7, "h", "t-start t-acc t-fade");
      c.sPar = K.line(S, 7, 9, 9, 5, "t-bad t-fade");
      c.sTrap = K.line(S, 15, 9, 17, 5, "t-bad t-fade");
      c.xPar = K.text(S, 5, 11, "slanted side: not the height", "t-sm t-badtext t-fade");
      c.xTrap = K.text(S, 18.5, 11, "slanted side: not the height", "t-sm t-badtext t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "Two shapes: a parallelogram and a trapezium. Both lean to one side." },
      { at: 3500, caption: "First choose a base. Here it is the flat bottom side of each shape.",
        run: function (c) { K.on(c.bPar); K.on(c.bTrap, 300); K.on(c.bLabP); K.on(c.bLabT, 300); } },
      { at: 8000, caption: "The height drops straight down from the top, at a right angle (90 degrees).",
        run: function (c) { K.on(c.hPar); K.on(c.mPar, 1000); K.on(c.hLabP, 1000); } },
      { at: 12500, caption: "In the trapezium the height does the same thing: straight down, 90 degrees to the base.",
        run: function (c) { K.on(c.hTrap); K.on(c.mTrap, 1000); K.on(c.hLabT, 1000); } },
      { at: 17000, caption: "Now look at the slanted side. It leans, so it is longer than the true height.",
        run: function (c) { K.on(c.sPar); } },
      { at: 18200, run: function (c) { K.off(c.sPar); } },
      { at: 18800, run: function (c) { K.on(c.sPar); K.on(c.xPar, 200); } },
      { at: 22000, caption: "Same in the trapezium. The slanted side is not the height.",
        run: function (c) { K.on(c.sTrap); } },
      { at: 23200, run: function (c) { K.off(c.sTrap); } },
      { at: 23800, run: function (c) { K.on(c.sTrap); K.on(c.xTrap, 200); } },
      { at: 27500, caption: "Remember: the height always meets the base at exactly 90 degrees." },
    ],
  });
})();
