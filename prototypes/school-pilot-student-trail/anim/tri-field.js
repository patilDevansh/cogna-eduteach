/* Ramesh uncle's triangle field — a hands-on lesson: the area of a triangle is half of base × height.
   The student does the maths with their hands and the narrator reacts:
     1. the field has slanted edges, so counting squares won't work
     2. tap the field to make a copy, spin the copy with its gold knob, and slide it in: two triangles make a parallelogram
     3. the parallelogram is base × height (from the last lesson); guess the triangle's share, then watch the copy lift off
     4. on a new field, tap the real height (the slanted side is the trap), then work out the land on their own
   Built on Cogna.lesson + Cogna.landKit (same land look as para-field). Every line the narrator can say is a literal
   `caption:` so tools/record-narration.mjs records it. */
(function () {
  "use strict";
  var C = window.Cogna, K = C.landKit;
  var W = 800, H = 470, U = 52;
  var T = [[0, 4], [6, 4], [2, 0]];             // the triangle field, in squares
  var SLOT = [[8, 0], [2, 0], [6, 4]];          // where its half-turned copy goes
  var PARA = [[0, 4], [6, 4], [8, 0], [2, 0]];
  var F0 = [60, 170];                           // where field 1 sits at first
  var u3 = 44, T3 = [[0, 4], [10, 4], [3, 0]];  // the field for "your turn"

  var R = {
    wrongWay: { caption: "Hmm, it doesn't fit that way up. Spin it with the gold knob first." },
    dropWrong: { caption: "Not there. Slide it so the two long slanted edges meet." },
    dropHint: { caption: "Psst. Turn it upside down, then push it against the slanted side." },
    ask24: { caption: "24 is both triangles together. Our field is just one of them." },
    ask48: { caption: "48 is double the parallelogram. Our field is smaller than that." },
    ask12: { caption: "Yes! Exactly half." },
    tapSlant: { caption: "That's the slanted side. The height goes straight down, like a stone you drop." },
    tapRight: { caption: "That's a slanted side too. Look for the line that drops straight down." },
    tapBase: { caption: "That's the base, along the bottom. The height stands up from it." },
    tapRight2: { caption: "Yes! It drops straight down and makes a square corner with the base. 4 metres." },
    n25: { caption: "That used the slanted side, 5. Use the height, 4." },
    n40: { caption: "That's the whole parallelogram, 10 × 4. The triangle is half of it." },
    n50: { caption: "That's 10 × 5, the slanted side. Use the height, 4, then take half." },
    n14: { caption: "That's 10 + 4. For land, we multiply, then take half." },
    nOther: { caption: "Half of base × height. The base is 10, the height is 4." },
    nRight: { caption: "20! Spot on." },
  };

  function placeF(c) { c.gF.setAttribute("transform", "translate(" + c.f.x.toFixed(1) + " " + c.f.y.toFixed(1) + ")"); }

  /** measuring lines: a bracket under the base and a dashed height with a square corner */
  function measure(c, L) {
    var yb = 4 * U + K.SLAB[1] + 18, hx = 2 * U;
    c.bBottom.setAttribute("d", "M0 " + (yb - 9) + "V" + (yb + 9) + "M0 " + yb + "H" + 6 * U + "M" + 6 * U + " " + (yb - 9) + "V" + (yb + 9));
    c.l6.setAttribute("x", 3 * U); c.l6.setAttribute("y", yb + 26);
    c.hLine.setAttribute("x1", hx); c.hLine.setAttribute("x2", hx); c.hLine.setAttribute("y1", 0); c.hLine.setAttribute("y2", 4 * U);
    c.hMark.setAttribute("d", "M" + (hx + 14) + " " + 4 * U + "V" + (4 * U - 14) + "H" + hx);
    c.l4.setAttribute("x", hx - 18); c.l4.setAttribute("y", 2 * U);
    L.set(c.bBottom, { opacity: 1, scaleX: 0, svgOrigin: "0 " + yb });
    L.set([c.hLine, c.hMark], { opacity: 1, scaleY: 0, svgOrigin: hx + " 0" });
    L.set(c.l6, { opacity: 0, scale: 0.4, svgOrigin: 3 * U + " " + (yb + 26) });
    L.set(c.l4, { opacity: 0, scale: 0.4, svgOrigin: (hx - 18) + " " + 2 * U });
    L.to(c.bBottom, { scaleX: 1, duration: 0.7, delay: 0.3, ease: "power2.inOut" });
    L.to(c.l6, { opacity: 1, scale: 1, duration: 0.4, delay: 0.95, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
    L.to([c.hLine, c.hMark], { scaleY: 1, duration: 0.6, delay: 1.6, ease: "power2.inOut" });
    L.to(c.l4, { opacity: 1, scale: 1, duration: 0.4, delay: 2.15, ease: "back.out(3)", onStart: function () { L.sfx("pop"); } });
  }

  /** ask with the wrong picks taken away, until the right one is chosen */
  function askUntil(L, prompt, choices, right, said, done) {
    L.ask(prompt, choices, function (v) {
      if (v === right) { L.sfx("chime"); L.say(said[v].caption, function () { done(v); }); return; }
      L.sfx("oops"); L.say(said[v].caption);
      askUntil(L, prompt, choices.filter(function (ch) { return ch.value !== v; }), right, said, done);
    });
  }

  C.lesson.define({
    id: "tri-field", title: "Ramesh uncle's triangle field", cls: "t-pf t-tf", w: W, h: H, durationMs: 180000,

    build: function (svg, L) {
      var c = K.setup(svg, L);
      c.f = { x: F0[0], y: F0[1] };
      K.tree(c.world, 74, 132, 0.85, L);
      c.sign = K.sign(c, W);

      // field 1 and its copy
      c.gF = K.add(c.world, "g"); placeF(c);
      c.whole = K.field(c, c.gF, T, U);
      c.broken = K.broken(c, c.gF, T, U);
      c.twin = K.twin(c, c.gF, {
        P: T, u: U, pivot: [3, 2], knobAt: [4.3, 3.05], stage: [7.6 * U, 0], target: [2 * U, 0], slot: SLOT,
        bounds: { minX: -F0[0] + 8, maxX: 7.9 * U, minY: -150, maxY: 70 }, R: R,
      });
      c.seam = K.seam(c, c.gF);
      c.outline = K.outline(c.gF, PARA, U);
      c.gMarks = K.add(c.gF, "g", { "class": "t-pf-marks" });
      c.bBottom = K.add(c.gMarks, "path", { "class": "t-pf-bracket" }); c.bBottom.style.opacity = 0;
      c.hLine = K.add(c.gMarks, "line", { "class": "t-pf-height" }); c.hLine.style.opacity = 0;
      c.hMark = K.add(c.gMarks, "path", { "class": "t-pf-mark" }); c.hMark.style.opacity = 0;
      c.l6 = K.text(c.gMarks, "6", 0, 0, "t-pf-dim"); c.l6.style.opacity = 0;
      c.l4 = K.text(c.gMarks, "4", 0, 0, "t-pf-dim t-pf-end"); c.l4.style.opacity = 0;
      c.tagHalf = K.tag(c.gF, "half"); c.tagHalf.put(3.7 * U, 3.0 * U); c.tagHalf.init(L);

      // field 3: tap the height, then work it out
      c.gF3 = K.add(c.world, "g", { transform: "translate(" + (W - 10 * u3) / 2 + " 178)" });
      c.gF3.style.display = "none";
      c.g3in = K.add(c.gF3, "g");
      c.f3 = K.field(c, c.g3in, T3, u3);
      c.g3lab = K.add(c.g3in, "g", { "class": "t-pf-labs" });
      K.text(c.g3lab, "5 m", 1.5 * u3 - 30, 2 * u3 - 14, "t-pf-lab t-pf-end");
      K.text(c.g3lab, "10 m", 5 * u3, 4 * u3 + 40);
      c.h3lab = K.text(c.g3lab, "4 m", 3 * u3 + 12, 2.6 * u3, "t-pf-lab t-pf-start"); c.h3lab.style.opacity = 0;
      // the lines the student can tap: left side, the dotted drop, right side, base
      c.lines3 = {};
      [["slant", [0, 4], [3, 0]], ["drop", [3, 0], [3, 4]], ["right", [10, 4], [3, 0]], ["base", [0, 4], [10, 4]]].forEach(function (d) {
        var a = [d[1][0] * u3, d[1][1] * u3], b = [d[2][0] * u3, d[2][1] * u3];
        var g = K.add(c.g3in, "g", { "class": "t-tf-pick is-" + d[0] });
        var vis = K.add(g, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "class": "t-tf-line" });
        var hit = K.add(g, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "class": "t-tf-hitline", tabindex: "-1", role: "button",
          "aria-label": d[0] === "drop" ? "the dotted line that drops straight down" : d[0] === "slant" ? "the left side, 5 metres" : d[0] === "right" ? "the right side" : "the base, 10 metres" });
        L.set(g, { opacity: 0 });
        c.lines3[d[0]] = { g: g, vis: vis, hit: hit };
      });
      c.mark3 = K.add(c.g3in, "path", { d: "M" + (3 * u3 + 14) + " " + 4 * u3 + "V" + (4 * u3 - 14) + "H" + 3 * u3, "class": "t-tf-mark3" });
      L.set(c.mark3, { opacity: 0, scale: 0.2, svgOrigin: 3 * u3 + " " + 4 * u3 });
      L.set(c.g3lab, { opacity: 0 });
      return c;
    },

    steps: [
      /* ---- 1. meet the field ---- */
      { branch: function () { var p = C.data && C.data.profile; return p && p.id === "aarav" ? 0 : (p && p.id === "riya" ? 1 : 2); },
        options: [
          { caption: "Aarav, Ramesh uncle has a new field. This one is a triangle.", run: function (c, L) { K.hop(c.whole, L, 0.15); L.wait(700, function () { c.sign.pop(L); }); } },
          { caption: "Riya, Ramesh uncle has a new field. This one is a triangle.", run: function (c, L) { K.hop(c.whole, L, 0.15); L.wait(700, function () { c.sign.pop(L); }); } },
          { caption: "Ramesh uncle has a new field. This one is a triangle.", run: function (c, L) { K.hop(c.whole, L, 0.15); L.wait(700, function () { c.sign.pop(L); }); } },
        ] },
      { caption: "Two slanted edges, and lots of broken squares. Counting them would be a mess.",
        run: function (c, L) { c.broken.show(L); } },
      { caption: "But we already know parallelograms. Can two of these triangles make one?",
        run: function (c, L) { c.broken.hide(L); K.sheen(c, L, c.whole, 6 * U, 4 * U); } },

      /* ---- 2. copy it ---- */
      { caption: "Tap the field to make a copy.",
        task: function (c, L, done) {
          var p = c.whole, over = false, bob = null;
          p.g.classList.add("is-movable"); p.lift.setAttribute("tabindex", "0"); p.lift.setAttribute("role", "button");
          p.lift.setAttribute("aria-label", "The triangle field. Press Enter to make a copy.");
          L.set(p.lift, { svgOrigin: p.centre[0] + " " + p.centre[1] });
          if (!L.reduced) bob = L.to(p.lift, { y: -6, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" }, true);
          function go(ev) {
            if (over) return; over = true;
            if (ev) ev.preventDefault();
            if (bob) { L.kill(bob); bob = null; }
            L.set(p.lift, { y: 0 });
            p.g.classList.remove("is-movable"); ["tabindex", "role", "aria-label"].forEach(function (a) { p.lift.removeAttribute(a); });
            c.twin.appear(L, function () { done("copy"); });
          }
          L.listen(p.lift, "click", go);
          L.listen(p.lift, "keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") go(ev); });
          L.wait(9000, function () { if (!over) L.controls([C.h("button", { type: "button", class: "btn btn-ghost", on: { click: function () { L.clearBar(); go(); } } }, "Make the copy")]); });
        } },

      /* ---- 3. spin and fit ---- */
      { caption: "Now make a parallelogram. Spin the copy with its gold knob, then slide it in.",
        task: function (c, L, done) { c.twin.fit(L, done); } },
      { caption: "Click! Two triangles make a parallelogram.",
        run: function (c, L) {
          c.seam.flash(L, [6 * U, 4 * U], [2 * U, 0]);
          c.outline.draw(L, 0.3);
          L.wait(1300, function () { L.sfx("chime"); });
        } },
      { caption: "Its base is 6 and its height is 4. So the parallelogram has 6 × 4 = 24 squares.",
        run: function (c, L) {
          c.outline.hide(L);
          L.to(c.f, { x: (W - 8 * U) / 2, duration: 0.8, ease: "power2.inOut", onUpdate: function () { placeF(c); } });
          L.wait(800, function () { measure(c, L); });
          L.wait(3200, function () { c.sign.set(24, L); c.sign.pop(L); L.sfx("chime"); L.board("6 × 4 = <b>24</b>"); });
        } },

      /* ---- 4. half ---- */
      { caption: "So how much land is in just our triangle?",
        task: function (c, L, done) {
          askUntil(L, "Land in the triangle:", [{ label: "24 squares", value: 24 }, { label: "12 squares", value: 12 }, { label: "48 squares", value: 48 }], 12,
            { 24: R.ask24, 48: R.ask48, 12: R.ask12 }, done);
        } },
      { caption: "The copy was exactly the same size. So our field is half of 24, which is 12.",
        run: function (c, L) {
          c.twin.away(L);
          L.wait(1300, function () {
            c.tagHalf.show(L);
            c.sign.count(L, 24, 12, 1.1, function () { L.board("half of 6 × 4 = <b>12</b>"); });
          });
        } },
      { caption: "That's the rule. A triangle's area is half of base × height.",
        run: function (c, L) {
          L.board('<span class="t-rule">area = ½ × base × height</span><span class="t-rule-note">½ × 6 × 4 = 12 squares</span>');
        } },

      /* ---- 5. which line is the height? ---- */
      { caption: "Careful, though. Here's another field. Tap the line that is its height.",
        run: function (c, L) {
          L.board(""); c.sign.set(null, L, "sq m"); c.sign.pop(L);
          c.tagHalf.hide(L);
          L.to(c.gF, { opacity: 0, duration: 0.4, onComplete: function () { c.gF.style.display = "none"; } });
          c.gF3.style.display = "";
          K.dropIn(c.f3, c.g3in, L, 0.4);
          L.to(c.g3lab, { opacity: 1, duration: 0.4, delay: 1.3 });
          L.to(Object.keys(c.lines3).map(function (k) { return c.lines3[k].g; }), { opacity: 1, duration: 0.4, delay: 1.3 });
        },
        task: function (c, L, done) {
          var over = false, misses = 0;
          Object.keys(c.lines3).forEach(function (k) {
            var ln = c.lines3[k];
            ln.g.classList.add("is-live"); ln.hit.setAttribute("tabindex", "0");
            function pick(ev) {
              if (over) return;
              if (ev) ev.preventDefault();
              if (k === "drop") { win(); return; }
              misses++; L.sfx("oops");
              ln.g.classList.add("is-wrong");
              L.wait(900, function () { ln.g.classList.remove("is-wrong"); });
              L.say((k === "slant" ? R.tapSlant : k === "right" ? R.tapRight : R.tapBase).caption);
              if (misses >= 2) c.lines3.drop.g.classList.add("is-hint");
            }
            L.listen(ln.hit, "click", pick);
            L.listen(ln.hit, "keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") pick(ev); });
          });
          function win() {
            over = true;
            Object.keys(c.lines3).forEach(function (k) { var ln = c.lines3[k]; ln.g.classList.remove("is-live", "is-hint"); ln.hit.setAttribute("tabindex", "-1"); });
            c.lines3.drop.g.classList.add("is-correct");
            L.sfx("snap");
            L.to(c.mark3, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(3)" }, true);
            L.to(c.h3lab, { opacity: 1, duration: 0.3, delay: 0.3 }, true);
            L.wait(350, function () { L.sfx("chime"); });
            L.say(R.tapRight2.caption, function () { done("drop"); });
          }
        } },

      /* ---- 6. your turn ---- */
      { caption: "Your turn. How much land is in this field?",
        task: function (c, L, done) {
          L.number("Land in square metres:", function (v) {
            if (v === 20) return true;
            var r = v === 25 ? R.n25 : v === 40 ? R.n40 : v === 50 ? R.n50 : v === 14 ? R.n14 : R.nOther;
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function () {
            c.sign.count(L, 0, 20, 1.3, function () { L.say(R.nRight.caption, function () { done(20); }); });
          });
        } },
      { caption: "Half of 10 × 4 is 20. Half of base × height, every time.",
        run: function (c, L) {
          L.board('<span class="t-rule">area = ½ × base × height</span><span class="t-rule-note">½ × 10 × 4 = 20 square metres</span>');
        } },
      { caption: "Next time, a field with two parallel sides. Same trick!", hold: 600 },
    ],
  });
})();
