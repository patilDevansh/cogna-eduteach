/* 1 m x 1 m = 100 cm x 100 cm = 10,000 cm^2 (not 100). */
(function () {
  "use strict";
  var K = Cogna.animKit;
  var X0 = 2, Y0 = 2, SZ = 10;
  K.define({
    id: "units-10000", title: "Why 1 m² is 10,000 cm²", w: 22, h: 14, durationMs: 34000,
    build: function (S) {
      var c = { v: [], hz: [] };
      c.sq = K.rect(S, X0, Y0, SZ, SZ, "t-shape");
      var k;
      for (k = 1; k < 100; k++) c.v.push(K.line(S, X0 + k * 0.1, Y0, X0 + k * 0.1, Y0 + SZ, "t-hair t-fade"));
      for (k = 1; k < 100; k++) c.hz.push(K.line(S, X0, Y0 + k * 0.1, X0 + SZ, Y0 + k * 0.1, "t-hair t-fade"));
      c.strip = K.rect(S, X0 + 4, Y0, 0.1, SZ, "t-strip t-fade");
      K.rect(S, X0, Y0, SZ, SZ, "t-outline");
      c.top1 = K.text(S, 7, 1.1, "1 m = 100 cm", "t-acc t-fade on");
      c.top2 = K.text(S, 7, 1.1, "100 strips", "t-acc t-fade");
      var l = K.text(S, 0.9, 7, "1 m", "t-acc"); l.setAttribute("transform", "rotate(-90 0.9 7)");
      c.stripNote = K.text(S, 7, 12.9, "one strip: 1 cm wide, 100 cm tall", "t-sm t-soft t-fade");
      c.r1 = K.text(S, 13.4, 4, "100 strips", "t-start t-fade");
      c.r2 = K.text(S, 13.4, 5.2, "× 100 squares in each", "t-start t-fade");
      c.r3 = K.text(S, 13.4, 6.6, "= 10,000 squares", "t-start t-big t-fade");
      c.big = K.text(S, 13.2, 9, "1 m² = 10,000 cm²", "t-start t-big t-acc t-fade");
      c.wrong = K.text(S, 13.4, 11.4, "1 m² = 100 cm²", "t-start t-badtext t-fade");
      c.strike = K.draw(S, "M13.1,11.4 L19.4,11.4", "t-bad");
      return c;
    },
    beats: [
      { at: 0, caption: "Here is a square that is 1 metre by 1 metre. One metre is 100 centimetres." },
      { at: 4000, caption: "Cut it into strips that are 1 cm wide. A metre is 100 cm, so there are 100 strips.",
        run: function (c) { K.onAll(c.v, 20); K.off(c.top1, 300); K.on(c.top2, 1800); } },
      { at: 9500, caption: "Each strip is 1 cm wide and 100 cm tall.",
        run: function (c) { K.on(c.strip); K.on(c.stripNote, 300); } },
      { at: 13500, caption: "Now cut every strip into 1 cm squares. Each strip holds 100 little squares.",
        run: function (c) { K.onAll(c.hz, 20); } },
      { at: 19000, caption: "100 strips with 100 squares in each: 100 × 100 = 10,000 little squares.",
        run: function (c) { K.on(c.r1); K.on(c.r2, 500); K.on(c.r3, 1000); } },
      { at: 23500, caption: "Each little square is 1 square centimetre. So 1 m² = 10,000 cm².",
        run: function (c) { K.on(c.big); } },
      { at: 27500, caption: "A common slip is to multiply by only 100. That would count a single strip. Area has two sides, so it is 100 × 100.",
        run: function (c) { K.on(c.wrong); K.on(c.strike, 700); } },
    ],
  });
})();
