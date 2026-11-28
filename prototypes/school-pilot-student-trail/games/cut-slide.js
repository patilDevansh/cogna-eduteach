/* Game: cut-slide — cut a parallelogram with a knife, slide the triangle across, get a rectangle. */
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
  function pts(poly, dx, dy) { return poly.map(function (p) { return (p[0] + dx) + "," + (p[1] + dy); }).join(" "); }

  var W = 10, H = 6, OX = 1, OY = 1.5;
  // Parallelogram in local cm: base 6, height 3, top shifted right by 2.
  var PARA = [[0, 3], [6, 3], [8, 0], [2, 0]];
  var TRI = { 2: [[0, 3], [2, 3], [2, 0]], 6: [[6, 3], [8, 0], [6, 0]] };
  var TRAP = { 2: [[2, 3], [6, 3], [8, 0], [2, 0]], 6: [[0, 3], [6, 3], [6, 0], [2, 0]] };
  var SHIFT = { 2: 6, 6: -6 };

  Cogna.games["cut-slide"] = {
    title: "Cut and slide",
    mount: function (el, opts) {
      opts = opts || {};
      var done = false, phase = "knife", k = 4, cutAt = null, off = [0, 0], drag = null;

      var svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "t-board", role: "img",
        "aria-label": "A parallelogram, 6 cm wide and 3 cm tall, on a grid, with a movable cutting line" });
      svg.appendChild(gridPath(W, H));
      var shapeG = S("g", { transform: "translate(" + OX + "," + OY + ")" });
      svg.appendChild(shapeG);
      var para = S("polygon", { class: "t-g-piece", points: pts(PARA, 0, 0) });
      var baseLbl = S("text", { class: "t-g-label", x: 3, y: 3.75, "text-anchor": "middle" }, "base 6 cm");
      shapeG.appendChild(para); shapeG.appendChild(baseLbl);
      var extras = S("g"); shapeG.appendChild(extras);

      // knife
      var knife = S("g", { class: "t-g-drag" });
      var knifeHit = S("rect", { class: "t-g-hit-rect", x: -0.8, y: -0.5, width: 1.6, height: 4.6 });
      var knifeLine = S("line", { class: "t-g-knife", x1: 0, y1: -0.3, x2: 0, y2: 3.3 });
      var knifeGrip = S("rect", { class: "t-g-knife-grip", x: -0.28, y: -0.6, width: 0.56, height: 0.45, rx: 0.12 });
      knife.appendChild(knifeHit); knife.appendChild(knifeLine); knife.appendChild(knifeGrip);
      shapeG.appendChild(knife);
      function placeKnife() { knife.setAttribute("transform", "translate(" + k + ",0)"); }
      placeKnife();

      var fb = h("div", { class: "t-game-fb", "aria-live": "polite" });
      var instr = h("p", { class: "t-game-instr" }, h("strong", null, "Make a rectangle. "),
        "Drag the dashed knife line, then press Cut. The cut should be a straight line down from a top corner.");
      var kl = btn("Knife left", function () { moveKnife(k - 1); });
      var kr = btn("Knife right", function () { moveKnife(k + 1); });
      var cutBtn = h("button", { class: "btn btn-primary", type: "button", on: { click: doCut } }, "Cut");
      var sl = btn("Slide triangle left", function () { nudge(-1); });
      var sr = btn("Slide triangle right", function () { nudge(1); });
      sl.hidden = true; sr.hidden = true;
      function btn(t, fn) { return h("button", { class: "btn btn-ghost", type: "button", on: { click: fn } }, t); }
      var root = h("div", { class: "t-game" }, instr, svg,
        h("div", { class: "t-game-controls" }, kl, kr, cutBtn, sl, sr), fb);
      el.appendChild(root);

      function moveKnife(x) {
        if (phase !== "knife" || done) return;
        k = Math.max(0, Math.min(8, x)); placeKnife();
      }

      function doCut() {
        if (phase !== "knife" || done) return;
        if (k === 2 || k === 6) {
          cutAt = k; phase = "slide";
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
          say(fb, true, "", "");
          shapeG.removeChild(para); shapeG.removeChild(baseLbl); shapeG.removeChild(knife);
          extras.appendChild(S("polygon", { class: "t-g-piece", points: pts(TRAP[k], 0, 0) }));
          // dashed outline of the gap the triangle should fill
          extras.appendChild(S("polygon", { class: "t-g-hl-dash", points: pts(TRI[k], SHIFT[k], 0) }));
          tri = S("polygon", { class: "t-g-piece-move", points: pts(TRI[k], 0, 0), tabindex: 0,
            role: "button", "aria-label": "Triangle piece. Use the slide buttons to move it." });
          shapeG.appendChild(tri);
          kl.hidden = true; kr.hidden = true; cutBtn.hidden = true; sl.hidden = false; sr.hidden = false;
          instr.textContent = "";
          instr.appendChild(h("strong", null, "Now slide the triangle. "));
          instr.appendChild(document.createTextNode("Drag it to the other end of the shape. It snaps to the grid."));
        } else {
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: false });
          say(fb, false, "Not quite that cut.",
            "Start at a top corner and cut straight down. That makes a triangle you can move to the other end.");
        }
      }

      var tri = null;
      function setOff(dx, dy) {
        off = [dx, dy];
        tri.setAttribute("transform", "translate(" + dx + "," + dy + ")");
      }
      function finish() {
        done = true; phase = "done";
        setOff(SHIFT[cutAt], 0);
        tri.setAttribute("class", "t-g-piece"); tri.removeAttribute("tabindex");
        extras.textContent = "";
        extras.appendChild(S("polygon", { class: "t-g-piece", points: pts(TRAP[cutAt], 0, 0) }));
        extras.appendChild(S("rect", { class: "t-g-hl", x: cutAt === 2 ? 2 : 0, y: 0, width: 6, height: 3 }));
        extras.appendChild(S("text", { class: "t-g-label", x: (cutAt === 2 ? 2 : 0) + 3, y: 3.75, "text-anchor": "middle" }, "base 6 cm"));
        extras.appendChild(S("text", { class: "t-g-label", x: (cutAt === 2 ? 2 : 0) + 2, y: 0.55, "text-anchor": "middle" }, "height 3 cm"));
        shapeG.appendChild(tri); // keep triangle on top
        sl.disabled = true; sr.disabled = true;
        instr.textContent = "";
        say(fb, true, "It is a rectangle now.",
          "Cutting and sliding kept the area the same, so the parallelogram's area is base × height = 6 × 3 = 18 square units.");
        if (opts.onSuccess) opts.onSuccess({ game: "cut-slide", base: 6, height: 3, area: 18 });
      }
      function nudge(d) {
        if (phase !== "slide" || done) return;
        var dx = Math.max(-8, Math.min(8, off[0] + d));
        if (dx === SHIFT[cutAt] && off[1] === 0) {
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
          finish(); return;
        }
        setOff(dx, off[1]);
      }

      function down(e) {
        if (done) return;
        var p = toBoard(svg, e), lx = p.x - OX, ly = p.y - OY;
        if (phase === "knife") {
          if (Math.abs(lx - k) < 0.9 && ly > -0.6 && ly < 3.6) {
            e.preventDefault();
            drag = { id: e.pointerId, kind: "knife" };
            try { svg.setPointerCapture(e.pointerId); } catch (err) {}
            svg.classList.add("t-g-dragging");
          }
        } else if (phase === "slide" && e.target === tri) {
          e.preventDefault();
          drag = { id: e.pointerId, kind: "tri", sx: p.x, sy: p.y };
          try { svg.setPointerCapture(e.pointerId); } catch (err) {}
          svg.classList.add("t-g-dragging");
        }
      }
      function move(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var p = toBoard(svg, e);
        if (drag.kind === "knife") {
          moveKnife(Math.round(p.x - OX));
        } else {
          var dx = Math.round(p.x - drag.sx), dy = Math.round(p.y - drag.sy);
          // keep the triangle on the board
          var xs = TRI[cutAt].map(function (q) { return q[0]; }), ys = TRI[cutAt].map(function (q) { return q[1]; });
          var minX = Math.min.apply(null, xs) + OX, maxX = Math.max.apply(null, xs) + OX;
          var minY = Math.min.apply(null, ys) + OY, maxY = Math.max.apply(null, ys) + OY;
          dx = Math.max(-minX, Math.min(W - maxX, dx));
          dy = Math.max(-minY, Math.min(H - maxY, dy));
          setOff(dx, dy);
        }
      }
      function up(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var kind = drag.kind; drag = null;
        svg.classList.remove("t-g-dragging");
        if (kind === "tri") {
          if (off[0] === SHIFT[cutAt] && off[1] === 0) {
            if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
            finish();
          } else if (off[0] !== 0 || off[1] !== 0) {
            if (opts.onEvent) opts.onEvent({ kind: "answer", correct: false });
            say(fb, false, "Almost. That doesn't fit yet.",
              "Slide the triangle straight across to the dashed gap at the other end, without moving it up or down.");
            setOff(0, 0);
          }
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
