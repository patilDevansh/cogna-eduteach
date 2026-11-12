/* Game: split-shape — split an L-shaped room into rectangles by tapping grid segments; live area per piece. */
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

  var W = 10, H = 8, OX = 1, OY = 1, COLS = 8, ROWS = 6;
  // L-shape: 8 x 6 with the top-right 4 x 3 removed -> 36 squares.
  function inShape(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS && !(c >= 4 && r < 3); }
  var TOTAL = 36;

  Cogna.games["split-shape"] = {
    title: "Split the shape",
    mount: function (el, opts) {
      opts = opts || {};
      var done = false, splits = {}, drag = null, bad = [];

      var svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "t-board", role: "img",
        "aria-label": "An L-shaped room on a grid. Tap grid lines inside it to split it into pieces." });
      svg.appendChild(gridPath(W, H));
      var g = S("g", { transform: "translate(" + OX + "," + OY + ")" });
      svg.appendChild(g);
      var cellsG = S("g"), guideG = S("g"), splitG = S("g"), outlineG = S("g"), labelG = S("g"), badG = S("g");
      var hover = S("line", { class: "t-g-edge-hover", visibility: "hidden" });
      [cellsG, guideG, splitG, badG, outlineG, labelG, hover].forEach(function (n) { g.appendChild(n); });
      var r, c;
      for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) if (inShape(c, r)) cellsG.appendChild(S("rect", { class: "t-g-cell", x: c, y: r, width: 1, height: 1 }));
      outlineG.appendChild(S("polygon", { class: "t-g-ink", points: "0,0 4,0 4,3 8,3 8,6 0,6" }));
      // faint guides along the edges you can tap
      var gd = "";
      for (r = 0; r <= ROWS; r++) for (c = 0; c < COLS; c++) if (edgeOk("h", c, r)) gd += "M" + c + " " + r + "h1";
      for (r = 0; r < ROWS; r++) for (c = 0; c <= COLS; c++) if (edgeOk("v", c, r)) gd += "M" + c + " " + r + "v1";
      guideG.appendChild(S("path", { d: gd, class: "t-g-edge-guide", fill: "none" }));

      var readout = h("div", { class: "t-game-readout", "aria-live": "polite" });
      var fb = h("div", { class: "t-game-fb", "aria-live": "polite" });
      var checkBtn = h("button", { class: "btn btn-primary", type: "button", on: { click: check } }, "Check my split");
      var clearBtn = h("button", { class: "btn btn-ghost", type: "button", on: { click: clear } }, "Clear splits");
      var root = h("div", { class: "t-game" },
        h("p", { class: "t-game-instr" }, h("strong", null, "Split it into rectangles. "),
          "Tap or drag along grid lines inside the shape to draw split lines. Each piece shows its area. Tap a line again to remove it."),
        svg, readout, h("div", { class: "t-game-controls" }, checkBtn, clearBtn), fb);
      el.appendChild(root);

      // edge: "h" at (c, r) = horizontal line at y=r from x=c..c+1 ; "v" at (c, r) = vertical line at x=c from y=r..r+1
      function edgeOk(t, c, r) {
        return t === "h" ? inShape(c, r - 1) && inShape(c, r) : inShape(c - 1, r) && inShape(c, r);
      }
      function ek(t, c, r) { return t + c + "," + r; }
      function nearest(p) {
        var lx = p.x - OX, ly = p.y - OY, best = null, bd = 0.38, d;
        var hr = Math.round(ly), hc = Math.floor(lx), vc = Math.round(lx), vr = Math.floor(ly);
        d = Math.abs(ly - hr);
        if (d < bd && edgeOk("h", hc, hr)) { best = ["h", hc, hr]; bd = d; }
        d = Math.abs(lx - vc);
        if (d < bd && edgeOk("v", vc, vr)) { best = ["v", vc, vr]; bd = d; }
        return best;
      }
      function edgeLine(e) {
        return e[0] === "h" ? { x1: e[1], y1: e[2], x2: e[1] + 1, y2: e[2] } : { x1: e[1], y1: e[2], x2: e[1], y2: e[2] + 1 };
      }

      function pieces() {
        var seen = {}, out = [];
        for (var r0 = 0; r0 < ROWS; r0++) for (var c0 = 0; c0 < COLS; c0++) {
          if (!inShape(c0, r0) || seen[c0 + "," + r0]) continue;
          var stack = [[c0, r0]], cells = [];
          seen[c0 + "," + r0] = 1;
          while (stack.length) {
            var q = stack.pop(), cc = q[0], rr = q[1];
            cells.push(q);
            var nb = [
              [cc + 1, rr, !splits[ek("v", cc + 1, rr)]], [cc - 1, rr, !splits[ek("v", cc, rr)]],
              [cc, rr + 1, !splits[ek("h", cc, rr + 1)]], [cc, rr - 1, !splits[ek("h", cc, rr)]],
            ];
            nb.forEach(function (n) {
              if (n[2] && inShape(n[0], n[1]) && !seen[n[0] + "," + n[1]]) { seen[n[0] + "," + n[1]] = 1; stack.push([n[0], n[1]]); }
            });
          }
          var xs = cells.map(function (z) { return z[0]; }), ys = cells.map(function (z) { return z[1]; });
          var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
          var w = x1 - x0 + 1, hh = y1 - y0 + 1, rect = w * hh === cells.length;
          var mx = xs.reduce(function (a, b) { return a + b; }, 0) / cells.length, my = ys.reduce(function (a, b) { return a + b; }, 0) / cells.length;
          var lc = cells.slice().sort(function (a, b) { return Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my); })[0];
          out.push({ cells: cells, n: cells.length, w: w, h: hh, rect: rect, cx: rect ? x0 + w / 2 : lc[0] + 0.5, cy: rect ? y0 + hh / 2 : lc[1] + 0.5 });
        }
        return out;
      }

      function render() {
        splitG.textContent = ""; labelG.textContent = ""; badG.textContent = ""; bad = [];
        Object.keys(splits).forEach(function (k) { splitG.appendChild(S("line", Object.assign({ class: "t-g-split" }, edgeLine(splits[k])))); });
        var ps = pieces();
        ps.forEach(function (p) {
          var t = p.rect ? p.w + "×" + p.h + "=" + p.n : p.n + " sq";
          labelG.appendChild(S("text", { class: "t-g-label", x: p.cx, y: p.cy + 0.17, "text-anchor": "middle" }, t));
        });
        var sum = ps.map(function (p) { return p.n; });
        readout.textContent = ps.length === 1 ? "One piece: " + TOTAL + " squares" : sum.join(" + ") + " = " + sum.reduce(function (a, b) { return a + b; }, 0) + " squares";
        ps._all = ps; return ps;
      }
      function clearFb() { say(fb, true, "", ""); badG.textContent = ""; }
      function clear() { if (done) return; splits = {}; render(); clearFb(); }

      function toggle(e, mode) {
        var k = ek(e[0], e[1], e[2]);
        if (mode === "add") splits[k] = e; else delete splits[k];
        clearFb(); render();
      }
      function down(ev) {
        if (done) return;
        var e = nearest(toBoard(svg, ev));
        if (!e) return;
        ev.preventDefault();
        var mode = splits[ek(e[0], e[1], e[2])] ? "remove" : "add";
        drag = { id: ev.pointerId, mode: mode };
        try { svg.setPointerCapture(ev.pointerId); } catch (err) {}
        toggle(e, mode);
      }
      function move(ev) {
        var e = nearest(toBoard(svg, ev));
        if (e && !done) {
          var l = edgeLine(e);
          hover.setAttribute("x1", l.x1); hover.setAttribute("y1", l.y1); hover.setAttribute("x2", l.x2); hover.setAttribute("y2", l.y2);
          hover.setAttribute("visibility", "visible");
        } else hover.setAttribute("visibility", "hidden");
        if (!drag || ev.pointerId !== drag.id || !e) return;
        var k = ek(e[0], e[1], e[2]);
        if ((drag.mode === "add") !== !!splits[k]) toggle(e, drag.mode);
      }
      function up(ev) { if (drag && ev.pointerId === drag.id) drag = null; }
      svg.addEventListener("pointerdown", down);
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", up);
      svg.addEventListener("pointerleave", function () { hover.setAttribute("visibility", "hidden"); });

      function check() {
        if (done) return;
        var ps = pieces();
        if (ps.length < 2) {
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: false });
          say(fb, false, "No splits yet.", "Draw a line across the shape so it breaks into smaller pieces you can measure."); return;
        }
        var notRect = ps.filter(function (p) { return !p.rect; });
        if (notRect.length) {
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: false });
          badG.textContent = "";
          notRect.forEach(function (p) { p.cells.forEach(function (z) { badG.appendChild(S("rect", { class: "t-g-cell-bad", x: z[0] + 0.05, y: z[1] + 0.05, width: 0.9, height: 0.9 })); }); });
          say(fb, false, "Nearly. One piece isn't a rectangle yet.",
            "The dashed piece has a notch. Add another split so every piece is a plain rectangle.");
          return;
        }
        var sum = ps.reduce(function (a, p) { return a + p.n; }, 0);
        done = true; checkBtn.disabled = true; clearBtn.disabled = true;
        if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
        say(fb, true, "Every piece is a rectangle.",
          "Find each area and add them: " + ps.map(function (p) { return p.n; }).join(" + ") + " = " + sum + " square units for the whole shape.");
        if (opts.onSuccess) opts.onSuccess({ game: "split-shape", pieces: ps.length, area: sum });
      }

      render();
      return { destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); } };
    },
  };
})();
