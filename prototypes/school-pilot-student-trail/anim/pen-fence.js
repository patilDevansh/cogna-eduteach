/* The goat pen — a story lesson for skill a1: area counts the squares inside; it is not the fence round the edge.
   Ramesh uncle has exactly 20 metres of fence. The student drags one side of the pen: the width goes from 1 to 9 metres
   and the height is always 10 − width, so the fence stays 20 m while the grass inside changes (9, 16, 21, 24, 25).
     story  he walks on with his fence and his question
     guess  the most grass 20 m of fence can hold
     hands  1. drag the handle and watch the grass (three different widths)   2. make the best pen, then press Done
     tell   25 squares, and how they knew (the "perim" mix-up: 20 is the fence, not the grass)
     rule   two plain rectangles with the same distance round (20 m) and different areas (16 and 24), then 7 m by 3 m alone
   Built on Cogna.lesson, Cogna.story and Cogna.landKit (load after anim/land-kit.js). Styles: css/lessons/pen-fence.css.
   Every line that can be spoken is a literal `caption:` so tools/record-narration.mjs records it.
   Lessons are built off-screen, so every scale origin is given as a point (svgOrigin), never measured. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, K = C.story, LK = C.landKit;
  var add = LK.add, text = LK.text;
  var W = 800, H = 470;
  var U = 40;                 // one metre of pen
  var X0 = 236, YB = 410;     // the pen's bottom-left corner on the stage (it grows up and to the right from here)
  var FENCE = 20, HALF = 10;  // metres of fence; width + height is always half of it
  var RU = 36, RX = 46, RY = 78, RCOLS = 19, RROWS = 7;   // the plain grid of the rule beat

  /* reaction lines (spoken inside a task) */
  var R = {
    guessed: { caption: "Good. Hold on to that guess, and let's find out for sure." },
    noGuess: { caption: "That's fine. Let's find out together." },
    dragDone: { caption: "See that? The fence never changed. It is still 20 metres. But the grass did." },
    n9: { caption: "That pen holds 9 squares. The same fence can hold more. Keep going." },
    n16: { caption: "That pen holds 16 squares. The same fence can hold more. Keep going." },
    n21: { caption: "That pen holds 21 squares. The same fence can hold more. Keep going." },
    n24: { caption: "That pen holds 24 squares. So close! One more is possible." },
    best: { caption: "25 squares! That is the most grass this fence can hold." },
    tellOther: { caption: "Count the squares inside the best pen. 5 rows of 5." },
    tellRight: { caption: "He says thank you! Now his goats get the most grass." },
    tellRightGuess: { caption: "He says thank you! And 25 was your guess at the start. Spot on." },
    tellRightOther: { caption: "He says thank you! Your first guess was a fair try, and now you know for sure." },
    q20: { caption: "20 is the distance round: 7 + 3 + 7 + 3. Area is the squares inside." },
    q10: { caption: "That is 7 + 3. For area, multiply." },
    qOther: { caption: "Count the squares inside. 3 rows of 7." },
    qRight: { caption: "21! You've got it." },
  };
  var BY_N = { 9: R.n9, 16: R.n16, 21: R.n21, 24: R.n24 };

  function clampW(w) { return Math.max(1, Math.min(HALF - 1, w)); }
  function rectP(w) { var hh = HALF - w; return [[0, 0], [w, 0], [w, -hh], [0, -hh]]; }
  function boardHtml(w) {
    var hh = HALF - w;
    return "fence <b>" + FENCE + " m</b> &nbsp;·&nbsp; grass " + w + " × " + hh + " = <b>" + (w * hh) + "</b> squares";
  }

  /** the pen takes the width w (metres): grass, fence posts, labels, handle, and (once live) the sign and the board */
  function setPen(c, L, w) {
    var hh = HALF - w, i, n = 0;
    c.w = w;
    c.pen.set(rectP(w));
    c.rail.setAttribute("y", -hh * U - 9); c.rail.setAttribute("width", w * U); c.rail.setAttribute("height", hh * U);
    function post(x, y) { c.posts[n++].setAttribute("transform", "translate(" + x * U + " " + (-y * U) + ")"); }
    for (i = 0; i < w; i++) post(i, hh);          // back fence first, so the front posts are drawn over it
    for (i = 0; i < hh; i++) post(0, hh - 1 - i);
    for (i = 0; i < hh; i++) post(w, i + 1);
    for (i = 0; i < w; i++) post(w - i, 0);       // 2w + 2h = 20 posts, always
    c.wLab.textContent = w + " m"; c.wLab.setAttribute("x", w * U / 2);
    c.hLab.textContent = hh + " m"; c.hLab.setAttribute("y", -hh * U / 2);
    L.set(c.knob.g, { y: -hh * U / 2 });
    c.knob.hit.setAttribute("aria-valuenow", w);
    c.knob.hit.setAttribute("aria-valuetext", w + " metres wide, " + hh + " metres tall, " + (w * hh) + " squares of grass");
    if (c.live) { c.sign.set(w * hh, L); L.boardLive(boardHtml(w)); }
  }
  function putKnob(c, L, w) { L.set(c.knob.g, { x: w * U }); if (c.drag) c.drag.update(); }

  /** a ghost fingertip slides the handle's way, over and over, until the student takes hold */
  function demo(c, L) {
    if (L.reduced) return;
    var f = c.finger, x = c.w * U;
    L.set(f, { x: x, y: -(HALF - c.w) * U / 2, opacity: 0 });
    c.demo = L.to(f, { keyframes: [
      { opacity: 1, duration: 0.25, ease: "none" },
      { x: x - 2 * U, duration: 0.9, ease: "power2.inOut" },
      { x: x, duration: 0.9, ease: "power2.inOut" },
      { opacity: 0, duration: 0.3, ease: "none" },
      { opacity: 0, duration: 1.6 },
    ], repeat: -1, delay: 2.5 }, true);
  }
  function stopDemo(c, L) {
    if (!c.demo) return;
    L.kill(c.demo); c.demo = null;
    L.to(c.finger, { opacity: 0, duration: 0.15, overwrite: "auto" }, true);
  }

  /** the handle comes alive: drag it (it snaps to whole metres) or use the arrow keys. c.ctl.onChange / onRelease listen. */
  function arm(c, L) {
    var k = c.knob;
    k.live(true); L.svg.classList.add("is-dragging-ok");   // on a touch screen, a drag here must not scroll the page
    c.armed = true;
    function change(w) {
      setPen(c, L, w); L.sfx("tick", w * 2);
      if (c.ctl.onChange) c.ctl.onChange(w);
    }
    c.drag = L.draggable(k.g, {
      type: "x", bounds: { minX: U, maxX: (HALF - 1) * U },
      liveSnap: { x: function (v) { return Math.round(v / U) * U; } },
      onPress: function () { if (!c.armed) return; stopDemo(c, L); L.sfx("pickup"); k.held(L, true); },
      onDrag: function () { if (!c.armed) return; var w = clampW(Math.round(this.x / U)); if (w !== c.w) change(w); },
      onRelease: function () {
        if (!c.armed) return;
        k.held(L, false); putKnob(c, L, c.w);
        L.sfx("pop"); c.sign.pop(L);
        if (c.ctl.onRelease) c.ctl.onRelease();
      },
    });
    L.listen(k.hit, "keydown", function (ev) {
      if (!c.armed || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
      ev.preventDefault(); stopDemo(c, L);
      var w = clampW(c.w + (ev.key === "ArrowLeft" ? -1 : 1));
      if (w === c.w) return;
      putKnob(c, L, w); change(w);
      if (c.ctl.onRelease) c.ctl.onRelease();
    });
  }
  function disarm(c, L) {
    c.armed = false; stopDemo(c, L);
    if (c.drag) c.drag.disable();
    c.knob.live(false); c.knob.g.classList.remove("is-held");
    L.svg.classList.remove("is-dragging-ok");
  }

  /** counting tiles, bottom row first: cols × rows of size u, with the bottom-left corner at (x0, yb) */
  function makeCells(c, parent, cols, rows, u, x0, yb) {
    var out = [], nums = [];
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    for (var i = 0; i < cols * rows; i++) {
      var cx = x0 + (i % cols + 0.5) * u, cy = yb - (Math.floor(i / cols) + 0.5) * u;
      var g = add(parent, "g", { "class": "t-pf-cell" });
      add(g, "rect", { x: cx - u / 2 + 4, y: cy - u / 2 + 4, width: u - 8, height: u - 8, rx: 7 });
      nums.push(text(g, String(i + 1), cx, cy + 1, "pn-cellnum"));
      c.L.set(g, { scale: 0.4, opacity: 0, svgOrigin: cx + " " + cy });
      out.push(g);
    }
    return { cells: out, nums: nums };
  }
  /** the tiles pop in one by one with a rising tick (each(i) runs as tile i lands), then a chime */
  function countUp(c, L, set, each, then) {
    var T0 = 300, DT = 95, n = set.cells.length;
    set.cells.forEach(function (cell, i) {
      L.wait(T0 + i * DT, function () {
        L.to(cell, { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(2.4)" }, true);
        L.sfx("tick", i); if (each) each(i);
      });
    });
    L.wait(T0 + n * DT + 250, function () {
      L.sfx("chime");
      L.to(set.cells, { scale: 1.1, duration: 0.13, yoyo: true, repeat: 1, ease: "power1.inOut", stagger: 0.02 }, true);
      L.wait(800, then);
    });
  }

  /** a small goat standing in the pen's bottom-left square (pen coordinates) */
  function goat(parent) {
    var g = add(parent, "g", { "class": "pn-goat" });
    add(g, "ellipse", { cx: 20, cy: -6, rx: 13, ry: 3, "class": "pn-goat-shadow" });
    add(g, "path", { d: "M13 -14V-7M18 -13V-7M24 -13V-7M28 -14V-7", "class": "pn-goat-leg" });
    add(g, "ellipse", { cx: 20, cy: -18, rx: 11, ry: 7, "class": "pn-goat-body" });
    add(g, "path", { d: "M29 -30L27 -35M32 -30L33 -35", "class": "pn-goat-horn" });
    add(g, "circle", { cx: 31, cy: -25, r: 5.5, "class": "pn-goat-body" });
    add(g, "circle", { cx: 33, cy: -26, r: 1.2, "class": "pn-goat-eye" });
    return g;
  }

  /** a plain rectangle on the rule grid: gx, gy = its top-left corner in grid squares. per / area: the two lines above it. */
  function plain(c, gx, gy, w, hh, per, area) {
    var g = add(c.gRule, "g"), x = gx * RU, y = gy * RU, ww = w * RU, hp = hh * RU, d = "", i;
    add(g, "rect", { x: x, y: y, width: ww, height: hp, "class": "pn-rect-fill" });
    for (i = 1; i < w; i++) d += "M" + (x + i * RU) + " " + y + "v" + hp;
    for (i = 1; i < hh; i++) d += "M" + x + " " + (y + i * RU) + "h" + ww;
    add(g, "path", { d: d, "class": "pn-rect-grid" });
    add(g, "rect", { x: x, y: y, width: ww, height: hp, "class": "pn-rect-edge" });
    text(g, w + " m", x + ww / 2, y + hp + 20, "pn-dim");
    text(g, hh + " m", x - 10, y + hp / 2, "pn-dim pn-end");
    var o = { g: g, x: x, y: y, w: ww, h: hp };
    if (per) {
      o.per = text(g, per, x + ww / 2, y - 46, "pn-per");
      o.area = text(g, area, x + ww / 2, y - 19, "pn-area");
      c.L.set([o.per, o.area], { opacity: 0, y: 8 });
    }
    o.outline = LK.outline(c.gRule, [[gx, gy], [gx + w, gy], [gx + w, gy + hh], [gx, gy + hh]], RU);
    c.L.set(g, { opacity: 0 });
    return o;
  }

  C.lesson.define({
    id: "pen-fence", title: "The goat pen", cls: "t-pf t-pen", w: W, h: H, durationMs: 180000,
    presenter: { x: 700, y: 360, h: 106 },

    build: function (svg, L) {
      var c = LK.setup(svg, L), i, d;
      K.scene(svg, L, { w: W, h: H, hutX: 236, sunX: 420, before: c.world });   // Ramesh uncle's farm
      c.w = 8; c.live = false; c.armed = false; c.ctl = { onChange: null, onRelease: null };

      // scenery and the sign (they leave with the story)
      c.trees = [LK.tree(c.world, 66, 128, 0.95, L), LK.tree(c.world, 132, 112, 0.62, L)];
      c.sign = LK.sign(c, W, "GRASS");

      // Ramesh uncle waits off to the left (made before the pen, so the pen is drawn over him)
      c.uncle = K.person(c.world, L, { x: 74, y: 420, look: "uncle" });

      // the pen: grass on a slab of earth with a fence round it
      c.gPen = add(c.world, "g", { transform: "translate(" + X0 + " " + YB + ")" });
      c.gPenIn = add(c.gPen, "g");   // animated inside the placed group, so GSAP never fights the placement
      c.pen = LK.field(c, c.gPenIn, rectP(c.w), U);
      c.goat = goat(c.pen.lift);
      c.gFence = add(c.pen.lift, "g", { "class": "pn-fence" });
      c.rail = add(c.gFence, "rect", { x: 0, y: 0, width: 0, height: 0, "class": "pn-rail" });
      c.posts = [];
      for (i = 0; i < FENCE; i++) {
        var p = add(c.gFence, "g");
        add(p, "rect", { x: -3.5, y: -15, width: 7, height: 17, rx: 2, "class": "pn-post" });
        c.posts.push(p);
      }
      c.gCells = add(c.gPenIn, "g", { "class": "t-pf-cells" });
      c.gLab = add(c.gPenIn, "g", { "class": "t-pf-labs" });
      c.wLab = text(c.gLab, "", 0, 38, "pn-dim");
      c.hLab = text(c.gLab, "", -14, 0, "pn-dim pn-end");
      c.knob = LK.knob(c, c.gPenIn, "slide");
      c.knob.hit.setAttribute("role", "slider");
      c.knob.hit.setAttribute("aria-valuemin", 1); c.knob.hit.setAttribute("aria-valuemax", HALF - 1);
      c.knob.hit.setAttribute("aria-label", "How wide the pen is. Use the left and right arrow keys.");
      c.finger = LK.finger(c, c.gPenIn);
      L.set(c.knob.g, { x: c.w * U, opacity: 0 });
      L.set([c.gPenIn, c.gLab], { opacity: 0 });
      setPen(c, L, c.w);

      // the rule beat: a plain grid with plain rectangles (hidden until the story is over)
      c.gRule = add(c.world, "g", { "class": "pn-rule", transform: "translate(" + RX + " " + RY + ")" });
      c.gRule.style.display = "none";
      d = "";
      for (i = 0; i <= RCOLS; i++) d += "M" + i * RU + " 0V" + RROWS * RU;
      for (i = 0; i <= RROWS; i++) d += "M0 " + i * RU + "H" + RCOLS * RU;
      add(c.gRule, "path", { d: d, "class": "pn-gridbg" });
      c.rA = plain(c, 2, 4, 8, 2, "20 m round", "16 squares inside");     // 2 × (8 + 2) = 20, 8 × 2 = 16
      c.rB = plain(c, 12, 2, 6, 4, "20 m round", "24 squares inside");    // 2 × (6 + 4) = 20, 6 × 4 = 24
      c.rC = plain(c, 6, 2, 7, 3);                                        // the student's own: 7 × 3 = 21
      c.gCellsC = add(c.gRule, "g", { "class": "t-pf-cells" });
      return c;
    },

    steps: [
      /* ---- story ---- */
      { beat: "story", caption: "This is Ramesh uncle. He has exactly 20 metres of fence to make a pen for his goats.",
        run: function (c, L) { K.enter(c.uncle, L); LK.dropIn(c.pen, c.gPenIn, L, 1.2); } },
      { caption: "He wants the goats to have the most grass. But which pen holds the most?",
        run: function (c, L) { K.puzzled(c.uncle, L, true); c.sign.pop(L); } },

      /* ---- guess (never marked) ---- */
      K.guessStep({ caption: "Before we help him, have a guess. What is the most grass 20 metres of fence can hold?",
        prompt: "Squares of grass:",
        choices: [{ label: "16", value: 16 }, { label: "20", value: 20 }, { label: "25", value: 25 }, { label: "No idea yet", value: 0 }],
        guessed: R.guessed, none: R.noGuess }),

      /* ---- hands 1: drag and watch ---- */
      { beat: "hands", caption: "Drag the gold handle and watch the grass. Each square is 1 square metre.",
        hint: { caption: "Hold the gold handle on the right side of the pen. Slide it left, then right." },
        run: function (c, L) {
          K.puzzled(c.uncle, L, false);
          c.live = true; c.sign.set(c.w * (HALF - c.w), L); c.sign.pop(L); L.board(boardHtml(c.w));
          L.to(c.gLab, { opacity: 1, duration: 0.4 });
          L.to(c.knob.g, { opacity: 1, duration: 0.2 });
          c.knob.show(L, 0.1);
        },
        task: function (c, L, done) {
          var seen = {}, n = 0, fin = false;
          seen[c.w] = true;
          function check() {
            if (fin || n < 3) return;
            fin = true; c.ctl.onChange = null; c.ctl.onRelease = null;
            L.sfx("chime");
            L.say(R.dragDone.caption, function () { done("tried"); });
          }
          c.ctl.onChange = function (w) { if (!seen[w]) { seen[w] = true; n++; } };
          c.ctl.onRelease = check;
          arm(c, L); demo(c, L);
        } },

      /* ---- hands 2: the best pen ---- */
      { caption: "Now make the pen that holds the most grass. Then press Done.",
        hint: { caption: "Try a pen where the sides are closer to equal. Then press Done." },
        task: function (c, L, done) {
          var misses = 0, won = false;
          function bar() {
            var nodes = [h("button", { type: "button", class: "btn btn-primary t-lesson-go", on: { click: press } }, "Done")];
            if (misses >= 2) nodes.push(h("button", { type: "button", class: "btn btn-ghost", on: { click: show } }, "Show me"));
            L.controls(nodes);
          }
          function press() {
            if (won) return;
            if (c.w === 5) { win(); return; }
            misses++; L.sfx("oops"); LK.wiggle(c.pen.lift, L, "x", 5);
            L.say((BY_N[c.w * (HALF - c.w)] || R.n16).caption);
            bar();
          }
          function show() {   // slide it to 5 by 5 for them, a metre at a time
            if (won) return;
            won = true; L.clearBar(); disarm(c, L);
            var pr = { v: c.w };
            L.to(pr, { v: 5, duration: 0.25 * Math.abs(5 - c.w) + 0.2, ease: "none", onUpdate: function () {
              var w = Math.round(pr.v);
              L.set(c.knob.g, { x: pr.v * U });
              if (w !== c.w) { setPen(c, L, w); L.sfx("tick", w * 2); }
            }, onComplete: function () { setPen(c, L, 5); L.set(c.knob.g, { x: 5 * U }); celebrate(); } }, true);
          }
          function win() { won = true; L.clearBar(); disarm(c, L); celebrate(); }
          function celebrate() {
            L.to(c.knob.g, { opacity: 0, duration: 0.3 }, true);
            L.to(c.goat, { opacity: 0, duration: 0.2 }, true);   // the tiles cover its square
            var set = c.count = makeCells(c, c.gCells, 5, 5, U, 0, 0);
            countUp(c, L, set, function (i) { c.sign.set(i + 1, L); }, function () {
              c.sign.pop(L);
              L.say(R.best.caption, function () { done(25); });
            });
          }
          bar();
        } },
      { caption: "5 rows of 5. That is 25 squares of grass, and the fence is still 20 metres.",
        run: function (c, L) {
          if (c.count) {
            L.to(c.count.nums, { opacity: 0, duration: 0.35 });
            L.to(c.count.cells.slice(0, 5), { scale: 1.12, duration: 0.15, yoyo: true, repeat: 1, stagger: 0.1, delay: 0.4 });
            L.to([c.count.cells[0], c.count.cells[5], c.count.cells[10], c.count.cells[15], c.count.cells[20]], { scale: 1.12, duration: 0.15, yoyo: true, repeat: 1, stagger: 0.1, delay: 1.3 });
          }
          L.wait(1900, function () { L.board("5 × 5 = <b>25</b> squares &nbsp;·&nbsp; fence still <b>20 m</b>"); });
        } },

      /* ---- tell Ramesh uncle: the answer, then how you knew ---- */
      K.tellStep({ who: function (c) { return c.uncle; }, skill: "a1", qid: "pen-tell",
        caption: "Ramesh uncle is waiting. Tell him the most grass his fence can hold.",
        prompt: "Tell Ramesh uncle. Squares of grass:", answer: 25,
        wrong: [{ value: 20, mixup: "perim", caption: "20 is the fence, the distance round. Grass is the squares inside." }],
        other: R.tellOther,
        thanks: ["25 squares!", "Thank you!"], same: R.tellRightGuess, close: R.tellRightOther, plain: R.tellRight }),
      K.howStep({ who: function (c) { return c.uncle; }, skill: "a1", qid: "pen-how", leave: true,
        caption: "He has one more question. How did you know it was 25?",
        prompt: "Tell him how:", bubble: ["How did", "you know?"],
        choices: [
          { label: "Same fence always means same grass", value: "same", mixup: "perim",
            caption: "Not quite. The fence stayed 20 metres, but the grass changed from 9 squares up to 25. Off he goes to build his pen." },
          { label: "I counted the squares inside: 5 rows of 5", value: "count", correct: true,
            caption: "Exactly. Grass is the squares inside. Off he goes to build his pen." },
          { label: "I added the four sides", value: "sides", mixup: "perim",
            caption: "Adding the four sides gives the fence, 20 metres. The grass is the squares inside, 5 rows of 5. Off he goes to build his pen." },
        ] }),

      /* ---- the rule: plain rectangles ---- */
      { beat: "rule", caption: "Now leave the pen. Here are two plain rectangles. Go round the edge of each one: 20 metres, both times.",
        run: function (c, L) {
          var gone = [c.gPenIn, c.sign.g].concat(c.trees);
          L.board("");
          L.to(gone, { opacity: 0, duration: 0.4, onComplete: function () { gone.forEach(function (e) { e.style.display = "none"; }); } });
          c.gRule.style.display = ""; L.set(c.gRule, { opacity: 0 });
          L.to(c.gRule, { opacity: 1, duration: 0.4, delay: 0.4 });
          L.to([c.rA.g, c.rB.g], { opacity: 1, duration: 0.4, delay: 0.7, stagger: 0.25, onStart: function () { L.sfx("pop"); } });
          c.rA.outline.draw(L, 1.5, true);
          L.to(c.rA.per, { opacity: 1, y: 0, duration: 0.35, delay: 2.4, onStart: function () { L.sfx("pop"); } });
          c.rB.outline.draw(L, 3.0, true);
          L.to(c.rB.per, { opacity: 1, y: 0, duration: 0.35, delay: 3.9, onStart: function () { L.sfx("pop"); } });
        } },
      { caption: "But count the squares inside. One has 16. The other has 24.",
        run: function (c, L) {
          c.rA.outline.hide(L); c.rB.outline.hide(L);
          L.to(c.rA.g, { opacity: 0.45, duration: 0.3, repeat: 1, yoyo: true, delay: 0.5 });
          L.to(c.rA.area, { opacity: 1, y: 0, duration: 0.35, delay: 1.1, onStart: function () { L.sfx("pop"); } });
          L.to(c.rB.g, { opacity: 0.45, duration: 0.3, repeat: 1, yoyo: true, delay: 2.0 });
          L.to(c.rB.area, { opacity: 1, y: 0, duration: 0.35, delay: 2.6, onStart: function () { L.sfx("pop"); } });
        } },
      { caption: "So here is the rule. Perimeter is the distance round the edge. Area counts the squares inside: length × width.",
        run: function (c, L) {
          L.board('<span class="t-rule">area = length × width</span><span class="t-rule-note">8 × 2 = 16 &nbsp;·&nbsp; 6 × 4 = 24 &nbsp;·&nbsp; both are 20 m round</span>');
        } },

      /* ---- your turn ---- */
      { caption: "Your turn. A rectangle is 7 metres by 3 metres. What is its area?",
        hint: { caption: "Area counts the squares inside. How many rows, and how many in each row?" },
        run: function (c, L) {
          L.board("");
          L.to([c.rA.g, c.rB.g], { opacity: 0, duration: 0.4 });
          L.to(c.rC.g, { opacity: 1, duration: 0.4, delay: 0.5, onStart: function () { L.sfx("pop"); } });
        },
        task: function (c, L, done) {
          L.number("Area in square metres:", function (v) {
            if (v === 21) return true;
            var r = v === 20 ? R.q20 : v === 10 ? R.q10 : R.qOther;
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function () {
            var set = makeCells(c, c.gCellsC, 7, 3, RU, c.rC.x, c.rC.y + c.rC.h);
            countUp(c, L, set, null, function () { L.say(R.qRight.caption, function () { done(21); }); });
          });
        } },
      { caption: "Area is the squares inside. The distance round the edge is a different thing.", hold: 600,
        run: function (c, L) {
          L.board('<span class="t-rule">area = length × width</span><span class="t-rule-note">7 × 3 = 21 square metres</span>');
        } },
    ],
  });
})();
