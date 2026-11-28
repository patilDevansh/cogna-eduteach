/* The slanted side is not the height: lean the shape, the height and area stay put. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  var PIVOT = "0px 9px";
  K.define({
    id: "fix-slant", title: "The slanted side is not the height", w: 22, h: 12, durationMs: 36000,
    build: function (S) {
      var c = {};
      c.sh = K.g(S, "t-mv");                       // everything that leans together
      c.sh.style.transformOrigin = PIVOT;
      K.poly(c.sh, [[3, 9], [11, 9], [14, 5], [6, 5]], "t-shape");
      [6, 7, 8].forEach(function (y) { K.line(c.sh, 3 + (9 - y) * 0.75, y, 11 + (9 - y) * 0.75, y, "t-hair"); });
      c.slant = K.line(S, 11, 9, 14, 5, "t-bad t-fade t-mv");
      c.slant.style.transformOrigin = PIVOT;        // right slanted side
      c.ladderG = K.g(S, "t-fade");
      K.poly(c.ladderG, [[3, 9], [6, 9], [6, 5]], "t-tint");
      c.ladder = K.text(S, 3.6, 6.6, "ladder", "t-end t-sm t-soft");
      K.text(S, 7, 10.1, "base = 8", "t-acc");
      c.hG = K.g(S, "t-mv");
      c.hLine = K.height(c.hG, 6, 5, 9);
      c.hG.appendChild(K.mark(c.hG, 6, 9, [-1, 0], [0, -1], 0.5)); c.hG.lastChild.classList.add("on");
      c.hLab = K.text(c.hG, 6.3, 7, "height 4", "t-start t-sm t-acc");
      c.hG.style.opacity = 0; c.hG.style.transition = "opacity var(--dur-phase) var(--ease-settle), transform var(--dur-calm) var(--ease-settle)";
      c.l5 = K.text(S, 13.9, 7.8, "5", "t-badtext t-fade t-mv");
      c.l64 = K.text(S, 13.9, 7.8, "6.4", "t-badtext t-fade t-mv");
      c.l81 = K.text(S, 13.9, 7.8, "8.1", "t-badtext t-fade t-mv");
      c.wrong = K.text(S, 1.2, 1.4, "using the slant: 8 × 5 = 40", "t-start t-badtext t-fade");
      c.right = K.text(S, 1.2, 2.8, "using the height: 8 × 4 = 32 cm²", "t-start t-acc t-fade");
      c.same = K.text(S, 1.2, 4.0, "area stays 32 cm² (4 rows of 8)", "t-start t-sm t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "A parallelogram: base 8 cm, slanted side 5 cm, height 4 cm." },
      { at: 3000, caption: "A common mix-up: using the slanted side, 5, as the height. That gives 8 × 5 = 40, which is too big.",
        run: function (c) { K.on(c.slant); K.on(c.l5, 200); K.on(c.wrong, 600); } },
      { at: 8500, caption: "The real height goes straight down, at 90 degrees. It is 4, so the area is 8 × 4 = 32.",
        run: function (c) { c.hG.style.opacity = 1; K.on(c.hLine); K.on(c.right, 800); } },
      { at: 14000, caption: "Think of a ladder against a wall. The wall is 4 tall, but the leaning ladder is 5 long.",
        run: function (c) { K.on(c.ladderG); } },
      { at: 19000, caption: "Lean the shape over a bit more. The slanted side gets longer: 6.4.",
        run: function (c) {
          K.off(c.ladderG);
          K.tf(c.sh, "skewX(-26.57deg)"); K.tf(c.slant, "skewX(-26.57deg)"); K.tf(c.hG, "translate(2px,0px)");
          K.off(c.l5); K.tf(c.l64, "translate(1px,0px)"); K.on(c.l64, 300); K.on(c.same, 600);
        } },
      { at: 24500, caption: "Lean it even more: 8.1. But the height is still 4 and the area is still 32.",
        run: function (c) {
          K.tf(c.sh, "skewX(-45deg)"); K.tf(c.slant, "skewX(-45deg)"); K.tf(c.hG, "translate(4px,0px)");
          K.off(c.l64); K.tf(c.l81, "translate(2px,0px)"); K.on(c.l81, 300);
        } },
      { at: 30500, caption: "The slanted side can change as much as it likes. Only the height decides the area." },
    ],
  });
})();
