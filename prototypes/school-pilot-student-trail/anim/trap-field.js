/* Ramesh uncle's trapezium field — a hands-on lesson: the area of a trapezium is half of (top + bottom) × height.
   The student does the maths with their hands and the narrator reacts:
     1. meet a field with two parallel sides: top 3, bottom 5, height 4
     2. the triangle trick again: tap to copy, spin the copy, slide it in, and a parallelogram appears
     3. its base is the bottom plus the copy's top, 5 + 3 = 8; the student works out 8 × 4, then the copy lifts off: half
     4. stretch the top with a gold handle: shrink it to nothing and the rule turns into the triangle rule
     5. a new field to work out on their own
   Built on Cogna.lesson + Cogna.landKit (same land look as para-field). Every line the narrator can say is a literal
   `caption:` so tools/record-narration.mjs records it. */
(function () {
  "use strict";
  var C = window.Cogna, K = C.landKit, h = C.h;
  var W = 800, H = 470, U = 52;
  var P = [[0, 4], [5, 4], [4, 0], [1, 0]];                // top 3 (from 1 to 4), bottom 5, height 4
  var SLOT = [[9, 0], [4, 0], [5, 4], [8, 4]];             // the half-turned copy's place
  var PARA = [[0, 4], [8, 4], [9, 0], [1, 0]];
  var F0 = [40, 170];
  var u3 = 40, P3 = [[0, 5], [8, 5], [6, 0], [2, 0]];      // your turn: top 4, bottom 8, height 5

  var R = {
    wrongWay: { caption: "Hmm, it doesn't fit that way up. Spin it with the gold knob first." },
    dropWrong: { caption: "Not there. Slide it so the slanted edges meet on the right." },
    dropHint: { caption: "Psst. Turn it upside down, then push it against the right-hand side." },
    p20: { caption: "That's only the bottom, 5 × 4. The base is 8 now." },
    p12: { caption: "That's 8 + 4. For land, we multiply." },
    p16: { caption: "Ooh, that's the next step! First, the whole parallelogram." },
    pOther: { caption: "Base × height. The base is 8 and the height is 4." },
    pRight: { caption: "32. Right!" },
    stretchHint: { caption: "Try sliding the handle all the way to the left." },
    gotTriangle: { caption: "The top shrank to nothing. It's a triangle! Half of 5 × 4, the triangle rule." },
    gotPara: { caption: "Top and bottom are equal now. That's a parallelogram: 5 × 4." },
    n60: { caption: "That's the doubled shape. Our field is half of it." },
    n40: { caption: "That's only the bottom, 8 × 5. Add the top first." },
    n20: { caption: "That's only the top, 4 × 5. Add the top and the bottom." },
    n17: { caption: "That adds everything. Add the top and bottom, times the height, then take half." },
    nOther: { caption: "Top plus bottom is 12. Times the height, 5. Then take half." },
    nRight: { caption: "30! You've got it." },
    got14: { caption: "14! The top is 2. Half of (2 + 5) × 4 is 14." },
    hint14: { caption: "Each step of the handle changes the land by 2 squares. Watch the sign as you drag." },
  };

  function placeF(c) { c.gF.setAttribute("transform", "translate(" + c.f.x.toFixed(1) + " " + c.f.y.toFixed(1) + ")"); }
  function afterLesson(c, L) { return !!(L.flags && L.flags.afterLesson); }
  /** a bracket from x0 to x1 at height y, with its label; returns { path, lab } (hidden) */
  function bracket(parent, cls) {
    var p = K.add(parent, "path", { "class": "t-pf-bracket " + (cls || "") }); p.style.opacity = 0;
    var t = K.text(parent, "", 0, 0, "t-pf-dim " + (cls || "")); t.style.opacity = 0;
    return { path: p, lab: t };
  }
  function growBracket(L, b, x0, x1, y, label, delay) {
    b.path.setAttribute("d", "M" + x0 + " " + (y - 9) + "V" + (y + 9) + "M" + x0 + " " + y + "H" + x1 + "M" + x1 + " " + (y - 9) + "V" + (y + 9));
    b.lab.textContent = label; b.lab.setAttribute("x", (x0 + x1) / 2); b.lab.setAttribute("y", y + 26);
    L.set(b.path, { opacity: 1, scaleX: 0, svgOrigin: x0 + " " + y });
    L.set(b.lab, { opacity: 0, scale: 0.4, svgOrigin: (x0 + x1) / 2 + " " + (y + 26) });
    L.to(b.path, { scaleX: 1, duration: 0.6, delay: delay || 0, ease: "power2.inOut" });
    L.to(b.lab, { opacity: 1, scale: 1, duration: 0.4, delay: (delay || 0) + 0.55, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
  }

  /* ---------- the stretchy top ---------- */
  function shapeFor(a) { return [[0, 4], [5, 4], [1 + a, 0], [1, 0]]; }
  function areaFor(a) { return (a + 5) * 4 / 2; }
  function setTop(c, a) {
    c.a = a;
    c.whole.set(shapeFor(a));
    c.topLab.setAttribute("x", ((1 + a / 2) * U).toFixed(1));
    c.topLab.textContent = a === 0 ? "top 0" : "top " + a;
    if (c.stretchLive) {
      c.sign.set(areaFor(a), c.L);
      c.L.boardLive("½ × (" + a + " + 5) × 4 = <b>" + areaFor(a) + "</b>");
    }
  }

  C.lesson.define({
    id: "trap-field", title: "Ramesh uncle's trapezium field", cls: "t-pf t-tf", w: W, h: H, durationMs: 200000,

    build: function (svg, L) {
      var c = K.setup(svg, L);
      c.f = { x: F0[0], y: F0[1] }; c.a = 3;
      K.tree(c.world, 74, 132, 0.85, L);
      c.sign = K.sign(c, W);

      c.gF = K.add(c.world, "g"); placeF(c);
      c.whole = K.field(c, c.gF, P, U, { pad: 2 });
      c.twin = K.twin(c, c.gF, {
        P: P, u: U, pivot: [2.5, 2], knobAt: [3.6, 2.8], stage: [6.2 * U, 0], target: [4 * U, 0], slot: SLOT,
        bounds: { minX: -F0[0] + 8, maxX: 6.4 * U, minY: -150, maxY: 70 }, R: R,
      });
      c.seam = K.seam(c, c.gF);
      c.outline = K.outline(c.gF, PARA, U);

      // labels on the field: the parallel sides and the height
      c.gLab = K.add(c.gF, "g", { "class": "t-pf-labs" });
      c.topLab = K.text(c.gLab, "top 3", 2.5 * U, -26);
      c.botLab = K.text(c.gLab, "bottom 5", 2.5 * U, 4 * U + 40);
      c.hLine = K.add(c.gLab, "line", { x1: U, y1: 0, x2: U, y2: 4 * U, "class": "t-pf-height" });
      c.hMark = K.add(c.gLab, "path", { d: "M" + (U + 14) + " " + 4 * U + "V" + (4 * U - 14) + "H" + U, "class": "t-pf-mark" });
      c.hLab = K.text(c.gLab, "height 4", U + 14, 2 * U, "t-pf-lab t-pf-start");
      c.par = K.add(c.gLab, "g", { "class": "t-tp-par" });   // little arrows saying "these two are parallel"
      [[2.5 * U, 0], [2.5 * U, 4 * U]].forEach(function (q) {
        K.add(c.par, "path", { d: "M" + (q[0] - 8) + " " + (q[1] - 8) + "L" + q[0] + " " + q[1] + "L" + (q[0] - 8) + " " + (q[1] + 8), "class": "t-tp-arrow" });
        K.add(c.par, "path", { d: "M" + (q[0] + 4) + " " + (q[1] - 8) + "L" + (q[0] + 12) + " " + q[1] + "L" + (q[0] + 4) + " " + (q[1] + 8), "class": "t-tp-arrow" });
      });
      L.set([c.topLab, c.botLab, c.hLine, c.hMark, c.hLab, c.par], { opacity: 0 });

      c.gMarks = K.add(c.gF, "g", { "class": "t-pf-marks" });
      c.bB = bracket(c.gMarks, ""); c.bA = bracket(c.gMarks, "is-copy");
      c.tagHalf = K.tag(c.gF, "half"); c.tagHalf.put(2.9 * U, 2.6 * U); c.tagHalf.init(L);

      // the stretch handle sits on the top-right corner
      c.handle = K.knob(c, c.gF, "slide");
      L.set(c.handle.g, { x: 4 * U, y: 0, opacity: 0 });
      c.finger = K.finger(c, c.gF);

      // field 3: your turn
      c.gF3 = K.add(c.world, "g", { transform: "translate(" + (W - 8 * u3) / 2 + " 160)" });
      c.gF3.style.display = "none";
      c.g3in = K.add(c.gF3, "g");
      c.f3 = K.field(c, c.g3in, P3, u3);
      c.g3lab = K.add(c.g3in, "g", { "class": "t-pf-labs" });
      K.text(c.g3lab, "4 m", 4 * u3, -26);
      K.text(c.g3lab, "8 m", 4 * u3, 5 * u3 + 40);
      K.add(c.g3lab, "line", { x1: 2 * u3, y1: 0, x2: 2 * u3, y2: 5 * u3, "class": "t-pf-height" });
      K.add(c.g3lab, "path", { d: "M" + (2 * u3 + 14) + " " + 5 * u3 + "V" + (5 * u3 - 14) + "H" + 2 * u3, "class": "t-pf-mark" });
      K.text(c.g3lab, "5 m", 2 * u3 + 14, 2.5 * u3, "t-pf-lab t-pf-start");
      L.set(c.g3lab, { opacity: 0 });
      return c;
    },

    steps: [
      /* ---- 1. meet the field (left out when the trap-lesson video has just introduced it: flags.afterLesson) ---- */
      { skip: afterLesson,
        branch: function () { var p = C.data && C.data.profile; return p && p.id === "aarav" ? 0 : (p && p.id === "riya" ? 1 : 2); },
        options: [
          { caption: "Aarav, here's Ramesh uncle's third field. The top and the bottom are parallel.", run: function (c, L) { K.hop(c.whole, L, 0.15); L.to(c.par, { opacity: 1, duration: 0.4, delay: 0.9 }); } },
          { caption: "Riya, here's Ramesh uncle's third field. The top and the bottom are parallel.", run: function (c, L) { K.hop(c.whole, L, 0.15); L.to(c.par, { opacity: 1, duration: 0.4, delay: 0.9 }); } },
          { caption: "Here's Ramesh uncle's third field. The top and the bottom are parallel.", run: function (c, L) { K.hop(c.whole, L, 0.15); L.to(c.par, { opacity: 1, duration: 0.4, delay: 0.9 }); } },
        ] },
      { caption: "A shape like this is a trapezium. Its top is 3, its bottom is 5, and its height is 4.", skip: afterLesson,
        run: function (c, L) {
          L.to(c.topLab, { opacity: 1, duration: 0.35, delay: 0.6 });
          L.to(c.botLab, { opacity: 1, duration: 0.35, delay: 1.8 });
          L.to([c.hLine, c.hMark, c.hLab], { opacity: 1, duration: 0.35, delay: 3.0 });
          L.wait(600, function () { L.sfx("pop"); }); L.wait(1800, function () { L.sfx("pop"); }); L.wait(3000, function () { L.sfx("pop"); });
        } },

      /* ---- 2. copy, spin, fit ---- */
      { caption: "Same trick as the triangle. Tap the field to make a copy.",
        run: function (c, L) { L.to([c.par, c.hLine, c.hMark, c.hLab], { opacity: 0, duration: 0.3 }); },
        task: function (c, L, done) {
          var p = c.whole, over = false, bob = null;
          p.g.classList.add("is-movable"); p.lift.setAttribute("tabindex", "0"); p.lift.setAttribute("role", "button");
          p.lift.setAttribute("aria-label", "The trapezium field. Press Enter to make a copy.");
          L.set(p.lift, { svgOrigin: p.centre[0] + " " + p.centre[1] });
          if (!L.reduced) bob = L.to(p.lift, { y: -6, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" }, true);
          function go(ev) {
            if (over) return; over = true;
            if (ev) ev.preventDefault();
            if (bob) { L.kill(bob); bob = null; }
            L.set(p.lift, { y: 0 });
            p.g.classList.remove("is-movable"); ["tabindex", "role", "aria-label"].forEach(function (a) { p.lift.removeAttribute(a); });
            L.to([c.topLab, c.botLab], { opacity: 0, duration: 0.25 }, true);
            c.twin.appear(L, function () { done("copy"); });
          }
          L.listen(p.lift, "click", go);
          L.listen(p.lift, "keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") go(ev); });
          L.wait(9000, function () { if (!over) L.controls([h("button", { type: "button", class: "btn btn-ghost", on: { click: function () { L.clearBar(); go(); } } }, "Make the copy")]); });
        } },
      { caption: "Now spin the copy and slide it in to make a parallelogram.",
        task: function (c, L, done) { c.twin.fit(L, done); } },
      { caption: "Click! A parallelogram again.",
        run: function (c, L) {
          c.seam.flash(L, [5 * U, 4 * U], [4 * U, 0]);
          c.outline.draw(L, 0.3);
          L.wait(1300, function () { L.sfx("chime"); });
        } },

      /* ---- 3. base = bottom + top ---- */
      { caption: "Look at its base. Our bottom, 5, plus the copy's top, 3. That's 5 + 3 = 8.",
        run: function (c, L) {
          c.outline.hide(L);
          L.to(c.f, { x: (W - 9 * U) / 2, duration: 0.8, ease: "power2.inOut", onUpdate: function () { placeF(c); } });
          var y = 4 * U + K.SLAB[1] + 18;
          L.wait(900, function () { growBracket(L, c.bB, 0, 5 * U, y, "5", 0); });
          L.wait(2700, function () { growBracket(L, c.bA, 5 * U, 8 * U, y, "3", 0); });
          L.wait(4300, function () { L.board("base = 5 + 3 = <b>8</b>"); L.sfx("chime"); });
        } },
      { caption: "Its height is still 4. So how much land is in the whole parallelogram?",
        run: function (c, L) {
          L.set([c.hLine, c.hMark, c.hLab], { opacity: 0 });
          L.to([c.hLine, c.hMark, c.hLab], { opacity: 1, duration: 0.4, delay: 0.3 });
        },
        task: function (c, L, done) {
          L.number("Land in the parallelogram:", function (v) {
            if (v === 32) return true;
            var r = v === 20 ? R.p20 : v === 12 ? R.p12 : v === 16 ? R.p16 : R.pOther;
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function () {
            c.sign.count(L, 0, 32, 1.4, function () { L.board("8 × 4 = <b>32</b>"); L.say(R.pRight.caption, function () { done(32); }); });
          });
        } },
      { caption: "Our field is exactly half of it. Half of 32 is 16.",
        run: function (c, L) {
          L.to([c.bA.path, c.bA.lab], { opacity: 0, duration: 0.3 });
          c.twin.away(L);
          L.wait(1300, function () { c.tagHalf.show(L); c.sign.count(L, 32, 16, 1.2, function () { L.board("half of (5 + 3) × 4 = <b>16</b>"); }); });
        } },
      { caption: "That's the rule. Add the parallel sides, times the height, then take half.",
        run: function (c, L) {
          L.board('<span class="t-rule">area = ½ × (a + b) × h</span><span class="t-rule-note">a and b are the parallel sides · ½ × (3 + 5) × 4 = 16</span>');
        } },

      /* ---- 4. stretch the top ---- */
      { caption: "Now play with it. Drag the gold handle to stretch or shrink the top.",
        run: function (c, L) {
          L.board("");
          c.tagHalf.hide(L);
          L.to([c.bB.path, c.bB.lab, c.hLab], { opacity: 0, duration: 0.3 });
          L.to(c.f, { x: (W - 6 * U) / 2, duration: 0.7, ease: "power2.inOut", onUpdate: function () { placeF(c); } });
          L.to([c.topLab, c.botLab], { opacity: 1, duration: 0.35, delay: 0.5 });
          L.to(c.handle.g, { opacity: 1, duration: 0.2, delay: 0.8 });
          c.handle.show(L, 0.8);
          L.wait(1000, function () { c.stretchLive = true; setTop(c, 3); L.board("½ × (3 + 5) × 4 = <b>16</b>"); });
        },
        task: function (c, L, done) {
          var kn = c.handle, finished = false, seen0 = false, seen5 = false, tickA = c.a, demo = null, svg = L.svg;
          kn.live(true); kn.hit.setAttribute("role", "slider"); kn.hit.setAttribute("aria-label", "The top's length. Use the left and right arrow keys.");
          svg.classList.add("is-dragging-ok");
          if (!L.reduced) {
            var pr = { a: 3 };
            L.set(c.finger, { x: 4 * U, y: 0, opacity: 0 });
            demo = [
              L.to(pr, { keyframes: [{ a: 1.6, duration: 0.8, ease: "power2.inOut" }, { a: 3, duration: 0.8, ease: "power2.inOut" }, { a: 3, duration: 2.4 }], repeat: -1, delay: 2.5,
                onUpdate: function () { c.whole.set(shapeFor(pr.a)); L.set(kn.g, { x: (1 + pr.a) * U }); L.set(c.finger, { x: (1 + pr.a) * U }); c.topLab.setAttribute("x", ((1 + pr.a / 2) * U).toFixed(1)); } }, true),
              L.to(c.finger, { keyframes: [{ opacity: 1, duration: 0.2 }, { opacity: 1, duration: 1.4 }, { opacity: 0, duration: 0.2 }, { opacity: 0, duration: 2.2 }], repeat: -1, delay: 2.5 }, true),
            ];
          }
          function stopDemo() {
            if (!demo) return;
            demo.forEach(function (t) { L.kill(t); }); demo = null;
            L.to(c.finger, { opacity: 0, duration: 0.15, overwrite: "auto" }, true);
            setTop(c, c.a); L.set(kn.g, { x: (1 + c.a) * U });
          }
          function at(a) {
            if (a === c.a) return;
            setTop(c, a); L.sfx("tick", a * 2 + 4); c.sign.pop(L);
            if (a === 0 && !seen0) { seen0 = true; L.sfx("chime"); L.say(R.gotTriangle.caption, check); }
            else if (a === 5 && !seen5) { seen5 = true; L.sfx("chime"); L.say(R.gotPara.caption, check); }
          }
          function check() {
            if (finished || !seen0) return;
            finished = true; if (d) d.disable();
            kn.live(false); svg.classList.remove("is-dragging-ok"); L.clearBar();
            done("stretched");
          }
          var d = L.draggable(kn.g, {
            type: "x", bounds: { minX: U, maxX: 6 * U },
            liveSnap: function (v) { return Math.round(v / U) * U; },
            onPress: function () { stopDemo(); kn.held(L, true); L.sfx("pickup"); },
            onDrag: function () { at(Math.round(this.x / U) - 1); },
            onRelease: function () { kn.held(L, false); at(Math.round(this.x / U) - 1); },
          });
          L.listen(kn.hit, "keydown", function (ev) {
            if (finished || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
            ev.preventDefault(); stopDemo();
            var a = Math.max(0, Math.min(5, c.a + (ev.key === "ArrowLeft" ? -1 : 1)));
            L.set(kn.g, { x: (1 + a) * U }); if (d) d.update(); at(a);
          });
          L.wait(14000, function () { if (!seen0) L.say(R.stretchHint.caption); });
          L.wait(22000, function () {
            if (finished || seen0) return;
            L.controls([h("button", { type: "button", class: "btn btn-ghost", on: { click: function () {
              stopDemo(); L.clearBar(); if (d) d.disable();
              var pr2 = { a: c.a }, last = c.a;
              L.to(pr2, { a: 0, duration: 0.9, ease: "power2.inOut", onUpdate: function () { var a = Math.round(pr2.a); L.set(kn.g, { x: (1 + pr2.a) * U }); if (a !== last) { last = a; at(a); } } }, true);
            } } }, "Show me")]);
          });
        } },
      { caption: "So one rule covers them all. A triangle is just a trapezium with no top.",
        run: function (c, L) {
          c.stretchLive = false;
          L.to(c.handle.g, { opacity: 0, duration: 0.3 });
          L.board('<span class="t-rule">area = ½ × (a + b) × h</span><span class="t-rule-note">top 0: ½ × (0 + 5) × 4 = 10, the triangle rule</span>');
        } },

      /* ---- 4b. play with a goal: drag until the field has exactly 14 squares ---- */
      { caption: "One more challenge. Drag the handle until the field has exactly 14 squares of land.",
        run: function (c, L) {
          c.stretchLive = true; setTop(c, 0); L.set(c.handle.g, { x: U });
          L.to(c.handle.g, { opacity: 1, duration: 0.3 });
          K.wiggle(c.handle.body, L, "rotation", 10);
        },
        task: function (c, L, done) {
          var kn = c.handle, won = false, svg = L.svg, d = null;
          var old = window.Draggable && window.Draggable.get ? window.Draggable.get(kn.g) : null;
          if (old) old.kill();                       // the stretch step's drag is finished; this one has its own goal
          kn.live(true); svg.classList.add("is-dragging-ok");
          function at(a) {
            if (won || a === c.a) return;
            setTop(c, a); L.sfx("tick", a * 2 + 4); c.sign.pop(L);
            if (areaFor(a) === 14) win();
          }
          function win() {
            won = true; if (d) d.disable();
            kn.live(false); svg.classList.remove("is-dragging-ok"); L.clearBar();
            L.sfx("chime");
            L.say(R.got14.caption, function () { c.stretchLive = false; done(14); });
          }
          d = L.draggable(kn.g, {
            type: "x", bounds: { minX: U, maxX: 6 * U },
            liveSnap: function (v) { return Math.round(v / U) * U; },
            onPress: function () { kn.held(L, true); L.sfx("pickup"); },
            onDrag: function () { at(Math.round(this.x / U) - 1); },
            onRelease: function () { kn.held(L, false); at(Math.round(this.x / U) - 1); },
          });
          L.listen(kn.hit, "keydown", function (ev) {
            if (won || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
            ev.preventDefault();
            var a = Math.max(0, Math.min(5, c.a + (ev.key === "ArrowLeft" ? -1 : 1)));
            L.set(kn.g, { x: (1 + a) * U }); if (d) d.update(); at(a);
          });
          L.wait(12000, function () { if (!won) L.say(R.hint14.caption); });
          L.wait(24000, function () {
            if (won) return;
            L.controls([h("button", { type: "button", class: "btn btn-ghost", on: { click: function () {
              L.clearBar(); if (d) d.disable();
              var pr = { a: c.a }, last = c.a;
              L.to(pr, { a: 2, duration: 0.8, ease: "power2.inOut", onUpdate: function () {
                var a = Math.round(pr.a); L.set(kn.g, { x: (1 + pr.a) * U }); if (a !== last) { last = a; at(a); }
              } }, true);
            } } }, "Show me")]);
          });
        } },

      /* ---- 5. your turn ---- */
      { caption: "Your turn. How much land is in this field?",
        run: function (c, L) {
          L.board(""); c.sign.set(null, L, "sq m"); c.sign.pop(L);
          L.to(c.gF, { opacity: 0, duration: 0.4, onComplete: function () { c.gF.style.display = "none"; } });
          c.gF3.style.display = "";
          K.dropIn(c.f3, c.g3in, L, 0.4);
          L.to(c.g3lab, { opacity: 1, duration: 0.4, delay: 1.3 });
        },
        task: function (c, L, done) {
          L.number("Land in square metres:", function (v) {
            if (v === 30) return true;
            var r = v === 60 ? R.n60 : v === 40 ? R.n40 : v === 20 ? R.n20 : v === 17 ? R.n17 : R.nOther;
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function () {
            c.sign.count(L, 0, 30, 1.3, function () { L.say(R.nRight.caption, function () { done(30); }); });
          });
        } },
      { caption: "Half of (4 + 8) × 5 is 30. Add, times the height, then halve.",
        run: function (c, L) {
          L.board('<span class="t-rule">area = ½ × (a + b) × h</span><span class="t-rule-note">½ × (4 + 8) × 5 = 30 square metres</span>');
        } },
      { caption: "Next time, a field with lots of corners. We'll split it into pieces.", hold: 600 },
    ],
  });
})();
