/* One square metre of tiles: a hands-on story lesson: 1 m² is 10,000 cm² (100 rows of 100), not 100.
   Lakshmi aunty wants to cover one square metre of floor with 1 cm mosaic tiles. The student guesses, then:
     1. drags a marker along a ruler on the bottom edge: 1 m = 100 cm
     2. taps to lay the first row: 100 tiles zip along the bottom, and a magnifier shows a few of them enlarged
     3. drags a gold handle up: rows stack, the sign counts in hundreds, and the top is 100 rows × 100 = 10,000
   then tells Lakshmi aunty the answer and how they knew, and meets the rule on plain squares (m² to cm²: × 10,000).
   Built on Cogna.lesson + Cogna.story, with the floor drawn as a Cogna.landKit slab (load after anim/land-kit.js).
   Styles: css/lessons/tile-units.css. Every spoken line is a literal `caption:` so tools/record-narration.mjs finds it.
   Lessons are built off-screen, so every rotate/scale origin is a point (svgOrigin), never measured. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, K = C.story, LK = C.landKit;
  var add = LK.add, text = LK.text;
  var W = 800, H = 470;
  var S = 340, CM = S / 100;          // the floor is S units wide; one centimetre (one tile) is CM units
  var FX = 276, FY = 36;              // top-left corner of the floor on the stage
  var MX = 712, MY = 226, MR = 58;    // the magnifier: centre and radius

  /* reaction lines (spoken inside a task) */
  var R = {
    guessed: { caption: "Good. Hold on to that guess, and let's find out for sure." },
    noGuess: { caption: "That's fine. Let's find out together." },
    rulerDone: { caption: "100 centimetres. So 1 metre is 100 centimetres." },
    rowDone: { caption: "100 tiles, and that is only one thin row. Look how small each tile is." },
    keepGoing: { caption: "Keep going, right to the top. The whole floor needs tiles." },
    fullDone: { caption: "The floor is full! 10,000 tiles." },
    tellOther: { caption: "Look at the floor. 100 rows, with 100 tiles in each row." },
    tellRight: { caption: "She says thank you! Now she knows exactly how many tiles to buy." },
    tellRightGuess: { caption: "She says thank you! And 10,000 was your guess at the start. Spot on." },
    tellRightOther: { caption: "She says thank you! It is a lot more than it first looks, and now you know for sure." },
    n300: { caption: "That multiplied by 100. Each square metre is 100 rows of 100, so multiply by 10,000." },
    n3000: { caption: "One more zero. It is 3 × 10,000." },
    n10000: { caption: "That is one square metre. This floor has 3 of them." },
    nOther: { caption: "Each square metre is 10,000 square centimetres. This floor has 3 of them." },
    nRight: { caption: "30,000! You've got it." },
  };

  function fmt(n) { n = Math.round(n); return n >= 1000 ? Math.floor(n / 1000) + "," + ("00" + (n % 1000)).slice(-3) : String(n); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ghostBtn(label, fn) { return h("button", { type: "button", class: "btn btn-ghost", on: { click: fn } }, label); }

  /* ---------- the TILES sign (top right) ---------- */
  function makeSign(c, parent, L) {
    var cx = W - 89, s = add(parent, "g", { "class": "t-pf-sign" });
    add(s, "rect", { x: W - 162, y: 22, width: 146, height: 86, rx: 16, "class": "t-pf-signshadow", filter: "url(#" + c.blurId + ")" });
    add(s, "rect", { x: W - 164, y: 16, width: 150, height: 86, rx: 16, "class": "t-pf-signbox" });
    text(s, "TILES", cx, 42, "t-pf-signlab");
    var val = text(s, "?", cx, 75, "t-pf-signval");
    L.set(s, { svgOrigin: cx + " 59" });
    return {
      g: s,
      /** bump: the number hops in (for single changes, not for every frame of a count) */
      set: function (v, bump) {
        val.textContent = v == null ? "?" : fmt(v);
        if (bump && !L.reduced) { L.set(val, { y: 7, opacity: 0.3 }); L.to(val, { y: 0, opacity: 1, duration: 0.2, ease: "power2.out", overwrite: "auto" }, true); }
      },
      pop: function () { L.to(s, { keyframes: [{ scale: 1.12, duration: 0.12, ease: "power2.out" }, { scale: 1, duration: 0.34, ease: "back.out(3)" }], overwrite: "auto" }, true); },
    };
  }

  /* ---------- the magnifier ---------- */
  /** n < 0: one tile on its own · n >= 0: that many rows of tiles (up to 5), from the bottom */
  function magState(c, n) {
    c.magOne.style.display = n < 0 ? "" : "none";
    c.magRows.forEach(function (g, k) { g.style.display = k < n ? "" : "none"; });
  }
  function magIn(c, L, delay) {
    L.to(c.magIn, { scale: 1, duration: 0.45, delay: delay || 0, ease: "back.out(2.4)", overwrite: "auto", onStart: function () { L.sfx("pop"); } }, true);
  }

  /* ---------- the tiled part of the floor ---------- */
  function setRows(c, r) {
    c.rows = r;
    var hgt = r * CM, y = S - hgt;
    c.tiles.setAttribute("y", y.toFixed(1)); c.tiles.setAttribute("height", hgt.toFixed(1));
    c.topLine.setAttribute("y1", y.toFixed(1)); c.topLine.setAttribute("y2", y.toFixed(1));
    c.sign.set(r * 100);
    magState(c, Math.min(5, r));
  }
  function rowsBoard(r) { return "<b>" + r + "</b> " + (r === 1 ? "row" : "rows") + " × 100 = <b>" + fmt(r * 100) + "</b> tiles"; }

  /** a bracket with end stops: along the bottom (from x0 to x1 at height y) or up the side (from y0 to y1 at x) */
  function hBracket(x0, x1, y) { return "M" + x0 + " " + (y - 9) + "V" + (y + 9) + "M" + x0 + " " + y + "H" + x1 + "M" + x1 + " " + (y - 9) + "V" + (y + 9); }
  function vBracket(x, y0, y1) { return "M" + (x - 9) + " " + y1 + "H" + (x + 9) + "M" + x + " " + y1 + "V" + y0 + "M" + (x - 9) + " " + y0 + "H" + (x + 9); }
  /** a label that reads up the side (turned a quarter turn about its own middle) */
  function sideText(parent, str, x, y, cls) {
    var g = add(parent, "g", { transform: "translate(" + x + " " + y + ") rotate(-90)" });
    return text(g, str, 0, 0, cls);
  }
  /** swap what one or more labels say, with a quick fade */
  function relabel(L, els, str, delay) {
    L.to(els, { opacity: 0, duration: 0.2, delay: delay || 0, onComplete: function () {
      els.forEach(function (e) { e.textContent = str; });
      L.to(els, { opacity: 1, duration: 0.3 }, true);
    } });
  }

  C.lesson.define({
    id: "tile-units", title: "One square metre of tiles", cls: "t-pf t-tile", w: W, h: H, durationMs: 180000,
    presenter: { x: 700, y: 360, h: 106 },   // Maji tells the lesson from the bottom right corner

    build: function (svg, L) {
      var c = LK.setup(svg, L), i, j, k;
      K.scene(svg, L, { kind: "room", w: W, h: H, before: c.world });   // indoors: the floor she is tiling
      c.rows = 0;
      c.patId = "tile-pat-" + c.key; c.clipId = "tile-mag-" + c.key;
      // the tiles: a 2 × 2 patch of mosaic that repeats (one tile = CM)
      var pat = add(c.defs, "pattern", { id: c.patId, width: 2 * CM, height: 2 * CM, patternUnits: "userSpaceOnUse" });
      add(pat, "rect", { width: 2 * CM, height: 2 * CM, "class": "t-tile-grout" });
      for (i = 0; i < 2; i++) for (j = 0; j < 2; j++)
        add(pat, "rect", { x: j * CM + 0.3, y: i * CM + 0.3, width: CM - 0.6, height: CM - 0.6, "class": (i + j) % 2 ? "t-tile-b" : "t-tile-a" });
      add(add(c.defs, "clipPath", { id: c.clipId }), "circle", { cx: MX, cy: MY, r: MR - 2 });

      c.gSign = add(c.world, "g");
      c.sign = makeSign(c, c.gSign, L);

      // Lakshmi aunty waits off to the left until the story brings her on (drawn under the floor and its helpers)
      c.aunty = K.person(c.world, L, { x: 74, y: 420, look: "aunty" });

      c.gStory = add(c.world, "g");

      /* the floor: one square metre, bare to begin with */
      c.gFloor = add(c.gStory, "g", { transform: "translate(" + FX + " " + FY + ")" });
      c.gFloorIn = add(c.gFloor, "g");   // animated inside the placed group, so GSAP never fights the placement
      c.floor = LK.field(c, c.gFloorIn, [[0, 1], [1, 1], [1, 0], [0, 0]], S);
      c.tiles = add(c.floor.inner, "rect", { x: 0, y: S - CM, width: 0, height: CM, fill: "url(#" + c.patId + ")" });
      c.topLine = add(c.gFloorIn, "line", { x1: 0, y1: S - CM, x2: S, y2: S - CM, "class": "t-tile-top t-pf-fx" });
      c.outline = LK.outline(c.gFloorIn, [[0, 0], [1, 0], [1, 1], [0, 1]], S);
      c.seam = LK.seam(c, c.gFloorIn);

      // measurements: 1 m along the bottom, 1 m up the side
      c.gMarks = add(c.gFloorIn, "g", { "class": "t-pf-marks" });
      c.gBottom = add(c.gMarks, "g");
      add(c.gBottom, "path", { d: hBracket(0, S, S + 28), "class": "t-pf-bracket" });
      c.lBottom = text(c.gBottom, "1 m", S / 2, S + 54, "t-pf-dim");
      add(c.gMarks, "path", { d: vBracket(-24, 0, S), "class": "t-pf-bracket" });
      c.lLeft = sideText(c.gMarks, "1 m", -52, S / 2, "t-pf-dim");

      // the ruler lies on the floor along its bottom edge; a gold bar shows how far the marker has gone
      c.gRuler = add(c.gFloorIn, "g", { "class": "t-pf-fx" });
      add(c.gRuler, "rect", { x: -8, y: S - 36, width: S + 16, height: 30, rx: 4, "class": "t-tile-ruler" });
      var ticks = "";
      for (i = 0; i <= 100; i++) ticks += "M" + (i * CM).toFixed(1) + " " + (S - 36) + "v" + (i % 10 === 0 ? 12 : (i % 5 === 0 ? 8 : 5));
      add(c.gRuler, "path", { d: ticks, "class": "t-tile-ticks" });
      for (i = 0; i <= 100; i += 20) text(c.gRuler, String(i), i * CM, S - 15, "t-tile-rulernum");
      c.meas = add(c.gRuler, "rect", { x: 0, y: S - 42, width: 0, height: 6, rx: 3, "class": "t-tile-meas" });

      // the marker: a stem across the ruler, a label that counts centimetres, and a gold knob to hold below the floor
      c.marker = add(c.gFloorIn, "g");
      add(c.marker, "line", { x1: 0, y1: S - 50, x2: 0, y2: S + 18, "class": "t-tile-stem t-pf-fx" });
      c.mTag = LK.tag(c.marker, "100 cm"); c.mTag.put(0, S - 74); c.mTag.init(L); c.mTag.text("0 cm");
      c.mKnob = LK.knob(c, c.marker, "slide");
      c.mKnob.g.setAttribute("transform", "translate(0 " + (S + 36) + ")");

      // the gold handle that stacks the rows (its arrows point up and down)
      c.sKnob = LK.knob(c, c.gFloorIn, "slide");
      L.set(c.sKnob.body, { rotation: 90, svgOrigin: "0 0" });

      /* the magnifier (right of the floor): a few tiles, enlarged so they can be seen as squares */
      c.mag = add(c.gStory, "g", { "class": "t-tile-mag" });
      c.magLink = add(c.mag, "g");
      add(c.magLink, "line", { x1: FX + S - 5, y1: FY + S - 11, x2: MX - MR * 0.59, y2: MY + MR * 0.81, "class": "t-tile-maglink" });
      add(c.magLink, "circle", { cx: FX + S - 10, cy: FY + S - 4, r: 8, "class": "t-tile-maglens" });
      c.magIn = add(c.mag, "g");
      add(c.magIn, "circle", { cx: MX, cy: MY, r: MR, "class": "t-tile-magbg" });
      var inside = add(c.magIn, "g", { "clip-path": "url(#" + c.clipId + ")" });
      c.magRows = [];
      for (k = 0; k < 5; k++) {
        var rowG = add(inside, "g"), top = MY + 36 - 24 * k;
        add(rowG, "rect", { x: MX - 62, y: top - 1, width: 124, height: 24, "class": "t-tile-grout" });
        for (j = 0; j < 5; j++) add(rowG, "rect", { x: MX - 59 + 24 * j, y: top, width: 22, height: 22, rx: 2, "class": (j + k) % 2 ? "t-tile-b" : "t-tile-a" });
        c.magRows.push(rowG);
      }
      c.magOne = add(inside, "rect", { x: MX - 14, y: MY - 14, width: 28, height: 28, rx: 3, "class": "t-tile-a" });
      add(c.magIn, "circle", { cx: MX, cy: MY, r: MR, "class": "t-tile-magrim" });
      c.magLab = text(c.magIn, "1 cm × 1 cm", MX, MY + MR + 22, "t-tile-maglab");
      magState(c, -1);

      // everything waits for its moment
      L.set([c.gFloorIn, c.gMarks, c.gRuler, c.topLine, c.magLink], { opacity: 0 });
      L.set(c.marker, { x: 0, opacity: 0 }); c.marker.style.display = "none";
      L.set(c.sKnob.g, { x: S / 2, y: S - CM }); c.sKnob.g.style.display = "none";
      L.set(c.magIn, { scale: 0, svgOrigin: MX + " " + MY });

      /* the rule: plain squares, off the floor */
      var RX = 120, RY = 110, RS = 220;
      c.gRule = add(c.world, "g"); c.gRule.style.display = "none";
      c.gR1 = add(c.gRule, "g");
      add(c.gR1, "rect", { x: RX, y: RY, width: RS, height: RS, rx: 3, "class": "t-tile-plain" });
      c.rIn = text(c.gR1, "1 m²", RX + RS / 2, RY + RS / 2, "t-pf-dim");
      add(c.gR1, "path", { d: hBracket(RX, RX + RS, RY + RS + 18), "class": "t-pf-bracket" });
      c.rBot = text(c.gR1, "1 m", RX + RS / 2, RY + RS + 44, "t-pf-dim");
      add(c.gR1, "path", { d: vBracket(RX - 24, RY, RY + RS), "class": "t-pf-bracket" });
      c.rLeft = sideText(c.gR1, "1 m", RX - 52, RY + RS / 2, "t-pf-dim");
      c.fact1 = text(c.gR1, "1 m² = 100 cm × 100 cm", 560, 190, "t-pf-lab");
      c.fact2 = text(c.gR1, "= 10,000 cm²", 560, 238, "t-tile-big");
      L.set(c.fact1, { opacity: 0 });
      L.set(c.fact2, { opacity: 0, scale: 0.6, svgOrigin: "560 238" });

      c.gR3 = add(c.gRule, "g"); c.gR3.style.display = "none";
      c.r3 = [];
      for (i = 0; i < 3; i++) {
        var x3 = 110 + i * 156, g3 = add(c.gR3, "g");
        add(g3, "rect", { x: x3, y: 120, width: 140, height: 140, rx: 3, "class": "t-tile-plain" });
        var t3 = text(g3, "1 m²", x3 + 70, 190, "t-pf-lab");
        L.set(g3, { scale: 0.4, opacity: 0, svgOrigin: (x3 + 70) + " 190" });
        c.r3.push({ g: g3, t: t3 });
      }
      c.r3lab = text(c.gR3, "3 m² = ? cm²", 336, 300, "t-pf-dim");
      L.set(c.r3lab, { opacity: 0 });
      return c;
    },

    steps: [
      /* ---- 1. the story: someone needs help ---- */
      { beat: "story", caption: "This is Lakshmi aunty. She wants to cover one square metre of floor with tiny mosaic tiles.",
        run: function (c, L) {
          K.enter(c.aunty, L);
          LK.dropIn(c.floor, c.gFloorIn, L, 1.2);
          L.to(c.gMarks, { opacity: 1, duration: 0.4, delay: 2.2 });
        } },
      { caption: "Each tile is 1 centimetre by 1 centimetre, and the shop sells them one by one. How many should she buy?",
        run: function (c, L) { K.puzzled(c.aunty, L, true); magIn(c, L, 0.4); } },

      /* ---- 2. a guess before anything is taught: nothing is marked right or wrong here ---- */
      K.guessStep({ caption: "Before we help her, have a guess. How many 1 centimetre tiles cover 1 square metre?",
        prompt: "How many 1 cm tiles cover 1 square metre?",
        choices: [{ label: "100", value: 100 }, { label: "1000", value: 1000 }, { label: "10,000", value: 10000 }, { label: "No idea yet", value: 0 }],
        guessed: R.guessed, none: R.noGuess }),

      /* ---- 3a. measure one edge: 1 m = 100 cm ---- */
      { beat: "hands", caption: "Let's measure one edge first. Drag the gold marker along the ruler, all the way to the end.",
        hint: { caption: "Hold the gold marker under the ruler and drag it right, to the very end." },
        run: function (c, L) {
          K.puzzled(c.aunty, L, false);
          L.to(c.magIn, { scale: 0, duration: 0.25, ease: "power2.in", overwrite: "auto" });
          L.to(c.gBottom, { opacity: 0, duration: 0.25 });
          L.set(c.gRuler, { y: 14 });
          L.wait(300, function () { L.sfx("whoosh"); });
          L.to(c.gRuler, { opacity: 1, y: 0, duration: 0.5, delay: 0.3, ease: "power2.out" });
          c.marker.style.display = "";
          L.to(c.marker, { opacity: 1, duration: 0.3, delay: 0.7 });
          c.mKnob.show(L, 0.8); c.mTag.show(L, 0.9);
        },
        task: function (c, L, done) {
          var over = false, cm = 0, tickAt = 0, svg = L.svg, hit = c.mKnob.hit, d = null;
          svg.classList.add("is-dragging-ok");   // on a touch screen, a drag here must not scroll the page
          c.mKnob.live(true);
          hit.setAttribute("role", "slider"); hit.setAttribute("aria-valuemin", 0); hit.setAttribute("aria-valuemax", 100);
          hit.setAttribute("aria-label", "Marker on the ruler, in centimetres. Use the left and right arrow keys.");
          function show(v) {
            cm = v;
            c.mTag.text(v + " cm"); c.meas.setAttribute("width", (v * CM).toFixed(1)); hit.setAttribute("aria-valuenow", v);
            var s = Math.floor(v / 10); if (s !== tickAt) { tickAt = s; L.sfx("tick", s); }   // a tick every 10 cm
          }
          function finish() {
            if (over) return; over = true;
            if (d) d.disable();
            L.clearBar(); svg.classList.remove("is-dragging-ok");
            c.mKnob.live(false); c.mKnob.held(L, false);
            L.to(c.marker, { x: S, duration: 0.15, ease: "power3.out", overwrite: "auto" }, true);
            show(100);
            L.sfx("snap"); c.seam.flash(L, [0, S - 39], [S, S - 39]);
            L.board("1 m = <b>100 cm</b>");
            L.say(R.rulerDone.caption, function () { done(100); });
          }
          d = L.draggable(c.marker, {
            type: "x", bounds: { minX: 0, maxX: S },
            onPress: function () { if (over) return; L.sfx("pickup"); c.mKnob.held(L, true); },
            onDrag: function () { if (over) return; var v = clamp(Math.round(this.x / CM), 0, 100); show(v); if (v >= 100) finish(); },
            onRelease: function () { if (over) return; c.mKnob.held(L, false); if (cm >= 97) finish(); },
          });
          L.listen(hit, "keydown", function (ev) {
            if (over || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
            ev.preventDefault();
            var v = clamp(cm + (ev.key === "ArrowLeft" ? -5 : 5), 0, 100);
            L.set(c.marker, { x: v * CM }); if (d) d.update();
            show(v); if (v >= 100) finish();
          });
          function auto() {
            if (over) return;
            if (d) d.disable(); L.clearBar();
            var n = { v: cm };
            L.to(n, { v: 100, duration: 1.4, ease: "power2.inOut", onUpdate: function () { L.set(c.marker, { x: n.v * CM }); show(Math.round(n.v)); }, onComplete: finish }, true);
          }
          L.wait(28000, function () { if (!over) L.controls([ghostBtn("Slide it for me", auto)]); });
        } },

      /* ---- 3b. lay the first row: 100 tiles ---- */
      { caption: "So each edge is 100 centimetres long. Now tap the button to lay the first row of tiles.",
        hint: { caption: "Tap the button that says lay the first row." },
        run: function (c, L) {
          L.to([c.gRuler, c.marker], { opacity: 0, duration: 0.35, onComplete: function () { c.marker.style.display = "none"; } });
          c.lBottom.textContent = "100 cm";
          L.to(c.gBottom, { opacity: 1, duration: 0.4, delay: 0.4 });
          relabel(L, [c.lLeft], "100 cm", 0.4);
        },
        task: function (c, L, done) {
          L.button("Lay the first row", function () {
            var n = { v: 0 }, last = 0;
            L.sfx("whoosh"); c.sign.set(0, true);
            L.to(n, { v: 100, duration: 2.6, ease: "power1.inOut", onUpdate: function () {
              var v = Math.round(n.v);
              c.tiles.setAttribute("width", (n.v * CM).toFixed(1));
              if (v !== last) { last = v; c.sign.set(v); if (v % 5 === 0) L.sfx("tick", v / 5); }
            }, onComplete: function () {
              c.tiles.setAttribute("width", S); c.rows = 1;
              c.sign.set(100, true); c.sign.pop(); L.sfx("snap");
              // the magnifier comes back, now looking at the row
              magState(c, 1); c.magLab.textContent = "close up";
              L.to(c.magLink, { opacity: 1, duration: 0.3 }, true); magIn(c, L, 0.1);
              L.board("1 row = <b>100</b> tiles");
              L.say(R.rowDone.caption, function () { done(100); });
            } }, true);
          });
        } },

      /* ---- 3c. stack the rows: 100 rows of 100 ---- */
      { caption: "That is just one row. Drag the gold handle up to stack more rows, all the way to the top of the floor.",
        hint: { caption: "Hold the gold handle on the row of tiles and drag it up, right to the top edge." },
        run: function (c, L) {
          c.sKnob.g.style.display = "";
          L.to(c.topLine, { opacity: 1, duration: 0.3 });
          c.sKnob.show(L, 0.3);
          L.wait(700, function () { L.boardLive(rowsBoard(1)); });
        },
        task: function (c, L, done) {
          var over = false, nudged = false, tickAt = 0, svg = L.svg, g = c.sKnob.g, hit = c.sKnob.hit, d = null;
          svg.classList.add("is-dragging-ok");
          c.sKnob.live(true);
          hit.setAttribute("role", "slider"); hit.setAttribute("aria-valuemin", 1); hit.setAttribute("aria-valuemax", 100);
          hit.setAttribute("aria-label", "Rows of tiles. Use the up and down arrow keys.");
          function show(r) {
            setRows(c, r); L.boardLive(rowsBoard(r)); hit.setAttribute("aria-valuenow", r);
            var s = Math.floor(r / 5); if (s !== tickAt) { tickAt = s; L.sfx("tick", s); }   // a tick every 5 rows
          }
          function finish() {
            if (over) return; over = true;
            if (d) d.disable();
            L.clearBar(); svg.classList.remove("is-dragging-ok");
            c.sKnob.live(false); c.sKnob.held(L, false);
            L.to(g, { y: 0, duration: 0.12, ease: "power3.out", overwrite: "auto" }, true);
            setRows(c, 100);
            L.to([g, c.topLine], { opacity: 0, duration: 0.3, delay: 0.15, onComplete: function () { g.style.display = "none"; } }, true);
            c.outline.draw(L, 0.1);
            L.sfx("chime"); c.sign.set(10000, true); c.sign.pop(); LK.shake(c, L, 2);
            L.board("100 rows × 100 = <b>10,000</b> tiles");
            L.say(R.fullDone.caption, function () { done(10000); });
          }
          d = L.draggable(g, {
            type: "y", bounds: { minY: 0, maxY: S - CM },
            onPress: function () { if (over) return; L.sfx("pickup"); c.sKnob.held(L, true); },
            onDrag: function () { if (over) return; var r = clamp(Math.round((S - this.y) / CM), 1, 100); show(r); if (r >= 100) finish(); },
            onRelease: function () {
              if (over) return;
              c.sKnob.held(L, false);
              if (c.rows >= 97) { finish(); return; }
              c.sign.pop();
              if (!nudged && c.rows > 1) { nudged = true; L.say(R.keepGoing.caption); }
            },
          });
          L.listen(hit, "keydown", function (ev) {
            if (over || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")) return;
            ev.preventDefault();
            var r = clamp((c.rows === 1 && ev.key === "ArrowUp" ? 0 : c.rows) + (ev.key === "ArrowUp" ? 5 : -5), 1, 100);
            L.set(g, { y: S - r * CM }); if (d) d.update();
            show(r); if (r >= 100) finish();
          });
          function auto() {
            if (over) return;
            if (d) d.disable(); L.clearBar();
            var n = { v: c.rows };
            L.to(n, { v: 100, duration: 2.2, ease: "power1.inOut", onUpdate: function () { var r = clamp(Math.round(n.v), 1, 100); L.set(g, { y: S - r * CM }); show(r); }, onComplete: finish }, true);
          }
          L.wait(30000, function () { if (!over) L.controls([ghostBtn("Stack them for me", auto)]); });
        } },
      { caption: "100 rows, and 100 tiles in every row. 100 × 100 is 10,000 tiles.",
        run: function (c, L) {
          L.to(c.magIn, { scale: 0, duration: 0.25, ease: "power2.in", overwrite: "auto" });
          L.to(c.magLink, { opacity: 0, duration: 0.25 });
          L.to(c.gBottom, { opacity: 0.25, duration: 0.3, repeat: 3, yoyo: true, delay: 0.4, ease: "sine.inOut" });
          L.to(c.lLeft, { opacity: 0.25, duration: 0.3, repeat: 3, yoyo: true, delay: 1.8, ease: "sine.inOut" });
          L.wait(3000, function () { L.sfx("pop"); c.sign.pop(); L.board("100 × 100 = <b>10,000</b> tiles"); });
        } },

      /* ---- 4. tell Lakshmi aunty: the answer, then how you knew ---- */
      K.tellStep({ who: function (c) { return c.aunty; }, skill: "a6", qid: "tile-tell",
        caption: "Lakshmi aunty is waiting. Tell her how many tiles to buy.",
        prompt: "Tell Lakshmi aunty. Tiles to buy:", answer: 10000,
        wrong: [
          { value: 100, mixup: "units", caption: "100 is how many fit along ONE edge. There are 100 rows of 100." },
          { value: 1000, caption: "1,000 is only 10 rows. The floor has 100 rows." },
          { value: 400, mixup: "perim", caption: "400 is the distance round the edge in centimetres." },
        ],
        other: R.tellOther,
        thanks: ["10,000 tiles!", "Thank you!"], same: R.tellRightGuess, close: R.tellRightOther, plain: R.tellRight }),
      K.howStep({ who: function (c) { return c.aunty; }, skill: "a6", qid: "tile-how", leave: true,
        caption: "She has one more question. How did you know it was so many?",
        prompt: "Tell her how:", bubble: ["How did", "you know?"],
        choices: [
          { label: "1 metre is 100 cm, so it is 100", value: "units", mixup: "units",
            caption: "100 is only one edge. Every one of the 100 rows has 100 tiles, so it is 10,000. Off she goes to the tile shop." },
          { label: "100 rows of 100 tiles", value: "rows", correct: true,
            caption: "Exactly. 100 rows of 100 makes 10,000. Off she goes to the tile shop." },
          { label: "I added the four sides", value: "perim", mixup: "perim",
            caption: "Adding the sides gives the distance round the edge, not the tiles inside. It is 100 rows of 100. Off she goes to the tile shop." },
        ] }),

      /* ---- 5. the rule, on a plain square ---- */
      { beat: "rule", caption: "Now forget the tiles. Here is any square that is 1 metre along each side. Its area is 1 square metre.",
        run: function (c, L) {
          L.board("");
          L.to([c.gStory, c.gSign], { opacity: 0, duration: 0.4, onComplete: function () { c.gStory.style.display = "none"; c.gSign.style.display = "none"; } });
          c.gRule.style.display = "";
          L.set(c.gR1, { opacity: 0 });
          L.wait(450, function () { L.sfx("pop"); });
          L.to(c.gR1, { opacity: 1, duration: 0.5, delay: 0.45 });
        } },
      { caption: "1 metre is 100 centimetres. So the square is 100 centimetres by 100 centimetres, and that is 10,000 square centimetres.",
        run: function (c, L) {
          relabel(L, [c.rBot, c.rLeft], "100 cm", 0.3);
          L.to(c.fact1, { opacity: 1, duration: 0.4, delay: 1.6 });
          L.to(c.fact2, { opacity: 1, scale: 1, duration: 0.45, delay: 3.4, ease: "back.out(2.6)", onStart: function () { L.sfx("pop"); c.rIn.textContent = "10,000 cm²"; } });
        } },
      { caption: "So to change square metres into square centimetres, multiply by 10,000. Not by 100.",
        run: function (c, L) {
          L.wait(600, function () {
            L.sfx("sparkle");
            L.board('<span class="t-rule">m² to cm²: × 10,000</span><span class="t-rule-note">1 m² = 100 cm × 100 cm = 10,000 cm²</span>');
          });
        } },

      /* ---- 6. your turn ---- */
      { caption: "Your turn. A floor is 3 square metres. How many square centimetres is that?",
        hint: { caption: "Each square metre is 10,000 square centimetres. So multiply 3 by 10,000." },
        run: function (c, L) {
          L.board("");
          L.to(c.gR1, { opacity: 0, duration: 0.35, onComplete: function () { c.gR1.style.display = "none"; } });
          c.gR3.style.display = "";
          c.r3.forEach(function (s, i) {
            L.to(s.g, { scale: 1, opacity: 1, duration: 0.4, delay: 0.5 + i * 0.25, ease: "back.out(2.4)", onStart: function () { L.sfx("pop"); } });
          });
          L.to(c.r3lab, { opacity: 1, duration: 0.4, delay: 1.4 });
        },
        task: function (c, L, done) {
          L.number("3 m² in cm²:", function (v) {
            if (v === 30000) return true;
            var r = v === 300 ? R.n300 : v === 3000 ? R.n3000 : v === 10000 ? R.n10000 : R.nOther;
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function () {
            c.r3.forEach(function (s, i) {
              L.wait(i * 380, function () {
                s.t.setAttribute("class", "t-tile-small"); s.t.textContent = "10,000 cm²";
                L.sfx("tick", i * 4);
                L.to(s.g, { keyframes: [{ scale: 1.08, duration: 0.12, ease: "power2.out" }, { scale: 1, duration: 0.3, ease: "back.out(3)" }] }, true);
              });
            });
            L.wait(3 * 380 + 150, function () {
              c.r3lab.textContent = "3 × 10,000 = 30,000 cm²";
              L.sfx("chime");
              L.say(R.nRight.caption, function () { done(30000); });
            });
          });
        } },
      { caption: "Remember: 1 square metre is 100 rows of 100. That is 10,000 square centimetres.", hold: 600,
        run: function (c, L) {
          L.board('<span class="t-rule">1 m² = 10,000 cm²</span><span class="t-rule-note">3 m² = 3 × 10,000 = 30,000 cm²</span>');
        } },
    ],
  });
})();
