/* Count squares, cut a piece, move it: the count stays the same. */
(function () {
  "use strict";
  var K = Cogna.animKit;
  var rows = [[2, 7], [2, 5], [2, 3]];        // [first x, last x] per row, rows start at y = 2
  var beats = [
    { at: 0, caption: "This shape is made of whole squares. Each one is 1 cm by 1 cm." },
  ];
  for (var n = 0; n < 12; n++) (function (n) {
    beats.push({ at: 2500 + n * 380, caption: n === 0 ? "Count the squares one by one." : null,
      run: function (c) { K.on(c.nums[n]); } });
  })(n);
  beats.push(
    { at: 7500, caption: "There are 12 squares, so the area is 12 square centimetres.",
      run: function (c) { K.on(c.count); } },
    { at: 11000, caption: "Now cut off a piece of 2 squares from the right-hand end.",
      run: function (c) { K.off(c.count); K.on(c.cut); c.piece.forEach(function (e) { e.setAttribute("class", "t-tint"); }); } },
    { at: 14500, caption: "Slide it down and to the left, where it fits exactly.",
      run: function (c) { K.tf(c.pieceG, "translate(-2px,2px)"); K.off(c.cut); } },
    { at: 18500, caption: "Nothing was added and nothing was lost, so there are still 12 squares.",
      run: function (c) { K.on(c.again); K.on(c.shapeOutline); } },
    { at: 22500, caption: "The shape is now a rectangle, 4 squares wide and 3 tall: 4 × 3 = 12." }
  );
  K.define({
    id: "cut-move", title: "Cutting and moving keeps the area", w: 12, h: 8, durationMs: 26000,
    build: function (S) {
      var c = { nums: [], piece: [] };
      var cellsG = K.g(S);
      c.pieceG = K.g(S, "t-mv");
      var k = 0;
      rows.forEach(function (r, ri) {
        for (var x = r[0]; x <= r[1]; x++) {
          var isPiece = ri === 0 && x >= 6;
          var host = isPiece ? c.pieceG : cellsG;
          var rc = K.rect(host, x, 2 + ri, 1, 1, "t-shape");
          if (isPiece) c.piece.push(rc);
          k++;
          c.nums.push(K.text(host, x + 0.5, 2.5 + ri, String(k), "t-sm t-acc t-pop"));
        }
      });
      c.cut = K.line(S, 6, 1.6, 6, 3.4, "t-bad t-fade");
      c.shapeOutline = K.rect(S, 2, 2, 4, 3, "t-hi t-fade");
      c.count = K.text(S, 5, 6.6, "12 squares = 12 cm²", "t-acc t-fade");
      c.again = K.text(S, 4, 6.6, "still 12 squares (4 × 3 = 12)", "t-sm t-acc t-fade");
      return c;
    },
    beats: beats,
  });
})();
