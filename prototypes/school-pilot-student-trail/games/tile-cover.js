/* Game: tile-cover — drag unit tiles from the tray to cover an L-shape (11 squares). */
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

  var W = 11, H = 6, OX = 1, OY = 1;
  // L-shape: 2 wide x 3 tall arm, plus a bottom row of 5 = 6 + 5 = 11 cells.
  var CELLS = [];
  (function () {
    var r, c;
    for (r = 0; r < 4; r++) for (c = 0; c < (r < 3 ? 2 : 5); c++) CELLS.push([c, r]);
  })();
  function inShape(c, r) { return r >= 0 && r < 4 && c >= 0 && c < (r < 3 ? 2 : 5); }
  var TRAY = { x: 7, y: 1, w: 3, h: 4 };

  Cogna.games["tile-cover"] = {
    title: "Cover the shape with tiles",
    mount: function (el, opts) {
      opts = opts || {};
      var done = false, placed = {}, count = 0, drag = null;

      var svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "t-board", role: "img",
        "aria-label": "An L-shaped floor made of grid squares, and a tray of square tiles" });
      svg.appendChild(gridPath(W, H));
      svg.appendChild(S("polygon", { class: "t-g-shape",
        points: [[1, 1], [3, 1], [3, 4], [6, 4], [6, 5], [1, 5]].join(" ") }));
      svg.appendChild(S("rect", { class: "t-g-tray", x: TRAY.x, y: TRAY.y, width: TRAY.w, height: TRAY.h, rx: 0.2 }));
      var trayTile = S("rect", { class: "t-g-tile", x: 8, y: 2.2, width: 1, height: 1 });
      var trayText = S("text", { class: "t-g-label-soft", x: 8.5, y: 4.1, "text-anchor": "middle" }, "drag a tile");
      var trayText2 = S("text", { class: "t-g-label-soft", x: 8.5, y: 4.55, "text-anchor": "middle" }, "from here");
      var result = S("text", { class: "t-g-label-big", x: 8.5, y: 3.1, "text-anchor": "middle" });
      svg.appendChild(trayTile); svg.appendChild(trayText); svg.appendChild(trayText2);
      var tilesG = S("g");
      var target = S("rect", { class: "t-g-target", width: 1, height: 1, visibility: "hidden" });
      var ghost = S("rect", { class: "t-g-ghost", width: 1, height: 1, rx: 0.05, visibility: "hidden" });
      svg.appendChild(tilesG); svg.appendChild(target); svg.appendChild(ghost); svg.appendChild(result);

      var counter = h("div", { class: "t-game-readout" }, "Squares covered: 0");
      var fb = h("div", { class: "t-game-fb", "aria-live": "polite" });
      var nextBtn = h("button", { class: "btn btn-ghost", type: "button", on: { click: placeNext } }, "Place next tile");
      var clearBtn = h("button", { class: "btn btn-ghost", type: "button", on: { click: clearAll } }, "Clear tiles");
      var root = h("div", { class: "t-game" },
        h("p", { class: "t-game-instr" }, h("strong", null, "Cover the L-shape. "),
          "Drag tiles from the tray onto it. Each tile is 1 square. Tap a placed tile to take it back."),
        svg, counter,
        h("div", { class: "t-game-controls" }, nextBtn, clearBtn), fb);
      el.appendChild(root);

      function key(c, r) { return c + "," + r; }
      function refresh() {
        counter.textContent = "Squares covered: " + count;
      }
      function addTile(c, r) {
        var t = S("rect", { class: "t-g-tile", x: OX + c, y: OY + r, width: 1, height: 1, rx: 0.05 });
        placed[key(c, r)] = t; tilesG.appendChild(t); count++; refresh();
      }
      function removeTile(c, r) {
        var t = placed[key(c, r)];
        if (!t) return;
        tilesG.removeChild(t); delete placed[key(c, r)]; count--; refresh();
        say(fb, true, "", "");
      }
      function afterPlace() {
        if (count === CELLS.length) {
          done = true;
          result.textContent = "";
          result.appendChild(document.createTextNode("Area = 11"));
          result.appendChild(S("tspan", { x: 8.5, dy: 0.8 }, "squares"));
          trayTile.setAttribute("visibility", "hidden"); trayText.setAttribute("visibility", "hidden");
          trayText2.setAttribute("visibility", "hidden");
          say(fb, true, "Every square is covered.", "The area is 11 squares. You counted the space by filling it.");
          nextBtn.disabled = true; clearBtn.disabled = true;
          if (opts.onSuccess) opts.onSuccess({ game: "tile-cover", area: 11 });
        }
      }
      function placeNext() {
        if (done) return;
        for (var i = 0; i < CELLS.length; i++) {
          var c = CELLS[i][0], r = CELLS[i][1];
          if (!placed[key(c, r)]) {
            addTile(c, r);
            if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
            say(fb, true, "", "");
            afterPlace();
            return;
          }
        }
      }
      function clearAll() {
        if (done) return;
        Object.keys(placed).forEach(function (k) { tilesG.removeChild(placed[k]); });
        placed = {}; count = 0; refresh(); say(fb, true, "", "");
      }

      function inTray(p) { return p.x >= TRAY.x && p.x <= TRAY.x + TRAY.w && p.y >= TRAY.y && p.y <= TRAY.y + TRAY.h; }
      function moveGhost(p) {
        ghost.setAttribute("x", p.x - 0.5); ghost.setAttribute("y", p.y - 0.5);
        var c = Math.floor(p.x) - OX, r = Math.floor(p.y) - OY;
        target.setAttribute("x", OX + c); target.setAttribute("y", OY + r);
        target.setAttribute("class", inShape(c, r) && !placed[key(c, r)] ? "t-g-target" : "t-g-target-bad");
        target.setAttribute("visibility", c >= -1 && r >= -1 && c < 10 && r < 6 ? "visible" : "hidden");
      }
      function endDrag() {
        drag = null; ghost.setAttribute("visibility", "hidden"); target.setAttribute("visibility", "hidden");
        svg.classList.remove("t-g-dragging");
      }

      function down(e) {
        if (done) return;
        var p = toBoard(svg, e);
        var c = Math.floor(p.x) - OX, r = Math.floor(p.y) - OY;
        if (inShape(c, r) && placed[key(c, r)]) { removeTile(c, r); return; }
        if (inTray(p)) {
          e.preventDefault();
          drag = { id: e.pointerId };
          try { svg.setPointerCapture(e.pointerId); } catch (err) {}
          ghost.setAttribute("visibility", "visible"); moveGhost(p);
          svg.classList.add("t-g-dragging");
        }
      }
      function move(e) {
        if (!drag || e.pointerId !== drag.id) return;
        moveGhost(toBoard(svg, e));
      }
      function up(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var p = toBoard(svg, e);
        endDrag();
        var c = Math.floor(p.x) - OX, r = Math.floor(p.y) - OY;
        if (inTray(p)) return; // dropped back in the tray: nothing happened
        if (inShape(c, r)) {
          if (placed[key(c, r)]) { say(fb, false, "That square already has a tile.", "Try an empty square."); return; }
          addTile(c, r);
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
          say(fb, true, "", "");
          afterPlace();
        } else {
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: false });
          say(fb, false, "That tile landed outside the shape.", "Tiles only count inside the L. Drop it on a pale square.");
        }
      }
      svg.addEventListener("pointerdown", down);
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", function (e) { if (drag && e.pointerId === drag.id) endDrag(); });

      return { destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); } };
    },
  };
})();
