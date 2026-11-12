/* Game: pick-height — tap the real height on 3 shapes in a row. The slanted side is the tempting wrong line. */
(function () {
  "use strict";
  var h = Cogna.h, S = Cogna.svg;

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

  var W = 11, H = 6.6;
  var SHAPES = [
    { name: "parallelogram", poly: [[1, 5], [7, 5], [10, 1], [4, 1]],
      labels: [["6 cm", 4, 5.75], ["5 cm", 1.9, 3.1, "end"]], h: 4,
      lines: [{ a: [1, 5], b: [4, 1], slant: true }, { a: [6, 1], b: [6, 5], correct: true }, { a: [7, 5], b: [10, 1], slant: true }] },
    { name: "triangle", poly: [[2, 5], [10, 5], [5, 1]],
      labels: [["8 cm", 6, 5.75], ["5 cm", 3.2, 2.9, "end"]], h: 4,
      lines: [{ a: [2, 5], b: [5, 1], slant: true }, { a: [5, 1], b: [5, 5], correct: true }, { a: [10, 5], b: [5, 1], slant: true }] },
    { name: "trapezium", poly: [[1, 5], [10, 5], [7, 1], [4, 1]],
      labels: [["9 cm", 5.5, 5.75], ["3 cm", 5.5, 0.65], ["5 cm", 1.9, 3.1, "end"]], h: 4,
      lines: [{ a: [1, 5], b: [4, 1], slant: true }, { a: [7, 1], b: [7, 5], correct: true }, { a: [10, 5], b: [7, 1], slant: true }] },
  ];

  Cogna.games["pick-height"] = {
    title: "Pick the height",
    mount: function (el, opts) {
      opts = opts || {};
      var idx = 0, streak = 0, done = false, busy = false, timers = [];

      var svg = S("svg", { viewBox: "0 0 " + W + " " + H, class: "t-board", role: "group",
        "aria-label": "A shape with three candidate lines. Pick the one that is the height." });
      var stage = S("g");
      svg.appendChild(gridPath(W, H)); svg.appendChild(stage);
      var pips = [0, 1, 2].map(function () { return h("span", { class: "t-ph-pip", "data-state": "todo" }); });
      var stepLbl = h("span", null, "");
      var steps = h("div", { class: "t-ph-steps", "aria-live": "polite" }, pips, stepLbl);
      var fb = h("div", { class: "t-game-fb", "aria-live": "polite" });
      var instr = h("p", { class: "t-game-instr" }, h("strong", null, "Tap the height. "),
        "Three dashed lines are on each shape. Pick the one that is the height. Get all 3 shapes right in a row.");
      var root = h("div", { class: "t-game" }, instr, steps, svg, fb);
      el.appendChild(root);

      function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
      function line(p) { return { x1: p.a[0], y1: p.a[1], x2: p.b[0], y2: p.b[1] }; }

      function draw() {
        stage.textContent = "";
        var sh = SHAPES[idx];
        stage.appendChild(S("polygon", { class: "t-g-shape", points: sh.poly.map(function (q) { return q.join(","); }).join(" ") }));
        sh.labels.forEach(function (l) {
          stage.appendChild(S("text", { class: "t-g-label", x: l[1], y: l[2], "text-anchor": l[3] || "middle" }, l[0]));
        });
        sh.lines.forEach(function (ln, i) {
          var g = S("g", { class: "t-g-cand", tabindex: 0, role: "button",
            "aria-label": "Line " + (i + 1) + " of 3 on the " + sh.name });
          g.appendChild(S("line", Object.assign({ class: "t-g-hit" }, line(ln))));
          g.appendChild(S("line", Object.assign({ class: "t-g-candline" }, line(ln))));
          g.addEventListener("click", function () { pick(ln, g, sh); });
          g.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(ln, g, sh); }
          });
          stage.appendChild(g);
        });
        pips.forEach(function (p, i) { p.setAttribute("data-state", i < idx ? "done" : i === idx ? "now" : "todo"); });
        stepLbl.textContent = "Shape " + (idx + 1) + " of 3: the " + sh.name;
      }

      function lock() { Array.prototype.forEach.call(stage.querySelectorAll(".t-g-cand"), function (g) { g.setAttribute("data-locked", "1"); g.setAttribute("tabindex", "-1"); }); }

      function pick(ln, g, sh) {
        if (done || busy) return;
        busy = true; lock();
        if (ln.correct) {
          g.setAttribute("data-state", "right");
          var x = ln.a[0];
          stage.appendChild(S("path", { class: "t-g-hl", d: "M" + (x - 0.45) + " 5V4.55H" + x }));
          stage.appendChild(S("text", { class: "t-g-label", x: x + 0.3, y: 3.2 }, "height " + sh.h + " cm"));
          streak++;
          if (opts.onEvent) opts.onEvent({ kind: "answer", correct: true });
          if (streak === 3) {
            done = true;
            pips.forEach(function (p) { p.setAttribute("data-state", "done"); });
            say(fb, true, "3 in a row.", "The height always meets the base at a right angle. The slanted side is longer, so it is never the height.");
            if (opts.onSuccess) opts.onSuccess({ game: "pick-height", streak: 3 });
          } else {
            say(fb, true, "Yes, that is the height.", "It stands straight up from the base, with a square corner.");
            later(function () { idx++; draw(); say(fb, true, "", ""); busy = false; }, 1100);
          }
        } else {
          g.setAttribute("data-state", "wrong");
          streak = 0;
          var ev = { kind: "answer", correct: false };
          if (ln.slant) ev.mixup = "slant";
          if (opts.onEvent) opts.onEvent(ev);
          say(fb, false, ln.slant ? "That is the slanted side." : "Not that one.",
            "The height meets the base at a right angle, like a square corner. Let's start again from the first shape.");
          later(function () { idx = 0; draw(); busy = false; }, 1800);
        }
      }

      draw();
      return { destroy: function () { timers.forEach(clearTimeout); if (root.parentNode) root.parentNode.removeChild(root); } };
    },
  };
})();
