/* Game: join-triangles — turn a copy of a triangle and slide it against the original to make a parallelogram. */
(function () {
  "use strict";
  var h = Cogna.h, S = Cogna.svg;

  function toBoard(svg, e) {
    var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    var m = svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }
  function gridPath(w, hh) {
    var d = "", i;
    for (i = 0; i <= w; i++) d += "M" + i + " 0V" + hh;
    for (i = 0; i <= hh; i++) d += "M0 " + i + "H" + w;
    return S("path", { d: d, class: "t-g-grid" });
  }
  function say(box, ok, title, text) {
    box.textContent = "";
    if (!title && !text) return;
    box.appendChild(h("div", { class: "feedback " + (ok ? "feedback-correct" : "feedback-incorrect"), role: "status" },
      h("div", null, h("strong", null, title), text)));
  }

  var W = 14, H = 9;
  var ORIG = [[3, 5], [7, 5], [4, 2]];          // base 4, height 3 -> area 6
  var OFFS = [[0, 0], [4, 0], [1, -3]];          // copy, as offsets from its pivot (first corner)
  function rot(o, r) {
    var x = o[0], y = o[1], t, i;
    for (i = 0; i < r; i++) { t = x; x = -y; y = t; }
    return [x, y];
  }
  function verts(p, r) { return OFFS.map(function (o) { var q = rot(o, r); return [p[0] + q[0], p[1] + q[1]]; }); }
  function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
  function side(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  // joined = shares exactly one whole side, with the third corners on opposite sides of it
  function joined(v) {
    var sh = [], i, j;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) if (same(v[i], ORIG[j])) sh.push([i, j]);
    if (sh.length !== 2) return null;
    var ci = [0, 1, 2].filter(function (x) { return x !== sh[0][0] && x !== sh[1][0]; })[0];
    var cj = [0, 1, 2].filter(function (x) { return x !== sh[0][1] && x !== sh[1][1]; })[0];
    var s1 = side(ORIG[sh[0][1]], ORIG[sh[1][1]], v[ci]), s2 = side(ORIG[sh[0][1]], ORIG[sh[1][1]], ORIG[cj]);
    if (s1 * s2 >= 0) return null;
    var four = [v[ci], ORIG[cj], ORIG[sh[0][1]], ORIG[sh[1][1]]];
    var cx = (four[0][0] + four[1][0] + four[2][0] + four[3][0]) / 4, cy = (four[0][1] + four[1][1] + four[2][1] + four[3][1]) / 4;
    four.sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
    return four;
  }
  function str(vs) { return vs.map(function (q) { return q.join(","); }).join(" "); }

  Cogna.games["join-triangles"] = {
    title: "Join two triangles",
    mount: function (el, opts) {
      opts = opts || {};
      var done = false, r = 0, p = [9, 4], drag = null;

      var svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "t-board", role: "img",
        "aria-label": "A triangle with base 4 and height 3, and an identical copy that can be turned and moved" });
      svg.appendChild(gridPath(W, H));
      var orig = S("polygon", { class: "t-g-shape", points: str(ORIG) });
      var outline = S("polygon", { class: "t-g-hl-dash", points: "", visibility: "hidden" });
      var copy = S("polygon", { class: "t-g-piece-move", points: "", tabindex: 0, role: "button",
        "aria-label": "Copy of the triangle. Use the Turn and move buttons to place it." });
      var label = S("text", { class: "t-g-label", x: 5, y: 5.8, "text-anchor": "middle" }, "base 4, height 3");
      var result = S("text", { class: "t-g-label-big", x: 7, y: 8.4, "text-anchor": "middle" });
      svg.appendChild(orig); svg.appendChild(label); svg.appendChild(outline); svg.appendChild(copy); svg.appendChild(result);

      var fb = h("div", { class: "t-game-fb", "aria-live": "polite" });
      function btn(t, fn) { return h("button", { class: "btn btn-ghost", type: "button", on: { click: fn } }, t); }
      var turnBtn = h("button", { class: "btn btn-primary", type: "button", on: { click: turn } }, "Turn copy");
      var mv = [btn("Left", function () { step(-1, 0); }), btn("Right", function () { step(1, 0); }),
        btn("Up", function () { step(0, -1); }), btn("Down", function () { step(0, 1); })];
      var root = h("div", { class: "t-game" },
        h("p", { class: "t-game-instr" }, h("strong", null, "Make a parallelogram. "),
          "Press Turn to rotate the copy, then drag it so a whole side lines up with the same side of the first triangle."),
        svg, h("div", { class: "t-game-controls" }, turnBtn, mv), fb);
      el.appendChild(root);

      function bounds(rr) {
        var vs = OFFS.map(function (o) { return rot(o, rr); });
        var xs = vs.map(function (q) { return q[0]; }), ys = vs.map(function (q) { return q[1]; });
        return { x0: -Math.min.apply(null, xs), x1: W - Math.max.apply(null, xs), y0: -Math.min.apply(null, ys), y1: H - Math.max.apply(null, ys) };
      }
      function clamp(q, rr) {
        var b = bounds(rr);
        return [Math.max(b.x0, Math.min(b.x1, q[0])), Math.max(b.y0, Math.min(b.y1, q[1]))];
      }
      function draw() { copy.setAttribute("points", str(verts(p, r))); }
      draw();

      function succeed(four) {
        done = true;
        outline.setAttribute("points", str(four)); outline.setAttribute("visibility", "visible");
        copy.setAttribute("class", "t-g-piece"); copy.removeAttribute("tabindex");
        label.textContent = "";
        result.textContent = "Parallelogram = 12";
        turnBtn.disabled = true; mv.forEach(function (b) { b.disabled = true; });
        say(fb, true, "Two triangles make a parallelogram.",
          "Together they cover 12 squares. The two triangles match, so one triangle is half of the parallelogram: 6 squares.");
        if (opts.onSuccess) opts.onSuccess({ game: "join-triangles", triangleArea: 6, parallelogramArea: 12 });
      }
      function turn() {
        if (done) return;
        r = (r + 1) % 4; p = clamp(p, r); draw();
        var j = joined(verts(p, r));
        if (j) { if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true }); succeed(j); }
      }
      function step(dx, dy) {
        if (done) return;
        p = clamp([p[0] + dx, p[1] + dy], r); draw();
        var j = joined(verts(p, r));
        if (j) { if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true }); succeed(j); }
      }

      function down(e) {
        if (done || e.target !== copy) return;
        e.preventDefault();
        var q = toBoard(svg, e);
        drag = { id: e.pointerId, gx: q.x - p[0], gy: q.y - p[1], start: p.slice() };
        try { svg.setPointerCapture(e.pointerId); } catch (err) {}
        svg.classList.add("t-g-dragging");
      }
      function move(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var q = toBoard(svg, e);
        p = clamp([Math.round(q.x - drag.gx), Math.round(q.y - drag.gy)], r); draw();
      }
      function up(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var moved = !same(drag.start, p);
        drag = null; svg.classList.remove("t-g-dragging");
        if (!moved) return;
        var j = joined(verts(p, r));
        if (j) {
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
          succeed(j);
        } else {
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: false });
          say(fb, false, "Not a parallelogram yet.", r === 2
            ? "Good turn. Now slide the copy so a whole side lines up exactly with the same-length side of the first triangle."
            : "Try turning the copy first. A half turn (press Turn twice) flips it upside down so its sides can match up.");
        }
      }
      svg.addEventListener("pointerdown", down);
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", function (e) { if (drag && e.pointerId === drag.id) { drag = null; svg.classList.remove("t-g-dragging"); } });

      return { destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); } };
    },
  };
})();
