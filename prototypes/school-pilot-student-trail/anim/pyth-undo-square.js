/* Undoing the square: a pile of 25 unit squares becomes a 5 x 5 block, so c = 5. Then 100 -> 10. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  function cellTf(x, y, r) { return "translate(" + x + "px," + y + "px) rotate(" + r + "deg)"; }
  function bracket(S, x, y1, y2) {
    return K.path(S, "M" + (x - 0.25) + "," + y1 + " h0.25 V" + y2 + " h-0.25", "t-dim t-fade");
  }

  K.define({
    id: "pyth-undo-square", title: "Undoing the square", w: 20, h: 15, durationMs: 27000,
    build: function (S) {
      var c = {}, n, e, seed = 7;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
      c.cells = []; c.pile = [];
      for (n = 0; n < 25; n++) {
        e = K.rect(S, 0, 0, 1, 1, "t-cell-a t-fade t-mv");
        var x = 1.5 + (n % 5) * 1.05 + rnd() * 1.0, y = 5 + Math.floor(n / 5) * 0.9 + rnd() * 0.9;
        c.pile.push([x, y]);
        K.tf(e, cellTf(x, y, Math.round(rnd() * 70)), 0.5, 0.5);
        c.cells.push(e);
      }
      c.br5 = bracket(S, 13.5, 3, 8);
      c.n5 = K.text(S, 14.4, 5.5, "5", "t-big t-acc t-fade");
      c.a1 = K.text(S, 10, 10.6, "c² = 25", "t-big t-fade");
      c.a2 = K.text(S, 10, 12.2, "c = √25 = 5", "t-big t-acc t-fade");
      c.strips = [];
      for (n = 0; n < 10; n++) {
        e = K.rect(S, 0, 0, 10, 1, "t-strip t-fade t-mv");
        K.tf(e, "translate(5px,-3px)", 0, 0);
        c.strips.push(e);
      }
      c.box = K.rect(S, 5, 0.5, 10, 10, "t-outline t-fade");
      c.br10 = bracket(S, 15.5, 0.5, 10.5);
      c.n10 = K.text(S, 16.5, 5.5, "10", "t-big t-acc t-fade");
      c.b1 = K.text(S, 10, 12.2, "c² = 100", "t-big t-fade");
      c.b2 = K.text(S, 10, 13.7, "c = √100 = 10", "t-big t-acc t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "Here are 25 little squares in a loose pile.",
        run: function (c) { K.onAll(c.cells, 60); } },
      { at: 4500, caption: "Push them together into a neat block: 5 rows of 5.",
        run: function (c) {
          c.cells.forEach(function (e, n) {
            e.style.transitionDelay = (n * 50) + "ms";
            e.style.transform = cellTf(8 + (n % 5), 3 + Math.floor(n / 5), 0);
          });
        } },
      { at: 9500, caption: "Now measure one side of the block. It is 5 long.",
        run: function (c) { K.on(c.br5); K.on(c.n5, 400); } },
      { at: 13000, caption: "25 is c². The side of that square is c = √25 = 5.",
        run: function (c) { K.on(c.a1); K.on(c.a2, 900); } },
      { at: 18000, caption: "Same idea again, faster. Start with 100 squares, stacked as 10 strips of 10.",
        run: function (c) {
          c.cells.concat([c.br5, c.n5, c.a1, c.a2]).forEach(function (e) { K.off(e, 0); });
          c.strips.forEach(function (e, n) {
            e.style.transitionDelay = (400 + n * 130) + "ms";
            e.style.transform = "translate(5px," + (0.5 + n) + "px)";
            K.on(e, 400 + n * 130);
          });
        } },
      { at: 22500, caption: "100 is c². The side of that square is c = √100 = 10.",
        run: function (c) { K.on(c.box); K.on(c.br10); K.on(c.n10, 300); K.on(c.b1, 700); K.on(c.b2, 1700); } },
    ],
  });
})();
