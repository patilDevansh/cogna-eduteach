/* Pet 1 — Dori, the drop-spider.
   Teaches the height: she hangs from the top on her silk and gravity pulls her straight down,
   so her thread IS the height. She first tries the slanted side and finds it too long.
   Drop her past the end of the base and the height lands outside the shape (Day 9). */
(function () {
  "use strict";
  var K = Cogna.petKit, S = K.S, h = K.h;

  var TOPY = 70, BASEY = 210;
  var TL = [160, 70], TR = [380, 70], BL = [80, 210], BR = [300, 210];
  var R = 16, FEET = 23, SIT = TOPY - FEET, LAND = BASEY - FEET;
  var N = [-0.8685, -0.4963]; // outward normal of the left (slanted) side
  var SLANT_ROT = -60.26;

  function drawDori(st) {
    var g = S("g");
    var legA = S("g", { class: "pk-legs-a" }), legB = S("g", { class: "pk-legs-b" });
    [[-1, -7], [-1, -2], [-1, 3], [-1, 8], [1, -7], [1, -2], [1, 3], [1, 8]].forEach(function (L, i) {
      var sx = L[0], y0 = L[1], spread = (y0 + 2) * 0.6;
      var d = "M " + (sx * 11) + " " + y0 + " Q " + (sx * 24) + " " + (y0 - 12 + spread) + " " + (sx * 29) + " " + (y0 + 6 + spread * 1.6);
      (i % 2 === 0 ? legA : legB).appendChild(S("path", { d: d, fill: "none", stroke: "#3b3168", "stroke-width": 3.3, "stroke-linecap": "round" }));
    });
    g.appendChild(legA); g.appendChild(legB);
    var body = S("g", { class: "pk-breathe" });
    body.appendChild(S("circle", { cx: 0, cy: 0, r: R, stroke: "#2c2452", "stroke-width": 1.4,
      fill: st.radial([[0, "#c3b8ee"], [0.45, "#7262b6"], [1, "#352b63"]], { cx: "35%", cy: "28%", r: "80%" }) }));
    body.appendChild(S("ellipse", { cx: -6, cy: -8, rx: 5.5, ry: 3.2, fill: "#fff", opacity: 0.4, transform: "rotate(-25 -6 -8)" }));
    K.eyes(body, [[-5.6, -0.5], [5.6, -0.5]], 2.7, { sclera: true, look: [0, 0.7] });
    body.appendChild(S("circle", { cx: -3, cy: -9.8, r: 1.3, fill: "#efeaff" }));
    body.appendChild(S("circle", { cx: 3, cy: -9.8, r: 1.3, fill: "#efeaff" }));
    K.blush(body, [[-10.5, 6.5], [10.5, 6.5]], 3);
    body.appendChild(S("path", { d: "M -3 7.5 Q 0 10 3 7.5", fill: "none", stroke: "#efeaff", "stroke-width": 1.4, "stroke-linecap": "round" }));
    g.appendChild(body);
    return g;
  }

  function mount(parts) {
    var st = K.stage(parts.stage, { label: "Dori the spider on a parallelogram. Drag Dori along the top edge and let go: she drops straight down, and her thread shows the height. Arrow keys move her, Enter drops her." });
    K.grid(st.back, 20, 30, 380, 200, 20);
    st.back.appendChild(S("polygon", { points: K.pts([BL, BR, TR, TL]), class: "pk-shape" }));
    var ext = S("line", { x1: BR[0], y1: BASEY, x2: 404, y2: BASEY, stroke: "#7d8c84", "stroke-width": 2, "stroke-dasharray": "6 6", opacity: 0 });
    st.back.appendChild(ext);
    st.back.appendChild(S("text", { x: 190, y: 232, "text-anchor": "middle", class: "pk-label" }, "base 11 cm"));
    var slant = S("line", { x1: TL[0], y1: TL[1], x2: BL[0], y2: BL[1], stroke: "#b4400c", "stroke-width": 5, "stroke-linecap": "round", opacity: 0 });
    st.back.appendChild(slant);

    var hm = S("g", { opacity: 0 });
    var hLine = S("line", { x1: 0, y1: TOPY, x2: 0, y2: BASEY, stroke: "#0e6b54", "stroke-width": 3.5, "stroke-linecap": "round", "stroke-dasharray": 140, "stroke-dashoffset": 140 });
    hm.appendChild(hLine);
    hm.appendChild(S("path", { d: "M 0 " + (BASEY - 12) + " h 12 v 12", fill: "none", stroke: "#0e6b54", "stroke-width": 2 }));
    st.mid.appendChild(hm);
    var silk = S("line", { stroke: "#8f9e96", "stroke-width": 1.6, opacity: 0 });
    st.mid.appendChild(silk);

    var dg = S("g");
    dg.appendChild(S("circle", { cx: 0, cy: 0, r: 30, class: "pk-movable-ring" }));
    var art = drawDori(st); dg.appendChild(art);
    var hit = S("circle", { cx: 0, cy: 0, r: 32, class: "pk-hit" }); dg.appendChild(hit);
    st.front.appendChild(dg);
    var D = K.actor(dg, { x: TL[0], y: SIT });

    var silkS = { x: 0, bottom: TOPY, o: 0 };
    function renderSilk() {
      silk.setAttribute("x1", silkS.x); silk.setAttribute("x2", silkS.x);
      silk.setAttribute("y1", TOPY); silk.setAttribute("y2", silkS.bottom); silk.setAttribute("opacity", silkS.o);
    }
    function walking(on) { dg.classList.toggle("is-walking", on); }
    var busy = false;

    function reset() {
      gsap.killTweensOf([D.s, silkS, sl]); gsap.killTweensOf(hLine); gsap.killTweensOf([hm, ext, slant]);
      D.set({ x: TL[0], y: SIT, rot: 0, sx: 1, sy: 1 }); art.removeAttribute("filter");
      silkS.o = 0; renderSilk(); hm.setAttribute("opacity", 0); slant.setAttribute("opacity", 0); ext.setAttribute("opacity", 0);
      walking(false); busy = false;
    }

    var sl = { t: 0 };
    function slantPose() {
      var px = K.lerp(TL[0], BL[0], sl.t), py = K.lerp(TL[1], BL[1], sl.t);
      D.set({ x: px + N[0] * FEET, y: py + N[1] * FEET, rot: SLANT_ROT });
    }

    /** the slanted side: walk down it, find it too long, walk back up */
    function slantWalk(tl) {
      tl.call(function () { walking(true); st.say("Is the slanted side the height? Let me try.", D.s.x, D.s.y - 30); });
      tl.to(D.s, D.tw({ x: TL[0] + N[0] * FEET, y: TL[1] + N[1] * FEET, rot: SLANT_ROT, duration: 0.45, ease: "power2.inOut" }));
      tl.call(function () { sl.t = 0; });
      tl.to(sl, { t: 1, duration: 2.2, ease: "sine.inOut", onUpdate: slantPose });
      tl.call(function () {
        walking(false); slant.setAttribute("opacity", 0.9);
        st.chip("slant", "slanted side ≈ 8 cm", 186, 192, "warn");
        st.say("8 cm along the slant. Too long! That isn't the height.", 70, 168, "warn");
        st.sfx("oops");
      });
      tl.to({}, { duration: 2.2 });
      tl.call(function () { walking(true); st.hush(); st.chip("slant", null); slant.setAttribute("opacity", 0); });
      tl.to(sl, { t: 0, duration: 1.5, ease: "sine.inOut", onUpdate: slantPose });
      tl.to(D.s, D.tw({ x: TL[0], y: SIT, rot: 0, duration: 0.4, ease: "power2.inOut" }));
      tl.call(function () { walking(false); });
      return tl;
    }

    /** drop straight down from x, then show the thread as the height */
    function drop(x, tl) {
      var beyond = x > BR[0] + 1;
      tl.call(function () {
        busy = true; st.hush();
        silkS.x = x; silkS.bottom = D.s.y - R; silkS.o = 1; renderSilk();
        if (beyond) ext.setAttribute("opacity", 1);
        st.sfx("whoosh");
      });
      tl.to(D.s, D.tw({ y: LAND, duration: 1.15, ease: "bounce.out", onUpdate: function () { silkS.bottom = D.s.y - R; renderSilk(); } }));
      tl.call(function () { st.sfx("thud"); });
      tl.to(D.s, D.tw({ rot: 7, duration: 0.18, ease: "sine.out" }));
      tl.to(D.s, D.tw({ rot: -4, duration: 0.22, ease: "sine.inOut" }));
      tl.to(D.s, D.tw({ rot: 0, duration: 0.2, ease: "sine.inOut" }));
      // she steps aside and leaves her silk behind: that line is the height
      tl.call(function () { walking(true); silkS.bottom = BASEY; renderSilk(); });
      tl.to(D.s, D.tw({ x: x + (x > 340 ? -34 : 34), duration: 0.45, ease: "power1.inOut" }));
      tl.call(function () {
        walking(false);
        hm.setAttribute("transform", "translate(" + x + " 0)"); hm.setAttribute("opacity", 1);
        hLine.setAttribute("stroke-dashoffset", 140);
      });
      tl.to(hLine, { attr: { "stroke-dashoffset": 0 }, duration: 0.6, ease: "power2.out" });
      tl.call(function () {
        st.sfx("snap"); st.after(220, function () { st.sfx("chime"); });
        st.chip("h", beyond ? "height 7 cm (outside!)" : "height = 7 cm", x - 54 < 40 ? x + 56 : x - 54, 140, "good");
        st.say(beyond ? "The height can fall outside the shape. Extend the base and drop straight down." : "Straight down to the base. My thread is the height!",
          Math.min(Math.max(D.s.x, 120), 300), LAND - 26, "good");
      });
      return tl;
    }
    /** climb back up to the top edge at x */
    function climbBack(tl, x) {
      tl.call(function () { st.hush(); st.chip("h", null); walking(true); silkS.bottom = D.s.y - R; renderSilk(); });
      tl.to(hm, { attr: { opacity: 0 }, duration: 0.3 });
      tl.to(D.s, D.tw({ x: x, duration: 0.4, ease: "power1.inOut", onUpdate: function () { silkS.bottom = D.s.y - R; renderSilk(); } }));
      tl.to(D.s, D.tw({ y: SIT, duration: 1.0, ease: "power2.inOut", onUpdate: function () { silkS.bottom = Math.max(TOPY, D.s.y - R); renderSilk(); } }));
      tl.call(function () { walking(false); silkS.o = 0; renderSilk(); ext.setAttribute("opacity", 0); busy = false; });
      return tl;
    }

    function build() {
      var tl = gsap.timeline();
      tl.to({}, { duration: 0.8 });
      slantWalk(tl);
      tl.call(function () { walking(true); });
      tl.to(D.s, D.tw({ x: 250, duration: 1.2, ease: "sine.inOut" }));
      tl.call(function () { walking(false); });
      drop(250, tl);
      tl.to({}, { duration: 3 });
      climbBack(tl, 250);
      tl.call(function () { walking(true); });
      tl.to(D.s, D.tw({ x: TL[0], duration: 1.1, ease: "sine.inOut" }));
      tl.call(function () { walking(false); });
      return tl;
    }

    // the student's own drop: then she climbs back up where she was, ready to go again
    function studentDrop() {
      if (busy) return;
      var x = D.s.x, tl = gsap.timeline();
      drop(x, tl);
      tl.to({}, { duration: 3.6 });
      climbBack(tl, x);
    }
    st.drag(hit, {
      start: function () { if (busy) return; art.setAttribute("filter", st.lift); D.to({ sy: 1.08, sx: 1.04, y: SIT - 6, duration: 0.15 }); st.sfx("pickup"); walking(true); },
      move: function (p) { if (busy) return; D.set({ x: K.clamp(p.x, TL[0], TR[0]), y: SIT - 6, rot: 0 }); },
      end: function () { if (busy) return; walking(false); art.removeAttribute("filter"); D.to({ sy: 1, sx: 1, y: SIT, duration: 0.15, onComplete: studentDrop }); },
    });
    st.keys(function (e) {
      if (busy) return false;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { D.to({ x: K.clamp(D.s.x + (e.key === "ArrowLeft" ? -20 : 20), TL[0], TR[0]), duration: 0.2 }); return true; }
      if (e.key === "Enter" || e.key === " ") { studentDrop(); return true; }
      return false;
    });
    function button(label, fn) {
      var b = h("button", { type: "button", class: "btn btn-ghost" }, label);
      b.addEventListener("click", function () { st.interact(); fn(); });
      parts.actions.appendChild(b);
    }
    button("Drop Dori", studentDrop);
    button("Drop her past the end", function () {
      if (busy) return;
      busy = true;
      D.to({ x: 352, duration: 0.6, ease: "sine.inOut", onStart: function () { walking(true); }, onComplete: function () { walking(false); busy = false; studentDrop(); } });
    });
    button("Try the slanted side", function () {
      if (busy) return;
      busy = true;
      var tl = gsap.timeline();
      tl.to(D.s, D.tw({ x: TL[0], y: SIT, rot: 0, duration: 0.5 }));
      slantWalk(tl);
      tl.call(function () { busy = false; });
    });

    st.setDemo(build, reset);
    return { destroy: st.destroy };
  }

  K.register("dori", {
    name: "Dori", kind: "the drop-spider",
    line: "Hangs from the top on her silk. Gravity pulls her straight down, so her thread is the height.",
    teaches: "The height goes straight down at a right angle, not along the slanted side.",
    mixups: ["Uses the slanted side as the height"],
    play: "Drag Dori along the top and let go. Drop her past the end and the height lands outside the shape.",
    days: "Days 2, 4 and 9 (where's the height, triangles, hidden heights)",
    grows: "Her web grows one strand for every height the student finds.",
    effort: "small",
  }, mount);
})();
