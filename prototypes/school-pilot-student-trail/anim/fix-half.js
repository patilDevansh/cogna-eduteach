/* A triangle is exactly half of its rectangle: the empty corners fit the triangle. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  K.define({
    id: "fix-half", title: "Don't forget the half", w: 14, h: 11, durationMs: 30000,
    build: function (S) {
      var c = {};
      c.rect = K.poly(S, [[3, 5], [9, 5], [9, 9], [3, 9]], "t-plain t-fade");
      c.tri = K.poly(S, [[3, 9], [9, 9], [5, 5]], "t-shape");
      c.cornerL = K.poly(S, [[3, 9], [3, 5], [5, 5]], "t-tint t-fade t-rot");
      c.cornerL.style.transformOrigin = "4px 7px";
      c.cornerR = K.poly(S, [[9, 9], [9, 5], [5, 5]], "t-cell-b t-fade t-rot");
      c.cornerR.style.transformOrigin = "7px 7px";
      c.hLine = K.height(S, 5, 5, 9);
      c.rOut = K.poly(S, [[3, 5], [9, 5], [9, 9], [3, 9]], "t-hi t-fade");
      c.base = K.text(S, 6, 10.1, "base = 6", "t-acc");
      c.hLab = K.text(S, 5.3, 7.6, "h = 4", "t-start t-sm t-acc");
      c.wrong = K.text(S, 7, 1.8, "6 × 4 = 24 is the whole rectangle, not the triangle", "t-sm t-badtext t-fade");
      c.half = K.text(S, 7, 3.2, "triangle = half of 24 = 12", "t-acc t-fade");
      c.f = K.text(S, 7, 3.2, "½ × 6 × 4 = 12 cm²", "t-big t-acc t-fade");
      return c;
    },
    beats: [
      { at: 0, caption: "A triangle with base 6 cm and height 4 cm. What is its area?" },
      { at: 3000, caption: "Draw the smallest rectangle around it. It is 6 by 4, so it has an area of 24.",
        run: function (c) { K.snap(c.rect, true); c.tri.parentNode.appendChild(c.tri); K.on(c.rOut); } },
      { at: 7000, caption: "But 6 × 4 = 24 is the whole rectangle, not the triangle. The triangle fills only part of it.",
        run: function (c) { K.on(c.wrong); } },
      { at: 11000, caption: "Draw the height. It splits the triangle into two smaller right-angled triangles.",
        run: function (c) { K.off(c.wrong); K.on(c.hLine); } },
      { at: 15000, caption: "The two empty corners are the same shapes. Turn the left corner around: it fits onto the left part exactly.",
        run: function (c) { K.on(c.cornerL); } },
      { at: 17000, run: function (c) { K.tf(c.cornerL, "rotate(180deg)"); } },
      { at: 21000, caption: "Turn the right corner around too. It fits onto the right part. Nothing is left over.",
        run: function (c) { K.on(c.cornerR); } },
      { at: 22500, run: function (c) { K.tf(c.cornerR, "rotate(180deg)"); } },
      { at: 26500, caption: "So the triangle and the empty space are equal. The triangle is exactly half: ½ × 6 × 4 = 12.",
        run: function (c) { K.on(c.f); K.off(c.hLine); } },
    ],
  });
})();
