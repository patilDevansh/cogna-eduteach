/* Pet 2 — Tilu, the living tile.
   Tilu is one unit square with a face. It splits into little copies that cover a shape and
   count themselves, so area is something you count, not something you guess by looks.
   The tall shape looks bigger; the wide one holds more. */
(function () {
  "use strict";
  var K = Cogna.petKit, S = K.S, h = K.h;
  var CELL = 20;
  var SHAPES = {
    a: { x: 100, y: 80, w: 2, h: 7, name: "tall" },
    b: { x: 200, y: 140, w: 4, h: 4, name: "wide" },
  };
  var HOME = [352, 220];

  function drawTilu(st) {
    var g = S("g");
    K.shadow(st, g, 0, 1, 28, 5);
    g.appendChild(S("path", { d: "M 23 -14 q 13 -3 11 -14 q -2 -8 -9 -3", fill: "none", stroke: "#d29a2e", "stroke-width": 4.2, "stroke-linecap": "round" }));
    g.appendChild(S("ellipse", { cx: -12, cy: -2, rx: 7.5, ry: 4.2, fill: "#e8b65a", stroke: "#c48a22", "stroke-width": 1.2 }));
    g.appendChild(S("ellipse", { cx: 12, cy: -2, rx: 7.5, ry: 4.2, fill: "#e8b65a", stroke: "#c48a22", "stroke-width": 1.2 }));
    var body = S("g", { class: "pk-breathe" });
    body.appendChild(S("path", { d: "M -22 -44 L -18 -63 L -5 -50 Z", fill: "#f1cf85", stroke: "#dca03a", "stroke-width": 2.6, "stroke-linejoin": "round" }));
    body.appendChild(S("path", { d: "M 22 -44 L 18 -63 L 5 -50 Z", fill: "#f1cf85", stroke: "#dca03a", "stroke-width": 2.6, "stroke-linejoin": "round" }));
    body.appendChild(S("rect", { x: -25, y: -52, width: 50, height: 50, rx: 11, stroke: "#dca03a", "stroke-width": 3,
      fill: st.radial([[0, "#fffdf6"], [0.55, "#fbe7b5"], [1, "#efc873"]], { cx: "35%", cy: "28%", r: "85%" }) }));
    body.appendChild(S("ellipse", { cx: -11, cy: -43, rx: 8, ry: 3.6, fill: "#fff", opacity: 0.6, transform: "rotate(-18 -11 -43)" }));
    body.appendChild(S("text", { x: 0, y: -9, "text-anchor": "middle", class: "pk-tilu-label" }, "1 cm²"));
    K.eyes(body, [[-9, -32], [9, -32]], 3.4);
    body.appendChild(S("ellipse", { cx: 0, cy: -25, rx: 2.8, ry: 2, fill: "#16241d" }));
    body.appendChild(S("path", { d: "M -3.5 -22 Q 0 -19 3.5 -22", fill: "none", stroke: "#16241d", "stroke-width": 1.4, "stroke-linecap": "round" }));
    K.blush(body, [[-16, -24], [16, -24]], 3.8);
    g.appendChild(body);
    return g;
  }
  function drawTile(fill) {
    var g = S("g");
    g.appendChild(S("rect", { x: -9, y: -9, width: 18, height: 18, rx: 3.5, fill: fill, stroke: "#dca03a", "stroke-width": 1.6 }));
    K.eyes(g, [[-3.6, -1.8], [3.6, -1.8]], 1.25);
    g.appendChild(S("path", { d: "M -1.8 2.6 Q 0 4.3 1.8 2.6", fill: "none", stroke: "#16241d", "stroke-width": 1, "stroke-linecap": "round" }));
    return g;
  }

  function mount(parts) {
    var st = K.stage(parts.stage, { label: "Tilu the tile and two shapes, a tall one and a wide one. Tap a shape and Tilu's little copies cover it and count themselves." });
    K.grid(st.back, 40, 40, 360, 180, CELL);
    var tileFill = st.radial([[0, "#fffdf6"], [1, "#f8e3ad"]], { cx: "35%", cy: "30%", r: "90%" });
    var tiles = { a: [], b: [] }, filled = { a: false, b: false }, busy = false;
    var T;

    Object.keys(SHAPES).forEach(function (k) {
      var R = SHAPES[k];
      var rect = S("rect", { x: R.x, y: R.y, width: R.w * CELL, height: R.h * CELL, rx: 2, class: "pk-shape" });
      st.back.appendChild(rect);
      for (var r = R.h - 1; r >= 0; r--) {
        for (var c = 0; c < R.w; c++) {
          var g = drawTile(tileFill);
          st.mid.appendChild(g);
          var a = K.actor(g, { x: HOME[0], y: HOME[1] - 26, sx: 0.2, sy: 0.2, o: 0 });
          a.home = [R.x + c * CELL + CELL / 2, R.y + r * CELL + CELL / 2];
          tiles[k].push(a);
        }
      }
      var hit = S("rect", { x: R.x - 6, y: R.y - 6, width: R.w * CELL + 12, height: R.h * CELL + 12, fill: "transparent" });
      st.front.appendChild(hit);
      st.tap(hit, function () { toggle(k); });
    });

    var tg = S("g"); tg.appendChild(drawTilu(st)); st.front.appendChild(tg);
    T = K.actor(tg, { x: HOME[0], y: HOME[1] });

    function chipPos(k) { var R = SHAPES[k]; return [R.x + R.w * CELL / 2, R.y - 16]; }
    function hop(tl) {
      tl.to(T.s, T.tw({ sy: 0.84, sx: 1.12, duration: 0.11, ease: "power1.in" }));
      tl.to(T.s, T.tw({ sy: 1.08, sx: 0.94, y: HOME[1] - 20, duration: 0.17, ease: "power2.out" }));
      tl.to(T.s, T.tw({ sy: 1, sx: 1, y: HOME[1], duration: 0.3, ease: "bounce.out" }));
      return tl;
    }
    function fill(k, tl) {
      var p = chipPos(k), list = tiles[k];
      tl.call(function () { filled[k] = true; st.sfx("pop"); });
      hop(tl);
      list.forEach(function (t, i) {
        tl.to(t.s, t.tw({ x: t.home[0], y: t.home[1], sx: 1, sy: 1, o: 1, duration: 0.34, ease: "back.out(2.2)",
          onComplete: function () { st.chip(k, String(i + 1), p[0], p[1], "gold"); st.sfx("tick", i); } }), i === 0 ? ">" : "<0.08");
      });
      tl.to({}, { duration: 0.25 });
      return tl;
    }
    function empty(k, tl) {
      tl.call(function () { st.chip(k, null); filled[k] = false; });
      tiles[k].slice().reverse().forEach(function (t, i) {
        tl.to(t.s, t.tw({ x: HOME[0], y: HOME[1] - 26, sx: 0.2, sy: 0.2, o: 0, duration: 0.28, ease: "power2.in" }), i === 0 ? ">" : "<0.03");
      });
      return tl;
    }
    function compare() {
      if (!(filled.a && filled.b)) return;
      var pa = chipPos("a"), pb = chipPos("b");
      st.chip("a", "14 squares", pa[0], pa[1]);
      st.chip("b", "16 squares", pb[0], pb[1], "good");
      st.say("The wide one holds more: 16! Count the squares, don't trust how it looks.", 250, 118, "good");
      st.sfx("chime");
      var tl = gsap.timeline(); hop(tl); hop(tl);
    }
    function toggle(k) {
      if (busy) return;
      busy = true; st.hush();
      var tl = gsap.timeline({ onComplete: function () { busy = false; compare(); } });
      if (filled[k]) empty(k, tl); else fill(k, tl);
    }

    function reset() {
      Object.keys(tiles).forEach(function (k) { tiles[k].forEach(function (t) { gsap.killTweensOf(t.s); t.set({ x: HOME[0], y: HOME[1] - 26, sx: 0.2, sy: 0.2, o: 0 }); }); filled[k] = false; });
      gsap.killTweensOf(T.s); T.set({ x: HOME[0], y: HOME[1], sx: 1, sy: 1 });
      busy = false;
    }
    function build() {
      var tl = gsap.timeline();
      tl.call(function () { st.say("Which one holds more? The tall one looks bigger…", 248, 98); });
      tl.to({}, { duration: 2.4 });
      tl.call(st.hush);
      fill("a", tl);
      tl.to({}, { duration: 0.4 });
      fill("b", tl);
      tl.call(compare);
      tl.to({}, { duration: 3.6 });
      tl.call(function () { st.hush(); });
      empty("a", tl); empty("b", tl);
      tl.to({}, { duration: 0.6 });
      return tl;
    }

    function button(label, fn) {
      var b = h("button", { type: "button", class: "btn btn-ghost" }, label);
      b.addEventListener("click", function () { st.interact(); fn(); });
      parts.actions.appendChild(b);
    }
    button("Cover the tall one", function () { toggle("a"); });
    button("Cover the wide one", function () { toggle("b"); });
    st.keys(function (e) {
      if (e.key === "1") { toggle("a"); return true; }
      if (e.key === "2") { toggle("b"); return true; }
      return false;
    });

    st.setDemo(build, reset);
    return { destroy: st.destroy };
  }

  K.register("tilu", {
    name: "Tilu", kind: "the living tile",
    line: "One unit square with a face. It splits into little copies that cover a shape and count themselves.",
    teaches: "Area is how many unit squares cover a shape: count, don't guess by looks.",
    mixups: ["“Looks bigger, so it is bigger”", "Mixes up area and perimeter"],
    play: "Tap a shape and Tilu's copies march in and count. Compare the tall shape with the wide one.",
    days: "Days 3, 7 and 8 (counting squares, any shape, real rooms)",
    grows: "Learns bigger tiles as the units grow: 1 cm², then 1 m² on the real-rooms day.",
    effort: "small",
  }, mount);
})();
