/* Pet 3 — Gilli, the palm squirrel who runs round the edge.
   She races round a shape counting every centimetre of the edge (the perimeter), upside down
   along the bottom if she has to. Then the inside fills square by square (the area), so
   "around" and "inside" never get mixed up. */
(function () {
  "use strict";
  var K = Cogna.petKit, S = K.S, h = K.h;
  var C = 30, X0 = 110, Y0 = 110, WC = 5, HC = 2;
  var X1 = X0 + WC * C, Y1 = Y0 + HC * C, PER = 2 * (WC + HC);
  var CORNERS = [WC, WC + HC, 2 * WC + HC, PER], ROTS = [0, 90, 180, 270];

  function edgeOf(s) {
    s = Math.max(0, Math.min(PER, s));
    if (s <= WC) return { x: X0 + s * C, y: Y0, rot: 0 };
    if (s <= WC + HC) return { x: X1, y: Y0 + (s - WC) * C, rot: 90 };
    if (s <= 2 * WC + HC) return { x: X1 - (s - WC - HC) * C, y: Y1, rot: 180 };
    return { x: X0, y: Y1 - (s - 2 * WC - HC) * C, rot: 270 };
  }
  /** where she stands at distance s round the edge, turning smoothly at the corners */
  function pose(s) {
    var p = edgeOf(s);
    for (var i = 0; i < CORNERS.length; i++) {
      var d = s - CORNERS[i];
      if (Math.abs(d) < 0.3) { p.rot = ROTS[i] + 90 * ((d + 0.3) / 0.6); break; }
    }
    return p;
  }
  function nearestS(p) {
    var best = 0, bd = Infinity;
    for (var i = 0; i <= PER * 20; i++) {
      var s = i / 20, q = edgeOf(s), d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function drawGilli(st) {
    var g = S("g");
    var fur = st.radial([[0, "#cdae88"], [0.55, "#9c7a59"], [1, "#6e5238"]], { cx: "40%", cy: "30%", r: "80%" });
    var run = S("g", { class: "pk-run-body" });
    run.appendChild(S("path", { d: "M -8 -9 C -28 -8, -38 -28, -32 -46 C -27 -60, -10 -64, -6 -52 C -3 -44, -13 -38, -16 -30 C -19 -22, -13 -16, -3 -15 Z", fill: fur, stroke: "#6e5238", "stroke-width": 1.2 }));
    run.appendChild(S("path", { d: "M -12 -14 C -26 -16, -32 -30, -28 -42 C -25 -52, -15 -56, -11 -50", fill: "none", stroke: "#efe2c8", "stroke-width": 2, opacity: 0.6, "stroke-linecap": "round" }));
    run.appendChild(S("ellipse", { cx: -5, cy: -8, rx: 7, ry: 6, fill: "#8a6a4c" }));
    run.appendChild(S("ellipse", { cx: 1, cy: -13, rx: 14, ry: 10.5, fill: fur, stroke: "#6e5238", "stroke-width": 1.2, transform: "rotate(-8 1 -13)" }));
    run.appendChild(S("ellipse", { cx: 5, cy: -8.5, rx: 8, ry: 4.5, fill: "#ecdcc0" }));
    ["M -10 -19.5 Q 0 -25.5 11 -20.5", "M -11 -16.5 Q 0 -22 11 -17.5", "M -11 -13.5 Q -1 -18.5 10 -14.5"].forEach(function (d, i) {
      run.appendChild(S("path", { d: d, fill: "none", stroke: i === 1 ? "#5a4230" : "#f6ead2", "stroke-width": i === 1 ? 1.4 : 1.9, "stroke-linecap": "round" }));
    });
    run.appendChild(S("path", { d: "M 8 -28 L 10 -36.5 L 14.5 -29 Z", fill: "#8a6a4c", stroke: "#6e5238", "stroke-width": 1, "stroke-linejoin": "round" }));
    run.appendChild(S("circle", { cx: 12, cy: -22, r: 8.2, fill: fur, stroke: "#6e5238", "stroke-width": 1.2 }));
    run.appendChild(S("ellipse", { cx: 18.5, cy: -19.5, rx: 5.2, ry: 4, fill: "#c9aa84", stroke: "#6e5238", "stroke-width": 1 }));
    run.appendChild(S("circle", { cx: 23.3, cy: -20.6, r: 1.5, fill: "#16241d" }));
    K.eyes(run, [[14.2, -24]], 2.1);
    K.blush(run, [[17, -16.5]], 2.2);
    run.appendChild(S("ellipse", { cx: 13, cy: -6, rx: 3, ry: 2.2, fill: "#7d5f45" }));
    run.appendChild(S("ellipse", { cx: -9, cy: -1.2, rx: 5, ry: 2.4, fill: "#7d5f45" }));
    run.appendChild(S("ellipse", { cx: 9, cy: -1.2, rx: 4, ry: 2.2, fill: "#7d5f45" }));
    g.appendChild(run);
    return g;
  }

  function mount(parts) {
    var st = K.stage(parts.stage, { label: "Gilli the squirrel and a 5 by 2 rectangle. Drag Gilli round the edge to count the perimeter, then count the squares inside for the area." });
    K.grid(st.back, 20, 20, 390, 210, C);
    st.back.appendChild(S("rect", { x: X0, y: Y0, width: WC * C, height: HC * C, class: "pk-shape" }));
    // squares inside (the area)
    var cells = [];
    for (var r = 0; r < HC; r++) for (var c = 0; c < WC; c++) {
      var cell = S("rect", { x: X0 + c * C + 2, y: Y0 + r * C + 2, width: C - 4, height: C - 4, rx: 3, fill: "#2a9a76", opacity: 0 });
      st.back.appendChild(cell); cells.push(cell);
    }
    // the edge, one centimetre at a time (the perimeter)
    var segs = [];
    for (var k = 0; k < PER; k++) {
      var a = edgeOf(k), b = edgeOf(k + 1);
      var seg = S("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#dca03a", "stroke-width": 6, "stroke-linecap": "round", opacity: 0 });
      st.mid.appendChild(seg); segs.push(seg);
    }
    var gg = S("g"), art = drawGilli(st); gg.appendChild(art);
    gg.appendChild(S("circle", { cx: 0, cy: -20, r: 26, class: "pk-movable-ring" }));
    var hit = S("circle", { cx: 0, cy: -20, r: 30, class: "pk-hit" }); gg.appendChild(hit);
    st.front.appendChild(gg);
    var G = K.actor(gg, { sx: 1.15, sy: 1.15 });
    var run = { s: 0 }, lit = 0, busy = false;

    function place() { var p = pose(run.s); G.set({ x: p.x, y: p.y, rot: p.rot }); }
    function light(n) {
      n = Math.max(0, Math.min(PER, n));
      if (n > lit) { for (var i = lit; i < n; i++) { segs[i].setAttribute("opacity", 1); st.sfx("tick", i); } }
      else for (var j = n; j < lit; j++) segs[j].setAttribute("opacity", 0);
      lit = n;
      if (lit > 0) st.chip("per", lit === PER ? "perimeter: all the way round = 14 cm" : "round the edge: " + lit + " cm", 330, 32, "gold");
      else st.chip("per", null);
    }
    function running(on) { art.classList.toggle("is-running", on); }
    function runRound(tl) {
      tl.call(function () { running(true); st.sfx("whoosh"); });
      tl.to(run, { s: PER, duration: 5.4, ease: "none", onUpdate: function () { place(); light(Math.floor(run.s + 0.001)); } });
      tl.call(function () { running(false); light(PER); run.s = 0; });
      tl.to(G.s, G.tw({ x: X0, y: Y0, rot: 360, duration: 0.3 }));
      tl.call(function () { G.set({ rot: 0 }); st.sfx("chime"); });
      return tl;
    }
    function countInside(tl) {
      cells.forEach(function (cell, i) {
        tl.to(cell, { attr: { opacity: 0.32 }, duration: 0.18, onComplete: function () { st.chip("area", "inside: " + (i + 1) + " squares", 330, 238, "good"); st.sfx("pop"); } }, i === 0 ? ">" : "<0.16");
      });
      tl.call(function () { st.chip("area", "area: inside = 10 cm²", 330, 238, "good"); });
      return tl;
    }
    function reset() {
      gsap.killTweensOf([run, G.s]); cells.forEach(function (c) { gsap.killTweensOf(c); c.setAttribute("opacity", 0); });
      run.s = 0; place(); light(0); running(false); busy = false;
    }
    function build() {
      var tl = gsap.timeline();
      tl.call(function () { st.say("Let's run round the edge and count every centimetre!", 185, 70); });
      tl.to({}, { duration: 2.2 });
      tl.call(st.hush);
      runRound(tl);
      tl.to({}, { duration: 0.6 });
      countInside(tl);
      tl.call(function () { st.say("Round the edge is the perimeter. Inside is the area!", 185, 70, "good"); });
      tl.to({}, { duration: 3.4 });
      return tl;
    }

    st.drag(hit, {
      start: function () { if (busy) return; art.setAttribute("filter", st.lift); running(true); st.sfx("pickup"); },
      move: function (p) { if (busy) return; var s = nearestS(p); if (Math.abs(s - run.s) > 3 && run.s > 0) return; run.s = s; place(); light(run.s >= PER - 0.4 ? PER : Math.floor(s)); },
      end: function () { art.removeAttribute("filter"); running(false); if (lit === PER) { st.sfx("chime"); st.say("All the way round: 14 cm!", 185, 70, "good"); } },
    });
    function button(label, fn) {
      var b = h("button", { type: "button", class: "btn btn-ghost" }, label);
      b.addEventListener("click", function () { st.interact(); fn(); });
      parts.actions.appendChild(b);
    }
    button("Run round the edge", function () { if (busy) return; busy = true; run.s = 0; light(0); place(); var tl = gsap.timeline({ onComplete: function () { busy = false; } }); runRound(tl); });
    button("Count the inside", function () { if (busy) return; busy = true; cells.forEach(function (c) { c.setAttribute("opacity", 0); }); var tl = gsap.timeline({ onComplete: function () { busy = false; } }); countInside(tl); });
    button("Start again", function () { reset(); st.clearChips(); });
    st.keys(function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { run.s = K.clamp(Math.round(run.s) + (e.key === "ArrowRight" ? 1 : -1), 0, PER); place(); light(Math.floor(run.s)); return true; }
      return false;
    });

    place();
    st.setDemo(build, reset);
    return { destroy: st.destroy };
  }

  K.register("gilli", {
    name: "Gilli", kind: "the edge-running squirrel",
    line: "An Indian palm squirrel who races round the edge of a shape, counting every centimetre, upside down if she has to.",
    teaches: "Perimeter is the distance round the edge; area is the squares inside.",
    mixups: ["Mixes up area and perimeter"],
    play: "Drag Gilli round the edge and watch the centimetres add up. Then count the inside.",
    days: "Days 3 and 8 (counting squares, real rooms)",
    grows: "Collects a nut for every edge she runs and stores them on the trail.",
    effort: "small",
  }, mount);
})();
