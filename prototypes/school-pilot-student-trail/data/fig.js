/* Cogna prototype — figure helpers that return inline SVG STRINGS for data/*.js.
   CONTRACT FILE (owned by the orchestrator). Units: 1 = one 1 cm grid square.
   Styling comes from proto.css (.t-figure .grid/.shape/.height/.wrong/.label).

   Example:
     Cogna.fig.wrap(10, 6, [
       Cogna.fig.grid(10, 6),
       Cogna.fig.poly([[1,5],[7,5],[9,1],[3,1]]),          // parallelogram
       Cogna.fig.line(3,1, 3,5, 'height'),                  // dashed height
       Cogna.fig.right(3,5),                                // right-angle mark at foot
       Cogna.fig.label(4,5.7,'8 cm'), Cogna.fig.label(3.2,3,'4 cm')
     ])
*/
(function () {
  "use strict";
  function n(v) { return Math.round(v * 1000) / 1000; }
  var fig = {
    /** Outer <svg>. pad adds margin around the w×h grid. */
    wrap: function (w, h, parts, opts) {
      var pad = (opts && opts.pad) || 1.2; // room for side labels like "3 cm" anchored outside the grid
      var label = (opts && opts.alt) || "figure";
      return '<svg class="t-figure" viewBox="' + n(-pad) + " " + n(-pad) + " " + n(w + 2 * pad) + " " + n(h + 2 * pad) +
        '" role="img" aria-label="' + label.replace(/"/g, "&quot;") + '">' + parts.join("") + "</svg>";
    },
    grid: function (w, h) {
      var s = "";
      for (var x = 0; x <= w; x++) s += '<line class="grid" x1="' + x + '" y1="0" x2="' + x + '" y2="' + h + '"/>';
      for (var y = 0; y <= h; y++) s += '<line class="grid" x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '"/>';
      return s;
    },
    /** points: [[x,y],...]; cls defaults to 'shape' */
    poly: function (points, cls) {
      return '<polygon class="' + (cls || "shape") + '" points="' + points.map(function (p) { return n(p[0]) + "," + n(p[1]); }).join(" ") + '"/>';
    },
    /** cls: 'height' (dashed accent) | 'wrong' (orange) | 'shape' (ink) */
    line: function (x1, y1, x2, y2, cls) {
      var style = cls === "shape" ? ' style="fill:none"' : "";
      return '<line class="' + (cls || "shape") + '" x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '"' + style + "/>";
    },
    /** Small right-angle square whose corner sits at (x,y), opening up-right by default. dir: 'ur'|'ul'|'dr'|'dl' */
    right: function (x, y, dir) {
      var s = 0.4, dx = (dir === "ul" || dir === "dl") ? -s : s, dy = (dir === "dr" || dir === "dl") ? s : -s;
      return '<polyline class="height" style="fill:none;stroke-dasharray:none" points="' +
        n(x + dx) + "," + n(y) + " " + n(x + dx) + "," + n(y + dy) + " " + n(x) + "," + n(y + dy) + '"/>';
    },
    label: function (x, y, text, anchor) {
      return '<text class="label" x="' + n(x) + '" y="' + n(y) + '" text-anchor="' + (anchor || "middle") + '">' + text + "</text>";
    },
  };
  window.Cogna.fig = fig;
})();
