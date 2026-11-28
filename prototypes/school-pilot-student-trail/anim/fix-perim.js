/* Same 20 m of rope, different areas: 8 x 2 = 16 vs 9 x 1 = 9.
   The rope round a patch is its perimeter (Day 3: Kavin's kolam patch, CAST_AND_STORIES.md).
   Every spoken line is a plain literal `caption:` so tools/record-narration.mjs finds it. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  var beats = [
    { at: 0, caption: "Two patches. Each one has exactly 20 metres of rope around it." },
    { at: 3000, caption: "Patch A is 8 m by 2 m. Rope: 8 + 2 + 8 + 2 = 20 m.",
      run: function (c) { K.on(c.fa); K.on(c.pa, 800); } },
    { at: 7500, caption: "Patch B is 9 m by 1 m. Rope: 9 + 1 + 9 + 1 = 20 m. The very same rope.",
      run: function (c) { K.on(c.fb); K.on(c.pb, 800); } },
    // the squares inside A light up one by one; the line is said with the first of them
    { at: 12500, caption: "Now count the squares inside Patch A, each 1 m by 1 m.", run: function (c) { K.on(c.na[0]); } },
  ];
  var i;
  for (i = 1; i < 16; i++) (function (i) {
    beats.push({ at: 12500 + i * 160, run: function (c) { K.on(c.na[i]); } });
  })(i);
  beats.push({ at: 15300, caption: "Patch A has 16 squares: its area is 16 square metres.", run: function (c) { K.on(c.aa); } });
  beats.push({ at: 18500, caption: "Now Patch B.", run: function (c) { K.on(c.nb[0]); } });
  for (i = 1; i < 9; i++) (function (i) {
    beats.push({ at: 18500 + i * 200, run: function (c) { K.on(c.nb[i]); } });
  })(i);
  beats.push(
    { at: 20600, caption: "Patch B has only 9 squares: its area is 9 square metres.", run: function (c) { K.on(c.ab); } },
    { at: 24500, caption: "The rope is the same, 20 m, but the space inside is different: 16 and 9. Perimeter is the rope around the edge. Area is the space inside.",
      run: function (c) { K.on(c.cmp); } },
    { at: 30000, caption: "So the same perimeter does not mean the same area. Always ask: perimeter or area?" }
  );
  K.define({
    id: "fix-perim", title: "Perimeter is not area", w: 22, h: 11, durationMs: 33000,
    build: function (S) {
      var c = { na: [], nb: [] };
      var x, y, n = 0;
      K.text(S, 5, 2.4, "Patch A", "t-soft");
      K.text(S, 15.5, 2.4, "Patch B", "t-soft");
      for (y = 0; y < 2; y++) for (x = 0; x < 8; x++) K.rect(S, 1 + x, 4 + y, 1, 1, "t-shape");
      for (x = 0; x < 9; x++) K.rect(S, 11 + x, 4, 1, 1, "t-shape");
      for (y = 0; y < 2; y++) for (x = 0; x < 8; x++) { n++; c.na.push(K.text(S, 1.5 + x, 4.5 + y, String(n), "t-sm t-acc t-pop")); }
      for (x = 0; x < 9; x++) c.nb.push(K.text(S, 11.5 + x, 4.5, String(x + 1), "t-sm t-acc t-pop"));
      c.fa = K.draw(S, "M1,4 L9,4 L9,6 L1,6 Z", "t-fence");   // the rope round each patch
      c.fb = K.draw(S, "M11,4 L20,4 L20,5 L11,5 Z", "t-fence");
      c.pa = K.text(S, 5, 7.2, "rope 8+2+8+2 = 20 m", "t-sm t-fade");
      c.pb = K.text(S, 15.5, 6.2, "rope 9+1+9+1 = 20 m", "t-sm t-fade");
      c.aa = K.text(S, 5, 8.4, "area 16 m²", "t-acc t-fade");
      c.ab = K.text(S, 15.5, 7.4, "area 9 m²", "t-acc t-fade");
      c.cmp = K.text(S, 11, 10, "same rope, 16 vs 9", "t-big t-acc t-fade");
      return c;
    },
    beats: beats,
  });
})();
