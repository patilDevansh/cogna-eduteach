/* Lakshmi aunty's courtyard — a story lesson: an awkward shape is found by splitting it into shapes you know,
   finding each one, and adding (skill a5).
     story   Lakshmi aunty is tiling her L-shaped courtyard; no single length × width fits it
     guess   how many square metres?
     hands   tap one of two gold lines to cut the L into two rectangles, find each piece, put them back and add;
             then the other cut is shown to give the same total
     tell    tell her the answer (33) and how you knew; she leaves
     rule    a plain "house" shape (rectangle + triangle): split, find each, add; one question alone (30)
   The courtyard is 8 wide and 6 tall with a 5 by 3 corner missing from the bottom right:
     cut across: 8 × 3 = 24 and 3 × 3 = 9      cut down: 3 × 6 = 18 and 5 × 3 = 15      both 33
     whole block 8 × 6 = 48 (mix-up)            distance round 8 + 3 + 5 + 3 + 3 + 6 = 28 (mix-up)
   Built on Cogna.lesson + Cogna.story + Cogna.landKit. The courtyard is paved stone on a slab (its own drawing, because
   the land kit's slab only works for shapes without a notch). Every spoken line is a literal `caption:`.
   Lessons are built off-screen, so every rotate/scale origin is a point (svgOrigin), never measured. */
(function () {
  "use strict";
  var C = window.Cogna, h = C.h, K = C.story, LK = C.landKit;
  var add = LK.add, text = LK.text;
  var W = 800, H = 470, U = 44;          // one square of courtyard = U units = 1 square metre
  var OX = 262, OY = 116;                // top left corner of the courtyard on the stage
  var DEPTH = [4, 10];                   // how far the slab shows under the stone
  var HU = 40, HX = 280, HY = 100;       // the house shape: square size and top left corner
  var LSHAPE = [[0, 0], [8, 0], [8, 3], [3, 3], [3, 6], [0, 6]];
  var HOUSE = [[0, 2], [3, 0], [6, 2], [6, 6], [0, 6]];
  var uid = 0;

  /* reaction lines (spoken inside a task) */
  var R = {
    guessed: { caption: "Good. Hold on to that guess, and let's find out for sure." },
    noGuess: { caption: "That's fine. Let's find out together." },
    cutH: { caption: "Cut! Now it is two shapes you know: a long rectangle on top and a square below." },
    cutV: { caption: "Cut! Now it is two shapes you know: a tall rectangle on the left and a long one on the right." },
    hA: { caption: "This piece is 8 metres long and 3 metres wide. Multiply them." },
    hB: { caption: "This piece is 3 metres long and 3 metres wide. Multiply them." },
    vA: { caption: "This piece is 3 metres wide and 6 metres tall. Multiply them." },
    vB: { caption: "This piece is 5 metres long and 3 metres wide. Multiply them." },
    t48: { caption: "48 is the whole 8 by 6 block. One corner is missing." },
    t28: { caption: "28 is the distance round the edge. Tiles cover the inside." },
    tOther: { caption: "Add the two pieces you found." },
    tellRight: { caption: "She says thank you! Now she knows exactly how many tiles to buy." },
    tellRightGuess: { caption: "She says thank you! And 33 was your guess at the start. Spot on." },
    tellRightOther: { caption: "She says thank you! Your first guess was a start, and now you know for sure." },
    r36: { caption: "You used 6 × 2 = 12 for the triangle. A triangle is half of that." },
    r24: { caption: "That is only the rectangle. Add the triangle on top." },
    rOther: { caption: "The rectangle is 6 × 4. The triangle is half of 6 × 2. Then add them." },
    rRight: { caption: "30! 24 for the rectangle and 6 for the triangle." },
  };

  /* the two ways to cut. a = the piece asked about first, b = the second. dims: [label, x, y] in courtyard units.
     slide: how far the piece moves when the courtyard comes apart. line: the cut, from the outer edge to the inner corner. */
  var CUTS = {
    h: { line: [[0, 3 * U], [3 * U, 3 * U]], sum: "24 + 9 = <b>33</b>",
      a: { P: [[0, 0], [8, 0], [8, 3], [0, 3]], area: 24, slide: [0, -8], say: "hA", work: "8 × 3 = <b>24</b>",
        prompt: "Area of the top piece, in square metres:", dims: [["8 m", 4 * U, -24], ["3 m", 8 * U + 30, 1.5 * U]] },
      b: { P: [[0, 3], [3, 3], [3, 6], [0, 6]], area: 9, slide: [0, 12], say: "hB", work: "3 × 3 = <b>9</b>",
        prompt: "Area of the square piece, in square metres:", dims: [["3 m", 1.5 * U, 6 * U + 32], ["3 m", 3 * U + 36, 4.5 * U]] } },
    v: { line: [[3 * U, 0], [3 * U, 3 * U]], sum: "18 + 15 = <b>33</b>",
      a: { P: [[0, 0], [3, 0], [3, 6], [0, 6]], area: 18, slide: [-12, 0], say: "vA", work: "3 × 6 = <b>18</b>",
        prompt: "Area of the left piece, in square metres:", dims: [["3 m", 1.5 * U, -24], ["6 m", -30, 3 * U]] },
      b: { P: [[3, 0], [8, 0], [8, 3], [3, 3]], area: 15, slide: [12, 0], say: "vB", work: "5 × 3 = <b>15</b>",
        prompt: "Area of the right piece, in square metres:", dims: [["5 m", 5.5 * U, -24], ["3 m", 8 * U + 30, 1.5 * U]] } },
  };

  /* ---------- drawing ---------- */
  function pts(P, u, dx, dy) {
    return P.map(function (p) { return (p[0] * u + (dx || 0)).toFixed(1) + "," + (p[1] * u + (dy || 0)).toFixed(1); }).join(" ");
  }
  /** A paved piece of shape P (squares): a soft shadow, a slab underneath, stone on top with tile joints.
      Same parts as a land-kit field (g, lift, shadow, centre), so liftUp / setDown / hop work on it. */
  function paved(c, parent, P, cls) {
    var id = "ct-clip-" + (++uid) + "-" + c.key, i;
    var g = add(parent, "g", { "class": "t-ct-piece " + (cls || "") });
    var shadow = add(g, "polygon", { points: pts(P, U), "class": "t-pf-shadow", filter: "url(#" + c.blurId + ")" });
    var lift = add(g, "g");
    var base = add(lift, "g", { "class": "t-ct-base" });   // the shape swept down and to the right, edge by edge
    add(base, "polygon", { points: pts(P, U, DEPTH[0], DEPTH[1]) });
    for (i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length];
      add(base, "polygon", { points: [
        [a[0] * U, a[1] * U], [b[0] * U, b[1] * U], [b[0] * U + DEPTH[0], b[1] * U + DEPTH[1]], [a[0] * U + DEPTH[0], a[1] * U + DEPTH[1]],
      ].map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") });
    }
    add(add(c.defs, "clipPath", { id: id }), "polygon", { points: pts(P, U) });
    var inner = add(lift, "g", { "clip-path": "url(#" + id + ")" });
    add(inner, "polygon", { points: pts(P, U), "class": "t-ct-stone" });
    var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), d = "";
    for (i = x0; i <= x1; i++) d += "M" + i * U + " " + y0 * U + "V" + y1 * U;
    for (i = y0; i <= y1; i++) d += "M" + x0 * U + " " + i * U + "H" + x1 * U;
    add(inner, "path", { d: d, "class": "t-ct-joint" });
    var edge = add(lift, "polygon", { points: pts(P, U), "class": "t-ct-edge" });
    c.L.set(shadow, LK.shade(LK.REST));
    return { g: g, lift: lift, shadow: shadow, inner: inner, edge: edge, centre: [(x0 + x1) / 2 * U, (y0 + y1) / 2 * U] };
  }
  function show(e, on) { e.style.display = on ? "" : "none"; }
  function other(k) { return k === "h" ? "v" : "h"; }

  /** one of the two pieces of a cut: the paved piece, its two side lengths, and a tag for its area */
  function makePiece(c, o, cls) {
    var p = paved(c, c.gPieces, o.P, cls);
    var labs = add(p.g, "g", { "class": "t-ct-dims" });
    o.dims.forEach(function (d) { text(labs, d[0], d[1], d[2]); });
    var tag = LK.tag(p.g, String(o.area));
    tag.put(p.centre[0], p.centre[1]); tag.init(c.L);
    c.L.set(labs, { opacity: 0 });
    show(p.g, false);
    return { p: p, labs: labs, tag: tag, o: o };
  }
  /** a dashed gold line to tap: a wide unseen line to catch the finger, a pale halo, then the line itself */
  function makeCut(c, k, label) {
    var ln = CUTS[k].line, a = ln[0], b = ln[1];
    // drawn a little past the outer edge so it reads as "cut here"
    var ax = a[0] - (k === "h" ? 16 : 0), ay = a[1] - (k === "v" ? 16 : 0);
    var d = "M" + ax + " " + ay + "L" + b[0] + " " + b[1];
    var g = add(c.gCuts, "g", { "class": "t-ct-cutg" });
    var hit = add(g, "path", { d: d, "class": "t-ct-hit", "aria-label": label });
    add(g, "path", { d: d, "class": "t-ct-cuthalo" });
    var line = add(g, "path", { d: d, "class": "t-ct-cut" });
    c.L.set(g, { opacity: 0 });
    return { g: g, hit: hit, line: line, len: Math.hypot(b[0] - ax, b[1] - ay) };
  }

  /** the courtyard comes apart along cut k */
  function doCut(c, L, k, then) {
    var cut = c.cuts[k], lineK = c.lines[k], lineO = c.lines[other(k)];
    c.cut = k;
    L.sfx("slice");
    lineK.g.setAttribute("class", "t-ct-cutg is-cut");
    L.set(lineK.line, { opacity: 1 });
    L.to(lineO.g, { opacity: 0, duration: 0.25 }, true);
    L.to(c.gDims, { opacity: 0, duration: 0.3 }, true);
    show(c.whole.g, false); show(cut.a.p.g, true); show(cut.b.p.g, true);
    LK.shake(c, L, 4);
    L.to(lineK.g, { opacity: 0, duration: 0.4, delay: 0.15 }, true);
    L.to(cut.a.p.g, { x: cut.a.o.slide[0], y: cut.a.o.slide[1], duration: 0.5, ease: "back.out(3)" }, true);
    L.to(cut.b.p.g, { x: cut.b.o.slide[0], y: cut.b.o.slide[1], duration: 0.5, ease: "back.out(3)", onComplete: then }, true);
  }

  /** the step that asks for one piece's area: the piece lifts and shows its two side lengths */
  function pieceStep(k, w) {
    return {
      run: function (c, L) {
        var pc = c.cuts[k][w];
        L.board("");
        pc.p.g.classList.add("is-glow");
        L.sfx("pickup"); LK.liftUp(pc.p, L, 0.25);
        L.to(pc.labs, { opacity: 1, duration: 0.35, delay: 0.2 });
      },
      task: function (c, L, done) {
        var pc = c.cuts[k][w];
        L.number(pc.o.prompt, function (v) {
          if (v === pc.o.area) return true;
          L.sfx("oops"); LK.wiggle(pc.p.lift, L, "x", 5);
          L.say(R[pc.o.say].caption);
          return "Not quite. Have another go.";
        }, function (v) {
          L.sfx("chime");
          pc.p.g.classList.remove("is-glow");
          LK.setDown(pc.p, L);
          L.to(pc.labs, { opacity: 0, duration: 0.3 }, true);
          pc.tag.show(L, 0.2);
          L.board(pc.o.work);
          L.wait(900, function () { done(v); });
        });
      },
    };
  }

  /** the two pieces slide back together and the sign counts on from the first piece to the total */
  function joinUp(c, L) {
    var cut = c.cuts[c.cut], rel = L.hold(), ln = CUTS[c.cut].line;
    L.board("");
    L.wait(200, function () { L.sfx("whoosh"); });
    L.to([cut.a.p.g, cut.b.p.g], { x: 0, y: 0, duration: 0.6, delay: 0.2, ease: "power2.inOut" });
    L.wait(850, function () {
      L.sfx("snap"); LK.shake(c, L, 2);
      c.seam.flash(L, ln[0], ln[1]);
      c.sign.set(cut.a.o.area, L); c.sign.pop(L);
    });
    L.wait(1700, function () {
      L.board(CUTS[c.cut].sum);
      c.sign.count(L, cut.a.o.area, 33, 1.3, function () { L.wait(600, rel); });
    });
  }

  /** the other cut, shown quickly: its line draws across the whole courtyard, and its two pieces show their areas */
  function otherWay(c, L) {
    var k2 = other(c.cut), was = c.cuts[c.cut], now = c.cuts[k2], ln = c.lines[k2], rel = L.hold();
    L.board("");
    was.a.tag.hide(L); was.b.tag.hide(L);
    L.wait(350, function () {
      show(was.a.p.g, false); show(was.b.p.g, false); show(c.whole.g, true);
      ln.g.setAttribute("class", "t-ct-cutg is-cut");
      L.set(ln.line, { opacity: 1, strokeDasharray: ln.len + 2, strokeDashoffset: ln.len + 2 });
      L.set(ln.g, { opacity: 1 });
      L.sfx("slice");
      L.to(ln.line, { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut", onComplete: function () {
        show(c.whole.g, false); show(now.a.p.g, true); show(now.b.p.g, true);
        L.to(ln.g, { opacity: 0, duration: 0.5, delay: 0.3 }, true);
        now.a.tag.show(L, 0.1); now.b.tag.show(L, 0.45);
        L.wait(1100, function () { L.board(CUTS[k2].sum); L.sfx("chime"); c.sign.pop(L); });
        L.wait(2000, rel);
      } }, true);
    });
  }

  C.lesson.define({
    id: "courtyard-split", title: "Lakshmi aunty's courtyard", cls: "t-pf t-court", w: W, h: H, durationMs: 200000,
    presenter: { x: 700, y: 360, h: 106 },

    build: function (svg, L) {
      var c = LK.setup(svg, L);
      K.scene(svg, L, { kind: "village", w: W, h: H, sunX: 470, before: c.world });   // her courtyard, in the village

      // the sign (top right) and a note on what one square is worth
      c.sign = LK.sign(c, W, "COURTYARD");
      c.sign.set(null, null, "sq m");
      c.note = text(c.world, "1 square = 1 m²", W - 113, 126, "t-ct-note");

      // Lakshmi aunty waits off to the left (drawn under the courtyard, so pieces pass over her)
      c.aunty = K.person(c.world, L, { x: 74, y: 420, look: "aunty" });

      // the courtyard: whole to begin with; the pieces of each cut are ready but hidden
      c.gC = add(c.world, "g", { transform: "translate(" + OX + " " + OY + ")" });
      c.gPieces = add(c.gC, "g");
      c.whole = paved(c, c.gPieces, LSHAPE, "");
      c.cuts = {};
      ["h", "v"].forEach(function (k) {
        c.cuts[k] = { a: makePiece(c, CUTS[k].a, "is-a"), b: makePiece(c, CUTS[k].b, "is-b") };
      });

      // its six side lengths, going round: 8, 3, 5, 3, 3, 6
      c.gDims = add(c.gC, "g", { "class": "t-ct-dims" });
      text(c.gDims, "8 m", 4 * U, -24);
      text(c.gDims, "3 m", 8 * U + 30, 1.5 * U);
      text(c.gDims, "5 m", 5.5 * U, 3 * U + 32);
      text(c.gDims, "3 m", 3 * U + 36, 4.5 * U + 8);
      text(c.gDims, "3 m", 1.5 * U, 6 * U + 32);
      text(c.gDims, "6 m", -30, 3 * U);
      L.set(c.gDims, { opacity: 0 });

      // the two lines to tap, and the light that runs along a join
      c.gCuts = add(c.gC, "g");
      c.lines = {
        h: makeCut(c, "h", "Cut across. Makes a long rectangle on top and a square below."),
        v: makeCut(c, "v", "Cut down. Makes a tall rectangle on the left and a long one on the right."),
      };
      c.seam = LK.seam(c, c.gC);

      // the plain house shape for the rule (hidden until its beat)
      var u = HU, hid = "ct-house-" + c.key;
      c.gH = add(c.world, "g", { transform: "translate(" + HX + " " + HY + ")", "class": "t-ct-house" });
      show(c.gH, false);
      c.gHin = add(c.gH, "g");
      add(add(c.defs, "clipPath", { id: hid }), "polygon", { points: pts(HOUSE, u) });
      add(c.gHin, "polygon", { points: pts(HOUSE, u), "class": "t-ct-hshape" });
      c.hRect = add(c.gHin, "polygon", { points: pts([[0, 2], [6, 2], [6, 6], [0, 6]], u), "class": "t-ct-hfill is-rect" });
      c.hTri = add(c.gHin, "polygon", { points: pts([[0, 2], [3, 0], [6, 2]], u), "class": "t-ct-hfill is-tri" });
      var gd = "", i;
      for (i = 0; i <= 6; i++) gd += "M" + i * u + " 0V" + 6 * u + "M0 " + i * u + "H" + 6 * u;
      add(add(c.gHin, "g", { "clip-path": "url(#" + hid + ")" }), "path", { d: gd, "class": "t-ct-hgrid" });
      add(c.gHin, "polygon", { points: pts(HOUSE, u), "class": "t-ct-hedge" });
      c.hSplit = add(c.gHin, "path", { d: "M0 " + 2 * u + "H" + 6 * u, "class": "t-ct-split" });
      c.hHeight = add(c.gHin, "g");
      add(c.hHeight, "line", { x1: 3 * u, y1: 0, x2: 3 * u, y2: 2 * u, "class": "t-pf-height" });
      add(c.hHeight, "path", { d: "M" + 3 * u + " " + (2 * u - 12) + "h12v12", "class": "t-pf-mark" });
      text(c.hHeight, "2 m", 3 * u + 38, 1.3 * u);
      text(c.gHin, "6 m", 3 * u, 6 * u + 26);
      text(c.gHin, "4 m", -32, 4 * u);
      c.tagR = LK.tag(c.gHin, "24"); c.tagR.put(3 * u, 4 * u); c.tagR.init(L);
      c.tagT = LK.tag(c.gHin, "6"); c.tagT.put(3 * u, 1.25 * u); c.tagT.init(L);
      L.set([c.hRect, c.hTri, c.hHeight], { opacity: 0 });
      L.set(c.hSplit, { opacity: 0, scaleX: 0, svgOrigin: "0 " + 2 * u });
      return c;
    },

    steps: [
      /* ---- story ---- */
      { beat: "story", caption: "This is Lakshmi aunty. She is tiling her courtyard, and tiles are sold by the square metre.",
        run: function (c, L) { K.enter(c.aunty, L); } },
      { caption: "Her courtyard is an L shape. No single length × width fits it.",
        run: function (c, L) {
          LK.hop(c.whole, L, 0.15);
          L.to(c.gDims, { opacity: 1, duration: 0.45, delay: 0.9 });
          K.puzzled(c.aunty, L, true);
        } },

      /* ---- guess ---- */
      K.guessStep({ caption: "Before we help her, have a guess. How many square metres do you think it is?",
        prompt: "Your guess, in square metres:",
        choices: [{ label: "33", value: 33 }, { label: "40", value: 40 }, { label: "48", value: 48 }, { label: "No idea yet", value: 0 }],
        guessed: R.guessed, none: R.noGuess }),

      /* ---- hands 1: choose a cut ---- */
      { beat: "hands", caption: "Here is the trick. Cut it into shapes you know. Tap one of the gold lines to cut.",
        hint: { caption: "Tap one of the dashed gold lines on the courtyard." },
        run: function (c, L) {
          K.puzzled(c.aunty, L, false);
          L.sfx("pop");
          L.to([c.lines.h.g, c.lines.v.g], { opacity: 1, duration: 0.35, stagger: 0.25 });
        },
        task: function (c, L, done) {
          var over = false, pulse = null;
          if (!L.reduced) pulse = L.to([c.lines.h.line, c.lines.v.line], { opacity: 0.35, duration: 0.6, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.6 }, true);
          function pick(k) {
            if (over) return; over = true;
            L.clearBar();
            if (pulse) { L.kill(pulse); pulse = null; }
            ["h", "v"].forEach(function (x) {
              var ln = c.lines[x];
              ln.g.setAttribute("class", "t-ct-cutg");
              ["tabindex", "role"].forEach(function (a) { ln.hit.removeAttribute(a); });
            });
            doCut(c, L, k, function () { L.say((k === "h" ? R.cutH : R.cutV).caption, function () { done(k); }); });
          }
          ["h", "v"].forEach(function (k) {
            var ln = c.lines[k];
            ln.g.setAttribute("class", "t-ct-cutg is-live");
            ln.hit.setAttribute("tabindex", "0"); ln.hit.setAttribute("role", "button");
            L.listen(ln.hit, "click", function () { pick(k); });
            L.listen(ln.hit, "keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(k); } });
          });
          // always finishable: after a while the two cuts are also offered as buttons
          L.wait(14000, function () {
            if (over) return;
            L.controls([
              h("button", { type: "button", class: "btn btn-ghost", on: { click: function () { pick("h"); } } }, "Cut across"),
              h("button", { type: "button", class: "btn btn-ghost", on: { click: function () { pick("v"); } } }, "Cut down"),
            ]);
          });
        } },

      /* ---- hands 2: the first piece ---- */
      { branch: function (c) { return c.cut === "v" ? 1 : 0; },
        options: [
          Object.assign({ caption: "Start with the top piece. It is 8 metres long and 3 metres wide. What is its area?",
            hint: { caption: "Multiply its two sides: 8 × 3." } }, pieceStep("h", "a")),
          Object.assign({ caption: "Start with the left piece. It is 3 metres wide and 6 metres tall. What is its area?",
            hint: { caption: "Multiply its two sides: 3 × 6." } }, pieceStep("v", "a")),
        ] },

      /* ---- hands 3: the second piece ---- */
      { branch: function (c) { return c.cut === "v" ? 1 : 0; },
        options: [
          Object.assign({ caption: "Now the square below. Each side is 3 metres. What is its area?",
            hint: { caption: "Multiply its two sides: 3 × 3." } }, pieceStep("h", "b")),
          Object.assign({ caption: "Now the right piece. It is 5 metres long and 3 metres wide. What is its area?",
            hint: { caption: "Multiply its two sides: 5 × 3." } }, pieceStep("v", "b")),
        ] },

      /* ---- back together: add ---- */
      { branch: function (c) { return c.cut === "v" ? 1 : 0; },
        options: [
          { caption: "Now put the pieces back and add. 24 + 9 makes 33 square metres.", run: function (c, L) { joinUp(c, L); } },
          { caption: "Now put the pieces back and add. 18 + 15 makes 33 square metres.", run: function (c, L) { joinUp(c, L); } },
        ] },

      /* ---- the other cut gives the same ---- */
      { branch: function (c) { return c.cut === "v" ? 1 : 0; },
        options: [
          { caption: "What about the other cut? 3 × 6 is 18, and 5 × 3 is 15. 18 + 15 is 33 again.", run: function (c, L) { otherWay(c, L); } },
          { caption: "What about the other cut? 8 × 3 is 24, and 3 × 3 is 9. 24 + 9 is 33 again.", run: function (c, L) { otherWay(c, L); } },
        ] },
      { caption: "Any way you split it, the land is the same.",
        run: function (c, L) { c.sign.pop(L); L.board("courtyard = <b>33</b> square metres"); } },

      /* ---- tell her: the answer, then how you knew ---- */
      K.tellStep({ who: function (c) { return c.aunty; }, skill: "a5", qid: "court-tell",
        caption: "Lakshmi aunty is waiting. Tell her how many square metres of tiles to buy.",
        prompt: "Tell Lakshmi aunty. Square metres:", answer: 33,
        wrong: [{ value: 48, caption: R.t48.caption }, { value: 28, caption: R.t28.caption, mixup: "perim" }],
        other: R.tOther, thanks: ["33 sq metres!", "Thank you!"],
        same: R.tellRightGuess, close: R.tellRightOther, plain: R.tellRight }),
      K.howStep({ who: function (c) { return c.aunty; }, skill: "a5", qid: "court-how", leave: true,
        caption: "She has one more question. How did you work it out for such an odd shape?",
        prompt: "Tell her how:", bubble: ["How did", "you know?"],
        choices: [
          { label: "I multiplied the two longest sides", value: "block",
            caption: "8 × 6 would be the whole block, with the missing corner too. We split it into two rectangles and added them. Off she goes to buy her tiles." },
          { label: "I split it into two rectangles and added them", value: "split", correct: true,
            caption: "Exactly. Two shapes you know, then add. Off she goes to buy her tiles." },
          { label: "I added up all the sides", value: "perim", mixup: "perim",
            caption: "Adding the sides gives the distance round the edge, not the inside. We split it into two rectangles and added them. Off she goes to buy her tiles." },
        ] }),

      /* ---- the rule, on a plain shape ---- */
      { beat: "rule", caption: "Now leave the courtyard. Here is a plain shape, like the front of a house.",
        run: function (c, L) {
          L.board("");
          L.to([c.gC, c.note], { opacity: 0, duration: 0.4, onComplete: function () { show(c.gC, false); } });
          c.sign.title("AREA"); c.sign.set(null, L); c.sign.pop(L);
          show(c.gH, true);
          L.set(c.gHin, { opacity: 0, scale: 0.9, svgOrigin: 3 * HU + " " + 3 * HU });
          L.wait(450, function () { L.sfx("pop"); });
          L.to(c.gHin, { opacity: 1, scale: 1, duration: 0.5, delay: 0.45, ease: "back.out(2)" });
        } },
      { caption: "No single formula fits this one either. So split it: a rectangle below, and a triangle on top.",
        run: function (c, L) {
          L.set(c.hSplit, { opacity: 1 });
          L.wait(300, function () { L.sfx("slice"); });
          L.to(c.hSplit, { scaleX: 1, duration: 0.6, delay: 0.3, ease: "power2.inOut" });
          L.to(c.hRect, { opacity: 1, duration: 0.4, delay: 1.0 });
          L.to(c.hTri, { opacity: 1, duration: 0.4, delay: 1.5 });
          L.to(c.hHeight, { opacity: 1, duration: 0.4, delay: 2.0 });
          L.wait(2500, function () { L.board('<span class="t-rule">split it, find each piece, add</span>'); });
        } },
      { caption: "Your turn. Find each piece, then add. What is the area of the whole shape?",
        hint: { caption: "The rectangle is 6 by 4. The triangle has base 6 and height 2." },
        task: function (c, L, done) {
          L.number("Area of the whole shape, in square metres:", function (v) {
            if (v === 30) return true;
            var r = v === 36 ? R.r36 : v === 24 ? R.r24 : R.rOther;
            L.sfx("oops"); L.say(r.caption);
            return "Not quite. Have another go.";
          }, function () {
            L.to(c.hHeight, { opacity: 0, duration: 0.3 }, true);
            c.tagR.show(L, 0.1); c.tagT.show(L, 0.5);
            L.board("24 + 6 = <b>30</b>");
            c.sign.set(24, L, "sq m");
            L.wait(900, function () {
              c.sign.count(L, 24, 30, 1.0, function () { L.say(R.rRight.caption, function () { done(30); }); });
            });
          });
        } },
      { caption: "That is the rule for any awkward shape. Split it into shapes you know, find each one, and add.", hold: 600,
        run: function (c, L) {
          L.board('<span class="t-rule">split it, find each piece, add</span><span class="t-rule-note">24 + 6 = 30 square metres</span>');
        } },
    ],
  });
})();
